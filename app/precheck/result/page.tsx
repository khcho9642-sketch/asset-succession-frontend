import Link from "next/link";
import { ArrowRight, Download, LockKeyhole } from "lucide-react";
import { PublicLightNav } from "@/components/PublicLightNav";
import { StrategyComparison } from "@/components/StrategyComparison";
import { strategyBranches } from "@/lib/mockData";

export default function ResultPage() {
  return (
    <main className="min-h-screen bg-[var(--background)]">
      <PublicLightNav />
      <section className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">Pre-check report</p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.055em] text-[var(--navy-950)] md:text-6xl">
              입력 정보 기준 사전 추정 결과입니다.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--muted)]">
              확정 세액이 아니라 가족 회의와 전문가 상담을 위한 비교표입니다. 입력한 내용을 다시 작성하지 않고 상담으로 이어갈 수 있습니다.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <article className="border border-[var(--border)] bg-white p-6">
              <p className="text-sm text-[var(--muted)]">비교 전략</p>
              <strong className="mt-4 block text-5xl tracking-[-0.06em] text-[var(--navy-950)]">7개</strong>
            </article>
            <article className="border border-[var(--border)] bg-white p-6">
              <p className="text-sm text-[var(--muted)]">주요 검토사항</p>
              <strong className="mt-4 block text-5xl tracking-[-0.06em] text-[var(--navy-950)]">11건</strong>
            </article>
          </div>
        </div>

        <div className="mt-12">
          <StrategyComparison />
        </div>

        <section className="mt-12 grid gap-5 lg:grid-cols-3">
          {strategyBranches.slice(0, 3).map((strategy) => (
            <article key={strategy.name} className="border border-[var(--border)] bg-white p-6">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--gold)]">{strategy.calculation_status}</span>
              <h2 className="mt-5 text-2xl font-semibold tracking-[-0.04em]">{strategy.name}</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{strategy.description}</p>
              <p className="mt-4 border-l-2 border-[var(--gold)] pl-3 text-sm leading-6 text-[var(--muted)]">{strategy.status_detail}</p>
            </article>
          ))}
        </section>

        <div className="mt-12 flex flex-wrap items-center gap-4 border border-[var(--border)] bg-[var(--navy-950)] p-6 text-white">
          <LockKeyhole className="h-5 w-5 text-[var(--gold)]" />
          <p className="flex-1 text-sm leading-6 text-white/70">본 결과는 입력 정보 기준 사전 추정이며 확정 세액이 아닙니다.</p>
          <Link href="/report-preview" className="inline-flex items-center gap-2 bg-white px-5 py-3 text-sm font-semibold text-[var(--navy-950)]">
            <Download className="h-4 w-4" /> 무료 보고서 다운로드
          </Link>
          <Link href="/consultation" className="inline-flex items-center gap-2 border border-white/20 px-5 py-3 text-sm font-semibold text-white">
            이 결과로 조경호 회계사에게 상담하기 <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}
