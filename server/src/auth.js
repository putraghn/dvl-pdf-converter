import { config } from "./config.js";

/**
 * Identity comes from nginx, which authenticated the request with
 * oauth2-proxy (Microsoft Entra) before forwarding it and which OVERWRITES
 * these headers on every request, so a client cannot supply its own.
 * The API trusts them only because it is reachable solely through that nginx.
 */

const MAX_LEN = 254;
const clean = (v) => (typeof v === "string" ? v.trim() : "");
const plausible = (v) => v.length > 0 && v.length <= MAX_LEN && !/[\x00-\x1f\x7f]/.test(v);

export function authenticate(req, res, next) {
  if (config.authMode !== "proxy") {
    // No login configured: never read identity headers (they would be forgeable).
    req.user = { id: "anonymous", email: "anonymous" };
    return next();
  }

  const email = clean(req.headers["x-authenticated-email"]);
  const id = clean(req.headers["x-authenticated-user"]);
  if (!plausible(email)) {
    return res.status(401).json({ error: "Authentication required. Please reload the page to sign in." });
  }
  req.user = { id: plausible(id) ? id : email, email };
  next();
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Days left until the Entra client secret expires (negative once it has);
 * null when no expiry date is configured. The secret is treated as expiring at
 * 00:00 UTC on the configured date, which errs on the early side.
 */
export function secretExpiryInfo(date = config.entraSecretExpires, now = Date.now()) {
  if (!date) return null;
  const expiresAt = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(expiresAt)) return null;
  return { date, daysLeft: Math.ceil((expiresAt - now) / DAY_MS) };
}

export function isReportViewer(user) {
  return (
    config.authMode === "proxy" &&
    !!user &&
    config.reportAdmins.includes(String(user.email).toLowerCase())
  );
}

export function requireReportViewer(req, res, next) {
  if (!isReportViewer(req.user)) {
    return res.status(403).json({ error: "You are not allowed to view the activity report." });
  }
  next();
}
