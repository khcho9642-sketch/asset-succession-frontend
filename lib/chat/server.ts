import { z } from "zod";
import { CHAT_FIELD_KEYS, type ChatState } from "./intake";

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
  return { id: message.id, role: message.role, parts: [{ type: "text" as const, text }] };
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
  value: z.string().min(1).max(DIAGNOSIS_LIMITS.proposalValueLength),
  evidence: z.string().min(1).max(DIAGNOSIS_LIMITS.evidenceLength),
}).strict();

export const proposeFactsInputSchema = z.object({
  facts: z.array(factProposalSchema).max(DIAGNOSIS_LIMITS.proposals),
}).strict();

export function getDiagnosisConfiguration() {
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  const model = process.env.AI_DIAGNOSIS_MODEL?.trim();
  if (!apiKey || !model || model.length > 160 || !/^[a-z0-9][a-z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(model)) {
    return null;
  }
  return { apiKey, model };
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
