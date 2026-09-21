"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowDown, ArrowLeft, ArrowRight, Check, ChevronDown, FileText, Pencil, Plus, RotateCcw, Send, ShieldCheck, Square, Trash2, X } from "lucide-react";
import { clearAssessmentForSession, saveAssessmentForSession } from "@/lib/assessment";
import { CHAT_FIELD_KEYS, CHAT_FIELD_LABELS, applyChatPatches, createChatState, getCurrentFactSources, getMissingRequiredFields, getPendingFactSources, hasPendingFactRequests, removeCurrentFact, resolvePendingFact, validateChatState } from "@/lib/chat/intake";
import type { ChatFactSource, ChatFieldKey, ChatMessage, ChatState, PendingFactResolution } from "@/lib/chat/intake";
import type { DiagnosisUIMessage } from "@/lib/chat/agent";
import { extractAssertedChatPatches, extractLocalChatPatches, getLocalChatReply } from "@/lib/chat/local";
import { groundingFailure, planTaxQuery } from "@/lib/chat/tax-grounding";
import { getAssistantReply, SAFE_REVIEW_MESSAGE } from "@/lib/chat/choices";
import type { DiagnosisReply } from "@/lib/chat/choices";
import { getGuidedChatTurn } from "@/lib/chat/guided";
import { getChatErrorNotice, isIncompleteChatResponse } from "@/lib/chat/response";
import { buildConfirmedTaxAssessmentSnapshot, createTaxInputFromChat, taxFactsSignature } from "@/lib/chat/tax";
import { calculateTaxComparison, validateTaxComparisonInput } from "@/lib/tax-comparison";
import type { TaxComparisonInput } from "@/lib/tax-comparison";
import { TaxComparisonEditor } from "./TaxComparisonEditor";
import styles from "./DiagnosisChat.module.css";
import { useDiagnosisViewport } from "./useDiagnosisViewport";
import { formsHrefFromPrecheck } from "@/lib/forms/entry";

