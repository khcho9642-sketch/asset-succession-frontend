import { createUIMessageStreamResponse, NoObjectGeneratedError, type ModelMessage, type UIMessageChunk } from "ai";
import { acceptFactProposals, createDiagnosisAgent, diagnosisTurnSchema } from "./agent";
import { diagnosisReplySchema, hasAppOwnedHandoffClaim } from "./choices";
import { applyChatPatches, type ChatPatch, type ChatState } from "./intake";
import { extractAssertedChatPatches, getLocalChatReply } from "./local";
import { BACKUP_GOOGLE_DIAGNOSIS_MODEL, getDiagnosisPublicErrorCode, type DiagnosisRequest } from "./server";
import { groundReply, isTaxCalculationRequest, planTaxQuery, type TaxResearch } from "./tax-grounding";
import { researchTaxQuestion } from "./tax-mcp";
import type { DiagnosisReply } from "./choices";

type DiagnosisResponseOptions = DiagnosisRequest & {
  apiKey: string;
  model: string;
  abortSignal?: AbortSignal;
  headers?: HeadersInit;
  /** Shorter deadlines can be supplied by server-side tests only. */
  attemptTimeoutMs?: number;
  research?: TaxResearch;
  /** Server-only dependency injection, never read from the request body. */
  lookup?: typeof researchTaxQuestion;
};

const ATTEMPT_TIMEOUT_MS = 24_000;
const MAX_BUFFER_BYTES = 256 * 1024;
const MAX_BUFFER_CHUNKS = 4_096;

class RejectedAttemptError extends Error {}

function stateAfterProposals(options: DiagnosisResponseOptions, proposals: ChatPatch[]): ChatState {
  const messages = options.messages.map((message, index) => ({
    id: message.id,
    role: message.role,
    text: message.parts[0].text,
    created_at: new Date(index * 1_000).toISOString(),
  }));
  const state: ChatState = { version: 1, messages, facts: { ...options.facts } };
  const latest = messages.at(-1);
  return latest ? applyChatPatches(state, proposals, latest.id) : state;
}

