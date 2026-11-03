/**
 * Content-based file type validation (magic bytes / signatures).
 *
 * This is defense-in-depth on top of the multer mimetype/extension filter:
 * a client can lie about the Content-Type header and the file extension, but
 * not about the actual leading bytes the downstream parser will read.
 */

// Signatures as byte arrays. A file matches if its leading bytes equal one of
// the listed prefixes.
const SIGNATURES = {
  pdf: [[0x25, 0x50, 0x44, 0x46, 0x2d]], // "%PDF-"
  jpg: [[0xff, 0xd8, 0xff]], // JPEG SOI + marker
  png: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]], // PNG magic
};

function startsWith(buffer, prefix) {
  if (!buffer || buffer.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (buffer[i] !== prefix[i]) return false;
  }
  return true;
}

/**
 * "%PDF-" must be at byte 0 — no scanning ahead.
 *
 * This is a security control, not just validation. Ghostscript decides how to
 * interpret an input file from its content, and a PostScript program that
 * merely mentions "%PDF-" in a comment within its first KB would pass a
 * lenient scan yet still be run as PostScript (verified against Ghostscript
 * 10.08). PostScript is the attack surface of the -dSAFER bypass CVEs, so we
 * only hand Ghostscript files that begin with the PDF header.
 *
 * Trade-off: a legacy PDF with junk bytes before the header is rejected.
 */
export function isPdfBuffer(buffer) {
  return startsWith(buffer, SIGNATURES.pdf[0]);
}

export function isJpgBuffer(buffer) {
  return SIGNATURES.jpg.some((sig) => startsWith(buffer, sig));
}

export function isPngBuffer(buffer) {
  return SIGNATURES.png.some((sig) => startsWith(buffer, sig));
}

export function isImageBuffer(buffer) {
  return isJpgBuffer(buffer) || isPngBuffer(buffer);
}

/** Returns "png" | "jpg" | null based on the actual content. */
export function detectImageKind(buffer) {
  if (isPngBuffer(buffer)) return "png";
  if (isJpgBuffer(buffer)) return "jpg";
  return null;
}

/** Throws a 400 error if the buffer isn't a real PDF. */
export function assertPdf(buffer, label) {
  if (!isPdfBuffer(buffer)) {
    const e = new Error(`"${label}" is not a valid PDF file (signature check failed).`);
    e.status = 400;
    throw e;
  }
}
