import React, { useState } from "react";
import Dropzone from "./Dropzone.jsx";
import FileChip from "./FileChip.jsx";
import StatusBar from "./StatusBar.jsx";
import { postPdf, downloadBlob } from "../api.js";

const QUALITY = [
  { dpi: 96, label: "Layar", desc: "Cepat & kecil (96 dpi)" },
  { dpi: 150, label: "Standar", desc: "Rekomendasi (150 dpi)" },
  { dpi: 300, label: "Cetak", desc: "Resolusi tinggi (300 dpi)" },
];

export default function ToImagesPanel() {
  const [file, setFile] = useState(null);
  const [dpi, setDpi] = useState(150);
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
      setError("Pilih satu file PDF.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("dpi", String(dpi));
      const { blob, filename } = await postPdf("to-images", fd);
      downloadBlob(blob, filename);
      const isZip = filename.toLowerCase().endsWith(".zip");
      setSuccess(
        isZip
          ? "Setiap halaman diubah jadi JPG dan dikemas dalam ZIP. File terunduh."
          : "PDF diubah menjadi JPG. File terunduh."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Ubah tiap halaman PDF menjadi gambar JPG. Jika lebih dari satu halaman, hasilnya berupa file ZIP.
      </p>
      <Dropzone onFiles={setOne} />

      {file && (
        <FileChip file={file} index={0} onRemove={() => setFile(null)} canReorder={false} />
      )}

      <div className="grid gap-2 sm:grid-cols-3">
        {QUALITY.map((opt) => (
          <button
            key={opt.dpi}
            type="button"
            onClick={() => setDpi(opt.dpi)}
            className={`rounded-lg border p-3 text-left transition ${
              dpi === opt.dpi
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
        onClick={handleConvert}
        disabled={busy || !file}
        className="w-full rounded-lg bg-brand-600 px-4 py-3 font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Ubah ke JPG
      </button>
    </div>
  );
}
