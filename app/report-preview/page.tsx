import Link from "next/link";
import { ArrowLeft, ArrowRight, CircleAlert, FileText, ShieldCheck, WalletCards } from "lucide-react";
import { PublicLightNav } from "@/components/PublicLightNav";
import { PrintButton } from "@/components/PrintButton";
import { StrategyComparison } from "@/components/StrategyComparison";
import { expertIssues, projectSnapshot, strategyBranches } from "@/lib/mockData";

export default function ReportPreviewPage() {
  return (
    <main className="min-h-screen bg-[var(--background)]">
      <div className="print:hidden">
        <PublicLightNav />
      </div>
      <section className="mx-auto max-w-5xl px-6 py-12 lg:px-8">
        <Link href="/precheck/result" className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--navy-900)] print:hidden">
          <ArrowLeft className="h-4 w-4" /> 결과 비교로 돌아가기
        </Link>
        <article className="report-sheet mt-8 border border-[var(--border)] bg-white p-7 md:p-10 print:mt-0 print:border-0">
          <p className="text-sm font-semibold tracking-[0.08em] text-[var(--gold)]">무료 보고서 미리보기</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.055em] text-[var(--navy-950)]">무료 자산승계 사전진단 보고서</h1>
          <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
            합성 입력값으로 구성한 가족 회의용 미리보기입니다. 확정 세액이 아니라 상담 전 비교 기준과 추가 확인사항을 정리합니다.
          </p>
          <div className="print:hidden">
            <PrintButton />
          </div>
          <p className="mt-3 text-xs text-[var(--muted)] print:hidden">단축키 Ctrl+P 또는 브라우저 메뉴에서 PDF 저장을 선택합니다.</p>

          <section className="report-section mt-10 grid gap-4 md:grid-cols-4">
            {[
              ["총자산", projectSnapshot.totalAssets],
              ["순자산", projectSnapshot.netAssets],
              ["가용 현금", projectSnapshot.cashAvailable],
              ["납부재원 부족", projectSnapshot.estimatedFundingGap]
            ].map(([label, value]) => (
              <article key={label} className="border border-[var(--border)] bg-[var(--ivory)] p-5">
                <p className="text-sm text-[var(--muted)]">{label}</p>
                <strong className="mt-3 block text-3xl tracking-[-0.05em] text-[var(--navy-950)]">{value}</strong>
              </article>
            ))}
          </section>

          <section className="report-section mt-10 grid gap-5 md:grid-cols-2">
            <article className="border border-[var(--border)] p-6">
              <FileText className="h-5 w-5 text-[var(--gold)]" />
              <h2 className="mt-5 text-2xl font-semibold tracking-[-0.04em]">가족·자산 요약</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                부모 2명과 자녀 2명을 기준으로, 부동산 42억·금융자산 8억·보험 납부재원 후보 5억을 비교합니다.
              </p>
            </article>
            <article className="border border-[var(--border)] p-6">
              <ShieldCheck className="h-5 w-5 text-[var(--success)]" />
              <h2 className="mt-5 text-2xl font-semibold tracking-[-0.04em]">선택한 승계 목표</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                세금 부담, 즉시 필요현금, 부모 통제권, 자녀 이전효과, 납부재원 부족액을 함께 보는 균형형 검토입니다.
              </p>
            </article>
          </section>

          <section className="report-section mt-10">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[var(--gold)]">7개 전략 비교</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">같은 기준으로 본 선택지</h2>
              </div>
            </div>
            <StrategyComparison />
          </section>

          <section className="report-section mt-10 grid gap-5 md:grid-cols-3">
            <article className="border border-[var(--border)] bg-[var(--navy-950)] p-6 text-white">
              <WalletCards className="h-5 w-5 text-[var(--gold)]" />
              <h2 className="mt-5 text-2xl font-semibold tracking-[-0.04em]">납부재원 부족 분석</h2>
              <p className="mt-3 text-sm leading-7 text-white/68">현 상태 유지 후 상속 시 부족액은 7억 수준으로, 보험·단계적 이전·일부 매각 조합 검토가 필요합니다.</p>
            </article>
            <article className="border border-[var(--border)] p-6">
              <h2 className="text-2xl font-semibold tracking-[-0.04em]">가족법인 검토 가능성</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{strategyBranches[4].status_detail} 정관, 지분평가, 운영비 가정을 먼저 확인합니다.</p>
            </article>
            <article className="border border-[var(--border)] p-6">
              <h2 className="text-2xl font-semibold tracking-[-0.04em]">보험 검토 가능성</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{strategyBranches[5].status_detail} 계약자·수익자 구조가 핵심 확인사항입니다.</p>
            </article>
          </section>

          <section className="report-section mt-10 grid gap-5 md:grid-cols-[0.95fr_1.05fr]">
            <article className="border border-[var(--border)] p-6">
              <CircleAlert className="h-5 w-5 text-[var(--warning)]" />
              <h2 className="mt-5 text-2xl font-semibold tracking-[-0.04em]">주요 위험신호</h2>
              <ul className="mt-5 grid gap-3 text-sm leading-6 text-[var(--muted)]">
                {expertIssues.map((issue) => (
                  <li key={issue.title}><span className="font-semibold text-[var(--text)]">{issue.title}</span> · {issue.body}</li>
                ))}
              </ul>
            </article>
            <article className="border border-[var(--border)] p-6">
              <h2 className="text-2xl font-semibold tracking-[-0.04em]">추가 필요정보</h2>
              <div className="mt-5 grid gap-3 text-sm leading-6 text-[var(--muted)]">
                <p>취득가액·보유기간, 최근 10년 증여 내역, 채무승계 증빙, 보험계약 상세, 가족별 의사결정 우선순위가 필요합니다.</p>
                <p>이 정보가 확인되면 사전진단 결과를 정밀 상담용 프로젝트로 이어갈 수 있습니다.</p>
              </div>
            </article>
          </section>

          <section className="mt-10 flex flex-wrap items-center gap-4 border border-[var(--border)] bg-[var(--navy-950)] p-6 text-white print:hidden">
            <p className="flex-1 text-sm leading-6 text-white/70">다음 단계는 가족 회의에서 검토 후보를 좁힌 뒤, 필요한 자료를 정리해 상담으로 연결하는 것입니다.</p>
            <Link href="/consultation" className="inline-flex items-center gap-2 bg-white px-5 py-3 text-sm font-semibold text-[var(--navy-950)]">
              이 결과로 조경호 회계사에게 상담하기 <ArrowRight className="h-4 w-4" />
            </Link>
          </section>
        </article>
      </section>
    </main>
  );
}
