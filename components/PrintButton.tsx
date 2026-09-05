"use client";

import { Download } from "lucide-react";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="mt-8 inline-flex items-center gap-2 bg-[var(--navy-950)] px-5 py-3 text-sm font-semibold text-white print:hidden"
    >
      <Download className="h-4 w-4" /> 브라우저에서 인쇄/PDF 저장
    </button>
  );
}
