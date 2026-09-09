import assert from "node:assert/strict";
import test from "node:test";
import { NoObjectGeneratedError } from "ai";
import { createDiagnosisAgent } from "./agent";
import type { ChatPatch } from "./intake";
import { getDiagnosisPublicErrorCode, type DiagnosisRequest } from "./server";

const MODEL = "gemini-3.8-flash";
const SYNTHETIC_KEY = "synthetic-google-key-never-valid";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const messages: DiagnosisRequest["messages"] = [{
  id: "synthetic-user",
  role: "user",
  parts: [{ type: "text", text: "증여를 준비하고 있어요. 제 아파트를 아들에게 주려고 해요." }],
}];

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
  assert.equal(request.generationConfig.thinkingConfig.thinkingLevel, "low");
  assert.equal(request.generationConfig.responseMimeType, "application/json");
  assert.ok(request.generationConfig.responseSchema?.properties.facts);
  assert.ok(request.generationConfig.responseSchema?.properties.message);
  assert.ok(request.generationConfig.responseSchema?.properties.choices);
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
