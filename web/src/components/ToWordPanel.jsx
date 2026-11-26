import React, { useState } from "react";
import Dropzone from "./Dropzone.jsx";
import FileChip from "./FileChip.jsx";
import StatusBar from "./StatusBar.jsx";
import { postPdf, downloadBlob } from "../api.js";
import { useT } from "../i18n.jsx";

export default function ToWordPanel() {
  const { t } = useT();
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const setOne = (incoming) => {
    setFile(incoming[0]);
    setError("");
    setSuccess("");
  };

  async function handleConvert() {
    if (!file) {
      setError(t("toWord.pickOne"));
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { blob, filename } = await postPdf("to-word", fd);
      downloadBlob(blob, filename.replace(/\.pdf$/i, ".docx"));
      setSuccess(t("toWord.success"));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">{t("toWord.desc")}</p>
      <Dropzone onFiles={setOne} />
      {file && <FileChip file={file} index={0} onRemove={() => setFile(null)} canReorder={false} />}
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{t("toWord.note")}</p>
      <StatusBar busy={busy} error={error} success={success} />
      <button
        onClick={handleConvert}
        disabled={busy || !file}
        className="w-full rounded-lg bg-brand-600 px-4 py-3 font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? t("toWord.working") : t("toWord.button")}
      </button>
    </div>
  );
}