import React from "react";

export default function StatusBar({ busy, error, success }) {
  if (busy) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-700">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-300 border-t-brand-600" />
        Memproses...
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
    );
  }
  if (success) {
    return (
      <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>
    );
  }
  return null;
}
