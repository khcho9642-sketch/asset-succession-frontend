import { z } from "zod";

export const diagnosisReplySchema = z.object({
  message: z.string().trim().min(1).max(4_000),
  choices: z.array(z.string().trim().min(1).max(60)).max(5),
}).strict();

export type DiagnosisReply = z.infer<typeof diagnosisReplySchema>;

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
      return { message: parsed.data.message, choices: [...new Set(parsed.data.choices)] };
    } catch {
      return null;
    }
  }

  // Older assistant records contain ordinary text, without button metadata.
  // Preserve that text verbatim; do not reinterpret user messages with this API.
  if (raw.length > 4_000) return null;
  return { message: raw, choices: [] };
}
