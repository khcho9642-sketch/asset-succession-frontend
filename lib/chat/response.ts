import type { ChatOnFinishCallback, UIMessage } from "ai";
import { getAssistantReply } from "./choices";

type ChatFinish = Parameters<ChatOnFinishCallback<UIMessage>>[0];

const GENERIC_ERROR_NOTICE = "답변을 가져오지 못했어요. 입력한 내용은 남아 있으니 다시 시도하거나 요약을 직접 확인해 주세요.";
const RATE_LIMIT_NOTICE = "AI 시험 요청 한도에 도달했어요. 잠시 후 다시 시도하거나 직접 입력으로 계속해 주세요. 입력한 내용은 남아 있어요.";
const SETUP_NOTICE = "AI 시험 연결 설정을 확인해야 해요. 입력한 내용은 남아 있으니 직접 입력으로 계속해 주세요.";
const REJECTED_NOTICE = "AI 답변을 검증하지 못했어요. 다시 시도하거나 직접 입력으로 계속해 주세요.";

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
  // Only allowlisted codes select fixed copy. Never interpolate provider text,
  // a model name, a key, an internal path or even an unknown code into the UI.
  switch (code) {
    case "AI_RATE_LIMITED": return RATE_LIMIT_NOTICE;
    case "AI_AUTHENTICATION_FAILED":
    case "AI_CREDIT_REQUIRED":
    case "AI_MODEL_UNAVAILABLE":
    case "AI_NOT_CONFIGURED": return SETUP_NOTICE;
    case "AI_RESPONSE_REJECTED": return REJECTED_NOTICE;
    default: return GENERIC_ERROR_NOTICE;
  }
}

/** A terminal SSE finish can report failure without setting useChat.error. */
export function isIncompleteChatResponse({ message, isAbort, isDisconnect, isError, finishReason }: ChatFinish): boolean {
  // The explicit stop action already has its own cancellation notice.
  if (isAbort) return false;
  return isError || isDisconnect || finishReason === "error"
    || !getAssistantReply(message.parts.filter((part) => part.type === "text").map((part) => part.text).join(""));
}
