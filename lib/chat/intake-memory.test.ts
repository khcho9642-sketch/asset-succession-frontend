import assert from "node:assert/strict";
import test from "node:test";
import { applyChatPatches, createChatState, getChatFactSources, validateChatState, type ChatFieldKey, type ChatPatch, type ChatState } from "./intake";
import { extractLocalChatPatches, getLocalChatReply } from "./local";
import { buildConfirmedAssessmentSnapshot } from "./report";

const DATE = "2026-09-09T00:00:00.000Z";

function add(state: ChatState, text: string, patches = extractLocalChatPatches(text, state)): ChatState {
  const id = `user-${state.messages.length}`;
  return applyChatPatches({ ...state, messages: [...state.messages, { id, role: "user", text, created_at: DATE }] }, patches, id);
}

function put(state: ChatState, key: ChatFieldKey, text: string): ChatState {
  return add(state, text, [{ key, value: text, evidence: text }]);
}

function ready(): ChatState {
  return add(createChatState(), "본인 재산, 아파트 20억");
}

function report(state: ChatState) {
  return buildConfirmedAssessmentSnapshot(state, { confirmed: true, confirmedAt: DATE, assessmentId: "MEMORY-TEST" });
}

test("a loan correction preserves a separately unknown deposit and every quotation", () => {
  let state = add(ready(), "대출 5억/보증금 모름");
  state = add(state, "대출 3억으로 정정");
  assert.match(state.facts.debt?.value ?? "", /대출 3억/);
  assert.doesNotMatch(state.facts.debt?.value ?? "", /5억/);
  assert.match(state.facts.debt?.value ?? "", /보증금 모름/);
  assert.equal(state.facts.unconfirmed?.value, "보증금 모름");
  assert.ok(validateChatState(JSON.parse(JSON.stringify(state))));
  const result = report(state);
  assert.equal(result.answers.debt.debtAmounts, undefined);
  assert.equal(result.answers.debt.facts?.["채무 여부"], "확인 필요");
  assert.match(result.answers.review.facts?.["확인할 내용"] ?? "", /보증금 모름/);
  const sources = getChatFactSources(state.facts.debt);
  assert.equal(sources.find(source => source.value === "보증금 모름")?.messageId, "user-1");
});

test("a later debt item, family member, past gift and note retain the earlier originals", () => {
  let state = put(ready(), "debt", "A은행 대출 3억");
  state = put(state, "debt", "B은행 신용대출 1억도 있어요");
  state = put(state, "recipient", "첫째 아들");
  state = put(state, "recipient", "둘째 딸도 함께 검토해요");
  state = put(state, "children", "자녀 2명");
  state = put(state, "children", "다른 자녀는 미성년이에요");
  state = put(state, "pastGifts", "첫째 아들에게 1억을 증여했어요");
  state = put(state, "pastGifts", "둘째 딸에게도 5천만원을 증여했어요");
  state = put(state, "notes", "생활비를 남기고 싶어요");
  state = put(state, "notes", "가족과 함께 확인할 예정이에요");
  for (const key of ["debt", "recipient", "children", "pastGifts", "notes"] as const) assert.equal(state.facts[key]?.sources?.length, 2, key);
  const result = report(state);
  assert.equal(result.answers.family.facts?.["자녀 수"], undefined);
  assert.match(result.answers.family.facts?.["자녀 수 원문"] ?? "", /자녀 2명[\s\S]*다른 자녀/);
  assert.equal(result.answers.debt.debtAmounts, undefined);
  assert.ok(validateChatState(state));
});

