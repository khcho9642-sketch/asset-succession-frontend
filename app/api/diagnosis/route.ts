import { createAgentUIStreamResponse } from "ai";
import { createDiagnosisAgent } from "../../../lib/chat/agent";
import { assertSameOrigin, diagnosisRequestSchema, DiagnosisRequestError, getDiagnosisConfiguration, readDiagnosisBody } from "../../../lib/chat/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function failure(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status, headers });
}

export function GET() {
  return Response.json({ configured: Boolean(getDiagnosisConfiguration()) }, { headers });
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
    const { messages, facts } = parsed.data;
    return await createAgentUIStreamResponse({
      agent: createDiagnosisAgent({ ...configuration, messages, facts }),
      uiMessages: messages.filter((message) => message.parts[0].text.trim()),
      abortSignal: request.signal,
      timeout: { totalMs: 45_000, firstChunkMs: 25_000, chunkMs: 15_000 },
      sendReasoning: false,
      headers,
      onError: () => "AI 응답을 완료하지 못했습니다. 잠시 후 다시 시도하거나 직접 입력으로 계속해 주세요.",
    });
  } catch (error) {
    if (error instanceof DiagnosisRequestError) return failure(error.status, error.code, error.message);
    return failure(502, "AI_UNAVAILABLE", "AI 연결에 문제가 생겼습니다. 잠시 후 다시 시도하거나 직접 입력으로 계속해 주세요.");
  }
}
