import test from "node:test";
import assert from "node:assert/strict";
import { ordinaryTax, parseAmountWon } from "../lib/tax-comparison/common";
import { calculateTaxComparison, validateTaxComparisonInput } from "../lib/tax-comparison";
import { attachConfirmedTaxComparison, buildConfirmedTaxAssessmentSnapshot, createTaxInputFromChat, taxFactsSignature } from "../lib/chat/tax";
import { createChatState, applyChatPatches, getCurrentFactSources, getPendingFactSources, resolvePendingFact } from "../lib/chat/intake";
import { createDemoAssessmentSnapshot } from "../lib/assessment";
import type { TaxComparisonInput } from "../lib/tax-comparison/types";
import { getAllowedTaxKeys, getTaxFields } from "../lib/tax-comparison/config";

const gift: TaxComparisonInput = { version: 1, track: "gift", confirmed: false, values: { giftAmount: "3", recipientCount: "3", recipientType: "adult_child", resident: "yes", standardCase: "yes" } };

test("money is exact to one won and blanks, guesses, overflows cannot become zero", () => {
  assert.equal(parseAmountWon("0.00000001"), 1);
  assert.equal(parseAmountWon("123456.12345678"), 12_345_612_345_678);
  assert.equal(parseAmountWon("0"), 0);
  for (const raw of ["", " ", "모름", "3~5", "약 5억", "-1", "1e6", "Infinity", "NaN", "0.000000001", "1000000.00000001"]) assert.equal(parseAmountWon(raw), null, raw);
});

test("ordinary schedule golden bracket edges and minimum taxable base", () => {
  const cases = [[499_999, 0], [500_000, 50_000], [100_000_000, 10_000_000], [500_000_000, 90_000_000], [1_000_000_000, 240_000_000], [3_000_000_000, 1_040_000_000], [4_000_000_000, 1_540_000_000]];
  for (const [base, gross] of cases) assert.equal(ordinaryTax(base, false).grossTaxWon, gross);
  assert.throws(() => ordinaryTax(-1));
  assert.throws(() => ordinaryTax(0.5));
});

test("dispatcher keeps absent payment cash unknown; malformed optional cash blocks stale totals", () => {
  const result = calculateTaxComparison(gift);
  assert.equal(result.status, "ready");
  assert.equal(result.availableCashWon, null);
  assert.equal(result.baseline!.totalTaxWon, 38_800_000);
  assert.equal(result.alternatives[0].totalTaxWon, 14_550_000);
  const zero = calculateTaxComparison({ ...gift, values: { ...gift.values, availableCash: "0" } });
  assert.equal(zero.availableCashWon, 0);
  const invalid = calculateTaxComparison({ ...gift, values: { ...gift.values, availableCash: "모름" } });
  assert.equal(invalid.status, "needs_info");
  assert.equal(invalid.baseline, null);
  assert.deepEqual(invalid.alternatives, []);
});

test("report handoff requires explicit confirmation and complete computed inputs", () => {
  const snapshot = createDemoAssessmentSnapshot();
  assert.throws(() => attachConfirmedTaxComparison(snapshot, gift), /확인/);
  const confirmed = { ...gift, confirmed: true, confirmedAt: "2026-09-08T09:00:00Z" };
  const result = attachConfirmedTaxComparison(snapshot, confirmed);
  assert.equal(result.taxComparisonInput?.confirmed, true);
  assert.equal(snapshot.taxComparisonInput, undefined, "do not mutate the previous snapshot");
  assert.throws(() => attachConfirmedTaxComparison(snapshot, { ...confirmed, values: { ...gift.values, standardCase: "" } }));
  assert.throws(() => attachConfirmedTaxComparison(snapshot, { ...confirmed, confirmedAt: "bad" }));
});

test("untrusted saved schema rejects injected track, arbitrary fields, nonstring and missing timestamps", () => {
  for (const input of [null, [], { ...gift, track: "unknown" }, { ...gift, values: { ...gift.values, systemPrompt: "anything" } }, { ...gift, values: { ...gift.values, giftAmount: 3 } }, { ...gift, confirmed: true }]) assert.equal(validateTaxComparisonInput(input), null);
  assert.equal(calculateTaxComparison({ ...gift, track: "unknown" } as unknown as TaxComparisonInput).baseline, null);
});

