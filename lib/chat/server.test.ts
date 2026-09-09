import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { GET, POST } from "../../app/api/diagnosis/route";
import { acceptFactProposals } from "./agent";
import { assertSameOrigin, DIAGNOSIS_LIMITS, diagnosisRequestSchema, getDiagnosisConfiguration, getDiagnosisPublicErrorCode, proposeFactsInputSchema } from "./server";

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

test("public provider errors expose only fixed codes from numeric statusCode", () => {
  const expected = new Map([
    [402, "AI_CREDIT_REQUIRED"], [429, "AI_RATE_LIMITED"],
    [401, "AI_AUTHENTICATION_FAILED"], [403, "AI_AUTHENTICATION_FAILED"],
    [400, "AI_INVALID_REQUEST"], [404, "AI_MODEL_UNAVAILABLE"],
    [500, "AI_PROVIDER_UNAVAILABLE"], [502, "AI_PROVIDER_UNAVAILABLE"], [599, "AI_PROVIDER_UNAVAILABLE"],
  ]);
  for (const [statusCode, code] of expected) {
    const inspected: PropertyKey[] = [];
    const providerError = new Proxy({ statusCode, cause: undefined }, {
      get(target, property, receiver) {
        inspected.push(property);
        assert.ok(property === "statusCode" || property === "cause", "Private provider fields must not be read");
        return Reflect.get(target, property, receiver);
      },
    });
    assert.equal(getDiagnosisPublicErrorCode(providerError), code);
    assert.ok(inspected.includes("statusCode"));
    assert.ok(inspected.every((property) => property === "statusCode" || property === "cause"));
  }
  const privateText = "private-input-and-token-must-stay-private";
  for (const error of [
    { message: `429 ${privateText}`, body: { statusCode: 402, token: privateText }, headers: { authorization: privateText } },
    { statusCode: "429", message: privateText },
    { statusCode: 200, message: privateText },
    { statusCode: 500.5, message: privateText },
    privateText,
    null,
  ]) {
    assert.equal(getDiagnosisPublicErrorCode(error), "AI_UNAVAILABLE");
  }
  assert.equal(getDiagnosisPublicErrorCode({ statusCode: 502, cause: { statusCode: 429, message: privateText } }), "AI_RATE_LIMITED");
  assert.equal(getDiagnosisPublicErrorCode({ cause: { cause: { statusCode: 402 } } }), "AI_CREDIT_REQUIRED");
});

