import type { ChatOnFinishCallback, UIMessage } from "ai";

type ChatFinish = Parameters<ChatOnFinishCallback<UIMessage>>[0];

/** A terminal SSE finish can report failure without setting useChat.error. */
export function isIncompleteChatResponse({ message, isAbort, isDisconnect, isError, finishReason }: ChatFinish): boolean {
  // The explicit stop action already has its own cancellation notice.
  if (isAbort) return false;
  return isError || isDisconnect || finishReason === "error"
    || !message.parts.some((part) => part.type === "text" && part.text.trim().length > 0);
}