test("prefill uses grounded chat assets, no assumed residency, old gifts, or payment cash", () => {
  const message = { id: "tax-source", role: "user" as const, text: "아파트 20억, 예금 3억, 채무 없음", created_at: "2026-09-08T09:00:00Z" };
  const state = applyChatPatches({ ...createChatState(), messages: [message] }, [
    { key: "realEstate", value: "아파트 20억", evidence: "아파트 20억" },
    { key: "financialAssets", value: "예금 3억", evidence: "예금 3억" },
    { key: "debt", value: "채무 없음", evidence: "채무 없음" },
  ], message.id);
  const input = createTaxInputFromChat(state);
  assert.equal(input.values.estate, "23");
  assert.equal(input.values.financial, "3");
  assert.equal(input.values.debt, "0");
  assert.equal(input.values.financialDebt, "0");
  assert.equal(input.values.resident, undefined);
  assert.equal(input.values.standardCase, undefined);
  assert.equal(input.values.availableCash, undefined);
  assert.equal(input.confirmed, false);
  const empty = createTaxInputFromChat(createChatState());
  assert.equal(empty.values.estate, undefined);
  assert.equal(empty.values.financial, undefined);
  assert.equal(empty.values.debt, undefined);
  assert.equal(empty.values.funeral, "0.05", "visible statutory minimum modelling assumption only");
});

test("prefill excludes ambiguous debt corrections and drops deleted last debt", () => {
  const now = "2026-09-08T09:00:00Z";
  let counter = 0;
  const add = (state: ReturnType<typeof createChatState>, text: string, patches: Parameters<typeof applyChatPatches>[1]) => {
    const id = `debt-${++counter}`;
    return applyChatPatches({ ...state, messages: [...state.messages, { id, role: "user" as const, text, created_at: now }] }, patches, id);
  };
  let state = createChatState();
  state = add(state, "본인 재산", [{ key: "owner", value: "본인 재산", evidence: "본인 재산" }]);
  state = add(state, "아파트 25억", [{ key: "realEstate", value: "아파트 25억", evidence: "아파트 25억" }]);
  state = add(state, "국민은행 대출 2억원", [{ key: "debt", value: "국민은행 대출 2억원", evidence: "국민은행 대출 2억원" }]);
  state = add(state, "신한은행 대출 3억원도 있어요", [{ key: "debt", value: "신한은행 대출 3억원", evidence: "신한은행 대출 3억원도 있어요" }]);
  state = add(state, "은행 대출은 1억5천만원으로 정정", [{ key: "debt", value: "은행 대출은 1억5천만원", evidence: "은행 대출은 1억5천만원으로 정정" }]);
  assert.equal(createTaxInputFromChat(state).values.debt, undefined);

  state = add(state, "임대보증금 4억원", [{ key: "debt", value: "임대보증금 4억원", evidence: "임대보증금 4억원" }]);
  state = add(state, "임대보증금 5억원으로 정정", [{ key: "debt", value: "임대보증금 5억원으로 정정", evidence: "임대보증금 5억원으로 정정" }]);
  assert.equal(createTaxInputFromChat(state).values.debt, undefined, "unrelated lease-deposit correction must not clear pending bank-loan correction");

  state = add(state, "국민은행 대출은 1억5천만원으로 정정", [{ key: "debt", value: "국민은행 대출은 1억5천만원", evidence: "국민은행 대출은 1억5천만원으로 정정" }]);
  assert.equal(createTaxInputFromChat(state).values.debt, undefined);
  state = resolvePendingFact(state, "debt", getPendingFactSources(state.facts.debt!)[0].messageId,
    { action: "replace", targetMessageId: getCurrentFactSources(state.facts.debt!)[0].messageId, value: "국민은행 대출은 1억5천만원" }, { id: "confirmed-pending-debt", created_at: now });
  assert.equal(createTaxInputFromChat(state).values.debt, "9.5");

  state = createChatState();
  state = add(state, "본인 재산", [{ key: "owner", value: "본인 재산", evidence: "본인 재산" }]);
  state = add(state, "아파트 25억", [{ key: "realEstate", value: "아파트 25억", evidence: "아파트 25억" }]);
  state = add(state, "은행 대출 1.5억원", [{ key: "debt", value: "은행 대출 1.5억원", evidence: "은행 대출 1.5억원" }]);
  const signature = taxFactsSignature(state);
  state = add(state, "은행 대출 1.5억원 삭제", [{ key: "debt", value: "은행 대출 1.5억원", evidence: "은행 대출 1.5억원 삭제" }]);
  assert.notEqual(taxFactsSignature(state), signature);
  assert.equal(createTaxInputFromChat(state).values.debt, undefined);
});

