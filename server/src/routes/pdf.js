import express from "express";
import multer from "multer";
import archiver from "archiver";
import { PDFDocument } from "pdf-lib";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { config } from "../config.js";
import { assertPdf, detectImageKind } from "../fileType.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFileBytes, files: config.maxFiles },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
      return cb(null, true);
    }
    const e = new Error("Only PDF files are allowed");
    e.status = 400;
    cb(e);
  },
});

// Separate uploader that accepts JPG/PNG for the image → PDF feature.
const imageExt = /\.(jpe?g|png)$/i;
const uploadImages = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFileBytes, files: config.maxFiles },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png)$/.test(file.mimetype) || imageExt.test(file.originalname)) {
      return cb(null, true);
    }
    const e = new Error("Only JPG and PNG images are allowed");
    e.status = 400;
    cb(e);
  },
});

/** Loads a PDF buffer into pdf-lib, surfacing a clean error on corrupt input. */
async function loadPdf(buffer, label) {
  // Content-based check first: reject anything that isn't really a PDF before
  // handing it to the parser.
  assertPdf(buffer, label);
  try {
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: false });
    // pdf-lib defers structural parsing: a file with a valid %PDF header but a
    // broken/incomplete body loads fine, then throws later on getPageCount().
    // Force that access here so malformed PDFs fail as a clean 400, not a 500.
    doc.getPageCount();
    return doc;
  } catch (err) {
    if (err?.status) throw err; // already a tagged client error
    const e = new Error(`Could not read "${label}". It may be corrupt, incomplete, or password-protected.`);
    e.status = 400;
    throw e;
  }
}

/**
 * Builds a safe Content-Disposition header value (RFC 6266). The user-supplied
 * filename is never placed raw in the header: control chars, quotes and
 * backslashes are stripped for the ASCII fallback, and the original is sent
 * percent-encoded via filename*. This prevents HTTP header injection.
 */
