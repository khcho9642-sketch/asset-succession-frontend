import test from "node:test";
import assert from "node:assert/strict";
import { ordinaryTax, parseAmountWon } from "../lib/tax-comparison/common";
import { calculateTaxComparison, validateTaxComparisonInput } from "../lib/tax-comparison";
import { attachConfirmedTaxComparison, createTaxInputFromChat } from "../lib/chat/tax";
import { createChatState, applyChatPatches } from "../lib/chat/intake";
import { createDemoAssessmentSnapshot } from "../lib/assessment";
import type { TaxComparisonInput } from "../lib/tax-comparison/types";

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