function completedTurnChunks(proposals: ChatPatch[], reply: DiagnosisReply): UIMessageChunk[] {
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
  if (error instanceof RejectedAttemptError) return false;
  const seen = new Set<object>();
  let current = error;
  for (let depth = 0; depth < 8; depth += 1) {
    if (!current || typeof current !== "object" || seen.has(current)) break;
    seen.add(current);
    try {
      const { statusCode, cause } = current as { statusCode?: unknown; cause?: unknown };
      if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500 && statusCode !== 429) return false;
      current = cause;
    } catch {
      return false;
    }
  }
  const code = getDiagnosisPublicErrorCode(error);
  // A different model cannot repair credentials, billing or bad API requests.
  // Unknown transport/stream errors and invalid completed output get one try.
  return code === "AI_PROVIDER_UNAVAILABLE" || code === "AI_RATE_LIMITED" || code === "AI_UNAVAILABLE";
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
        research: options.research,
      }).generate({ messages: modelMessages, abortSignal: signal });
      signal.throwIfAborted();
      if (result.finalStep.finishReason === "content-filter") {
        throw new RejectedAttemptError("AI response filtered");
      }
      const turn = diagnosisTurnSchema.parse(result.output);
      const latest = options.messages[options.messages.length - 1];
      const proposals = options.research
        ? extractAssertedChatPatches(latest.parts[0].text, stateAfterProposals(options, []))
        : acceptFactProposals(turn.facts, { id: latest.id, text: latest.parts[0].text });
      const modelReply = diagnosisReplySchema.parse({ message: turn.message, choices: turn.choices, selectionMode: turn.selectionMode, inputMode: turn.inputMode });
      let reply: DiagnosisReply = hasAppOwnedHandoffClaim(modelReply.message)
        ? getLocalChatReply(stateAfterProposals(options, proposals))
        : modelReply;
      if (options.research) {
        const grounded = !hasAppOwnedHandoffClaim(modelReply.message) && groundReply(modelReply.message, turn.citationIds, options.research);
        reply = grounded ? { ...modelReply, grounding: grounded }
          : { message: "조회된 근거와 AI 설명을 일치시키지 못해 세법 답변을 보류했습니다. 아래 원문을 확인하거나 질문을 구체적으로 다시 남겨주세요. 개인 세액은 계산 조건 확인 후 기존 계산기로 확인할 수 있습니다.", choices: [], grounding: { status: "invalid_response", sources: options.research.sources, notice: options.research.notice } };
      }
      const chunks = completedTurnChunks(proposals, reply);
      const bytes = chunks.reduce((total, chunk) => total + Buffer.byteLength(JSON.stringify(chunk), "utf8"), 0);
      if (bytes > MAX_BUFFER_BYTES || chunks.length > MAX_BUFFER_CHUNKS) {
        throw new RejectedAttemptError("AI response exceeded buffer limit");
      }
      return chunks;
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error) && error.finishReason === "content-filter") {
        throw new RejectedAttemptError("AI response filtered");
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
          const latest = options.messages.at(-1)!;
          if (isTaxCalculationRequest(latest.parts[0].text)) {
            const proposals = extractAssertedChatPatches(latest.parts[0].text, stateAfterProposals(options, []));
            for (const chunk of completedTurnChunks(proposals, { message: "개인 세액은 확인된 입력으로 기존 계산기에서 계산합니다. 내용 확인에서 빠진 계산 조건을 확인해 주세요. 지원 범위와 조건이 충족되면 같은 입력의 개인 보고서를 열 수 있습니다.", choices: [] })) controller.enqueue(chunk);
            return;
          }
          const query = planTaxQuery(latest.parts[0].text, options.facts.topic?.value);
          const research = query ? await (options.lookup ?? researchTaxQuestion)(query, cancelled) : undefined;
          const usableResearch = research?.sources.length || (research && research.status !== "unavailable") ? research : undefined;
          const attemptOptions = usableResearch ? { ...options, research: usableResearch, attemptTimeoutMs: Math.min(options.attemptTimeoutMs ?? 18_000, 18_000) } : options;
          const localProposals = research ? extractAssertedChatPatches(latest.parts[0].text, stateAfterProposals(options, [])) : [];
          let chunks: UIMessageChunk[];
          if (usableResearch && !usableResearch.sources.length) {
            chunks = completedTurnChunks(localProposals, { message: usableResearch.notice, choices: [], grounding: { status: usableResearch.status, sources: [], notice: usableResearch.notice } });
          } else {
            try {
              try { chunks = await collectAttempt(attemptOptions, options.model, cancelled); }
              catch (error) {
                cancelled.throwIfAborted();
                if (options.model === BACKUP_GOOGLE_DIAGNOSIS_MODEL || !canUseBackup(error)) throw error;
                chunks = await collectAttempt(attemptOptions, BACKUP_GOOGLE_DIAGNOSIS_MODEL, cancelled);
              }
            } catch (error) {
              if (!research || cancelled.aborted) throw error;
              chunks = completedTurnChunks(localProposals, { message: `[${getDiagnosisPublicErrorCode(error)}] 근거는 조회했지만 AI 설명을 완료하지 못했습니다. 입력은 유지됩니다. 잠시 후 다시 질문하거나 전문가에게 문의해 주세요.`, choices: [], grounding: { status: "unavailable", sources: research.sources, notice: research.notice } });
            }
          }
          cancelled.throwIfAborted();
          for (const chunk of chunks) controller.enqueue(chunk);
        } catch (error) {
          if (!cancelled.aborted) {
            controller.enqueue({
              type: "error",
              errorText: `[${getDiagnosisPublicErrorCode(error)}] AI 응답을 완료하지 못했습니다. 잠시 후 다시 시도하거나 직접 입력으로 계속해 주세요.`,
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
