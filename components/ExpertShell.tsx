"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { expertNav, projectSnapshot } from "@/lib/mockData";

function ExpertMenu({ onNavigate }: Readonly<{ onNavigate?: () => void }>) {
  return (
    <nav className="mt-8 grid gap-2" aria-label="전문가 메뉴">
      {expertNav.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className="flex items-center gap-3 border border-transparent px-3 py-3 text-sm text-white/72 transition hover:border-white/10 hover:bg-white/5 hover:text-white"
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function ExpertShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text)]">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-white/10 bg-[var(--navy-950)] px-6 py-7 text-white lg:block">
        <Link href="/expert/overview" className="text-xl font-semibold tracking-[-0.02em]">
          자산승계 360
        </Link>
        <p className="mt-2 text-sm text-white/55">전문가 콘솔</p>
        <div className="mt-8 border-y border-white/10 py-5">
          <p className="text-xs tracking-[0.08em] text-[var(--gold)]">현재 프로젝트</p>
          <p className="mt-3 font-semibold">{projectSnapshot.title}</p>
          <p className="mt-1 text-sm text-white/58">{projectSnapshot.stage}</p>
        </div>
        <ExpertMenu />
      </aside>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="전문가 메뉴">
          <button type="button" aria-label="전문가 메뉴 배경 닫기" className="absolute inset-0 bg-black/45" onClick={() => setOpen(false)} />
          <aside className="relative h-full w-[min(22rem,86vw)] bg-[var(--navy-950)] px-6 py-7 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold">자산승계 360</p>
                <p className="mt-1 text-sm text-white/55">전문가 콘솔</p>
              </div>
              <button type="button" aria-label="전문가 메뉴 닫기" onClick={() => setOpen(false)} className="border border-white/15 p-2">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-8 border-y border-white/10 py-5">
              <p className="text-xs tracking-[0.08em] text-[var(--gold)]">현재 프로젝트</p>
              <p className="mt-3 font-semibold">{projectSnapshot.title}</p>
              <p className="mt-1 text-sm text-white/58">{projectSnapshot.stage}</p>
            </div>
            <ExpertMenu onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-72">
        <header className="border-b border-[var(--border)] bg-white px-6 py-5 lg:px-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="전문가 메뉴 열기"
                aria-expanded={open}
                onClick={() => setOpen(true)}
                className="border border-[var(--border)] p-2 lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div>
                <p className="text-xs font-semibold tracking-[0.08em] text-[var(--gold)]">전문가 작업공간</p>
                <p className="mt-1 text-sm text-[var(--muted)]">{projectSnapshot.title} · {projectSnapshot.stage}</p>
              </div>
            </div>
            <Link href="/" className="text-sm font-semibold text-[var(--navy-900)]">
              공개 사이트 보기
            </Link>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