const DRAFT_KEY = "as360.chat.draft.v1";
// Retain the current tab's draft during client navigation if sessionStorage is blocked.
let volatileDraft: string | null = null;
const TOPICS: Record<string, string> = {
  inheritance: "상속", gift: "증여", capital_gains: "양도", "capital-gains": "양도", business: "가업상속", business_succession: "가업상속", business_inheritance: "가업상속",
  "상속": "상속", "증여": "증여", "양도": "양도", "가업승계": "가업상속", "가업상속": "가업상속",
};
const START_TOPICS = ["상속", "증여", "양도", "가업상속"] as const;
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
  const [taxInput, setTaxInput] = useState<TaxComparisonInput>(() => createTaxInputFromChat(createChatState()));
  const [taxSignature, setTaxSignature] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [localNotice, setLocalNotice] = useState("");
  const [cancelled, setCancelled] = useState(false);
  const [incompleteResponse, setIncompleteResponse] = useState(false);
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
  const workspaceRef = useDiagnosisViewport(stage, input, inputRef, transcriptRef);
  const reviewRef = useRef<HTMLHeadingElement>(null);
  const shouldFollow = useRef(true);
  const [hasNewText, setHasNewText] = useState(false);
  const transport = useRef(new DefaultChatTransport<DiagnosisUIMessage>({ api: "/api/diagnosis" }));
  const { messages, setMessages, sendMessage, regenerate, status, error, clearError, stop } = useChat<DiagnosisUIMessage>({
    transport: transport.current,
    onFinish: (completion) => setIncompleteResponse(isIncompleteChatResponse(completion)),
  });
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
        const lastMessage = restored.messages.at(-1);
        setIncompleteResponse(Boolean(lastMessage && (draft?.responseFailed === true
          || (lastMessage.role === "assistant" && !getAssistantReply(lastMessage.text)))));
        const restoredTax = validateTaxComparisonInput(draft?.taxInput);
        const signature = taxFactsSignature(restored);
        setTaxInput(restoredTax && draft?.taxSignature === signature ? { ...restoredTax, confirmed: false } : createTaxInputFromChat(restored));
        setTaxSignature(signature);
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
    volatileDraft = JSON.stringify({ version: 1, state, input, reportId: reportId.current, taxInput, taxSignature, responseFailed: incompleteResponse || cancelled || Boolean(error) || busy });
    try {
      window.sessionStorage.setItem(DRAFT_KEY, volatileDraft);
    } catch {
      setStorageNotice("이 브라우저에서는 대화를 저장할 수 없어요. 새로고침하면 입력 내용이 사라질 수 있어요.");
    }
  }, [hydrated, state, input, taxInput, taxSignature, incompleteResponse, cancelled, error, busy]);

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
  }, [messages, localNotice, stage, busy]);

  // Composer sizing is handled with mobile viewport changes in useDiagnosisViewport.

  const missing = getMissingRequiredFields(state);
  const factsCount = CHAT_FIELD_KEYS.filter(key => state.facts[key]).length;
  const firstUserMessage = state.messages.find(message => message.role === "user");
  const hasMessages = Boolean(firstUserMessage);
  const displayTopic = TOPICS[firstUserMessage?.text ?? ""] ?? topic;
  const readyForReview = missing.length === 0;
  const hasPendingRequests = hasPendingFactRequests(state);
  const taxPreview = useMemo(() => calculateTaxComparison(taxInput), [taxInput]);
  const readyForEstimate = taxPreview.status === "ready" && taxSignature === taxFactsSignature(state);
  const latestAssistantReply = useMemo(() => {
    const latest = [...messages].reverse().find(message => message.role === "assistant");
    if (!latest) return null;
    const text = latest.parts.filter(part => part.type === "text").map(part => part.text).join("");
    return getAssistantReply(text);
  }, [messages]);
  const showSampleReport = latestAssistantReply?.message === SAFE_REVIEW_MESSAGE;

  async function submitMessage(quickReply?: string) {
    const text = quickReply ?? input.trim();
    const submittedText = quickReply === undefined && topic && !stateRef.current.messages.some(message => message.role === "user")
      ? `검토 주제: ${topic}\n\n${text}` : text;
    const guided = getGuidedChatTurn(stateRef.current, submittedText);
    if (!text || busy || sending.current || !hydrated || (configured === null && !guided) || reportOpening) return;
    sending.current = true;
    invalidateReport();
    clearError();
    setCancelled(false);
    setIncompleteResponse(false);
    setStage("chat");
    if (quickReply === undefined) setInput("");
    shouldFollow.current = true;
    const message: ChatMessage = { id: makeId(), role: "user", text: submittedText, created_at: new Date().toISOString() };
    let next: ChatState = { ...stateRef.current, messages: [...stateRef.current.messages, message] };
    const taxQuestion = planTaxQuery(submittedText, next.facts.topic?.value ?? topic);
    if (guided) next = applyChatPatches(next, guided.patches, message.id);
    else if (taxQuestion) next = applyChatPatches(next, extractAssertedChatPatches(submittedText, next), message.id);
    else if (!configured) next = applyChatPatches(next, extractLocalChatPatches(submittedText, next), message.id);
    commit(next);
    try {
      if (guided) {
        next = { ...next, messages: [...next.messages, { id: makeId(), role: "assistant", text: JSON.stringify(guided.reply), created_at: new Date().toISOString() }] };
        commit(next);
        setMessages(toUiMessages(next));
        setLocalNotice("");
      } else if (configured) {
        setLocalNotice("");
        await sendMessage({ id: message.id, role: "user", parts: [{ type: "text", text: submittedText }] }, { body: { facts: next.facts } });
      } else {
        // Save the local question too so its choices and context survive reload.
        const failed = groundingFailure("unavailable");
        const reply = taxQuestion ? { message: "현재 AI·세법 조회 연결이 준비되지 않아 근거 있는 답변을 드릴 수 없습니다. 입력은 유지되며 직접 입력이나 전문가 상담을 계속할 수 있습니다.", choices: [], grounding: { status: failed.status, sources: [], notice: failed.notice } } : getLocalChatReply(next);
        next = { ...next, messages: [...next.messages, { id: makeId(), role: "assistant", text: JSON.stringify(reply), created_at: new Date().toISOString() }] };
        commit(next);
        setMessages(toUiMessages(next));
        setLocalNotice("");
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
    const message: ChatMessage = { id: makeId(), role: "user", text: `정리 내용에서 ${CHAT_FIELD_LABELS[key]} 항목을 삭제했어요. 이 항목은 다시 확인이 필요해요.`, created_at: new Date().toISOString() };
    const next = removeCurrentFact(stateRef.current, key, message);
    commit(next);
    setMessages(toUiMessages(next));
  }

  function resolveRequest(key: ChatFieldKey, requestId: string, resolution: PendingFactResolution) {
    if (busy) return;
    const next = resolvePendingFact(stateRef.current, key, requestId, resolution, { id: makeId(), created_at: new Date().toISOString() });
    if (next === stateRef.current) {
      setReviewError("선택한 요청이나 항목이 바뀌었습니다. 내용을 다시 확인해 주세요.");
      return;
    }
    invalidateReport();
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
      if (taxSignature !== taxFactsSignature(stateRef.current)) throw new Error("대화가 바뀌었습니다. 새 계산 조건을 확인해 주세요.");
      const snapshot = buildConfirmedTaxAssessmentSnapshot(stateRef.current, { ...taxInput, confirmed: true, confirmedAt }, { confirmed: true, confirmedAt });
      const persisted = saveAssessmentForSession(snapshot);
      reportId.current = snapshot.assessment_id;
      volatileDraft = JSON.stringify({ version: 1, state: stateRef.current, input, reportId: snapshot.assessment_id, taxInput, taxSignature });
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
    setIncompleteResponse(false);
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
    setIncompleteResponse(false);
    setResetRequested(false);
    setSummaryOpen(false);
    setShowAllFields(false);
    setTaxInput(createTaxInputFromChat(next));
    setTaxSignature(taxFactsSignature(next));
    clearError();
    inputRef.current?.focus();
  }

  const renderField = (key: ChatFieldKey) => (
    <FactEditor key={`${stage}-${key}`} fieldKey={key} fact={state.facts[key]} disabled={busy} onSave={editFact} onRemove={removeFact} onResolve={resolveRequest} onEditingChange={updateEditing} />
  );

  return (
    <section ref={workspaceRef} className={styles.workspace} aria-label="자산승계 사전진단 대화"
      data-chat-layout="mobile-fit-v1" data-chat-stage={stage} data-chat-opening={!hasMessages} data-summary-open={summaryOpen}>
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
            <div><span className={styles.eyebrow}>무료 사전진단{displayTopic ? ` · ${displayTopic}` : ""}</span><h1>먼저, 이야기를 들려주세요.</h1></div>
            <span className={styles.privateBadge}><ShieldCheck size={15} aria-hidden="true" /> 이름·연락처 없이</span>
          </div>
          <div className={`${styles.connection} ${configured ? styles.connected : ""}`} role="status">
            <span className={styles.statusDot} aria-hidden="true" />
            {configured === null ? "연결 상태 확인 중" : configured ? "AI와 대화 중" : "AI 연결 전 · 입력 정리 모드"}
          </div>
          <Link href={formsHrefFromPrecheck(state)} className={styles.relatedForms} data-related-forms>
            <FileText size={16} aria-hidden="true" /> 관련 서류 보기 <ArrowRight size={15} aria-hidden="true" />
          </Link>

          <div className={styles.chatSurface}>
            {stage === "chat" ? <div ref={transcriptRef} className={`${styles.transcript} ${!hasMessages ? styles.openingTranscript : ""}`} role="log" aria-label="대화 내용" aria-live="polite" aria-relevant="additions text" onScroll={event => { const node = event.currentTarget; shouldFollow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 100; if (shouldFollow.current) setHasNewText(false); }}>
              <div className={styles.welcome}>
                <p className={styles.welcomeTitle}>안녕하세요. 재산과 관련된 세금에 관해 무엇이 궁금하세요?</p>
                {!hasMessages && <div className={styles.topicButtons} role="group" aria-label="상담 주제 선택">
                  {START_TOPICS.map(label => <button key={label} type="button" className={styles.topicButton} onClick={() => void submitMessage(label)} disabled={!hydrated || busy || reportOpening}>{label}</button>)}
                </div>}
              </div>

              {messages.map(message => {
                const text = message.parts.filter(part => part.type === "text").map(part => part.text).join("");
                const reply = message.role === "assistant" ? getAssistantReply(text) : null;
                const visibleText = message.role === "assistant" ? reply?.message : text;
                if (!visibleText) return null;
                const showChoices = reply && reply.choices.length > 0 && message.id === messages.at(-1)?.id
                  && !busy && !error && !incompleteResponse && !cancelled;
                return <article className={message.role === "user" ? styles.userMessage : styles.assistantMessage} key={message.id}>
                  <p className={styles.speaker}>{message.role === "user" ? "내가 전한 이야기" : configured === false ? "입력 안내" : "자산승계360 AI"}</p>
                  <div className={styles.messageText}>{visibleText}</div>
                  {reply?.grounding && <div aria-label="세법 조회 근거">
                    <p>{reply.grounding.notice}</p>
                    {reply.grounding.sources.map(source => <details key={source.id}>
                      <summary><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a> · {source.agency}</summary>
                      <blockquote>{source.quote}</blockquote>
                      <p>조회: {source.retrievedAt.slice(0, 10)}{source.publishedDate ? ` · 회신일: ${source.publishedDate}` : ""}{source.effectiveDate ? ` · 조문 시행일: ${source.effectiveDate}` : " · 적용 시점 미확인"}</p>
                    </details>)}
                    <Link href="/consultation">전문가에게 직접 문의</Link>
                  </div>}
                  {showChoices && <ReplyChoices
                    reply={reply}
                    disabled={!hydrated || reportOpening}
                    isSubmitDisabled={value => !hydrated || reportOpening || (configured === null && !getGuidedChatTurn(stateRef.current, value))}
                    onSubmit={value => void submitMessage(value)}
                    onWrite={value => {
                      if (value && !input.trim()) {
                        invalidateReport();
                        setInput(value);
                      }
                      inputRef.current?.focus();
                    }}
                  />}
                </article>;
              })}
              {configured === false && !hasMessages && <p className={styles.localExplanation}>{connectionError ? "AI 연결을 확인하지 못했어요. " : ""}지금은 입력 내용을 기본 규칙으로 정리해요. 요약을 직접 고쳐 보고서를 볼 수 있어요.</p>}
              {localNotice && <div className={styles.localGuidance} role="status"><span>입력 안내</span><p>{localNotice}</p></div>}
              {busy && <div className={styles.thinking} role="status"><span aria-hidden="true" />{status === "submitted" ? "이야기를 읽고 있어요…" : "답변을 작성하고 있어요…"}<button onClick={() => { void stop(); setCancelled(true); }}>응답 중지</button></div>}
              {(error || incompleteResponse || cancelled) && <div className={styles.errorNotice} role="alert"><p>{cancelled ? "응답을 중지했어요. 입력 내용은 그대로 남아 있어요." : getChatErrorNotice(error)}</p><div>{configured && <button disabled={busy} onClick={() => void retryResponse()}><RotateCcw size={15} aria-hidden="true" /> 다시 시도</button>}<button onClick={openReview}>요약 직접 확인</button></div></div>}
              {showSampleReport && !busy && <Link href="/sample-report" className={styles.sampleReportLink}><FileText size={19} aria-hidden="true" /><span><strong>7장 샘플 보고서 보기</strong><small>가상 사례 보고서 · 바로 열기</small></span><ArrowRight size={19} aria-hidden="true" /></Link>}
              {readyForReview && hasMessages && !busy && <button className={styles.inlineReview} onClick={openReview}><FileText size={18} aria-hidden="true" /><span>내 상황에 맞춘 보고서 준비하기</span><ArrowRight size={18} aria-hidden="true" /></button>}
            </div> : <div className={styles.reviewPanel}>
              <button className={styles.backToChat} onClick={() => setStage("chat")}><ArrowLeft size={16} aria-hidden="true" /> 대화로 돌아가기</button>
              <p className={styles.eyebrow}>보고서 작성 전 · 마지막 확인</p>
              <h2 ref={reviewRef} tabIndex={-1}>제가 전한 상황과 맞나요?</h2>
              <p className={styles.reviewIntro}>아래 내용은 아직 확인 전이에요. 다른 부분은 수정하거나 지워주세요. 모르는 내용은 ‘모름’으로 적어도 괜찮아요.</p>
              <div className={styles.reviewFields}>{CHAT_FIELD_KEYS.filter(key => state.facts[key] || missing.includes(key) || ["topic", "spouse", "children", "debt", "pastGifts", "goal"].includes(key)).map(renderField)}</div>
              <details className={styles.moreFields}><summary>그 밖의 항목 추가</summary><div>{CHAT_FIELD_KEYS.filter(key => !state.facts[key] && !missing.includes(key) && !["topic", "spouse", "children", "debt", "pastGifts", "goal"].includes(key)).map(renderField)}</div></details>
              <p className={styles.reportFootnote}>보고서에는 선택한 유형의 추정 세액과 대안별 차이가 포함됩니다. 아래 계산 조건을 확인해 주세요.</p>
              <TaxComparisonEditor value={taxInput} onChange={next => {
                invalidateReport();
                setTaxInput(next.track !== taxInput.track ? createTaxInputFromChat(stateRef.current, next.track) : { ...next, confirmed: false });
              }} />
              {!readyForEstimate && <p className={styles.requiredNotice} data-estimate-required>추정 세액을 계산할 조건이 아직 남아 있어요. 위에서 필요한 항목을 확인하면 보고서를 열 수 있습니다.</p>}
              {missing.length > 0 && <p className={styles.requiredNotice}>보고서를 준비하려면 {missing.map(key => CHAT_FIELD_LABELS[key]).join(", ")}을 먼저 알려주세요. 자산 금액을 모르면 자산 종류와 ‘금액 모름’을 함께 적어주세요.</p>}
              {editingIds.size > 0 && <p className={styles.requiredNotice} role="status">수정 중인 항목을 저장하거나 취소한 뒤 확인해 주세요.</p>}
              {input.trim() && <p className={styles.requiredNotice} role="status">아직 보내지 않은 이야기가 있어요. 입력창의 내용을 보내거나 지운 뒤 확인해 주세요.</p>}
              {hasPendingRequests && <p className={styles.requiredNotice} role="status">확인 대기 요청이 남아 있어요. 위 요청에서 대상을 확인하거나 요청을 취소해 주세요.</p>}
              <label className={styles.confirmRow}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={!readyForReview || hasPendingRequests || busy || editingIds.size > 0 || Boolean(input.trim())} /><span>정리된 내용이 제가 전달한 상황과 맞는지 확인했습니다.</span></label>
              <button className={styles.reportButton} disabled={!confirmed || !readyForReview || !readyForEstimate || hasPendingRequests || busy || reportOpening || editingIds.size > 0 || Boolean(input.trim())} onClick={() => void openReport()}>{reportOpening ? "보고서를 준비하고 있어요…" : "확인한 내용으로 보고서 보기"}<ArrowRight size={19} aria-hidden="true" /></button>
              <Link href="/sample-report" className={`${styles.sampleReportLink} ${styles.reviewSampleLink}`}><FileText size={19} aria-hidden="true" /><span><strong>7장 샘플 보고서 먼저 보기</strong><small>입력 완료 전에도 바로 볼 수 있어요</small></span><ArrowRight size={19} aria-hidden="true" /></Link>
              {reviewError && <p className={styles.requiredNotice} role="alert">{reviewError}</p>}
              <p className={styles.reportFootnote}>확인한 계산 조건으로 예상 세액과 대안별 차이를 계산해요.<br />평가액·공제 요건 또는 가정이 바뀌면 결과도 달라집니다.</p>
            </div>}

            {hasNewText && stage === "chat" && <button className={styles.jumpButton} onClick={() => { if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight; shouldFollow.current = true; setHasNewText(false); }}><ArrowDown size={16} aria-hidden="true" /> 새 내용 보기</button>}
            <form className={styles.composerArea} onSubmit={event => { event.preventDefault(); void submitMessage(); }}>
              <label htmlFor="diagnosis-message" className={styles.composerLabel}>{stage === "review" ? "더할 이야기가 있으면 이어서 말씀해주세요" : hasMessages ? "선택하거나 편하게 적어주세요" : "또는 채팅으로 말씀해 주세요"}</label>
              <div className={styles.composer}>
                <textarea id="diagnosis-message" ref={inputRef} value={input} rows={2} maxLength={6000} disabled={!hydrated || reportOpening} placeholder={hasMessages ? "답변을 적어주세요…" : "궁금한 점을 적어주세요…"} onChange={event => { invalidateReport(); setInput(event.target.value); }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.keyCode !== 229) { event.preventDefault(); void submitMessage(); } }} />
                {busy ? <button className={styles.sendButton} type="button" aria-label="응답 중지" onClick={() => { void stop(); setCancelled(true); }}><Square size={20} aria-hidden="true" /></button> : <button className={styles.sendButton} type="submit" disabled={!input.trim() || !hydrated || configured === null || reportOpening} aria-label="메시지 보내기"><Send size={21} aria-hidden="true" /></button>}
              </div>
              <div className={styles.composerMeta}><span>Enter 전송 · Shift+Enter 줄바꿈</span></div>
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
            <p className={styles.summaryFootnote}>직접 확인한 내용으로만<br />보고서를 준비합니다.</p>
          </div>
        </aside>}
      </div>
    </section>
  );
}

