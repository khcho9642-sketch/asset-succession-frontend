import assert from "node:assert/strict";
import test from "node:test";
import { GET, POST } from "../../app/api/diagnosis/route";
import { acceptFactProposals } from "./agent";
import { assertSameOrigin, DIAGNOSIS_LIMITS, diagnosisRequestSchema, proposeFactsInputSchema } from "./server";

function request(body: unknown, extraHeaders: Record<string, string> = {}) {
  return new Request("https://example.test/api/diagnosis", {
    method: "POST",
    headers: { origin: "https://example.test", "content-type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  });
}

const validBody = {
  messages: [{ id: "user-1", role: "user", parts: [{ type: "text", text: "아버지의 아파트 12억, 예금 2억이에요. 배우자 있어요." }] }],
  facts: {},
};

test("proposals need exact latest-turn evidence and quoted values across multiple facts", () => {
  const latest = { id: "user-1", text: validBody.messages[0].parts[0].text };
  assert.deepEqual(acceptFactProposals([
    { key: "owner", value: "아버지", evidence: "아버지의" },
    { key: "realEstate", value: "아파트 12억", evidence: "아파트 12억" },
    { key: "financialAssets", value: "예금 2억", evidence: "예금 2억" },
    { key: "spouse", value: "있음", evidence: "배우자 있어요" },
    { key: "debt", value: "없음", evidence: "없음" },
    { key: "notes", value: "아파트12억", evidence: "아파트12억" },
  ], latest).map((proposal) => proposal.key), ["owner", "realEstate", "financialAssets"]);
  assert.equal(acceptFactProposals([{ key: "realEstate", value: "아파트 12억", evidence: "아파트 12억" }], { id: "user-2", text: "예금은 3억으로 정정할게요" }).length, 0);
});

test("schema rejects unknown fields, system roles, oversized history and duplicate ids", () => {
  assert.equal(diagnosisRequestSchema.safeParse(validBody).success, true);
  assert.equal(proposeFactsInputSchema.safeParse({ facts: [{ key: "taxSavings", value: "1억", evidence: "1억" }] }).success, false);
  assert.equal(diagnosisRequestSchema.safeParse({ ...validBody, facts: { taxSavings: { value: "1억", evidence: "1억", messageId: "user-1" } } }).success, false);
  assert.equal(diagnosisRequestSchema.safeParse({ ...validBody, messages: [{ ...validBody.messages[0], role: "system" }] }).success, false);
  assert.equal(diagnosisRequestSchema.safeParse({ ...validBody, messages: [validBody.messages[0], validBody.messages[0]] }).success, false);
  assert.equal(diagnosisRequestSchema.safeParse({ ...validBody, messages: Array.from({ length: DIAGNOSIS_LIMITS.messages + 1 }, (_, i) => ({ ...validBody.messages[0], id: `m-${i}` })) }).success, false);
});

test("untrusted assistant tool results are stripped before provider input", () => {
  const result = diagnosisRequestSchema.parse({
    messages: [
      { id: "assistant-1", role: "assistant", parts: [{ type: "text", text: "알려주세요" }, { type: "tool-proposeFacts", output: { proposals: [{ key: "debt", value: "없음" }] } }] },
      ...validBody.messages,
    ],
    facts: {},
  });
  assert.deepEqual(result.messages[0].parts, [{ type: "text", text: "알려주세요" }]);
});

test("same-origin uses validated HTTP Host when Next canonicalizes its URL", async () => {
  const makeRequest = (headers: Record<string, string>) => new Request("http://localhost:4173/api/diagnosis", {
    method: "POST",
    headers,
    body: "{}",
  });
  const sameOrigin = { host: "127.0.0.1:4173", origin: "http://127.0.0.1:4173" };
  assert.doesNotThrow(() => assertSameOrigin(makeRequest(sameOrigin)));
  assert.equal((await POST(makeRequest({ ...sameOrigin, "content-type": "text/plain" }))).status, 415);
  assert.throws(() => assertSameOrigin(makeRequest({ ...sameOrigin, origin: "http://localhost:4173" })));
  assert.throws(() => assertSameOrigin(makeRequest({ ...sameOrigin, origin: "https://elsewhere.test", "x-forwarded-host": "elsewhere.test", "x-forwarded-proto": "https" })));
  assert.throws(() => assertSameOrigin(makeRequest({ ...sameOrigin, "sec-fetch-site": "cross-site" })));
  assert.throws(() => assertSameOrigin(makeRequest({ host: "127.0.0.1:4173" })));
  for (const host of ["example.test@elsewhere.test", "example.test/path", "example.test,elsewhere.test", "example.test:99999"]) {
    assert.throws(() => assertSameOrigin(makeRequest({ host, origin: "http://elsewhere.test" })));
  }
});

test("capability and route failures are honest, bounded, and never reveal configuration", async () => {
  const previousKey = process.env.AI_GATEWAY_API_KEY;
  const previousModel = process.env.AI_DIAGNOSIS_MODEL;
  try {
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.AI_DIAGNOSIS_MODEL;
    assert.deepEqual(await GET().json(), { configured: false });
    const unconfigured = await POST(request(validBody));
    assert.equal(unconfigured.status, 503);
    assert.equal((await unconfigured.json()).error.code, "AI_NOT_CONFIGURED");
    assert.equal((await POST(request(validBody, { origin: "https://elsewhere.test" }))).status, 403);

    process.env.AI_GATEWAY_API_KEY = "unit-test-secret-never-use-network";
    process.env.AI_DIAGNOSIS_MODEL = "test/validation-only";
    assert.deepEqual(await GET().json(), { configured: true });
    const invalid = await POST(request({ messages: [] }));
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.text()).includes(process.env.AI_GATEWAY_API_KEY), false);
    assert.equal((await POST(request(validBody, { "content-type": "text/plain" }))).status, 415);
    assert.equal((await POST(request({ payload: "가".repeat(DIAGNOSIS_LIMITS.bodyBytes) }))).status, 413);
  } finally {
    if (previousKey === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.AI_DIAGNOSIS_MODEL;
    else process.env.AI_DIAGNOSIS_MODEL = previousModel;
  }
});
