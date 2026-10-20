import React, { useState } from "react";
import Dropzone from "./Dropzone.jsx";
import FileChip from "./FileChip.jsx";
import StatusBar from "./StatusBar.jsx";
import { postPdf, downloadBlob } from "../api.js";
import { formatBytes } from "../utils.js";

const LEVELS = [
  { id: "screen", label: "Maksimal", desc: "Ukuran terkecil, kualitas paling rendah (72 dpi)" },
  { id: "ebook", label: "Seimbang", desc: "Rekomendasi untuk dokumen umum (150 dpi)" },
  { id: "printer", label: "Ringan", desc: "Kualitas tinggi, kompresi lebih sedikit (300 dpi)" },
];

export default function CompressPanel() {
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
      setError("Pilih satu file PDF.");
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
          `Selesai: ${formatBytes(originalSize)} → ${formatBytes(compressedSize)} (hemat ${pct}%). File terunduh.`
        );
      } else {
        setSuccess("PDF berhasil dikompres. File terunduh.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Perkecil ukuran file PDF. Pilih tingkat kompresi sesuai kebutuhan.
      </p>
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
            <p className="text-sm font-semibold text-slate-700">{opt.label}</p>
            <p className="mt-1 text-xs text-slate-400">{opt.desc}</p>
          </button>
        ))}
      </div>

      <StatusBar busy={busy} error={error} success={success} />

      <button
        onClick={handleCompress}
        disabled={busy || !file}
        className="w-full rounded-lg bg-brand-600 px-4 py-3 font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Kompres PDF
      </button>
    </div>
  );
}
