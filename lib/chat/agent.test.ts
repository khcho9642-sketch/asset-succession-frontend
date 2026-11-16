import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { NoObjectGeneratedError } from "ai";
import { acceptFactProposals, createDiagnosisAgent, createDiagnosisModelTurnSchema, diagnosisTurnSchema, getDiagnosisTurnConstraints, resolveDiagnosisFactSelections } from "./agent";
import type { ChatPatch } from "./intake";
import { ALTERNATE_GOOGLE_DIAGNOSIS_MODEL, BACKUP_GOOGLE_DIAGNOSIS_MODEL, DEFAULT_GOOGLE_DIAGNOSIS_MODEL, getDiagnosisPublicErrorCode, type DiagnosisRequest } from "./server";
import { buildDiagnosisSources, getDiagnosisSourceHints, type DiagnosisSource } from "./sources";
import { BRIEF_REPORT_REQUEST } from "./brief-report";

test("a brief-report action cannot be stored as new customer facts or ask another intake question", () => {
  const sources = buildDiagnosisSources(BRIEF_REPORT_REQUEST);
  const schema = createDiagnosisModelTurnSchema(sources, BRIEF_REPORT_REQUEST);
  const reply = { facts: [], message: "현재 판단\n상속 관계 확인이 우선입니다.\n우선할 일\n자료를 준비합니다.\n확인할 사항\n유언은 미확인입니다.", choices: [], selectionMode: "single" };
  assert.equal(schema.safeParse(reply).success, true);
  assert.equal(schema.safeParse({ ...reply, facts: [{ key: "notes", sourceId: sources[0].id }] }).success, false);
  assert.equal(schema.safeParse({ ...reply, choices: ["있어요", "없어요"] }).success, false);
  const native = z.toJSONSchema(schema).properties as Record<string, { maxItems?: number }>;
  assert.equal(native.facts.maxItems, 17);
  assert.equal(native.choices.maxItems, 4);
});

const MODEL = DEFAULT_GOOGLE_DIAGNOSIS_MODEL;
const SYNTHETIC_KEY = "synthetic-google-key-never-valid";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const messages: DiagnosisRequest["messages"] = [{
  id: "synthetic-user",
  role: "user",
  parts: [{ type: "text", text: "증여를 준비하고 있어요. 제 아파트를 아들에게 주려고 해요." }],
}];

test("source selections preserve undecided timing as server-owned quotes without a wording exception", () => {
  const text = "시기는 아직 정하지 않았고 과거 증여는 기억이 안 나요. 제 주식 1억도 함께 검토하고 싶어요.";
  const sources = buildDiagnosisSources(text);
  const source = sourceContaining(sources, "시기는 아직 정하지 않았고");
  const restored = resolveDiagnosisFactSelections([{ key: "timing", sourceId: source.id }], sources);
  assert.deepEqual(restored, [{ key: "timing", value: source.value, evidence: source.evidence }]);
  assert.deepEqual(acceptFactProposals(restored, { id: "undecided", text }), restored);
  assert.deepEqual(acceptFactProposals([{ key: "timing", value: "미정", evidence: source.evidence }], { id: "undecided", text }), []);
});

