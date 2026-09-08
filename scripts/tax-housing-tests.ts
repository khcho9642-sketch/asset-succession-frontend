import assert from "node:assert/strict";
import test from "node:test";
import { compareHousing } from "../lib/tax-comparison/housing";
import type { TaxComparisonInput } from "../lib/tax-comparison/types";

function housing(values: Record<string, string> = {}): TaxComparisonInput {
  return { version: 1, track: "capital_gains", confirmed: true, values: {
    capitalAsset: "home", resident: "yes", standardCase: "yes", salePrice: "20", purchasePrice: "10", expenses: "0",
    acquisitionDate: "2016-09-08", saleDate: "2026-09-08", residenceYears: "10", houseCount: "1",
    regulatedAtSale: "no", regulatedAtAcquisition: "no", singleHomeSpecial: "no", additionalResidence: "no", transitionCase: "no", ...values,
  } };
}

function multi(values: Record<string, string> = {}) {
  return housing({ salePrice: "10", purchasePrice: "7", residenceYears: "0", houseCount: "2", regulatedAtSale: "yes", ...values });
}

function transition(values: Record<string, string> = {}) {
  return multi({ transitionCase: "yes", transitionWindow: "four", permitRequired: "no", contractDate: "2026-05-09", depositPaid: "yes", ...values });
}

test("housing official high-price example allocates the gain and 80% deduction before annual allowance", () => {
  const result = compareHousing(housing({ salePrice: "15", purchasePrice: "8", expenses: "0.3" }));
  assert.equal(result.status, "ready");
  assert.equal(result.baseline?.lines.find(line => line.label === "비과세 제외 후 양도차익")?.amountWon, 134_000_000);
  assert.equal(result.baseline?.taxableWon, 24_300_000);
  assert.equal(result.baseline?.nationalTaxWon, 2_385_000);
  assert.equal(result.baseline?.localTaxWon, 238_500);
  assert.equal(result.baseline?.totalTaxWon, 2_623_500);
  assert.equal(result.baseline?.creditWon, 0);
  assert.equal(result.alternatives[0].totalTaxWon, 2_623_500);
});

test("housing 12억원 is an eligibility-gated whole-property threshold, not a deduction for every seller", () => {
  const eligible = compareHousing(housing({ salePrice: "12", purchasePrice: "5" }));
  assert.equal(eligible.baseline?.totalTaxWon, 0);
  assert.match(eligible.baseline!.lines.find(line => line.label === "비과세 제외 후 양도차익")!.note!, /요건 충족/);
  const noResidence = compareHousing(housing({ salePrice: "12", purchasePrice: "5", acquisitionDate: "2020-01-01", residenceYears: "0", regulatedAtAcquisition: "yes" }));
  assert.equal(noResidence.status, "ready");
  assert.ok(noResidence.baseline!.totalTaxWon > 0);
  const tooShort = compareHousing(housing({ salePrice: "12", purchasePrice: "5", acquisitionDate: "2026-01-01", residenceYears: "0" }));
  assert.ok(tooShort.baseline!.totalTaxWon > 0);
  assert.equal(compareHousing(housing({ salePrice: "20", purchasePrice: "10" })).baseline?.totalTaxWon, 14_124_000);
});

test("housing holding/residence special deduction is 20% at 3/2 years and needs explicit added residence", () => {
  const result = compareHousing(housing({ acquisitionDate: "2023-09-08", residenceYears: "2" }));
  assert.equal(result.baseline?.taxableWon, 317_500_000);
  assert.equal(result.baseline?.totalTaxWon, 111_166_000);
  assert.equal(result.alternatives[0].taxableWon, 301_500_000); // holding 16%, residence stays 8%
  const addedResidence = compareHousing(housing({ acquisitionDate: "2023-09-08", residenceYears: "2", additionalResidence: "yes" }));
  assert.equal(addedResidence.alternatives[0].taxableWon, 285_500_000); // holding16% + residence12%
  const noResidence = compareHousing(housing({ residenceYears: "0" }));
  assert.equal(noResidence.baseline?.taxableWon, 317_500_000); // general20%, not special40%
  assert.equal(noResidence.baseline?.totalTaxWon, 111_166_000);
});

