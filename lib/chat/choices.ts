import { z } from "zod";

export const diagnosisSelectionModeSchema = z.enum(["single", "multiple"]);
export const diagnosisInputModeSchema = z.enum(["assetAmounts"]);

export const diagnosisReplySchema = z.object({
  message: z.string().trim().min(1).max(4_000),
  choices: z.array(z.string().trim().min(1).max(60)).max(5),
  // Older saved conversations do not have this field, so keep it optional.
  // New guided/model replies set it when more than one answer may be true.
  selectionMode: diagnosisSelectionModeSchema.optional(),
  // Structured entry is opt-in so older saved replies remain valid.
  inputMode: diagnosisInputModeSchema.optional(),
}).strict();

export type DiagnosisReply = z.infer<typeof diagnosisReplySchema>;

export const SAFE_REVIEW_MESSAGE = "기본 내용을 정리했어요. 아래에서 내용을 확인한 뒤 계산 조건을 직접 확인해 주세요.";
const APP_OWNED_COMPLETION_PATTERN = /(?:확인|계산|입력|준비|검토)(?:이|가|은|는|을|를)?[^.!?\n]{0,18}(?:완료(?:됐(?:습니다|어요)?|되었(?:습니다|어요)?|했습니다|합니다|입니다|예요)|끝났(?:습니다|어요)?|마쳤(?:습니다|어요)?)/;
const APP_OWNED_NAVIGATION_PATTERN = /(?:결과|보고서)(?:\s*(?:화면|페이지))?(?:으?로|을|를)?\s*(?:연결|이동|넘어가|보내|안내|보여|열어|만들어|준비)(?:해)?\s*(?:드릴게요|드리겠습니다|하겠습니다|할게요|합니다|됩니다)/;

/** Calculation readiness and navigation are app-owned; the model never receives that trusted state. */
export function hasAppOwnedHandoffClaim(message: string) {
  return APP_OWNED_COMPLETION_PATTERN.test(message) || APP_OWNED_NAVIGATION_PATTERN.test(message);
}

function visibleReply(reply: DiagnosisReply): DiagnosisReply {
  return hasAppOwnedHandoffClaim(reply.message)
    ? { message: SAFE_REVIEW_MESSAGE, choices: [] }
    : reply;
}

// Enough for the maximum reply even when every character is JSON-escaped.
const MAX_RAW_REPLY_LENGTH = 32_000;

/** Parse assistant output only. Incomplete protocol text must never be shown. */
export function getAssistantReply(raw: string): DiagnosisReply | null {
  if (raw.length > MAX_RAW_REPLY_LENGTH) return null;
  const text = raw.trim();
  if (!text || /```|~~~/.test(text)) return null;

  const looksLikeJson = /^[\[\]{}"]/.test(text)
    || /"(?:message|choices)"\s*:/.test(text)
    || /^(?:null|true|false|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)$/.test(text);
  if (looksLikeJson) {
    try {
      const parsed = diagnosisReplySchema.safeParse(JSON.parse(text));
      if (!parsed.success) return null;
      if (parsed.data.inputMode === "assetAmounts" && (parsed.data.selectionMode !== "multiple" || parsed.data.choices.length === 0)) return null;
      return visibleReply({ ...parsed.data, choices: [...new Set(parsed.data.choices)] });
    } catch {
      return null;
    }
  }

  // Older assistant records contain ordinary text, without button metadata.
  // Preserve that text verbatim; do not reinterpret user messages with this API.
  if (raw.length > 4_000) return null;
  return visibleReply({ message: raw, choices: [] });
}
