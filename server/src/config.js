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

  // ── Authentication (Microsoft Entra SSO via oauth2-proxy + nginx) ───────
  // "off"   (default): no login. Identity headers are IGNORED, so nobody can
  //          forge them; every request is recorded as "anonymous".
  // "proxy": nginx authenticates each request through oauth2-proxy and adds
  //          X-Authenticated-User / X-Authenticated-Email. The API refuses
  //          requests without them. Only use this when the API is reachable
  //          exclusively through that nginx (docker-compose.sso.yml keeps it
  //          on an internal-only Docker network).
  authMode: process.env.AUTH_MODE === "proxy" ? "proxy" : "off",

  // ── Activity log (who did what), used for reports ───────────────────────
  // SQLite file; empty path = disabled. Only metadata is stored (user, action,
  // result, sizes, duration, IP) - never file contents, file names or
  // passwords. Rows older than the retention period are deleted.
  auditDbPath: process.env.AUDIT_DB_PATH || "",
  auditRetentionDays: Math.floor(positiveNumber(process.env.AUDIT_RETENTION_DAYS, 45)),

  // Emails (comma-separated, case-insensitive) allowed to open the report.
  reportAdmins: (process.env.REPORT_ADMINS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),

  // Where the "sign out" link in the UI points (served by oauth2-proxy).
  logoutUrl: process.env.SSO_LOGOUT_URL || "/oauth2/sign_out",
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