test("housing post-20170803 regulated acquisition requires residence; designation only at sale does not", () => {
  const before = compareHousing(housing({ acquisitionDate: "2017-08-02", residenceYears: "0", regulatedAtAcquisition: "yes" }));
  assert.equal(before.baseline?.taxableWon, 325_500_000);
  const after = compareHousing(housing({ acquisitionDate: "2017-08-03", residenceYears: "0", regulatedAtAcquisition: "yes" }));
  assert.equal(after.baseline?.taxableWon, 817_500_000);
  assert.equal(after.baseline?.totalTaxWon, 338_151_000);
  const acquiredOutside = compareHousing(housing({ acquisitionDate: "2017-08-03", residenceYears: "0", regulatedAtAcquisition: "no", regulatedAtSale: "yes" }));
  assert.equal(acquiredOutside.baseline?.taxableWon, before.baseline?.taxableWon);
});

test("housing ordinary holding deduction reaches 30% without 2-year residence and stops there", () => {
  for (const acquisitionDate of ["2011-09-08", "2000-01-01"]) {
    const result = compareHousing(housing({ acquisitionDate, residenceYears: "0" }));
    assert.equal(result.baseline?.taxableWon, 277_500_000);
    assert.equal(result.baseline?.totalTaxWon, 94_061_000);
    assert.equal(result.alternatives[0].totalTaxWon, result.baseline?.totalTaxWon);
  }
});

test("housing confirmed second residence year can unlock exemption while no added residence cannot", () => {
  const facts = { acquisitionDate: "2020-09-08", residenceYears: "1", regulatedAtAcquisition: "yes" };
  const unchanged = compareHousing(housing(facts));
  assert.equal(unchanged.baseline?.totalTaxWon, 365_871_000);
  assert.equal(unchanged.alternatives[0].totalTaxWon, 356_631_000);
  const movedIn = compareHousing(housing({ ...facts, additionalResidence: "yes" }));
  assert.equal(movedIn.baseline?.totalTaxWon, unchanged.baseline?.totalTaxWon);
  assert.equal(movedIn.alternatives[0].taxableWon, 253_500_000);
  assert.equal(movedIn.alternatives[0].totalTaxWon, 84_029_000);
});

test("housing exemption and three-year LTH start on their inclusive period-end boundaries", () => {
  const facts = { acquisitionDate: "2024-09-08", salePrice: "12", purchasePrice: "5", residenceYears: "0" };
  assert.ok(compareHousing(housing({ ...facts, saleDate: "2026-09-06" })).baseline!.totalTaxWon > 0);
  assert.equal(compareHousing(housing({ ...facts, saleDate: "2026-09-07" })).baseline?.totalTaxWon, 0);
  const fullTaxable = { acquisitionDate: "2023-09-08", residenceYears: "0", regulatedAtAcquisition: "yes" };
  assert.equal(compareHousing(housing({ ...fullTaxable, saleDate: "2026-09-06" })).baseline?.totalTaxWon, 421_311_000);
  assert.equal(compareHousing(housing({ ...fullTaxable, saleDate: "2026-09-07" })).baseline?.totalTaxWon, 393_591_000);
});

test("housing short-term 70/60 rates change on inclusive holding anniversaries", () => {
  const base = { salePrice: "2", purchasePrice: "1", residenceYears: "0", houseCount: "2", acquisitionDate: "2025-09-08" };
  const dayBeforeOneYear = compareHousing(housing({ ...base, saleDate: "2026-09-06" }));
  assert.equal(dayBeforeOneYear.baseline?.totalTaxWon, 75_075_000);
  const atOneYear = compareHousing(housing({ ...base, saleDate: "2026-09-07" }));
  assert.equal(atOneYear.baseline?.totalTaxWon, 64_350_000);
  const atTwoYears = compareHousing(housing({ ...base, acquisitionDate: "2024-09-08", saleDate: "2026-09-07" }));
  assert.equal(atTwoYears.baseline?.totalTaxWon, 20_553_500);
});

