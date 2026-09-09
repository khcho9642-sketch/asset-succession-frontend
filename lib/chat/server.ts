import { z } from "zod";
import { CHAT_FIELD_KEYS, type ChatState } from "./intake";
import { getAssistantReply } from "./choices";

export const DIAGNOSIS_LIMITS = {
  bodyBytes: 128 * 1024,
  bodyTimeoutMs: 10_000,
  messages: 80,
  textLength: 6_000,
  totalTextLength: 32_000,
  factValueLength: 4_000,
  evidenceLength: 1_200,
  proposalValueLength: 600,
  proposals: CHAT_FIELD_KEYS.length,
} as const;

const textPartSchema = z.object({
  type: z.literal("text"),
  text: z.string().max(DIAGNOSIS_LIMITS.textLength),
});

// Only text is forwarded to the model. In particular, client-supplied tool
// outputs cannot masquerade as trusted results from a previous server call.
const uiMessageSchema = z.object({
  id: z.string().min(1).max(120),
  role: z.enum(["user", "assistant"]),
  parts: z.array(z.object({ type: z.string().max(80) }).passthrough()).max(80),
}).transform((message, ctx) => {
  const textParts = message.parts.filter((part) => part.type === "text");
  const parsed = z.array(textPartSchema).safeParse(textParts);
  if (!parsed.success) {
    ctx.addIssue({ code: "custom", message: "Invalid text part" });
    return z.NEVER;
  }
  const text = parsed.data.map((part) => part.text).join("\n");
  if (text.length > DIAGNOSIS_LIMITS.textLength || (message.role === "user" && !text.trim())) {
    ctx.addIssue({ code: "custom", message: "Invalid message length" });
    return z.NEVER;
  }
  // Past buttons are suggestions, never customer facts or trusted tool output.
  // Keep the visible question as context for short replies such as "아들".
  const historyText = message.role === "assistant" ? getAssistantReply(text)?.message ?? "" : text;
  return { id: message.id, role: message.role, parts: [{ type: "text" as const, text: historyText }] };
});

const factSchema = z.object({
  value: z.string().min(1).max(DIAGNOSIS_LIMITS.factValueLength),
  evidence: z.string().min(1).max(DIAGNOSIS_LIMITS.factValueLength),
  messageId: z.string().min(1).max(120),
});

export const diagnosisRequestSchema = z.object({
  messages: z.array(uiMessageSchema).min(1).max(DIAGNOSIS_LIMITS.messages),
  facts: z.partialRecord(z.enum(CHAT_FIELD_KEYS), factSchema).default({}),
}).superRefine(({ messages }, ctx) => {
  if (messages[messages.length - 1]?.role !== "user") {
    ctx.addIssue({ code: "custom", message: "Last message must be from the user" });
  }
  if (new Set(messages.map((message) => message.id)).size !== messages.length) {
    ctx.addIssue({ code: "custom", message: "Message IDs must be unique" });
  }
  if (messages.reduce((total, message) => total + message.parts[0].text.length, 0) > DIAGNOSIS_LIMITS.totalTextLength) {
    ctx.addIssue({ code: "custom", message: "Conversation is too long" });
  }
});

export type DiagnosisRequest = z.infer<typeof diagnosisRequestSchema>;
export type DiagnosisFacts = ChatState["facts"];

export const factProposalSchema = z.object({
  key: z.enum(CHAT_FIELD_KEYS),
  value: z.string().min(1).max(DIAGNOSIS_LIMITS.proposalValueLength)
    .describe("최신 사용자 메시지에서 그대로 연속 발췌한 값입니다. evidence 안에 그대로 포함되어야 하며 의역·요약·단위 변환을 하지 않습니다."),
  evidence: z.string().min(1).max(DIAGNOSIS_LIMITS.evidenceLength)
    .describe("값을 뒷받침하는 최신 사용자 메시지의 연속된 원문입니다. 공백과 표현을 바꾸거나 단위를 변환하지 않습니다."),
}).strict();

export const proposeFactsInputSchema = z.object({
  facts: z.array(factProposalSchema).max(DIAGNOSIS_LIMITS.proposals),
}).strict();

type DiagnosisConfigurationIssue =
  | "FREE_TRIAL_NOT_ENABLED"
  | "MODEL_MISSING"
  | "MODEL_INVALID"
  | "AUTHENTICATION_MISSING";

