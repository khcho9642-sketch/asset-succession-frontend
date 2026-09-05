"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ASSESSMENT_STORAGE_KEY, createAssessmentId } from "@/lib/assessment";
import { simulationDisclaimer, wizardSteps } from "@/lib/mockData";

type WizardAnswers = Record<string, { choices: string[]; detail: string; facts?: Record<string, string>; assetAmounts?: Record<string, string> }>;

function getInitialStep() {
  return 0;
}

export function PrecheckWizard() {
  const router = useRouter();
  const [activeStep, setActiveStep] = useState(0);
  const [answers, setAnswers] = useState<WizardAnswers>({});
  const [showError, setShowError] = useState(false);
  const step = wizardSteps[activeStep];
  const currentAnswer = answers[step.key] ?? { choices: [], detail: "" };
  const progress = ((activeStep + 1) / wizardSteps.length) * 100;
  const isMultiSelectStep = step.key === "debt";
  const isAssetStep = step.key === "assets";

  const summary = useMemo(
    () =>
      wizardSteps.map((item) => ({
        label: item.label,
        choice: answers[item.key]?.choices.join(", ") || "미선택",
        detail: answers[item.key]?.detail || ""
      })),
    [answers]
  );

  useEffect(() => {
    setActiveStep(getInitialStep());
  }, []);

  function isStepComplete(index: number) {
    const item = wizardSteps[index];
    const answer = answers[item.key];
    if (!answer || answer.choices.length === 0) return false;
    if (item.key === "family") {
      return Boolean(answer.facts?.["배우자 유무"] && answer.facts?.["성년 자녀 수"] && answer.facts?.["미성년 자녀 수"]);
    }
    if (item.key === "assets") {
      return answer.choices.every((choice) => Boolean(answer.assetAmounts?.[choice]?.trim()));
    }
    return true;
  }

  function isStepUnlocked(index: number) {
    if (index <= activeStep) return true;
    return wizardSteps.slice(0, index).every((_, priorIndex) => isStepComplete(priorIndex));
  }

  function moveToStep(index: number) {
    if (!isStepUnlocked(index)) {
      setShowError(true);
      return;
    }
    setShowError(false);
    setActiveStep(index);
  }

  function updateChoice(choice: string) {
    setShowError(false);
    if (isMultiSelectStep || isAssetStep) {
      setAnswers((prev) => {
        const existing = prev[step.key] ?? { choices: [], detail: "" };
        const exclusive = isMultiSelectStep && (choice === "해당 없음" || choice === "잘 모르겠음");
        const nextChoices = exclusive
          ? existing.choices.includes(choice) ? [] : [choice]
          : existing.choices.includes(choice)
            ? existing.choices.filter((item) => item !== choice)
            : [...existing.choices.filter((item) => item !== "해당 없음" && item !== "잘 모르겠음"), choice];

        return {
          ...prev,
          [step.key]: {
            ...existing,
            choices: nextChoices,
            assetAmounts: Object.fromEntries(
              Object.entries(existing.assetAmounts ?? {}).filter(([key]) => nextChoices.includes(key))
            )
          }
        };
      });
      return;
    }

    setAnswers((prev) => ({
      ...prev,
      [step.key]: { ...currentAnswer, choices: [choice] }
    }));
  }

  function updateDetail(detail: string) {
    setAnswers((prev) => ({
      ...prev,
      [step.key]: { ...currentAnswer, detail }
    }));
  }

  function updateFact(label: string, value: string) {
    setShowError(false);
    setAnswers((prev) => ({
      ...prev,
      [step.key]: {
        ...currentAnswer,
        facts: { ...(currentAnswer.facts ?? {}), [label]: value }
      }
    }));
  }

  function updateAssetAmount(asset: string, value: string) {
    setShowError(false);
    setAnswers((prev) => ({
      ...prev,
      [step.key]: {
        ...currentAnswer,
        assetAmounts: { ...(currentAnswer.assetAmounts ?? {}), [asset]: value }
      }
    }));
  }

  function goNext() {
    if (!isStepComplete(activeStep)) {
      setShowError(true);
      return;
    }
    setShowError(false);
    setActiveStep((value) => Math.min(value + 1, wizardSteps.length - 1));
  }

  function showResult() {
    if (!isStepComplete(activeStep)) {
      setShowError(true);
      return;
    }
    const snapshot = {
      assessment_id: createAssessmentId(),
      created_at: new Date().toISOString(),
      review_focus: currentAnswer.choices,
      answers: Object.fromEntries(
        wizardSteps.map((item) => [
          item.key,
          {
            label: item.label,
            choices: answers[item.key]?.choices ?? [],
            detail: answers[item.key]?.detail ?? "",
            facts: answers[item.key]?.facts,
            assetAmounts: answers[item.key]?.assetAmounts
          }
        ])
      )
    };
    window.sessionStorage.setItem(ASSESSMENT_STORAGE_KEY, JSON.stringify(snapshot));
    setShowError(false);
    router.push(`/precheck/result?assessment_id=${encodeURIComponent(snapshot.assessment_id)}`);
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
              onClick={() => moveToStep(index)}
              disabled={!isStepUnlocked(index)}
              className={`flex items-center gap-3 border px-4 py-3 text-left transition ${
                index <= activeStep ? "border-[var(--gold)] bg-[var(--ivory)]" : "border-[var(--border)]"
              }`}
              aria-current={index === activeStep ? "step" : undefined}
              aria-disabled={!isStepUnlocked(index)}
            >
              <span
                className={`flex h-7 w-7 items-center justify-center text-xs font-semibold ${
                  answers[item.key]?.choices.length ? "bg-[var(--success)] text-white" : "bg-white text-[var(--navy-950)]"
                }`}
              >
                {answers[item.key]?.choices.length ? <Check className="h-4 w-4" /> : index + 1}
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
            <div className="mt-3 grid gap-3 sm:grid-cols-2" role={isMultiSelectStep || isAssetStep ? "group" : "radiogroup"} aria-label={step.primaryQuestion}>
              {step.choices.map((choice) => {
                const selected = currentAnswer.choices.includes(choice);
                return (
                <button
                  key={choice}
                  type="button"
                  role={isMultiSelectStep || isAssetStep ? "checkbox" : "radio"}
                  aria-checked={selected}
                  aria-pressed={selected}
                  onClick={() => updateChoice(choice)}
                  className={`flex items-center justify-between border px-5 py-4 text-left text-sm font-semibold transition ${
                    selected
                      ? "border-[var(--gold)] bg-[var(--ivory)] text-[var(--navy-950)]"
                      : "border-[var(--border)] hover:border-[var(--gold)]"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    {isMultiSelectStep || isAssetStep ? (
                      <span className={`flex h-5 w-5 items-center justify-center border ${selected ? "border-[var(--gold)] bg-[var(--gold)] text-white" : "border-[var(--border)] bg-white"}`}>
                        {selected ? <Check className="h-3 w-3" /> : null}
                      </span>
                    ) : null}
                    {choice}
                  </span>
                  <ChevronRight className="h-4 w-4 text-[var(--gold)]" />
                </button>
                );
              })}
            </div>
          </fieldset>

          {step.key === "family" ? (
            <div className="grid gap-4 md:grid-cols-3">
              {[
                ["배우자 유무", ["있음", "없음"]],
                ["성년 자녀 수", ["0명", "1명", "2명", "3명 이상"]],
                ["미성년 자녀 수", ["0명", "1명", "2명 이상"]]
              ].map(([label, options]) => (
                <label key={label as string} className="grid gap-2">
                  <span className="text-sm font-semibold text-[var(--text)]">{label as string}</span>
                  <select
                    aria-label={label as string}
                    className="border border-[var(--border)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--gold)]"
                    value={currentAnswer.facts?.[label as string] ?? ""}
                    onChange={(event) => updateFact(label as string, event.target.value)}
                  >
                    <option value="">선택</option>
                    {(options as string[]).map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          ) : null}

          {isAssetStep && currentAnswer.choices.length > 0 ? (
            <div className="grid gap-3">
              <p className="text-sm font-semibold text-[var(--text)]">선택 자산별 대략 금액</p>
              <div className="grid gap-3 md:grid-cols-2">
                {currentAnswer.choices.map((asset) => (
                  <label key={asset} className="grid gap-2">
                    <span className="text-sm text-[var(--muted)]">{asset}</span>
                    <input
                      className="border border-[var(--border)] bg-[var(--ivory)] px-5 py-4 text-base outline-none focus:border-[var(--gold)]"
                      value={currentAnswer.assetAmounts?.[asset] ?? ""}
                      onChange={(event) => updateAssetAmount(asset, event.target.value)}
                      placeholder={`${asset} 예: 20억`}
                    />
                  </label>
                ))}
              </div>
            </div>
          ) : null}

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
              현재 단계의 필수 항목을 입력해야 다음 단계 또는 결과로 이동할 수 있습니다.
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
            <button type="button" onClick={showResult} className="inline-flex items-center gap-3 bg-[var(--navy-950)] px-6 py-4 text-sm font-semibold text-white">
              결과 보기 <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button type="button" onClick={goNext} className="inline-flex items-center gap-3 bg-[var(--navy-950)] px-6 py-4 text-sm font-semibold text-white">
              다음 <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mt-6 text-xs text-[var(--muted)]">{simulationDisclaimer}</p>
      </section>
    </section>
  );
}
