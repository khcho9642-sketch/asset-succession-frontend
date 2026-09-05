"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, ChevronRight, HelpCircle, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ASSESSMENT_STORAGE_KEY,
  PRECHECK_DRAFT_STORAGE_KEY,
  createAssessmentId,
  eokAmountToWon,
  formatAnswer,
  normalizeEokAmount,
  normalizeNonnegativeEokAmount,
  parseEokAmount,
  parseNonnegativeEokAmount
} from "@/lib/assessment";
import { simulationDisclaimer, wizardSteps } from "@/lib/mockData";
import { getQuestionHelp, parseConversationalInput } from "@/lib/phase2b/conversation";
import type { ConversationCandidateFact, ConversationParseResult } from "@/lib/phase2b/conversation";
import type { WizardStep } from "@/lib/mockData";

type TaxKind = "inheritance_tax" | "gift_tax";
type WizardAnswer = {
  choices: string[];
  detail: string;
  facts?: Record<string, string>;
  assetAmounts?: Record<string, string>;
  assetAmountWons?: Record<string, number>;
  assetAmountStatus?: Record<string, "confirmed" | "range" | "needs_confirmation" | "unknown">;
  assetAmountRanges?: Record<string, { min_won: number; max_won: number; label: string }>;
  debtAmounts?: Record<string, string>;
  debtAmountWons?: Record<string, number>;
  taxBaseAmounts?: Record<string, string>;
  taxBaseAmountWons?: Record<string, number>;
  taxBaseTaxKind?: Record<string, TaxKind>;
};
type WizardAnswers = Record<string, WizardAnswer>;
type ConversationMessage = { role: "user" | "assistant"; text: string; created_at: string };
type DraftState = {
  activeStep: number;
  answers: WizardAnswers;
  directInput: string;
  candidate: ConversationParseResult | null;
  confirmedFacts: ConversationCandidateFact[];
  conversationMessages: ConversationMessage[];
};

const exclusiveChoices = new Set(["해당 없음", "잘 모르겠음", "아직 모르겠음", "아직 잘 모르겠어요", "아직 정리 전"]);

function getInitialStep() {
  return 0;
}

