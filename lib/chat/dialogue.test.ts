import assert from "node:assert/strict";
import test from "node:test";
import type { DiagnosisReply } from "./choices";
import { buildDialogueUnknownContext, getDialogueQualityIssue, type DialogueQualitySubject } from "./dialogue";
import { applyChatPatches, createChatState, type ChatState } from "./intake";

const reply = (message: string, choices: string[] = []): DiagnosisReply => ({ message, choices });
function unknownFacts(...texts: string[]): ChatState["facts"] {
  let state = createChatState();
  texts.forEach((text, index) => {
    const id = `unknown-${index}`;
    state = applyChatPatches({ ...state, messages: [...state.messages, { id, role: "user", text, created_at: "2026-09-09T00:00:00Z" }] }, [{ key: "unconfirmed", value: text, evidence: text }], id);
  });
  return state.facts;
}

test("explicit unknown deposit and loan clauses reject only the same requested item", () => {
  for (const text of ["보증금은 모르겠어요", "전세보증금 금액은 몰라요", "임대보증금은 미확인이에요"]) {
    assert.deepEqual(getDialogueQualityIssue(text, {}, reply("보증금 금액은 얼마인가요?", ["금액을 알아요", "모르겠어요"]))?.subjects, ["deposit"]);
    assert.equal(getDialogueQualityIssue(text, {}, reply("대출은 얼마인가요?", ["금액을 알아요", "모르겠어요"])), null);
  }
  assert.deepEqual(getDialogueQualityIssue("신용대출 금액 미확인", {}, reply("대출이 있나요?", ["있어요", "없어요"]))?.subjects, ["loan"]);
  assert.equal(getDialogueQualityIssue("대출은 5억이고 보증금은 모르겠어요", {}, reply("대출 금액을 알고 계신가요?", ["알아요", "모르겠어요"])), null);
});

test("adjacent unknown wording does not make another explicitly known subject unknown", () => {
  const text = "보증금 2억이고 대출은 모르겠어요";
  assert.equal(getDialogueQualityIssue(text, {}, reply("보증금 금액을 알려주세요.", ["금액 알아요", "모르겠어요"])), null);
  assert.deepEqual(getDialogueQualityIssue(text, {}, reply("대출 금액은 얼마인가요?", ["알아요", "모르겠어요"]))?.subjects, ["loan"]);
  assert.equal(getDialogueQualityIssue("보증금 2억이고 다른 것은 잘 모르겠어요", {}, reply("보증금은 얼마인가요?")), null);
  assert.equal(getDialogueQualityIssue("아마 보증금 2억인 것 같아요", {}, reply("보증금은 얼마인가요?")), null);
  for (const text of ["보증금을 모르면 어떻게 하나요?", "보증금은 모르는 게 아니라 없어요", "보증금은 모르는 게 아니라 3억이에요", "보증금을 모른다면 나중에 확인하나요?"]) assert.equal(getDialogueQualityIssue(text, {}, reply("보증금은 얼마인가요?")), null, text);
});

test("persisted unknown source quotes remain effective without repeating the latest answer", () => {
  const facts = unknownFacts("보증금 모름", "진행 시기는 아직 정하지 않았어요");
  assert.deepEqual(getDialogueQualityIssue("대출은 3억으로 정정할게요", facts, reply("보증금 금액은 알고 계신가요?", ["알아요", "모르겠어요"]))?.subjects, ["deposit"]);
  assert.deepEqual(getDialogueQualityIssue("추가 내용은 없어요", facts, reply("진행 시기는 언제인가요?", ["올해", "내년"]))?.subjects, ["timing"]);
  assert.equal(getDialogueQualityIssue("보증금은 2억으로 확인했어요", facts, reply("보증금은 얼마인가요?")), null, "resolved uncertainty must not be revived");
  const scoped: ChatState["facts"] = { unconfirmed: { value: "딸 나이 모름", evidence: "딸 나이 모름, 보증금 모름", messageId: "old" } };
  assert.equal(getDialogueQualityIssue("추가 내용 없어요", scoped, reply("보증금은 얼마인가요?")), null, "evidence outside the selected unknown must not add other subjects");
  const valuation: ChatState["facts"] = { unconfirmed: { value: "평가액은 모름", evidence: "회사 주식이 있어요, 평가액은 모름", messageId: "old" } };
  assert.deepEqual(getDialogueQualityIssue("추가 내용 없어요", valuation, reply("주식 평가액은 얼마인가요?"))?.subjects, ["stock_value"]);
});

