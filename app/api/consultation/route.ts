import { assertConsultationOrigin, ConsultationError, deliverConsultationLead, getConsultationConfiguration, readConsultationBody, validateConsultationLead } from "../../../lib/consultation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export async function POST(request: Request) {
  try {
    assertConsultationOrigin(request);
    const lead = validateConsultationLead(await readConsultationBody(request));
    const configuration = getConsultationConfiguration();
    if (!configuration) throw new ConsultationError(503, "NOT_CONFIGURED", "현재 온라인 접수를 연결하지 못했습니다. 잠시 후 다시 시도하거나 직접 문의해 주세요.", true);
    return Response.json(await deliverConsultationLead(lead, configuration, request.signal), { headers });
  } catch (error) {
    const failure = error instanceof ConsultationError ? error
      : new ConsultationError(502, "DELIVERY_UNCONFIRMED", "접수 결과를 확인하지 못했습니다. 같은 내용으로 다시 시도해 주세요.", true);
    return Response.json({ ok: false, error: { code: failure.code, message: failure.message }, retryable: failure.retryable }, { status: failure.status, headers });
  }
}