const EXCLUSIVE_MULTI_CHOICE = /^(?:해당 없음|없어요|없습니다|잘 모르겠어요|모르겠어요|아직 정하지 않았어요|확인이 필요해요)$/;
const VALID_EOK_AMOUNT = /^(?:[1-9]\d*(?:\.\d{1,2})?|0\.\d{1,2})$/;

function ReplyChoices({
  reply,
  disabled,
  isSubmitDisabled,
  onSubmit,
  onWrite,
}: {
  reply: DiagnosisReply;
  disabled: boolean;
  isSubmitDisabled: (value: string) => boolean;
  onSubmit: (value: string) => void;
  onWrite: (value: string) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [unknownAmounts, setUnknownAmounts] = useState<string[]>([]);
  const multiple = reply.selectionMode === "multiple";
  const assetAmounts = multiple && reply.inputMode === "assetAmounts";
  const orderedSelection = reply.choices.filter(choice => selected.includes(choice));
  const amountsComplete = orderedSelection.length > 0 && orderedSelection.every(choice => unknownAmounts.includes(choice) || VALID_EOK_AMOUNT.test(amounts[choice] ?? ""));
  const answer = assetAmounts
    ? amountsComplete
      ? ["재산 전체:", ...orderedSelection.map(choice => `${choice}: ${unknownAmounts.includes(choice) ? "금액 모름" : `${amounts[choice]}억 원`}`)].join("\n")
      : ""
    : orderedSelection.join(", ");
  const knownTotal = orderedSelection.reduce((sum, choice) => {
    if (unknownAmounts.includes(choice) || !VALID_EOK_AMOUNT.test(amounts[choice] ?? "")) return sum;
    return sum + Number(amounts[choice]);
  }, 0);
  const unknownCount = orderedSelection.filter(choice => unknownAmounts.includes(choice)).length;

  function toggle(choice: string) {
    if (selected.includes(choice)) {
      setSelected(previous => previous.filter(value => value !== choice));
      if (assetAmounts) {
        setAmounts(previous => {
          const next = { ...previous };
          delete next[choice];
          return next;
        });
        setUnknownAmounts(previous => previous.filter(value => value !== choice));
      }
      return;
    }
    if (EXCLUSIVE_MULTI_CHOICE.test(choice)) setSelected([choice]);
    else setSelected(previous => [...previous.filter(value => !EXCLUSIVE_MULTI_CHOICE.test(value)), choice]);
  }

  function changeAmount(choice: string, raw: string) {
    const value = raw.replace(/,/g, "").replace(/[^\d.]/g, "");
    if (value && !/^\d{0,9}(?:\.\d{0,2})?$/.test(value)) return;
    setAmounts(previous => ({ ...previous, [choice]: value }));
    setUnknownAmounts(previous => previous.filter(value => value !== choice));
    if (value) setSelected(previous => previous.includes(choice) ? previous : [...previous, choice]);
  }

  function toggleUnknownAmount(choice: string) {
    setSelected(previous => previous.includes(choice) ? previous : [...previous, choice]);
    setUnknownAmounts(previous => previous.includes(choice) ? previous.filter(value => value !== choice) : [...previous, choice]);
  }

  const selectionStatus = assetAmounts
    ? orderedSelection.length === 0
      ? "재산을 선택해 주세요"
      : !amountsComplete
        ? "선택한 재산의 금액을 입력하거나 ‘모름’을 선택해 주세요"
        : `${orderedSelection.length}개 · 확인된 금액 합계 ${Number(knownTotal.toFixed(2))}억 원${unknownCount ? ` · 금액 모름 ${unknownCount}개` : ""}`
    : orderedSelection.length > 0 ? `${orderedSelection.length}개 선택됨` : "선택해 주세요";

  return <div className={styles.replyActions}>
    {multiple && <p className={styles.multipleHint}>{assetAmounts ? "재산을 고르고 금액을 함께 적어주세요. 대략적인 금액도 괜찮아요." : "여러 개 선택할 수 있어요."}</p>}
    {assetAmounts ? <div className={styles.amountChoices} role="group" aria-label="재산 종류와 금액 입력">
      {reply.choices.map(choice => {
        const active = selected.includes(choice);
        const unknown = unknownAmounts.includes(choice);
        return <div key={choice} className={`${styles.amountChoiceRow} ${active ? styles.amountChoiceRowSelected : ""}`}>
          <button type="button" className={styles.amountAssetToggle} disabled={disabled} aria-pressed={active} onClick={() => toggle(choice)}>
            <span className={styles.choiceCheck} aria-hidden="true">{active && <Check size={14} />}</span>
            <span>{choice}</span>
          </button>
          <label className={styles.amountInputWrap}>
            <span className={styles.srOnly}>{choice} 금액</span>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              maxLength={12}
              aria-label={`${choice} 금액, 억 원 단위`}
              placeholder="금액"
              value={amounts[choice] ?? ""}
              disabled={disabled || unknown}
              onFocus={() => setSelected(previous => previous.includes(choice) ? previous : [...previous, choice])}
              onChange={event => changeAmount(choice, event.target.value)}
            />
            <span>억 원</span>
          </label>
          <button type="button" className={`${styles.unknownAmount} ${unknown ? styles.unknownAmountSelected : ""}`} disabled={disabled} aria-pressed={unknown} onClick={() => toggleUnknownAmount(choice)}>금액 모름</button>
        </div>;
      })}
    </div> : <div className={styles.replyChoices} role="group" aria-label={multiple ? "답변 복수 선택" : "답변 선택"}>
      {reply.choices.map(choice => {
        const active = selected.includes(choice);
        return <button key={choice} type="button" className={`${styles.replyChoice} ${active ? styles.replyChoiceSelected : ""}`} disabled={disabled || (!multiple && isSubmitDisabled(choice))} aria-pressed={multiple ? active : undefined} onClick={() => multiple ? toggle(choice) : onSubmit(choice)}>
          {multiple && <span className={styles.choiceCheck} aria-hidden="true">{active && <Check size={14} />}</span>}
          <span>{choice}</span>
        </button>;
      })}
    </div>}
    {multiple && <div className={styles.multipleActions}>
      <span className={styles.selectionCount} aria-live="polite">{selectionStatus}</span>
      <button type="button" className={styles.confirmChoices} disabled={!answer || isSubmitDisabled(answer)} onClick={() => onSubmit(answer)}>{assetAmounts ? "입력 완료" : "선택 완료"}{orderedSelection.length > 0 ? ` (${orderedSelection.length})` : ""}</button>
    </div>}
    <button type="button" className={styles.writeReply} disabled={disabled} onClick={() => onWrite(answer)}>직접 입력하기</button>
  </div>;
}

function FactEditor({ fieldKey, fact, disabled, onSave, onRemove, onResolve, onEditingChange }: { fieldKey: ChatFieldKey; fact: ChatState["facts"][ChatFieldKey]; disabled: boolean; onSave: (key: ChatFieldKey, value: string) => void; onRemove: (key: ChatFieldKey) => void; onResolve: (key: ChatFieldKey, requestId: string, resolution: PendingFactResolution) => void; onEditingChange: (id: string, editing: boolean) => void }) {
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
    </div> : <p className={fact?.value ? styles.factValue : styles.factEmpty}>{fact?.value || (fact ? "현재 유효한 항목 없음 · 확인 대기 요청 있음" : "아직 알려주지 않으셨어요")}</p>}
    {!editing && fact?.value && <details className={styles.evidence}><summary>어떤 말에서 정리했나요?</summary>{getCurrentFactSources(fact).map(source => <p key={source.messageId}>“{source.evidence}”</p>)}</details>}
    {fact && getPendingFactSources(fact).map(request => <PendingRequestEditor key={request.messageId} request={request} current={getCurrentFactSources(fact)} disabled={disabled || editing} onResolve={resolution => onResolve(fieldKey, request.messageId, resolution)} onEditingChange={onEditingChange} />)}
  </div>;
}

