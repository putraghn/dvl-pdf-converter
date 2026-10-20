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

  // Express "trust proxy" setting — controls how the client IP is derived from
  // X-Forwarded-For, which rate limiting relies on. Leave unset (default) when
  // the app is directly exposed. Behind N trusted reverse proxies, set
  // TRUST_PROXY to that number (e.g. "1" for a single nginx/LB in front).
  // Accepts: unset/"false"/"0" => don't trust; a number => trust that many
  // hops; "true" => trust all (NOT recommended, spoofable). Other strings are
  // passed through to Express (e.g. a subnet like "10.0.0.0/8").
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
};

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
