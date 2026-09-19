import test from "node:test";
import assert from "node:assert/strict";
import { calculateInheritanceTax as inh, calculateGiftTax as gift, calculateCapitalGainsTax as capital, fullYearsBetween } from "../lib/simple-calculator";
import type { InheritanceInput, GiftInput, CapitalGainsInput, SimpleCalculationResult } from "../lib/simple-calculator";

const I: InheritanceInput = {
  deathDate: "2026-09-16", spouse: "yes", spouseSoleHeir: false, childrenCount: 2,
  minorDeductionWon: 0, seniorCount: 0, disabledDeductionWon: 0,
  realEstateWon: 1_200_000_000, financialAssetsWon: 200_000_000, financialExclusionsWon: 0, otherAssetsWon: 100_000_000,
  deemedAssetsWon: 0, nonTaxableWon: 0, priorGiftSpouseWon: 0, priorGiftHeirsWon: 0, priorGiftOthersWon: 0,
  debtWon: 100_000_000, financialDebtWon: 100_000_000, publicChargesWon: 0,
  funeralWon: 8_000_000, burialWon: 0, spouseActualInheritanceWon: 500_000_000,
  statutoryShareNumerator: 3, statutoryShareDenominator: 7, spousePriorGiftTaxableWon: 0,
  priorGifts: [],
};
const G: GiftInput = {
  priorGiftMarriageBirthStatus: "no",
  giftDate: "2026-09-16", resident: "yes", relationship: "linealAscendantAdult",
  amountWon: 50_000_000, debtAssumedWon: 0, priorGiftWon: 50_000_000,
  priorGiftDeductionWon: 50_000_000, otherGiftDeductionWon: 0, appraisalFeeWon: 0,
  marriageBirthDeductionWon: 0, previousTaxPaidWon: 0, generationSkip: false, minorOverTwoBillion: false,
  marriageBirthPreviouslyUsedWon: 0, marriageBirthEvent: null, marriageBirthEventDate: null,
};
const H: CapitalGainsInput = {
  transferDate: "2026-09-16", acquisitionDate: "2016-09-15", assetType: "oneHome",
  salePriceWon: 900_000_000, purchasePriceWon: 600_000_000, necessaryExpenseWon: 30_000_000,
  otherCapitalGainWon: 0, basicDeductionUsedWon: 0, residenceYears: 10, homeCount: 1,
  resident: "yes", homeOwnership: "solePurchased", householdOtherRights: "no",
  regulatedAtAcquisition: "no", homeSpecialConditions: "no", regulatedArea: false,
  annualAggregation: false, otherGainsGeneralRate: null, previousNationalTaxWon: 0, previousLocalTaxWon: 0,
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

test("2026-09-18 live comparison: retain the financial deduction absent from HomeTax simple output", () => {
  const r = inh({ ...I, financialDebtWon: 0 });
  assert.equal(r.status, "ready");
  assert.equal(line(r, "금융재산 상속공제"), -40_000_000);
  assert.equal(r.taxableBaseWon, 352_000_000);
  assert.equal(r.grossTaxWon, 60_400_000);
  assert.equal(r.creditWon, 1_812_000);
  assert.equal(r.nationalTaxWon, 58_588_000);
  // Observed HomeTax SIMPLE result, not an expected full-deduction tax amount.
  assert.equal(66_348_000 - r.nationalTaxWon, 7_760_000);
});

test("excluded financial property remains in the estate but receives no financial deduction", () => {
  const r = inh({ ...I, financialDebtWon: 0, financialExclusionsWon: 50_000_000 });
  assert.equal(r.status, "ready");
  assert.equal(line(r, "총 상속재산"), 1_500_000_000);
  assert.equal(line(r, "상속세 과세가액"), 1_392_000_000);
  assert.equal(line(r, "금융재산 상속공제"), -30_000_000);
  assert.equal(r.nationalTaxWon, 60_528_000);
});

test("all financial property excluded removes only that deduction", () => {
  const r = inh({ ...I, financialDebtWon: 0, financialExclusionsWon: 200_000_000 });
  assert.equal(r.status, "ready");
  assert.equal(Math.abs(line(r, "금융재산 상속공제")), 0);
  assert.equal(line(r, "총 상속재산"), 1_500_000_000);
  assert.equal(r.nationalTaxWon, 66_348_000);
});

test("financial exclusions and debt are separate from the estate debt subtraction", () => {
  const r = inh({ ...I, financialAssetsWon: 400_000_000, financialExclusionsWon: 150_000_000 });
  assert.equal(r.status, "ready");
  assert.equal(line(r, "금융재산 상속공제"), -30_000_000);
  assert.equal(line(r, "채무·공과금 차감"), -100_000_000);
  assert.equal(line(r, "상속세 과세가액"), 1_592_000_000);
});

for (const value of [null, undefined, -1, 200_000_001, 0.5]) test(`financial exclusions invalid/unknown ${value}`, () => {
  const r = inh({ ...I, financialExclusionsWon: value as number | null });
  assert.equal(r.status, "needs_info");
  assert.equal(r.lines.length, 0);
});

test("zero financial assets cannot contain excluded financial property", () => {
  const r = inh({ ...I, financialAssetsWon: 0, financialExclusionsWon: 1 });
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

const priorChildGift = { recipient: "child" as const, propertyKind: "cash" as const, amountWon: 100_000_000,
  taxableBaseWon: 50_000_000, calculatedTaxWon: 5_000_000, creditEligible: "yes" as const };
const IWithGift = { ...I, financialDebtWon: 0, priorGiftHeirsWon: 100_000_000, priorGifts: [priorChildGift] };
const marriage = { ...G, amountWon: 150_000_000, priorGiftWon: 0, priorGiftDeductionWon: 0,
  otherGiftDeductionWon: 50_000_000, marriageBirthDeductionWon: 100_000_000,
  marriageBirthEvent: "marriage" as const, marriageBirthEventDate: "2025-09-16", marriageBirthPreviouslyUsedWon: 60_000_000 };
const annual = { ...H, assetType: "generalBuilding" as const, annualAggregation: true,
  otherCapitalGainWon: 100_000_000, basicDeductionUsedWon: 2_500_000, otherGainsGeneralRate: "yes" as const,
  previousNationalTaxWon: 18_685_000, previousLocalTaxWon: 1_868_500 };

test("2026-09-19 inheritance prior gift credit precedes filing credit", () => {
  const r = inh(IWithGift);
  assert.equal(r.status, "ready");
  assert.equal(r.taxableBaseWon, 452_000_000);
  assert.equal(line(r, "사전증여 증여세액공제"), -5_000_000);
  assert.equal(line(r, "신고세액공제"), -2_262_000);
  assert.equal(r.nationalTaxWon, 73_138_000);
});
test("2026-09-19 inheritance missing gift returns cannot silently omit credit", () => {
  assert.equal(inh({ ...IWithGift, priorGifts: null }).status, "needs_info");
});
test("2026-09-19 expired inheritance gift does not receive a credit", () => {
  const r = inh({ ...IWithGift, priorGifts: [{ ...priorChildGift, creditEligible: "no" }] });
  assert.equal(r.status, "ready");
  assert.equal(r.nationalTaxWon, 77_988_000);
});
for (const change of [{ taxableBaseWon: null }, { calculatedTaxWon: null }, { creditEligible: "unknown" as const },
  { taxableBaseWon: 100_000_001 }, { calculatedTaxWon: 50_000_001 }]) {
  test(`2026-09-19 missing/invalid inheritance gift facts ${JSON.stringify(change)}`, () => {
    assert.equal(inh({ ...IWithGift, priorGifts: [{ ...priorChildGift, ...change }] }).status, "needs_info");
  });
}
test("2026-09-19 nonheir gift allocation is explicitly unsupported", () => {
  const r = inh({ ...IWithGift, priorGiftHeirsWon: 0, priorGiftOthersWon: 100_000_000,
    priorGifts: [{ ...priorChildGift, recipient: "other" }] });
  assert.equal(r.status, "unsupported");
  assert.equal(r.lines.length, 0);
});
test("2026-09-19 noncash and unconfirmed past gift valuation stay outside supported credit scope", () => {
  assert.equal(inh({ ...IWithGift, priorGifts: [{ ...priorChildGift, propertyKind: "other" }] }).status, "unsupported");
  assert.equal(inh({ ...IWithGift, priorGifts: [{ ...priorChildGift, propertyKind: null }] }).status, "needs_info");
});
test("2026-09-19 gift records must reconcile to estate aggregation", () => {
  assert.equal(inh({ ...IWithGift, priorGiftHeirsWon: 0 }).status, "needs_info");
});
test("2026-09-19 two child recipients each retain their reported gift tax", () => {
  const r = inh({ ...IWithGift, priorGiftHeirsWon: 200_000_000, priorGifts: [priorChildGift, priorChildGift] });
  assert.equal(r.status, "ready");
  assert.equal(line(r, "사전증여 증여세액공제"), -10_000_000);
  assert.equal(r.nationalTaxWon, 92_732_000);
});
test("2026-09-19 inheritance gift deduction limit activates only above 500m", () => {
  const input = { ...IWithGift, realEstateWon: 408_000_000, financialAssetsWon: 0, otherAssetsWon: 0,
    debtWon: 0, spouseActualInheritanceWon: 0 };
  assert.equal(inh(input).taxableBaseWon, 0);
  assert.equal(inh({ ...input, realEstateWon: 408_000_001 }).taxableBaseWon, 50_000_000);
});
test("2026-09-19 inheritance gift taxable base limits estate deductions", () => {
  const r = inh({ ...IWithGift, realEstateWon: 100_000_000, financialAssetsWon: 0, otherAssetsWon: 0,
    debtWon: 0, priorGiftHeirsWon: 500_000_000, spouseActualInheritanceWon: 0,
    priorGifts: [{ ...priorChildGift, amountWon: 500_000_000, taxableBaseWon: 450_000_000, calculatedTaxWon: 80_000_000 }] });
  assert.equal(r.status, "ready");
  assert.equal(r.taxableBaseWon, 450_000_000);
  assert.equal(line(r, "상속공제 적용 합계"), -142_000_000);
  assert.equal(r.nationalTaxWon, 0);
});
test("2026-09-19 spouse legal cap includes heir gifts and excludes nontaxable assets", () => {
  const r = inh({ ...IWithGift, priorGiftHeirsWon: 350_000_000, nonTaxableWon: 50_000_000,
    nonTaxableFinancialOverlap: "no",
    spouseActualInheritanceWon: 900_000_000,
    priorGifts: [{ ...priorChildGift, amountWon: 350_000_000, taxableBaseWon: 300_000_000, calculatedTaxWon: 50_000_000 }] });
  assert.equal(r.status, "ready");
  assert.equal(line(r, "배우자 상속공제"), -728_571_428);
});
test("2026-09-19 marriage allowance uses lifetime remaining amount", () => {
  const r = gift(marriage);
  assert.equal(r.status, "ready");
  assert.equal(line(r, "혼인·출산 추가 공제"), -40_000_000);
  assert.equal(r.nationalTaxWon, 11_640_000);
});
for (const used of [0, 100_000_000]) test(`2026-09-19 marriage lifetime boundary ${used}`, () => {
  const r = gift({ ...marriage, marriageBirthPreviouslyUsedWon: used });
  assert.equal(r.status, "ready");
  assert.equal(Math.abs(line(r, "혼인·출산 추가 공제")), 100_000_000 - used);
});
for (const used of [null, -1, 100_000_001]) test(`2026-09-19 marriage missing/invalid prior allowance ${used}`, () => {
  assert.equal(gift({ ...marriage, marriageBirthPreviouslyUsedWon: used }).status, "needs_info");
});
for (const day of ["2024-09-16", "2028-09-16"]) test(`2026-09-19 marriage two-year inclusive ${day}`, () => {
  assert.equal(gift({ ...marriage, marriageBirthEventDate: day }).status, "ready");
});
for (const day of ["2024-09-15", "2028-09-17"]) test(`2026-09-19 marriage outside two years ${day}`, () => {
  assert.equal(gift({ ...marriage, marriageBirthEventDate: day }).status, "unsupported");
});
test("2026-09-19 birth must precede gift and cannot use spouse allowance", () => {
  assert.equal(gift({ ...marriage, marriageBirthEvent: "birth", marriageBirthEventDate: "2026-09-17" }).status, "unsupported");
  assert.equal(gift({ ...marriage, relationship: "spouse" }).status, "unsupported");
});
test("2026-09-19 allowance dates are required and leap day anniversary is clamped", () => {
  assert.equal(gift({ ...marriage, marriageBirthEventDate: null }).status, "needs_info");
  assert.equal(gift({ ...marriage, marriageBirthEventDate: "2024-02-29", giftDate: "2026-02-28" }).status, "ready");
  assert.equal(gift({ ...marriage, marriageBirthEventDate: "2024-02-29", giftDate: "2026-03-01" }).status, "unsupported");
});
test("2026-09-19 annual capital aggregation keeps one basic deduction and subtracts prior payments", () => {
  const r = capital(annual);
  assert.equal(r.status, "ready");
  assert.equal(r.taxableBaseWon, 313_500_000);
  assert.equal(r.grossTaxWon, 99_460_000);
  assert.equal(r.nationalTaxWon, 80_775_000);
  assert.equal(r.localTaxWon, 8_077_500);
  assert.equal(r.totalTaxWon, 88_852_500);
});
test("2026-09-19 capital missing local payment is not assumed zero", () => {
  assert.equal(capital({ ...annual, previousLocalTaxWon: null }).status, "needs_info");
});
test("2026-09-19 capital mixed rates need separate comparison", () => {
  assert.equal(capital({ ...annual, otherGainsGeneralRate: "no" }).status, "unsupported");
  assert.equal(capital({ ...annual, otherGainsGeneralRate: "unknown" }).status, "needs_info");
});
test("2026-09-19 capital same-year loss offsets income and preserves refund balance", () => {
  const r = capital({ ...annual, salePriceWon: 550_000_000, necessaryExpenseWon: 0 });
  assert.equal(r.status, "ready");
  assert.equal(r.taxableBaseWon, 47_500_000);
  assert.equal(r.grossTaxWon, 5_865_000);
  assert.equal(r.nationalTaxWon, -12_820_000);
  assert.equal(r.localTaxWon, -1_282_000);
});
test("2026-09-19 past capital loss is signed rather than discarded", () => {
  const r = capital({ ...annual, otherCapitalGainWon: -50_000_000, basicDeductionUsedWon: 0, previousNationalTaxWon: 0, previousLocalTaxWon: 0 });
  assert.equal(r.status, "ready");
  assert.equal(r.taxableBaseWon, 163_500_000);
});
test("2026-09-19 capital aggregation cannot be omitted with prior payments or deduction use", () => {
  assert.equal(capital({ ...annual, annualAggregation: false }).status, "needs_info");
  assert.equal(capital({ ...H, basicDeductionUsedWon: 2_500_000 }).status, "needs_info");
});
test("2026-09-19 short-term capital with prior loss still needs rate comparison", () => {
  assert.equal(capital({ ...annual, acquisitionDate: "2026-01-01", otherCapitalGainWon: -50_000_000 }).status, "unsupported");
});
test("2026-09-19 single-home rules are not silently combined with annual aggregation", () => {
  assert.equal(capital({ ...annual, assetType: "oneHome" }).status, "unsupported");
  assert.equal(capital(H).status, "ready");
});
for (const day of ["2026-09-19", "2026-09-20"]) test(`2026-09-19 verified date boundary ${day}`, () => {
  const status = day === "2026-09-19" ? "ready" : "unsupported";
  assert.equal(inh({ ...I, deathDate: day }).status, status);
  assert.equal(gift({ ...G, giftDate: day }).status, status);
  assert.equal(capital({ ...H, transferDate: day }).status, status);
});