test("housing inclusive holding handles Jan1 and Feb29 without double-subtracting leap month end", () => {
  const shared = { salePrice: "2", purchasePrice: "1", residenceYears: "0", houseCount: "2" };
  assert.equal(compareHousing(housing({ ...shared, acquisitionDate: "2025-01-01", saleDate: "2026-12-31" })).baseline?.totalTaxWon, 20_553_500);
  assert.equal(compareHousing(housing({ ...shared, acquisitionDate: "2024-02-29", saleDate: "2026-02-27" })).baseline?.totalTaxWon, 64_350_000);
  assert.equal(compareHousing(housing({ ...shared, acquisitionDate: "2024-02-29", saleDate: "2026-02-28" })).baseline?.totalTaxWon, 20_553_500);
});

test("housing two/three-home heavy tax denies LTH; unregulated location retains general LTH", () => {
  const two = compareHousing(multi());
  assert.equal(two.baseline?.taxableWon, 297_500_000);
  assert.equal(two.baseline?.nationalTaxWon, 152_610_000);
  assert.equal(two.baseline?.totalTaxWon, 167_871_000);
  const three = compareHousing(multi({ houseCount: "3" }));
  assert.equal(three.baseline?.nationalTaxWon, 182_360_000);
  assert.equal(three.baseline?.totalTaxWon, 200_596_000);
  assert.equal(compareHousing(multi({ regulatedAtSale: "no" })).baseline?.totalTaxWon, 77_341_000);
});

test("housing overlapping short-term and three-home heavy tax chooses progressive+30 when larger", () => {
  const result = compareHousing(multi({ salePrice: "30", purchasePrice: "10", acquisitionDate: "2026-01-01", houseCount: "3" }));
  assert.equal(result.baseline?.taxableWon, 1_997_500_000);
  assert.equal(result.baseline?.nationalTaxWon, 1_432_185_000);
  assert.equal(result.baseline?.totalTaxWon, 1_575_403_500);
});

test("housing deemed-one-home classification alone cannot override missing residence for heavy tax", () => {
  const result = compareHousing(multi({ singleHomeSpecial: "yes", acquisitionDate: "2020-01-01", regulatedAtAcquisition: "yes", residenceYears: "0" }));
  assert.equal(result.baseline?.totalTaxWon, 167_871_000);
  const qualified = compareHousing(multi({ singleHomeSpecial: "yes", acquisitionDate: "2020-01-01", regulatedAtAcquisition: "yes", residenceYears: "2" }));
  assert.equal(qualified.baseline?.totalTaxWon, 0);
});

test("housing May9 automatic relief ends May10 and does not carry into future comparison", () => {
  const may9 = compareHousing(multi({ saleDate: "2026-05-09" }));
  assert.equal(may9.status, "ready");
  assert.ok(may9.baseline!.totalTaxWon < 167_871_000);
  assert.equal(may9.alternatives[0].totalTaxWon, 167_871_000);
  assert.equal(compareHousing(multi({ saleDate: "2026-05-10" })).baseline?.totalTaxWon, 167_871_000);
  const heldUnderTwo = compareHousing(multi({ acquisitionDate: "2025-01-01", saleDate: "2026-05-09" }));
  assert.match(heldUnderTwo.baseline!.lines.find(line => line.label === "양도소득세")!.note!, /20%p/);
});

test("housing no-permit May9 contract relief respects both 4/6 calendar-month boundaries", () => {
  for (const [window, last, next] of [["four", "2026-09-09", "2026-09-10"], ["six", "2026-11-09", "2026-11-10"]]) {
    const at = compareHousing(transition({ transitionWindow: window, saleDate: last }));
    assert.equal(at.baseline?.totalTaxWon, 77_341_000);
    assert.equal(at.alternatives[0].totalTaxWon, 167_871_000);
    assert.equal(compareHousing(transition({ transitionWindow: window, saleDate: next })).baseline?.totalTaxWon, 167_871_000);
  }
  assert.equal(compareHousing(transition({ contractDate: "2026-04-08", saleDate: "2026-09-08" })).baseline?.totalTaxWon, 167_871_000);
  assert.equal(compareHousing(transition({ contractDate: "2026-05-10" })).baseline?.totalTaxWon, 167_871_000);
});