test("a short unknown answer uses only an unambiguous previous question's subject", () => {
  const repeated = reply("보증금 금액 확인이 필요해요.", ["금액을 알아요", "없어요", "모르겠어요"]);
  const issue = getDialogueQualityIssue("잘 모르겠어요", {}, repeated, "보증금은 얼마인가요?");
  assert.deepEqual(issue?.subjects, ["deposit"]);
  assert.equal(getDialogueQualityIssue("모름", {}, repeated), null);
  assert.equal(getDialogueQualityIssue("잘 모르겠어요", {}, repeated, "보증금과 대출 금액은 얼마인가요?"), null);
  assert.equal(getDialogueQualityIssue("잘 모르겠어요", {}, repeated, "보증금은 미확인으로 남겼어요. 배우자가 계세요?"), null);
  const metadata = getDialogueQualityIssue("몰라요", {}, repeated, "보증금은 999억인가요?");
  assert.equal(JSON.stringify(metadata).includes("999"), false);
});

test("a confirmation choice inherits the natural past-gift target instead of a contextual loan", () => {
  const previous = "상속과 증여를 비교하실 때 대출과 함께 아버지가 가족에게 이미 주신 재산이 있는지도 확인이 필요해요.";
  const repeated = reply("과거에 가족에게 이미 주신 재산이 따로 있으신가요?", ["있어요", "없어요", "확인이 필요해요"]);
  assert.deepEqual(getDialogueQualityIssue("확인이 필요해요", {}, repeated, previous)?.subjects, ["past_gifts"]);
  assert.deepEqual(getDialogueQualityIssue("확인이 필요해요", {}, repeated, "상속과 증여를 비교하실 수 있도록 아버지의 과거 증여 내역이 있는지 확인해 주세요.")?.subjects, ["past_gifts"]);
  assert.deepEqual(getDialogueQualityIssue("확인이 필요해요", {}, reply("과거 증여 내역은 확인이 필요하군요. 아버지가 가족에게 이미 주신 재산이 또 있으신가요?", ["있어요", "없어요", "확인이 필요해요"]), "상속과 증여를 비교하실 수 있도록 아버지의 과거 증여 내역이 있는지 확인해 주세요.")?.subjects, ["past_gifts"]);
  assert.equal(getDialogueQualityIssue("확인이 필요해요", {}, reply("대출은 얼마인가요?"), previous), null);
  assert.equal(getDialogueQualityIssue("확인이 필요해요", {}, repeated, "대출과 보증금 내역 확인이 필요해요."), null);
  const stored: ChatState["facts"] = { pastGifts: { value: "확인이 필요해요", evidence: "확인이 필요해요", messageId: "past" } };
  assert.deepEqual(getDialogueQualityIssue("생활비가 걱정돼요", stored, repeated)?.subjects, ["past_gifts"]);
  assert.equal(getDialogueQualityIssue("생활비가 걱정돼요", unknownFacts("확인이 필요해요"), repeated), null, "an unlabelled short quote has no invented target");
});

