import { AlertTriangle, FileStack, ShieldCheck, TrendingUp } from "lucide-react";
import { ExpertShell } from "@/components/ExpertShell";
import { expertIssues, projectSnapshot, strategyBranches } from "@/lib/mockData";

const stats = [
  ["총자산", projectSnapshot.totalAssets],
  ["총채무", projectSnapshot.totalDebt],
  ["순자산", projectSnapshot.netAssets],
  ["가용 현금", projectSnapshot.cashAvailable],
  ["예상 납부재원 부족", projectSnapshot.estimatedFundingGap],
  ["시나리오", projectSnapshot.scenarioCount],
  ["미해결 쟁점", projectSnapshot.unresolvedIssues]
];

export default function ExpertOverviewPage() {
  return (
    <ExpertShell>
      <main className="px-6 py-8 lg:px-10">
        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="border border-[var(--border)] bg-white p-7">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">{projectSnapshot.stage}</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.055em] text-[var(--navy-950)] md:text-5xl">{projectSnapshot.title}</h1>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {stats.slice(0, 4).map(([label, value]) => (
                <article key={label} className="border border-[var(--border)] bg-[var(--ivory)] p-5">
                  <p className="text-sm text-[var(--muted)]">{label}</p>
                  <strong className="mt-3 block text-3xl tracking-[-0.05em]">{value}</strong>
                </article>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
            {stats.slice(4).map(([label, value]) => (
              <article key={label} className="border border-[var(--border)] bg-white p-5">
                <p className="text-sm text-[var(--muted)]">{label}</p>
                <strong className="mt-3 block text-3xl tracking-[-0.05em]">{value}</strong>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <article className="border border-[var(--border)] bg-white p-6">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-5 w-5 text-[var(--gold)]" />
              <h2 className="text-xl font-semibold">현재 검토 중인 전략</h2>
            </div>
            <div className="mt-6 grid gap-3">
              {strategyBranches.slice(1, 5).map((strategy) => (
                <div key={strategy.name} className="flex items-center justify-between border border-[var(--border)] px-4 py-3">
                  <span className="text-sm font-semibold">{strategy.name}</span>
                  <span className="text-xs text-[var(--muted)]">{strategy.calculation_status}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="border border-[var(--border)] bg-white p-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-[var(--warning)]" />
              <h2 className="text-xl font-semibold">미해결 핵심 쟁점</h2>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {expertIssues.map((issue) => (
                <div key={issue.title} className="border border-[var(--border)] p-5">
                  <p className="text-sm font-semibold">{issue.title}</p>
                  <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{issue.body}</p>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section id="family-assets" className="mt-6 grid gap-6 lg:grid-cols-3">
          <article className="border border-[var(--border)] bg-white p-6">
            <h2 className="text-xl font-semibold">가족·자산</h2>
            <p className="mt-4 text-sm leading-7 text-[var(--muted)]">부모 2명, 자녀 2명, 배우자 포함 구조를 기준으로 한 합성 프로젝트입니다.</p>
          </article>
          <article className="border border-[var(--border)] bg-white p-6">
            <h2 className="text-xl font-semibold">주요 자산</h2>
            <p className="mt-4 text-sm leading-7 text-[var(--muted)]">부동산 42억, 금융자산 8억, 보험 납부재원 후보 5억을 비교합니다.</p>
          </article>
          <article className="border border-[var(--border)] bg-white p-6">
            <h2 className="text-xl font-semibold">가족별 검토 메모</h2>
            <p className="mt-4 text-sm leading-7 text-[var(--muted)]">가족별 지분, 과거 증여, 자산별 평가 메모를 한 곳에서 이어서 확인합니다.</p>
          </article>
        </section>

        <section id="report" className="mt-6 grid gap-6 lg:grid-cols-3">
          <article className="border border-[var(--border)] bg-white p-6">
            <FileStack className="h-5 w-5 text-[var(--gold)]" />
            <h2 className="mt-5 text-xl font-semibold">자료 준비 진행률</h2>
            <div className="mt-6 h-2 bg-[var(--border)]">
              <div className="h-2 w-[64%] bg-[var(--gold)]" />
            </div>
            <p className="mt-3 text-sm text-[var(--muted)]">64% · 등기자료와 보험계약 구조 추가 확인 필요</p>
          </article>
          <article className="border border-[var(--border)] bg-white p-6">
            <ShieldCheck className="h-5 w-5 text-[var(--success)]" />
            <h2 className="mt-5 text-xl font-semibold">보험 납부재원 분석</h2>
            <p className="mt-5 text-sm leading-7 text-[var(--muted)]">상속세 납부재원 부족액 7억 중 2억 수준을 보험 구조로 보완 가능하다는 가정입니다.</p>
          </article>
          <article className="border border-[var(--border)] bg-white p-6">
            <h2 className="text-xl font-semibold">최근 활동</h2>
            <ul className="mt-5 grid gap-3 text-sm text-[var(--muted)]">
              <li>가족법인 시나리오 초안 생성</li>
              <li>부담부증여 증빙 체크 필요 표시</li>
              <li>무료 보고서 고객 공유본 업데이트</li>
            </ul>
          </article>
        </section>
      </main>
    </ExpertShell>
  );
}