test("only an identified part is corrected, while ambiguous correction remains pending", () => {
  let state = put(ready(), "debt", "A은행 대출 5억, B은행 대출 2억, 보증금 모름");
  state = put(state, "debt", "A은행 대출 3억으로 정정");
  assert.doesNotMatch(state.facts.debt?.value ?? "", /5억/);
  assert.match(state.facts.debt?.value ?? "", /B은행 대출 2억/);
  assert.match(state.facts.debt?.value ?? "", /보증금 모름/);
  state = put(state, "debt", "대출 1억으로 정정");
  assert.match(state.facts.debt?.value ?? "", /A은행 대출 3억[\s\S]*B은행 대출 2억[\s\S]*대출 1억/);
  assert.match(state.facts.unconfirmed?.value ?? "", /보증금 모름[\s\S]*대출 1억/);
  assert.equal(report(state).answers.debt.debtAmounts, undefined);
  state = put(state, "debt", "정정: 채무 — 대출 4억");
  assert.equal(state.facts.debt?.value, "정정: 채무 — 대출 4억");
  assert.equal(state.facts.debt?.sources, undefined);
  assert.equal(state.facts.unconfirmed, undefined);
});

test("a known answer resolves only the corresponding unknown item, never unknown to zero", () => {
  let state = put(ready(), "debt", "대출 5억, 보증금 모름");
  state = put(state, "notes", "딸 나이 모름");
  state = put(state, "debt", "보증금 2억으로 확인했어요");
  assert.match(state.facts.debt?.value ?? "", /대출 5억[\s\S]*보증금 2억/);
  assert.doesNotMatch(state.facts.debt?.value ?? "", /보증금 모름/);
  assert.equal(state.facts.unconfirmed?.value, "딸 나이 모름");
  assert.equal(report(state).answers.debt.debtAmounts, undefined);
  state = put(state, "recipient", "딸");
  assert.equal(state.facts.unconfirmed?.value, "딸 나이 모름");
  assert.ok(validateChatState(state));
});

test("a precise property correction retains the other property without adding the old amount", () => {
  let state = put(ready(), "realEstate", "정정: 부동산 — 아파트 25억, 상가 15억");
  state = put(state, "realEstate", "아파트 20억으로 정정");
  assert.doesNotMatch(state.facts.realEstate?.value ?? "", /25억/);
  assert.match(state.facts.realEstate?.value ?? "", /상가 15억/);
  assert.equal(report(state).answers.assets.assetAmounts?.["부동산"], "35");
  assert.ok(validateChatState(state));
});

test("an ambiguous replacement cannot become an asset sum", () => {
  let state = put(ready(), "realEstate", "아파트 25억");
  state = put(state, "realEstate", "그건 건물 20억으로 정정");
  assert.match(state.facts.realEstate?.value ?? "", /25억[\s\S]*20억/);
  assert.match(state.facts.unconfirmed?.value ?? "", /건물 20억/);
  assert.equal(report(state).answers.assets.assetAmountStatus?.["부동산"], "needs_confirmation");
});

test("multiple unknown items and unrelated unknowns are not cleared by one answer", () => {
  let state = put(ready(), "debt", "보증금 모름, 보증금 금액 미확인");
  state = put(state, "debt", "보증금 2억");
  assert.match(state.facts.unconfirmed?.value ?? "", /보증금 모름[\s\S]*보증금 금액 미확인/);
  const text = "대출 모름, 딸 나이 모름";
  state = add(ready(), text, [{ key: "debt", value: "대출 모름", evidence: text }, { key: "notes", value: "딸 나이 모름", evidence: text }]);
  state = put(state, "debt", "정정: 채무 — 채무 없음");
  assert.equal(state.facts.unconfirmed?.value, "딸 나이 모름");
  state = put(ready(), "debt", "대출 만기 모름");
  state = put(state, "debt", "대출 3억");
  assert.match(state.facts.unconfirmed?.value ?? "", /대출 만기 모름/);
});

test("a single known number cannot settle conflicting absence or multiple debt statements", () => {
  let state = put(ready(), "debt", "대출 5억");
  state = put(state, "debt", "채무 없음");
  assert.equal(report(state).answers.debt.debtAmounts, undefined);
  state = put(state, "realEstate", "부동산 없음");
  assert.equal(report(state).answers.assets.assetAmountStatus?.["부동산"], "needs_confirmation");
});

