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
