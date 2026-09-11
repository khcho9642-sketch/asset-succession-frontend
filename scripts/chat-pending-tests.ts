import assert from "node:assert/strict";
import test from "node:test";
import { buildAssessmentMetrics } from "../lib/assessment";
import { applyChatPatches, createChatState, getCurrentFactSources, getPendingFactSources, hasPendingFactRequests, removeCurrentFact, resolvePendingFact, validateChatState, type ChatFieldKey, type ChatState, type PendingFactResolution } from "../lib/chat/intake";
import { buildConfirmedAssessmentSnapshot } from "../lib/chat/report";
import { attachConfirmedTaxComparison, buildConfirmedTaxAssessmentSnapshot, createTaxInputFromChat, taxFactsSignature } from "../lib/chat/tax";
import { normalizeAssessmentSnapshot } from "../lib/phase2b/normalize";
import type { TaxComparisonInput } from "../lib/tax-comparison";

const date = "2026-09-11T03:00:00.000Z";
const confirm = { confirmed: true as const, confirmedAt: date, assessmentId: "AS360-PENDING-TEST" };
const readyInput: TaxComparisonInput = { version: 1, track: "gift", confirmed: true, confirmedAt: date,
  values: { giftAmount: "3", recipientCount: "3", recipientType: "adult_child", resident: "yes", standardCase: "yes" } };
function restore(state: ChatState): ChatState {
  const restored = validateChatState(JSON.parse(JSON.stringify(state)));
  assert.ok(restored);
  return restored;
}
function add(state: ChatState, key: ChatFieldKey, text: string, value = text): ChatState {
  const id = `synthetic-${state.messages.length}`;
  return restore(applyChatPatches({ ...state, messages: [...state.messages, { id, role: "user", text, created_at: date }] }, [{ key, value, evidence: text }], id));
}
function initial() {
  return add(add(createChatState(), "owner", "본인 재산"), "realEstate", "아파트 25억원");
}
function current(state: ChatState, key: ChatFieldKey = "debt") { return state.facts[key] ? getCurrentFactSources(state.facts[key]!) : []; }
function pending(state: ChatState, key: ChatFieldKey = "debt") { return state.facts[key] ? getPendingFactSources(state.facts[key]!) : []; }
function resolve(state: ChatState, key: ChatFieldKey, requestId: string, action: PendingFactResolution) {
  return restore(resolvePendingFact(state, key, requestId, action, { id: `customer-${state.messages.length}`, created_at: date }));
}

