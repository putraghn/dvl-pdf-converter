// Resolve the API base URL:
//  - undefined (no .env in local dev) -> default to the dev server on :4000
//  - "" (set empty in the Docker build) -> use relative /api, proxied by nginx
//  - any value -> use it as-is
const API_BASE =
  import.meta.env.VITE_API_BASE === undefined
    ? "http://localhost:4000"
    : import.meta.env.VITE_API_BASE;

// Shown (in both languages) when the SSO session has expired. The nginx layer
// answers API calls with 401 instead of redirecting, so the page can explain
// what happened rather than failing with an opaque network error.
const SESSION_EXPIRED_MESSAGE =
  "Sesi berakhir. Muat ulang halaman untuk login lagi. / Session expired. Reload the page to sign in again.";

async function throwApiError(res) {
  if (res.status === 401) throw new Error(SESSION_EXPIRED_MESSAGE);
  let message = `Request failed (${res.status})`;
  try {
    const data = await res.json();
    if (data.error) message = data.error;
  } catch {
    /* non-JSON error body */
  }
  throw new Error(message);
}

/** GET a JSON document from the API. */
export async function getJson(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) await throwApiError(res);
  return res.json();
}

/** GET a file (e.g. the CSV export) from the API as a Blob. */
export async function getBlob(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) await throwApiError(res);
  return res.blob();
}

/**
 * Posts a FormData payload to the given PDF endpoint and returns the resulting
 * blob plus any size headers. Throws with the server's error message on failure.
 */
export async function postPdf(endpoint, formData) {
  const res = await fetch(`${API_BASE}/api/pdf/${endpoint}`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) await throwApiError(res);

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