test("housing permit transition requires timely application and approval, plus an absolute deadline", () => {
  const permitted = { permitRequired: "yes", permitApplicationDate: "2026-05-09", permitApproved: "yes", contractDate: "2026-06-15" };
  assert.equal(compareHousing(transition({ ...permitted, saleDate: "2026-09-09" })).baseline?.totalTaxWon, 77_341_000);
  assert.equal(compareHousing(transition({ ...permitted, saleDate: "2026-09-10" })).baseline?.totalTaxWon, 167_871_000);
  assert.equal(compareHousing(transition({ ...permitted, transitionWindow: "six", saleDate: "2026-11-09" })).baseline?.totalTaxWon, 77_341_000);
  for (const override of [{ permitApplicationDate: "2026-05-10" }, { permitApproved: "no" }, { depositPaid: "no" }] as Array<Record<string, string>>) {
    assert.equal(compareHousing(transition({ ...permitted, ...override })).baseline?.totalTaxWon, 167_871_000);
  }
});

test("housing loss and small gain are actual zero results; missing or malformed facts are never zero", () => {
  for (const salePrice of ["0", "9", "10.01"]) {
    assert.equal(compareHousing(multi({ salePrice, purchasePrice: "10" })).baseline?.totalTaxWon, 0);
  }
  for (const key of ["salePrice", "purchasePrice", "expenses", "acquisitionDate", "saleDate", "residenceYears", "houseCount", "regulatedAtSale", "additionalResidence", "resident", "standardCase"]) {
    const result = compareHousing(housing({ [key]: "" }));
    assert.equal(result.status, "needs_info", key);
    assert.equal(result.baseline, null);
  }
  for (const bad of [{ acquisitionDate: "2024-02-30" }, { saleDate: "2026-13-01" }, { acquisitionDate: "2027-01-01" }, { residenceYears: "11" }, { houseCount: "0" }, { expenses: "-1" }] as Array<Record<string, string>>) {
    assert.equal(compareHousing(housing(bad)).status, "needs_info");
  }
  assert.equal(compareHousing(housing({ saleDate: "2025-12-31", residenceYears: "0" })).status, "unsupported");
  assert.equal(compareHousing(housing({ resident: "no" })).status, "unsupported");
  assert.equal(compareHousing(housing({ standardCase: "no" })).status, "unsupported");
});

test("housing conditional residence/special/transition evidence cannot be silently defaulted eligible", () => {
  for (const key of ["singleHomeSpecial", "transitionCase"]) assert.equal(compareHousing(multi({ [key]: "" })).status, "needs_info");
  assert.equal(compareHousing(housing({ acquisitionDate: "2020-01-01", residenceYears: "0", regulatedAtAcquisition: "" })).status, "needs_info");
  for (const key of ["transitionWindow", "permitRequired", "contractDate", "depositPaid"]) assert.equal(compareHousing(transition({ [key]: "" })).status, "needs_info");
  for (const key of ["permitApplicationDate", "permitApproved"]) {
    assert.equal(compareHousing(transition({ permitRequired: "yes", permitApplicationDate: "2026-05-09", permitApproved: "yes", [key]: "" })).status, "needs_info");
  }
  assert.equal(compareHousing(transition({ contractDate: "2026-10-01" })).status, "needs_info");
});

test("housing local tax uses unrounded national schedule and never applies a filing credit", () => {
  const result = compareHousing(housing({ salePrice: "0.16500999", purchasePrice: "0", expenses: "0", houseCount: "2", acquisitionDate: "2024-09-08", residenceYears: "0" }));
  assert.equal(result.baseline?.grossTaxWon, 840_149);
  assert.equal(result.baseline?.nationalTaxWon, 840_140);
  assert.equal(result.baseline?.localTaxWon, 84_010);
  assert.equal(result.baseline?.creditWon, 0);
  assert.equal(result.baseline?.totalTaxWon, 924_150);
});

test("housing surcharge adds percentage points before integer tax rounding", () => {
  const result = compareHousing(multi({ salePrice: "0.02500039", purchasePrice: "0", acquisitionDate: "2024-09-08" }));
  assert.equal(result.baseline?.taxableWon, 39);
  assert.equal(result.baseline?.grossTaxWon, 10); // 39 × (6% + 20%), not floor(39×6%) + floor(39×20%)
  assert.equal(result.baseline?.nationalTaxWon, 10);
  assert.equal(result.baseline?.localTaxWon, 0);
  assert.equal(result.baseline?.totalTaxWon, 10);
});