export function PrecheckWizard() {
  const router = useRouter();
  const [activeStep, setActiveStep] = useState(0);
  const [answers, setAnswers] = useState<WizardAnswers>({});
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("현재 단계의 필수 항목을 입력해야 다음 단계 또는 결과로 이동할 수 있습니다.");
  const [directInput, setDirectInput] = useState("");
  const [candidate, setCandidate] = useState<ConversationParseResult | null>(null);
  const [confirmedFacts, setConfirmedFacts] = useState<ConversationCandidateFact[]>([]);
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>([]);
  const [draftRestored, setDraftRestored] = useState(false);
  const [derivedInvalidated, setDerivedInvalidated] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [isSubmittingInput, setIsSubmittingInput] = useState(false);
  const submittingInputRef = useRef(false);
  const lastSubmissionRef = useRef("");
  const visibleSteps = useMemo(() => getVisibleSteps(answers), [answers]);
  const safeActiveStep = Math.min(activeStep, Math.max(visibleSteps.length - 1, 0));
  const step = visibleSteps[safeActiveStep] ?? wizardSteps[0];
  const currentAnswer = answers[step.key] ?? { choices: [], detail: "" };
  const progress = ((safeActiveStep + 1) / visibleSteps.length) * 100;
  const isMultiSelectStep = ["assets", "debt", "goal", "review"].includes(step.key);
  const isAssetStep = step.key === "assets";
  const isDebtStep = step.key === "debt";
  const isReviewStep = step.key === "review";
  const isFinalReviewStep = isReviewStep && safeActiveStep === visibleSteps.length - 1;
  const selectedTaxKind = answers.review?.taxBaseTaxKind?.__default ?? inferSelectedTaxKind(answers);
  const alternativeScenarioId = selectedTaxKind === "gift_tax" ? "gift-stepwise-transfer" : "inheritance-spouse-allocation";

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
    try {
      const rawDraft = window.sessionStorage.getItem(PRECHECK_DRAFT_STORAGE_KEY);
      if (rawDraft) {
        const draft = JSON.parse(rawDraft) as DraftState;
        setAnswers(draft.answers ?? {});
        setActiveStep(Number.isInteger(draft.activeStep) ? draft.activeStep : 0);
        setDirectInput(draft.directInput ?? "");
        setCandidate(draft.candidate ?? null);
        setConfirmedFacts(draft.confirmedFacts ?? []);
        setConversationMessages(draft.conversationMessages ?? []);
        setDraftRestored(true);
      }
    } catch {
      window.sessionStorage.removeItem(PRECHECK_DRAFT_STORAGE_KEY);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (activeStep !== safeActiveStep) setActiveStep(safeActiveStep);
  }, [activeStep, safeActiveStep]);

  useEffect(() => {
    if (!hydrated) return;
    const draft: DraftState = {
      activeStep: safeActiveStep,
      answers,
      directInput,
      candidate,
      confirmedFacts,
      conversationMessages
    };
    window.sessionStorage.setItem(PRECHECK_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [answers, candidate, confirmedFacts, conversationMessages, directInput, hydrated, safeActiveStep]);

  function isStepComplete(index: number) {
    const item = visibleSteps[index];
    const answer = answers[item.key];
    if (!answer) return false;
    if (item.key === "family") {
      return answer.choices.length > 0 || Object.values(answer.facts ?? {}).some(Boolean);
    }
    if (item.key === "goal") return answer.choices.length > 0 && answer.choices.length <= 3;
    return answer.choices.length > 0;
  }

  function isStepUnlocked(index: number) {
    if (index <= safeActiveStep) return true;
    return visibleSteps.slice(0, index).every((_, priorIndex) => isStepComplete(priorIndex));
  }

  function moveToStep(index: number) {
    if (!isStepUnlocked(index)) {
      setError("이전 질문에서 확인된 답변이 있어야 해당 단계로 이동할 수 있습니다.");
      return;
    }
    setShowError(false);
    setActiveStep(index);
  }

  function updateChoice(choice: string) {
    setShowError(false);
    invalidateDerivedSnapshot();
    setAnswers((prev) => {
      const existing = prev[step.key] ?? { choices: [], detail: "" };
      if (isMultiSelectStep) {
        const exclusive = exclusiveChoices.has(choice);
        const isSelected = existing.choices.includes(choice);
        let nextChoices = exclusive
          ? isSelected ? [] : [choice]
          : isSelected
            ? existing.choices.filter((item) => item !== choice)
            : [...existing.choices.filter((item) => !exclusiveChoices.has(item)), choice];

        if (step.key === "goal" && nextChoices.length > 3) {
          setError("승계 목표는 최대 3개까지만 선택해 주세요.");
          nextChoices = existing.choices;
        }

        return {
          ...prev,
          [step.key]: cleanupAnswerForChoices(existing, nextChoices)
        };
      }

      return {
        ...prev,
        [step.key]: { ...existing, choices: [choice] }
      };
    });
  }

  function updateDetail(detail: string) {
    invalidateDerivedSnapshot();
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
    invalidateDerivedSnapshot();
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
    invalidateDerivedSnapshot();
    setAnswers((prev) => {
      const existing = prev[step.key] ?? { choices: [], detail: "" };
      const amount = parseEokAmount(value);
      return ({
        ...prev,
        [step.key]: {
          ...existing,
          assetAmounts: { ...(existing.assetAmounts ?? {}), [asset]: value },
          assetAmountWons: amount === null ? omitKey(existing.assetAmountWons, asset) : { ...(existing.assetAmountWons ?? {}), [asset]: eokAmountToWon(amount) },
          assetAmountStatus: { ...(existing.assetAmountStatus ?? {}), [asset]: amount === null ? "unknown" : "confirmed" },
          assetAmountRanges: omitKey(existing.assetAmountRanges, asset)
        }
      });
    });
  }

  function updateDebtAmount(debt: string, value: string) {
    setShowError(false);
    invalidateDerivedSnapshot();
    setAnswers((prev) => {
      const existing = prev[step.key] ?? { choices: [], detail: "" };
      const amount = parseEokAmount(value);
      return ({
        ...prev,
        [step.key]: {
          ...existing,
          debtAmounts: { ...(existing.debtAmounts ?? {}), [debt]: value },
          debtAmountWons: amount === null ? omitKey(existing.debtAmountWons, debt) : { ...(existing.debtAmountWons ?? {}), [debt]: eokAmountToWon(amount) }
        }
      });
    });
  }

  function updateTaxBaseAmount(scenarioId: "baseline" | "gift-stepwise-transfer" | "inheritance-spouse-allocation", value: string) {
    setShowError(false);
    invalidateDerivedSnapshot();
    setAnswers((prev) => {
      const existing = prev.review ?? { choices: [], detail: "" };
      const amount = parseNonnegativeEokAmount(value);
      return ({
        ...prev,
        review: {
          ...existing,
          taxBaseAmounts: { ...(existing.taxBaseAmounts ?? {}), [scenarioId]: value },
          taxBaseAmountWons: amount === null ? omitKey(existing.taxBaseAmountWons, scenarioId) : { ...(existing.taxBaseAmountWons ?? {}), [scenarioId]: eokAmountToWon(amount) },
          taxBaseTaxKind: { ...(existing.taxBaseTaxKind ?? {}), [scenarioId]: selectedTaxKind }
        }
      });
    });
  }

  function updateTaxKind(taxKind: TaxKind) {
    invalidateDerivedSnapshot();
    setAnswers((prev) => {
      const existing = prev.review ?? { choices: [], detail: "" };
      const taxBaseTaxKind = { __default: taxKind, ...Object.fromEntries(Object.keys(existing.taxBaseAmounts ?? {}).map((key) => [key, taxKind])) } as Record<string, TaxKind>;
      return {
        ...prev,
        review: {
          ...existing,
          taxBaseTaxKind
        }
      };
    });
  }

  function understandDirectInput() {
    const input = directInput.trim();
    if (submittingInputRef.current || lastSubmissionRef.current === input) return;
    submittingInputRef.current = true;
    setIsSubmittingInput(true);
    lastSubmissionRef.current = input;
    const parsed = parseConversationalInput(input);
    setCandidate(parsed);
    setConversationMessages((previous) => [
      ...previous,
      { role: "user", text: input || "(빈 입력)", created_at: new Date().toISOString() },
      { role: "assistant", text: parsed.assistantText, created_at: new Date().toISOString() }
    ]);
    window.setTimeout(() => {
      submittingInputRef.current = false;
      setIsSubmittingInput(false);
    }, 350);
  }

  function confirmCandidateFact(fact: ConversationCandidateFact) {
    setAnswers((previous) => applyCandidateFacts(previous, [fact]));
    setConfirmedFacts((previous) => dedupeConfirmedFacts([...previous, fact]));
    setCandidate((previous) => {
      if (!previous || previous.status !== "candidate") return previous;
      const remaining = previous.facts.filter((item) => item.id !== fact.id || item.value !== fact.value);
      return remaining.length > 0 ? { ...previous, facts: remaining } : null;
    });
    setConversationMessages((previous) => [
      ...previous,
      { role: "assistant", text: `확정: ${fact.label} — ${fact.value}`, created_at: new Date().toISOString() }
    ]);
    setShowError(false);
    invalidateDerivedSnapshot();
  }

  function excludeCandidateFact(fact: ConversationCandidateFact) {
    setCandidate((previous) => {
      if (!previous || previous.status !== "candidate") return previous;
      const remaining = previous.facts.filter((item) => item.id !== fact.id || item.value !== fact.value);
      return remaining.length > 0 ? { ...previous, facts: remaining } : null;
    });
    setConversationMessages((previous) => [
      ...previous,
      { role: "assistant", text: `제외: ${fact.label} — ${fact.value}`, created_at: new Date().toISOString() }
    ]);
  }

  function dismissCandidate(message: string) {
    setConversationMessages((previous) => [
      ...previous,
      { role: "assistant", text: message, created_at: new Date().toISOString() }
    ]);
    setCandidate(null);
  }

  function showQuestionHelp() {
    const text = getQuestionHelp(step.key);
    setConversationMessages((previous) => [
      ...previous,
      { role: "assistant", text, created_at: new Date().toISOString() }
    ]);
    setCandidate({ status: "help", assistantText: text, facts: [] });
  }

  function markUnknownAndContinue() {
    const unknownChoice = step.choices.find((choice) => /모르|정리 전/.test(choice));
    if (unknownChoice) {
      updateChoice(unknownChoice);
      setConversationMessages((previous) => [
        ...previous,
        { role: "assistant", text: `${step.label}은 나중에 확인으로 남겼습니다. 결과와 PDF에는 unknown으로 표시됩니다.`, created_at: new Date().toISOString() }
      ]);
      return;
    }
    updateDetail(`${currentAnswer.detail ? `${currentAnswer.detail} / ` : ""}나중에 확인`);
  }

  function goNext() {
    if (!isStepComplete(safeActiveStep)) {
      setError("현재 질문에 답하거나 ‘모르겠어요/나중에 확인’을 선택해야 다음으로 이동할 수 있습니다.");
      return;
    }
    setShowError(false);
    setActiveStep((value) => Math.min(value + 1, visibleSteps.length - 1));
  }

  function showResult() {
    if (!isStepComplete(safeActiveStep)) {
      setError("결과를 보려면 마지막 확인 질문에서 최소 하나의 관점을 선택해 주세요.");
      return;
    }
    const snapshot = {
      assessment_id: createAssessmentId(),
      created_at: new Date().toISOString(),
      review_focus: answers.review?.choices ?? currentAnswer.choices,
      conversation: {
        messages: conversationMessages,
        confirmed_facts: confirmedFacts,
        pending_candidates: candidate?.facts ?? [],
        raw_inputs: conversationMessages.filter((message) => message.role === "user").map((message) => message.text),
        current_question_key: step.key
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
            assetAmountWons: answers[item.key]?.assetAmountWons,
            assetAmountStatus: answers[item.key]?.assetAmountStatus,
            assetAmountRanges: answers[item.key]?.assetAmountRanges,
            debtAmounts: answers[item.key]?.debtAmounts,
            debtAmountWons: answers[item.key]?.debtAmountWons,
            taxBaseAmounts: answers[item.key]?.taxBaseAmounts,
            taxBaseAmountWons: answers[item.key]?.taxBaseAmountWons,
            taxBaseTaxKind: answers[item.key]?.taxBaseTaxKind
          }
        ])
      )
    };
    window.sessionStorage.setItem(ASSESSMENT_STORAGE_KEY, JSON.stringify(snapshot));
    window.sessionStorage.removeItem(PRECHECK_DRAFT_STORAGE_KEY);
    setDerivedInvalidated(false);
    setShowError(false);
    router.push(`/precheck/result?assessment_id=${encodeURIComponent(snapshot.assessment_id)}`);
  }

  function setError(message: string) {
    setErrorMessage(message);
    setShowError(true);
  }

  function invalidateDerivedSnapshot() {
    if (typeof window !== "undefined") window.sessionStorage.removeItem(ASSESSMENT_STORAGE_KEY);
    setDerivedInvalidated(true);
  }

  return (
    <section className="mx-auto grid max-w-7xl gap-10 px-4 py-5 sm:px-6 lg:grid-cols-[0.78fr_1.22fr] lg:px-8 lg:py-18">
      <aside className="hidden border border-[var(--border)] bg-white p-6 lg:block">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">무료 사전진단</p>
        <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.05em] text-[var(--navy-950)]">
          신고서가 아니라 상담을 시작하는 질문입니다.
        </h1>
        <p className="mt-4 text-base leading-7 text-[var(--muted)]">
          답변에 따라 다음 질문을 줄이고, 모르는 항목은 unknown으로 보존합니다.
        </p>
        <div className="mt-8 grid gap-3">
          {visibleSteps.map((item, index) => (
            <button
              key={item.key}
              type="button"
              onClick={() => moveToStep(index)}
              disabled={!isStepUnlocked(index)}
              className={`flex items-center gap-3 border px-4 py-3 text-left transition ${
                index <= safeActiveStep ? "border-[var(--gold)] bg-[var(--ivory)]" : "border-[var(--border)]"
              }`}
              aria-current={index === safeActiveStep ? "step" : undefined}
              aria-disabled={!isStepUnlocked(index)}
            >
              <span
                className={`flex h-7 w-7 items-center justify-center text-xs font-semibold ${
                  answers[item.key]?.choices.length || Object.values(answers[item.key]?.facts ?? {}).some(Boolean) ? "bg-[var(--success)] text-white" : "bg-white text-[var(--navy-950)]"
                }`}
              >
                {answers[item.key]?.choices.length || Object.values(answers[item.key]?.facts ?? {}).some(Boolean) ? <Check className="h-4 w-4" /> : index + 1}
              </span>
              <span>
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="mt-1 block text-xs text-[var(--muted)]">{branchLabel(item, answers)}</span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="border border-[var(--border)] bg-white p-5 md:p-10">
        <div className="mb-5 border border-[var(--border)] bg-[var(--ivory)] p-4 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[var(--gold)]">{safeActiveStep + 1}/{visibleSteps.length} {step.label}</p>
            <p className="text-xs text-[var(--muted)]">무료 사전진단</p>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">첫 화면에서 바로 질문에 답하고, 모르면 나중에 확인으로 넘깁니다.</p>
        </div>
        {draftRestored ? (
          <div className="mb-5 flex items-center gap-2 border border-[var(--border)] bg-[#f2f8f5] px-4 py-3 text-xs font-semibold text-[var(--success)]">
            <RotateCcw className="h-4 w-4" /> 같은 탭의 진행 중 대화를 복원했습니다.
          </div>
        ) : null}
        {derivedInvalidated ? (
          <div className="mb-5 border-l-2 border-[var(--warning)] bg-[#fff8ee] px-4 py-3 text-xs leading-5 text-[var(--warning)]">
            이전 결과 스냅샷은 무효화됐습니다. 현재 답변으로 결과와 PDF를 다시 생성합니다.
          </div>
        ) : null}
        <div className="h-1 bg-[var(--border)]">
          <div className="h-1 bg-[var(--gold)] transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--gold)] lg:mt-10">{step.eyebrow}</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-semibold leading-tight tracking-[-0.05em] text-[var(--navy-950)] md:text-4xl">
          {step.title}
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--muted)]">{step.helper}</p>

        {conversationMessages.length > 0 ? (
          <section className="mt-6 border border-[var(--border)] bg-[var(--ivory)] p-4" aria-label="대화 이력">
            <p className="text-sm font-semibold text-[var(--navy-950)]">대화 이력</p>
            <ol className="mt-3 grid max-h-48 gap-2 overflow-auto text-xs leading-5">
              {conversationMessages.slice(-8).map((message, index) => (
                <li key={`${message.created_at}-${index}`} className={message.role === "user" ? "text-[var(--text)]" : "text-[var(--muted)]"}>
                  <span className="font-semibold">{message.role === "user" ? "사용자" : "인터뷰"}</span> · {message.text}
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <div className="mt-8 grid gap-6">
          <fieldset className="border-2 border-[var(--gold)] bg-white p-4">
            <legend className="px-2 text-sm font-semibold text-[var(--text)]">현재 질문 · {step.primaryQuestion}</legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-2" role={isMultiSelectStep ? "group" : "radiogroup"} aria-label={step.primaryQuestion}>
              {step.choices.map((choice) => {
                const selected = currentAnswer.choices.includes(choice);
                return (
                  <button
                    key={choice}
                    type="button"
                    role={isMultiSelectStep ? "checkbox" : "radio"}
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
                      {isMultiSelectStep ? (
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
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={showQuestionHelp} className="inline-flex min-h-11 items-center gap-2 border border-[var(--border)] px-4 py-2 text-sm font-semibold">
                <HelpCircle className="h-4 w-4" /> 왜 물어보나요?
              </button>
              <button type="button" onClick={markUnknownAndContinue} className="inline-flex min-h-11 border border-[var(--border)] px-4 py-2 text-sm font-semibold">
                모르겠어요 / 나중에 확인
              </button>
            </div>
          </fieldset>

          <section className="border border-[var(--border)] bg-[var(--ivory)] p-4" aria-label="직접 입력으로 답하기">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--navy-950)]">직접 입력</p>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">말하듯 적은 뒤 맞는 사실만 개별 확정합니다. 후보는 확정 전까지 계산에 쓰지 않습니다.</p>
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
                onChange={(event) => {
                  setDirectInput(event.target.value);
                  lastSubmissionRef.current = "";
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.shiftKey) return;
                  if (event.nativeEvent.isComposing) return;
                  event.preventDefault();
                  understandDirectInput();
                }}
                placeholder="세법 용어 몰라도 됩니다. 지금 아는 만큼만 적어주세요."
              />
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={isSubmittingInput}
                onClick={understandDirectInput}
                className="inline-flex min-h-12 items-center gap-2 bg-[var(--navy-950)] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                직접 입력 이해하기
              </button>
              <p className="text-xs leading-5 text-[var(--muted)]">Enter 전송은 한글 조합 중에는 막고, 연속 클릭은 한 번만 반영합니다.</p>
            </div>
            {candidate ? (
              <div className="mt-4 border border-[var(--border)] bg-white p-4" role="status" aria-live="polite">
                <p className="text-sm font-semibold text-[var(--navy-950)]">{candidate.status === "candidate" ? "제가 이렇게 이해했습니다." : "도움말"}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{candidate.assistantText}</p>
                {candidate.facts.length > 0 ? (
                  <ul className="mt-3 grid gap-2 text-sm">
                    {candidate.facts.map((fact) => (
                      <li key={`${fact.id}-${fact.value}`} className="grid gap-3 border border-[var(--border)] bg-[var(--ivory)] px-3 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                        <span>
                          <span className="block font-semibold text-[var(--text)]">{fact.label}</span>
                          <span className="mt-1 block text-[var(--navy-950)]">{fact.value}</span>
                          <span className="mt-1 block text-xs text-[var(--muted)]">확신도: {fact.confidence}</span>
                        </span>
                        <span className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => confirmCandidateFact(fact)} className="inline-flex min-h-10 bg-[var(--success)] px-3 py-2 text-xs font-semibold text-white">
                            이 사실만 확정
                          </button>
                          <button type="button" onClick={() => excludeCandidateFact(fact)} className="inline-flex min-h-10 items-center gap-1 border border-[var(--border)] bg-white px-3 py-2 text-xs font-semibold">
                            <X className="h-3 w-3" /> 제외
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {candidate.status === "candidate" ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={() => dismissCandidate("좋아요. 문장을 고쳐서 다시 입력하면 다시 후보를 뽑겠습니다.")} className="inline-flex min-h-11 border border-[var(--border)] px-4 py-2 text-sm font-semibold">문장 수정하기</button>
                    <button type="button" onClick={() => dismissCandidate("확정하지 않고 넘어가도 됩니다. 모르는 항목은 추가정보 필요로 남겨둘게요.")} className="inline-flex min-h-11 border border-[var(--border)] px-4 py-2 text-sm font-semibold">나중에 확인</button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          {step.key === "family" ? (
            <div className="grid gap-4 md:grid-cols-2">
              {[
                ["배우자 유무", ["있음", "없음", "잘 모르겠음"]],
                ["자녀 수", ["0명", "1명", "2명", "3명 이상", "잘 모르겠음"]],
                ["성년 자녀 수", ["0명", "1명", "2명", "3명 이상", "잘 모르겠음"]],
                ["미성년 자녀 수", ["0명", "1명", "2명 이상", "잘 모르겠음"]]
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

          {isAssetStep && currentAnswer.choices.filter((choice) => !exclusiveChoices.has(choice)).length > 0 ? (
            <div className="grid gap-3">
              <p className="text-sm font-semibold text-[var(--text)]">선택 자산별 대략 금액</p>
              <div className="grid gap-3 md:grid-cols-2">
                {currentAnswer.choices.filter((choice) => !exclusiveChoices.has(choice)).map((asset) => (
                  <label key={asset} className="grid gap-2">
                    <span className="text-sm text-[var(--muted)]">{asset} 금액</span>
                    <span className="flex border border-[var(--border)] bg-[var(--ivory)] focus-within:border-[var(--gold)]">
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0.1"
                        step="0.1"
                        aria-label={`${asset} 금액(억원)`}
                        className="w-full bg-transparent px-5 py-4 text-base outline-none"
                        value={currentAnswer.assetAmounts?.[asset] ?? ""}
                        onChange={(event) => updateAssetAmount(asset, event.target.value)}
                        onBlur={(event) => updateAssetAmount(asset, normalizeEokAmount(event.target.value))}
                        placeholder="모르면 비워둠"
                      />
                      <span className="flex items-center px-4 text-sm font-semibold text-[var(--muted)]">억원</span>
                    </span>
                    {currentAnswer.assetAmountRanges?.[asset] ? (
                      <span className="text-xs text-[var(--warning)]">범위 후보: {currentAnswer.assetAmountRanges[asset].label} · 확정 계산에는 미사용</span>
                    ) : null}
                  </label>
                ))}
              </div>
              <p className="text-xs leading-5 text-[var(--muted)]">확정 금액은 0보다 큰 숫자만 입력합니다. 모르면 비워두고 unknown으로 진행합니다.</p>
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
                        min="0.1"
                        step="0.1"
                        aria-label={`${debt} 금액(억원)`}
                        className="w-full bg-transparent px-5 py-4 text-base outline-none"
                        value={currentAnswer.debtAmounts?.[debt] ?? ""}
                        onChange={(event) => updateDebtAmount(debt, event.target.value)}
                        onBlur={(event) => updateDebtAmount(debt, normalizeEokAmount(event.target.value))}
                        placeholder="모르면 비워둠"
                      />
                      <span className="flex items-center px-4 text-sm font-semibold text-[var(--muted)]">억원</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs leading-5 text-[var(--muted)]">체크만으로 채무 0원 또는 임의 채무 금액을 만들지 않습니다.</p>
            </div>
          ) : null}

          {isReviewStep ? (
            <section className="grid gap-4 border border-[var(--border)] bg-[var(--ivory)] p-5">
              <div>
                <p className="text-sm font-semibold text-[var(--navy-950)]">외부 확인 과세표준이 있는 경우만 계산</p>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">일반 자산가액을 과세표준으로 보지 않습니다. 세무 검토 등 외부에서 확인된 과세표준이 있을 때만 좁은 세율표 계산을 연결합니다.</p>
              </div>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="과세표준 세목">
                {[
                  ["inheritance_tax", "상속세"],
                  ["gift_tax", "증여세"]
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selectedTaxKind === value}
                    aria-pressed={selectedTaxKind === value}
                    onClick={() => updateTaxKind(value as TaxKind)}
                    className={`border px-4 py-2 text-sm font-semibold ${selectedTaxKind === value ? "border-[var(--gold)] bg-white text-[var(--navy-950)]" : "border-[var(--border)]"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <TaxBaseInput
                  label="기준안 확인 과세표준(억원)"
                  value={answers.review?.taxBaseAmounts?.baseline ?? ""}
                  onChange={(value) => updateTaxBaseAmount("baseline", value)}
                />
                <TaxBaseInput
                  label="우선 대안 확인 과세표준(억원)"
                  value={answers.review?.taxBaseAmounts?.[alternativeScenarioId] ?? ""}
                  onChange={(value) => updateTaxBaseAmount(alternativeScenarioId, value)}
                />
              </div>
              <p className="text-xs leading-5 text-[var(--muted)]">0 입력은 유효한 과세표준 0원으로 처리합니다. 미입력은 비교 불가로 표시됩니다.</p>
            </section>
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

          {isFinalReviewStep ? (
            <div className="border border-[var(--border)] bg-[var(--ivory)] p-5">
              <p className="text-sm font-semibold text-[var(--navy-950)]">최종 입력 확인</p>
              <dl className="mt-4 grid gap-3 text-sm">
                {summary.map((item) => (
                  <div key={item.label} className="grid gap-1 border-b border-[var(--border)] pb-3 sm:grid-cols-[8rem_1fr]">
                    <dt className="text-[var(--muted)]">{item.label}</dt>
                    <dd className="font-semibold leading-6 text-[var(--text)]">{item.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-xs leading-5 text-[var(--muted)]">확정되지 않은 후보는 결과와 PDF에서 unknown 또는 추가 확인 필요로만 표시됩니다.</p>
            </div>
          ) : null}

          {showError ? (
            <p className="border-l-2 border-[var(--warning)] bg-[#fff8ee] p-4 text-sm text-[var(--warning)]">
              {errorMessage}
            </p>
          ) : null}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setActiveStep((value) => Math.max(value - 1, 0))}
            disabled={safeActiveStep === 0}
            className="inline-flex items-center gap-2 border border-[var(--border)] px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" /> 이전
          </button>
          {isFinalReviewStep ? (
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

function TaxBaseInput({ label, value, onChange }: Readonly<{ label: string; value: string; onChange: (value: string) => void }>) {
  return (
    <label className="grid gap-2">
      <span className="text-sm text-[var(--muted)]">{label}</span>
      <span className="flex border border-[var(--border)] bg-white focus-within:border-[var(--gold)]">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.1"
          aria-label={label}
          className="w-full bg-transparent px-5 py-4 text-base outline-none"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={(event) => onChange(normalizeNonnegativeEokAmount(event.target.value))}
          placeholder="예: 3 또는 0"
        />
        <span className="flex items-center px-4 text-sm font-semibold text-[var(--muted)]">억원</span>
      </span>
    </label>
  );
}

function getVisibleSteps(answers: WizardAnswers): WizardStep[] {
  const purposeChoices = answers.purpose?.choices ?? [];
  const purpose = wizardSteps.find((step) => step.key === "purpose")!;
  if (purposeChoices.length === 0) return [purpose];

  const hasOnlyCapitalGains = purposeChoices.length === 1 && purposeChoices.includes("양도");
  const hasOnlyBusiness = purposeChoices.length === 1 && purposeChoices.includes("가업·회사 승계");
  return wizardSteps.filter((item) => {
    if (item.key === "debt") return !hasOnlyCapitalGains && !hasOnlyBusiness;
    return true;
  });
}

function branchLabel(step: WizardStep, answers: WizardAnswers) {
  if (step.key === "debt" && !getVisibleSteps(answers).some((item) => item.key === "debt")) return "이번 분기 제외";
  if (step.key === "review") return "웹·PDF 동일 스냅샷";
  if (step.key === "assets") return "소유자 미상 허용";
  if (step.key === "family") return "성년 여부 미상 허용";
  return "현재 분기";
}

function cleanupAnswerForChoices(existing: WizardAnswer, choices: string[]): WizardAnswer {
  return {
    ...existing,
    choices,
    assetAmounts: filterRecord(existing.assetAmounts, choices),
    assetAmountWons: filterRecord(existing.assetAmountWons, choices),
    assetAmountStatus: filterRecord(existing.assetAmountStatus, choices),
    assetAmountRanges: filterRecord(existing.assetAmountRanges, choices),
    debtAmounts: filterRecord(existing.debtAmounts, choices),
    debtAmountWons: filterRecord(existing.debtAmountWons, choices)
  };
}

function applyCandidateFacts(previous: WizardAnswers, facts: ConversationCandidateFact[]) {
  let next = { ...previous };
  for (const fact of facts) {
    const target = fact.target;
    const existing = next[target.answerKey] ?? { choices: [], detail: "" };
    if (target.kind === "choice") {
      const shouldBeExclusive = target.answerKey === "purpose" || target.answerKey === "family" || exclusiveChoices.has(target.choice);
      const choices = shouldBeExclusive
        ? [target.choice]
        : Array.from(new Set([...existing.choices.filter((choice) => !exclusiveChoices.has(choice)), target.choice])).slice(0, target.answerKey === "goal" ? 3 : undefined);
      const updated = cleanupAnswerForChoices(existing, choices);
      next = {
        ...next,
        [target.answerKey]: {
          ...updated,
          assetAmounts: target.answerKey === "assets" && "amount" in target && target.amount
            ? { ...(updated.assetAmounts ?? {}), [target.choice]: target.amount }
            : updated.assetAmounts,
          assetAmountWons: target.answerKey === "assets" && "amountWon" in target && target.amountWon !== undefined
            ? { ...(updated.assetAmountWons ?? {}), [target.choice]: target.amountWon }
            : updated.assetAmountWons,
          assetAmountStatus: target.answerKey === "assets" && "amountStatus" in target && target.amountStatus
            ? { ...(updated.assetAmountStatus ?? {}), [target.choice]: target.amountStatus }
            : updated.assetAmountStatus,
          assetAmountRanges: target.answerKey === "assets" && "range" in target && target.range
            ? { ...(updated.assetAmountRanges ?? {}), [target.choice]: target.range }
            : updated.assetAmountRanges,
          debtAmounts: target.answerKey === "debt" && "amount" in target && target.amount
            ? { ...(updated.debtAmounts ?? {}), [target.choice]: target.amount }
            : updated.debtAmounts,
          debtAmountWons: target.answerKey === "debt" && "amountWon" in target && target.amountWon !== undefined
            ? { ...(updated.debtAmountWons ?? {}), [target.choice]: target.amountWon }
            : updated.debtAmountWons,
          facts: target.answerKey === "assets" && "quantity" in target && target.quantity
            ? { ...(updated.facts ?? {}), [`${target.choice} 개수`]: `${target.quantity}개` }
            : updated.facts
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
    } else if (target.kind === "tax_base") {
      const review = next.review ?? { choices: [], detail: "" };
      next = {
        ...next,
        review: {
          ...review,
          taxBaseAmounts: { ...(review.taxBaseAmounts ?? {}), [target.scenarioId]: target.amount },
          taxBaseAmountWons: { ...(review.taxBaseAmountWons ?? {}), [target.scenarioId]: target.amountWon },
          taxBaseTaxKind: { ...(review.taxBaseTaxKind ?? {}), [target.scenarioId]: target.taxKind }
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

function inferSelectedTaxKind(answers: WizardAnswers): TaxKind {
  const source = [...(answers.purpose?.choices ?? []), ...(answers.goal?.choices ?? [])].join(" ");
  return /증여|미리|이전/.test(source) ? "gift_tax" : "inheritance_tax";
}

function filterRecord<T>(record: Record<string, T> | undefined, keys: string[]) {
  if (!record) return undefined;
  return Object.fromEntries(Object.entries(record).filter(([key]) => keys.includes(key))) as Record<string, T>;
}

function omitKey<T>(record: Record<string, T> | undefined, key: string) {
  if (!record) return undefined;
  return Object.fromEntries(Object.entries(record).filter(([entryKey]) => entryKey !== key)) as Record<string, T>;
}
