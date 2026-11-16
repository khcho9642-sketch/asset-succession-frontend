import assert from "node:assert/strict";
import test from "node:test";
import { NoObjectGeneratedError } from "ai";
import { acceptFactProposals, createDiagnosisAgent, diagnosisTurnSchema } from "./agent";
import type { ChatPatch } from "./intake";
import { BACKUP_GOOGLE_DIAGNOSIS_MODEL, DEFAULT_GOOGLE_DIAGNOSIS_MODEL, getDiagnosisPublicErrorCode, type DiagnosisRequest } from "./server";

const MODEL = DEFAULT_GOOGLE_DIAGNOSIS_MODEL;
const SYNTHETIC_KEY = "synthetic-google-key-never-valid";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const messages: DiagnosisRequest["messages"] = [{
  id: "synthetic-user",
  role: "user",
  parts: [{ type: "text", text: "증여를 준비하고 있어요. 제 아파트를 아들에게 주려고 해요." }],
}];

test("only explicit undecided timing labels are preserved as their latest customer quote", () => {
  const text = "시기는 아직 정하지 않았고 과거 증여는 기억이 안 나요. 제 주식 1억도 함께 검토하고 싶어요.";
  const evidence = "시기는 아직 정하지 않았고";
  for (const value of ["미정", "시기 미정", "아직 미정", "정하지 않음", "아직 정하지 않았어요"]) {
    assert.deepEqual(acceptFactProposals([{ key: "timing", value, evidence }], { id: "undecided", text }), [{ key: "timing", value: evidence, evidence }]);
  }
  const shortEvidence = "아직 정하지 않았고";
  assert.deepEqual(acceptFactProposals([{ key: "timing", value: "미정", evidence: shortEvidence }], { id: "undecided", text }), [{ key: "timing", value: shortEvidence, evidence: shortEvidence }]);
  const alreadyQuoted = { key: "timing" as const, value: "정하지 않았고", evidence };
  assert.deepEqual(acceptFactProposals([alreadyQuoted], { id: "undecided", text }), [alreadyQuoted]);
});

test("the timing exception cannot invent dates, amounts, family facts or other unknown fields", () => {
  const latest = { id: "strict-unknown", text: "시기는 아직 정하지 않았고 과거 증여는 기억이 안 나요. 제 주식 1억도 함께 검토하고 싶어요." };
  const evidence = "시기는 아직 정하지 않았고";
  for (const proposal of [
    { key: "timing", value: "내년 5월", evidence },
    { key: "timing", value: "미정 2030년", evidence },
    { key: "timing", value: "1억", evidence },
    { key: "financialAssets", value: "미정", evidence },
    { key: "financialAssets", value: "제 주식 2억", evidence: "제 주식 1억" },
    { key: "children", value: "자녀 2명", evidence },
    { key: "pastGifts", value: "미정", evidence: "과거 증여는 기억이 안 나요" },
    { key: "timing", value: "미정", evidence: "시기는 아직 정하지 않았어요" },
  ] satisfies ChatPatch[]) assert.deepEqual(acceptFactProposals([proposal], latest), []);
  for (const text of ["시기는 내년이에요", "금액은 아직 정하지 않았고 시기는 내년이에요"]) {
    assert.deepEqual(acceptFactProposals([{ key: "timing", value: "미정", evidence: text }], { id: "not-undecided-timing", text }), []);
  }
  const tooLong = `시기는 아직 정하지 않았고 ${"확인할 내용 ".repeat(100)}`;
  assert.ok(tooLong.length > 600);
  assert.deepEqual(acceptFactProposals([{ key: "timing", value: "미정", evidence: tooLong }], { id: "long-evidence", text: tooLong }), []);
});

test("new model turns ask one question with 2–4 choices or finish without a question", () => {
  const base = { facts: [], message: "누구에게 주려고 하세요?", choices: ["자녀", "배우자"], selectionMode: "single" };
  assert.equal(diagnosisTurnSchema.safeParse(base).success, true);
  assert.equal(diagnosisTurnSchema.safeParse({ ...base, message: "말씀하신 내용과 확인할 부분을 정리했어요.", choices: [] }).success, true);
  for (const changes of [
    { choices: ["자녀"] },
    { choices: ["자녀", "배우자", "부모", "친구", "미정"] },
    { choices: ["자녀", "자녀"] },
    { choices: [] },
    { message: "누구에게 주시나요? 언제 주시나요?" },
    { inputMode: "assetAmounts" },
  ]) assert.equal(diagnosisTurnSchema.safeParse({ ...base, ...changes }).success, false);
});

type GoogleRequestBody = {
  generationConfig: {
    maxOutputTokens: number;
    thinkingConfig: { thinkingLevel: string };
    responseMimeType?: string;
    responseSchema?: { properties: Record<string, unknown> };
  };
  toolConfig?: unknown;
  tools?: unknown[];
  contents: Array<{ role: string; parts: Array<{ text?: string }> }>;
};

