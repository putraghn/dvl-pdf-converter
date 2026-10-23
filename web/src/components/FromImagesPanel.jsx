import React, { useState } from "react";
import Dropzone from "./Dropzone.jsx";
import FileChip from "./FileChip.jsx";
import StatusBar from "./StatusBar.jsx";
import { postPdf, downloadBlob } from "../api.js";
import { useT } from "../i18n.jsx";

export default function FromImagesPanel() {
  const { t } = useT();
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const addFiles = (incoming) => {
    setFiles((prev) => [...prev, ...incoming]);
    setError("");
    setSuccess("");
  };
  const removeAt = (i) => setFiles((prev) => prev.filter((_, idx) => idx !== i));
  const move = (i, dir) =>
    setFiles((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  async function handleConvert() {
    if (files.length === 0) {
      setError(t("fromImages.needOne"));
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      const { blob, filename } = await postPdf("from-images", fd);
      downloadBlob(blob, filename);
      setSuccess(t("fromImages.success", { count: files.length }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">{t("fromImages.desc")}</p>
      <Dropzone multiple kind="image" onFiles={addFiles} />

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, i) => (
            <FileChip
              key={`${file.name}-${i}`}
              file={file}
              index={i}
              kind="image"
              canReorder
              onRemove={removeAt}
              onMoveUp={(idx) => move(idx, -1)}
              onMoveDown={(idx) => move(idx, 1)}
            />
          ))}
        </div>
      )}

      <StatusBar busy={busy} error={error} success={success} />

      <button
        onClick={handleConvert}
        disabled={busy || files.length === 0}
        className="w-full rounded-lg bg-brand-600 px-4 py-3 font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t("fromImages.button")}
      </button>
    </div>
  );
}
