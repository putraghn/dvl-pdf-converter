import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { config } from "./config.js";
import { authenticate } from "./auth.js";
import { auditRequests, initAudit } from "./audit.js";
import pdfRouter from "./routes/pdf.js";
import reportRouter from "./routes/report.js";

const app = express();

// How to derive the client IP from X-Forwarded-For. Default (false) is safe
// when directly exposed; behind a reverse proxy set TRUST_PROXY to the number
// of trusted hops so rate limiting keys on the real client IP, not the proxy.
app.set("trust proxy", config.trustProxy);

app.use(helmet());
app.use(morgan("tiny"));
app.use(
  cors({
    origin: config.corsOrigins,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
    exposedHeaders: ["X-Original-Size", "X-Compressed-Size", "Content-Disposition"],
  })
);

function makeLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 60, // 60 requests per minute per client IP
    standardHeaders: true,
    legacyHeaders: false,
    // Key on the IP Express resolved (honors "trust proxy"). Falling back to the
    // socket address keeps limiting functional even if req.ip is unavailable.
    keyGenerator: (req) => req.ip || req.socket?.remoteAddress || "unknown",
    // Don't rate-limit the health check (used by Docker/LB probes).
    skip: (req) => req.path === "/health",
  });
}
const limiter = makeLimiter();
const reportLimiter = makeLimiter();

// Health check for Docker / load balancers.
app.get("/health", (req, res) => res.json({ status: "ok" }));

// PDF endpoints. Order matters: rate limit, then identity (401 when SSO is on
// and the request carries none), then the activity log, then the real work.
app.use("/api/pdf", limiter, authenticate, auditRequests, pdfRouter);

// Who-am-I (any signed-in user) and the activity report (report viewers only).
app.use("/api/report", reportLimiter, authenticate, reportRouter);

// Centralized error handler.
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: `File too large. Max ${config.maxFileBytes / 1024 / 1024} MB per file.` });
    }
    if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(413).json({ error: `Too many files. Max ${config.maxFiles}.` });
    }
    return res.status(400).json({ error: err.message });
  }
  // Malformed multipart bodies (bad part headers, truncated form, missing
  // boundary) are client errors raised by busboy as plain Errors; report 400.
  const isMultipartError =
    /^(Malformed part header|Unexpected end of form|Unexpected end of multipart data|Multipart: Boundary not found|Bad content-type header)/i.test(
      err.message || ""
    );
  const status = err.status || (isMultipartError ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || "Internal server error" });
});

const auditOn = initAudit();
if (config.authMode === "proxy" && config.reportAdmins.length === 0) {
  console.warn("WARNING: AUTH_MODE=proxy but REPORT_ADMINS is empty - nobody can open the activity report.");
}

app.listen(config.port, () => {
  console.log(
    `PDF tools API listening on :${config.port} ` +
      `(trust proxy: ${JSON.stringify(config.trustProxy)}, auth: ${config.authMode}, ` +
      `activity log: ${auditOn ? `on, keep ${config.auditRetentionDays} days` : "off"})`
  );
});
