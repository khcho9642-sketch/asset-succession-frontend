import Link from "next/link";
import { ArrowLeft, ArrowRight, CircleAlert, FileText, ShieldCheck, WalletCards } from "lucide-react";
import { AssessmentMetrics } from "@/components/AssessmentMetrics";
import { AssessmentSummary } from "@/components/AssessmentSummary";
import { PublicLightNav } from "@/components/PublicLightNav";
import { PrintButton } from "@/components/PrintButton";
import { StrategyComparison } from "@/components/StrategyComparison";
import { expertIssues, strategyBranches } from "@/lib/mockData";

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
            입력하신 답변을 바탕으로 구성한 가족 회의용 미리보기입니다. 전략별 세액·부족액은 계산엔진 연결 전까지 숫자로 표시하지 않고, 상담 전 비교 기준과 추가 확인사항만 정리합니다.
          </p>
          <div className="print:hidden">
            <PrintButton />
          </div>
          <p className="mt-3 text-xs text-[var(--muted)] print:hidden">단축키 Ctrl+P 또는 브라우저 메뉴에서 PDF 저장을 선택합니다.</p>

          <section className="report-section mt-8">
            <AssessmentSummary compact />
          </section>

          <section className="report-section mt-8">
            <AssessmentMetrics mode="report" />
          </section>

          <section className="report-section mt-10 grid gap-5 md:grid-cols-2">
            <article className="border border-[var(--border)] p-6">
              <FileText className="h-5 w-5 text-[var(--gold)]" />
              <h2 className="mt-5 text-2xl font-semibold tracking-[-0.04em]">가족·자산 요약</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                위 사전진단 스냅샷에 기록된 가족 구성과 자산 금액을 기준으로 상담 쟁점을 정리합니다. 주소·계좌·실명 정보는 포함하지 않습니다.
              </p>
            </article>
            <article className="border border-[var(--border)] p-6">
              <ShieldCheck className="h-5 w-5 text-[var(--success)]" />
              <h2 className="mt-5 text-2xl font-semibold tracking-[-0.04em]">선택한 승계 목표</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                사전진단에서 선택한 목표와 우선 관점을 바탕으로 세금 부담, 즉시 필요현금, 통제권, 자녀 이전효과를 함께 검토합니다.
              </p>
            </article>
          </section>

          <section className="report-section mt-10">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[var(--gold)]">7개 전략 검토틀</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">같은 기준으로 본 선택지</h2>
              </div>
            </div>
            <StrategyComparison />
          </section>

          <section className="report-section mt-10 grid gap-5 md:grid-cols-3">
            <article className="border border-[var(--border)] bg-[var(--navy-950)] p-6 text-white">
              <WalletCards className="h-5 w-5 text-[var(--gold)]" />
              <h2 className="mt-5 text-2xl font-semibold tracking-[-0.04em]">납부재원 검토 방식</h2>
              <p className="mt-3 text-sm leading-7 text-white/68">입력 금융자산은 납부재원 후보로만 표시합니다. 실제 부족액은 취득가액, 채무승계, 공제, 납부기한을 확인한 뒤 정밀 계산에서 확정합니다.</p>
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

          <section className="report-section mt-8 grid gap-5 md:grid-cols-3">
            <article className="border border-[var(--border)] bg-[var(--ivory)] p-6">
              <h2 className="text-xl font-semibold tracking-[-0.04em]">일반 검토 예시</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">부담부증여, 단계적 증여, 보험 납부재원, 가족법인은 같은 가족 의사결정 표 안에서 비교합니다.</p>
            </article>
            <article className="border border-[var(--border)] bg-[var(--ivory)] p-6">
              <h2 className="text-xl font-semibold tracking-[-0.04em]">다음 준비사항</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">취득가액, 보유기간, 채무증빙, 최근 10년 증여, 보험 계약자·수익자 구조를 확인합니다.</p>
            </article>
            <article className="border border-[var(--border)] bg-[var(--ivory)] p-6">
              <h2 className="text-xl font-semibold tracking-[-0.04em]">가족회의 질문</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">세금 최소화, 부모 통제권, 자녀별 형평성 중 어떤 기준을 우선할지 먼저 합의합니다.</p>
            </article>
          </section>

          <section className="report-section mt-10 grid gap-5 md:grid-cols-[0.95fr_1.05fr]">
            <article className="border border-[var(--border)] p-6">
              <CircleAlert className="h-5 w-5 text-[var(--warning)]" />
              <h2 className="mt-5 text-2xl font-semibold tracking-[-0.04em]">일반 위험신호 예시</h2>
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
