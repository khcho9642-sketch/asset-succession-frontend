import test from "node:test";
import assert from "node:assert/strict";
import { calculateInheritanceTax as inh, calculateGiftTax as gift, calculateCapitalGainsTax as capital, fullYearsBetween } from "../lib/simple-calculator";
import type { InheritanceInput, GiftInput, CapitalGainsInput, SimpleCalculationResult } from "../lib/simple-calculator";

const I: InheritanceInput = {
  deathDate: "2026-09-16", spouse: "yes", spouseSoleHeir: false, childrenCount: 2,
  minorDeductionWon: 0, seniorCount: 0, disabledDeductionWon: 0,
  realEstateWon: 1_200_000_000, financialAssetsWon: 200_000_000, otherAssetsWon: 100_000_000,
  deemedAssetsWon: 0, nonTaxableWon: 0, priorGiftSpouseWon: 0, priorGiftHeirsWon: 0, priorGiftOthersWon: 0,
  debtWon: 100_000_000, financialDebtWon: 100_000_000, publicChargesWon: 0,
  funeralWon: 8_000_000, burialWon: 0, spouseActualInheritanceWon: 500_000_000,
  statutoryShareNumerator: 3, statutoryShareDenominator: 7, spousePriorGiftTaxableWon: 0,
};
const G: GiftInput = {
  giftDate: "2026-09-16", resident: "yes", relationship: "linealAscendantAdult",
  amountWon: 50_000_000, debtAssumedWon: 0, priorGiftWon: 50_000_000,
  priorGiftDeductionWon: 50_000_000, otherGiftDeductionWon: 0, appraisalFeeWon: 0,
  marriageBirthDeductionWon: 0, previousTaxPaidWon: 0, generationSkip: false, minorOverTwoBillion: false,
};
const H: CapitalGainsInput = {
  transferDate: "2026-09-16", acquisitionDate: "2016-09-15", assetType: "oneHome",
  salePriceWon: 900_000_000, purchasePriceWon: 600_000_000, necessaryExpenseWon: 30_000_000,
  otherCapitalGainWon: 0, basicDeductionUsedWon: 0, residenceYears: 10, homeCount: 1,
  resident: "yes", homeOwnership: "solePurchased", householdOtherRights: "no",
  regulatedAtAcquisition: "no", homeSpecialConditions: "no", regulatedArea: false,
};
function line(result: SimpleCalculationResult, label: string) {
  const found = result.lines.find(item => item.label.startsWith(label));
  assert.ok(found, label);
  return found.amountWon;
}
test("review C01: financial debt changes deduction, not the single debt subtraction", () => {
  const r = inh(I);
  assert.equal(r.status, "ready");
  assert.equal(line(r, "금융재산 상속공제"), -20_000_000);
  assert.equal(line(r, "채무·공과금 차감"), -100_000_000);
  assert.equal(line(r, "상속세 과세가액"), 1_392_000_000);
  assert.equal(r.totalTaxWon, 62_468_000);
  assert.deepEqual(r.unsupported, []);
  assert.ok(r.scopeNotes.length);
});
for (const [assets, debt, expected] of [
  [0,0,0], [19_999_999,0,19_999_999], [20_000_000,0,20_000_000], [20_000_001,0,20_000_000],
  [100_000_000,0,20_000_000], [100_000_005,0,20_000_001], [1_000_000_000,0,200_000_000],
  [1_000_000_005,0,200_000_000], [200_000_000,250_000_000,0],
]) test(`financial deduction boundary ${assets}/${debt}`, () => {
  const r = inh({ ...I, financialAssetsWon: assets, debtWon: debt, financialDebtWon: debt });
  assert.equal(r.status, "ready");
  assert.equal(Math.abs(line(r, "금융재산 상속공제")), expected);
});
for (const value of [null, -1, 100_000_001]) test(`financial debt invalid/unknown ${value}`, () => {
  const r = inh({ ...I, financialDebtWon: value });
  assert.equal(r.status, "needs_info");
  assert.equal(r.lines.length, 0);
});
test("review C02: same-donor past deduction is retained on aggregation", () => {
  const r = gift(G);
  assert.equal(r.status, "ready");
  assert.equal(r.taxableBaseWon, 50_000_000);
  assert.equal(r.totalTaxWon, 4_850_000);
  assert.equal(line(r, "직계존속"), -50_000_000);
});
test("other donor consumed deduction is not restored", () => {
  const r = gift({ ...G, priorGiftWon: 0, priorGiftDeductionWon: 0, otherGiftDeductionWon: 50_000_000 });
  assert.equal(r.totalTaxWon, 4_850_000);
  assert.equal(Math.abs(line(r, "직계존속")), 0);
});
test("same and other donor deductions share one limit", () => {
  const r = gift({ ...G, priorGiftWon: 20_000_000, priorGiftDeductionWon: 20_000_000, otherGiftDeductionWon: 30_000_000 });
  assert.equal(r.totalTaxWon, 4_850_000);
  assert.equal(line(r, "직계존속"), -20_000_000);
});
test("overlapping deduction above limit rejected", () => {
  assert.equal(gift({ ...G, otherGiftDeductionWon: 1 }).status, "needs_info");
});
for (const prior of [9_999_999,10_000_000]) test(`gift aggregation threshold ${prior}`, () => {
  const r = gift({ ...G, priorGiftWon: prior, priorGiftDeductionWon: 0, otherGiftDeductionWon: 50_000_000 });
  assert.equal(line(r, "최근 10년"), prior >= 10_000_000 ? prior : 0);
});
test("previous tax credit capped by prior taxable base share", () => {
  const r = gift({ ...G, priorGiftWon: 100_000_000, previousTaxPaidWon: 999_999_999 });
  assert.equal(line(r, "종전 증여"), -5_000_000);
  assert.equal(r.totalTaxWon, 4_850_000);
});
test("previously unclaimed deduction apportioned for credit cap", () => {
  const r = gift({ ...G, priorGiftDeductionWon: 0, previousTaxPaidWon: 999_999_999 });
  assert.equal(line(r, "종전 증여"), -2_500_000);
});
test("unknown past deduction is not zero", () => {
  assert.equal(gift({ ...G, priorGiftDeductionWon: null }).status, "needs_info");
});
test("prior gift combined with special deductions explicitly unsupported", () => {
  assert.equal(gift({ ...G, marriageBirthDeductionWon: 100_000_000 }).status, "unsupported");
});
test("review C03: qualified single home below threshold is exempt", () => {
  const r = capital(H);
  assert.equal(r.status, "ready");
  assert.equal(r.totalTaxWon, 0);
  assert.equal(line(r, "1세대 1주택"), -270_000_000);
  assert.deepEqual(r.unsupported, []);
});
test("NTS public high-price example dated 2022-01-03", () => {
  const r = capital({ ...H, acquisitionDate: "2006-05-07", transferDate: "2022-01-03",
    salePriceWon: 1_500_000_000, purchasePriceWon: 800_000_000, necessaryExpenseWon: 30_000_000 });
  assert.equal(r.status, "ready");
  assert.equal(line(r, "양도차익"), 670_000_000);
  assert.equal(line(r, "과세대상 양도차익"), 134_000_000);
  assert.equal(line(r, "장기보유특별공제"), -107_200_000);
  assert.equal(r.taxableBaseWon, 24_300_000);
  assert.equal(r.nationalTaxWon, 2_565_000);
});
test("NTS 2022 booklet example uses historical rates", () => {
  const r = capital({ ...H, acquisitionDate: "2010-01-10", transferDate: "2022-01-15",
    salePriceWon: 1_500_000_000, purchasePriceWon: 500_000_000, necessaryExpenseWon: 50_000_000, residenceYears: 12 });
  assert.equal(r.status, "ready");
  assert.equal(r.taxableBaseWon, 35_500_000);
  assert.equal(r.nationalTaxWon, 4_245_000);
});
for (const sale of [1_199_999_999,1_200_000_000,1_200_000_001]) test(`home price threshold ${sale}`, () => {
  const r = capital({ ...H, salePriceWon: sale });
  const expected = Number(BigInt(sale - 630_000_000) * BigInt(Math.max(0, sale - 1_200_000_000)) / BigInt(sale));
  assert.equal(line(r, "과세대상 양도차익"), expected);
});
test("regulated acquisition requires residence, not just home count", () => {
  const input = { ...H, acquisitionDate: "2018-09-16", residenceYears: 0, regulatedAtAcquisition: "yes" as const };
  assert.ok(capital(input).totalTaxWon > 0);
  assert.equal(capital({ ...input, residenceYears: 2 }).totalTaxWon, 0);
});
test("two-year holding boundary changes eligibility", () => {
  const input = { ...H, acquisitionDate: "2024-09-17", residenceYears: 0 };
  assert.equal(capital(input).nationalTaxWon, 160_500_000);
  assert.equal(capital({ ...input, acquisitionDate: "2024-09-16" }).totalTaxWon, 0);
});
test("housing less than one year uses 70 percent", () => {
  assert.equal(capital({ ...H, acquisitionDate: "2026-01-01", residenceYears: 0 }).nationalTaxWon, 187_250_000);
});
for (const key of ["householdOtherRights","regulatedAtAcquisition","homeSpecialConditions"] as const) {
  test(`unknown home condition ${key} blocks`, () => {
    const r = capital({ ...H, [key]: "unknown" });
    assert.equal(r.status, "needs_info");
    assert.equal(r.lines.length, 0);
  });
}
for (const change of [
  { homeCount: 2 }, { homeOwnership: "other" as const }, { householdOtherRights: "yes" as const },
  { homeSpecialConditions: "yes" as const }, { resident: "no" as const },
]) test(`unsupported home condition ${JSON.stringify(change)}`, () => {
  assert.equal(capital({ ...H, ...change }).status, "unsupported");
});
test("invalid calendar dates and unverified future dates blocked", () => {
  assert.equal(fullYearsBetween("2026-02-30", "2026-09-16"), null);
  assert.equal(capital({ ...H, transferDate: "2027-01-01" }).status, "unsupported");
  assert.equal(inh({ ...I, deathDate: "2026-02-30" }).status, "needs_info");
});