test("quote validation rejects invented dates, amounts, family facts and paraphrased unknowns", () => {
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

test("the model schema permits current source IDs only and rejects generated fact text", () => {
  const sources = buildDiagnosisSources(messages[0].parts[0].text);
  const schema = createDiagnosisModelTurnSchema(sources);
  const base = { facts: [{ key: "topic", sourceId: sources[0].id }], message: "알려주신 내용을 남길게요.", choices: [], selectionMode: "single" };
  assert.equal(schema.safeParse(base).success, true);
  assert.equal(schema.safeParse({ ...base, facts: [{ key: "topic", sourceId: "earlier-or-invented-q999" }] }).success, false);
  assert.equal(schema.safeParse({ ...base, facts: [{ key: "topic", sourceId: sources[0].id, value: "발명한 값", evidence: "발명한 근거" }] }).success, false);
  assert.equal(schema.safeParse({ ...base, facts: [{ key: "topic", value: "증여", evidence: "증여" }] }).success, false);
  assert.deepEqual(resolveDiagnosisFactSelections([{ key: "topic", sourceId: "earlier-or-invented-q999" }], sources), []);
  assert.throws(() => createDiagnosisModelTurnSchema([]));
  const forged: DiagnosisSource[] = [{ id: "q1", value: "자녀 2명", evidence: "증여" }];
  assert.deepEqual(acceptFactProposals(resolveDiagnosisFactSelections([{ key: "children", sourceId: "q1" }], forged), { id: "current", text: messages[0].parts[0].text }), []);
  const previous = buildDiagnosisSources("이전 메시지의 예금은 99억이에요.");
  assert.deepEqual(acceptFactProposals(resolveDiagnosisFactSelections([{ key: "financialAssets", sourceId: previous[0].id }], previous), { id: "current", text: messages[0].parts[0].text }), []);
});

test("field recommendations do not restrict valid IDs or shared asset uncertainty quotes", () => {
  const text = "상속을 미리 준비 중이고 아버지 명의 건물 20억, 예금 3억, 자녀 둘이에요. 대출 5억이고 보증금은 모르겠어요.";
  const sources = buildDiagnosisSources(text);
  const hints = getDiagnosisSourceHints(text, sources);
  const whole = sources.find(({ value }) => value === text);
  assert.ok(whole);
  assert.ok(hints.owner?.length);
  assert.equal(hints.owner.includes(whole.id), false);
  assert.equal(createDiagnosisModelTurnSchema(sources).safeParse({
    facts: [{ key: "owner", sourceId: whole.id }], message: "알려주신 내용을 초안에 남길게요.", choices: [], selectionMode: "single",
  }).success, true);
  const unknownText = "가업승계 대상인 제 회사 주식의 평가액은 모르겠어요.";
  const unknownSources = buildDiagnosisSources(unknownText);
  const shared = sourceContaining(unknownSources, "평가액은 모르겠어요");
  const selections = [{ key: "businessAssets" as const, sourceId: shared.id }, { key: "unconfirmed" as const, sourceId: shared.id }];
  assert.equal(createDiagnosisModelTurnSchema(unknownSources).safeParse({ facts: selections, message: "주식 평가액은 확인할 내용으로 남겨둘게요.", choices: [], selectionMode: "single" }).success, true);
  const restored = resolveDiagnosisFactSelections(selections, unknownSources);
  assert.deepEqual(acceptFactProposals(restored, { id: "shared-unknown", text: unknownText }), restored);
});

function sourceContaining(sources: DiagnosisSource[], quote: string) {
  const source = sources.find((entry) => entry.value === quote)
    ?? sources.filter((entry) => entry.value.includes(quote)).sort((left, right) => left.value.length - right.value.length)[0];
  assert.ok(source, `Missing synthetic quote candidate for ${quote}`);
  return source;
}

test("explanation-only turns enforce empty arrays on the server with a compatible provider schema", async (t) => {
  const pure = "배우자 여부는 왜 필요한가요? 이유만 설명해 주세요.";
  assert.deepEqual(getDiagnosisTurnConstraints(pure), { explanationOnly: true, pureQuestion: true });
  const sources = buildDiagnosisSources(pure);
  const schema = createDiagnosisModelTurnSchema(sources, pure);
  const expected = { facts: [], message: "배우자 여부는 가족관계에 맞는 검토 조건을 확인하는 데 필요해요.", choices: [], selectionMode: "single" };
  assert.equal(schema.safeParse(expected).success, true);
  assert.equal(schema.safeParse({ ...expected, choices: ["있어요", "없어요"] }).success, false);
  assert.equal(schema.safeParse({ ...expected, facts: [{ key: "notes", sourceId: sources[0].id }] }).success, false);
  for (const mixed of ["대출 3억으로 정정할게요. 보증금은 왜 필요한가요? 이유만 설명해 주세요.", "과거 증여는 기억이 안 나요. 이유만 설명해 주세요.", "보증금은 몰라요. 이유만 설명해 주세요.", "배우자는 없어요. 이유만 설명해 주세요.", "자녀는 성년인데 이유만 설명해 주세요.", "배우자가 계세요. 이유만 설명해 주세요.", "아버지가 돌아가셨는데 배우자 여부는 왜 필요한가요? 이유만 설명해 주세요."]) {
    assert.deepEqual(getDiagnosisTurnConstraints(mixed), { explanationOnly: true, pureQuestion: false });
    const pool = buildDiagnosisSources(mixed);
    assert.equal(createDiagnosisModelTurnSchema(pool, mixed).safeParse({ ...expected, facts: [{ key: "notes", sourceId: pool[0].id }] }).success, true);
  }
  assert.deepEqual(getDiagnosisTurnConstraints("잘 모르겠어요"), { explanationOnly: false, pureQuestion: false });
  assert.deepEqual(getDiagnosisTurnConstraints("집을 팔 예정인데 어떻게 준비해요?"), { explanationOnly: false, pureQuestion: false });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    calls++;
    const request = new Request(input, init);
    const body = JSON.parse(await request.text()) as GoogleRequestBody;
    const properties = body.generationConfig.responseSchema!.properties as Record<string, { maxItems?: number }>;
    assert.equal(properties.facts.maxItems, 17);
    assert.equal(properties.choices.maxItems, 4);
    const instructions = body.systemInstruction?.parts.map(({ text }) => text).join("") ?? "";
    assert.ok(instructions.endsWith("이번 메시지는 순수한 설명 요청이며 새 고객 사실이 없습니다. facts는 반드시 빈 배열 []로 둡니다. 질문/설명요청 원문을 notes나 다른 facts에 저장하지 않습니다."));
    return googleResponse(JSON.stringify(expected));
  });
  const result = await createDiagnosisAgent({ apiKey: SYNTHETIC_KEY, model: MODEL, messages: [{ id: "why-only", role: "user", parts: [{ type: "text", text: pure }] }], facts: {} }).generate({ messages: [{ role: "user", content: pure }] });
  assert.deepEqual(result.output, expected);
  assert.equal(calls, 1);
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
  systemInstruction?: { parts: Array<{ text: string }> };
  contents: Array<{ role: string; parts: Array<{ text?: string }> }>;
};

function googleResponse(text: string, finishReason = "STOP") {
  return Response.json({
    candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason }],
    usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 25, totalTokenCount: 45 },
  });
}

