export const config = {
  port: parseInt(process.env.PORT || "4000", 10),
  corsOrigins: (process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  maxFileBytes: parseInt(process.env.MAX_FILE_MB || "50", 10) * 1024 * 1024,
  maxFiles: parseInt(process.env.MAX_FILES || "20", 10),

  // Ghostscript executable. In Docker/Linux this is "gs"; on Windows it is
  // typically "gswin64c". Set GHOSTSCRIPT_BIN to an explicit path to override.
  ghostscriptBin: process.env.GHOSTSCRIPT_BIN || "",

  // Ghostscript runs are bounded so one hostile or pathological file cannot
  // hold a CPU forever or pile up unlimited processes (DoS).
  //  - GS_TIMEOUT_SEC: a run is killed after this many seconds (default 60).
  //  - GS_MAX_CONCURRENT: simultaneous gs processes (default 2).
  //  - GS_MAX_QUEUE: requests allowed to wait for a free slot (default 5);
  //    beyond that the server answers 503 right away. Queued requests hold
  //    their upload in memory, so keep this small relative to container RAM.
  gsTimeoutMs: Math.round(positiveNumber(process.env.GS_TIMEOUT_SEC, 60) * 1000),
  gsMaxConcurrent: Math.floor(positiveNumber(process.env.GS_MAX_CONCURRENT, 2)),
  gsMaxQueue: Math.floor(positiveNumber(process.env.GS_MAX_QUEUE, 5)),

  // Express "trust proxy" setting — controls how the client IP is derived from
  // X-Forwarded-For, which rate limiting relies on. Leave unset (default) when
  // the app is directly exposed. Behind N trusted reverse proxies, set
  // TRUST_PROXY to that number (e.g. "1" for a single nginx/LB in front).
  // Accepts: unset/"false"/"0" => don't trust; a number => trust that many
  // hops; "true" => trust all (NOT recommended, spoofable). Other strings are
  // passed through to Express (e.g. a subnet like "10.0.0.0/8").
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
};

/** Parses a positive number from an env string; falls back to `fallback` if unset/invalid. */
function positiveNumber(raw, fallback) {
  const n = Number(raw);
  return raw !== undefined && raw !== "" && Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseTrustProxy(raw) {
  if (raw === undefined || raw === "") return false;
  const v = raw.trim().toLowerCase();
  if (v === "false" || v === "0") return false;
  if (v === "true") return true;
  // Numeric hop count (recommended for a fixed proxy chain).
  if (/^\d+$/.test(v)) return parseInt(v, 10);
  // Anything else (IP/subnet list) is handed to Express as-is.
  return raw.trim();
}
