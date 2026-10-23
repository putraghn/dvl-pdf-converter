import React, { useState } from "react";
import Dropzone from "./Dropzone.jsx";
import FileChip from "./FileChip.jsx";
import StatusBar from "./StatusBar.jsx";
import { postPdf, downloadBlob } from "../api.js";
import { useT } from "../i18n.jsx";

export default function ProtectPanel() {
  const { t } = useT();
  const [file, setFile] = useState(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const setOne = (incoming) => {
    setFile(incoming[0]);
    setError("");
    setSuccess("");
  };

  async function handleProtect() {
    if (!file) {
      setError(t("protect.pickOne"));
      return;
    }
    if (!password) {
      setError(t("protect.enterPassword"));
      return;
    }
    if (password !== confirm) {
      setError(t("protect.mismatch"));
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("password", password);
      const { blob, filename } = await postPdf("protect", fd);
      downloadBlob(blob, filename);
      setSuccess(t("protect.success"));
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">{t("protect.desc")}</p>
      <Dropzone onFiles={setOne} />

      {file && (
        <FileChip file={file} index={0} onRemove={() => setFile(null)} canReorder={false} />
      )}

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t("protect.password")}</label>
          <input
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder={t("protect.passwordPlaceholder")}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t("protect.confirm")}</label>
          <input
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            placeholder={t("protect.confirmPlaceholder")}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-500">
          <input
            type="checkbox"
            checked={show}
            onChange={(e) => setShow(e.target.checked)}
            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          {t("protect.show")}
        </label>
      </div>

      <StatusBar busy={busy} error={error} success={success} />

      <button
        onClick={handleProtect}
        disabled={busy || !file}
        className="w-full rounded-lg bg-brand-600 px-4 py-3 font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t("protect.button")}
      </button>
    </div>
  );
}