test("public error classification bounds cause traversal and tolerates cycles and throwing properties", () => {
  const cycle: { cause?: unknown } = {};
  cycle.cause = cycle;
  assert.equal(getDiagnosisPublicErrorCode(cycle), "AI_UNAVAILABLE");
  assert.equal(getDiagnosisPublicErrorCode({ statusCode: 503, cause: cycle }), "AI_PROVIDER_UNAVAILABLE");

  let deepError: unknown = { statusCode: 402 };
  for (let index = 0; index < 8; index += 1) deepError = { cause: deepError };
  assert.equal(getDiagnosisPublicErrorCode(deepError), "AI_UNAVAILABLE");
  const throwingStatus = Object.defineProperty({ cause: { statusCode: 429 } }, "statusCode", {
    get() { throw new Error("private-provider-error"); },
  });
  assert.equal(getDiagnosisPublicErrorCode(throwingStatus), "AI_RATE_LIMITED");
  const throwingCause = Object.defineProperty({}, "cause", {
    get() { throw new Error("private-provider-error"); },
  });
  assert.equal(getDiagnosisPublicErrorCode(throwingCause), "AI_UNAVAILABLE");
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

test("capability and route failures are honest, bounded, and never reveal configuration", async (context) => {
  const previousKey = process.env.AI_GATEWAY_API_KEY;
  const previousModel = process.env.AI_DIAGNOSIS_MODEL;
  const previousEnabled = process.env.AI_DIAGNOSIS_FREE_TRIAL_ENABLED;
  const previousOidc = process.env.VERCEL_OIDC_TOKEN;
  const previousVercel = process.env.VERCEL;
  const previousVercelEnvironment = process.env.VERCEL_ENV;
  const previousVercelBranch = process.env.VERCEL_GIT_COMMIT_REF;
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("These route checks must never call a provider");
  };
  try {
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.AI_DIAGNOSIS_MODEL;
    delete process.env.AI_DIAGNOSIS_FREE_TRIAL_ENABLED;
    delete process.env.VERCEL_OIDC_TOKEN;
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_GIT_COMMIT_REF;
    assert.deepEqual(await GET().json(), { configured: false, issues: ["FREE_TRIAL_NOT_ENABLED", "MODEL_MISSING", "AUTHENTICATION_MISSING"] });
    const unconfigured = await POST(request(validBody));
    assert.equal(unconfigured.status, 503);
    assert.equal((await unconfigured.json()).error.code, "AI_NOT_CONFIGURED");
    assert.equal((await POST(request(validBody, { origin: "https://elsewhere.test" }))).status, 403);

    process.env.AI_GATEWAY_API_KEY = "unit-test-secret-never-use-network";
    process.env.AI_DIAGNOSIS_MODEL = "test/validation-only";
    // Existing credentials cannot silently activate an unverified free trial.
    for (const flag of [undefined, "false", "FALSE", "1", "TRUE", " true false "]) {
      if (flag === undefined) delete process.env.AI_DIAGNOSIS_FREE_TRIAL_ENABLED;
      else process.env.AI_DIAGNOSIS_FREE_TRIAL_ENABLED = flag;
      assert.equal(getDiagnosisConfiguration(), null);
      assert.deepEqual(await GET().json(), { configured: false, issues: ["FREE_TRIAL_NOT_ENABLED"] });
      assert.equal((await POST(request(validBody))).status, 503);
    }
    process.env.AI_DIAGNOSIS_FREE_TRIAL_ENABLED = " true\n";
    const keyCapability = await GET().text();
    assert.deepEqual(JSON.parse(keyCapability), { configured: true, issues: [] });
    assert.equal(keyCapability.includes(process.env.AI_GATEWAY_API_KEY), false);
    assert.equal(keyCapability.includes(process.env.AI_DIAGNOSIS_MODEL), false);
    const invalid = await POST(request({ messages: [] }));
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.text()).includes(process.env.AI_GATEWAY_API_KEY), false);
    assert.equal((await POST(request(validBody, { "content-type": "text/plain" }))).status, 415);
    assert.equal((await POST(request({ payload: "가".repeat(DIAGNOSIS_LIMITS.bodyBytes) }))).status, 413);

    delete process.env.AI_GATEWAY_API_KEY;
    assert.equal(getDiagnosisConfiguration(), null);
    assert.deepEqual(await GET().json(), { configured: false, issues: ["AUTHENTICATION_MISSING"] });
    process.env.VERCEL_OIDC_TOKEN = "unit-test-oidc-never-use-network";
    assert.deepEqual(getDiagnosisConfiguration(), { apiKey: undefined, model: "test/validation-only" });
    const capability = await GET().text();
    assert.deepEqual(JSON.parse(capability), { configured: true, issues: [] });
    assert.equal(capability.includes(process.env.VERCEL_OIDC_TOKEN), false);
    delete process.env.VERCEL_OIDC_TOKEN;
    process.env.VERCEL = "1";
    assert.deepEqual(getDiagnosisConfiguration(), { apiKey: undefined, model: "test/validation-only" });
    for (const model of [undefined, "", "  ", "https://elsewhere.test/model", "provider/one,provider/two", "provider/" + "a".repeat(161)]) {
      if (model === undefined) delete process.env.AI_DIAGNOSIS_MODEL;
      else process.env.AI_DIAGNOSIS_MODEL = model;
      assert.equal(getDiagnosisConfiguration(), null);
      assert.deepEqual(await GET().json(), { configured: false, issues: [model?.trim() ? "MODEL_INVALID" : "MODEL_MISSING"] });
    }

    process.env.AI_DIAGNOSIS_MODEL = "test/validation-only";
    const missingGuideRoot = mkdtempSync(path.join(tmpdir(), "diagnosis-missing-guide-"));
    const cwdMock = context.mock.method(process, "cwd", () => missingGuideRoot);
    try {
      const missingGuideCapability = await GET().text();
      assert.deepEqual(JSON.parse(missingGuideCapability), { configured: false, issues: ["CHAT_GUIDE_UNAVAILABLE"] });
      assert.equal(missingGuideCapability.includes(missingGuideRoot), false);
      assert.equal((await POST(request(validBody))).status, 502);
    } finally {
      cwdMock.mock.restore();
      rmSync(missingGuideRoot, { recursive: true, force: true });
    }
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.AI_DIAGNOSIS_MODEL;
    else process.env.AI_DIAGNOSIS_MODEL = previousModel;
    if (previousEnabled === undefined) delete process.env.AI_DIAGNOSIS_FREE_TRIAL_ENABLED;
    else process.env.AI_DIAGNOSIS_FREE_TRIAL_ENABLED = previousEnabled;
    if (previousOidc === undefined) delete process.env.VERCEL_OIDC_TOKEN;
    else process.env.VERCEL_OIDC_TOKEN = previousOidc;
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
    if (previousVercelEnvironment === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercelEnvironment;
    if (previousVercelBranch === undefined) delete process.env.VERCEL_GIT_COMMIT_REF;
    else process.env.VERCEL_GIT_COMMIT_REF = previousVercelBranch;
  }
});

