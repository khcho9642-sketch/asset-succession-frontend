"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState } from "react";

const diagnosisLinks = [
  { href: "/precheck?purpose=capital-gains", label: "양도" },
  { href: "/precheck?purpose=inheritance", label: "상속" },
  { href: "/precheck?purpose=gift", label: "증여" },
  { href: "/precheck?purpose=business", label: "가업승계" }
];

export function PublicNav() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="absolute inset-x-0 top-0 z-30 text-[#26221B]">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-6 lg:px-8 lg:py-6">
        <Link href="/" className="grid gap-1" aria-label="자산승계 360 홈">
          <span className="text-lg font-semibold tracking-[-0.03em]">자산승계 360</span>
          <span className="hidden text-xs font-medium text-[#6B6152] lg:block">오늘의 준비가 내일의 가족을 지킵니다.</span>
        </Link>

        <nav className="hidden items-center gap-3 text-sm font-semibold text-[#6B6152] lg:flex" aria-label="진단 유형">
          {diagnosisLinks.map((item, index) => (
            <span key={item.href} className="inline-flex items-center gap-3">
              <Link href={item.href} className="transition hover:text-[#B23A2A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#B23A2A]">
                {item.label}
              </Link>
              {index < diagnosisLinks.length - 1 ? <span aria-hidden="true" className="text-[#B8AD9C]">·</span> : null}
            </span>
          ))}
        </nav>

        <Link href="/consultation" className="hidden min-h-11 items-center border border-[#7A6139]/35 bg-[#F8F4EA] px-5 py-3 text-sm font-semibold text-[#26221B] transition hover:border-[#B23A2A] hover:text-[#B23A2A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#B23A2A] lg:inline-flex">
          전문가 상담
        </Link>

        <div className="flex items-center gap-2 lg:hidden">
          <Link href="/consultation" className="inline-flex min-h-11 items-center px-3 py-2 text-sm font-semibold text-[#26221B]">
            상담
          </Link>
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 items-center justify-center border border-[#7A6139]/25 bg-[#F8F4EA] text-[#26221B]"
            aria-controls="mobile-diagnosis-menu"
            aria-expanded={isMenuOpen}
            aria-label={isMenuOpen ? "메뉴 닫기" : "메뉴 열기"}
            onClick={() => setIsMenuOpen((value) => !value)}
          >
            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {isMenuOpen ? (
        <nav id="mobile-diagnosis-menu" className="mx-5 border border-[#D7CDBD] bg-[#F8F4EA] p-2 shadow-[0_18px_42px_rgba(38,34,27,0.12)] sm:mx-6 lg:hidden" aria-label="모바일 진단 유형">
          {diagnosisLinks.map((item) => (
            <Link key={item.href} href={item.href} className="block min-h-11 px-4 py-3 text-sm font-semibold text-[#26221B]" onClick={() => setIsMenuOpen(false)}>
              {item.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
