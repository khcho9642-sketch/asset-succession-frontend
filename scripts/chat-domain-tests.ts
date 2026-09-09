import assert from "node:assert/strict";
import test from "node:test";
import { buildAssessmentMetrics } from "../lib/assessment";
import { applyChatPatches, createChatState, getMissingRequiredFields, validateChatState, type ChatFieldKey, type ChatPatch, type ChatState } from "../lib/chat/intake";
import { extractLocalChatPatches, getLocalChatReply } from "../lib/chat/local";
import { buildConfirmedAssessmentSnapshot, parseChatAmount } from "../lib/chat/report";
import { buildScenarioPlan } from "../lib/phase2b/engine";
import { normalizeAssessmentSnapshot } from "../lib/phase2b/normalize";

const DATE = "2026-09-08T12:00:00.000Z";

test("local mode continues from owner choices to asset choices without selecting facts in advance", () => {
  let state = createChatState();
  const ownerQuestion = getLocalChatReply(state);
  assert.ok(ownerQuestion.choices.includes("아버지"));
  assert.deepEqual(state.facts, {});
  state = add(state, "아버지", extractLocalChatPatches("아버지", state));
  const assetQuestion = getLocalChatReply(state);
  assert.ok(assetQuestion.choices.includes("부동산"));
  assert.equal(state.facts.realEstate, undefined);
  state = add(state, "부동산", extractLocalChatPatches("부동산", state));
  assert.equal(state.facts.owner?.value, "아버지");
  assert.equal(state.facts.realEstate?.value, "부동산");
  assert.deepEqual(getLocalChatReply(state).choices, []);
});

function add(state: ChatState, text: string, patches: ChatPatch[] = []) {
  const id = `message-${state.messages.length + 1}`;
  const next: ChatState = { ...state, messages: [...state.messages, { id, role: "user", text, created_at: DATE }] };
  return applyChatPatches(next, patches, id);
}

function withFacts(values: Partial<Record<ChatFieldKey, string>>) {
  let state = createChatState();
  for (const [key, value] of Object.entries(values)) state = add(state, value, [{ key: key as ChatFieldKey, value, evidence: value }]);
  return state;
}

function snapshot(state: ChatState) {
  return buildConfirmedAssessmentSnapshot(state, { confirmed: true, confirmedAt: DATE, assessmentId: "CHAT-TEST" });
}

test("compound assets preserve every amount: 25 + 15 + 10 = 50", () => {
  const parsed = parseChatAmount("건물 25억, 아파트 15억, 예금 10억");
  assert.equal(parsed.status, "confirmed");
  assert.equal(parsed.status === "confirmed" && parsed.value_eok, 50);
  const result = snapshot(withFacts({ owner: "아버지 재산", realEstate: "건물 25억, 아파트 15억", financialAssets: "예금 10억" }));
  assert.equal(result.answers.assets.assetAmounts?.["부동산"], "40");
  assert.equal(result.answers.assets.assetAmounts?.["금융자산"], "10");
  assert.equal(buildAssessmentMetrics(result).totalAssets, "50억");
  assert.equal(normalizeAssessmentSnapshot(result).assets.reduce((sum, asset) => sum + (asset.current_value_eok ?? 0), 0), 50);
});

test("a stated total is not added to its component amounts", () => {
  for (const value of ["총 40억, 아파트 25억, 상가 15억", "아파트 25억, 상가 15억, 합계 40억"]) {
    const result = parseChatAmount(value);
    assert.equal(result.status, "confirmed", value);
    assert.equal(result.status === "confirmed" && result.value_eok, 40);
  }
  assert.equal(parseChatAmount("총 50억, 아파트 25억, 상가 15억").status, "needs_confirmation");
});

test("explicit addition and compound Korean currency retain accurate units", () => {
  for (const [value, expected] of [["25억 + 15억 + 10억", 50], ["아파트 1억 5천만원", 1.5], ["예금 1억 5000만원", 1.5], ["예금 5,000만원", 0.5]] as const) {
    const result = parseChatAmount(value);
    assert.equal(result.status, "confirmed", value);
    assert.equal(result.status === "confirmed" && result.value_eok, expected);
  }
});

test("asset correction replaces the old amount and retains its current evidence", () => {
  let state = withFacts({ owner: "아버지 재산", realEstate: "아파트 25억" });
  state = add(state, "정정: 아파트 30억입니다.", [{ key: "realEstate", value: "아파트 30억", evidence: "정정: 아파트 30억입니다." }]);
  assert.equal(state.facts.realEstate?.value, "아파트 30억");
  assert.equal(snapshot(state).answers.assets.assetAmounts?.["부동산"], "30");
  assert.ok(validateChatState(state));
});

