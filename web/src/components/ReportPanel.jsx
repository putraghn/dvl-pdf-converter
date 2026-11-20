import React, { useEffect, useState } from "react";
import StatusBar from "./StatusBar.jsx";
import { downloadBlob, getBlob, getJson } from "../api.js";
import { formatBytes } from "../utils.js";
import { useT } from "../i18n.jsx";

const PAGE_SIZE = 25;
const ACTION_LABEL = {
  merge: "tab.merge",
  split: "tab.split",
  compress: "tab.compress",
  to_images: "tab.toImages",
  from_images: "tab.fromImages",
  protect: "tab.protect",
};

/** "nano.pamungkas@darya-varia.com" -> "nano.pamungkas" (the full email stays in tooltips, filters and CSV). */
const userName = (email) => String(email ?? "").split("@")[0];
const pad = (n) => String(n).padStart(2, "0");
const toDateInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Local calendar days -> UTC instants (the "to" bound is exclusive: start of the next day). */
function rangeParams(from, to) {
  const p = new URLSearchParams();
  if (from) p.set("from", new Date(`${from}T00:00:00`).toISOString());
  if (to) {
    const end = new Date(`${to}T00:00:00`);
    end.setDate(end.getDate() + 1);
    p.set("to", end.toISOString());
  }
  return p;
}

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

// Entries table columns. Widths are in px and can be dragged by the user.
const COLUMNS = [
  { id: "time", label: "report.col.time", w: 160 },
  { id: "user", label: "report.col.user", w: 210 },
  { id: "action", label: "report.col.action", w: 110 },
  { id: "file", label: "report.col.file", w: 320 },
  { id: "result", label: "report.col.result", w: 110 },
  { id: "files", label: "report.col.files", w: 70, right: true },
  { id: "input", label: "report.col.input", w: 90, right: true },
  { id: "output", label: "report.col.output", w: 90, right: true },
  { id: "duration", label: "report.col.duration", w: 100, right: true },
  { id: "ip", label: "report.col.ip", w: 120 },
];
const MIN_COL_W = 50;
const MAX_COL_W = 1000;
const WIDTHS_KEY = "report.colWidths";
const defaultWidths = () => Object.fromEntries(COLUMNS.map((c) => [c.id, c.w]));

