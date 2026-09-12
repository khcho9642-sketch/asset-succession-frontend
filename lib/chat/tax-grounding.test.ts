import assert from "node:assert/strict";
import test from "node:test";
import { groundReply, groundingFailure, planTaxQuery, taxGroundingSchema, type TaxResearch } from "./tax-grounding";
import { normalizeTaxDocuments, researchTaxQuestion, taxMcpConnection } from "./tax-mcp";
import { createDiagnosisResponse } from "./fallback";
import { getAssistantReply } from "./choices";
import { applyChatPatches, createChatState, validateChatState } from "./intake";
import { extractAssertedChatPatches } from "./local";

const at = "2026-09-12T00:00:00.000Z";
const content = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] });
const law = content({ status: "OK", 조문: "제53조", 조문제목: "증여재산 공제", 조문시행일자: "20251001",
  원문: "제53조 증여재산 공제. 거주자 여부와 증여자의 관계, 이전 증여 내역을 확인합니다.",
  적용시행본: { 법령명: "상속세 및 증여세법", MST: "276123" } });
const ruling = content({ status: "OK", question: { items: [{ title: "합성 회신 시험", doc_type: "질의", doc_id: "010000000000404743", source_org: "국세청", date: "20190715", summary: "거주자 여부를 확인합니다.", content: "거주자와 가족관계를 확인합니다." }] } });
function research(): TaxResearch {
  const documents = normalizeTaxDocuments(law, "law_article_as_of", at).documents;
  return { status: "ready", sources: documents.map(document => ({ id: document.id, title: document.title, agency: document.agency, url: document.url, quote: document.quote, retrievedAt: document.retrievedAt, effectiveDate: document.effectiveDate, article: document.article })), documents, toolStatuses: [], notice: "거래일과 적용례는 별도 확인이 필요합니다." };
}
const questions = ["상속과 증여를 비교할 때 무엇을 봐야 해요?", "증여 공제를 알려주세요", "양도세 비과세 요건이 궁금해요", "가업승계 요건을 설명해 주세요"];
for (const question of questions) test(`tax query: ${question}`, () => assert.ok(planTaxQuery(question)));
test("pure inputs do not query; search never contains personal narrative or amounts", () => {
  for (const input of ["대출 5억", "자녀 2명", "대출은 3억으로 고쳐", "금액 모름", "대출 없음"]) assert.equal(planTaxQuery(input), null);
  const plan = planTaxQuery("가상고객 010-0000-0000 서울 가상로 99 아파트 20억, 대출 5억인데 증여 공제는 무엇인가요?")!;
  assert.equal(plan.keyword, "증여재산공제");
  assert.ok(!JSON.stringify(plan).includes("010-0000"));
});
test("date selection does not fabricate a transaction day or crash on invalid dates", () => {
  for (const text of ["2020년 증여 공제는?", "2020년 99월 99일 증여 공제는?"]) assert.equal(planTaxQuery(text, "", new Date(at))!.dateKnown, false);
  assert.equal(planTaxQuery("2020년 2월 3일 증여 공제는?")!.asOfDate, "20200203");
  assert.ok(planTaxQuery("그 공제는 왜 그래요?", "증여"));
});
test("deployment requires authenticated HTTPS, never a local stdio path", () => {
  assert.equal(taxMcpConnection({ TAX_MCP_URL: "https://example.test/mcp" }), null);
  assert.equal(taxMcpConnection({ TAX_MCP_URL: "http://example.test/mcp", TAX_MCP_BEARER_TOKEN: "synthetic" }), null);
  assert.equal(taxMcpConnection({ VERCEL: "1", TAX_MCP_STDIO_COMMAND: "python", TAX_MCP_STDIO_SCRIPT: "test.py" }), null);
  assert.equal(taxMcpConnection({ TAX_MCP_URL: "https://localhost/mcp", TAX_MCP_BEARER_TOKEN: "synthetic" }), null);
  assert.equal(taxMcpConnection({ TAX_MCP_URL: "https://example.test/mcp", TAX_MCP_BEARER_TOKEN: "synthetic" })?.type, "http");
});
test("sources are normalized from real tool schema, dates are not conflated", () => {
  const docs = normalizeTaxDocuments(ruling, "nts_ruling_search", at).documents;
  assert.equal(docs[0].url, "https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=010000000000404743");
  assert.equal(docs[0].effectiveDate, undefined);
  assert.equal(docs[0].publishedDate, "20190715");
  assert.equal(normalizeTaxDocuments(law, "law_article_as_of", at).documents[0].effectiveDate, "20251001");
  assert.equal(normalizeTaxDocuments(content({ status: "AUTH_ERROR" }), "law_article_as_of", at).documents.length, 0);
  assert.equal(normalizeTaxDocuments(content({ status: "OK", question: { items: [{ url: "https://evil.test", title: "fake" }] } }), "nts_ruling_search", at).documents.length, 0);
});
test("MCP lookup calls only allowlisted tools and always closes", async () => {
  const calls: string[] = [];
  let closed = false;
  const result = await researchTaxQuestion(planTaxQuery(questions[1])!, undefined, async () => ({
    listTools: async () => ({ tools: ["law_article_as_of", "nts_ruling_search", "execute_code"].map(name => ({ name, inputSchema: { type: "object" as const } })) }),
    callTool: async ({ name, arguments: args }) => { calls.push(name); assert.ok(!JSON.stringify(args).includes("개인")); return name === "law_article_as_of" ? law : ruling; },
    close: async () => { closed = true; },
  }));
  assert.deepEqual(calls, ["law_article_as_of", "nts_ruling_search"]);
  assert.equal(result.status, "ready"); assert.equal(result.sources.length, 2); assert.ok(closed);
});
test("lookup distinguishes no results, auth errors and connection failure", async () => {
  for (const [status, expected] of [["NOT_FOUND", "not_found"], ["AUTH_ERROR", "authentication_required"], ["UPSTREAM_ERROR", "invalid_response"]]) {
    const result = await researchTaxQuestion(planTaxQuery(questions[1])!, undefined, async () => ({
      listTools: async () => ({ tools: ["law_article_as_of", "nts_ruling_search"].map(name => ({ name, inputSchema: { type: "object" as const } })) }),
      callTool: async () => content({ status }), close: async () => undefined,
    }));
    assert.equal(result.status, expected); assert.equal(result.sources.length, 0);
  }
  assert.equal((await researchTaxQuestion(planTaxQuery(questions[1])!, undefined, async () => { throw Error("private"); })).status, "unavailable");
  assert.equal((await researchTaxQuestion(planTaxQuery(questions[1])!, undefined, async () => { throw { statusCode: 401, message: "private" }; })).status, "authentication_required");
});
test("invented citations, URLs and numeric results fail closed", () => {
  const data = research(), ids = data.sources.map(s => s.id);
  assert.ok(groundReply("거주자 여부를 먼저 확인해야 합니다.", ids, data));
  for (const message of ["예상 세액은 1억원입니다.", "공제는 99억원입니다.", "https://fake.test", "제999조를 따릅니다."]) assert.equal(groundReply(message, ids, data), null);
  assert.equal(groundReply("거주자 여부를 확인합니다", ["invented"], data), null);
  assert.equal(taxGroundingSchema.safeParse({ ...data, documents: undefined, toolStatuses: undefined, sources: [{ ...data.sources[0], url: "javascript:alert(1)" }] }).success, false);
});
test("mixed assertions survive reload and replay, tax question and hypothetical facts do not enter intake", () => {
  const text = "아파트 20억, 대출 5억인데 증여와 상속 중 무엇을 비교해야 해요?";
  const state = createChatState(); state.messages = [{ id: "mixed", role: "user", text, created_at: at }];
  const patches = extractAssertedChatPatches(text, state);
  const next = applyChatPatches(state, patches, "mixed");
  assert.equal(next.facts.realEstate?.value, "아파트 20억"); assert.equal(next.facts.debt?.value, "대출 5억");
  assert.equal(next.facts.notes, undefined);
  const restored = validateChatState(JSON.parse(JSON.stringify(next)))!;
  assert.deepEqual(applyChatPatches(restored, patches, "mixed"), restored);
  assert.deepEqual(extractAssertedChatPatches("만약 아파트 20억, 대출 5억이라면 증여세는?", state), []);
});
test("server failure returns an honest complete reply and facts without any AI call", async t => {
  t.mock.method(globalThis, "fetch", () => { throw Error("No external call allowed"); });
  const response = createDiagnosisResponse({ apiKey: "synthetic", model: "unused", facts: {}, messages: [{ id: "mixed", role: "user", parts: [{ type: "text", text: "아파트 20억, 대출 5억인데 증여 공제는 무엇인가요?" }] }], lookup: async () => groundingFailure("unavailable") });
  const stream = await response.text();
  const chunks = stream.split("\n").filter(line => line.startsWith("data: {")).map(line => JSON.parse(line.slice(6)));
  assert.equal(chunks.find(chunk => chunk.type === "tool-output-available").output.proposals.length, 2);
  const reply = getAssistantReply(chunks.find(chunk => chunk.type === "text-delta").delta)!;
  assert.equal(reply.grounding?.status, "unavailable"); assert.equal(reply.grounding.sources.length, 0);
});
test("actual app orchestrator retrieves before Google and displays only server-owned sources", async t => {
  const events: string[] = [], data = research();
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    events.push("google"); const request = new Request(input, init); const body = await request.text();
    assert.ok(body.includes(data.documents[0].body));
    return Response.json({ candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify({ facts: [{ key: "notes", value: "증여 공제는 무엇인가요?", evidence: "증여 공제는 무엇인가요?" }], message: "거주자 여부와 이전 증여 내역을 먼저 확인해야 합니다.", choices: [], selectionMode: "single", citationIds: [data.sources[0].id] }) }] }, finishReason: "STOP" }] });
  });
  const result = createDiagnosisResponse({ apiKey: "synthetic", model: "gemini-3.8-flash", facts: {}, messages: [{ id: "tax", role: "user", parts: [{ type: "text", text: "증여 공제는 무엇인가요?" }] }], lookup: async () => { events.push("mcp"); return data; } });
  const stream = await result.text();
  const chunks = stream.split("\n").filter(line => line.startsWith("data: {")).map(line => JSON.parse(line.slice(6)));
  assert.deepEqual(events, ["mcp", "google"]);
  const reply = getAssistantReply(chunks.find(chunk => chunk.type === "text-delta").delta)!;
  assert.equal(reply.grounding?.status, "ready"); assert.deepEqual(reply.grounding.sources, data.sources);
  assert.deepEqual(chunks.find(chunk => chunk.type === "tool-output-available").output.proposals, []);
});

