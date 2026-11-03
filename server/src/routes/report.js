import express from "express";
import { config } from "../config.js";
import { isReportViewer, requireReportViewer } from "../auth.js";
import {
  ACTIONS,
  auditEnabled,
  getEntries,
  getExportRows,
  getGrouped,
  getTotals,
  listUsers,
} from "../audit.js";

const router = express.Router();

const MAX_EXPORT_ROWS = 50000;

function badRequest(message) {
  const e = new Error(message);
  e.status = 400;
  return e;
}

function parseIso(value, name) {
  if (value === undefined || value === "") return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) throw badRequest(`"${name}" must be a valid date/time.`);
  return d.toISOString();
}

function parseFilters(q) {
  const user = typeof q.user === "string" ? q.user.trim() : "";
  if (user.length > 254) throw badRequest('"user" is too long.');
  const action = typeof q.action === "string" ? q.action.trim() : "";
  if (action && !ACTIONS.includes(action)) throw badRequest(`"action" must be one of: ${ACTIONS.join(", ")}.`);

  let tz = q.tz === undefined || q.tz === "" ? 0 : Number(q.tz);
  if (!Number.isInteger(tz) || tz < -840 || tz > 840) tz = 0;

  return {
    filters: { from: parseIso(q.from, "from"), to: parseIso(q.to, "to"), user, action },
    tz,
  };
}

function requireAuditStore(req, res, next) {
  if (!auditEnabled()) {
    return res.status(503).json({ error: "The activity log is not enabled on this server." });
  }
  next();
}

// Who am I / what may I see? Available to every signed-in user; the UI uses it
// to show the user's name and decide whether to offer the report tab.
router.get("/me", (req, res) => {
  const signedIn = config.authMode === "proxy";
  res.json({
    authMode: config.authMode,
    user: signedIn ? { email: req.user.email } : null,
    canViewReport: isReportViewer(req.user) && auditEnabled(),
    logoutUrl: signedIn ? config.logoutUrl : null,
    retentionDays: config.auditRetentionDays,
  });
});

// Everything below is restricted to configured report viewers.
router.use(requireReportViewer, requireAuditStore);

router.get("/summary", (req, res) => {
  const { filters, tz } = parseFilters(req.query);
  res.json({
    retentionDays: config.auditRetentionDays,
    totals: getTotals(filters),
    byAction: getGrouped(filters, "action"),
    byUser: getGrouped(filters, "user"),
    byDay: getGrouped(filters, "day", tz),
    users: listUsers(),
    actions: ACTIONS,
  });
});

router.get("/entries", (req, res) => {
  const { filters } = parseFilters(req.query);
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 50));
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const { total, rows } = getEntries(filters, { limit: pageSize, offset: (page - 1) * pageSize });
  res.json({ total, page, pageSize, rows });
});

/**
 * Spreadsheet formulas are executed by Excel/Sheets when a cell starts with
 * = + - @ (or tab/CR). Values here include text that came from outside (the
 * signed-in user's email), so neutralize them with a leading apostrophe.
 */
function csvCell(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

router.get("/export.csv", (req, res) => {
  const { filters } = parseFilters(req.query);
  const rows = getExportRows(filters, MAX_EXPORT_ROWS);
  const header = [
    "time_utc",
    "user",
    "user_id",
    "action",
    "result",
    "http_status",
    "input_files",
    "input_bytes",
    "output_bytes",
    "duration_ms",
    "ip",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.ts,
        r.user_email,
        r.user_id,
        r.action,
        r.success ? "success" : "failed",
        r.http_status,
        r.input_files,
        r.input_bytes,
        r.output_bytes,
        r.duration_ms,
        r.ip,
      ]
        .map(csvCell)
        .join(",")
    );
  }
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="activity-report-${stamp}.csv"`);
  // UTF-8 BOM so Excel opens non-ASCII names correctly.
  res.send("\uFEFF" + lines.join("\r\n") + "\r\n");
});

export default router;
