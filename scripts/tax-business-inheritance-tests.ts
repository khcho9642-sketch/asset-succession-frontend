import assert from "node:assert/strict";
import test from "node:test";
import { compareBusinessInheritance } from "../lib/tax-comparison/business-inheritance";
import type { TaxCase, TaxComparisonInput } from "../lib/tax-comparison/types";

function business(values: Record<string, string> = {}): TaxComparisonInput {
  return { version: 1, track: "business_succession", confirmed: true, values: {
    businessMethod: "inheritance", resident: "yes", standardCase: "yes", eligibilityConfirmed: "yes",
    estate: "100", debt: "0", financial: "0", financialDebt: "0", funeral: "0.05", spouse: "no", children: "2",
    businessPropertyType: "corporate", inheritedBusinessValue: "80", businessEligiblePercent: "100", businessYears: "10", companySize: "small", ...values,
  } };
}

function line(taxCase: TaxCase | null, label: string): number | undefined {
  return taxCase?.lines.find((item) => item.label === label)?.amountWon;
}

test("100억원 estate with 80억원 eligible company: independently calculated first-event tax", () => {
  const result = compareBusinessInheritance(business());
  assert.equal(result.status, "ready");
  assert.equal(result.track, "business_succession");
  assert.equal(result.baseline?.taxableWon, 9_495_000_000);
  assert.equal(result.baseline?.grossTaxWon, 4_287_500_000);
  assert.equal(result.baseline?.totalTaxWon, 4_158_875_000);
  const alternative = result.alternatives[0];
  assert.equal(alternative.taxableWon, 1_495_000_000);
  assert.equal(alternative.grossTaxWon, 438_000_000);
  assert.equal(alternative.creditWon, 13_140_000);
  assert.equal(alternative.totalTaxWon, 424_860_000);
  assert.equal(result.baseline!.totalTaxWon - alternative.totalTaxWon, 3_734_015_000);
  assert.equal(line(alternative, "일괄공제"), 500_000_000);
  assert.equal(line(alternative, "가업상속공제"), 8_000_000_000);
  assert.equal(line(alternative, "상속공제 적용 합계"), 8_500_000_000);
});

test("spouse actual 20억원 remains the same in both cases and deduction is additive", () => {
  const result = compareBusinessInheritance(business({ spouse: "yes", spouseInheritance: "20" }));
  assert.equal(result.status, "ready");
  assert.equal(result.baseline?.totalTaxWon, 3_188_875_000);
  assert.equal(result.alternatives[0].totalTaxWon, 0);
  for (const taxCase of [result.baseline!, result.alternatives[0]]) {
    assert.equal(line(taxCase, "입력한 배우자 상속액"), 2_000_000_000);
    assert.equal(line(taxCase, "배우자 상속공제"), 2_000_000_000);
  }
  assert.equal(line(result.alternatives[0], "상속공제 적용 합계"), 9_995_000_000);
  assert.equal(result.alternatives[0].taxableWon, 0);
  assert.ok(result.alternatives[0].lines.length <= 13);
});

test("explicit zero spouse inheritance preserves 5억원 minimum without fabricating actual allocation", () => {
  const result = compareBusinessInheritance(business({ spouse: "yes", spouseInheritance: "0" }));
  assert.equal(result.status, "ready");
  for (const taxCase of [result.baseline!, result.alternatives[0]]) {
    assert.equal(line(taxCase, "입력한 배우자 상속액"), 0);
    assert.equal(line(taxCase, "배우자 상속공제"), 500_000_000);
  }
  const blank = compareBusinessInheritance(business({ spouse: "yes", spouseInheritance: "" }));
  assert.equal(blank.status, "needs_info");
  assert.equal(blank.baseline, null);
});

test("preexisting ordinary wizard spouseAllocation cannot change the confirmed business allocation", () => {
  const result = compareBusinessInheritance(business({ spouse: "yes", spouseInheritance: "20", spouseAllocation: "5" }));
  assert.equal(line(result.baseline, "입력한 배우자 상속액"), 2_000_000_000);
  assert.equal(line(result.alternatives[0], "배우자 상속공제"), 2_000_000_000);
});

test("corporate eligible portion is calculated before the 300억원 cap, excess remains taxable", () => {
  const result = compareBusinessInheritance(business({ estate: "500", inheritedBusinessValue: "450", businessEligiblePercent: "80" }));
  assert.equal(result.status, "ready");
  assert.equal(result.baseline?.totalTaxWon, 23_558_875_000);
  assert.equal(line(result.alternatives[0], "가업상속공제 대상 재산"), 36_000_000_000);
  assert.equal(line(result.alternatives[0], "가업상속공제"), 30_000_000_000);
  assert.equal(result.alternatives[0].taxableWon, 19_495_000_000);
  assert.equal(result.alternatives[0].totalTaxWon, 9_008_875_000);
});

