import assert from "node:assert/strict";
import test from "node:test";
import { BRIEF_REPORT_REQUEST, buildChatBriefReport, getBriefReportContextFeedback, getBriefReportJudgmentFeedback } from "./brief-report";
import { applyChatPatches, createChatState, type ChatState } from "./intake";

const now = "2026-11-16T12:00:00.000Z";

test("a missing purpose and an invented child recipient cannot become the customer's report", () => {
  const invented = "현재 판단\n보유하신 주식 증여는 자녀 성년 여부를 확인해야 합니다.\n우선할 일\n증여 대상인 자녀의 성년 여부를 확인하세요.\n확인할 사항\n증여 시점을 확인합니다.";
  assert(getBriefReportContextFeedback(invented, "주식 10억"));
  assert(getBriefReportContextFeedback("현재 판단\n주식 증여 신고 준비가 우선입니다.", "주식 팔억"), "A Korean amount cannot establish a sale or gift purpose");
  assert(getBriefReportContextFeedback(invented, "증여하려고 합니다. 자녀가 없습니다."));
  assert.equal(getBriefReportContextFeedback(invented, "아들에게 주식을 증여하려고 합니다."), null);
  const conservative = "현재 판단\n주식 금액만 확인되어 검토 목적과 재산 소유자 확인이 우선입니다.\n우선할 일\n상속·증여·양도 중 검토하려는 목적을 정리합니다.\n확인할 사항\n재산 소유자와 받는 분은 확인 전입니다.";
  assert.equal(getBriefReportContextFeedback(conservative, "주식 10억"), null);
  let state = createChatState();
  state.messages.push({ id: "stock", role: "user", text: "주식 10억", created_at: now });
  state = applyChatPatches(state, [{ key: "financialAssets", value: "주식 10억", evidence: "주식 10억" }], "stock");
  state.messages.push({ id: "ai-question", role: "assistant", text: JSON.stringify({ message: "자녀에게 증여하시려는 건가요?", choices: ["네", "아니요"], selectionMode: "single" }), created_at: now });
  state.messages.push({ id: "report-request", role: "user", text: BRIEF_REPORT_REQUEST, created_at: now });
  state.messages.push({ id: "report", role: "assistant", text: JSON.stringify({ message: invented, choices: [], selectionMode: "single" }), created_at: now });
  assert.equal(buildChatBriefReport(state, { report: "ai" }, now), null, "An assistant question cannot supply the customer's missing purpose or child");
  state.messages.at(-1)!.text = JSON.stringify({ message: conservative, choices: [], selectionMode: "single" });
  assert(buildChatBriefReport(state, { report: "ai" }, now));
});
const review = "현재 판단\n유언과 상속인 관계를 먼저 확인해야 합니다.\n\n우선할 일\n주식 잔고 내역과 유언 관련 자료를 준비합니다.\n\n확인할 사항\n유언 여부와 주식 평가액은 확인 전입니다.";

test("inline and combined Markdown report headings split without losing numbered body text", () => {
  for (const message of [
    "현재 판단: 유언 확인이 우선입니다. 우선할 일: 자료를 준비합니다. 확인할 사항: 유언은 미확인입니다.",
    "### 1. **현재판단**\n유언 확인이 우선입니다.\n### 2. **우선할일**\n1. 자료를 준비합니다.\n### 3. **확인할사항**\n유언은 미확인입니다.",
    "**현재 판단:** 유언 확인이 우선입니다. **우선할 일:** 자료를 준비합니다. **확인할 사항:** 유언은 미확인입니다.",
  ]) {
    const state = fixture();
    state.messages.at(-1)!.text = JSON.stringify({ message, choices: [], selectionMode: "single" });
    const report = buildChatBriefReport(state, { answer: "ai" }, now)!;
    assert(report);
    assert.deepEqual(report.sections.map(section => section.title), ["현재 판단", "우선할 일", "확인할 사항"]);
    if (message.includes("1. 자료")) assert.equal(report.sections[1].body, "1. 자료를 준비합니다.");
  }
  const misleading = "현재 판단: 주식 증여 계획을 세워야 합니다. 우선할 일: 증여를 고려하는 자녀의 나이를 확인하세요. 확인할 사항: 과거 증여 내역과 보유 중인 다른 자산이 어느 정도인지 확인합니다.";
  assert(getBriefReportContextFeedback(misleading, "주식 10억"), "A later '보유 중인' phrase cannot establish the missing purpose");
});