function PendingRequestEditor({ request, current, disabled, onResolve, onEditingChange }: {
  request: ChatFactSource; current: ChatFactSource[]; disabled: boolean;
  onResolve: (resolution: PendingFactResolution) => void; onEditingChange: (id: string, editing: boolean) => void;
}) {
  const editorId = useId();
  const [editing, setEditing] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [action, setAction] = useState<"replace" | "delete">("replace");
  const [value, setValue] = useState("");
  useEffect(() => { onEditingChange(editorId, editing); return () => onEditingChange(editorId, false); }, [editing, editorId, onEditingChange]);
  const validTarget = targetId === "new" ? action === "replace" : current.some(source => source.messageId === targetId);
  return <div className={styles.factEditing} role="group" aria-label={`확인 대기: ${request.value}`} data-pending-request={request.messageId}>
    <p className={styles.requiredNotice}>확인 대기: {request.value}</p>
    <details className={styles.evidence}><summary>요청 원문</summary><p>{request.evidence}</p></details>
    {editing && <>
      <select aria-label="요청 처리" value={action} disabled={disabled} onChange={event => setAction(event.target.value as "replace" | "delete")}>
        <option value="replace">내용 확인·대체</option><option value="delete">선택 항목 삭제</option>
      </select>
      <select aria-label="확인 대상 항목" style={{ width: "100%", maxWidth: "100%" }} value={targetId} disabled={disabled} onChange={event => setTargetId(event.target.value)}>
        <option value="">대상 선택</option>
        {current.map(source => <option key={source.messageId} value={source.messageId}>{source.value}</option>)}
        {action === "replace" && <option value="new">새 항목으로 확인</option>}
      </select>
      {action === "replace" && <textarea aria-label="확인할 내용" value={value} rows={2} maxLength={1000} disabled={disabled} onChange={event => setValue(event.target.value)} />}
    </>}
    <div className={styles.editActions}>
      <button disabled={disabled} onClick={() => onResolve({ action: "cancel" })}><X size={14} aria-hidden="true" /> 요청 취소</button>
      {editing ? <>
        <button disabled={disabled} onClick={() => setEditing(false)}>닫기</button>
        <button className={styles.saveButton} disabled={disabled || !validTarget || (action === "replace" && !value.trim())} onClick={() => {
          onResolve(action === "delete" ? { action, targetMessageId: targetId } : { action, targetMessageId: targetId === "new" ? undefined : targetId, value });
          setEditing(false);
        }}><Check size={14} aria-hidden="true" /> 이 요청 확인</button>
      </> : <button className={styles.saveButton} disabled={disabled} onClick={() => setEditing(true)}><Check size={14} aria-hidden="true" /> 대상 확인</button>}
    </div>
  </div>;
}
