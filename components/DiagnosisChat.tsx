"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowDown, ArrowLeft, ArrowRight, Check, ChevronDown, FileText, MessageCircle, Pencil, Plus, RotateCcw, Send, ShieldCheck, Square, Trash2, X } from "lucide-react";
import { clearAssessmentForSession, saveAssessmentForSession } from "@/lib/assessment";
import { CHAT_FIELD_KEYS, CHAT_FIELD_LABELS, applyChatPatches, createChatState, getMissingRequiredFields, getNextQuestion, validateChatState } from "@/lib/chat/intake";
import type { ChatFieldKey, ChatMessage, ChatState } from "@/lib/chat/intake";
import type { DiagnosisUIMessage } from "@/lib/chat/agent";
import { extractLocalChatPatches } from "@/lib/chat/local";
import { buildConfirmedAssessmentSnapshot } from "@/lib/chat/report";
import { attachConfirmedTaxComparison, createTaxInputFromChat, taxFactsSignature } from "@/lib/chat/tax";
import { calculateTaxComparison, validateTaxComparisonInput } from "@/lib/tax-comparison";
import type { TaxComparisonInput } from "@/lib/tax-comparison";
import { TaxComparisonEditor } from "./TaxComparisonEditor";
import styles from "./DiagnosisChat.module.css";

const DRAFT_KEY = "as360.chat.draft.v1";
// Retain the current tab's draft during client navigation if sessionStorage is blocked.
let volatileDraft: string | null = null;
const TOPICS: Record<string, string> = {
  inheritance: "상속", gift: "증여", capital_gains: "양도", business_succession: "가업승계",
  "상속": "상속", "증여": "증여", "양도": "양도", "가업승계": "가업승계",
};
const EXAMPLES: Record<string, string> = {
  "상속": "아버지 명의 건물 25억, 아파트 15억, 예금 10억이 있어요. 배우자 있음, 자녀 셋, 채무 없음, 과거 증여 없음. 노후생활비를 남기고 세금 부담을 줄이고 싶어요.",
  "증여": "제 명의 아파트가 15억, 예금은 3억이에요. 성인 자녀 두 명에게 조금씩 증여하고 싶은데, 제 노후생활비도 남겨두고 싶어요.",
  "양도": "제 명의 아파트 12억, 상가 8억이 있어요. 상가를 팔고 자녀에게 현금을 주는 방법과 부동산을 증여하는 방법을 비교하고 싶어요.",
  "가업승계": "제가 운영하는 제조업 법인의 지분을 자녀에게 넘기고 싶어요. 회사 주식 가치는 아직 모르고, 성인 자녀 한 명이 함께 일하고 있어요.",
};
const FIELD_HINTS: Record<ChatFieldKey, string> = {
  topic: "예: 상속과 증여를 함께 비교", timing: "예: 3년 안에 준비 / 이미 상속 발생", owner: "예: 본인 명의 / 아버지 명의", spouse: "예: 배우자 있음 / 없음 / 모름", children: "예: 자녀 2명 / 없음", adultChildren: "예: 성인 자녀 2명", minorChildren: "예: 미성년 자녀 없음", realEstate: "예: 아파트 20억, 상가 10억 / 금액 모름", financialAssets: "예: 예금 3억, 주식 1억", businessAssets: "예: 비상장 주식 10억 / 평가액 모름", otherAssets: "예: 보험 있음 / 기타 자산 없음", debt: "예: 대출 2억 / 채무 없음 / 모름", pastGifts: "예: 3년 전 자녀에게 1억 증여 / 없음", goal: "예: 노후생활비 유지, 납부할 현금 준비", notes: "그 밖에 함께 검토할 상황을 적어주세요",
};