function loadWidths() {
  const base = defaultWidths();
  try {
    const saved = JSON.parse(localStorage.getItem(WIDTHS_KEY) || "{}");
    for (const id of Object.keys(base)) {
      const v = Number(saved[id]);
      if (Number.isFinite(v)) base[id] = Math.min(MAX_COL_W, Math.max(MIN_COL_W, v));
    }
  } catch {
    /* ignore unreadable storage */
  }
  return base;
}
function Card({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function SummaryTable({ title, rows, keyLabel, countLabel, renderKey, className = "" }) {
  return (
    <div className={`min-w-0 overflow-hidden rounded-lg border border-slate-200 ${className}`}>
      <p className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">{title}</p>
      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-400">
            <th className="px-3 py-1.5 font-medium">{keyLabel}</th>
            <th className="w-16 px-3 py-1.5 text-right font-medium">{countLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-slate-100">
              <td className="truncate px-3 py-1.5 text-slate-700" title={r.key}>
                {renderKey ? renderKey(r.key) : r.key}
              </td>
              <td className="px-3 py-1.5 text-right text-slate-700">{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ReportPanel({ retentionDays = 45 }) {
  const { t } = useT();
  const today = new Date();
  const weekAgo = new Date();
  weekAgo.setDate(today.getDate() - 6);

  const [from, setFrom] = useState(toDateInput(weekAgo));
  const [to, setTo] = useState(toDateInput(today));
  const [user, setUser] = useState("");
  const [action, setAction] = useState("");
  const [file, setFile] = useState("");
  const [fileQuery, setFileQuery] = useState(""); // debounced copy of `file`
  const [page, setPage] = useState(1);

  const [summary, setSummary] = useState(null);
  const [entries, setEntries] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [widths, setWidths] = useState(loadWidths);
  useEffect(() => {
    try {
      localStorage.setItem(WIDTHS_KEY, JSON.stringify(widths));
    } catch {
      /* storage may be unavailable */
    }
  }, [widths]);
  const tableWidth = COLUMNS.reduce((sum, c) => sum + widths[c.id], 0);

  function startResize(e, id) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = widths[id];
    const onMove = (ev) => {
      const w = Math.min(MAX_COL_W, Math.max(MIN_COL_W, startW + ev.clientX - startX));
      setWidths((prev) => ({ ...prev, [id]: w }));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  const resetWidth = (id) => setWidths((prev) => ({ ...prev, [id]: defaultWidths()[id] }));

  const filterParams = () => {
    const p = rangeParams(from, to);
    if (user) p.set("user", user);
    if (action) p.set("action", action);
    if (fileQuery.trim()) p.set("file", fileQuery.trim());
    return p;
  };

  // Wait for typing to pause before querying.
  useEffect(() => {
    const id = setTimeout(() => setFileQuery(file), 400);
    return () => clearTimeout(id);
  }, [file]);

  // Any filter change goes back to page 1.
  useEffect(() => {
    setPage(1);
  }, [from, to, user, action, fileQuery]);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    setError("");
    const base = filterParams();
    const tz = String(-new Date().getTimezoneOffset());
    const sp = new URLSearchParams(base);
    sp.set("tz", tz);
    const ep = new URLSearchParams(base);
    ep.set("page", String(page));
    ep.set("pageSize", String(PAGE_SIZE));

    Promise.all([getJson(`/api/report/summary?${sp}`), getJson(`/api/report/entries?${ep}`)])
      .then(([s, e]) => {
        if (!alive) return;
        setSummary(s);
        setEntries(e);
      })
      .catch((err) => alive && setError(err.message))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
    // filterParams reads the same state listed here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, user, action, fileQuery, page]);

  async function exportCsv() {
    setError("");
    try {
      const blob = await getBlob(`/api/report/export.csv?${filterParams()}`);
      downloadBlob(blob, `activity-report-${from || "all"}_${to || "all"}.csv`);
    } catch (err) {
      setError(err.message);
    }
  }

  const totals = summary?.totals;
  const pages = entries ? Math.max(1, Math.ceil(entries.total / PAGE_SIZE)) : 1;
  const actionLabel = (key) => (ACTION_LABEL[key] ? t(ACTION_LABEL[key]) : key);

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">{t("report.desc", { days: summary?.retentionDays ?? retentionDays })}</p>

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-sm font-medium text-slate-700">
          {t("report.from")}
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          {t("report.to")}
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          {t("report.user")}
          <select value={user} onChange={(e) => setUser(e.target.value)} className={`${inputClass} mt-1`}>
            <option value="">{t("report.allUsers")}</option>
            {(summary?.users ?? []).map((u) => (
              <option key={u} value={u} title={u}>
                {userName(u)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          {t("report.action")}
          <select value={action} onChange={(e) => setAction(e.target.value)} className={`${inputClass} mt-1`}>
            <option value="">{t("report.allActions")}</option>
            {(summary?.actions ?? []).map((a) => (
              <option key={a} value={a}>
                {actionLabel(a)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-sm font-medium text-slate-700">
        {t("report.file")}
        <input
          type="search"
          value={file}
          maxLength={255}
          onChange={(e) => setFile(e.target.value)}
          placeholder={t("report.filePlaceholder")}
          className={`${inputClass} mt-1`}
        />
      </label>

      <StatusBar busy={busy} error={error} success="" />

      {totals && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card label={t("report.card.total")} value={totals.total} />
            <Card label={t("report.card.success")} value={totals.success} />
            <Card label={t("report.card.failed")} value={totals.total - totals.success} />
            <Card label={t("report.card.input")} value={formatBytes(totals.input_bytes) || "0 B"} />
          </div>

          {totals.total === 0 ? (
            <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">{t("report.noData")}</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <SummaryTable title={t("report.byAction")} rows={summary.byAction} keyLabel={t("report.col.action")} countLabel={t("report.col.count")} renderKey={actionLabel} />
                <SummaryTable title={t("report.byUser")} rows={summary.byUser} renderKey={userName} keyLabel={t("report.col.user")} countLabel={t("report.col.count")} className="sm:col-span-2" />
                <SummaryTable title={t("report.byDay")} rows={summary.byDay} keyLabel={t("report.col.day")} countLabel={t("report.col.count")} />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-700">{t("report.entries")}</p>
                  <button
                    type="button"
                    onClick={exportCsv}
                    className="rounded-lg border border-brand-600 px-3 py-1.5 text-sm font-medium text-brand-700 transition hover:bg-brand-50"
                  >
                    {t("report.exportCsv")}
                  </button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="table-fixed text-sm" style={{ width: tableWidth }}>
                    <colgroup>
                      {COLUMNS.map((c) => (
                        <col key={c.id} style={{ width: widths[c.id] }} />
                      ))}
                    </colgroup>
                    <thead className="bg-slate-50 text-left text-xs text-slate-500">
                      <tr>
                        {COLUMNS.map((c) => (
                          <th key={c.id} className={`relative px-3 py-2 font-medium ${c.right ? "text-right" : ""}`}>
                            <span className="block truncate">{t(c.label)}</span>
                            <span
                              role="separator"
                              aria-orientation="vertical"
                              title={t("report.resizeHint")}
                              onPointerDown={(e) => startResize(e, c.id)}
                              onDoubleClick={() => resetWidth(c.id)}
                              className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none select-none border-r border-slate-200 hover:border-brand-500 hover:bg-brand-100"
                            />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(entries?.rows ?? []).map((r) => (
                        <tr key={r.id} className="border-t border-slate-100 align-top">
                          <td className="truncate px-3 py-1.5 text-slate-700">{new Date(r.ts).toLocaleString()}</td>
                          <td className="truncate px-3 py-1.5 text-slate-700" title={r.user_email}>
                            {userName(r.user_email)}
                          </td>
                          <td className="truncate px-3 py-1.5 text-slate-700">{actionLabel(r.action)}</td>
                          <td className="px-3 py-1.5 text-slate-700">
                            {r.file_names?.length ? (
                              <ul className="space-y-0.5">
                                {r.file_names.map((n, i) => (
                                  <li key={i} className="break-all" title={n}>
                                    {n}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="truncate px-3 py-1.5">
                            <span className={r.success ? "text-green-700" : "text-red-700"}>
                              {r.success ? t("report.result.success") : `${t("report.result.failed")} (${r.http_status})`}
                            </span>
                          </td>
                          <td className="truncate px-3 py-1.5 text-right text-slate-700">{r.input_files}</td>
                          <td className="truncate px-3 py-1.5 text-right text-slate-700">{formatBytes(r.input_bytes) || "0 B"}</td>
                          <td className="truncate px-3 py-1.5 text-right text-slate-700">{r.output_bytes ? formatBytes(r.output_bytes) : "-"}</td>
                          <td className="truncate px-3 py-1.5 text-right text-slate-700">{r.duration_ms} ms</td>
                          <td className="truncate px-3 py-1.5 text-slate-500">{r.ip || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
                  <button
                    type="button"
                    disabled={page <= 1 || busy}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t("report.prev")}
                  </button>
                  <span>{t("report.page", { page, pages })}</span>
                  <button
                    type="button"
                    disabled={page >= pages || busy}
                    onClick={() => setPage((p) => Math.min(pages, p + 1))}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t("report.next")}
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
