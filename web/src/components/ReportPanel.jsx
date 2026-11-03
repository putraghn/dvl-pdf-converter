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

function Card({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function SummaryTable({ title, rows, keyLabel, countLabel, renderKey }) {
  return (
    <div className="rounded-lg border border-slate-200">
      <p className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">{title}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-400">
            <th className="px-3 py-1.5 font-medium">{keyLabel}</th>
            <th className="px-3 py-1.5 text-right font-medium">{countLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-slate-100">
              <td className="max-w-[16rem] truncate px-3 py-1.5 text-slate-700" title={r.key}>
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
  const [page, setPage] = useState(1);

  const [summary, setSummary] = useState(null);
  const [entries, setEntries] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const filterParams = () => {
    const p = rangeParams(from, to);
    if (user) p.set("user", user);
    if (action) p.set("action", action);
    return p;
  };

  // Any filter change goes back to page 1.
  useEffect(() => {
    setPage(1);
  }, [from, to, user, action]);

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
  }, [from, to, user, action, page]);

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
              <option key={u} value={u}>
                {u}
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
              <div className="grid gap-3 md:grid-cols-3">
                <SummaryTable title={t("report.byAction")} rows={summary.byAction} keyLabel={t("report.col.action")} countLabel={t("report.col.count")} renderKey={actionLabel} />
                <SummaryTable title={t("report.byUser")} rows={summary.byUser} keyLabel={t("report.col.user")} countLabel={t("report.col.count")} />
                <SummaryTable title={t("report.byDay")} rows={summary.byDay} keyLabel={t("report.from")} countLabel={t("report.col.count")} />
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
                  <table className="w-full min-w-[40rem] text-sm">
                    <thead className="bg-slate-50 text-left text-xs text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">{t("report.col.time")}</th>
                        <th className="px-3 py-2 font-medium">{t("report.col.user")}</th>
                        <th className="px-3 py-2 font-medium">{t("report.col.action")}</th>
                        <th className="px-3 py-2 font-medium">{t("report.col.result")}</th>
                        <th className="px-3 py-2 text-right font-medium">{t("report.col.files")}</th>
                        <th className="px-3 py-2 text-right font-medium">{t("report.col.input")}</th>
                        <th className="px-3 py-2 text-right font-medium">{t("report.col.output")}</th>
                        <th className="px-3 py-2 text-right font-medium">{t("report.col.duration")}</th>
                        <th className="px-3 py-2 font-medium">{t("report.col.ip")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(entries?.rows ?? []).map((r) => (
                        <tr key={r.id} className="border-t border-slate-100">
                          <td className="whitespace-nowrap px-3 py-1.5 text-slate-700">{new Date(r.ts).toLocaleString()}</td>
                          <td className="max-w-[14rem] truncate px-3 py-1.5 text-slate-700" title={r.user_email}>
                            {r.user_email}
                          </td>
                          <td className="px-3 py-1.5 text-slate-700">{actionLabel(r.action)}</td>
                          <td className="px-3 py-1.5">
                            <span className={r.success ? "text-green-700" : "text-red-700"}>
                              {r.success ? t("report.result.success") : `${t("report.result.failed")} (${r.http_status})`}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-700">{r.input_files}</td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-right text-slate-700">{formatBytes(r.input_bytes) || "0 B"}</td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-right text-slate-700">{r.output_bytes ? formatBytes(r.output_bytes) : "-"}</td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-right text-slate-700">{r.duration_ms} ms</td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-slate-500">{r.ip || "-"}</td>
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