function makeId() { return globalThis.crypto?.randomUUID?.() ?? `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function toUiMessages(state: ChatState): DiagnosisUIMessage[] {
  return state.messages.map(message => ({ id: message.id, role: message.role, parts: [{ type: "text" as const, text: message.text }] }));
}

export function DiagnosisChat() {
  const router = useRouter();
  const params = useSearchParams();
  const topic = TOPICS[params.get("purpose") ?? ""] ?? "";
  const [state, setState] = useState<ChatState>(createChatState);
  const stateRef = useRef(state);
  const [input, setInput] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const [storageNotice, setStorageNotice] = useState("");
  const [stage, setStage] = useState<"chat" | "review">("chat");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [showAllFields, setShowAllFields] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [taxEnabled, setTaxEnabled] = useState(true);
  const [taxInput, setTaxInput] = useState<TaxComparisonInput>(() => createTaxInputFromChat(createChatState()));
  const [taxSignature, setTaxSignature] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [localNotice, setLocalNotice] = useState("");
  const [cancelled, setCancelled] = useState(false);
  const [resetRequested, setResetRequested] = useState(false);
  const [reportOpening, setReportOpening] = useState(false);
  const [editingIds, setEditingIds] = useState<Set<string>>(() => new Set());
  const loaded = useRef(false);
  const sending = useRef(false);
  const composing = useRef(false);
  const reportId = useRef<string | undefined>(undefined);
  const processedTools = useRef(new Set<string>());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const reviewRef = useRef<HTMLHeadingElement>(null);
  const shouldFollow = useRef(true);
  const [hasNewText, setHasNewText] = useState(false);
  const transport = useRef(new DefaultChatTransport<DiagnosisUIMessage>({ api: "/api/diagnosis" }));
  const { messages, setMessages, sendMessage, regenerate, status, error, clearError, stop } = useChat<DiagnosisUIMessage>({ transport: transport.current });
  const busy = status === "submitted" || status === "streaming";

  const commit = useCallback((next: ChatState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const invalidateReport = useCallback(() => {
    if (reportId.current) {
      clearAssessmentForSession(reportId.current);
      reportId.current = undefined;
    }
    setConfirmed(false);
    setReviewError("");
  }, []);

  const updateEditing = useCallback((id: string, editing: boolean) => {
    if (editing) invalidateReport();
    setEditingIds(previous => {
      if (previous.has(id) === editing) return previous;
      const next = new Set(previous);
      if (editing) next.add(id); else next.delete(id);
      return next;
    });
  }, [invalidateReport]);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    try {
      let raw = volatileDraft;
      try { raw = window.sessionStorage.getItem(DRAFT_KEY) ?? volatileDraft; }
      catch { setStorageNotice("이 브라우저에서는 대화를 저장할 수 없어요. 새로고침하면 입력 내용이 사라질 수 있어요."); }
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        const draft = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
        const restored = draft?.version === 1 ? validateChatState(draft.state) : null;
        if (!restored) throw new Error("invalid-draft");
        commit(restored);
        setMessages(toUiMessages(restored));
        const restoredTax = validateTaxComparisonInput(draft?.taxInput);
        const signature = taxFactsSignature(restored);
        setTaxInput(restoredTax && draft?.taxSignature === signature ? { ...restoredTax, confirmed: false } : createTaxInputFromChat(restored));
        setTaxSignature(signature);
        if (typeof draft?.taxEnabled === "boolean") setTaxEnabled(draft.taxEnabled);
        if (typeof draft?.input === "string" && draft.input.length <= 6000) setInput(draft.input);
        if (typeof draft?.reportId === "string" && /^AS360-[A-Za-z0-9-]+$/.test(draft.reportId)) reportId.current = draft.reportId;
      }
    } catch (reason) {
      setStorageNotice(reason instanceof SyntaxError || (reason instanceof Error && reason.message === "invalid-draft")
        ? "저장된 대화를 읽지 못했어요. 새로 입력하시면 이 화면에서 계속 정리할 수 있어요."
        : "이 브라우저에서는 대화를 저장할 수 없어요. 새로고침하면 입력 내용이 사라질 수 있어요.");
    }
    setHydrated(true);
  }, [commit, setMessages]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    fetch("/api/diagnosis", { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("connection");
        const data = await response.json();
        if (typeof data.configured !== "boolean") throw new Error("connection");
        setConfigured(data.configured);
      })
      .catch(() => { setConfigured(false); setConnectionError(true); })
      .finally(() => window.clearTimeout(timer));
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    volatileDraft = JSON.stringify({ version: 1, state, input, reportId: reportId.current, taxInput, taxEnabled, taxSignature });
    try {
      window.sessionStorage.setItem(DRAFT_KEY, volatileDraft);
    } catch {
      setStorageNotice("이 브라우저에서는 대화를 저장할 수 없어요. 새로고침하면 입력 내용이 사라질 수 있어요.");
    }
  }, [hydrated, state, input, taxInput, taxEnabled, taxSignature]);

  useEffect(() => {
    if (!hydrated) return;
    const signature = taxFactsSignature(state);
    if (signature !== taxSignature) {
      setTaxInput(createTaxInputFromChat(state));
      setTaxSignature(signature);
      setConfirmed(false);
    }
  }, [hydrated, state, taxSignature]);

  useEffect(() => {
    if (!hydrated) return;
    const previous = stateRef.current;
    const previousById = new Map(previous.messages.map(message => [message.id, message]));
    const syncedMessages: ChatMessage[] = messages.flatMap(message => {
      const text = message.parts.filter(part => part.type === "text").map(part => part.text).join("");
      if (!text || (message.role !== "user" && message.role !== "assistant")) return [];
      return [{ id: message.id, role: message.role, text, created_at: previousById.get(message.id)?.created_at ?? new Date().toISOString() }];
    });
    let next = { ...previous, messages: syncedMessages };
    let latestUserId = "";
    for (const message of messages) {
      if (message.role === "user") latestUserId = message.id;
      for (const part of message.parts) {
        if (part.type === "tool-proposeFacts" && part.state === "output-available" && !processedTools.current.has(part.toolCallId)) {
          processedTools.current.add(part.toolCallId);
          next = applyChatPatches(next, part.output.proposals, latestUserId);
        }
      }
    }
    if (JSON.stringify(next) !== JSON.stringify(previous)) commit(next);
  }, [messages, hydrated, commit]);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript || stage !== "chat") return;
    if (!messages.some(message => message.role === "user")) {
      transcript.scrollTop = 0;
      return;
    }
    if (shouldFollow.current) transcript.scrollTop = transcript.scrollHeight;
    else setHasNewText(true);
  }, [messages, localNotice, stage]);

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.style.height = "auto";
    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 180)}px`;
  }, [input]);

  const missing = getMissingRequiredFields(state);
  const factsCount = CHAT_FIELD_KEYS.filter(key => state.facts[key]).length;
  const hasMessages = state.messages.some(message => message.role === "user");
  const readyForReview = missing.length === 0;

  async function submitMessage() {
    const text = input.trim();
    if (!text || busy || sending.current || !hydrated || configured === null) return;
    sending.current = true;
    invalidateReport();
    clearError();
    setCancelled(false);
    setStage("chat");
    setInput("");
    shouldFollow.current = true;
    const submittedText = topic && !stateRef.current.messages.some(message => message.role === "user")
      ? `검토 주제: ${topic}\n\n${text}` : text;
    const message: ChatMessage = { id: makeId(), role: "user", text: submittedText, created_at: new Date().toISOString() };
    let next: ChatState = { ...stateRef.current, messages: [...stateRef.current.messages, message] };
    if (!configured) next = applyChatPatches(next, extractLocalChatPatches(submittedText, next), message.id);
    commit(next);
    try {
      if (configured) {
        setLocalNotice("");
        await sendMessage({ id: message.id, role: "user", parts: [{ type: "text", text: submittedText }] }, { body: { facts: next.facts } });
      } else {
        setMessages(toUiMessages(next));
        setLocalNotice(getMissingRequiredFields(next).length > 0
          ? getNextQuestion(next)
          : "찾은 내용을 입력 요약에 정리했어요. 빠지거나 다른 내용은 직접 고친 뒤 보고서를 열 수 있어요.");
      }
    } catch { /* useChat exposes request errors in its error state. */ }
    finally { sending.current = false; }
  }

  function editFact(key: ChatFieldKey, value: string) {
    if (busy || !value.trim()) return;
    invalidateReport();
    const text = `정정: ${CHAT_FIELD_LABELS[key]} — ${value.trim()}`;
    const message: ChatMessage = { id: makeId(), role: "user", text, created_at: new Date().toISOString() };
    const next = applyChatPatches({ ...stateRef.current, messages: [...stateRef.current.messages, message] }, [{ key, value: value.trim(), evidence: text }], message.id);
    commit(next);
    setMessages(toUiMessages(next));
    setLocalNotice("직접 수정한 내용을 요약에 반영했어요. 보고서를 열기 전에 한 번 더 확인해 주세요.");
  }

  function removeFact(key: ChatFieldKey) {
    if (busy) return;
    invalidateReport();
    const facts = { ...stateRef.current.facts };
    delete facts[key];
    const message: ChatMessage = { id: makeId(), role: "user", text: `정리 내용에서 ${CHAT_FIELD_LABELS[key]} 항목을 삭제했어요. 이 항목은 다시 확인이 필요해요.`, created_at: new Date().toISOString() };
    const next = { ...stateRef.current, facts, messages: [...stateRef.current.messages, message] };
    commit(next);
    setMessages(toUiMessages(next));
  }

  function openReview() {
    setStage("review");
    setConfirmed(false);
    setReviewError("");
    window.setTimeout(() => reviewRef.current?.focus(), 0);
  }

  async function openReport() {
    if (!confirmed || busy || reportOpening || editingIds.size > 0 || input.trim()) return;
    setReportOpening(true);
    try {
      const confirmedAt = new Date().toISOString();
      let snapshot = buildConfirmedAssessmentSnapshot(stateRef.current, { confirmed: true, confirmedAt });
      if (taxEnabled) {
        if (taxSignature !== taxFactsSignature(stateRef.current)) throw new Error("대화가 바뀌었습니다. 새 계산 조건을 확인해 주세요.");
        const preview = calculateTaxComparison(taxInput);
        if (preview.status !== "ready") throw new Error(preview.missing.join(" ") || "세액 비교에 필요한 조건을 확인해 주세요.");
        snapshot = attachConfirmedTaxComparison(snapshot, { ...taxInput, confirmed: true, confirmedAt });
      }
      const persisted = saveAssessmentForSession(snapshot);
      reportId.current = snapshot.assessment_id;
      volatileDraft = JSON.stringify({ version: 1, state: stateRef.current, input, reportId: snapshot.assessment_id, taxInput, taxEnabled, taxSignature });
      try { window.sessionStorage.setItem(DRAFT_KEY, volatileDraft); } catch { /* In-memory report remains available. */ }
      if (!persisted) setStorageNotice("현재 화면에서는 보고서를 볼 수 있지만 새로고침하면 다시 입력해야 합니다.");
      router.push(`/report-preview?assessment_id=${encodeURIComponent(snapshot.assessment_id)}&source=chat`);
    } catch (reason) {
      setReviewError(reason instanceof Error ? reason.message : "요약 내용을 다시 확인해 주세요.");
      setReportOpening(false);
    }
  }

  async function retryResponse() {
    if (busy || sending.current || !configured) return;
    sending.current = true;
    setCancelled(false);
    clearError();
    try { await regenerate({ body: { facts: stateRef.current.facts } }); }
    catch { /* The retry error is shown by useChat. */ }
    finally { sending.current = false; }
  }

  async function resetChat() {
    await stop();
    invalidateReport();
    processedTools.current.clear();
    const next = createChatState();
    commit(next);
    setMessages([]);
    setInput("");
    setStage("chat");
    setLocalNotice("");
    setCancelled(false);
    setResetRequested(false);
    setSummaryOpen(false);
    setShowAllFields(false);
    setTaxEnabled(true);
    setTaxInput(createTaxInputFromChat(next));
    setTaxSignature(taxFactsSignature(next));
    clearError();
    inputRef.current?.focus();
  }

  function insertExample() {
    invalidateReport();
    setInput(EXAMPLES[topic || "상속"]);
    inputRef.current?.focus();
  }

  const renderField = (key: ChatFieldKey) => (
    <FactEditor key={`${stage}-${key}`} fieldKey={key} fact={state.facts[key]} disabled={busy} onSave={editFact} onRemove={removeFact} onEditingChange={updateEditing} />
  );

  return (
    <section className={styles.workspace} aria-label="자산승계 사전진단 대화">
      <div className={styles.topline}>
        <Link href="/" className={styles.backLink}><ArrowLeft size={15} aria-hidden="true" /> 처음으로</Link>
        <div className={styles.progress} aria-label="진행 단계"><span className={stage === "chat" ? styles.activeStep : ""}>01 대화</span><span aria-hidden="true">/</span><span className={stage === "review" ? styles.activeStep : ""}>02 내용 확인</span><span aria-hidden="true">/</span><span>03 보고서</span></div>
        <button className={styles.resetButton} onClick={() => setResetRequested(true)} disabled={!hasMessages && !input}><Plus size={16} aria-hidden="true" /> 새 진단</button>
      </div>

      {resetRequested && <div className={styles.resetNotice} role="alert"><p>현재 대화를 비우고 새 진단을 시작할까요?</p><div><button onClick={() => setResetRequested(false)}>계속 작성</button><button className={styles.dangerButton} onClick={() => void resetChat()}>새 진단 시작</button></div></div>}
      {storageNotice && <p className={styles.notice} role="status">{storageNotice}</p>}

      <div className={`${styles.columns} ${stage === "review" ? styles.reviewColumns : ""}`}>
        <div className={styles.chatColumn}>
          <div className={styles.chatHeading}>
            <div><span className={styles.eyebrow}>무료 사전진단{topic ? ` · ${topic}` : ""}</span><h1>먼저, 이야기를 들려주세요.</h1></div>
            <span className={styles.privateBadge}><ShieldCheck size={15} aria-hidden="true" /> 이름·연락처 없이</span>
          </div>
          <div className={`${styles.connection} ${configured ? styles.connected : ""}`} role="status">
            <span className={styles.statusDot} aria-hidden="true" />
            {configured === null ? "연결 상태 확인 중" : configured ? "AI와 대화 중" : "AI 연결 전 · 입력 정리 모드"}
          </div>

          <div className={styles.chatSurface}>
            {stage === "chat" ? <div ref={transcriptRef} className={styles.transcript} role="log" aria-label="대화 내용" aria-live="polite" aria-relevant="additions text" onScroll={event => { const node = event.currentTarget; shouldFollow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 100; if (shouldFollow.current) setHasNewText(false); }}>
              <div className={styles.welcome}>
                <span className={styles.seal} aria-hidden="true">承</span>
                <p className={styles.welcomeTitle}>어떤 상황인지<br className={styles.mobileBreak} /> 편하게 말씀해주세요.</p>
                <p className={styles.welcomeBody}>누구의 자산인지, 어떤 고민이 있는지부터요.<br />정확한 금액을 몰라도 괜찮아요.</p>
                {!hasMessages && <><button className={styles.exampleButton} onClick={insertExample} disabled={!hydrated}><MessageCircle size={16} aria-hidden="true" /> 어떻게 쓰면 되나요? 예시 넣기 <ArrowRight size={15} aria-hidden="true" /></button><p className={styles.exampleCaption}>가상의 예시예요. 내 상황에 맞게 고친 뒤 보내주세요.</p></>}
              </div>

              {messages.map(message => {
                const text = message.parts.filter(part => part.type === "text").map(part => part.text).join("");
                if (!text) return null;
                return <article className={message.role === "user" ? styles.userMessage : styles.assistantMessage} key={message.id}>
                  <p className={styles.speaker}>{message.role === "user" ? "내가 전한 이야기" : "자산승계360 AI"}</p>
                  <div className={styles.messageText}>{text}</div>
                </article>;
              })}
              {configured === false && !hasMessages && <p className={styles.localExplanation}>{connectionError ? "AI 연결을 확인하지 못했어요. " : ""}지금은 입력 내용을 기본 규칙으로 정리해요. 요약을 직접 고쳐 보고서를 볼 수 있어요.</p>}
              {localNotice && <div className={styles.localGuidance} role="status"><span>입력 안내</span><p>{localNotice}</p></div>}
              {busy && <div className={styles.thinking} role="status"><span aria-hidden="true" />{status === "submitted" ? "이야기를 읽고 있어요…" : "답변을 작성하고 있어요…"}<button onClick={() => { void stop(); setCancelled(true); }}>응답 중지</button></div>}
              {(error || cancelled) && <div className={styles.errorNotice} role="alert"><p>{cancelled ? "응답을 중지했어요. 입력 내용은 그대로 남아 있어요." : "답변을 가져오지 못했어요. 입력한 내용은 남아 있으니 다시 시도하거나 요약을 직접 확인해 주세요."}</p><div>{configured && <button disabled={busy} onClick={() => void retryResponse()}><RotateCcw size={15} aria-hidden="true" /> 다시 시도</button>}<button onClick={openReview}>요약 직접 확인</button></div></div>}
              {readyForReview && hasMessages && !busy && <button className={styles.inlineReview} onClick={openReview}><FileText size={18} aria-hidden="true" /><span>이제 정리한 내용을 확인해 볼까요?</span><ArrowRight size={18} aria-hidden="true" /></button>}
            </div> : <div className={styles.reviewPanel}>
              <button className={styles.backToChat} onClick={() => setStage("chat")}><ArrowLeft size={16} aria-hidden="true" /> 대화로 돌아가기</button>
              <p className={styles.eyebrow}>보고서 작성 전 · 마지막 확인</p>
              <h2 ref={reviewRef} tabIndex={-1}>제가 전한 상황과 맞나요?</h2>
              <p className={styles.reviewIntro}>아래 내용은 아직 확인 전이에요. 다른 부분은 수정하거나 지워주세요. 모르는 내용은 ‘모름’으로 적어도 괜찮아요.</p>
              <div className={styles.reviewFields}>{CHAT_FIELD_KEYS.filter(key => state.facts[key] || missing.includes(key) || ["topic", "spouse", "children", "debt", "pastGifts", "goal"].includes(key)).map(renderField)}</div>
              <details className={styles.moreFields}><summary>그 밖의 항목 추가</summary><div>{CHAT_FIELD_KEYS.filter(key => !state.facts[key] && !missing.includes(key) && !["topic", "spouse", "children", "debt", "pastGifts", "goal"].includes(key)).map(renderField)}</div></details>
              <label className={styles.confirmRow}><input type="checkbox" data-tax-enable checked={taxEnabled} onChange={event => { invalidateReport(); setTaxEnabled(event.target.checked); }} /><span>예상 세액 비교 포함</span></label>
              {taxEnabled ? <TaxComparisonEditor value={taxInput} onChange={next => {
                invalidateReport();
                setTaxInput(next.track !== taxInput.track ? createTaxInputFromChat(stateRef.current, next.track) : { ...next, confirmed: false });
              }} /> : <p className={styles.reportFootnote}>세액 비교를 제외하면 확인한 사실과 검토 후보만 보고서에 표시합니다.</p>}
              {missing.length > 0 && <p className={styles.requiredNotice}>보고서를 준비하려면 {missing.map(key => CHAT_FIELD_LABELS[key]).join(", ")}을 먼저 알려주세요. 자산 금액을 모르면 자산 종류와 ‘금액 모름’을 함께 적어주세요.</p>}
              {editingIds.size > 0 && <p className={styles.requiredNotice} role="status">수정 중인 항목을 저장하거나 취소한 뒤 확인해 주세요.</p>}
              {input.trim() && <p className={styles.requiredNotice} role="status">아직 보내지 않은 이야기가 있어요. 입력창의 내용을 보내거나 지운 뒤 확인해 주세요.</p>}
              <label className={styles.confirmRow}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={!readyForReview || busy || editingIds.size > 0 || Boolean(input.trim())} /><span>정리된 내용이 제가 전달한 상황과 맞는지 확인했습니다.</span></label>
              <button className={styles.reportButton} disabled={!confirmed || !readyForReview || busy || reportOpening || editingIds.size > 0 || Boolean(input.trim())} onClick={() => void openReport()}>{reportOpening ? "보고서를 준비하고 있어요…" : "확인한 내용으로 보고서 보기"}<ArrowRight size={19} aria-hidden="true" /></button>
              {reviewError && <p className={styles.requiredNotice} role="alert">{reviewError}</p>}
              <p className={styles.reportFootnote}>확인한 계산 조건으로 예상 세액과 대안별 차이를 계산해요.<br />평가액·공제 요건 또는 가정이 바뀌면 결과도 달라집니다.</p>
            </div>}

            {hasNewText && stage === "chat" && <button className={styles.jumpButton} onClick={() => { if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight; shouldFollow.current = true; setHasNewText(false); }}><ArrowDown size={16} aria-hidden="true" /> 새 내용 보기</button>}
            <form className={styles.composerArea} onSubmit={event => { event.preventDefault(); void submitMessage(); }}>
              <label htmlFor="diagnosis-message" className={styles.composerLabel}>{stage === "review" ? "더할 이야기가 있으면 이어서 말씀해주세요" : "편하게 적어주세요"}</label>
              <div className={styles.composer}>
                <textarea id="diagnosis-message" ref={inputRef} value={input} rows={2} maxLength={6000} disabled={!hydrated || reportOpening} placeholder={hasMessages ? "빠진 내용이나 바꾸고 싶은 내용을 적어주세요…" : "예: 부모님 집을 미리 증여받는 게 좋을지 고민이에요…"} onChange={event => { invalidateReport(); setInput(event.target.value); }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.keyCode !== 229) { event.preventDefault(); void submitMessage(); } }} />
                {busy ? <button className={styles.sendButton} type="button" aria-label="응답 중지" onClick={() => { void stop(); setCancelled(true); }}><Square size={20} aria-hidden="true" /></button> : <button className={styles.sendButton} type="submit" disabled={!input.trim() || !hydrated || configured === null || reportOpening} aria-label="메시지 보내기"><Send size={21} aria-hidden="true" /></button>}
              </div>
              <div className={styles.composerMeta}><p>이름, 연락처, 주민등록번호는 적지 마세요.</p><span>Enter 전송 · Shift+Enter 줄바꿈</span></div>
            </form>
          </div>
        </div>

        {stage === "chat" && <aside className={styles.summary} aria-label="정리 중인 사실 요약">
          <button className={styles.summaryToggle} onClick={() => setSummaryOpen(!summaryOpen)} aria-expanded={summaryOpen} aria-controls="diagnosis-summary"><div><span className={styles.eyebrow}>CASE NOTE</span><h2>현재 정리된 내용 <span>{factsCount}</span></h2></div><ChevronDown size={20} className={summaryOpen ? styles.rotate : ""} aria-hidden="true" /></button>
          <div id="diagnosis-summary" className={`${styles.summaryBody} ${summaryOpen ? styles.summaryBodyOpen : ""}`}>
            <div className={styles.summaryStatus}><span className={styles.pendingBadge}>확인 전</span><p>이야기에서 찾은 내용을 모아둘게요.<br />직접 고치거나 항목을 추가할 수 있어요.</p></div>
            <div className={styles.summaryFields}>{factsCount === 0 ? <div className={styles.emptySummary}><div><span>01</span><p>가족과 자산의 상황</p></div><div><span>02</span><p>준비하고 싶은 일</p></div><div><span>03</span><p>추가로 확인할 내용</p></div><p>한 번에 모두 말하지 않아도 괜찮아요.</p></div> : CHAT_FIELD_KEYS.filter(key => state.facts[key]).map(renderField)}</div>
            <button className={styles.addFieldButton} onClick={() => setShowAllFields(!showAllFields)}>{showAllFields ? <X size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}{showAllFields ? "추가 항목 닫기" : "직접 항목 추가"}</button>
            {showAllFields && <div className={styles.additionalFields}>{CHAT_FIELD_KEYS.filter(key => !state.facts[key]).map(renderField)}</div>}
            {hasMessages && missing.length > 0 && <p className={styles.missingSummary}>조금 더 알려주세요: {missing.map(key => CHAT_FIELD_LABELS[key]).join(", ")}</p>}
            <button className={styles.reviewButton} onClick={openReview} disabled={busy || !hydrated}><FileText size={17} aria-hidden="true" /> 정리 내용 확인하기 <ArrowRight size={17} aria-hidden="true" /></button>
            <p className={styles.summaryFootnote}>직접 확인한 내용으로만<br />보고서를 준비합니다.</p>
          </div>
        </aside>}
      </div>
      <div className={styles.footer}><span>자산승계360 · 우리 가족의 다음을 준비하는 시간</span><Link href={`/precheck/form${topic ? `?purpose=${encodeURIComponent(params.get("purpose") ?? "")}` : ""}`}>기존 문답형으로 입력하기 <ArrowRight size={13} aria-hidden="true" /></Link></div>
    </section>
  );
}

