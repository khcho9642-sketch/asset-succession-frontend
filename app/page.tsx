import Link from "next/link";
import { ArrowRight, FileText, ShieldCheck } from "lucide-react";
import { PublicNav } from "@/components/PublicNav";
import { flowSteps, publicValuePoints, strategyBranches, simulationDisclaimer } from "@/lib/mockData";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[var(--background)]">
      <section className="hero-light relative min-h-[92vh] overflow-hidden text-white">
        <PublicNav />
        <div className="mx-auto grid min-h-[92vh] max-w-7xl items-center gap-14 px-6 pb-20 pt-32 lg:grid-cols-[1.04fr_0.96fr] lg:px-8">
          <div>
            <p className="text-sm font-semibold tracking-[0.08em] text-[var(--gold)]">자산승계 사전진단</p>
            <h1 className="mt-7 max-w-4xl text-[2.55rem] font-semibold leading-[1.04] tracking-[-0.065em] sm:text-[3.15rem] md:text-[5rem]">
              우리 가족의 자산, 어떤 방식으로 남기는 것이 좋을까요?
            </h1>
            <p className="mt-7 max-w-[calc(100vw-3rem)] text-lg leading-8 text-white/72 md:max-w-2xl md:text-xl">
              <span className="block">상속·증여·매각·가족법인·보험 활용까지</span>
              <span className="block">가능한 자산승계 시나리오를 한 번에 비교합니다.</span>
            </p>
            <p className="mt-4 max-w-2xl border-l border-[var(--gold)]/60 pl-4 text-sm leading-7 text-white/70">
              세액 확정 화면이 아니라, 가족 회의 전에 “어떤 선택지를 더 깊게 검토할지” 정리하는 비교 기준입니다.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link href="/precheck" className="inline-flex items-center gap-3 bg-white px-5 py-4 text-sm font-semibold text-[var(--navy-950)] transition hover:bg-[var(--ivory)] sm:px-6">
                무료 자산승계 진단 시작
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/precheck/result" className="inline-flex items-center gap-3 border border-white/20 px-5 py-4 text-sm font-semibold text-white/85 transition hover:border-white/50 sm:px-6">
                보고서 예시 보기
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

          <div className="relative hidden md:block">
            <div className="border border-white/12 bg-white/[0.04] p-5 backdrop-blur">
              <div className="border border-white/10 bg-[var(--navy-950)]/70 p-6">
                <p className="text-xs font-semibold tracking-[0.08em] text-[var(--gold)]">7가지 승계지도</p>
                <div className="mt-6 grid gap-3">
                  {strategyBranches.map((strategy, index) => {
                    const Icon = strategy.icon;
                    return (
                      <div key={strategy.name} className="flex items-center gap-4 border border-white/10 bg-white/[0.035] p-4">
                        <span className="flex h-9 w-9 items-center justify-center border border-[var(--gold)]/45 text-[var(--gold)]">
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">{strategy.name}</p>
                          <p className="mt-1 text-xs text-white/68">{strategy.description}</p>
                        </div>
                        <span className="text-xs text-white/38">0{index + 1}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="premium-light px-6 py-24 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--gold)]">What you compare</p>
              <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.05em] text-[var(--navy-950)] md:text-5xl">
                한 번의 입력으로 여러 전략을 같은 기준에서 봅니다.
              </h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {flowSteps.map((step, index) => (
                <article key={step.title} className="border border-[var(--border)] bg-white p-6">
                  <span className="text-sm font-semibold text-[var(--gold)]">{String(index + 1).padStart(2, "0")}</span>
                  <h3 className="mt-6 text-xl font-semibold tracking-[-0.03em]">{step.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{step.body}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="mt-16 grid gap-5 lg:grid-cols-3">
            <article className="border border-[var(--border)] bg-white p-7">
              <FileText className="h-6 w-6 text-[var(--gold)]" />
              <h3 className="mt-8 text-2xl font-semibold tracking-[-0.04em]">무료 보고서 예시</h3>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">전략별 장단점, 필요 현금, 가족별 이전 결과, 주요 검토사항을 요약합니다.</p>
            </article>
            <article className="border border-[var(--border)] bg-white p-7">
              <ShieldCheck className="h-6 w-6 text-[var(--gold)]" />
              <h3 className="mt-8 text-2xl font-semibold tracking-[-0.04em]">확정 세액 아님</h3>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">사전진단 결과는 입력 정보 기준 추정이며, 실제 신고 전에는 전문가 검토가 필요합니다.</p>
            </article>
            <article className="border border-[var(--border)] bg-[var(--navy-950)] p-7 text-white">
              <h3 className="text-2xl font-semibold tracking-[-0.04em]">정밀상담 연결</h3>
              <p className="mt-3 text-sm leading-7 text-white/65">입력한 내용을 다시 작성하지 않고 조경호 회계사 상담 신청으로 이어집니다.</p>
              <Link href="/consultation" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-[var(--gold)]">
                상담 신청하기 <ArrowRight className="h-4 w-4" />
              </Link>
            </article>
          </div>
          <p className="mt-8 text-xs text-[var(--muted)]">{simulationDisclaimer}</p>
        </div>
      </section>
    </main>
  );
}
