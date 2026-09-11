import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { GET, POST } from "../../app/api/diagnosis/route";
import { acceptFactProposals } from "./agent";
import { assertSameOrigin, DEFAULT_GOOGLE_DIAGNOSIS_MODEL, DIAGNOSIS_LIMITS, diagnosisRequestSchema, getDiagnosisConfiguration, getDiagnosisPublicErrorCode, proposeFactsInputSchema } from "./server";

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

test("API intake preserves pending-only and mixed sources without making them current values", () => {
  const source = { value: "국민은행 대출 1억원으로 정정", evidence: "국민은행 대출 1억원으로 정정", messageId: "user-1", status: "needs_confirmation" };
  const fact = { value: "", evidence: source.evidence, messageId: source.messageId, sources: [source] };
  const result = diagnosisRequestSchema.parse({ ...validBody, facts: { debt: fact } });
  assert.deepEqual(result.facts.debt, fact);
  assert.equal(diagnosisRequestSchema.safeParse({ ...validBody, facts: { debt: { ...fact, sources: undefined } } }).success, false);
  assert.equal(diagnosisRequestSchema.safeParse({ ...validBody, facts: { debt: { ...fact, value: source.value } } }).success, false);
  const current = { value: "임대보증금 4억원", evidence: "임대보증금 4억원", messageId: "user-2" };
  const mixed = { ...fact, value: current.value, sources: [current, source] };
  assert.deepEqual(diagnosisRequestSchema.parse({ ...validBody, facts: { debt: mixed } }).facts.debt, mixed);
});

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