type Regression = { id: string; key?: ChatFieldKey; steps: (string | [string, string])[]; current: string[]; pending?: string[]; replay?: boolean };
// The independent review's 12 accepted examples and three new failures, kept in CI.
const cases: Regression[] = [
  { id: "C01", steps: ["은행 대출 2억원", "임대보증금 3억원도 있어요"], current: ["은행 대출 2억원", "임대보증금 3억원도 있어요"] },
  { id: "C02", steps: ["은행 대출 2억원", "임대보증금 3억원도 있어요", "은행 대출 1억5천만원으로 정정"], current: ["은행 대출 1억5천만원으로 정정", "임대보증금 3억원도 있어요"] },
  { id: "C03", key: "pastGifts", steps: ["2020년 첫째에게 1억원 증여", "2023년 둘째에게 5천만원도 증여"], current: ["2020년 첫째에게 1억원 증여", "2023년 둘째에게 5천만원도 증여"] },
  { id: "C04", steps: ["은행 대출 2억원", "임대보증금 3억원"], current: ["은행 대출 2억원", "임대보증금 3억원"], replay: true },
  { id: "F01", steps: ["국민은행 대출 2억원", "신한은행 대출 3억원", "신한은행 대출 1억원으로 정정"], current: ["국민은행 대출 2억원", "신한은행 대출 1억원으로 정정"] },
  { id: "F02", steps: ["은행 대출 1.5억원", ["은행 대출 15억원으로 정정", "은행 대출 15억원"]], current: ["은행 대출 15억원"] },
  { id: "F03", steps: ["은행 대출 2억원", "은행 대출 2억원 삭제"], current: [] },
  { id: "F04", key: "pastGifts", steps: ["2023년 2월 첫째에게 1억원 증여", "2023년 8월 첫째에게 2억원 증여", "2023년 8월 첫째에게 3억원 증여로 정정"], current: ["2023년 2월 첫째에게 1억원 증여", "2023년 8월 첫째에게 3억원 증여로 정정"] },
  { id: "F05", steps: ["은행 대출 2억원", "임대보증금 3억원", ["정정: 채무 — 은행 대출 2억원", "은행 대출 2억원"]], current: ["은행 대출 2억원"] },
  { id: "F07", steps: ["은행 대출 2억원", "임대보증금 3억원", ["은행 대출 2억원 삭제", "은행 대출 2억원"]], current: ["임대보증금 3억원"] },
  { id: "R1", steps: ["국민은행 대출 2억원", "신한은행 대출 3억원", "임대보증금 4억원", "은행 대출 1억원으로 정정", "임대보증금 5억원으로 정정"], current: ["국민은행 대출 2억원", "신한은행 대출 3억원", "임대보증금 5억원으로 정정"], pending: ["은행 대출 1억원으로 정정"] },
  { id: "R2", steps: ["은행 대출 2억원", "은행 대출 2억원 삭제"], current: [], replay: true },
  { id: "R1-BANK", steps: ["국민은행 신용대출 2억원", "국민은행 사업대출 3억원", "신한은행 대출 4억원", "국민은행 대출 1억원으로 정정", "신한은행 대출 5억원으로 정정"], current: ["국민은행 신용대출 2억원", "국민은행 사업대출 3억원", "신한은행 대출 5억원으로 정정"], pending: ["국민은행 대출 1억원으로 정정"] },
  { id: "R1-GIFT", key: "pastGifts", steps: ["2023년 2월 1일 첫째에게 1억원 증여", "2023년 2월 20일 첫째에게 2억원 증여", "2023년 8월 첫째에게 4억원 증여", "2023년 2월 첫째에게 3억원 증여로 정정", "2023년 8월 첫째에게 5억원 증여로 정정"], current: ["2023년 2월 1일 첫째에게 1억원 증여", "2023년 2월 20일 첫째에게 2억원 증여", "2023년 8월 첫째에게 5억원 증여로 정정"], pending: ["2023년 2월 첫째에게 3억원 증여로 정정"] },
  { id: "R1-EMPTY-ACTIVE", steps: ["임대보증금 4억원", "국민은행 대출 1억원으로 정정", "임대보증금 4억원 삭제"], current: [], pending: ["국민은행 대출 1억원으로 정정"] },
];

for (const example of cases) test(`PR13 ${example.id}: facts, storage, summary, calculation and replay`, () => {
  const key = example.key ?? "debt";
  let state = initial();
  for (const step of example.steps) {
    const [text, value] = typeof step === "string" ? [step, step] : step;
    state = add(state, key, text, value);
    const replay = applyChatPatches(restore(state), [{ key, value, evidence: text }], state.messages.at(-1)!.id);
    assert.deepEqual(replay, state, "Each operation must be idempotent after restore");
  }
  assert.deepEqual(current(state, key).map(item => item.value), example.current);
  assert.deepEqual(pending(state, key).map(item => item.value), example.pending ?? []);
  const snapshot = buildConfirmedAssessmentSnapshot(state, confirm);
  assert.deepEqual(snapshot.conversation?.pending_candidates?.map(item => item.value), example.pending ?? []);
  assert.equal(createTaxInputFromChat(state).confirmed, false);
  if (example.pending?.length) {
    assert.equal(hasPendingFactRequests(state), true);
    assert.throws(() => buildConfirmedTaxAssessmentSnapshot(state, readyInput, confirm), /확인 대기/);
    assert.throws(() => attachConfirmedTaxComparison(snapshot, readyInput), /확인 대기/);
    const normalized = normalizeAssessmentSnapshot(snapshot);
    if (key === "debt") {
      assert.equal(createTaxInputFromChat(state).values.debt, undefined);
      assert.equal(snapshot.answers.debt.debtAmounts, undefined);
      assert.notEqual(normalized.debt_status, "none");
      assert.equal(buildAssessmentMetrics(snapshot).estimatedDebt, "채무 금액 미입력");
    } else assert.ok(normalized.past_gifts.every(item => item.amount_eok === null && item.confirmation_status === "amount_missing"));
  }
  if (!example.current.length) assert.equal(snapshot.conversation?.confirmed_facts.some(item => item.id === key), false);
});

