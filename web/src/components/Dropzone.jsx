import React, { useRef, useState } from "react";
import { isPdf, isImage } from "../utils.js";

/**
 * A drag-and-drop file picker.
 * Props:
 *  - multiple: allow more than one file
 *  - kind: "pdf" (default) or "image" — controls accepted types and labels
 *  - onFiles: (File[]) => void  called with newly accepted files
 */
export default function Dropzone({ multiple = false, kind = "pdf", onFiles }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const isImageKind = kind === "image";
  const matcher = isImageKind ? isImage : isPdf;
  const acceptAttr = isImageKind ? "image/jpeg,image/png,.jpg,.jpeg,.png" : "application/pdf,.pdf";
  const hint = isImageKind
    ? multiple
      ? "Bisa pilih beberapa gambar (JPG / PNG)"
      : "Satu gambar (JPG / PNG)"
    : multiple
      ? "Bisa pilih beberapa file"
      : "Satu file PDF";
  const prompt = isImageKind
    ? "Tarik & letakkan gambar di sini, atau klik untuk memilih"
    : "Tarik & letakkan PDF di sini, atau klik untuk memilih";

  function accept(fileList) {
    const files = Array.from(fileList).filter(matcher);
    if (files.length) onFiles(multiple ? files : [files[0]]);
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        accept(e.dataTransfer.files);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition
        ${dragging ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-white hover:border-brand-400 hover:bg-slate-50"}`}
    >
      <svg className="mb-3 h-10 w-10 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
      </svg>
      <p className="font-medium text-slate-700">{prompt}</p>
      <p className="mt-1 text-sm text-slate-400">{hint}</p>
      <input
        ref={inputRef}
        type="file"
        accept={acceptAttr}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          accept(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