test("history preserves only canonical unknown context and explicit customer corrections resolve it", () => {
  const previous = "가족에게 이미 주신 재산이 있는지도 확인이 필요해요. 예시 금액은 2억이에요.";
  const messages: Array<{ role: "user" | "assistant"; text: string }> = [
    { role: "assistant", text: previous }, { role: "user", text: "확인이 필요해요" },
    { role: "assistant", text: "알고 계신 다른 내용을 말씀해 주세요." }, { role: "user", text: "생활비가 걱정되고 대출은 3억이에요" },
  ];
  const context = buildDialogueUnknownContext(messages);
  assert.ok(context.unknowns.past_gifts?.length);
  assert.equal(JSON.stringify(context).includes("2억"), false);
  assert.equal(JSON.stringify(context).includes("3억"), false);
  const repeated = reply("과거에 가족에게 이미 주신 재산이 따로 있으신가요?", ["있어요", "없어요"]);
  assert.deepEqual(getDialogueQualityIssue("생활비가 걱정돼요", {}, repeated, undefined, context)?.subjects, ["past_gifts"]);
  messages.push({ role: "user", text: "과거 증여는 없다고 확인했어요." });
  const resolved = buildDialogueUnknownContext(messages);
  assert.equal(resolved.unknowns.past_gifts, undefined);
  assert.ok(resolved.resolved.includes("past_gifts"));
  assert.equal(getDialogueQualityIssue("추가 내용은 없어요", unknownFacts("과거 증여 모름"), repeated, undefined, resolved), null);
  assert.deepEqual(buildDialogueUnknownContext([{ role: "assistant", text: "과거 증여는 2억입니다." }]), { unknowns: {}, resolved: [] });
});

test("acquisition date, timing, child age and earlier gifts have separate closed subjects", () => {
  const cases: Array<[string, string, DialogueQualitySubject]> = [
    ["취득 날짜는 기억이 안 나요", "취득일은 언제인가요?", "acquisition_date"],
    ["진행 시기는 아직 정하지 않았어요", "진행 시기는 언제인가요?", "timing"],
    ["자녀들이 성년인지 잘 모르겠어요", "자녀가 성인인가요?", "child_age"],
    ["과거 증여는 기억이 안 나요", "과거 증여한 금액은 얼마인가요?", "past_gifts"],
    ["과거 증여는 기억나지 않아요. 왜 과거 증여를 확인해야 하나요?", "과거 증여한 금액은 얼마인가요?", "past_gifts"],
    ["최근 10년 내에 증여는 모르겠어요", "과거 증여한 적이 있나요?", "past_gifts"],
  ];
  for (const [text, message, subject] of cases) assert.deepEqual(getDialogueQualityIssue(text, {}, reply(message, ["알아요", "모르겠어요"]))?.subjects, [subject], text);
  assert.equal(getDialogueQualityIssue("취득일 모름", {}, reply("취득 금액은 얼마인가요?")), null);
  assert.equal(getDialogueQualityIssue("자녀 성년 여부 모름", {}, reply("자녀는 몇 명인가요?", ["1명", "2명"])), null);
  assert.equal(getDialogueQualityIssue("자녀 수 모름", {}, reply("자녀가 성년인가요?")), null);
});

test("unknown stock valuation never blocks a different property's value", () => {
  const text = "회사 주식을 보유하고 있어요. 평가액은 아직 몰라요.";
  assert.deepEqual(getDialogueQualityIssue(text, {}, reply("주식 평가액은 얼마인가요?", ["알아요", "모르겠어요"]))?.subjects, ["stock_value"]);
  assert.equal(getDialogueQualityIssue(text, {}, reply("아파트 평가액은 얼마인가요?", ["알아요", "모르겠어요"])), null);
  assert.equal(getDialogueQualityIssue("주식은 2억이고 아파트 평가액은 몰라요", {}, reply("주식 평가액은 얼마인가요?")), null);
  assert.equal(getDialogueQualityIssue("평가액은 모르겠어요", {}, reply("주식 평가액은 얼마인가요?")), null, "generic valuation must not be assigned to stocks");
});

