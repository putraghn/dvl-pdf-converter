import React, { useState } from "react";
import Dropzone from "./Dropzone.jsx";
import FileChip from "./FileChip.jsx";
import StatusBar from "./StatusBar.jsx";
import { postPdf, downloadBlob } from "../api.js";
import { useT } from "../i18n.jsx";

export default function SplitPanel() {
  const { t } = useT();
  const [file, setFile] = useState(null);
  const [ranges, setRanges] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const setOne = (incoming) => {
    setFile(incoming[0]);
    setError("");
    setSuccess("");
  };

  async function handleSplit() {
    if (!file) {
      setError(t("split.pickOne"));
      return;
    }
    if (!ranges.trim()) {
      setError(t("split.enterPages"));
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("ranges", ranges.trim());
      const { blob, filename } = await postPdf("split", fd);
      downloadBlob(blob, filename);
      setSuccess(t("split.success"));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">{t("split.desc")}</p>
      <Dropzone onFiles={setOne} />

      {file && (
        <FileChip file={file} index={0} onRemove={() => setFile(null)} canReorder={false} />
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          {t("split.label")}
        </label>
        <input
          type="text"
          value={ranges}
          onChange={(e) => setRanges(e.target.value)}
          placeholder="contoh: 1-3,5,8-10"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <p className="mt-1 text-xs text-slate-400">{t("split.hint")}</p>
      </div>

      <StatusBar busy={busy} error={error} success={success} />

      <button
        onClick={handleSplit}
        disabled={busy || !file}
        className="w-full rounded-lg bg-brand-600 px-4 py-3 font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t("split.button")}
      </button>
    </div>
  );
}