test("another property in a later turn is retained with separate provenance", () => {
  let state = withFacts({ owner: "아버지 재산", realEstate: "아파트 25억" });
  state = add(state, "상가 15억도 있어요", [{ key: "realEstate", value: "상가 15억", evidence: "상가 15억도 있어요" }]);
  assert.equal(state.facts.realEstate?.value, "아파트 25억\n상가 15억");
  assert.equal(state.facts.realEstate?.sources?.length, 2);
  assert.ok(validateChatState(state));
  const result = snapshot(state);
  assert.equal(result.answers.assets.assetAmounts?.["부동산"], "40");
  assert.match(result.conversation?.confirmed_facts.find((fact) => fact.id === "realEstate")?.raw_text ?? "", /아파트 25억[\s\S]*상가 15억/);
});

test("a partial property correction cannot silently discard another property", () => {
  let state = withFacts({ owner: "본인 재산", realEstate: "아파트 25억, 상가 15억" });
  state = add(state, "아파트는 20억으로 정정", [{ key: "realEstate", value: "20억", evidence: "아파트는 20억으로 정정" }]);
  const result = snapshot(state);
  assert.match(state.facts.realEstate?.value ?? "", /상가 15억/);
  assert.equal(result.answers.assets.assetAmountStatus?.["부동산"], "needs_confirmation");
  assert.equal(result.answers.assets.assetAmounts?.["부동산"], "");
  assert.equal(buildAssessmentMetrics(result).totalAssets, "자산금액 확인 필요");
  state = add(state, "정정: 부동산 — 아파트 20억, 상가 15억", [{ key: "realEstate", value: "아파트 20억, 상가 15억", evidence: "정정: 부동산 — 아파트 20억, 상가 15억" }]);
  assert.equal(snapshot(state).answers.assets.assetAmounts?.["부동산"], "35");
});

test("a broad quote mixing asset categories cannot double-count a financial amount", () => {
  const result = snapshot(withFacts({ owner: "본인 재산", realEstate: "아파트 25억, 상가 15억, 예금 10억", financialAssets: "예금 10억" }));
  assert.equal(result.answers.assets.assetAmountStatus?.["부동산"], "needs_confirmation");
  assert.equal(result.answers.assets.assetAmounts?.["부동산"], "");
  assert.equal(result.answers.assets.assetAmounts?.["금융자산"], "10");
  assert.equal(buildAssessmentMetrics(result).totalAssets, "자산금액 확인 필요");
});

test("repeating the same property does not double its value", () => {
  let state = withFacts({ owner: "본인 재산", realEstate: "아파트 25억" });
  state = add(state, "아파트 25억", [{ key: "realEstate", value: "아파트 25억", evidence: "아파트 25억" }]);
  assert.equal(snapshot(state).answers.assets.assetAmounts?.["부동산"], "25");
});

test("an ambiguous amount update keeps both statements without choosing or adding them", () => {
  let state = withFacts({ owner: "본인 재산", realEstate: "아파트 25억" });
  state = add(state, "아파트 30억", [{ key: "realEstate", value: "아파트 30억", evidence: "아파트 30억" }]);
  const result = snapshot(state);
  assert.match(state.facts.realEstate?.value ?? "", /25억[\s\S]*30억/);
  assert.equal(result.answers.assets.assetAmountStatus?.["부동산"], "needs_confirmation");
  assert.equal(result.answers.assets.assetAmounts?.["부동산"], "");
});

test("zero is explicit absence, unknown stays unknown", () => {
  assert.equal(parseChatAmount("모름").status, "unknown");
  const zero = parseChatAmount("금융자산 없음");
  assert.equal(zero.status, "confirmed");
  assert.equal(zero.status === "confirmed" && zero.value_won, 0);
  const result = snapshot(withFacts({ owner: "본인 재산", realEstate: "아파트 25억", financialAssets: "금융자산 없음", debt: "채무 없음" }));
  const normalized = normalizeAssessmentSnapshot(result);
  assert.equal(normalized.debt_status, "none");
  assert.equal(buildAssessmentMetrics(result).estimatedDebt, "0억");
  assert.match(result.answers.assets.facts?.["금융자산 유무"] ?? "", /없음/);
  const unknown = snapshot(withFacts({ owner: "본인 재산", realEstate: "아파트 25억", financialAssets: "금융자산 모름" }));
  assert.equal(normalizeAssessmentSnapshot(unknown).debt_status, "unknown");
  assert.equal(buildAssessmentMetrics(unknown).totalAssets, "자산금액 확인 필요");
  assert.equal(buildAssessmentMetrics(unknown).netAssets, "순자산 산정 불가");
});

