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
  pdf: [[0x25, 0x50, 0x44, 0x46]], // "%PDF"
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
 * Some PDFs have leading whitespace or a UTF-8 BOM before "%PDF". Allow a small
 * offset scan so valid-but-slightly-off files aren't rejected, while still
 * refusing anything that doesn't contain the signature near the start.
 */
function hasPdfSignature(buffer) {
  const scanLimit = Math.min(buffer.length - 4, 1024);
  for (let i = 0; i <= scanLimit; i++) {
    if (startsWith(buffer.subarray(i), SIGNATURES.pdf[0])) return true;
  }
  return false;
}

export function isPdfBuffer(buffer) {
  return hasPdfSignature(buffer);
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
