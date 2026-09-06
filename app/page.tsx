import Link from "next/link";
import { ArrowRight, FileText, Gauge, ShieldCheck, Sparkles } from "lucide-react";
import { HeroVideoCard } from "@/components/HeroVideoCard";
import { PublicNav } from "@/components/PublicNav";
import { flowSteps, publicValuePoints, simulationDisclaimer } from "@/lib/mockData";

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
      <section className="hero-light relative min-h-[92vh] overflow-hidden text-white">
        <PublicNav />
        <div className="mx-auto grid min-h-[92vh] max-w-7xl items-center gap-10 px-6 pb-16 pt-28 lg:grid-cols-[1.04fr_0.96fr] lg:px-8 lg:pt-28">
          <div className="motion-result-stage">
            <p className="text-sm font-semibold tracking-[0.16em] text-[var(--gold)]">ASSET SUCCESSION 360</p>
            <h1 className="mt-6 max-w-4xl text-[2.35rem] font-semibold leading-[1.04] tracking-[-0.065em] sm:text-[2.65rem] md:text-[3.9rem]">
              <span className="block">우리 가족의 자산승계,</span>
              <span className="block">AI에게 무료로 물어보세요.</span>
            </h1>
            <p className="mt-7 max-w-[calc(100vw-3rem)] text-[1.06rem] leading-8 text-white/74 md:max-w-2xl md:text-[1.18rem]">
              AI가 36개 자산승계 전략 후보를 비교해 우리 가족에게 필요한 핵심 대안을 선별합니다.
            </p>
            <p className="mt-4 max-w-2xl border-l border-[var(--gold)]/60 pl-4 text-sm leading-7 text-white/70">
              전문상담 단계에서는 국세청 20년 경력 세무전문가와 회계사가 중요한 세무 쟁점과 실행 가능성을 함께 검토합니다.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link href="/precheck" className="motion-press inline-flex min-h-12 items-center gap-3 bg-white px-5 py-4 text-[15px] font-semibold text-[var(--navy-950)] transition hover:bg-[var(--ivory)] sm:px-6">
                AI 무료 사전진단 시작하기
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/precheck/result?demo=1" className="motion-press inline-flex min-h-12 items-center gap-3 border border-white/20 px-5 py-4 text-[15px] font-semibold text-white/85 transition hover:border-white/50 sm:px-6">
                샘플 보고서 보기
              </Link>
            </div>
            <div className="mt-7 flex flex-wrap gap-3 text-sm text-white/68">
              {publicValuePoints.map((point) => (
                <span key={point} className="border border-white/15 px-3 py-2">
                  {point}
                </span>
              ))}
            </div>
          </div>

          <HeroVideoCard />
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