test("structured assistant history keeps the question, strips suggestions, and preserves short user answers", () => {
  const encoded = JSON.stringify({ message: "누구에게 재산을 주려고 하세요?", choices: ["아들", "딸", "배우자"] });
  const result = diagnosisRequestSchema.parse({ messages: [
    { id: "question", role: "assistant", parts: [{ type: "text", text: encoded }] },
    { id: "answer", role: "user", parts: [{ type: "text", text: "아들" }] },
  ], facts: {} });
  assert.equal(result.messages[0].parts[0].text, "누구에게 재산을 주려고 하세요?");
  assert.equal(result.messages[1].parts[0].text, "아들");
  assert.deepEqual(result.facts, {});
  const userJson = diagnosisRequestSchema.parse({ messages: [{ id: "user", role: "user", parts: [{ type: "text", text: encoded }] }] });
  assert.equal(userJson.messages[0].parts[0].text, encoded);
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

const diagnosisEnvironmentKeys = [
  "GOOGLE_GENERATIVE_AI_API_KEY", "GEMINI_API_KEY", "GOOGLE_DIAGNOSIS_MODEL",
  "AI_DIAGNOSIS_FREE_TRIAL_ENABLED", "AI_GATEWAY_API_KEY", "AI_DIAGNOSIS_MODEL",
  "VERCEL_OIDC_TOKEN", "VERCEL", "VERCEL_ENV", "VERCEL_GIT_COMMIT_REF",
] as const;

function setDiagnosisEnvironment(values: Record<string, string>) {
  for (const key of diagnosisEnvironmentKeys) delete process.env[key];
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
}

function saveDiagnosisEnvironment() {
  const previous = new Map(diagnosisEnvironmentKeys.map((key) => [key, process.env[key]]));
  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

test("Google capability and route failures are honest, bounded, and never reveal configuration", async (context) => {
  const restoreEnvironment = saveDiagnosisEnvironment();
  const googleKey = "unit-test-google-secret-never-use-network";
  const aliasKey = "unit-test-alias-secret-never-use-network";
  const explicitConfiguration = {
    GOOGLE_GENERATIVE_AI_API_KEY: googleKey,
    GOOGLE_DIAGNOSIS_MODEL: DEFAULT_GOOGLE_DIAGNOSIS_MODEL,
    AI_DIAGNOSIS_FREE_TRIAL_ENABLED: "true",
  };
  let fetchCalls = 0;
  const fetchMock = context.mock.method(globalThis, "fetch", async () => {
    fetchCalls += 1;
    throw new Error("These route checks must never call a provider");
  });
  try {
    setDiagnosisEnvironment({});
    assert.deepEqual(await GET().json(), {
      configured: false,
      issues: ["FREE_TRIAL_NOT_ENABLED", "MODEL_MISSING", "GOOGLE_API_KEY_MISSING"],
    });
    const unconfigured = await POST(request(validBody));
    assert.equal(unconfigured.status, 503);
    assert.equal((await unconfigured.json()).error.code, "AI_NOT_CONFIGURED");
    assert.equal((await POST(request(validBody, { origin: "https://elsewhere.test" }))).status, 403);

    // A saved Google key cannot enable a trial outside the approved Preview branch.
    for (const flag of [undefined, "false", "FALSE", "1", "TRUE", " true false "]) {
      setDiagnosisEnvironment(explicitConfiguration);
      if (flag === undefined) delete process.env.AI_DIAGNOSIS_FREE_TRIAL_ENABLED;
      else process.env.AI_DIAGNOSIS_FREE_TRIAL_ENABLED = flag;
      assert.equal(getDiagnosisConfiguration(), null);
      assert.deepEqual(await GET().json(), { configured: false, issues: ["FREE_TRIAL_NOT_ENABLED"] });
      assert.equal((await POST(request(validBody))).status, 503);
    }

    setDiagnosisEnvironment({
      ...explicitConfiguration,
      GOOGLE_GENERATIVE_AI_API_KEY: `  ${googleKey}  `,
      GOOGLE_DIAGNOSIS_MODEL: ` ${DEFAULT_GOOGLE_DIAGNOSIS_MODEL} `,
      AI_DIAGNOSIS_FREE_TRIAL_ENABLED: " true\n",
      AI_GATEWAY_API_KEY: "ignored-gateway-secret",
      AI_DIAGNOSIS_MODEL: "ignored/legacy-model",
    });
    assert.deepEqual(getDiagnosisConfiguration(), { apiKey: googleKey, model: DEFAULT_GOOGLE_DIAGNOSIS_MODEL });
    const keyCapability = await GET().text();
    assert.deepEqual(JSON.parse(keyCapability), { configured: true, issues: [] });
    for (const secret of [googleKey, DEFAULT_GOOGLE_DIAGNOSIS_MODEL, "ignored-gateway-secret", "ignored/legacy-model"]) {
      assert.equal(keyCapability.includes(secret), false);
    }
    const invalid = await POST(request({ messages: [] }));
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.text()).includes(googleKey), false);
    assert.equal((await POST(request(validBody, { "content-type": "text/plain" }))).status, 415);
    assert.equal((await POST(request({ payload: "가".repeat(DIAGNOSIS_LIMITS.bodyBytes) }))).status, 413);

    // The direct Google provider accepts its alias, with explicit primary values taking precedence.
    setDiagnosisEnvironment({ ...explicitConfiguration, GEMINI_API_KEY: ` ${aliasKey} ` });
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    assert.deepEqual(getDiagnosisConfiguration(), { apiKey: aliasKey, model: DEFAULT_GOOGLE_DIAGNOSIS_MODEL });
    assert.deepEqual(await GET().json(), { configured: true, issues: [] });
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = googleKey;
    assert.deepEqual(getDiagnosisConfiguration(), { apiKey: googleKey, model: DEFAULT_GOOGLE_DIAGNOSIS_MODEL });
    for (const emptyKey of ["", " ", "\n\t"]) {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = emptyKey;
      assert.equal(getDiagnosisConfiguration(), null);
      assert.deepEqual(await GET().json(), { configured: false, issues: ["GOOGLE_API_KEY_MISSING"] });
      assert.equal((await POST(request(validBody))).status, 503);
    }
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    for (const alias of [undefined, "", "  "]) {
      if (alias === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = alias;
      assert.equal(getDiagnosisConfiguration(), null);
      assert.deepEqual(await GET().json(), { configured: false, issues: ["GOOGLE_API_KEY_MISSING"] });
    }

    // Gateway credentials and Vercel's request identity cannot activate Google's direct API.
    const gatewayIdentities: Record<string, string>[] = [
      { AI_GATEWAY_API_KEY: "unit-test-gateway-secret" },
      { VERCEL_OIDC_TOKEN: "unit-test-oidc-secret" },
      { VERCEL: "1" },
      { AI_GATEWAY_API_KEY: "unit-test-gateway-secret", VERCEL_OIDC_TOKEN: "unit-test-oidc-secret", VERCEL: "1" },
    ];
    for (const identity of gatewayIdentities) {
      setDiagnosisEnvironment({
        GOOGLE_DIAGNOSIS_MODEL: DEFAULT_GOOGLE_DIAGNOSIS_MODEL,
        AI_DIAGNOSIS_FREE_TRIAL_ENABLED: "true",
        ...identity,
      });
      assert.equal(getDiagnosisConfiguration(), null);
      assert.deepEqual(await GET().json(), { configured: false, issues: ["GOOGLE_API_KEY_MISSING"] });
      assert.equal((await POST(request(validBody))).status, 503);
    }

    for (const model of [undefined, "", "  ", "openai/gpt-5.4-mini", "google/gemini-3.8-flash", "gemini-other", "https://elsewhere.test/model", "a".repeat(200)]) {
      setDiagnosisEnvironment(explicitConfiguration);
      if (model === undefined) delete process.env.GOOGLE_DIAGNOSIS_MODEL;
      else process.env.GOOGLE_DIAGNOSIS_MODEL = model;
      assert.equal(getDiagnosisConfiguration(), null);
      assert.deepEqual(await GET().json(), { configured: false, issues: [model?.trim() ? "MODEL_INVALID" : "MODEL_MISSING"] });
      assert.equal((await POST(request(validBody))).status, 503);
    }
    setDiagnosisEnvironment({ ...explicitConfiguration, AI_DIAGNOSIS_MODEL: DEFAULT_GOOGLE_DIAGNOSIS_MODEL });
    delete process.env.GOOGLE_DIAGNOSIS_MODEL;
    assert.deepEqual(await GET().json(), { configured: false, issues: ["MODEL_MISSING"] });

    setDiagnosisEnvironment(explicitConfiguration);
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
    fetchMock.mock.restore();
    restoreEnvironment();
  }
});

test("Google trial defaults stay inside the exact Preview branch and explicit settings override them", async (context) => {
  const restoreEnvironment = saveDiagnosisEnvironment();
  const googleKey = "unit-test-preview-google-secret";
  const approvedPreview = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "codex/chat-opening-topics" };
  let fetchCalls = 0;
  const fetchMock = context.mock.method(globalThis, "fetch", async () => {
    fetchCalls += 1;
    throw new Error("Readiness tests must never call a provider");
  });
  try {
    assert.equal(DEFAULT_GOOGLE_DIAGNOSIS_MODEL, "gemini-3.8-flash");
    const nonTrialEnvironments: Record<string, string>[] = [
      {},
      { VERCEL_OIDC_TOKEN: "unit-test-local-oidc" },
      { ...approvedPreview, VERCEL_ENV: "production" },
      { ...approvedPreview, VERCEL_GIT_COMMIT_REF: "codex/unrelated-preview" },
      { ...approvedPreview, VERCEL_GIT_COMMIT_REF: "codex/chat-opening-topics-extra" },
      { ...approvedPreview, VERCEL_GIT_COMMIT_REF: "" },
      { ...approvedPreview, VERCEL_ENV: "" },
      { VERCEL_GIT_COMMIT_REF: approvedPreview.VERCEL_GIT_COMMIT_REF },
      { VERCEL_ENV: approvedPreview.VERCEL_ENV },
    ];
    for (const environment of nonTrialEnvironments) {
      setDiagnosisEnvironment({ ...environment, GOOGLE_GENERATIVE_AI_API_KEY: googleKey });
      assert.equal(getDiagnosisConfiguration(), null);
      assert.deepEqual(await GET().json(), { configured: false, issues: ["FREE_TRIAL_NOT_ENABLED", "MODEL_MISSING"] });
      assert.equal((await POST(request(validBody))).status, 503);
    }

    // Preview defaults only choose a model and enable the trial; a Google key is still mandatory.
    setDiagnosisEnvironment({ ...approvedPreview, VERCEL: "1", VERCEL_OIDC_TOKEN: "unit-test-preview-oidc", AI_GATEWAY_API_KEY: "unit-test-preview-gateway" });
    assert.equal(getDiagnosisConfiguration(), null);
    assert.deepEqual(await GET().json(), { configured: false, issues: ["GOOGLE_API_KEY_MISSING"] });
    assert.equal((await POST(request(validBody))).status, 503);
    setDiagnosisEnvironment({ ...approvedPreview, GOOGLE_GENERATIVE_AI_API_KEY: googleKey });
    assert.deepEqual(getDiagnosisConfiguration(), { apiKey: googleKey, model: DEFAULT_GOOGLE_DIAGNOSIS_MODEL });
    assert.deepEqual(await GET().json(), { configured: true, issues: [] });

    for (const flag of ["false", " false ", "", "FALSE", "1", "TRUE"]) {
      setDiagnosisEnvironment({ ...approvedPreview, GOOGLE_GENERATIVE_AI_API_KEY: googleKey, AI_DIAGNOSIS_FREE_TRIAL_ENABLED: flag });
      assert.equal(getDiagnosisConfiguration(), null);
      assert.deepEqual(await GET().json(), { configured: false, issues: ["FREE_TRIAL_NOT_ENABLED"] });
      assert.equal((await POST(request(validBody))).status, 503);
    }
    for (const model of ["", "  ", "https://elsewhere.test/model", "google/gemini-3.8-flash", "openai/gpt-5.4-mini"]) {
      setDiagnosisEnvironment({ ...approvedPreview, GOOGLE_GENERATIVE_AI_API_KEY: googleKey, GOOGLE_DIAGNOSIS_MODEL: model });
      assert.equal(getDiagnosisConfiguration(), null);
      assert.deepEqual(await GET().json(), { configured: false, issues: [model.trim() ? "MODEL_INVALID" : "MODEL_MISSING"] });
      assert.equal((await POST(request(validBody))).status, 503);
    }
    // The old Gateway model setting has no effect, including when it is explicitly empty.
    for (const legacyModel of ["", "openai/gpt-5.4-mini", "test/explicit"]) {
      setDiagnosisEnvironment({ ...approvedPreview, GOOGLE_GENERATIVE_AI_API_KEY: googleKey, AI_DIAGNOSIS_MODEL: legacyModel });
      assert.deepEqual(getDiagnosisConfiguration(), { apiKey: googleKey, model: DEFAULT_GOOGLE_DIAGNOSIS_MODEL });
      assert.deepEqual(await GET().json(), { configured: true, issues: [] });
    }
    setDiagnosisEnvironment({
      GOOGLE_GENERATIVE_AI_API_KEY: googleKey,
      GOOGLE_DIAGNOSIS_MODEL: DEFAULT_GOOGLE_DIAGNOSIS_MODEL,
      AI_DIAGNOSIS_FREE_TRIAL_ENABLED: " true ",
    });
    assert.deepEqual(getDiagnosisConfiguration(), { apiKey: googleKey, model: DEFAULT_GOOGLE_DIAGNOSIS_MODEL });
    assert.equal(fetchCalls, 0);
  } finally {
    fetchMock.mock.restore();
    restoreEnvironment();
  }
});