function FactEditor({ fieldKey, fact, disabled, onSave, onRemove, onEditingChange }: { fieldKey: ChatFieldKey; fact: ChatState["facts"][ChatFieldKey]; disabled: boolean; onSave: (key: ChatFieldKey, value: string) => void; onRemove: (key: ChatFieldKey) => void; onEditingChange: (id: string, editing: boolean) => void }) {
  const editorId = useId();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(fact?.value ?? "");
  const editRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (!editing) setValue(fact?.value ?? ""); }, [fact?.value, editing]);
  useEffect(() => { if (editing) editRef.current?.focus(); }, [editing]);
  useEffect(() => { onEditingChange(editorId, editing); return () => onEditingChange(editorId, false); }, [editing, editorId, onEditingChange]);
  return <div className={styles.factRow}>
    <div className={styles.factHeading}><h3>{CHAT_FIELD_LABELS[fieldKey]}</h3>{!editing && <button aria-label={`${CHAT_FIELD_LABELS[fieldKey]} ${fact ? "수정" : "추가"}`} title={fact ? "수정" : "추가"} disabled={disabled} onClick={() => { setValue(fact?.value ?? ""); setEditing(true); }}>{fact ? <Pencil size={14} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}</button>}</div>
    {editing ? <div className={styles.factEditing}>
      <textarea ref={editRef} aria-label={`${CHAT_FIELD_LABELS[fieldKey]} 입력`} value={value} rows={2} maxLength={1000} placeholder={FIELD_HINTS[fieldKey]} onChange={event => setValue(event.target.value)} />
      <div className={styles.editActions}>{fact && <button className={styles.removeButton} aria-label={`${CHAT_FIELD_LABELS[fieldKey]} 삭제`} disabled={disabled} onClick={() => { onRemove(fieldKey); setEditing(false); }}><Trash2 size={14} aria-hidden="true" /> 삭제</button>}<button disabled={disabled} onClick={() => setEditing(false)}>취소</button><button className={styles.saveButton} disabled={disabled || !value.trim()} onClick={() => { onSave(fieldKey, value); setEditing(false); }}><Check size={14} aria-hidden="true" /> 저장</button></div>
    </div> : <p className={fact ? styles.factValue : styles.factEmpty}>{fact?.value ?? "아직 알려주지 않으셨어요"}</p>}
    {!editing && fact?.evidence && <details className={styles.evidence}><summary>어떤 말에서 정리했나요?</summary><p>“{fact.evidence}”</p></details>}
  </div>;
}
