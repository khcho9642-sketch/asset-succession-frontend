import Link from "next/link";
import { ArrowRight, FileText, LockKeyhole } from "lucide-react";
import { AssessmentMetrics } from "@/components/AssessmentMetrics";
import { AssessmentSummary } from "@/components/AssessmentSummary";
import { PublicLightNav } from "@/components/PublicLightNav";
import { ScenarioPlanPanel } from "@/components/ScenarioPlanPanel";

export default function ResultPage() {
  return (
    <main className="min-h-screen bg-[var(--background)]">
      <PublicLightNav />
      <section className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="motion-result-stage">
            <p className="text-sm font-semibold tracking-[0.08em] text-[var(--gold)]">사전진단 결과</p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.055em] text-[var(--navy-950)] md:text-6xl">
              입력 요약과 선별된 검토 후보입니다.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--muted)]">
              확정 세액이 아니라 가족 회의와 전문가 상담을 위한 비교표입니다. 입력 자산 합계는 사전진단에서 가져오고, 지금 필요한 기준안·추천안·보완안만 보여드립니다.
            </p>
          </div>
          <div className="motion-result-stage grid gap-4" style={{ animationDelay: "90ms" }}>
            <AssessmentMetrics />
            <div className="grid gap-4 sm:grid-cols-2">
              <article className="motion-result-stage border border-[var(--border)] bg-white p-5" style={{ animationDelay: "230ms" }}>
                <p className="text-sm text-[var(--muted)]">AI 추천 시나리오</p>
                <strong className="mt-3 block text-3xl tracking-[-0.06em] text-[var(--navy-950)]">최대 3개</strong>
              </article>
              <article className="motion-result-stage border border-[var(--border)] bg-white p-5" style={{ animationDelay: "300ms" }}>
                <p className="text-sm text-[var(--muted)]">36개 후보 분석</p>
                <strong className="mt-3 block text-3xl tracking-[-0.06em] text-[var(--navy-950)]">완료</strong>
              </article>
            </div>
          </div>
        </div>

        <div className="motion-result-stage mt-8" style={{ animationDelay: "180ms" }}>
          <AssessmentSummary />
        </div>

        <div className="motion-result-stage mt-8" style={{ animationDelay: "260ms" }}>
          <ScenarioPlanPanel />
        </div>

        <section className="motion-result-stage mt-12 grid gap-4 lg:grid-cols-3" style={{ animationDelay: "420ms" }}>
          <article className="motion-recommendation-card border border-[var(--border)] bg-white p-6">
            <p className="text-sm font-semibold text-[var(--gold)]">먼저 볼 기준</p>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.04em]">납부재원 부족액</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">세금 총액보다 실제 현금으로 준비해야 할 부족분을 먼저 확인합니다.</p>
          </article>
          <article className="motion-recommendation-card border border-[var(--border)] bg-white p-6" style={{ animationDelay: "70ms" }}>
            <p className="text-sm font-semibold text-[var(--gold)]">일반 검토 예시</p>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.04em]">부담부증여·가족법인</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">채무승계 증빙과 지분평가 기준이 확인되어야 비교가 의미 있습니다.</p>
          </article>
          <article className="motion-recommendation-card border border-[var(--border)] bg-[var(--navy-950)] p-6 text-white" style={{ animationDelay: "140ms" }}>
            <p className="text-sm font-semibold text-[var(--gold)]">다음 행동</p>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.04em]">가족 회의용 공유</h2>
            <p className="mt-3 text-sm leading-7 text-white/68">개인정보 없이 같은 가정과 비교표만 보고, 상담 전 질문을 정리합니다.</p>
          </article>
        </section>

        <div className="motion-result-stage mt-12 flex flex-wrap items-center gap-4 border border-[var(--border)] bg-[var(--navy-950)] p-6 text-white" style={{ animationDelay: "520ms" }}>
          <LockKeyhole className="h-5 w-5 text-[var(--gold)]" />
          <p className="flex-1 text-sm leading-6 text-white/70">본 결과는 입력 스냅샷을 바탕으로 상담 쟁점을 정리한 화면이며 확정 세액이 아닙니다.</p>
          <Link href="/report-preview" className="motion-press inline-flex items-center gap-2 bg-white px-5 py-3 text-sm font-semibold text-[var(--navy-950)]">
            <FileText className="h-4 w-4" /> 무료 보고서 미리보기
          </Link>
          <Link href="/consultation" className="motion-press inline-flex items-center gap-2 border border-white/20 px-5 py-3 text-sm font-semibold text-white">
            이 결과로 전문가 상담 신청하기 <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}
