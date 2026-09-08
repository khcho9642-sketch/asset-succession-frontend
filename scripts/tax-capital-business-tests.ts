import assert from "node:assert/strict";
import test from "node:test";
import { compareBusinessGift, compareCapitalGains } from "../lib/tax-comparison/capital-business";
import type { TaxComparisonInput } from "../lib/tax-comparison/types";

function capital(values: Record<string, string> = {}): TaxComparisonInput {
  return { version: 1, track: "capital_gains", confirmed: true, values: { resident: "yes", standardCase: "yes", salePrice: "20", purchasePrice: "10", expenses: "0.5", heldYears: "5", ...values } };
}

function business(values: Record<string, string> = {}): TaxComparisonInput {
  return { version: 1, track: "business_succession", confirmed: true, values: { resident: "yes", standardCase: "yes", businessValue: "100", businessYears: "10", ...values } };
}

test("CG golden case includes holding deduction and local tax, without 3% credit", () => {
  const result = compareCapitalGains(capital());
  assert.equal(result.status, "ready");
  assert.equal(result.baseline?.taxableWon, 852_500_000);
  assert.equal(result.baseline?.grossTaxWon, 322_110_000);
  assert.equal(result.baseline?.creditWon, 0);
  assert.equal(result.baseline?.nationalTaxWon, 322_110_000);
  assert.equal(result.baseline?.localTaxWon, 32_211_000);
  assert.equal(result.baseline?.totalTaxWon, 354_321_000);
  assert.equal(result.alternatives[0].taxableWon, 833_500_000);
  assert.equal(result.alternatives[0].totalTaxWon, 345_543_000);
  assert.match(result.assumptions.join(" "), /현행 법령과 가격이 그대로/);
});

test("CG ordinary tax brackets match independent golden boundary values", () => {
  const examples = [
    [0, 0], [14_000_000, 840_000], [50_000_000, 6_240_000],
    [88_000_000, 15_360_000], [150_000_000, 37_060_000],
    [300_000_000, 94_060_000], [500_000_000, 174_060_000],
    [1_000_000_000, 384_060_000], [1_100_000_000, 429_060_000],
  ];
  for (const [taxable, expected] of examples) {
    const result = compareCapitalGains(capital({ salePrice: ((taxable + 2_500_000) / 100_000_000).toFixed(8), purchasePrice: "0", expenses: "0", heldYears: "2" }));
    assert.equal(result.baseline?.taxableWon, taxable);
    assert.equal(result.baseline?.grossTaxWon, expected, `taxable ${taxable}`);
  }
});

test("CG completed-year holding boundary starts at 3 years and stops increasing at 15", () => {
  const atTwo = compareCapitalGains(capital({ salePrice: "2", purchasePrice: "1", expenses: "0", heldYears: "2" }));
  assert.equal(atTwo.baseline?.taxableWon, 97_500_000);
  assert.equal(atTwo.alternatives[0].taxableWon, 91_500_000);
  assert.equal(atTwo.baseline?.totalTaxWon, 20_553_500);
  assert.equal(atTwo.alternatives[0].totalTaxWon, 18_243_500);
  const atFourteen = compareCapitalGains(capital({ heldYears: "14" }));
  assert.ok(atFourteen.baseline!.totalTaxWon > atFourteen.alternatives[0].totalTaxWon);
  for (const heldYears of ["15", "16", "99"]) {
    const result = compareCapitalGains(capital({ heldYears }));
    assert.equal(result.baseline?.totalTaxWon, result.alternatives[0].totalTaxWon);
  }
});

test("CG loss and gain below annual allowance produce zero, never a negative tax", () => {
  for (const salePrice of ["0", "9", "10.01"]) {
    const result = compareCapitalGains(capital({ salePrice, purchasePrice: "10", expenses: "0", heldYears: "2" }));
    assert.equal(result.status, "ready");
    assert.equal(result.baseline?.totalTaxWon, 0);
    assert.equal(result.alternatives[0].totalTaxWon, 0);
  }
});

test("CG local tax uses gross national schedule before separate 10-won truncation", () => {
  const result = compareCapitalGains(capital({ salePrice: "0.16500999", purchasePrice: "0", expenses: "0", heldYears: "2" }));
  assert.equal(result.baseline?.taxableWon, 14_000_999);
  assert.equal(result.baseline?.grossTaxWon, 840_149);
  assert.equal(result.baseline?.nationalTaxWon, 840_140);
  assert.equal(result.baseline?.localTaxWon, 84_010);
  assert.equal(result.baseline?.totalTaxWon, 924_150);
});

