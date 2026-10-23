import React, { createContext, useContext, useEffect, useState } from "react";

// Lightweight i18n: a flat dictionary per language plus a context + hook.
// No external dependency. Language choice is persisted to localStorage.

const translations = {
  id: {
    "app.title": "PDF Tools",
    "app.titleAccent": "Internal",
    "app.subtitle":
      "Gabung, pisah, kompres, dan konversi PDF. Diproses di server internal, file tidak disimpan.",
    "app.footer": "Hanya untuk penggunaan internal perusahaan.",

    "tab.merge": "Gabung",
    "tab.split": "Pisah",
    "tab.compress": "Kompres",
    "tab.toImages": "PDF → JPG",
    "tab.fromImages": "Gambar → PDF",
    "tab.protect": "Proteksi",

    "common.processing": "Memproses...",
    "common.remove": "Hapus",
    "common.moveUp": "Naikkan",
    "common.moveDown": "Turunkan",

    "dropzone.pdf.prompt": "Tarik & letakkan PDF di sini, atau klik untuk memilih",
    "dropzone.image.prompt": "Tarik & letakkan gambar di sini, atau klik untuk memilih",
    "dropzone.pdf.single": "Satu file PDF",
    "dropzone.pdf.multi": "Bisa pilih beberapa file",
    "dropzone.image.single": "Satu gambar (JPG / PNG)",
    "dropzone.image.multi": "Bisa pilih beberapa gambar (JPG / PNG)",

    "merge.desc":
      "Gabungkan beberapa PDF menjadi satu. Urutan file menentukan urutan halaman.",
    "merge.needTwo": "Pilih minimal 2 file PDF untuk digabung.",
    "merge.success": "Berhasil menggabung {count} file. File terunduh.",
    "merge.button": "Gabung PDF",

    "split.desc": "Ambil halaman tertentu dari sebuah PDF menjadi file baru.",
    "split.pickOne": "Pilih satu file PDF.",
    "split.enterPages": "Masukkan halaman yang ingin diambil, mis. 1-3,5",
    "split.label": "Halaman yang diambil",
    "split.hint": "Gunakan tanda hubung untuk rentang dan koma untuk memisah. Contoh: 1-3,5",
    "split.success": "Halaman berhasil diekstrak. File terunduh.",
    "split.button": "Ekstrak Halaman",

    "compress.desc": "Perkecil ukuran file PDF. Pilih tingkat kompresi sesuai kebutuhan.",
    "compress.pickOne": "Pilih satu file PDF.",
    "compress.level.screen": "Maksimal",
    "compress.level.screen.desc": "Ukuran terkecil, kualitas paling rendah (72 dpi)",
    "compress.level.ebook": "Seimbang",
    "compress.level.ebook.desc": "Rekomendasi untuk dokumen umum (150 dpi)",
    "compress.level.printer": "Ringan",
    "compress.level.printer.desc": "Kualitas tinggi, kompresi lebih sedikit (300 dpi)",
    "compress.success": "Selesai: {from} → {to} (hemat {pct}%). File terunduh.",
    "compress.successPlain": "PDF berhasil dikompres. File terunduh.",
    "compress.button": "Kompres PDF",

    "toImages.desc":
      "Ubah tiap halaman PDF menjadi gambar JPG. Jika lebih dari satu halaman, hasilnya berupa file ZIP.",
    "toImages.pickOne": "Pilih satu file PDF.",
    "toImages.q.screen": "Layar",
    "toImages.q.screen.desc": "Cepat & kecil (96 dpi)",
    "toImages.q.standard": "Standar",
    "toImages.q.standard.desc": "Rekomendasi (150 dpi)",
    "toImages.q.print": "Cetak",
    "toImages.q.print.desc": "Resolusi tinggi (300 dpi)",
    "toImages.successZip": "Setiap halaman diubah jadi JPG dan dikemas dalam ZIP. File terunduh.",
    "toImages.successJpg": "PDF diubah menjadi JPG. File terunduh.",
    "toImages.button": "Ubah ke JPG",

    "fromImages.desc":
      "Gabungkan beberapa gambar JPG/PNG menjadi satu PDF, satu gambar per halaman. Urutan dapat diatur.",
    "fromImages.needOne": "Pilih minimal satu gambar (JPG / PNG).",
    "fromImages.success": "Berhasil membuat PDF dari {count} gambar. File terunduh.",
    "fromImages.button": "Buat PDF dari Gambar",

    "protect.desc":
      "Tambahkan password pada PDF. Dokumen hanya bisa dibuka dengan password yang kamu tentukan.",
    "protect.pickOne": "Pilih satu file PDF.",
    "protect.enterPassword": "Masukkan password.",
    "protect.mismatch": "Password dan konfirmasi tidak sama.",
    "protect.password": "Password",
    "protect.passwordPlaceholder": "Masukkan password",
    "protect.confirm": "Konfirmasi password",
    "protect.confirmPlaceholder": "Ketik ulang password",
    "protect.show": "Tampilkan password",
    "protect.success":
      "PDF berhasil diproteksi. File terunduh. Dokumen kini meminta password saat dibuka.",
    "protect.button": "Proteksi PDF",

    "error.requestFailed": "Permintaan gagal ({status})",
  },
  en: {
    "app.title": "PDF Tools",
    "app.titleAccent": "Internal",
    "app.subtitle":
      "Merge, split, compress, and convert PDFs. Processed on the internal server; files are not stored.",
    "app.footer": "For internal company use only.",

    "tab.merge": "Merge",
    "tab.split": "Split",
    "tab.compress": "Compress",
    "tab.toImages": "PDF → JPG",
    "tab.fromImages": "Images → PDF",
    "tab.protect": "Protect",

    "common.processing": "Processing...",
    "common.remove": "Remove",
    "common.moveUp": "Move up",
    "common.moveDown": "Move down",

    "dropzone.pdf.prompt": "Drag & drop a PDF here, or click to select",
    "dropzone.image.prompt": "Drag & drop images here, or click to select",
    "dropzone.pdf.single": "One PDF file",
    "dropzone.pdf.multi": "You can select multiple files",
    "dropzone.image.single": "One image (JPG / PNG)",
    "dropzone.image.multi": "You can select multiple images (JPG / PNG)",

    "merge.desc":
      "Combine several PDFs into one. The file order sets the page order.",
    "merge.needTwo": "Select at least 2 PDF files to merge.",
    "merge.success": "Merged {count} files. File downloaded.",
    "merge.button": "Merge PDF",

    "split.desc": "Extract specific pages from a PDF into a new file.",
    "split.pickOne": "Select one PDF file.",
    "split.enterPages": "Enter the pages to extract, e.g. 1-3,5",
    "split.label": "Pages to extract",
    "split.hint": "Use a hyphen for ranges and commas to separate. Example: 1-3,5",
    "split.success": "Pages extracted successfully. File downloaded.",
    "split.button": "Extract Pages",

    "compress.desc": "Reduce PDF file size. Choose a compression level to suit your needs.",
    "compress.pickOne": "Select one PDF file.",
    "compress.level.screen": "Maximum",
    "compress.level.screen.desc": "Smallest size, lowest quality (72 dpi)",
    "compress.level.ebook": "Balanced",
    "compress.level.ebook.desc": "Recommended for general documents (150 dpi)",
    "compress.level.printer": "Light",
    "compress.level.printer.desc": "High quality, less compression (300 dpi)",
    "compress.success": "Done: {from} → {to} (saved {pct}%). File downloaded.",
    "compress.successPlain": "PDF compressed successfully. File downloaded.",
    "compress.button": "Compress PDF",

    "toImages.desc":
      "Convert each PDF page into a JPG image. If there is more than one page, the result is a ZIP file.",
    "toImages.pickOne": "Select one PDF file.",
    "toImages.q.screen": "Screen",
    "toImages.q.screen.desc": "Fast & small (96 dpi)",
    "toImages.q.standard": "Standard",
    "toImages.q.standard.desc": "Recommended (150 dpi)",
    "toImages.q.print": "Print",
    "toImages.q.print.desc": "High resolution (300 dpi)",
    "toImages.successZip": "Each page converted to JPG and packed into a ZIP. File downloaded.",
    "toImages.successJpg": "PDF converted to JPG. File downloaded.",
    "toImages.button": "Convert to JPG",

    "fromImages.desc":
      "Combine several JPG/PNG images into one PDF, one image per page. Order can be adjusted.",
    "fromImages.needOne": "Select at least one image (JPG / PNG).",
    "fromImages.success": "Created a PDF from {count} images. File downloaded.",
    "fromImages.button": "Create PDF from Images",

    "protect.desc":
      "Add a password to the PDF. The document can only be opened with the password you set.",
    "protect.pickOne": "Select one PDF file.",
    "protect.enterPassword": "Enter a password.",
    "protect.mismatch": "Password and confirmation do not match.",
    "protect.password": "Password",
    "protect.passwordPlaceholder": "Enter a password",
    "protect.confirm": "Confirm password",
    "protect.confirmPlaceholder": "Re-type the password",
    "protect.show": "Show password",
    "protect.success":
      "PDF protected successfully. File downloaded. The document now asks for a password when opened.",
    "protect.button": "Protect PDF",

    "error.requestFailed": "Request failed ({status})",
  },
};

const LanguageContext = createContext({ lang: "id", setLang: () => {}, t: (k) => k });

const STORAGE_KEY = "pdf-tools-lang";

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    return saved === "en" || saved === "id" ? saved : "id";
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ignore storage errors */
    }
    if (typeof document !== "undefined") document.documentElement.lang = lang;
  }, [lang]);

  // Translate with optional {placeholder} interpolation.
  const t = (key, vars) => {
    let str = translations[lang][key] ?? translations.id[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return str;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useT() {
  return useContext(LanguageContext);
}
