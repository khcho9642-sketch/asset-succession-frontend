import Link from "next/link";
import { ArrowRight, FileText, Gauge, ShieldCheck, Sparkles } from "lucide-react";
import { HeroPaperCarousel } from "@/components/HeroPaperCarousel";
import { PublicNav } from "@/components/PublicNav";
import { flowSteps, simulationDisclaimer } from "@/lib/mockData";

const differentiators = [
  { title: "36개 전략 비교", body: "상속·증여·양도·가업승계 후보를 내부에서 비교합니다.", icon: Sparkles },
  { title: "맞춤 보고서 제공", body: "가족회의 전에 볼 핵심 추천안과 그래프를 7페이지로 정리합니다.", icon: FileText },
  { title: "전문가 공동 검토", body: "상담 단계에서 세무전문가와 회계사가 실행 가능성을 함께 봅니다.", icon: ShieldCheck }
];

const customerValues = [
  { title: "고객 이익 최우선", body: "특정 상품보다 고객과 가족에게 유리한 방법을 먼저 검토합니다." },
  { title: "AI 기반 정밀 분석", body: "가족관계·자산구성·증여이력·납부재원을 빠르게 종합 분석합니다." },
  { title: "신속한 실행과 합리적인 비용", body: "AI로 분석 시간을 줄여 더 빠르고 효율적인 컨설팅을 제공합니다." }
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[var(--background)]">
      <section className="paper-hero relative overflow-hidden bg-[#EFEAE0] text-[#26221B]">
        <PublicNav />
        <div className="mx-auto grid min-h-[700px] max-w-7xl items-start gap-9 px-5 pb-6 pt-24 sm:px-6 md:pb-10 lg:grid-cols-[1.16fr_0.84fr] lg:px-8 lg:pt-28">
          <div className="motion-result-stage max-w-3xl">
            <p className="inline-flex border border-[#B23A2A]/24 bg-[#F8F4EA] px-3 py-2 text-xs font-bold tracking-[0.18em] text-[#B23A2A]">
              AI × 세무전문가 자산승계 진단
            </p>
            <h1 className="mt-6 text-[1.86rem] font-semibold leading-[1.08] tracking-[-0.085em] text-[#26221B] sm:text-[3rem] md:text-[3.4rem] lg:text-[3.6rem]">
              <span className="block whitespace-nowrap">막막한 자산승계,</span>
              <span className="block whitespace-nowrap">우리 가족의 3가지 전략부터.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#6B6152] md:text-xl">
              <span className="block">양도·상속·증여·가업승계까지,</span>
              <span className="block">AI가 36개 전략 후보를 비교합니다.</span>
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="/precheck" className="motion-press inline-flex min-h-12 items-center justify-center gap-3 bg-[#B23A2A] px-5 py-4 text-[15px] font-semibold text-white transition hover:bg-[#9F2F22] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#B23A2A] sm:px-6">
                무료 AI 사전진단 시작하기
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/precheck/result?demo=1" className="motion-press inline-flex min-h-12 items-center justify-center border border-[#7A6139]/35 bg-[#F8F4EA] px-5 py-4 text-[15px] font-semibold text-[#26221B] transition hover:border-[#B23A2A] hover:text-[#B23A2A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#B23A2A] sm:px-6">
                샘플 보고서 보기
              </Link>
            </div>
            <p className="mt-4 text-sm font-semibold text-[#6B6152]">약 5분 · 결과 즉시 확인</p>
          </div>

          <HeroPaperCarousel />
        </div>
        <div className="mx-auto max-w-7xl px-5 pb-8 sm:px-6 lg:px-8">
          <div className="border-y border-[#D7CDBD] py-4 text-center text-sm font-semibold text-[#6B6152]">
            36개 전략 비교 · 세무전문가·회계사 검토 · 합리적인 비용
          </div>
        </div>
      </section>

      <section className="premium-light px-6 py-24 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--gold)]">What you compare</p>
              <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.05em] text-[var(--navy-950)] md:text-5xl">
                전문가의 경험에 AI의 속도를 더했습니다
              </h2>
              <p className="mt-5 text-base leading-8 text-[var(--muted)]">
                AI가 36개 자산승계 전략을 비교하고, 전문상담 단계에서는 국세청 20년 경력 세무전문가와 회계사가 핵심 대안을 검토합니다.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {differentiators.map((item) => (
                <article key={item.title} className="border border-[var(--border)] bg-white p-6">
                  <item.icon className="h-6 w-6 text-[var(--gold)]" />
                  <h3 className="mt-7 text-xl font-semibold tracking-[-0.03em]">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{item.body}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="mt-14 border border-[var(--border)] bg-white p-6 md:p-8">
            <div className="grid gap-4 md:grid-cols-5">
              {flowSteps.map((step, index) => (
                <article key={step.title} className="border-l border-[var(--border)] pl-5 first:border-l-0 first:pl-0 md:min-h-28">
                  <span className="text-xs font-semibold text-[var(--gold)]">{String(index + 1).padStart(2, "0")}</span>
                  <h3 className="mt-3 text-base font-semibold tracking-[-0.03em] text-[var(--navy-950)]">{step.title}</h3>
                  <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{step.body}</p>
                </article>
              ))}
              <article className="border-l border-[var(--border)] pl-5 md:min-h-28">
                <span className="text-xs font-semibold text-[var(--gold)]">05</span>
                <h3 className="mt-3 text-base font-semibold tracking-[-0.03em] text-[var(--navy-950)]">전문가 검토와 실행</h3>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">확정 신고 전 쟁점과 실행 가능성을 전문가가 다시 확인합니다.</p>
              </article>
            </div>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {customerValues.map((item, index) => (
              <article key={item.title} className={`border border-[var(--border)] p-7 ${index === 2 ? "bg-[var(--navy-950)] text-white" : "bg-white"}`}>
                <Gauge className="h-6 w-6 text-[var(--gold)]" />
                <h3 className="mt-8 text-2xl font-semibold tracking-[-0.04em]">{item.title}</h3>
                <p className={`mt-3 text-sm leading-7 ${index === 2 ? "text-white/65" : "text-[var(--muted)]"}`}>{item.body}</p>
              </article>
            ))}
          </div>
          <p className="mt-8 text-xs text-[var(--muted)]">{simulationDisclaimer}</p>
        </div>
      </section>
    </main>
  );
}