function googleResponse(text: string, finishReason = "STOP") {
  return Response.json({
    candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason }],
    usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 25, totalTokenCount: 45 },
  });
}

test("Google SDK returns facts, message and choices in exactly one strict structured call", async (t) => {
  const facts: ChatPatch[] = [
    { key: "topic", value: "증여", evidence: "증여" },
    { key: "realEstate", value: "제 아파트", evidence: "제 아파트" },
  ];
  const expected = {
    facts,
    message: "아드님은 성인이신가요?",
    choices: ["성인", "미성년자", "잘 모르겠어요"],
    selectionMode: "single" as const,
  };
  const requests: GoogleRequestBody[] = [];

  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    assert.equal(request.url, ENDPOINT);
    assert.equal(request.method, "POST");
    assert.equal(request.headers.get("x-goog-api-key"), SYNTHETIC_KEY);
    requests.push(JSON.parse(await request.text()) as GoogleRequestBody);
    assert.equal(requests.length, 1, "Unexpected retry or extra inference call");
    return googleResponse(JSON.stringify(expected));
  });

  const result = await createDiagnosisAgent({ apiKey: SYNTHETIC_KEY, model: MODEL, messages, facts: {} })
    .generate({ messages: [{ role: "user", content: messages[0].parts[0].text }] });
  assert.equal(requests.length, 1);
  assert.deepEqual(result.output, expected);
  assert.equal(result.steps.length, 1);
  const request = requests[0];
  assert.equal(request.generationConfig.maxOutputTokens, 3_000);
  assert.equal(request.generationConfig.thinkingConfig.thinkingLevel, "minimal");
  assert.equal(request.generationConfig.responseMimeType, "application/json");
  assert.ok(request.generationConfig.responseSchema?.properties.facts);
  assert.ok(request.generationConfig.responseSchema?.properties.message);
  assert.ok(request.generationConfig.responseSchema?.properties.choices);
  assert.ok(request.generationConfig.responseSchema?.properties.selectionMode);
  assert.ok(request.generationConfig.responseSchema?.properties.inputMode);
  assert.ok(!request.tools?.length, "The one-call request must not expose tools");
  assert.equal(request.toolConfig, undefined);
});

test("the strict combined schema rejects malformed output without an SDK retry", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return googleResponse(JSON.stringify({ facts: [], message: "질문", choices: 12, hidden: "private" }));
  });
  await assert.rejects(
    createDiagnosisAgent({ apiKey: SYNTHETIC_KEY, model: MODEL, messages, facts: {} })
      .generate({ messages: [{ role: "user", content: messages[0].parts[0].text }] }),
    (error: unknown) => NoObjectGeneratedError.isInstance(error),
  );
  assert.equal(calls, 1);
});

test("the free Flash backup retains low reasoning while Lite uses minimal", async (t) => {
  assert.equal(MODEL, "gemini-3.5-flash-lite");
  assert.equal(BACKUP_GOOGLE_DIAGNOSIS_MODEL, "gemini-3.8-flash");
  let calls = 0;
  const expected = { facts: [], message: "현재 알려주신 내용으로 검토할 부분을 정리할게요.", choices: [], selectionMode: "single" };
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    calls += 1;
    const request = new Request(input, init);
    assert.equal(request.url, `https://generativelanguage.googleapis.com/v1beta/models/${BACKUP_GOOGLE_DIAGNOSIS_MODEL}:generateContent`);
    const body = JSON.parse(await request.text()) as GoogleRequestBody;
    assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, "low");
    return googleResponse(JSON.stringify(expected));
  });
  const result = await createDiagnosisAgent({ apiKey: SYNTHETIC_KEY, model: BACKUP_GOOGLE_DIAGNOSIS_MODEL, messages, facts: {} })
    .generate({ messages: [{ role: "user", content: messages[0].parts[0].text }] });
  assert.deepEqual(result.output, expected);
  assert.equal(calls, 1);
});

test("an individual Google agent attempt never retries authentication or quota failures", async (t) => {
  for (const status of [403, 429]) {
    await t.test(`HTTP ${status} makes one direct request`, async (subtest) => {
      let calls = 0;
      subtest.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
        calls += 1;
        assert.equal(new Request(input, init).url, ENDPOINT);
        return Response.json({ error: {
          code: status,
          status: status === 429 ? "RESOURCE_EXHAUSTED" : "PERMISSION_DENIED",
          message: "synthetic-private-provider-detail",
        } }, { status });
      });
      await assert.rejects(
        createDiagnosisAgent({ apiKey: SYNTHETIC_KEY, model: MODEL, messages, facts: {} })
          .generate({ messages: [{ role: "user", content: messages[0].parts[0].text }] }),
        (error: unknown) => getDiagnosisPublicErrorCode(error) === (status === 429 ? "AI_RATE_LIMITED" : "AI_AUTHENTICATION_FAILED"),
      );
      assert.equal(calls, 1);
    });
  }
});