function evaluateDiagnosisConfiguration() {
  const issues: DiagnosisConfigurationIssue[] = [];
  // The user approved this branch's free-credit trial and completed account
  // setup. Its saved settings did not reach Preview, so only this exact
  // deployment scope gets defaults. Explicit values always override them.
  const approvedTrialPreview = process.env.VERCEL_ENV === "preview"
    && process.env.VERCEL_GIT_COMMIT_REF === "codex/chat-opening-topics";
  const trialEnabled = process.env.AI_DIAGNOSIS_FREE_TRIAL_ENABLED
    ?? (approvedTrialPreview ? "true" : undefined);
  // Activation follows an account check: Free credit tier, auto top-up off,
  // and an eligible model. This switch does not verify billing by itself.
  if (trialEnabled?.trim() !== "true") issues.push("FREE_TRIAL_NOT_ENABLED");
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  // On Vercel the SDK also resolves a fresh token from request context.
  // Credentials are authenticated by the Gateway when the request is made.
  const hasOidc = process.env.VERCEL === "1" || Boolean(process.env.VERCEL_OIDC_TOKEN?.trim());
  const model = (process.env.AI_DIAGNOSIS_MODEL
    ?? (approvedTrialPreview ? "openai/gpt-5.4-mini" : undefined))?.trim();
  if (!model) issues.push("MODEL_MISSING");
  else if (model.length > 160 || !/^[a-z0-9][a-z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(model)) issues.push("MODEL_INVALID");
  if (!apiKey && !hasOidc) issues.push("AUTHENTICATION_MISSING");
  return { configuration: issues.length === 0 && model ? { apiKey, model } : null, issues };
}

/** Public readiness details contain codes only, never environment values. */
export function getDiagnosisConfigurationStatus() {
  const { configuration, issues } = evaluateDiagnosisConfiguration();
  return { configured: Boolean(configuration), issues };
}

export function getDiagnosisConfiguration() {
  return evaluateDiagnosisConfiguration().configuration;
}

type DiagnosisPublicErrorCode =
  | "AI_CREDIT_REQUIRED"
  | "AI_RATE_LIMITED"
  | "AI_AUTHENTICATION_FAILED"
  | "AI_INVALID_REQUEST"
  | "AI_MODEL_UNAVAILABLE"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_UNAVAILABLE";

/** Inspect numeric HTTP status only; provider messages and payloads stay private. */
export function getDiagnosisPublicErrorCode(error: unknown): DiagnosisPublicErrorCode {
  const seen = new Set<object>();
  let current = error;
  let fallback: DiagnosisPublicErrorCode = "AI_UNAVAILABLE";
  const readField = (value: object, field: "statusCode" | "cause"): unknown => {
    try { return (value as Record<string, unknown>)[field]; }
    catch { return undefined; }
  };
  for (let depth = 0; depth < 8; depth += 1) {
    if (!current || typeof current !== "object" || seen.has(current)) break;
    seen.add(current);
    const statusCode = readField(current, "statusCode");
    switch (statusCode) {
      case 402: return "AI_CREDIT_REQUIRED";
      case 429: return "AI_RATE_LIMITED";
      case 401:
      case 403: return "AI_AUTHENTICATION_FAILED";
      case 400: return "AI_INVALID_REQUEST";
      case 404: return "AI_MODEL_UNAVAILABLE";
      default:
        // A gateway 5xx can wrap an actionable credit or rate-limit cause.
        if (typeof statusCode === "number" && Number.isInteger(statusCode) && statusCode >= 500 && statusCode <= 599) {
          fallback = "AI_PROVIDER_UNAVAILABLE";
        }
    }
    current = readField(current, "cause");
  }
  return fallback;
}

export class DiagnosisRequestError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const reject = () => {
    throw new DiagnosisRequestError(403, "ORIGIN_NOT_ALLOWED", "이 페이지에서 다시 시도해 주세요.");
  };
  if (request.headers.get("sec-fetch-site") === "cross-site" || !origin) reject();

  const requestUrl = new URL(request.url);
  const host = request.headers.get("host");
  // Next can canonicalize request.url to localhost. Host is the actual HTTP
  // authority used by the browser. Never substitute untrusted forwarded hosts.
  const validHost = /^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[[0-9a-f:]+\])(?::[0-9]{1,5})?$/i;
  if (!/^https?:$/.test(requestUrl.protocol) || (host !== null && !validHost.test(host))) reject();
  let expectedOrigin: string;
  try {
    expectedOrigin = new URL(`${requestUrl.protocol}//${host ?? requestUrl.host}`).origin;
  } catch {
    return reject();
  }
  if (origin !== expectedOrigin) reject();
}

export async function readDiagnosisBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new DiagnosisRequestError(415, "JSON_REQUIRED", "올바른 대화 형식으로 다시 시도해 주세요.");
  }
  const advertisedLength = Number(request.headers.get("content-length"));
  if (advertisedLength > DIAGNOSIS_LIMITS.bodyBytes) {
    throw new DiagnosisRequestError(413, "REQUEST_TOO_LARGE", "대화가 너무 깁니다. 내용을 줄여 주세요.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new DiagnosisRequestError(400, "INVALID_REQUEST", "대화 내용이 없습니다.");

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DiagnosisRequestError(408, "REQUEST_TIMEOUT", "요청 시간이 초과됐습니다. 다시 시도해 주세요.")), DIAGNOSIS_LIMITS.bodyTimeoutMs);
  });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { value, done } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > DIAGNOSIS_LIMITS.bodyBytes) {
        throw new DiagnosisRequestError(413, "REQUEST_TOO_LARGE", "대화가 너무 깁니다. 내용을 줄여 주세요.");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    if (error instanceof DiagnosisRequestError) throw error;
    throw new DiagnosisRequestError(400, "INVALID_REQUEST", "대화 내용을 읽을 수 없습니다. 다시 시도해 주세요.");
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
