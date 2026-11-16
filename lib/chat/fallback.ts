import { createUIMessageStreamResponse, NoObjectGeneratedError, type ModelMessage, type UIMessageChunk } from "ai";
import { acceptFactProposals, createDiagnosisAgent, diagnosisTurnSchema } from "./agent";
import { diagnosisReplySchema, hasAppOwnedHandoffClaim } from "./choices";
import type { ChatPatch } from "./intake";
import { BACKUP_GOOGLE_DIAGNOSIS_MODEL, DiagnosisResponseRejectedError, getDiagnosisPublicErrorCode, type DiagnosisRequest } from "./server";

type DiagnosisResponseOptions = DiagnosisRequest & {
  apiKey: string;
  model: string;
  abortSignal?: AbortSignal;
  headers?: HeadersInit;
  /** Shorter deadlines can be supplied by server-side tests only. */
  attemptTimeoutMs?: number;
};

const ATTEMPT_TIMEOUT_MS = 24_000;
const MAX_BUFFER_BYTES = 256 * 1024;
const MAX_BUFFER_CHUNKS = 4_096;

// This chat has no verified tax-law or calculation result input. Do not let
// numeric tax advice or completed external actions become an apparent result.
const TAX_AMOUNT = String.raw`\d[\d,]*(?:\.\d+)?\s*(?:%|퍼센트|(?:조|억|천\s*만|백\s*만|만|천)(?:\s*원)?|원)`;
const TAX_AMOUNT_SUBJECT = String.raw`(?:세율|공제(?:\s*(?:액|한도|금액))?|세액|절세(?:\s*(?:액|효과))|상속세|증여세|양도(?:소득)?세|세금)`;
const TAX_AMOUNT_LINK = String.raw`(?:\s|[은는이가을를로:：]|약|대략|예상(?:액)?|최대|최소|기본|일괄|총|정도|계산상|납부액|가능한\s*금액|받을\s*수\s*있는\s*금액)*`;
// A customer asset amount near "납부 재원" is context, not a tax result.
// Require a direct amount/claim relationship rather than nearby keywords.
const NUMERIC_TAX_CLAIM = new RegExp(String.raw`${TAX_AMOUNT_SUBJECT}${TAX_AMOUNT_LINK}${TAX_AMOUNT}|${TAX_AMOUNT}\s*(?:(?:을|를|이|가|의)\s*)?(?:공제|세액|절세|세금|상속세|증여세|양도(?:소득)?세|납부(?:하(?:세요|셔야|시면)|해야|합니다|해요|할\s*(?:세금|금액)|하면\s*(?:됩니다|돼요)))`);
const UNVERIFIED_TAX_ELIGIBILITY = /(?:공제|특례|감면)[^.!?\n]{0,28}(?:적용(?:됩니다|돼요|가능합니다|가능해요)|받을\s*수\s*있(?:습니다|어요)|대상(?:입니다|이에요)|요건을\s*충족(?:합니다|해요|했(?:습니다|어요)|하셨(?:습니다|어요)|한\s*상태(?:입니다|예요)|하므로|했으므로|하고\s*있(?:습니다|어요)))|(?:상속세|증여세|양도(?:소득)?세|세금)(?:은|는|이|가|부담은)?\s*(?:없(?:습니다|어요)|나오지\s*않|발생하지\s*않|면제|비과세)/;
// "완료되지 않았어요" and "접수했는지는 확인이 필요해요" are not
// completed actions. Match an affirmative predicate, not its word stem.
const COMPLETED_EXTERNAL_ACTION = /(?:상담|신청|예약|접수|저장|공유)(?:이|가|을|를)?[^.!?\n]{0,14}(?:완료(?:됐(?:습니다|어요)|되었(?:습니다|어요)|했습니다|했어요|합니다|입니다|예요|된\s*상태(?:입니다|예요)|(?=\s*(?:[.!]|$)))|(?:접수했|저장했|보냈|전송했|해\s*드렸)(?:습니다|어요))|(?:계산|산출)(?:해\s*보니|한\s*결과|했(?:습니다|어요))/;