test("10/20/30-year statutory cap boundaries apply without excluding an estate above the cap", () => {
  for (const [businessYears, deduction] of [["10", 300], ["19", 300], ["20", 400], ["29", 400], ["30", 600], ["99", 600]] as const) {
    const result = compareBusinessInheritance(business({ estate: "700", inheritedBusinessValue: "650", businessYears }));
    assert.equal(result.status, "ready", businessYears);
    assert.equal(line(result.alternatives[0], "가업상속공제"), deduction * 100_000_000, businessYears);
  }
});

test("partial corporate percentage uses exact integer basis points, including one-won residue", () => {
  const result = compareBusinessInheritance(business({ inheritedBusinessValue: "80.00000001", businessEligiblePercent: "33.33" }));
  assert.equal(result.status, "ready");
  assert.equal(line(result.alternatives[0], "가업상속공제 대상 재산"), 2_666_400_000);
  const zero = compareBusinessInheritance(business({ businessEligiblePercent: "0" }));
  assert.equal(zero.status, "ready");
  assert.equal(zero.alternatives[0].totalTaxWon, zero.baseline?.totalTaxWon);
});

test("sole business value removes secured debt once from its deduction and total debt once from estate", () => {
  const result = compareBusinessInheritance(business({ businessPropertyType: "sole", debt: "10", businessSecuredDebt: "10" }));
  assert.equal(result.status, "ready");
  assert.equal(line(result.baseline, "차감: 공과금·채무"), 1_000_000_000);
  assert.equal(line(result.alternatives[0], "가업상속공제 대상 재산"), 7_000_000_000);
  assert.equal(result.alternatives[0].taxableWon, 1_495_000_000);
  assert.equal(result.alternatives[0].totalTaxWon, 424_860_000);
});

test("sole business zero secured debt must be explicit and irrelevant corporate ratio is ignored", () => {
  const result = compareBusinessInheritance(business({ businessPropertyType: "sole", businessSecuredDebt: "0", businessEligiblePercent: "unknown" }));
  assert.equal(result.status, "ready");
  assert.equal(result.alternatives[0].totalTaxWon, 424_860_000);
  const missing = compareBusinessInheritance(business({ businessPropertyType: "sole" }));
  assert.equal(missing.status, "needs_info");
  assert.equal(missing.baseline, null);
});

test("financial and personal deductions survive business deduction subject to total-estate cap", () => {
  const result = compareBusinessInheritance(business({ financial: "10", children: "8" }));
  assert.equal(result.status, "ready");
  for (const taxCase of [result.baseline!, result.alternatives[0]]) {
    assert.equal(line(taxCase, "기초·자녀 공제"), 600_000_000);
    assert.equal(line(taxCase, "금융재산 상속공제"), 200_000_000);
  }
  assert.equal(result.alternatives[0].taxableWon, 1_195_000_000);
  assert.equal(result.alternatives[0].totalTaxWon, 308_460_000);
});

test("medium company requires actual heir-level inputs and accepts exact 2x boundary", () => {
  const result = compareBusinessInheritance(business({ companySize: "medium", successorOtherNetAssets: "20", successorTaxWithoutDeduction: "10" }));
  assert.equal(result.status, "ready");
  assert.equal(result.alternatives[0].totalTaxWon, 424_860_000);
  const failed = compareBusinessInheritance(business({ companySize: "medium", inheritedBusinessValue: "60", successorOtherNetAssets: "20.00000001", successorTaxWithoutDeduction: "10" }));
  assert.equal(failed.status, "unsupported");
  assert.equal(failed.baseline, null);
  assert.deepEqual(failed.alternatives, []);
});

test("medium company does not substitute whole-estate tax for unknown successor tax", () => {
  for (const values of [{ companySize: "medium" }, { companySize: "medium", successorOtherNetAssets: "1", successorTaxWithoutDeduction: "" }, { companySize: "medium", successorOtherNetAssets: "", successorTaxWithoutDeduction: "10" }, { companySize: "medium", successorOtherNetAssets: "0", successorTaxWithoutDeduction: "50" }] as Array<Record<string, string>>) {
    const result = compareBusinessInheritance(business(values));
    assert.equal(result.status, "needs_info", JSON.stringify(values));
    assert.equal(result.baseline, null);
  }
  const zero = compareBusinessInheritance(business({ companySize: "medium", successorOtherNetAssets: "0", successorTaxWithoutDeduction: "0" }));
  assert.equal(zero.status, "ready");
});

test("small company does not require the medium-company liquidity test", () => {
  const result = compareBusinessInheritance(business({ successorOtherNetAssets: "unknown", successorTaxWithoutDeduction: "unknown" }));
  assert.equal(result.status, "ready");
});