test("one explicit resolution preserves another request even for the same item and amount", () => {
  let state = add(add(initial(), "debt", "국민은행 신용대출 2억원"), "debt", "국민은행 사업대출 3억원");
  state = add(state, "debt", "국민은행 대출 1억원으로 정정");
  state = add(state, "debt", "국민은행 대출 1억원으로 정정");
  assert.equal(pending(state).length, 2, "Distinct requests are not replay of the same message");
  const [first, second] = pending(state);
  const action: PendingFactResolution = { action: "replace", targetMessageId: current(state)[0].messageId, value: "국민은행 신용대출 1억원" };
  const before = state;
  state = resolve(state, "debt", first.messageId, action);
  assert.deepEqual(pending(state).map(item => item.messageId), [second.messageId]);
  assert.notEqual(taxFactsSignature(state), taxFactsSignature(before));
  assert.equal(createTaxInputFromChat(state).values.debt, undefined);
  assert.equal(state.factOperations?.at(-1)?.resolution?.requestMessageId, first.messageId);
  const last = state.messages.at(-1)!;
  assert.deepEqual(resolvePendingFact(restore(state), "debt", first.messageId, action, last), state);
  // Even a changed extraction of the customer's confirmation cannot reapply it.
  assert.deepEqual(applyChatPatches(state, [{ key: "debt", value: action.value, evidence: action.value }], last.id), state);
  state = resolve(state, "debt", second.messageId, { action: "cancel" });
  assert.equal(hasPendingFactRequests(state), false);
  assert.equal(createTaxInputFromChat(state).values.debt, "4");
  assert.equal(buildConfirmedTaxAssessmentSnapshot(state, readyInput, confirm).taxComparisonInput?.confirmed, true);
});

test("pending-only requests survive direct delete, complete replacement and explicit cancellation", () => {
  let state = add(add(initial(), "debt", "임대보증금 4억원"), "debt", "국민은행 대출 1억원으로 정정");
  const requestId = pending(state)[0].messageId;
  state = restore(removeCurrentFact(state, "debt", { id: "delete-current", role: "user", text: "현재 채무 항목 삭제", created_at: date }));
  assert.deepEqual(current(state), []);
  assert.equal(pending(state)[0].messageId, requestId);
  assert.equal(state.facts.debt?.value, "");
  state = add(state, "debt", "신한은행 대출 2억원으로 정정");
  const second = pending(state)[1].messageId;
  assert.deepEqual(current(state), []);
  state = add(state, "debt", "정정: 채무 — 채무 없음", "채무 없음");
  assert.equal(pending(state).length, 2, "Editing all current values does not cancel pending requests");
  const snapshot = buildConfirmedAssessmentSnapshot(state, confirm);
  assert.notEqual(normalizeAssessmentSnapshot(snapshot).debt_status, "none");
  assert.equal(createTaxInputFromChat(state).values.debt, undefined);
  state = resolve(state, "debt", requestId, { action: "cancel" });
  assert.deepEqual(pending(state).map(item => item.messageId), [second]);
  state = resolve(state, "debt", second, { action: "cancel" });
  assert.equal(createTaxInputFromChat(state).values.debt, "0", "Zero comes only from the customer's explicit current fact");
});