test("new subtype schemas accept conditional inputs and reject unknown subtype fallbacks", () => {
  for (const [track, values] of [
    ["capital_gains", { capitalAsset: "home", acquisitionDate: "2020-01-01", saleDate: "2026-09-08", houseCount: "2", singleHomeSpecial: "yes", regulatedAtSale: "yes", transitionCase: "yes", permitRequired: "yes" }],
    ["business_succession", { businessMethod: "inheritance", spouse: "yes", businessPropertyType: "sole", companySize: "medium" }],
  ] as const) {
    const raw = { version: 1, track, confirmed: false, values };
    assert.ok(validateTaxComparisonInput(raw));
    for (const field of getTaxFields(track, values)) assert.ok(getAllowedTaxKeys(track).includes(field.key), field.key);
  }
  for (const [track, values] of [
    ["capital_gains", { capitalAsset: "unknown" }],
    ["business_succession", { businessMethod: "unknown" }],
    ["gift", { capitalAsset: "home" }],
  ]) assert.equal(validateTaxComparisonInput({ version: 1, track, values, confirmed: false }), null);
});

test("explicit chat topics choose new forms without inferring price, heir allocation or eligibility", () => {
  const source = { id: "tax-topic", role: "user" as const, text: "주택 양도, 가업상속", created_at: "2026-09-08T09:00:00Z" };
  for (const topic of ["주택 양도", "가업상속"]) {
    const state = applyChatPatches({ ...createChatState(), messages: [source] }, [{ key: "topic", value: topic, evidence: topic }], source.id);
    const input = createTaxInputFromChat(state);
    if (topic === "주택 양도") {
      assert.equal(input.values.capitalAsset, "home");
      assert.equal(input.values.salePrice, undefined);
      assert.equal(input.values.singleHomeSpecial, undefined);
    } else {
      assert.equal(input.values.businessMethod, "inheritance");
      assert.equal(input.values.inheritedBusinessValue, undefined);
      assert.equal(input.values.businessValue, undefined);
      assert.equal(input.values.eligibilityConfirmed, undefined);
    }
    assert.equal(input.values.standardCase, undefined);
    assert.equal(input.values.resident, undefined);
  }
});

test("total children are not silently treated as adult heirs", () => {
  const message = { id: "age-source", role: "user" as const, text: "자녀 3명, 성년 자녀 2명", created_at: "2026-09-08T09:00:00Z" };
  const state = applyChatPatches({ ...createChatState(), messages: [message] }, [{ key: "children", value: "자녀 3명", evidence: "자녀 3명" }], message.id);
  assert.equal(createTaxInputFromChat(state).values.children, undefined);
  const updated = applyChatPatches(state, [{ key: "adultChildren", value: "성년 자녀 2명", evidence: "성년 자녀 2명" }], message.id);
  assert.equal(createTaxInputFromChat(updated).values.children, "2");
});

test("new business estimates default to inheritance while explicit business gifts stay gifts", () => {
  const empty = createTaxInputFromChat(createChatState(), "business_succession");
  assert.equal(empty.values.businessMethod, "inheritance");
  assert.equal(empty.values.eligibilityConfirmed, undefined);
  const message = { id: "business-source", role: "user" as const, text: "가업주식 증여", created_at: "2026-09-08T09:00:00Z" };
  const state = applyChatPatches({ ...createChatState(), messages: [message] }, [{ key: "topic", value: message.text, evidence: message.text }], message.id);
  assert.equal(createTaxInputFromChat(state).values.businessMethod, "gift");
});

test("customer and CLI estimate handoff requires a ready confirmed calculation", () => {
  const now = "2026-09-08T09:00:00Z";
  const message = { id: "handoff-source", role: "user" as const, text: "본인 명의 예금 3억", created_at: now };
  const state = applyChatPatches({ ...createChatState(), messages: [message] }, [
    { key: "owner", value: "본인 명의", evidence: "본인 명의" },
    { key: "financialAssets", value: "예금 3억", evidence: "예금 3억" },
  ], message.id);
  const confirmation = { confirmed: true as const, confirmedAt: now, assessmentId: "AS360-ESTIMATE-GATE" };
  assert.throws(() => buildConfirmedTaxAssessmentSnapshot(state, gift, confirmation), /확인/);
  const incomplete = { ...gift, confirmed: true, confirmedAt: now, values: { ...gift.values, recipientCount: "" } };
  assert.throws(() => buildConfirmedTaxAssessmentSnapshot(state, incomplete, confirmation));
  const ready = buildConfirmedTaxAssessmentSnapshot(state, { ...gift, confirmed: true, confirmedAt: now }, confirmation);
  assert.equal(ready.assessment_id, confirmation.assessmentId);
  assert.equal(calculateTaxComparison(ready.taxComparisonInput!).baseline?.totalTaxWon, 38_800_000);
  assert.equal(ready.conversation?.raw_inputs[0], message.text);
});