test("an acknowledgement followed by a different question remains allowed", () => {
  const latest = "보증금은 모르겠어요";
  for (const message of ["보증금은 미확인으로 남겼어요. 배우자가 계세요?", "보증금은 모르신다고 하셨는데 대출 금액은 아시나요?", "보증금은 확인이 필요해요. 대출 금액을 알고 계신가요?"]) {
    assert.equal(getDialogueQualityIssue(latest, {}, reply(message, ["알아요", "모르겠어요", "없어요"])), null, message);
  }
});

test("explanation, later confirmation guidance and closing summaries remain allowed", () => {
  const latest = "보증금은 모르겠어요";
  for (const message of ["보증금은 왜 필요한가요?", "왜 보증금을 확인해야 하나요?", "보증금 확인서 발급 방법을 설명할게요.", "보증금은 나중에 확인하셔도 괜찮아요.", "보증금 금액은 확인하신 후 알려주세요.", "모르는 보증금은 확인할 내용으로 남기고 여기서 정리할게요."]) assert.equal(getDialogueQualityIssue(latest, {}, reply(message)), null, message);
  assert.equal(getDialogueQualityIssue(latest, {}, reply("무엇부터 보고 싶으세요?", ["보증금 설명", "증여와 상속 비교", "전체 정리"])), null);
});

test("two to four intake choices expose an implicit repeated question without a question mark", () => {
  const latest = "보증금은 모르겠어요";
  for (const choices of [["보증금 금액 알아요", "보증금 없어요"], ["보증금 금액 알아요", "보증금 없어요", "나중 확인"], ["보증금 금액 알아요", "보증금 없어요", "일부만 알아요", "나중 확인"]]) assert.deepEqual(getDialogueQualityIssue(latest, {}, reply("보증금 금액 확인이 필요해요.", choices))?.subjects, ["deposit"]);
  assert.deepEqual(getDialogueQualityIssue(latest, {}, reply("보증금은 모름으로 남겨둘게요.", ["금액을 알아요", "없어요", "모르겠어요"]))?.subjects, ["deposit"]);
  for (const message of ["보증금은 있으신가요", "보증금은 없으세요"]) assert.deepEqual(getDialogueQualityIssue(latest, {}, reply(message, ["있어요", "없어요"]))?.subjects, ["deposit"]);
  assert.equal(getDialogueQualityIssue(latest, {}, reply("보증금은 모름으로 남겨둘게요.")), null);
});

test("a different unknown aspect does not block an unrelated amount question", () => {
  assert.equal(getDialogueQualityIssue("대출 만기 날짜는 모르겠어요", {}, reply("대출 금액은 얼마인가요?")), null);
  assert.deepEqual(getDialogueQualityIssue("대출 만기 날짜는 모르겠어요", {}, reply("대출 만기는 언제인가요?"))?.subjects, ["loan"]);
  assert.equal(getDialogueQualityIssue("과거 증여 날짜는 몰라요", {}, reply("과거 증여 금액은 얼마인가요?")), null);
});

test("issue metadata and feedback contain only closed subjects and no customer text", () => {
  const secret = "CUSTOMER_SECRET_5억";
  const issue = getDialogueQualityIssue(`보증금은 모르겠어요 ${secret}, 대출도 모름`, {}, reply("보증금과 대출 금액을 알려주세요.", ["보증금 금액 알아요", "대출 금액 알아요"]));
  assert.deepEqual(issue?.subjects, ["deposit", "loan"]);
  assert.deepEqual(Object.keys(issue ?? {}).sort(), ["feedback", "kind", "subjects"]);
  assert.ok(issue?.feedback.startsWith("보증금, 대출:"));
  assert.equal(JSON.stringify(issue).includes(secret), false);
  assert.equal(JSON.stringify(issue).includes("5억"), false);
  assert.match(issue?.feedback ?? "", /정리·종료 요청을 우선/);
  assert.match(issue?.feedback ?? "", /sourceID, facts, 출력 형식/);
});
