// Resolve the API base URL:
//  - undefined (no .env in local dev) -> default to the dev server on :4000
//  - "" (set empty in the Docker build) -> use relative /api, proxied by nginx
//  - any value -> use it as-is
const API_BASE =
  import.meta.env.VITE_API_BASE === undefined
    ? "http://localhost:4000"
    : import.meta.env.VITE_API_BASE;

/**
 * Posts a FormData payload to the given PDF endpoint and returns the resulting
 * blob plus any size headers. Throws with the server's error message on failure.
 */
export async function postPdf(endpoint, formData) {
  const res = await fetch(`${API_BASE}/api/pdf/${endpoint}`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data.error) message = data.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const filename =
    parseFilename(res.headers.get("Content-Disposition")) || `${endpoint}.pdf`;
  return {
    blob,
    filename,
    originalSize: num(res.headers.get("X-Original-Size")),
    compressedSize: num(res.headers.get("X-Compressed-Size")),
  };
}

function num(v) {
  const n = parseInt(v || "", 10);
  return Number.isFinite(n) ? n : null;
}

function parseFilename(disposition) {
  if (!disposition) return null;
  const m = disposition.match(/filename="?([^"]+)"?/);
  return m ? m[1] : null;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
