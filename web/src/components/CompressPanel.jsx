import React, { useState } from "react";
import Dropzone from "./Dropzone.jsx";
import FileChip from "./FileChip.jsx";
import StatusBar from "./StatusBar.jsx";
import { postPdf, downloadBlob } from "../api.js";
import { formatBytes } from "../utils.js";
import { useT } from "../i18n.jsx";

const LEVELS = [
  { id: "screen", labelKey: "compress.level.screen", descKey: "compress.level.screen.desc" },
  { id: "ebook", labelKey: "compress.level.ebook", descKey: "compress.level.ebook.desc" },
  { id: "printer", labelKey: "compress.level.printer", descKey: "compress.level.printer.desc" },
];

export default function CompressPanel() {
  const { t } = useT();
  const [file, setFile] = useState(null);
  const [level, setLevel] = useState("ebook");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const setOne = (incoming) => {
    setFile(incoming[0]);
    setError("");
    setSuccess("");
  };

  async function handleCompress() {
    if (!file) {
      setError(t("compress.pickOne"));
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("level", level);
      const { blob, filename, originalSize, compressedSize } = await postPdf("compress", fd);
      downloadBlob(blob, filename);
      if (originalSize && compressedSize) {
        const saved = Math.max(0, originalSize - compressedSize);
        const pct = originalSize ? Math.round((saved / originalSize) * 100) : 0;
        setSuccess(
          t("compress.success", {
            from: formatBytes(originalSize),
            to: formatBytes(compressedSize),
            pct,
          })
        );
      } else {
        setSuccess(t("compress.successPlain"));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">{t("compress.desc")}</p>
      <Dropzone onFiles={setOne} />

      {file && (
        <FileChip file={file} index={0} onRemove={() => setFile(null)} canReorder={false} />
      )}

      <div className="grid gap-2 sm:grid-cols-3">
        {LEVELS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setLevel(opt.id)}
            className={`rounded-lg border p-3 text-left transition ${
              level === opt.id
                ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500"
                : "border-slate-200 bg-white hover:border-brand-300"
            }`}
          >
            <p className="text-sm font-semibold text-slate-700">{t(opt.labelKey)}</p>
            <p className="mt-1 text-xs text-slate-400">{t(opt.descKey)}</p>
          </button>
        ))}
      </div>

      <StatusBar busy={busy} error={error} success={success} />

      <button
        onClick={handleCompress}
        disabled={busy || !file}
        className="w-full rounded-lg bg-brand-600 px-4 py-3 font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t("compress.button")}
      </button>
    </div>
  );
}
