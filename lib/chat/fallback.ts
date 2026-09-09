import { createAgentUIStream, createUIMessageStreamResponse, type UIMessageChunk } from "ai";
import { createDiagnosisAgent } from "./agent";
import { diagnosisReplySchema } from "./choices";
import { BACKUP_GOOGLE_DIAGNOSIS_MODEL, getDiagnosisPublicErrorCode, type DiagnosisRequest } from "./server";

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

class RejectedAttemptError extends Error {}

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
  let reader: ReadableStreamDefaultReader<UIMessageChunk> | undefined;
  let stopWaiting: () => void = () => undefined;
  const aborted = new Promise<never>((_, reject) => {
    const onAbort = () => reject(signal.reason);
    stopWaiting = () => signal.removeEventListener("abort", onAbort);
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });

  const collect = async () => {
    signal.throwIfAborted();
    let providerError: unknown;
    const source = await createAgentUIStream({
      // Each attempt starts from the original conversation and confirmed facts.
      // Never replay another model's tool outputs or thought signatures.
      agent: createDiagnosisAgent({ apiKey: options.apiKey, model, messages: options.messages, facts: options.facts }),
      uiMessages: options.messages.filter((message) => message.parts[0].text.trim()),
      abortSignal: signal,
      sendReasoning: false,
      onError: (error) => {
        providerError = error;
        return "AI response failed";
      },
    });
    reader = source.getReader();
    const chunks: UIMessageChunk[] = [];
    let bytes = 0;
    let text = "";
    let finished = false;
    const factCalls = new Set<string>();
    const factOutputs = new Set<string>();
    try {
      while (true) {
        signal.throwIfAborted();
        const { value: chunk, done } = await reader.read();
        if (done) break;
        if (chunk.type === "error") throw providerError ?? new Error("AI stream failed");
        if (chunk.type === "abort") throw signal.reason ?? new Error("AI stream interrupted");
        if (chunk.type === "tool-input-error" || chunk.type === "tool-output-error") {
          throw new Error("AI fact proposal failed");
        }
        if (chunk.type === "finish") {
          if (chunk.finishReason === "content-filter") throw new RejectedAttemptError("AI response filtered");
          finished = chunk.finishReason === "stop";
        }
        if (chunk.type === "text-delta") text += chunk.delta;
        if (chunk.type === "tool-input-available" && chunk.toolName === "proposeFacts") factCalls.add(chunk.toolCallId);
        if (chunk.type === "tool-output-available") factOutputs.add(chunk.toolCallId);
        bytes += Buffer.byteLength(JSON.stringify(chunk), "utf8");
        if (bytes > MAX_BUFFER_BYTES || chunks.length >= MAX_BUFFER_CHUNKS) {
          throw new RejectedAttemptError("AI response exceeded buffer limit");
        }
        chunks.push(chunk);
      }
      signal.throwIfAborted();
      if (providerError) throw providerError;
      // The legacy client parser also accepts plain text; new AI turns must
      // instead contain the complete validated message + choices contract.
      if (!finished || factCalls.size !== 1 || factOutputs.size !== 1
        || !factOutputs.has([...factCalls][0])
        || !diagnosisReplySchema.safeParse(JSON.parse(text)).success) {
        throw new Error("AI response incomplete");
      }
      return chunks;
    } finally {
      void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  };

  try {
    // The deadline also bounds setup/read failures that ignore an abort signal.
    return await Promise.race([collect(), aborted]);
  } finally {
    clearTimeout(timer);
    stopWaiting();
    deadline.abort();
    void reader?.cancel().catch(() => undefined);
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
