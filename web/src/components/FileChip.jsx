import React from "react";
import { formatBytes } from "../utils.js";

export default function FileChip({ file, index, onRemove, onMoveUp, onMoveDown, canReorder, kind = "pdf" }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
      {kind === "image" ? (
        <svg className="h-6 w-6 shrink-0 text-indigo-500" fill="currentColor" viewBox="0 0 24 24">
          <path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5zm2 0v10l3.5-3.5 2.5 2.5L15 9l3 4V5H6zm2.5 4a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />
        </svg>
      ) : (
        <svg className="h-6 w-6 shrink-0 text-red-500" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6zm7 1.5L18.5 9H13V3.5z" />
        </svg>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-700">{file.name}</p>
        <p className="text-xs text-slate-400">{formatBytes(file.size)}</p>
      </div>
      {canReorder && (
        <div className="flex flex-col">
          <button
            type="button"
            onClick={() => onMoveUp(index)}
            className="px-1 text-slate-400 hover:text-brand-600 disabled:opacity-30"
            title="Naikkan"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={() => onMoveDown(index)}
            className="px-1 text-slate-400 hover:text-brand-600 disabled:opacity-30"
            title="Turunkan"
          >
            ▼
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => onRemove(index)}
        className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
        title="Hapus"
      >
        ✕
      </button>
    </div>
  );
}