test("CG missing, invalid and unsupported conditions cannot silently become zero", () => {
  for (const key of ["salePrice", "purchasePrice", "expenses", "heldYears", "resident", "standardCase"]) {
    const result = compareCapitalGains(capital({ [key]: "" }));
    assert.equal(result.status, "needs_info", key);
    assert.equal(result.baseline, null);
    assert.ok(result.missing.length > 0);
  }
  const invalid: Record<string, string>[] = [{ heldYears: "1" }, { heldYears: "2.5" }, { expenses: "-1" }, { salePrice: "약20" }];
  for (const values of invalid) {
    const result = compareCapitalGains(capital(values));
    assert.notEqual(result.status, "ready");
    assert.equal(result.baseline, null);
  }
  for (const key of ["resident", "standardCase"]) {
    assert.equal(compareCapitalGains(capital({ [key]: "no" })).status, "unsupported");
  }
});

test("business gift golden case calculates ordinary gift and special gift separately", () => {
  const result = compareBusinessGift(business());
  assert.equal(result.status, "ready");
  assert.equal(result.baseline?.taxableWon, 9_950_000_000);
  assert.equal(result.baseline?.grossTaxWon, 4_515_000_000);
  assert.equal(result.baseline?.creditWon, 135_450_000);
  assert.equal(result.baseline?.totalTaxWon, 4_379_550_000);
  assert.equal(result.alternatives[0].taxableWon, 9_000_000_000);
  assert.equal(result.alternatives[0].grossTaxWon, 900_000_000);
  assert.equal(result.alternatives[0].creditWon, 0);
  assert.equal(result.alternatives[0].totalTaxWon, 900_000_000);
  assert.match(result.scope, /성년 자녀 1명/);
  assert.match(result.assumptions.join(" "), /19세 이상/);
  assert.match(result.exclusions.join(" "), /가업상속공제/);
});

test("business 120억원 bracket applies AFTER 10억원 deduction, with no filing credit", () => {
  for (const [value, taxable, tax] of [["0", 0, 0], ["10", 0, 0], ["130", 12_000_000_000, 1_200_000_000], ["131", 12_100_000_000, 1_220_000_000]] as const) {
    const result = compareBusinessGift(business({ businessValue: value }));
    assert.equal(result.status, "ready");
    assert.equal(result.alternatives[0].taxableWon, taxable);
    assert.equal(result.alternatives[0].totalTaxWon, tax);
    assert.equal(result.alternatives[0].creditWon, 0);
  }
});

test("business special taxable base below 50만원 is untaxed; exactly 50만원 is taxed", () => {
  for (const [value, taxable, tax] of [["10.00000001", 1, 0], ["10.00499999", 499_999, 0], ["10.005", 500_000, 50_000]] as const) {
    const result = compareBusinessGift(business({ businessValue: value }));
    const special = result.alternatives[0];
    assert.equal(special.taxableWon, taxable);
    assert.equal(special.grossTaxWon, tax);
    assert.equal(special.totalTaxWon, tax);
    assert.equal(special.lines.find((line) => line.label.includes("이하 세액"))?.amountWon, tax);
  }
});

test("business 300/400/600억원 caps apply to gift value BEFORE deduction", () => {
  for (const [years, cap, tax] of [[10, 300, 4_600_000_000], [19, 300, 4_600_000_000], [20, 400, 6_600_000_000], [29, 400, 6_600_000_000], [30, 600, 10_600_000_000], [99, 600, 10_600_000_000]]) {
    const result = compareBusinessGift(business({ businessYears: String(years), businessValue: String(cap) }));
    assert.equal(result.status, "ready", `at cap, ${years} years`);
    assert.equal(result.alternatives[0].totalTaxWon, tax);
    const excess = compareBusinessGift(business({ businessYears: String(years), businessValue: `${cap}.00000001` }));
    assert.equal(excess.status, "unsupported", `one won above cap, ${years} years`);
    assert.equal(excess.baseline, null);
    assert.equal(excess.alternatives.length, 0);
    assert.match(excess.missing.join(" "), /초과분의 일반 증여세/);
  }
});

test("business eligibility and value must be explicit; unconfirmed live previews are allowed", () => {
  for (const key of ["businessValue", "businessYears", "resident", "standardCase"]) {
    const result = compareBusinessGift(business({ [key]: "" }));
    assert.equal(result.status, "needs_info", key);
    assert.equal(result.baseline, null);
  }
  const invalid: Record<string, string>[] = [{ businessYears: "9" }, { businessYears: "10.5" }, { businessValue: "-1" }];
  for (const values of invalid) {
    assert.notEqual(compareBusinessGift(business(values)).status, "ready");
  }
  for (const key of ["resident", "standardCase"]) {
    assert.equal(compareBusinessGift(business({ [key]: "no" })).status, "unsupported");
  }
  assert.equal(compareBusinessGift({ ...business(), confirmed: false }).status, "ready");
  assert.equal(compareCapitalGains({ ...capital(), confirmed: false }).status, "ready");
});