test("approved trial defaults stay inside the exact Preview branch and explicit settings override them", async (context) => {
  const keys = ["AI_GATEWAY_API_KEY", "AI_DIAGNOSIS_MODEL", "AI_DIAGNOSIS_FREE_TRIAL_ENABLED", "VERCEL_OIDC_TOKEN", "VERCEL", "VERCEL_ENV", "VERCEL_GIT_COMMIT_REF"];
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  const approvedPreview = { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "codex/chat-opening-topics" };
  let fetchCalls = 0;
  context.mock.method(globalThis, "fetch", async () => {
    fetchCalls += 1;
    throw new Error("Readiness tests must never call a provider");
  });
  const setEnvironment = (values: Record<string, string>) => {
    for (const key of keys) delete process.env[key];
    for (const [key, value] of Object.entries(values)) process.env[key] = value;
  };
  try {
    const nonTrialEnvironments: Record<string, string>[] = [
      {},
      { VERCEL_OIDC_TOKEN: "unit-test-local-oidc" },
      { ...approvedPreview, VERCEL_ENV: "production" },
      { ...approvedPreview, VERCEL_GIT_COMMIT_REF: "codex/unrelated-preview" },
      { ...approvedPreview, VERCEL_GIT_COMMIT_REF: "" },
      { ...approvedPreview, VERCEL_ENV: "" },
    ];
    for (const environment of nonTrialEnvironments) {
      setEnvironment(environment);
      assert.equal(getDiagnosisConfiguration(), null);
      const readiness = await GET().json();
      assert.equal(readiness.configured, false);
      assert.ok(readiness.issues.includes("FREE_TRIAL_NOT_ENABLED"));
      assert.ok(readiness.issues.includes("MODEL_MISSING"));
      assert.equal((await POST(request(validBody))).status, 503);
    }

    setEnvironment(approvedPreview);
    assert.deepEqual(getDiagnosisConfiguration(), { apiKey: undefined, model: "openai/gpt-5.4-mini" });
    assert.deepEqual(await GET().json(), { configured: true, issues: [] });

    // Preview defaults never create credentials or bypass authentication.
    delete process.env.VERCEL;
    assert.deepEqual(await GET().json(), { configured: false, issues: ["AUTHENTICATION_MISSING"] });

    for (const flag of ["false", " false ", "", "FALSE", "1", "TRUE"]) {
      setEnvironment({ ...approvedPreview, AI_DIAGNOSIS_FREE_TRIAL_ENABLED: flag });
      assert.equal(getDiagnosisConfiguration(), null);
      assert.deepEqual(await GET().json(), { configured: false, issues: ["FREE_TRIAL_NOT_ENABLED"] });
      assert.equal((await POST(request(validBody))).status, 503);
    }
    for (const model of ["", "  ", "https://elsewhere.test/model", "provider/one,provider/two"]) {
      setEnvironment({ ...approvedPreview, AI_DIAGNOSIS_MODEL: model });
      assert.equal(getDiagnosisConfiguration(), null);
      assert.deepEqual(await GET().json(), { configured: false, issues: [model.trim() ? "MODEL_INVALID" : "MODEL_MISSING"] });
      assert.equal((await POST(request(validBody))).status, 503);
    }
    setEnvironment({ ...approvedPreview, AI_DIAGNOSIS_MODEL: "test/explicit", AI_DIAGNOSIS_FREE_TRIAL_ENABLED: " true " });
    assert.deepEqual(getDiagnosisConfiguration(), { apiKey: undefined, model: "test/explicit" });
    assert.equal(fetchCalls, 0);
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