function contentDisposition(filename) {
  // Strip path separators and keep only the base name.
  const base = String(filename).replace(/[/\\]/g, "_");
  // ASCII fallback: drop control chars, quotes, backslashes.
  const ascii = base.replace(/[\x00-\x1f\x7f"\\]/g, "_").slice(0, 200) || "download";
  const encoded = encodeURIComponent(base);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function sendPdf(res, bytes, filename) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", contentDisposition(filename));
  res.send(Buffer.from(bytes));
}

/** Parse a page-range string like "1-3,5,8-10" into a sorted, de-duped 0-based index list. */
function parsePageRanges(input, pageCount) {
  if (!input || !input.trim()) {
    // default: every page as its own entry
    return Array.from({ length: pageCount }, (_, i) => i);
  }
  const pages = new Set();
  for (const part of input.split(",")) {
    const token = part.trim();
    if (!token) continue;
    const m = token.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) {
      const e = new Error(`Invalid range token: "${token}"`);
      e.status = 400;
      throw e;
    }
    const start = parseInt(m[1], 10);
    const end = m[2] ? parseInt(m[2], 10) : start;
    if (start < 1 || end < 1 || start > pageCount || end > pageCount || start > end) {
      const e = new Error(`Range "${token}" is out of bounds (document has ${pageCount} pages).`);
      e.status = 400;
      throw e;
    }
    for (let p = start; p <= end; p++) pages.add(p - 1);
  }
  return [...pages].sort((a, b) => a - b);
}

// ── POST /api/pdf/merge ────────────────────────────────
// Merges multiple PDFs in the order received.
router.post("/merge", upload.array("files"), async (req, res, next) => {
  try {
    const files = req.files || [];
    if (files.length < 2) {
      return res.status(400).json({ error: "Upload at least 2 PDF files to merge." });
    }
    const merged = await PDFDocument.create();
    for (const file of files) {
      const src = await loadPdf(file.buffer, file.originalname);
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
    }
    const bytes = await merged.save();
    sendPdf(res, bytes, "merged.pdf");
  } catch (err) {
    next(err);
  }
});

// ── POST /api/pdf/split ────────────────────────────────
// Extracts the given pages/ranges into a single new PDF.
// Body field "ranges" e.g. "1-3,5". If omitted, returns all pages (no-op copy).
router.post("/split", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Upload a PDF file." });
    const src = await loadPdf(req.file.buffer, req.file.originalname);
    const pageCount = src.getPageCount();
    const indices = parsePageRanges(req.body.ranges, pageCount);

    const out = await PDFDocument.create();
    const copied = await out.copyPages(src, indices);
    copied.forEach((p) => out.addPage(p));
    const bytes = await out.save();

    const base = req.file.originalname.replace(/\.pdf$/i, "");
    sendPdf(res, bytes, `${base}-split.pdf`);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/pdf/compress ─────────────────────────────
// Uses Ghostscript. Body field "level": screen | ebook | printer (default ebook).
const GS_LEVELS = {
  screen: "/screen", // lowest quality, smallest size (72 dpi)
  ebook: "/ebook", // good balance (150 dpi)
  printer: "/printer", // higher quality (300 dpi)
};

// Candidate Ghostscript executables, tried in order. An explicit
// GHOSTSCRIPT_BIN (full path or command name) always takes precedence.
function ghostscriptCandidates() {
  if (config.ghostscriptBin) return [config.ghostscriptBin];
  // "gs" for Linux/macOS/Docker; the win64/win32 console builds for Windows.
  return ["gs", "gswin64c", "gswin32c"];
}

function trySpawnGhostscript(bin, args) {
  return new Promise((resolve) => {
    const gs = spawn(bin, args);
    let stderr = "";
    gs.stderr.on("data", (d) => (stderr += d.toString()));
    // ENOENT => this candidate isn't installed; signal "not found" so the
    // caller can try the next one.
    gs.on("error", (err) => resolve({ ok: false, notFound: err.code === "ENOENT", stderr: err.message }));
    gs.on("close", (code) => resolve({ ok: code === 0, notFound: false, stderr: stderr || `exit ${code}` }));
  });
}

/** Runs Ghostscript with the given args, trying each candidate binary. */
async function runGhostscript(args) {
  for (const bin of ghostscriptCandidates()) {
    const result = await trySpawnGhostscript(bin, args);
    if (result.ok) return;
    if (!result.notFound) {
      // Found the binary but it failed on this input — don't try others.
      throw new Error(`Ghostscript failed: ${result.stderr}`);
    }
  }
  const e = new Error(
    "Ghostscript is not installed on the server. Install it (Docker image already includes it) or set GHOSTSCRIPT_BIN."
  );
  e.status = 503;
  throw e;
}

function compressArgs(inputPath, outputPath, level) {
  return [
    "-sDEVICE=pdfwrite",
    "-dCompatibilityLevel=1.4",
    `-dPDFSETTINGS=${GS_LEVELS[level] || GS_LEVELS.ebook}`,
    "-dNOPAUSE",
    "-dQUIET",
    "-dBATCH",
    "-dSAFER",
    `-sOutputFile=${outputPath}`,
    inputPath,
  ];
}

router.post("/compress", upload.single("file"), async (req, res, next) => {
  let dir;
  try {
    if (!req.file) return res.status(400).json({ error: "Upload a PDF file." });
    assertPdf(req.file.buffer, req.file.originalname);
    const level = (req.body.level || "ebook").toLowerCase();
    if (!GS_LEVELS[level]) {
      return res.status(400).json({ error: "level must be one of: screen, ebook, printer" });
    }

    dir = await mkdtemp(path.join(tmpdir(), "pdfc-"));
    const inputPath = path.join(dir, `${randomUUID()}.pdf`);
    const outputPath = path.join(dir, `${randomUUID()}.pdf`);
    await writeFile(inputPath, req.file.buffer);

    await runGhostscript(compressArgs(inputPath, outputPath, level));
    const compressed = await readFile(outputPath);

    // For small or already-optimized PDFs, Ghostscript can produce a larger
    // file. In that case keep the original so the user never gets a bigger file.
    const original = req.file.buffer;
    const useOriginal = compressed.length >= original.length;
    const bytes = useOriginal ? original : compressed;

    const base = req.file.originalname.replace(/\.pdf$/i, "");
    res.setHeader("X-Original-Size", String(original.length));
    res.setHeader("X-Compressed-Size", String(bytes.length));
    sendPdf(res, bytes, `${base}-compressed.pdf`);
  } catch (err) {
    next(err);
  } finally {
    if (dir) rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

// ── POST /api/pdf/to-images ────────────────────────────
// Renders each PDF page to a JPG via Ghostscript. Returns a single JPG when the
// document has one page, otherwise a ZIP archive of all pages.
// Body field "dpi": 72–300 (default 150).
function toImagesArgs(inputPath, outputPattern, dpi) {
  return [
    "-sDEVICE=jpeg",
    `-r${dpi}`,
    "-dJPEGQ=90",
    "-dNOPAUSE",
    "-dQUIET",
    "-dBATCH",
    "-dSAFER",
    "-dTextAlphaBits=4",
    "-dGraphicsAlphaBits=4",
    `-sOutputFile=${outputPattern}`,
    inputPath,
  ];
}

router.post("/to-images", upload.single("file"), async (req, res, next) => {
  let dir;
  try {
    if (!req.file) return res.status(400).json({ error: "Upload a PDF file." });

    let dpi = parseInt(req.body.dpi || "150", 10);
    if (!Number.isFinite(dpi)) dpi = 150;
    dpi = Math.min(300, Math.max(72, dpi));

    // Validate the PDF and learn its page count up front.
    const src = await loadPdf(req.file.buffer, req.file.originalname);
    const pageCount = src.getPageCount();

    dir = await mkdtemp(path.join(tmpdir(), "pdfc-"));
    const inputPath = path.join(dir, "in.pdf");
    // %03d is expanded by Ghostscript into the 1-based page number.
    const outputPattern = path.join(dir, "page-%03d.jpg");
    await writeFile(inputPath, req.file.buffer);

    await runGhostscript(toImagesArgs(inputPath, outputPattern, dpi));

    const produced = (await readdir(dir))
      .filter((n) => n.startsWith("page-") && n.endsWith(".jpg"))
      .sort();
    if (produced.length === 0) {
      throw new Error("No pages were produced from the PDF.");
    }

    const base = req.file.originalname.replace(/\.pdf$/i, "");

    // Single page → return the JPG directly.
    if (produced.length === 1) {
      const img = await readFile(path.join(dir, produced[0]));
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Content-Disposition", contentDisposition(`${base}.jpg`));
      return res.send(img);
    }

    // Multiple pages → stream a ZIP archive.
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", contentDisposition(`${base}-images.zip`));

    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.on("error", (err) => next(err));
    archive.pipe(res);
    for (let i = 0; i < produced.length; i++) {
      const buf = await readFile(path.join(dir, produced[i]));
      archive.append(buf, { name: `${base}-page-${String(i + 1).padStart(3, "0")}.jpg` });
    }
    // Remove the temp dir only after the archive has fully flushed.
    archive.on("end", () => {
      if (dir) rm(dir, { recursive: true, force: true }).catch(() => {});
      dir = null;
    });
    await archive.finalize();
  } catch (err) {
    next(err);
  } finally {
    if (dir) rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

// ── POST /api/pdf/from-images ──────────────────────────
// Combines uploaded JPG/PNG images into a single PDF, one image per page.
// Each page is sized to the image's native dimensions.
router.post("/from-images", uploadImages.array("files"), async (req, res, next) => {
  try {
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: "Upload at least one JPG or PNG image." });
    }

    const pdf = await PDFDocument.create();
    for (const file of files) {
      // Decide the embed path from the actual bytes, not the extension/mimetype.
      const kind = detectImageKind(file.buffer);
      if (!kind) {
        const e = new Error(`"${file.originalname}" is not a valid JPG or PNG image (signature check failed).`);
        e.status = 400;
        throw e;
      }
      let image;
      try {
        image = kind === "png"
          ? await pdf.embedPng(file.buffer)
          : await pdf.embedJpg(file.buffer);
      } catch {
        const e = new Error(`Could not read image "${file.originalname}".`);
        e.status = 400;
        throw e;
      }
      const page = pdf.addPage([image.width, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    }

    const bytes = await pdf.save();
    sendPdf(res, bytes, "images.pdf");
  } catch (err) {
    next(err);
  }
});

// ── POST /api/pdf/protect ──────────────────────────────
// Encrypts a PDF with a user password (required to OPEN the document) using
// Ghostscript with AES-128 (R=4). Body field "password".
//
// Security notes:
//  - The password is read from the form body (never the URL/query), so it is
//    not captured by the morgan request logger.
//  - It is passed to Ghostscript via process arguments. In this isolated
//    single-tenant container that is acceptable; on a shared host, process
//    args can be visible via `ps`.
//  - The input/output PDFs live in a temp dir that is always removed.
function protectArgs(inputPath, outputPath, password) {
  return [
    "-sDEVICE=pdfwrite",
    "-dCompatibilityLevel=1.4",
    // Ghostscript's pdfwrite supports encryption revisions 2 and 3 only.
    // Use R=3 with a 128-bit key (the strongest pdfwrite offers). Owner
    // password equals the user password so the document opens only with it.
    "-dEncryptionR=3",
    "-dKeyLength=128",
    "-dPermissions=-1",
    `-sUserPassword=${password}`,
    `-sOwnerPassword=${password}`,
    "-dNOPAUSE",
    "-dQUIET",
    "-dBATCH",
    "-dSAFER",
    `-sOutputFile=${outputPath}`,
    inputPath,
  ];
}

router.post("/protect", upload.single("file"), async (req, res, next) => {
  let dir;
  try {
    if (!req.file) return res.status(400).json({ error: "Upload a PDF file." });
    assertPdf(req.file.buffer, req.file.originalname);

    const password = req.body.password;
    if (typeof password !== "string" || password.length === 0) {
      return res.status(400).json({ error: "A password is required." });
    }
    if (password.length > 128) {
      return res.status(400).json({ error: "Password is too long (max 128 characters)." });
    }

    dir = await mkdtemp(path.join(tmpdir(), "pdfc-"));
    const inputPath = path.join(dir, `${randomUUID()}.pdf`);
    const outputPath = path.join(dir, `${randomUUID()}.pdf`);
    await writeFile(inputPath, req.file.buffer);

    await runGhostscript(protectArgs(inputPath, outputPath, password));
    const bytes = await readFile(outputPath);

    const base = req.file.originalname.replace(/\.pdf$/i, "");
    sendPdf(res, bytes, `${base}-protected.pdf`);
  } catch (err) {
    next(err);
  } finally {
    if (dir) rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

export default router;