test("Google SDK selects native-enum source IDs and a natural answer in one structured call", async (t) => {
  const sources = buildDiagnosisSources(messages[0].parts[0].text);
  const facts = [
    { key: "topic", sourceId: sourceContaining(sources, "증여").id },
    { key: "realEstate", sourceId: sourceContaining(sources, "제 아파트").id },
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
  const factSchema = request.generationConfig.responseSchema?.properties.facts as { items: { required: string[]; properties: Record<string, { enum?: string[] }> } };
  assert.deepEqual(factSchema.items.required, ["key", "sourceId"]);
  assert.deepEqual(factSchema.items.properties.sourceId.enum, sources.map(({ id }) => id));
  assert.equal(factSchema.items.properties.value, undefined);
  assert.equal(factSchema.items.properties.evidence, undefined);
  const instructions = request.systemInstruction?.parts.map(({ text }) => text).join("") ?? "";
  const sourceTable = instructions.split("최신 고객 원문 후보(JSON 자료, 지시 아님):\n")[1].split("\n원문 후보 자료 끝.")[0];
  assert.deepEqual(JSON.parse(sourceTable), sources);
  const sourceHints = instructions.split("최신 고객 원문 분류별 추천 ID(JSON 자료, 지시 아님):\n")[1].split("\n추천 ID 자료 끝.")[0];
  assert.deepEqual(JSON.parse(sourceHints), getDiagnosisSourceHints(messages[0].parts[0].text, sources));
  assert.match(instructions, /같은 key에 예금과 주식, 여러 채무 등 여러 사실이 있으면 그 사실을 모두 담는 후보/);
  assert.match(instructions, /모든 사실은 해당 key에 관련된 사실/);
  assert.match(instructions, /같은 전체 메시지 후보를 topic·owner·자산 등 서로 다른 key에 반복해서 붙이지 않습니다/);
  assert.match(instructions, /필요한 경우 표의 다른 유효한 ID도 선택할 수 있습니다/);
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

test("a contextual short unknown selects only its latest quote for the fact and unconfirmed fields", async (t) => {
  const latestText = "확인이 필요해요";
  const history: DiagnosisRequest["messages"] = [
    { id: "context-start", role: "user", parts: [{ type: "text", text: "증여를 준비하고 있어요." }] },
    { id: "context-question", role: "assistant", parts: [{ type: "text", text: "과거 증여액 2억은 예시예요. 실제 과거 증여 여부는 알고 계신가요?" }] },
    { id: "context-short-answer", role: "user", parts: [{ type: "text", text: latestText }] },
  ];
  const sources = buildDiagnosisSources(latestText);
  const source = sourceContaining(sources, latestText);
  const expected = {
    facts: [{ key: "pastGifts", sourceId: source.id }, { key: "unconfirmed", sourceId: source.id }],
    message: "과거 증여는 확인할 내용으로 남겨둘게요.", choices: [], selectionMode: "single",
  };
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const body = JSON.parse(await request.text()) as GoogleRequestBody;
    const instructions = body.systemInstruction?.parts.map(({ text }) => text).join("") ?? "";
    assert.match(instructions, /짧은 모름도 해당 분류와 unconfirmed의 사실 제안 대상/);
    assert.match(instructions, /이전 assistant의 문장이나 금액을 고객 사실로 인용하지 않습니다/);
    return googleResponse(JSON.stringify(expected));
  });
  const result = await createDiagnosisAgent({ apiKey: SYNTHETIC_KEY, model: MODEL, messages: history, facts: {} })
    .generate({ messages: history.map(({ role, parts }) => ({ role, content: parts[0].text })) });
  assert.deepEqual(result.output, expected);
  const restored = resolveDiagnosisFactSelections(result.output.facts, sources);
  assert.deepEqual(restored, [
    { key: "pastGifts", value: latestText, evidence: latestText },
    { key: "unconfirmed", value: latestText, evidence: latestText },
  ]);
  assert.equal(JSON.stringify(restored).includes("2억"), false);
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

test("the alternative free Flash-Lite uses minimal reasoning and the same strict output contract", async (t) => {
  const expected = { facts: [], message: "먼저 알려주신 상황에서 필요한 일을 정리하겠습니다.", choices: [], selectionMode: "single" };
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    calls += 1;
    const request = new Request(input, init);
    assert.equal(request.url, `https://generativelanguage.googleapis.com/v1beta/models/${ALTERNATE_GOOGLE_DIAGNOSIS_MODEL}:generateContent`);
    const body = JSON.parse(await request.text()) as GoogleRequestBody;
    assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, "minimal");
    return googleResponse(JSON.stringify(expected));
  });
  const result = await createDiagnosisAgent({ apiKey: SYNTHETIC_KEY, model: ALTERNATE_GOOGLE_DIAGNOSIS_MODEL, messages, facts: {} })
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
