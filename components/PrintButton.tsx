"use client";

import { Download } from "lucide-react";
import { useState } from "react";

export function PrintButton() {
  const [preparing, setPreparing] = useState(false);

  async function printReport() {
    setPreparing(true);
    try {
      await document.fonts.ready;
      window.print();
    } finally {
      setPreparing(false);
    }
  }

  return (
    <button
      type="button"
      onClick={printReport}
      disabled={preparing}
      aria-busy={preparing}
      className="mt-8 inline-flex items-center gap-2 bg-[var(--navy-950)] px-5 py-3 text-sm font-semibold text-white print:hidden"
    >
      <Download className="h-4 w-4" /> {preparing ? "인쇄 준비 중" : "브라우저에서 인쇄/PDF 저장"}
    </button>
  );
}
