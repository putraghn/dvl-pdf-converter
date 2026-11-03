import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

/**
 * Activity log: one row per processing request ("who did what").
 *
 * Privacy: only metadata is stored - never file contents, file names or
 * passwords. Failing to write a row never fails the user's request.
 */

export const ACTIONS = ["merge", "split", "compress", "to_images", "from_images", "protect"];

const ROUTE_ACTIONS = {
  "/merge": "merge",
  "/split": "split",
  "/compress": "compress",
  "/to-images": "to_images",
  "/from-images": "from_images",
  "/protect": "protect",
};

let db = null;
let insertStmt = null;

export function auditEnabled() {
  return db !== null;
}

export function initAudit(dbPath = config.auditDbPath) {
  if (!dbPath) return false;
  if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 3000;
    CREATE TABLE IF NOT EXISTS audit_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      ts            TEXT    NOT NULL,           -- UTC, ISO 8601
      user_id       TEXT    NOT NULL,
      user_email    TEXT    NOT NULL,
      action        TEXT    NOT NULL,
      success       INTEGER NOT NULL,           -- 1 / 0
      http_status   INTEGER NOT NULL,
      input_files   INTEGER NOT NULL DEFAULT 0,
      input_bytes   INTEGER NOT NULL DEFAULT 0,
      output_bytes  INTEGER,
      duration_ms   INTEGER NOT NULL,
      ip            TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_audit_ts   ON audit_log (ts);
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log (user_email, ts);
  `);
  insertStmt = db.prepare(
    `INSERT INTO audit_log
       (ts, user_id, user_email, action, success, http_status,
        input_files, input_bytes, output_bytes, duration_ms, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  purgeExpired();
  const timer = setInterval(() => purgeExpired(), 6 * 60 * 60 * 1000);
  timer.unref(); // never keep the process alive just for housekeeping
  return true;
}

/** Deletes rows older than the retention period. Returns how many were removed. */
export function purgeExpired(now = Date.now(), days = config.auditRetentionDays) {
  if (!db) return 0;
  const cutoff = new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
  try {
    return Number(db.prepare("DELETE FROM audit_log WHERE ts < ?").run(cutoff).changes);
  } catch (err) {
    console.error("audit purge failed:", err.message);
    return 0;
  }
}

export function recordAudit(e) {
  if (!db) return;
  try {
    insertStmt.run(
      e.ts,
      e.userId,
      e.userEmail,
      e.action,
      e.success ? 1 : 0,
      e.httpStatus,
      e.inputFiles,
      e.inputBytes,
      e.outputBytes ?? null,
      e.durationMs,
      e.ip ?? null
    );
  } catch (err) {
    // Fail open: reporting is a convenience, it must not break PDF processing.
    console.error("audit write failed:", err.message);
  }
}

/** Express middleware: records one row when a processing request finishes. */
export function auditRequests(req, res, next) {
  const action = req.method === "POST" ? ROUTE_ACTIONS[req.path] : undefined;
  if (!action || !db) return next();

  const started = Date.now();
  res.once("close", () => {
    const completed = res.writableFinished;
    const httpStatus = completed ? res.statusCode : 499; // 499: client went away
    const files = req.files
      ? Array.isArray(req.files)
        ? req.files
        : Object.values(req.files).flat()
      : req.file
        ? [req.file]
        : [];
    const outLen = Number(res.getHeader("content-length"));

    recordAudit({
      ts: new Date(started).toISOString(),
      userId: req.user?.id ?? "unknown",
      userEmail: req.user?.email ?? "unknown",
      action,
      success: completed && httpStatus < 400,
      httpStatus,
      inputFiles: files.length,
      inputBytes: files.reduce((sum, f) => sum + (f.size || 0), 0),
      outputBytes: Number.isFinite(outLen) && outLen > 0 ? outLen : null,
      durationMs: Date.now() - started,
      ip: req.ip,
    });
  });
  next();
}

// ── Queries for the report ─────────────────────────────────────────────────

function whereClause({ from, to, user, action }) {
  const parts = [];
  const params = [];
  if (from) {
    parts.push("ts >= ?");
    params.push(from);
  }
  if (to) {
    parts.push("ts < ?"); // exclusive upper bound
    params.push(to);
  }
  if (user) {
    parts.push("user_email = ? COLLATE NOCASE");
    params.push(user);
  }
  if (action) {
    parts.push("action = ?");
    params.push(action);
  }
  return { sql: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
}

const dayKeyExpr = "substr(datetime(ts, ?), 1, 10)";
const tzModifier = (tz) => `${tz >= 0 ? "+" : "-"}${Math.abs(tz)} minutes`;

export function getTotals(filters) {
  const w = whereClause(filters);
  return db
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(success), 0)      AS success,
              COALESCE(SUM(input_bytes), 0)  AS input_bytes,
              COALESCE(SUM(output_bytes), 0) AS output_bytes
         FROM audit_log ${w.sql}`
    )
    .get(...w.params);
}

export function getGrouped(filters, kind, tz = 0) {
  const w = whereClause(filters);
  const agg = `COUNT(*) AS total, COALESCE(SUM(success), 0) AS success`;
  if (kind === "action") {
    return db.prepare(`SELECT action AS key, ${agg} FROM audit_log ${w.sql} GROUP BY action ORDER BY total DESC`).all(...w.params);
  }
  if (kind === "user") {
    return db
      .prepare(`SELECT user_email AS key, ${agg} FROM audit_log ${w.sql} GROUP BY user_email ORDER BY total DESC LIMIT 100`)
      .all(...w.params);
  }
  // day (in the viewer's timezone)
  return db
    .prepare(`SELECT ${dayKeyExpr} AS key, ${agg} FROM audit_log ${w.sql} GROUP BY key ORDER BY key`)
    .all(tzModifier(tz), ...w.params);
}

export function getEntries(filters, { limit, offset }) {
  const w = whereClause(filters);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM audit_log ${w.sql}`).get(...w.params).n;
  const rows = db
    .prepare(`SELECT * FROM audit_log ${w.sql} ORDER BY ts DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...w.params, limit, offset);
  return { total, rows };
}

export function getExportRows(filters, max) {
  const w = whereClause(filters);
  return db.prepare(`SELECT * FROM audit_log ${w.sql} ORDER BY ts DESC, id DESC LIMIT ?`).all(...w.params, max);
}

export function listUsers() {
  return db
    .prepare("SELECT DISTINCT user_email AS email FROM audit_log ORDER BY user_email COLLATE NOCASE LIMIT 500")
    .all()
    .map((r) => r.email);
}