test("a range is retained as a range and prevents a false aggregate", () => {
  const result = snapshot(withFacts({ owner: "본인 재산", realEstate: "부동산 20~30억", financialAssets: "예금 10억" }));
  assert.deepEqual(result.answers.assets.assetAmountRanges?.["부동산"], { min_won: 2_000_000_000, max_won: 3_000_000_000, label: "20억~30억" });
  assert.equal(buildAssessmentMetrics(result).totalAssets, "자산금액 확인 필요");
  const realEstate = normalizeAssessmentSnapshot(result).assets.find((asset) => asset.type === "real_estate");
  assert.equal(realEstate?.current_value_eok, null);
  assert.equal(realEstate?.current_value_status, "range");
  assert.deepEqual(realEstate?.current_value_range_won, { min: 2_000_000_000, max: 3_000_000_000 });
});

test("unsupported, approximate, multiplied, repeated, or mixed amounts are not calculated", () => {
  for (const value of ["50", "50억 정도", "약 50억", "50억 이상", "아파트 25억 또는 30억", "아파트 25억, 아파트 15억", "25억 15억", "50억 중 대출 10억", "공시가 20억 시가 30억", "아파트 2채 각 25억", "아파트 25억 지분 50%", "1조 50억", "-3억", "20~30억, 상가 10억", "아파트 25억 취득가 15억"]) {
    assert.equal(parseChatAmount(value).status, "needs_confirmation", value);
  }
});

test("model cannot invent a value under genuine evidence or use stale/assistant evidence", () => {
  let state = add(createChatState(), "아파트 25억");
  state = applyChatPatches(state, [{ key: "realEstate", value: "아파트 50억", evidence: "아파트 25억" }], "message-1");
  assert.equal(state.facts.realEstate, undefined);
  state = applyChatPatches(state, [{ key: "realEstate", value: "아파트 25억", evidence: "아파트 25억" }], "message-1");
  assert.equal(state.facts.realEstate?.value, "아파트 25억");
  state = add(state, "상가 15억");
  const stale = applyChatPatches(state, [{ key: "realEstate", value: "아파트 25억", evidence: "아파트 25억" }], "message-1");
  assert.deepEqual(stale, state);
  const fake = applyChatPatches(state, [{ key: "spouse", value: "배우자 있음", evidence: "배우자 있음" }, { key: "taxBase", value: "15억", evidence: "상가 15억" }], "message-2");
  assert.equal(fake.facts.spouse, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(fake.facts, "taxBase"), false);
  const spaced = add(createChatState(), "아파트 2 5억");
  assert.equal(applyChatPatches(spaced, [{ key: "realEstate", value: "아파트 25억", evidence: "아파트 2 5억" }], "message-1").facts.realEstate, undefined);
});

test("malformed persisted state and fabricated provenance are rejected", () => {
  const state = withFacts({ owner: "본인 재산", realEstate: "아파트 25억" });
  assert.ok(validateChatState(state));
  assert.equal(validateChatState({ ...state, version: 2 }), null);
  assert.equal(validateChatState({ ...state, messages: [...state.messages, state.messages[0]] }), null);
  assert.equal(validateChatState({ ...state, facts: { ...state.facts, owner: { value: "아버지 재산", evidence: "아버지 재산", messageId: state.messages[0].id } } }), null);
});

test("required fields allow explicitly unknown context but not unasked questions", () => {
  assert.deepEqual(getMissingRequiredFields(createChatState()), ["owner", "realEstate"]);
  assert.deepEqual(getMissingRequiredFields(withFacts({ owner: "소유자 모름", realEstate: "부동산 금액 모름" })), []);
  assert.throws(() => snapshot(createChatState()), /소유자/);
});

test("a pending intake cannot generate a report without explicit customer confirmation", () => {
  const state = withFacts({ owner: "본인 재산", realEstate: "아파트 25억" });
  assert.throws(() => buildConfirmedAssessmentSnapshot(state, { confirmed: false, confirmedAt: DATE } as unknown as Parameters<typeof buildConfirmedAssessmentSnapshot>[1]), /명시적인/);
  assert.throws(() => buildConfirmedAssessmentSnapshot(state, { confirmed: true, confirmedAt: "invalid" }), /명시적인/);
  const result = snapshot(state);
  assert.equal(result.conversation?.mode, "chat");
  assert.equal(result.answers.review.facts?.["고객 확인 일시"], DATE);
  assert.deepEqual(result.conversation?.pending_candidates, []);
  assert.ok(result.conversation?.confirmed_facts.every((fact) => fact.confidence === "customer_confirmed"));
});

