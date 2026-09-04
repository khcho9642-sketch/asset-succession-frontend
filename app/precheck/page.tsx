import Link from "next/link";
import { ArrowRight, Check, ChevronRight } from "lucide-react";
import { PublicLightNav } from "@/components/PublicLightNav";
import { wizardSteps, prototypeDisclaimer } from "@/lib/mockData";

const activeStep = 1;

export default function PrecheckPage() {
  const step = wizardSteps[activeStep];

  return (
    <main className="min-h-screen bg-[var(--background)]">
      <PublicLightNav />
      <section className="mx-auto grid max-w-7xl gap-10 px-6 py-12 lg:grid-cols-[0.78fr_1.22fr] lg:px-8 lg:py-18">
        <aside className="border border-[var(--border)] bg-white p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">무료 사전진단</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.05em] text-[var(--navy-950)]">
            신고서가 아니라 상담을 시작하는 질문입니다.
          </h1>
          <p className="mt-4 text-base leading-7 text-[var(--muted)]">
            금액은 억 원 단위로, 주소는 시·군·구 수준까지만. 세법 용어를 몰라도 답할 수 있게 구성했습니다.
          </p>
          <div className="mt-8 grid gap-3">
            {wizardSteps.map((item, index) => (
              <div key={item.label} className={`flex items-center gap-3 border px-4 py-3 ${index <= activeStep ? "border-[var(--gold)] bg-[var(--ivory)]" : "border-[var(--border)]"}`}>
                <span className={`flex h-7 w-7 items-center justify-center text-xs font-semibold ${index < activeStep ? "bg-[var(--success)] text-white" : "bg-white text-[var(--navy-950)]"}`}>
                  {index < activeStep ? <Check className="h-4 w-4" /> : index + 1}
                </span>
                <span className="text-sm font-semibold">{item.label}</span>
              </div>
            ))}
          </div>
        </aside>

        <section className="border border-[var(--border)] bg-white p-6 md:p-10">
          <div className="h-1 bg-[var(--border)]">
            <div className="h-1 bg-[var(--gold)]" style={{ width: `${((activeStep + 1) / wizardSteps.length) * 100}%` }} />
          </div>
          <p className="mt-10 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">{step.eyebrow}</p>
          <h2 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight tracking-[-0.05em] text-[var(--navy-950)]">
            {step.title}
          </h2>
          <div className="mt-8 grid gap-5">
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[var(--text)]">대표 자산 유형</span>
              <div className="grid gap-3 sm:grid-cols-2">
                {step.questions.map((question) => (
                  <button key={question} type="button" className="flex items-center justify-between border border-[var(--border)] px-5 py-4 text-left text-sm font-semibold transition hover:border-[var(--gold)] hover:bg-[var(--ivory)]">
                    {question}
                    <ChevronRight className="h-4 w-4 text-[var(--gold)]" />
                  </button>
                ))}
              </div>
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[var(--text)]">대략적인 금액대</span>
              <div className="flex items-center border border-[var(--border)] bg-[var(--ivory)] px-5 py-4">
                <input className="w-full bg-transparent text-2xl font-semibold outline-none" defaultValue="55" aria-label="대략적인 금액대" />
                <span className="text-sm font-semibold text-[var(--muted)]">억 원</span>
              </div>
            </label>
            <div className="border-l-2 border-[var(--warning)] bg-[#fff8ee] p-5">
              <p className="text-sm font-semibold text-[var(--warning)]">Warning</p>
              <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                상세주소, 민감 식별정보, 계좌번호, 실제 증빙은 이 단계에서 입력하지 않습니다.
              </p>
            </div>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
            <p className="text-xs text-[var(--muted)]">{prototypeDisclaimer}</p>
            <Link href="/precheck/result" className="inline-flex items-center gap-3 bg-[var(--navy-950)] px-6 py-4 text-sm font-semibold text-white">
              결과 준비로 이동 <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