function fixture(): ChatState {
  const text = "고인 명의 주식 10억이고 유언 여부는 모름";
  let state: ChatState = { ...createChatState(), messages: [{ id: "facts", role: "user", text, created_at: now }] };
  state = applyChatPatches(state, [{ key: "financialAssets", value: "주식 10억", evidence: text }, { key: "unconfirmed", value: "유언 여부는 모름", evidence: text }], "facts");
  return { ...state, messages: [...state.messages, { id: "request", role: "user", text: BRIEF_REPORT_REQUEST, created_at: now }, { id: "answer", role: "assistant", text: JSON.stringify({ message: review, choices: [], selectionMode: "single" }), created_at: now }] };
}

test("brief report preserves original facts and uncertainty without requiring tax conditions", () => {
  const report = buildChatBriefReport(fixture(), { answer: "ai" }, now)!;
  assert(report);
  assert.deepEqual(report.sections.map(section => section.title), ["현재 판단", "우선할 일", "확인할 사항"]);
  assert.equal(report.facts.find(fact => fact.key === "financialAssets")?.value, "주식 10억");
  assert(report.pending.includes("유언 여부는 모름"));
  assert(report.pending.includes("재산 소유자 확인 필요"));
  assert.equal(report.sections[1].body, "주식 잔고 내역과 유언 관련 자료를 준비합니다.");
});

test("an added customer correction invalidates an earlier AI report until a new conclusion", () => {
  const state = fixture();
  state.messages.push({ id: "correction", role: "user", text: "주식은 8억으로 정정", created_at: now });
  const next = applyChatPatches(state, [{ key: "financialAssets", value: "주식은 8억으로 정정", evidence: "주식은 8억으로 정정" }], "correction");
  assert.equal(buildChatBriefReport(next, { answer: "ai" }, now), null);
});

test("local replies, incomplete outputs and a pending intake question are not AI reports", () => {
  assert.equal(buildChatBriefReport(fixture(), { answer: "local" }, now), null);
  assert.equal(buildChatBriefReport(fixture(), {}, now), null);
  const incomplete = fixture();
  incomplete.messages.at(-1)!.text = '{"message":"partial';
  assert.equal(buildChatBriefReport(incomplete, { answer: "ai" }, now), null);
  const question = fixture();
  question.messages.at(-1)!.text = JSON.stringify({ message: "유언이 있나요?", choices: ["있어요", "모르겠어요"], selectionMode: "single" });
  assert.equal(buildChatBriefReport(question, { answer: "ai" }, now), null);
});

test("unverified facts and invalid timestamps cannot enter the brief report", () => {
  const forged = fixture();
  forged.facts.financialAssets!.value = "주식 900억";
  assert.equal(buildChatBriefReport(forged, { answer: "ai" }, now), null);
  assert.equal(buildChatBriefReport(fixture(), { answer: "ai" }, "invalid"), null);
});

test("ordinary explanation is not relabelled as a completed consultation report", () => {
  const state = fixture();
  state.messages.at(-2)!.text = "배우자는 왜 필요한가요? 이유만 설명해 주세요.";
  assert.equal(buildChatBriefReport(state, { answer: "ai" }, now), null);
});

test("natural conclusions preserve complete AI text when no section headings were generated", () => {
  const state = fixture();
  state.messages.at(-2)!.text = "그래서 결론은요?";
  const text = "유언을 확인하고 주식 내역을 준비하세요. 지금은 배제 가능성을 확정할 수 없습니다.";
  state.messages.at(-1)!.text = JSON.stringify({ message: text, choices: [], selectionMode: "single" });
  const report = buildChatBriefReport(state, { answer: "ai" }, now)!;
  assert.equal(report.sections.length, 1);
  assert.equal(report.sections[0].body, text);
});

test("a judgment heading containing only facts and customer wishes is not a completed report", () => {
  const recap = "현재 판단\n상속이 발생했고 주식이 있으며 자녀에게 주지 않는 방향을 고민하고 계십니다.\n\n우선할 일\n유언을 확인하세요.\n\n확인할 사항\n유언은 미확인입니다.";
  assert(getBriefReportJudgmentFeedback(recap));
  assert.equal(getBriefReportJudgmentFeedback(review), null);
  const state = fixture();
  state.messages.at(-1)!.text = JSON.stringify({ message: recap, choices: [], selectionMode: "single" });
  assert.equal(buildChatBriefReport(state, { answer: "ai" }, now), null);
});