test("quota exhaustion stops at existing two-model cap, does not repeat MCP, preserves mixed facts", async t => {
  let modelCalls = 0, mcpCalls = 0;
  t.mock.method(globalThis, "fetch", async () => { modelCalls++; return Response.json({ error: { code: 429, message: "private detail" } }, { status: 429 }); });
  const result = createDiagnosisResponse({ apiKey: "synthetic", model: "gemini-3.8-flash", facts: {}, messages: [{ id: "quota", role: "user", parts: [{ type: "text", text: "아파트 25억원, 대출 5억원인데 증여 공제는?" }] }], lookup: async () => { mcpCalls++; return research(); } });
  const stream = await result.text();
  assert.equal(modelCalls, 2); assert.equal(mcpCalls, 1);
  assert.ok(stream.includes("AI_RATE_LIMITED")); assert.ok(!stream.includes("private detail"));
  assert.ok(stream.includes("대출 5억원"));
});
test("a calculator request makes neither MCP nor model calls", async t => {
  t.mock.method(globalThis, "fetch", () => { throw Error("No model call permitted"); });
  const result = createDiagnosisResponse({ apiKey: "synthetic", model: "unused", facts: {}, messages: [{ id: "calc", role: "user", parts: [{ type: "text", text: "내 세금은 얼마인가요?" }] }], lookup: async () => { throw Error("No MCP call permitted"); } });
  assert.ok((await result.text()).includes("기존 계산기"));
});
test("multiple explicit properties in a mixed question are preserved together", () => {
  const patches = extractAssertedChatPatches("아파트 20억, 상가 10억인데 증여 공제는?", createChatState());
  assert.equal(patches.find(patch => patch.key === "realEstate")?.value, "아파트 20억, 상가 10억");
});