test("a broad asset category is not added to a later potentially overlapping item", () => {
  let state = put(ready(), "realEstate", "정정: 부동산 — 부동산 25억");
  state = put(state, "realEstate", "아파트 20억");
  assert.equal(report(state).answers.assets.assetAmountStatus?.["부동산"], "needs_confirmation");
});

test("version-one saved facts remain valid and cannot acquire forged or assistant evidence", () => {
  const old: ChatState = { version: 1, messages: [{ id: "old", role: "user", text: "대출 5억", created_at: DATE }], facts: { debt: { value: "대출 5억", evidence: "대출 5억", messageId: "old" } } };
  const restored = validateChatState(JSON.parse(JSON.stringify(old)));
  assert.ok(restored);
  const state = put(restored, "debt", "보증금 모름");
  assert.match(state.facts.debt?.value ?? "", /대출 5억[\s\S]*보증금 모름/);
  const forged = JSON.parse(JSON.stringify(state)) as ChatState;
  forged.facts.debt!.sources![0].value = "대출 9억";
  assert.equal(validateChatState(forged), null);
  const injected: ChatPatch[] = [{ key: "unconfirmed", value: "채무 없음", evidence: "채무 없음" }];
  assert.deepEqual(applyChatPatches(state, injected, "user-1"), state);
  assert.ok(validateChatState(state));
});

test("known family and debt context is not re-asked by the local continuation", () => {
  let state = put(ready(), "topic", "상속");
  state = put(state, "spouse", "배우자 있음");
  state = put(state, "children", "자녀 2명");
  state = put(state, "debt", "보증금 모름");
  assert.equal(getLocalChatReply(state).message, "최근 10년 안에 미리 증여한 재산이 있나요?");
});

test("an explicit topic switch replaces only the active topic and keeps all collected context", () => {
  let state = put(ready(), "topic", "가업상속");
  state = put(state, "spouse", "아버지의 배우자는 계세요");
  state = put(state, "children", "자녀 2명");
  state = put(state, "debt", "대출 3억, 보증금 모름");
  const previous = state;
  const text = "상담 주제를 양도로 바꿀게요";
  state = add(state, text, [{ key: "topic", value: "양도", evidence: text }]);
  assert.equal(state.facts.topic?.value, "양도");
  assert.equal(state.facts.topic?.evidence, text);
  assert.equal(state.facts.topic?.sources, undefined);
  for (const key of ["owner", "realEstate", "spouse", "children", "debt", "unconfirmed"] as const) assert.deepEqual(state.facts[key], previous.facts[key], key);
  assert.ok(state.messages.some(message => message.text === "가업상속"));
  assert.ok(validateChatState(JSON.parse(JSON.stringify(state))));
});

test("topic replacement recognizes explicit changes and isolates the destination quotation", () => {
  for (const text of ["상담 주제를 양도로 변경할게요", "양도 상담으로 전환할게요", "상담 주제를 양도로 대체할게요", "상속에서 양도로 바꿔 주세요", "가업상속 대신 양도 상담을 볼게요", "상속 말고 양도만 검토할게요", "상담 주제 변경: 양도"]) {
    const state = put(put(ready(), "topic", "가업상속"), "topic", text);
    assert.equal(state.facts.topic?.value, "양도", text);
    assert.equal(state.facts.topic?.evidence, text);
    assert.ok(validateChatState(state), text);
  }
});

test("comparison, additional topics and uncertain or negated switches preserve prior topics", () => {
  for (const text of ["상속과 증여를 비교하고 싶어요", "양도도 함께 비교할게요", "아파트 가격은 변경했고 양도도 함께 비교해요", "상담 주제를 양도로 바꿀 수 있을까요?", "상담 주제를 양도로 바꾸지 않을게요"]) {
    const state = put(put(ready(), "topic", "상속"), "topic", text);
    assert.match(state.facts.topic?.value ?? "", /^상속\n/, text);
    assert.ok(state.facts.topic?.sources?.some(source => source.value === text), text);
    assert.ok(validateChatState(state), text);
  }
});