function completedTurnChunks(proposals: ChatPatch[], reply: { message: string; choices: string[]; selectionMode?: "single" | "multiple"; inputMode?: "assetAmounts" }): UIMessageChunk[] {
  const id = globalThis.crypto.randomUUID();
  const toolCallId = `facts-${id}`;
  const textId = `reply-${id}`;
  return [
    { type: "start", messageId: `diagnosis-${id}` },
    { type: "start-step" },
    { type: "tool-input-available", toolCallId, toolName: "proposeFacts", input: { facts: proposals } },
    { type: "tool-output-available", toolCallId, output: { proposals } },
    { type: "text-start", id: textId },
    { type: "text-delta", id: textId, delta: JSON.stringify(reply) },
    { type: "text-end", id: textId },
    { type: "finish-step" },
    { type: "finish", finishReason: "stop" },
  ];
}

function canUseBackup(error: unknown) {
  if (error instanceof DiagnosisResponseRejectedError || NoObjectGeneratedError.isInstance(error)) return false;
  const seen = new Set<object>();
  let current = error;
  for (let depth = 0; depth < 8; depth += 1) {
    if (!current || typeof current !== "object" || seen.has(current)) break;
    seen.add(current);
    try {
      const { statusCode, cause } = current as { statusCode?: unknown; cause?: unknown };
      if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) return false;
      current = cause;
    } catch {
      return false;
    }
  }
  const code = getDiagnosisPublicErrorCode(error);
  // A different model cannot repair credentials, billing or bad API requests.
  // Only a transient server failure or recognizable transport timeout gets one
  // same-project backup. Invalid output, quota, billing and auth are terminal.
  if (code === "AI_PROVIDER_UNAVAILABLE") return true;
  if (code !== "AI_UNAVAILABLE" || !(error instanceof Error)) return false;
  return error.name === "TimeoutError"
    || (error instanceof TypeError && /fetch|network|failed to fetch/i.test(error.message))
    || (error as Error & { isRetryable?: boolean }).isRetryable === true;
}

async function collectAttempt(options: DiagnosisResponseOptions, model: string, cancelled: AbortSignal) {
  const deadline = new AbortController();
  const signal = AbortSignal.any([cancelled, deadline.signal]);
  const timeoutMs = Math.max(1, Math.min(options.attemptTimeoutMs ?? ATTEMPT_TIMEOUT_MS, ATTEMPT_TIMEOUT_MS));
  const timer = setTimeout(() => deadline.abort(new DOMException("AI attempt timed out", "TimeoutError")), timeoutMs);
  let stopWaiting: () => void = () => undefined;
  const aborted = new Promise<never>((_, reject) => {
    const onAbort = () => reject(signal.reason);
    stopWaiting = () => signal.removeEventListener("abort", onAbort);
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });

  const collect = async () => {
    signal.throwIfAborted();
    const modelMessages: ModelMessage[] = [];
    for (const message of options.messages) {
      const text = message.parts[0].text;
      if (!text.trim()) continue;
      modelMessages.push(message.role === "user"
        ? { role: "user", content: text }
        : { role: "assistant", content: text });
    }
    try {
      const result = await createDiagnosisAgent({
        apiKey: options.apiKey,
        model,
        messages: options.messages,
        facts: options.facts,
      }).generate({ messages: modelMessages, abortSignal: signal });
      signal.throwIfAborted();
      if (result.finalStep.finishReason === "content-filter") {
        throw new DiagnosisResponseRejectedError("AI response filtered");
      }
      const parsedTurn = diagnosisTurnSchema.safeParse(result.output);
      if (!parsedTurn.success) throw new DiagnosisResponseRejectedError("AI response failed turn validation");
      const turn = parsedTurn.data;
      const latest = options.messages[options.messages.length - 1];
      const proposals = acceptFactProposals(turn.facts, { id: latest.id, text: latest.parts[0].text });
      if (proposals.length !== turn.facts.length) {
        throw new DiagnosisResponseRejectedError("AI fact grounding failed");
      }
      const modelReply = diagnosisReplySchema.parse({ message: turn.message, choices: turn.choices, selectionMode: turn.selectionMode, inputMode: turn.inputMode });
      const visibleTexts = [modelReply.message, ...modelReply.choices];
      if (visibleTexts.some((text) => hasAppOwnedHandoffClaim(text) || NUMERIC_TAX_CLAIM.test(text) || UNVERIFIED_TAX_ELIGIBILITY.test(text) || COMPLETED_EXTERNAL_ACTION.test(text))) {
        throw new DiagnosisResponseRejectedError("AI response claimed an unverified result or action");
      }
      const chunks = completedTurnChunks(proposals, modelReply);
      const bytes = chunks.reduce((total, chunk) => total + Buffer.byteLength(JSON.stringify(chunk), "utf8"), 0);
      if (bytes > MAX_BUFFER_BYTES || chunks.length > MAX_BUFFER_CHUNKS) {
        throw new DiagnosisResponseRejectedError("AI response exceeded buffer limit");
      }
      return chunks;
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        throw new DiagnosisResponseRejectedError("AI response failed structured validation");
      }
      throw error;
    }
  };

  try {
    // The deadline also bounds setup/read failures that ignore an abort signal.
    return await Promise.race([collect(), aborted]);
  } finally {
    clearTimeout(timer);
    stopWaiting();
    deadline.abort();
  }
}