test("medium heir-liability ceiling is gross assessed tax before the 3% filing credit", () => {
  const result = compareBusinessInheritance(business({ companySize: "medium", successorOtherNetAssets: "0", successorTaxWithoutDeduction: "42" }));
  assert.equal(result.status, "ready");
  assert.ok(4_200_000_000 > result.baseline!.totalTaxWon);
  assert.ok(4_200_000_000 < result.baseline!.grossTaxWon);
  assert.ok(result.assumptions.some((message) => message.includes("신고세액공제 전 산출세액")));
});

test("medium other assets reconcile with non-business share fraction and available estate property", () => {
  const values = { companySize: "medium", businessEligiblePercent: "80", successorTaxWithoutDeduction: "20" };
  for (const successorOtherNetAssets of ["16", "36"]) {
    assert.equal(compareBusinessInheritance(business({ ...values, successorOtherNetAssets })).status, "ready");
  }
  for (const successorOtherNetAssets of ["0", "15.99999999", "36.00000001"]) {
    const result = compareBusinessInheritance(business({ ...values, successorOtherNetAssets }));
    assert.equal(result.status, "needs_info");
    assert.equal(result.baseline, null);
    assert.ok(result.missing.some((message) => message.includes("비사업용자산")));
  }
  // Debt includes public charges: do not incorrectly deduct that aggregate from
  // the legally narrower successor-other-assets upper bound.
  const publicCharges = compareBusinessInheritance(business({ ...values, debt: "5", successorOtherNetAssets: "36" }));
  assert.equal(publicCharges.status, "ready");
  const spouseMismatch = compareBusinessInheritance(business({ ...values, spouse: "yes", spouseInheritance: "20", successorOtherNetAssets: "17" }));
  assert.equal(spouseMismatch.status, "needs_info");
});

test("business and financial property, spouse allocation and debt must reconcile", () => {
  for (const values of [
    { inheritedBusinessValue: "101" }, { financial: "21" },
    { businessPropertyType: "sole", businessSecuredDebt: "1", debt: "0" },
    { businessPropertyType: "sole", inheritedBusinessValue: "5", businessSecuredDebt: "6", debt: "6" },
    { spouse: "yes", spouseInheritance: "21" },
    { spouse: "yes", spouseInheritance: "20", debt: "1" },
    { spouse: "no", spouseInheritance: "0" },
  ] as Array<Record<string, string>>) {
    const result = compareBusinessInheritance(business(values));
    assert.equal(result.status, "needs_info", JSON.stringify(values));
    assert.equal(result.baseline, null);
    assert.deepEqual(result.alternatives, []);
  }
  const sole = compareBusinessInheritance(business({ businessPropertyType: "sole", debt: "10", businessSecuredDebt: "10", spouse: "yes", spouseInheritance: "20" }));
  assert.equal(sole.status, "ready");
});

test("missing, malformed and unconfirmed eligibility inputs never become a fabricated zero tax", () => {
  for (const values of [
    { inheritedBusinessValue: "" }, { inheritedBusinessValue: "unknown" }, { inheritedBusinessValue: "-1" },
    { businessEligiblePercent: "100.01" }, { businessEligiblePercent: "-1" }, { businessEligiblePercent: "33.333" },
    { businessEligiblePercent: "1e2" }, { businessEligiblePercent: "" },
    { businessYears: "9" }, { businessYears: "10.5" }, { businessYears: "" },
    { businessPropertyType: "" }, { companySize: "" }, { eligibilityConfirmed: "" },
    { resident: "" }, { standardCase: "" }, { debt: "" }, { funeral: "" }, { financial: "" }, { financialDebt: "" },
  ] as Array<Record<string, string>>) {
    const result = compareBusinessInheritance(business(values));
    assert.equal(result.status, "needs_info", JSON.stringify(values));
    assert.equal(result.baseline, null);
    assert.deepEqual(result.alternatives, []);
  }
  for (const values of [{ eligibilityConfirmed: "no" }, { resident: "no" }, { standardCase: "no" }] as Array<Record<string, string>>) {
    const result = compareBusinessInheritance(business(values));
    assert.equal(result.status, "unsupported");
    assert.equal(result.baseline, null);
  }
});

test("first-event output discloses valuation, eligibility, post-management and future-tax limits", () => {
  const result = compareBusinessInheritance(business());
  assert.ok(result.assumptions.some((value) => value.includes("법정 평가액")));
  assert.ok(result.assumptions.some((value) => value.includes("사후관리")));
  assert.ok(result.exclusions.some((value) => value.includes("생애 전체 세금")));
  assert.ok(result.references.some((value) => value.label.includes("제18조의2")));
  for (const taxCase of [result.baseline!, result.alternatives[0]]) {
    assert.ok(taxCase.lines.length <= 13);
    assert.equal(taxCase.localTaxWon, 0);
    assert.ok(Number.isSafeInteger(taxCase.totalTaxWon));
  }
});
