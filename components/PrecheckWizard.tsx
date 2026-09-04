"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { prototypeDisclaimer, wizardSteps } from "@/lib/mockData";

type WizardAnswers = Record<string, { choice: string; detail: string }>;

function getInitialStep() {
  if (typeof window === "undefined") return 0;
  const requestedStep = Number(new URLSearchParams(window.location.search).get("step"));
  if (!Number.isInteger(requestedStep)) return 0;
  return Math.max(0, Math.min(requestedStep - 1, wizardSteps.length - 1));
}

export function PrecheckWizard() {
  const [activeStep, setActiveStep] = useState(0);
  const [answers, setAnswers] = useState<WizardAnswers>({});
  const [showError, setShowError] = useState(false);
  const step = wizardSteps[activeStep];
  const currentAnswer = answers[step.key] ?? { choice: "", detail: "" };
  const progress = ((activeStep + 1) / wizardSteps.length) * 100;

  const summary = useMemo(
    () =>
      wizardSteps.map((item) => ({
        label: item.label,
        choice: answers[item.key]?.choice || "미선택",
        detail: answers[item.key]?.detail || ""
      })),
    [answers]
  );

  useEffect(() => {
    setActiveStep(getInitialStep());
  }, []);

  function updateChoice(choice: string) {
    setShowError(false);
    setAnswers((prev) => ({
      ...prev,
      [step.key]: { ...currentAnswer, choice }
    }));
  }

  function updateDetail(detail: string) {
    setAnswers((prev) => ({
      ...prev,
      [step.key]: { ...currentAnswer, detail }
    }));
  }

  function goNext() {
    if (!currentAnswer.choice) {
      setShowError(true);
      return;
    }
    setShowError(false);
    setActiveStep((value) => Math.min(value + 1, wizardSteps.length - 1));
  }

  return (
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
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveStep(index)}
              className={`flex items-center gap-3 border px-4 py-3 text-left transition ${
                index <= activeStep ? "border-[var(--gold)] bg-[var(--ivory)]" : "border-[var(--border)]"
              }`}
              aria-current={index === activeStep ? "step" : undefined}
            >
              <span
                className={`flex h-7 w-7 items-center justify-center text-xs font-semibold ${
                  answers[item.key]?.choice ? "bg-[var(--success)] text-white" : "bg-white text-[var(--navy-950)]"
                }`}
              >
                {answers[item.key]?.choice ? <Check className="h-4 w-4" /> : index + 1}
              </span>
              <span className="text-sm font-semibold">{item.label}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="border border-[var(--border)] bg-white p-6 md:p-10">
        <div className="h-1 bg-[var(--border)]">
          <div className="h-1 bg-[var(--gold)] transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-10 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">{step.eyebrow}</p>
        <h2 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight tracking-[-0.05em] text-[var(--navy-950)]">
          {step.title}
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--muted)]">{step.helper}</p>

        <div className="mt-8 grid gap-6">
          <fieldset>
            <legend className="text-sm font-semibold text-[var(--text)]">{step.primaryQuestion}</legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {step.choices.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  onClick={() => updateChoice(choice)}
                  className={`flex items-center justify-between border px-5 py-4 text-left text-sm font-semibold transition ${
                    currentAnswer.choice === choice
                      ? "border-[var(--gold)] bg-[var(--ivory)] text-[var(--navy-950)]"
                      : "border-[var(--border)] hover:border-[var(--gold)]"
                  }`}
                >
                  {choice}
                  <ChevronRight className="h-4 w-4 text-[var(--gold)]" />
                </button>
              ))}
            </div>
          </fieldset>

          {step.secondaryQuestion ? (
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[var(--text)]">{step.secondaryQuestion}</span>
              <input
                className="border border-[var(--border)] bg-[var(--ivory)] px-5 py-4 text-base outline-none focus:border-[var(--gold)]"
                value={currentAnswer.detail}
                onChange={(event) => updateDetail(event.target.value)}
                placeholder={step.secondaryPlaceholder}
              />
            </label>
          ) : null}

          {activeStep === wizardSteps.length - 1 ? (
            <div className="border border-[var(--border)] bg-[var(--ivory)] p-5">
              <p className="text-sm font-semibold text-[var(--navy-950)]">선택값 요약</p>
              <dl className="mt-4 grid gap-3 text-sm">
                {summary.map((item) => (
                  <div key={item.label} className="grid gap-1 border-b border-[var(--border)] pb-3 sm:grid-cols-[8rem_1fr]">
                    <dt className="text-[var(--muted)]">{item.label}</dt>
                    <dd className="font-semibold text-[var(--text)]">
                      {item.choice}
                      {item.detail ? <span className="ml-2 font-normal text-[var(--muted)]">· {item.detail}</span> : null}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          {showError ? (
            <p className="border-l-2 border-[var(--warning)] bg-[#fff8ee] p-4 text-sm text-[var(--warning)]">
              현재 단계의 선택지를 하나 골라야 다음 단계로 이동할 수 있습니다.
            </p>
          ) : null}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setActiveStep((value) => Math.max(value - 1, 0))}
            disabled={activeStep === 0}
            className="inline-flex items-center gap-2 border border-[var(--border)] px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" /> 이전
          </button>
          {activeStep === wizardSteps.length - 1 ? (
            <Link href="/precheck/result" className="inline-flex items-center gap-3 bg-[var(--navy-950)] px-6 py-4 text-sm font-semibold text-white">
              결과 보기 <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <button type="button" onClick={goNext} className="inline-flex items-center gap-3 bg-[var(--navy-950)] px-6 py-4 text-sm font-semibold text-white">
              다음 <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mt-6 text-xs text-[var(--muted)]">{prototypeDisclaimer}</p>
      </section>
    </section>
  );
}
