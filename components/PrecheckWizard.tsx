"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ASSESSMENT_STORAGE_KEY, createAssessmentId, formatAnswer, normalizeEokAmount, parseEokAmount } from "@/lib/assessment";
import { simulationDisclaimer, wizardSteps } from "@/lib/mockData";
import { parseConversationalInput } from "@/lib/phase2b/conversation";
import type { ConversationCandidateFact, ConversationParseResult } from "@/lib/phase2b/conversation";

type WizardAnswers = Record<string, { choices: string[]; detail: string; facts?: Record<string, string>; assetAmounts?: Record<string, string>; debtAmounts?: Record<string, string> }>;
type ConversationMessage = { role: "user" | "assistant"; text: string; created_at: string };

function getInitialStep() {
  return 0;
}

export function PrecheckWizard() {
  const router = useRouter();
  const [activeStep, setActiveStep] = useState(0);
  const [answers, setAnswers] = useState<WizardAnswers>({});
  const [showError, setShowError] = useState(false);
  const [directInput, setDirectInput] = useState("");
  const [candidate, setCandidate] = useState<ConversationParseResult | null>(null);
  const [confirmedFacts, setConfirmedFacts] = useState<ConversationCandidateFact[]>([]);
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>([]);
  const step = wizardSteps[activeStep];
  const currentAnswer = answers[step.key] ?? { choices: [], detail: "" };
  const progress = ((activeStep + 1) / wizardSteps.length) * 100;
  const isMultiSelectStep = step.key === "debt";
  const isAssetStep = step.key === "assets";
  const isDebtStep = step.key === "debt";

  const summary = useMemo(
    () =>
      wizardSteps.map((item) => ({
        label: item.label,
        value: formatAnswer(answers[item.key])
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
      return answer.choices.every((choice) => parseEokAmount(answer.assetAmounts?.[choice]) !== null);
    }
    if (item.key === "debt") {
      const debtChoices = answer.choices.filter((choice) => choice === "담보대출 있음" || choice === "임대보증금 있음");
      return debtChoices.every((choice) => parseEokAmount(answer.debtAmounts?.[choice]) !== null);
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
            ),
            debtAmounts: Object.fromEntries(
              Object.entries(existing.debtAmounts ?? {}).filter(([key]) => nextChoices.includes(key))
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
    setAnswers((prev) => {
      const existing = prev[step.key] ?? { choices: [], detail: "" };
      return ({
      ...prev,
      [step.key]: { ...existing, detail }
      });
    });
  }

  function updateFact(label: string, value: string) {
    setShowError(false);
    setAnswers((prev) => {
      const existing = prev[step.key] ?? { choices: [], detail: "" };
      return ({
      ...prev,
      [step.key]: {
        ...existing,
        facts: { ...(existing.facts ?? {}), [label]: value }
      }
      });
    });
  }

  function updateAssetAmount(asset: string, value: string) {
    setShowError(false);
    setAnswers((prev) => {
      const existing = prev[step.key] ?? { choices: [], detail: "" };
      return ({
      ...prev,
      [step.key]: {
        ...existing,
        assetAmounts: { ...(existing.assetAmounts ?? {}), [asset]: value }
      }
      });
    });
  }

  function updateDebtAmount(debt: string, value: string) {
    setShowError(false);
    setAnswers((prev) => {
      const existing = prev[step.key] ?? { choices: [], detail: "" };
      return ({
      ...prev,
      [step.key]: {
        ...existing,
        debtAmounts: { ...(existing.debtAmounts ?? {}), [debt]: value }
      }
      });
    });
  }

  function understandDirectInput() {
    const parsed = parseConversationalInput(directInput);
    setCandidate(parsed);
    setConversationMessages((previous) => [
      ...previous,
      { role: "user", text: directInput.trim() || "(빈 입력)", created_at: new Date().toISOString() },
      { role: "assistant", text: parsed.assistantText, created_at: new Date().toISOString() }
    ]);
  }

  function confirmCandidate() {
    if (!candidate || candidate.status !== "candidate") return;
    setAnswers((previous) => applyCandidateFacts(previous, candidate.facts));
    setConfirmedFacts((previous) => dedupeConfirmedFacts([...previous, ...candidate.facts]));
    setCandidate(null);
    setDirectInput("");
    setShowError(false);
  }

  function dismissCandidate(message: string) {
    setConversationMessages((previous) => [
      ...previous,
      { role: "assistant", text: message, created_at: new Date().toISOString() }
    ]);
    setCandidate(null);
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
      conversation: {
        messages: conversationMessages,
        confirmed_facts: confirmedFacts,
        raw_inputs: conversationMessages.filter((message) => message.role === "user").map((message) => message.text)
      },
      answers: Object.fromEntries(
        wizardSteps.map((item) => [
          item.key,
          {
            label: item.label,
            choices: answers[item.key]?.choices ?? [],
            detail: answers[item.key]?.detail ?? "",
            facts: answers[item.key]?.facts,
            assetAmounts: answers[item.key]?.assetAmounts,
            debtAmounts: answers[item.key]?.debtAmounts
          }
        ])
      )
    };
    window.sessionStorage.setItem(ASSESSMENT_STORAGE_KEY, JSON.stringify(snapshot));
    setShowError(false);
    router.push(`/precheck/result?assessment_id=${encodeURIComponent(snapshot.assessment_id)}`);
  }

  return (
    <section className="mx-auto grid max-w-7xl gap-10 px-4 py-5 sm:px-6 lg:grid-cols-[0.78fr_1.22fr] lg:px-8 lg:py-18">
      <aside className="hidden border border-[var(--border)] bg-white p-6 lg:block">
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

      <section className="border border-[var(--border)] bg-white p-5 md:p-10">
        <div className="mb-5 border border-[var(--border)] bg-[var(--ivory)] p-4 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[var(--gold)]">{activeStep + 1}/{wizardSteps.length} {step.label}</p>
            <p className="text-xs text-[var(--muted)]">무료 사전진단</p>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">주소·실명 없이 큰 금액과 가족 구성만 선택합니다.</p>
        </div>
        <div className="h-1 bg-[var(--border)]">
          <div className="h-1 bg-[var(--gold)] transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--gold)] lg:mt-10">{step.eyebrow}</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-semibold leading-tight tracking-[-0.05em] text-[var(--navy-950)] md:text-4xl">
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

          <section className="border border-[var(--border)] bg-[var(--ivory)] p-4" aria-label="직접 입력으로 답하기">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--navy-950)]">직접 입력</p>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">버튼을 눌러도 되고, 말하듯 적은 뒤 후보 사실을 확인해도 됩니다.</p>
              </div>
              {confirmedFacts.length > 0 ? (
                <span className="border border-[var(--border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--success)]">
                  확정된 사실 {confirmedFacts.length}개
                </span>
              ) : null}
            </div>
            <label className="mt-4 grid gap-2">
              <span className="text-xs font-semibold text-[var(--muted)]">예: 상속 준비, 배우자 있음, 자녀 2명, 부동산 42억, 금융자산 8억</span>
              <textarea
                aria-label="직접 입력"
                className="min-h-20 border border-[var(--border)] bg-white px-4 py-3 text-base outline-none focus:border-[var(--gold)]"
                value={directInput}
                onChange={(event) => setDirectInput(event.target.value)}
                placeholder="세법 용어 몰라도 됩니다. 지금 아는 만큼만 적어주세요."
              />
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" onClick={understandDirectInput} className="inline-flex min-h-12 items-center gap-2 bg-[var(--navy-950)] px-5 py-3 text-sm font-semibold text-white">
                직접 입력 이해하기
              </button>
              <p className="text-xs leading-5 text-[var(--muted)]">후보는 확정 전까지 계산에 쓰지 않습니다.</p>
            </div>
            {candidate ? (
              <div className="mt-4 border border-[var(--border)] bg-white p-4" role="status" aria-live="polite">
                <p className="text-sm font-semibold text-[var(--navy-950)]">{candidate.status === "candidate" ? "제가 이렇게 이해했습니다." : "도움말"}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{candidate.assistantText}</p>
                {candidate.facts.length > 0 ? (
                  <ul className="mt-3 grid gap-2 text-sm">
                    {candidate.facts.map((fact) => (
                      <li key={`${fact.id}-${fact.value}`} className="flex items-center justify-between gap-3 border border-[var(--border)] bg-[var(--ivory)] px-3 py-2">
                        <span className="font-semibold text-[var(--text)]">{fact.label}</span>
                        <span className="text-right text-[var(--navy-950)]">{fact.value}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {candidate.status === "candidate" ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={confirmCandidate} className="inline-flex min-h-11 bg-[var(--success)] px-4 py-2 text-sm font-semibold text-white">맞아요</button>
                    <button type="button" onClick={() => dismissCandidate("좋아요. 문장을 고쳐서 다시 입력하면 다시 후보를 뽑겠습니다.")} className="inline-flex min-h-11 border border-[var(--border)] px-4 py-2 text-sm font-semibold">수정할게요</button>
                    <button type="button" onClick={() => dismissCandidate("확정하지 않고 넘어가도 됩니다. 모르는 항목은 추가정보 필요로 남겨둘게요.")} className="inline-flex min-h-11 border border-[var(--border)] px-4 py-2 text-sm font-semibold">잘 모르겠어요</button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

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
                    <span className="text-sm text-[var(--muted)]">{asset} 금액</span>
                    <span className="flex border border-[var(--border)] bg-[var(--ivory)] focus-within:border-[var(--gold)]">
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.1"
                        aria-label={`${asset} 금액(억원)`}
                        className="w-full bg-transparent px-5 py-4 text-base outline-none"
                        value={currentAnswer.assetAmounts?.[asset] ?? ""}
                        onChange={(event) => updateAssetAmount(asset, event.target.value)}
                        onBlur={(event) => updateAssetAmount(asset, normalizeEokAmount(event.target.value))}
                        placeholder="예: 42"
                      />
                      <span className="flex items-center px-4 text-sm font-semibold text-[var(--muted)]">억원</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs leading-5 text-[var(--muted)]">금액은 0보다 큰 숫자만 입력합니다. 예: 42, 8, 1.5</p>
            </div>
          ) : null}

          {isDebtStep && currentAnswer.choices.some((choice) => choice === "담보대출 있음" || choice === "임대보증금 있음") ? (
            <div className="grid gap-3">
              <p className="text-sm font-semibold text-[var(--text)]">선택 채무별 대략 금액</p>
              <div className="grid gap-3 md:grid-cols-2">
                {currentAnswer.choices.filter((choice) => choice === "담보대출 있음" || choice === "임대보증금 있음").map((debt) => (
                  <label key={debt} className="grid gap-2">
                    <span className="text-sm text-[var(--muted)]">{debt} 금액</span>
                    <span className="flex border border-[var(--border)] bg-[var(--ivory)] focus-within:border-[var(--gold)]">
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.1"
                        aria-label={`${debt} 금액(억원)`}
                        className="w-full bg-transparent px-5 py-4 text-base outline-none"
                        value={currentAnswer.debtAmounts?.[debt] ?? ""}
                        onChange={(event) => updateDebtAmount(debt, event.target.value)}
                        onBlur={(event) => updateDebtAmount(debt, normalizeEokAmount(event.target.value))}
                        placeholder="예: 3"
                      />
                      <span className="flex items-center px-4 text-sm font-semibold text-[var(--muted)]">억원</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs leading-5 text-[var(--muted)]">채무 금액을 모르면 ‘잘 모르겠음’을 선택하거나 확인 후 입력합니다. 체크만으로 금액을 추정하지 않습니다.</p>
            </div>
          ) : null}

          {step.secondaryQuestion && step.key !== "purpose" ? (
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
                    <dd className="font-semibold leading-6 text-[var(--text)]">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          {showError ? (
            <p className="border-l-2 border-[var(--warning)] bg-[#fff8ee] p-4 text-sm text-[var(--warning)]">
              현재 단계의 필수 항목을 입력해야 다음 단계 또는 결과로 이동할 수 있습니다. 금액은 0보다 큰 숫자(억원)만 입력해 주세요.
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

function applyCandidateFacts(previous: WizardAnswers, facts: ConversationCandidateFact[]) {
  let next = { ...previous };
  for (const fact of facts) {
    const target = fact.target;
    const existing = next[target.answerKey] ?? { choices: [], detail: "" };
    if (target.kind === "choice") {
      const shouldBeExclusive = target.answerKey === "purpose" || target.answerKey === "family" || target.answerKey === "goal" || target.answerKey === "review" || target.choice === "해당 없음" || target.choice === "잘 모르겠음";
      const choices = shouldBeExclusive
        ? [target.choice]
        : Array.from(new Set([...existing.choices.filter((choice) => choice !== "해당 없음" && choice !== "잘 모르겠음"), target.choice]));
      next = {
        ...next,
        [target.answerKey]: {
          ...existing,
          choices,
          assetAmounts: target.answerKey === "assets" && "amount" in target && target.amount
            ? { ...(existing.assetAmounts ?? {}), [target.choice]: target.amount }
            : existing.assetAmounts,
          debtAmounts: target.answerKey === "debt" && "amount" in target && target.amount
            ? { ...(existing.debtAmounts ?? {}), [target.choice]: target.amount }
            : existing.debtAmounts
        }
      };
    } else if (target.kind === "fact") {
      next = {
        ...next,
        [target.answerKey]: {
          ...existing,
          facts: { ...(existing.facts ?? {}), [target.label]: target.value }
        }
      };
    }
  }
  return next;
}

function dedupeConfirmedFacts(facts: ConversationCandidateFact[]) {
  const seen = new Set<string>();
  return facts.filter((fact) => {
    const key = `${fact.label}:${fact.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
