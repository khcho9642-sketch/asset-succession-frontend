import assert from "node:assert/strict";
import test from "node:test";
import type { AssessmentSnapshot } from "../lib/assessment";
import { createTaxInputFromSnapshot } from "../lib/chat/tax-snapshot";
import { calculateTaxComparison } from "../lib/tax-comparison";

function snapshot52(): AssessmentSnapshot {
  return {
    assessment_id: "AS360-20260908-SNAPSHOT52", created_at: "2026-09-08T09:00:00Z", review_focus: [],
    answers: {
      purpose: { label: "준비 목적", choices: ["상속"], detail: "상속" },
      assets: { label: "자산", choices: ["부동산", "금융자산"],
        assetAmounts: { 부동산: "40", 금융자산: "12" },
        assetAmountWons: { 부동산: 4_000_000_000, 금융자산: 1_200_000_000 },
        assetAmountStatus: { 부동산: "confirmed", 금융자산: "confirmed" },
        facts: { "소유자 관계": "아버지 명의", "부동산 원문": "건물 25억, 아파트 15억", "금융자산 원문": "예금 12억" } },
      family: { label: "가족", choices: [], facts: { "배우자 유무": "있음", "자녀 수": "3명" } },
      debt: { label: "채무·과거 증여", choices: ["해당 없음"], facts: { "채무 여부": "없음", "과거 증여 상세": "모르겠어요" } },
    },
  };
}

test("52억원 snapshot seeds known estate and spouse while missing tax conditions remain missing", () => {
  const snapshot = snapshot52();
  const before = JSON.stringify(snapshot);
  const input = createTaxInputFromSnapshot(snapshot);
  assert.equal(input.track, "inheritance");
  assert.equal(input.confirmed, false);
  assert.equal(calculateTaxComparison(input).status, "needs_info");
  assert.equal(input.values.children, undefined, "total three children does not confirm three adult heirs");
  for (const key of ["resident", "standardCase", "availableCash", "funeral", "eligibilityConfirmed"]) assert.equal(input.values[key], undefined, key);
  assert.deepEqual(input.values, { estate: "52", financial: "12", debt: "0", financialDebt: "0", spouse: "yes" });
  assert.equal(JSON.stringify(snapshot), before);
  assert.equal(snapshot.answers.debt.facts?.["과거 증여 상세"], "모르겠어요");
});

test("gift and capital tracks do not repurpose an estate or bank balance as a transaction amount", () => {
  for (const track of ["gift", "capital_gains"] as const) {
    const input = createTaxInputFromSnapshot(snapshot52(), track);
    assert.equal(input.track, track);
    assert.deepEqual(input.values, {});
    assert.equal(calculateTaxComparison(input).status, "needs_info");
  }
});

test("new business track opens business inheritance without assuming eligibility or business value", () => {
  const input = createTaxInputFromSnapshot(snapshot52(), "business_succession");
  assert.equal(input.values.businessMethod, "inheritance");
  assert.equal(input.values.estate, "52");
  for (const key of ["inheritedBusinessValue", "businessValue", "businessEligiblePercent", "companySize", "businessYears", "eligibilityConfirmed", "spouseInheritance"]) assert.equal(input.values[key], undefined, key);
});

test("valid existing same-track input preserves explicit subtype and amounts but needs new confirmation", () => {
  const snapshot = snapshot52();
  snapshot.taxComparisonInput = { version: 1, track: "business_succession", confirmed: true, confirmedAt: "2026-09-08T09:00:00Z", values: { businessMethod: "gift", businessValue: "7.00000001", businessYears: "20", resident: "yes", standardCase: "yes" } };
  const input = createTaxInputFromSnapshot(snapshot);
  assert.deepEqual(input.values, snapshot.taxComparisonInput.values);
  assert.equal(input.confirmed, false);
  assert.equal(input.confirmedAt, undefined);
  input.values.businessValue = "8";
  assert.equal(snapshot.taxComparisonInput.values.businessValue, "7.00000001");
  assert.deepEqual(createTaxInputFromSnapshot(snapshot, "gift").values, {});
});

test("unknown, ranged, inconsistent and unselected asset values never silently join the estate", () => {
  for (const status of ["unknown", "range", "needs_confirmation"] as const) {
    const snapshot = snapshot52();
    snapshot.answers.assets.assetAmountStatus!.부동산 = status;
    assert.equal(createTaxInputFromSnapshot(snapshot).values.estate, undefined, status);
    assert.equal(createTaxInputFromSnapshot(snapshot).values.financial, "12");
  }
  const conflicting = snapshot52();
  conflicting.answers.assets.assetAmountWons!.부동산 = 2_500_000_000;
  assert.equal(createTaxInputFromSnapshot(conflicting).values.estate, undefined);
  const unselected = snapshot52();
  unselected.answers.assets.assetAmounts!.법인지분 = "200";
  unselected.answers.assets.assetAmountWons!.법인지분 = 20_000_000_000;
  assert.equal(createTaxInputFromSnapshot(unselected).values.estate, "52");
});

test("adult count is seeded only from an exact adult count, never an open-ended range", () => {
  const snapshot = snapshot52();
  snapshot.answers.family.facts!["성년 자녀 수"] = "3명";
  assert.equal(createTaxInputFromSnapshot(snapshot).values.children, "3");
  snapshot.answers.family.facts!["성년 자녀 수"] = "3명 이상";
  assert.equal(createTaxInputFromSnapshot(snapshot).values.children, undefined);
});

test("missing debts are not zero; a confirmed mortgage is not automatically all financial debt", () => {
  const snapshot = snapshot52();
  delete snapshot.answers.debt;
  assert.equal(createTaxInputFromSnapshot(snapshot).values.debt, undefined);
  snapshot.answers.debt = { label: "채무", choices: ["담보대출 있음"], debtAmounts: { "담보대출 있음": "2" }, debtAmountWons: { "담보대출 있음": 200_000_000 } };
  const input = createTaxInputFromSnapshot(snapshot);
  assert.equal(input.values.debt, "2");
  assert.equal(input.values.financialDebt, undefined);
});

test("purpose infers business inheritance and explicit home sale without pricing either asset", () => {
  const snapshot = snapshot52();
  snapshot.answers.purpose = { label: "준비 목적", choices: ["가업·회사 승계"], detail: "가업상속" };
  assert.equal(createTaxInputFromSnapshot(snapshot).values.businessMethod, "inheritance");
  snapshot.answers.purpose = { label: "준비 목적", choices: ["가업·회사 승계"], detail: "가업주식 증여" };
  const businessGift = createTaxInputFromSnapshot(snapshot);
  assert.equal(businessGift.track, "business_succession");
  assert.deepEqual(businessGift.values, { businessMethod: "gift" });
  snapshot.answers.purpose = { label: "준비 목적", choices: ["양도"], detail: "주택 양도" };
  assert.deepEqual(createTaxInputFromSnapshot(snapshot).values, { capitalAsset: "home" });
});