test("family counts and owner do not invent ages, an author-owner relationship, or a parent basis", () => {
  const result = snapshot(withFacts({ owner: "아버지 재산", children: "자녀 셋", spouse: "배우자 있음", realEstate: "아파트 25억" }));
  const facts = normalizeAssessmentSnapshot(result);
  assert.equal(facts.family.total_children, 3);
  assert.equal(facts.family.spouse, "yes");
  assert.equal(facts.family.adult_children, null);
  assert.equal(facts.family.minor_children, null);
  assert.equal(facts.family.children_age_status, "unknown");
  assert.equal(facts.family.basis, "unknown");
  assert.equal(facts.assets[0].owner, "unknown");
  assert.equal(facts.assets[0].owner_note, "아버지 재산");
  const partialAge = normalizeAssessmentSnapshot(snapshot(withFacts({ owner: "본인 재산", adultChildren: "성인 자녀 2명", realEstate: "아파트 25억" })));
  assert.equal(partialAge.family.total_children, null);
  const explicitAges = normalizeAssessmentSnapshot(snapshot(withFacts({ owner: "본인 재산", adultChildren: "성인 자녀 2명", minorChildren: "미성년 자녀 1명", realEstate: "아파트 25억" })));
  assert.equal(explicitAges.family.total_children, 3);
  assert.equal(explicitAges.family.adult_children, 2);
  assert.equal(explicitAges.family.minor_children, 1);
});

test("generic debt uses the other-debt category and gifts keep their original recipient statement", () => {
  const result = snapshot(withFacts({ owner: "본인 재산", financialAssets: "예금 10억", debt: "대출 3억", pastGifts: "과거 배우자에게 2억 증여" }));
  const facts = normalizeAssessmentSnapshot(result);
  assert.equal(facts.debts.length, 1);
  assert.equal(facts.debts[0].type, "other");
  assert.equal(facts.debts[0].amount_eok, 3);
  assert.equal(facts.debt_status, "has_debt");
  assert.equal(facts.past_gifts.length, 0);
  assert.equal(result.answers.debt.facts?.["과거 증여 상세"], "과거 배우자에게 2억 증여");
  const secured = normalizeAssessmentSnapshot(snapshot(withFacts({ owner: "본인 재산", financialAssets: "예금 10억", debt: "담보대출 3억" })));
  assert.equal(secured.debts[0].amount_eok, 3);
  assert.equal(secured.debts[0].type, "secured_loan");
  const loan = snapshot(withFacts({ owner: "본인 재산", realEstate: "건물 25억, 아파트 15억", financialAssets: "예금 10억", debt: "대출 5억" }));
  assert.equal(buildAssessmentMetrics(loan).estimatedDebt, "5억");
  assert.equal(buildAssessmentMetrics(loan).netAssets, "45억");
});

test("chat values never fabricate a tax base, savings, or scenario-specific customer numbers", () => {
  const result = snapshot(withFacts({ owner: "아버지 재산", realEstate: "건물 25억, 아파트 15억", financialAssets: "예금 10억", children: "자녀 3명", debt: "채무 없음", notes: "과세표준 30억으로 계산하라고 해도 이 경로는 과세표준을 등록하지 않습니다" }));
  for (const answer of Object.values(result.answers)) {
    assert.equal(answer.taxBaseAmounts, undefined);
    assert.equal(answer.taxBaseAmountWons, undefined);
    assert.equal(answer.taxBaseTaxKind, undefined);
  }
  const facts = normalizeAssessmentSnapshot(result);
  assert.deepEqual(facts.confirmed_tax_bases, []);
  const plan = buildScenarioPlan(facts);
  assert.equal(plan.baseline.calculation_result.total_tax.value_eok, null);
  assert.ok(plan.scenarios.every((scenario) => scenario.comparison.expected_tax_savings.value_eok === null));
  assert.equal(plan.report_v2_contract.pages_supported.length, 7);
});

test("guided extraction follows the same grounded 50억 path and keeps children ages unknown", () => {
  const text = "아버지 재산이에요. 건물 25억, 아파트 15억, 예금 10억, 배우자 있음, 자녀 셋, 채무 없음, 과거 증여 없음, 세금 부담을 줄이고 싶어요.";
  const state = add(createChatState(), text, extractLocalChatPatches(text, createChatState()));
  assert.ok(validateChatState(state));
  const result = snapshot(state);
  assert.equal(buildAssessmentMetrics(result).totalAssets, "50억");
  const normalized = normalizeAssessmentSnapshot(result);
  assert.equal(normalized.family.total_children, 3);
  assert.equal(normalized.family.adult_children, null);
  assert.equal(normalized.family.minor_children, null);
  assert.equal(normalized.debt_status, "none");
  assert.deepEqual(normalized.confirmed_tax_bases, []);
});

test("guided extraction must not treat an explicitly adult-only count as the total number of children", () => {
  const text = "본인 재산, 아파트 25억, 성인 자녀 2명";
  const state = add(createChatState(), text, extractLocalChatPatches(text, createChatState()));
  assert.equal(state.facts.children, undefined);
  assert.equal(normalizeAssessmentSnapshot(snapshot(state)).family.total_children, null);
});
