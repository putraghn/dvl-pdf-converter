import React, { useState } from "react";
import MergePanel from "./components/MergePanel.jsx";
import SplitPanel from "./components/SplitPanel.jsx";
import CompressPanel from "./components/CompressPanel.jsx";
import ToImagesPanel from "./components/ToImagesPanel.jsx";
import FromImagesPanel from "./components/FromImagesPanel.jsx";
import ProtectPanel from "./components/ProtectPanel.jsx";

const TABS = [
  {
    id: "merge",
    label: "Gabung",
    icon: "M7 4h10a1 1 0 0 1 1 1v4h-2V6H8v12h8v-3h2v4a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z",
    Panel: MergePanel,
  },
  {
    id: "split",
    label: "Pisah",
    icon: "M13 3h5a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-5v-2h4V5h-4V3zM3 7h8v2H5v6h6v2H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z",
    Panel: SplitPanel,
  },
  {
    id: "compress",
    label: "Kompres",
    icon: "M12 3v6m0 0 3-3m-3 3L9 6m3 15v-6m0 0 3 3m-3-3-3 3M3 12h18",
    Panel: CompressPanel,
  },
  {
    id: "to-images",
    label: "PDF → JPG",
    icon: "M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5zm2 12 4-5 3 3 2-2 3 4",
    Panel: ToImagesPanel,
  },
  {
    id: "from-images",
    label: "Gambar → PDF",
    icon: "M9 3h6l1 2h3a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3l1-2zm3 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
    Panel: FromImagesPanel,
  },
  {
    id: "protect",
    label: "Proteksi",
    icon: "M12 2a5 5 0 0 0-5 5v3H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 0 1 6 0v3H9z",
    Panel: ProtectPanel,
  },
];

export default function App() {
  const [active, setActive] = useState("merge");
  const ActivePanel = TABS.find((t) => t.id === active).Panel;

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col px-4 py-8">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-slate-800">
          PDF Tools <span className="text-brand-600">Internal</span>
        </h1>
        <p className="mt-2 text-slate-500">
          Gabung, pisah, kompres, dan konversi PDF. Diproses di server internal, file tidak disimpan.
        </p>
      </header>

      <nav className="mb-6 flex flex-wrap gap-2 rounded-xl bg-slate-100 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              active === tab.id
                ? "bg-white text-brand-700 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
            </svg>
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <ActivePanel />
      </main>

      <footer className="mt-8 text-center text-xs text-slate-400">
        Hanya untuk penggunaan internal perusahaan.
      </footer>
    </div>
  );
}
