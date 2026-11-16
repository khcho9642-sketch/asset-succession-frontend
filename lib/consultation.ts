export type ConsultationLead = {
  phone: string;
  consent: true;
  requestId: string;
  assessmentId?: string;
};

export type ConsultationConfiguration = { url: string; token: string };
export type ConsultationReceipt = { ok: true; receiptId: string; notification: "sent" | "pending" };

export const CONSULTATION_LIMITS = { bodyBytes: 4096, bodyTimeoutMs: 5000, deliveryTimeoutMs: 20000 } as const;

export class ConsultationError extends Error {
  constructor(public status: number, public code: string, message: string, public retryable = false) {
    super(message);
    this.name = "ConsultationError";
  }
}

function invalid(message = "신청 정보를 확인해 주세요."): never {
  throw new ConsultationError(400, "INVALID_REQUEST", message);
}

export function validateConsultationLead(input: unknown): ConsultationLead {
  if (!input || typeof input !== "object" || Array.isArray(input)) return invalid();
  const body = input as Record<string, unknown>;
  if (Object.keys(body).some(key => !["phone", "consent", "requestId", "assessmentId", "website"].includes(key))) return invalid();
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const digits = phone.replace(/\D/g, "");
  if (!phone) return invalid("전화번호를 입력해 주세요.");
  if (phone.length > 25 || !/^\+?[0-9][0-9 ()-]*$/.test(phone) || digits.length < 8 || digits.length > 15) {
    return invalid("연락 가능한 전화번호를 확인해 주세요.");
  }
  if (body.consent !== true) return invalid("전화번호 이용에 동의해 주세요.");
  if (typeof body.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId)) return invalid();
  if (body.website !== undefined && (typeof body.website !== "string" || body.website.trim() !== "" || body.website.length > 200)) return invalid();
  if (body.assessmentId !== undefined && (typeof body.assessmentId !== "string" || body.assessmentId.length > 200)) return invalid();
  const assessmentId = typeof body.assessmentId === "string" ? body.assessmentId.trim() : "";
  if (assessmentId && !/^AS360-[A-Za-z0-9-]+$/.test(assessmentId)) return invalid();
  return { phone: (phone.startsWith("+") ? "+" : "") + digits, consent: true, requestId: body.requestId, ...(assessmentId ? { assessmentId } : {}) };
}

export function getConsultationConfiguration(): ConsultationConfiguration | null {
  const rawUrl = process.env.CONSULTATION_WEBHOOK_URL?.trim();
  const token = process.env.CONSULTATION_WEBHOOK_TOKEN?.trim();
  if (!rawUrl || !token) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.hostname !== "script.google.com" || url.port || url.username || url.password
      || url.search || url.hash || !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname)) return null;
    return { url: url.href, token };
  } catch { return null; }
}

export function assertConsultationOrigin(request: Request): void {
  const reject = (): never => { throw new ConsultationError(403, "ORIGIN_NOT_ALLOWED", "이 페이지에서 다시 시도해 주세요."); };
  const origin = request.headers.get("origin");
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site") reject();
  const url = new URL(request.url);
  const host = request.headers.get("host");
  // Next can canonicalize request.url to localhost. Use its HTTP Host, never a forwarded host.
  if (!/^https?:$/.test(url.protocol) || (host !== null && !/^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[[0-9a-f:]+\])(?::[0-9]{1,5})?$/i.test(host))) reject();
  let expected: string;
  try { expected = new URL(`${url.protocol}//${host ?? url.host}`).origin; }
  catch { return reject(); }
  if (origin !== expected) reject();
}

export async function readConsultationBody(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new ConsultationError(415, "JSON_REQUIRED", "올바른 신청 형식으로 다시 시도해 주세요.");
  }
  const tooLarge = () => new ConsultationError(413, "REQUEST_TOO_LARGE", "신청 내용이 너무 큽니다. 다시 확인해 주세요.");
  if (Number(request.headers.get("content-length")) > CONSULTATION_LIMITS.bodyBytes) throw tooLarge();
  const reader = request.body?.getReader();
  if (!reader) return invalid();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ConsultationError(408, "REQUEST_TIMEOUT", "요청 시간이 초과됐습니다. 다시 시도해 주세요.", true)), CONSULTATION_LIMITS.bodyTimeoutMs);
  });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > CONSULTATION_LIMITS.bodyBytes) throw tooLarge();
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    if (error instanceof ConsultationError) throw error;
    return invalid("신청 내용을 읽을 수 없습니다. 다시 시도해 주세요.");
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

export async function deliverConsultationLead(lead: ConsultationLead, configuration: ConsultationConfiguration, signal?: AbortSignal): Promise<ConsultationReceipt> {
  // One stable payload/key for both attempts. Never send the full diagnosis or browser storage.
  const payload = JSON.stringify({ phone: lead.phone, consent: lead.consent, requestId: lead.requestId, assessmentId: lead.assessmentId ?? "", submittedAt: new Date().toISOString(), service: "asset-succession-360", source: "consultation-page", token: configuration.token });
  const pending: ConsultationReceipt = { ok: true, receiptId: lead.requestId, notification: "pending" };
  let stored = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const timeout = AbortSignal.timeout(CONSULTATION_LIMITS.deliveryTimeoutMs);
      const response = await fetch(configuration.url, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: payload, cache: "no-store",
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      if (!response.ok) throw new Error("delivery");
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("delivery");
      const flags = result as Record<string, unknown>;
      if (typeof flags.sheet !== "boolean" || typeof flags.mail !== "boolean" || !flags.sheet) throw new Error("delivery");
      stored = true;
      if (flags.mail) return { ...pending, notification: "sent" };
      // The existing Apps Script lock/requestId retries only the pending notification.
      // A later network/provider failure cannot undo an already confirmed stored receipt.
      if (signal?.aborted) return pending;
    } catch (error) {
      if (stored) return pending;
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      throw new ConsultationError(timedOut ? 504 : 502, timedOut ? "DELIVERY_TIMEOUT" : "DELIVERY_UNCONFIRMED",
        "접수 결과를 확인하지 못했습니다. 같은 내용으로 다시 시도해 주세요.", true);
    }
  }
  return pending;
}
