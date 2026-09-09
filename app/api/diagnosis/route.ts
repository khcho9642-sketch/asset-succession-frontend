import { createDiagnosisResponse } from "../../../lib/chat/fallback";
import { loadChatGuideRuntime } from "../../../lib/chat/guide";
import { assertSameOrigin, diagnosisRequestSchema, DiagnosisRequestError, getDiagnosisConfiguration, getDiagnosisConfigurationStatus, getDiagnosisPublicErrorCode, readDiagnosisBody } from "../../../lib/chat/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function failure(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status, headers });
}

export function GET() {
  const status = getDiagnosisConfigurationStatus();
  try {
    // No inference or billing request here. A missing deployed guide also
    // keeps the UI in local-input mode instead of advertising a working chat.
    loadChatGuideRuntime();
    return Response.json(status, { headers });
  } catch {
    return Response.json({ configured: false, issues: [...status.issues, "CHAT_GUIDE_UNAVAILABLE"] }, { headers });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = diagnosisRequestSchema.safeParse(await readDiagnosisBody(request));
    if (!parsed.success) {
      return failure(400, "INVALID_REQUEST", "대화 형식이 올바르지 않거나 너무 깁니다. 내용을 확인해 주세요.");
    }
    const configuration = getDiagnosisConfiguration();
    if (!configuration) {
      return failure(503, "AI_NOT_CONFIGURED", "현재 AI 대화가 연결되어 있지 않습니다. 직접 입력으로 상담 준비를 계속할 수 있습니다.");
    }
    // Validate deployment prerequisites before opening the asynchronous stream.
    // A missing guide is a setup failure, not a reason to call a backup model.
    loadChatGuideRuntime();
    const { messages, facts } = parsed.data;
    return createDiagnosisResponse({
      ...configuration,
      messages,
      facts,
      abortSignal: request.signal,
      headers,
    });
  } catch (error) {
    if (error instanceof DiagnosisRequestError) return failure(error.status, error.code, error.message);
    return failure(502, getDiagnosisPublicErrorCode(error), "AI 연결에 문제가 생겼습니다. 잠시 후 다시 시도하거나 직접 입력으로 계속해 주세요.");
  }
}
