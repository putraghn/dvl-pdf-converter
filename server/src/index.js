import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { config } from "./config.js";
import pdfRouter from "./routes/pdf.js";

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

const limiter = rateLimit({
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

// Health check for Docker / load balancers.
app.get("/health", (req, res) => res.json({ status: "ok" }));

// PDF endpoints — open for internal network use, no authentication.
app.use("/api/pdf", limiter, pdfRouter);

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
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || "Internal server error" });
});

app.listen(config.port, () => {
  console.log(
    `PDF tools API listening on :${config.port} (trust proxy: ${JSON.stringify(config.trustProxy)})`
  );
});