/** One bounded backup; emit facts and text only from the winning whole turn. */
export function createDiagnosisResponse(options: DiagnosisResponseOptions): Response {
  const disconnected = new AbortController();
  const cancelled = options.abortSignal
    ? AbortSignal.any([options.abortSignal, disconnected.signal])
    : disconnected.signal;
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      // Do not return this promise: response cancellation must reach cancel()
      // immediately, even while the provider is waiting for its first token.
      void (async () => {
        try {
          cancelled.throwIfAborted();
          let chunks: UIMessageChunk[];
          try {
            chunks = await collectAttempt(options, options.model, cancelled);
          } catch (error) {
            cancelled.throwIfAborted();
            if (options.model === BACKUP_GOOGLE_DIAGNOSIS_MODEL || !canUseBackup(error)) throw error;
            chunks = await collectAttempt(options, BACKUP_GOOGLE_DIAGNOSIS_MODEL, cancelled);
          }
          cancelled.throwIfAborted();
          for (const chunk of chunks) controller.enqueue(chunk);
        } catch (error) {
          if (!cancelled.aborted) {
            const code = getDiagnosisPublicErrorCode(error);
            const message = code === "AI_RATE_LIMITED"
              ? "AI 요청 한도에 도달해 응답을 받지 못했습니다. 직접 입력으로 계속할 수 있습니다."
              : code === "AI_AUTHENTICATION_FAILED"
                ? "AI 인증에 실패해 응답을 받지 못했습니다. 직접 입력으로 계속할 수 있습니다."
                : code === "AI_CREDIT_REQUIRED"
                  ? "AI 프로젝트의 결제 또는 사용 설정으로 응답을 받지 못했습니다. 직접 입력으로 계속할 수 있습니다."
                  : code === "AI_RESPONSE_REJECTED"
                    ? "AI 응답을 검증하지 못해 이번 답변과 사실을 반영하지 않았습니다. 다시 시도하거나 직접 입력으로 계속해 주세요."
                    : "AI 응답을 완료하지 못했습니다. 잠시 후 다시 시도하거나 직접 입력으로 계속해 주세요.";
            controller.enqueue({
              type: "error",
              errorText: `[${code}] ${message}`,
            });
          }
        } finally {
          if (!disconnected.signal.aborted) controller.close();
        }
      })();
    },
    cancel() {
      disconnected.abort();
    },
  });
  return createUIMessageStreamResponse({ stream, headers: options.headers });
}
