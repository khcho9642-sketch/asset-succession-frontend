import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateDisabledDeductionFromLifeExpectancyYears,
  calculateCapitalGainsTax,
  calculateGiftTax,
  calculateInheritanceTax,
  calculateMinorDeductionFromAges,
  deriveSpouseLegalShare,
  formatKoreanWon,
  fullYearsBetween,
  parseWonInput,
} from "../lib/simple-calculator";

test("parseWonInput keeps blank distinct from zero", () => {
  assert.equal(parseWonInput(""), null);
  assert.equal(parseWonInput("0"), 0);
  assert.equal(parseWonInput("1,234,000"), 1234000);
});

test("customer-facing helpers derive readable amounts and family deductions", () => {
  assert.equal(formatKoreanWon(1_200_000_000), "12억 원");
  assert.deepEqual(deriveSpouseLegalShare({ spouse: "yes", spouseSoleHeir: false, childrenCount: 2 }), {
    numerator: 3,
    denominator: 7,
    label: "배우자 1.5 : 자녀 2명 각 1",
  });
  assert.equal(calculateMinorDeductionFromAges([12, 16]), 100_000_000);
  assert.equal(calculateDisabledDeductionFromLifeExpectancyYears(8), 80_000_000);
  assert.equal(fullYearsBetween("2016-09-15", "2026-09-16"), 10);
});

test("gift tax calculates a current single recipient case", () => {
  const result = calculateGiftTax({
    giftDate: "2026-09-16",
    resident: "yes",
    relationship: "linealAscendantAdult",
    amountWon: 100_000_000,
    debtAssumedWon: 0,
    priorGiftWon: 0,
    priorGiftDeductionWon: 0,
    otherGiftDeductionWon: 0,
    appraisalFeeWon: 0,
    marriageBirthDeductionWon: 0,
    marriageBirthPreviouslyUsedWon: 0, marriageBirthEvent: null, marriageBirthEventDate: null,
    previousTaxPaidWon: 0,
    generationSkip: false,
    minorOverTwoBillion: false,
  });
  assert.equal(result.status, "ready");
  assert.equal(result.taxableBaseWon, 50_000_000);
  assert.equal(result.grossTaxWon, 5_000_000);
  assert.equal(result.creditWon, 150_000);
  assert.equal(result.nationalTaxWon, 4_850_000);
});

test("capital gains separates national and local taxes", () => {
  const result = calculateCapitalGainsTax({
    transferDate: "2026-09-16",
    acquisitionDate: "2016-09-15",
    assetType: "generalBuilding",
    salePriceWon: 900_000_000,
    purchasePriceWon: 600_000_000,
    necessaryExpenseWon: 30_000_000,
    otherCapitalGainWon: 0,
    basicDeductionUsedWon: 0,
    annualAggregation: false, otherGainsGeneralRate: null, previousNationalTaxWon: 0, previousLocalTaxWon: 0,
    residenceYears: 0,
    homeCount: 0,
    regulatedArea: false,
    resident: "yes",
    homeOwnership: null,
    householdOtherRights: null,
    regulatedAtAcquisition: null,
    homeSpecialConditions: null,
  });
  assert.equal(result.status, "ready");
  assert.equal(result.taxableBaseWon, 213_500_000);
  assert.equal(result.nationalTaxWon, 61_190_000);
  assert.equal(result.localTaxWon, 6_119_000);
  assert.equal(result.totalTaxWon, 67_309_000);
});

test("inheritance uses the entered current condition, not a comparison baseline", () => {
  const result = calculateInheritanceTax({
    deathDate: "2026-09-16",
    spouse: "yes",
    spouseSoleHeir: false,
    childrenCount: 2,
    minorDeductionWon: 0,
    seniorCount: 0,
    disabledDeductionWon: 0,
    realEstateWon: 1_200_000_000,
    financialAssetsWon: 200_000_000,
    financialExclusionsWon: 0,
    otherAssetsWon: 100_000_000,
    deemedAssetsWon: 0,
    nonTaxableWon: 0,
    priorGiftSpouseWon: 0,
    priorGiftHeirsWon: 0,
    priorGiftOthersWon: 0,
    debtWon: 100_000_000,
    financialDebtWon: 0,
    publicChargesWon: 0,
    funeralWon: 8_000_000,
    burialWon: 0,
    spouseActualInheritanceWon: 500_000_000,
    statutoryShareNumerator: 3,
    statutoryShareDenominator: 7,
    spousePriorGiftTaxableWon: 0,
    priorGifts: [],
  });
  assert.equal(result.status, "ready");
  assert.equal(result.taxableBaseWon, 352_000_000);
  assert.equal(result.nationalTaxWon, 58_588_000);
});
