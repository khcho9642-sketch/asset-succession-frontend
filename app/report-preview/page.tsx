import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PublicLightNav } from "@/components/PublicLightNav";
import { PrintButton } from "@/components/PrintButton";
import { StrategyComparison } from "@/components/StrategyComparison";

export default function ReportPreviewPage() {
  return (
    <main className="min-h-screen bg-[var(--background)]">
      <PublicLightNav />
      <section className="mx-auto max-w-5xl px-6 py-12 lg:px-8">
        <Link href="/precheck/result" className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--navy-900)]">
          <ArrowLeft className="h-4 w-4" /> 결과 비교로 돌아가기
        </Link>
        <article className="mt-8 border border-[var(--border)] bg-white p-7 md:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">Sample report</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.055em] text-[var(--navy-950)]">무료 자산승계 사전진단 보고서</h1>
          <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
            이 보고서는 합성 입력값으로 구성한 정적 미리보기입니다. 브라우저 인쇄 기능으로 PDF 저장을 실행할 수 있습니다.
          </p>
          <PrintButton />
          <p className="mt-3 text-xs text-[var(--muted)] print:hidden">단축키 Ctrl+P 또는 브라우저 메뉴에서 PDF 저장을 선택합니다.</p>
          <div className="mt-10">
            <StrategyComparison />
          </div>
        </article>
      </section>
    </main>
  );
}
