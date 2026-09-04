import Link from "next/link";
import { expertNav, projectSnapshot } from "@/lib/mockData";

export function ExpertShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text)]">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-white/10 bg-[var(--navy-950)] px-6 py-7 text-white lg:block">
        <Link href="/expert/overview" className="text-xl font-semibold tracking-[-0.02em]">
          자산승계 360
        </Link>
        <p className="mt-2 text-sm text-white/55">전문가 콘솔</p>
        <div className="mt-8 border-y border-white/10 py-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--gold)]">Current project</p>
          <p className="mt-3 font-semibold">{projectSnapshot.title}</p>
          <p className="mt-1 text-sm text-white/58">{projectSnapshot.stage}</p>
        </div>
        <nav className="mt-8 grid gap-2">
          {expertNav.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 border border-transparent px-3 py-3 text-sm text-white/72 transition hover:border-white/10 hover:bg-white/5 hover:text-white"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="lg:pl-72">
        <header className="border-b border-[var(--border)] bg-white px-6 py-5 lg:px-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">Professional workspace</p>
              <p className="mt-1 text-sm text-[var(--muted)]">합성 예시 데이터 · 실제 고객정보 미포함</p>
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