test("a pending-only request can be explicitly replaced by a new grounded current item", () => {
  let state = add(initial(), "debt", "국민은행 대출 1억원으로 정정");
  assert.deepEqual(current(state), []);
  const requestId = pending(state)[0].messageId;
  state = resolve(state, "debt", requestId, { action: "replace", value: "국민은행 신용대출 1억원" });
  assert.equal(hasPendingFactRequests(state), false);
  assert.equal(createTaxInputFromChat(state).values.debt, "1");
  assert.equal(current(state)[0].evidence, "국민은행 신용대출 1억원");
  assert.ok(state.messages.some(item => item.id === requestId));
});

test("explicit deletion resolves only its named request; stale target and request IDs do nothing", () => {
  let state = add(add(initial(), "pastGifts", "2023년 2월 1일 첫째에게 1억원 증여"), "pastGifts", "2023년 2월 20일 첫째에게 2억원 증여");
  state = add(state, "pastGifts", "2023년 2월 첫째 증여 삭제");
  state = add(state, "pastGifts", "2023년 2월 첫째에게 3억원으로 정정");
  const [first, second] = pending(state, "pastGifts");
  const targetMessageId = current(state, "pastGifts")[0].messageId;
  assert.deepEqual(resolve(state, "pastGifts", first.messageId, { action: "delete", targetMessageId: "missing" }), state);
  assert.deepEqual(resolve(state, "pastGifts", "missing", { action: "cancel" }), state);
  state = resolve(state, "pastGifts", first.messageId, { action: "delete", targetMessageId });
  assert.equal(current(state, "pastGifts").length, 1);
  assert.deepEqual(pending(state, "pastGifts").map(item => item.messageId), [second.messageId]);
  const last = state.messages.at(-1)!;
  assert.deepEqual(resolvePendingFact(restore(state), "pastGifts", first.messageId, { action: "delete", targetMessageId }, last), state);
  state = resolve(state, "pastGifts", second.messageId, { action: "replace", targetMessageId: current(state, "pastGifts")[0].messageId, value: "2023년 2월 20일 첫째에게 3억원 증여" });
  assert.equal(hasPendingFactRequests(state), false);
  assert.deepEqual(normalizeAssessmentSnapshot(buildConfirmedAssessmentSnapshot(state, confirm)).past_gifts.map(item => item.amount_eok), [3]);
});

test("legacy saves without an operation ledger retain pending evidence and can finish", () => {
  const before = add(add(initial(), "debt", "임대보증금 4억원"), "debt", "국민은행 대출 1억원으로 정정");
  const { factOperations: _oldOperations, ...legacy } = before;
  let state = restore(legacy);
  assert.deepEqual(state.facts, before.facts);
  state = resolve(state, "debt", pending(state)[0].messageId, { action: "cancel" });
  assert.equal(createTaxInputFromChat(state).values.debt, "4");
  const tampered = JSON.parse(JSON.stringify(state));
  tampered.factOperations[0].resolution.requestMessageId = "invented";
  assert.equal(validateChatState(tampered), null);
});

test("cancelling the last pending-only request leaves no current fact, including after replay", () => {
  for (const key of ["debt", "pastGifts"] as const) {
    let state = add(initial(), key, key === "debt" ? "은행 대출 1억원으로 정정" : "2023년 첫째에게 1억원 증여로 정정");
    const requestId = pending(state, key)[0].messageId;
    state = resolve(state, key, requestId, { action: "cancel" });
    assert.equal(state.facts[key], undefined);
    assert.equal(hasPendingFactRequests(state), false);
    assert.equal(createTaxInputFromChat(state).values.debt, undefined);
    assert.deepEqual(resolvePendingFact(restore(state), key, requestId, { action: "cancel" }, state.messages.at(-1)!), state);
  }
});
