import type { ChatOnFinishCallback, UIMessage } from "ai";

type ChatFinish = Parameters<ChatOnFinishCallback<UIMessage>>[0];

const GENERIC_ERROR_NOTICE = "답변을 가져오지 못했어요. 입력한 내용은 남아 있으니 다시 시도하거나 요약을 직접 확인해 주세요.";
const RATE_LIMIT_NOTICE = "AI 요청 한도에 도달했어요. 잠시 후 다시 시도해 주세요. 입력한 내용은 그대로 남아 있어요.";

/** Render fixed notices only; neither SSE nor HTTP error text is user-facing. */
export function getChatErrorNotice(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : error;
  if (typeof rawMessage !== "string" || rawMessage.length > 8_192) return GENERIC_ERROR_NOTICE;
  let code: unknown = rawMessage.match(/^\[(AI_[A-Z_]+)\](?:\s|$)/)?.[1];
  if (!code) {
    try {
      const body: unknown = JSON.parse(rawMessage);
      if (body && typeof body === "object" && "error" in body && body.error && typeof body.error === "object" && "code" in body.error) {
        code = body.error.code;
      }
    } catch { /* Unrecognized provider text stays behind the generic notice. */ }
  }
  // Only the approved public rate-limit code gets a specific explanation.
  return code === "AI_RATE_LIMITED" ? RATE_LIMIT_NOTICE : GENERIC_ERROR_NOTICE;
}

/** A terminal SSE finish can report failure without setting useChat.error. */
export function isIncompleteChatResponse({ message, isAbort, isDisconnect, isError, finishReason }: ChatFinish): boolean {
  // The explicit stop action already has its own cancellation notice.
  if (isAbort) return false;
  return isError || isDisconnect || finishReason === "error"
    || !message.parts.some((part) => part.type === "text" && part.text.trim().length > 0);
}
