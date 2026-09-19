import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { calculateGiftTax as gift, calculateInheritanceTax as inheritance, calculateCapitalGainsTax as capital } from "../lib/simple-calculator";
import type { GiftInput, InheritanceInput, CapitalGainsInput, SimpleCalculationResult, DeemedAssetPart } from "../lib/simple-calculator";

const root = process.env.SIMPLE_CALCULATOR_ROOT ?? process.cwd();
type Case = {
  id: string; kind: "gift" | "inheritance" | "capitalGains";
  input: GiftInput | InheritanceInput | CapitalGainsInput;
  facts: Record<string, string | boolean | number>;
  expected: Record<string, number | string>;
};
const fixture: { cases: Case[] } = JSON.parse(readFileSync(path.join(root, "docs/reviews/calculator-final-cases-2026-09-19.json"), "utf8"));

// Facts are translated explicitly, never replaced with catch-all zero defaults.
function adapted(c: Case) {
  const input = structuredClone(c.input);
  assert.equal(c.facts.filingWithinDeadline, true);
  assert.equal(c.facts.otherSpecialRules, false);
  assert.equal(c.facts.valuesAlreadyTaxValued, true);
  if (c.kind === "gift" && (input as GiftInput).priorGiftMarriageBirthStatus === "yes") {
    assert.equal(c.facts.donor, "same_father");
    assert.equal(c.facts.recipient, "adult_child");
    Object.assign(input, {
      priorGiftDonor: "sameFather",
      priorGiftDate: c.facts.priorGiftDate,
      priorGiftMarriageBirthEvent: "marriage",
      priorGiftMarriageBirthEventDate: c.facts.priorMarriageDate,
      priorGiftHistoryConfirmed: c.facts.priorDeductionRemainsLegallyValid,
    });
  }
  if (c.id === "I04") assert.equal((input as InheritanceInput).deemedAssetBreakdown![0].estateIncludedWon, c.facts.externallyConfirmedEstatePortionWon);
  if (c.id === "I03") {
    assert.equal(c.facts.retirementEstateInclusionConfirmed, true);
    assert.equal(c.facts.retirementFinancialDeductionIneligibleConfirmed, true);
  }
  if (c.id === "I06") {
    assert.equal(c.facts.priorGiftByDecedentOnly, true);
    assert.ok(String(c.facts.priorGiftDate) >= "2016-09-19" && String(c.facts.priorGiftDate) < "2026-09-19");
  }
  return input;
}
function run(c: Case) {
  const input = adapted(c);
  return c.kind === "gift" ? gift(input as GiftInput) : c.kind === "inheritance" ? inheritance(input as InheritanceInput) : capital(input as CapitalGainsInput);
}
function line(r: SimpleCalculationResult, prefix: string) {
  const item = r.lines.find(item => item.label.startsWith(prefix));
  assert.ok(item, `Missing intermediate: ${prefix}; ${JSON.stringify(r)}`);
  return item.amountWon === 0 ? 0 : item.amountWon;
}
function deduction(r: SimpleCalculationResult, prefix: string) { return Math.abs(line(r, prefix)); }
function actual(c: Case, r: SimpleCalculationResult): Record<string, number | string> {
  const common = { status: r.status, taxableBaseWon: r.taxableBaseWon, nationalTaxWon: r.nationalTaxWon, localTaxWon: r.localTaxWon, totalTaxWon: r.totalTaxWon };
  if (c.kind === "gift") return { ...common,
    aggregateGiftWon: line(r, "합산 증여 과세가액"), appliedBasicDeductionWon: deduction(r, "직계존속"),
    preservedPriorMarriageBirthWon: deduction(r, "합산 과거 혼인"), newMarriageBirthDeductionWon: deduction(r, "혼인·출산 추가"),
    aggregateGrossTaxWon: line(r, "합산 산출세액"), priorTaxCreditWon: deduction(r, "종전 증여"), filingCreditWon: deduction(r, "신고세액공제"),
  };
  if (c.kind === "inheritance") return { ...common, grossTaxWon: r.grossTaxWon,
    totalAssetsWon: line(r, "총 상속재산"), taxableEstateWon: line(r, "상속세 과세가액"),
    netFinancialWon: line(r, "공제 대상 순금융재산"), financialDeductionWon: deduction(r, "금융재산 상속공제"),
    priorTaxCreditWon: deduction(r, "사전증여 증여세액공제"), filingCreditWon: deduction(r, "신고세액공제"),
  };
  return { ...common, grossTaxWon: r.grossTaxWon,
    gainWon: line(r, "양도차익"), longTermDeductionWon: deduction(r, "장기보유특별공제"),
    capitalIncomeWon: line(r, "공제 후 양도소득금액"), basicDeductionWon: deduction(r, "양도소득 기본공제"),
    annualNationalTaxWon: line(r, "기납부 차감 전 국세"), annualLocalTaxWon: line(r, "개인지방소득세 산출세액"),
    ...("taxableGainWon" in c.expected ? { taxableGainWon: line(r, "과세대상 양도차익") } : {}),
  };
}
const results: unknown[] = [];
for (const c of fixture.cases) test(`final numeric ${c.id}: every supplied intermediate and tax`, () => {
  const r = run(c);
  assert.equal(r.status, "ready", JSON.stringify(r));
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.unsupported, []);
  const values = actual(c, r);
  assert.deepEqual(values, c.expected, c.id);
  results.push({ id: c.id, input: adapted(c), expected: c.expected, actual: values, passed: true });
});
test.after(() => {
  const out = path.join(root, ".tmp/simple-calculator-proof");
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, "final-numeric-results.json"), JSON.stringify({ fixtureSource: "unchanged user attachment; independent formula", hometaxExecuted: false, cases: results }, null, 2));
});
const get = (id: string) => adapted(fixture.cases.find(c => c.id === id)!);
const G = get("G01") as GiftInput;
const I = get("I01") as InheritanceInput;
const C = get("C02") as CapitalGainsInput;
const insurance = (overrides: Partial<DeemedAssetPart>) => ({ ...I, deemedAssetBreakdown: [{ ...I.deemedAssetBreakdown![0], ...overrides }] });
function blocked(r: SimpleCalculationResult, status: "needs_info" | "unsupported" = "needs_info") {
  assert.equal(r.status, status, JSON.stringify(r));
  assert.deepEqual(r.lines, []);
}
test("B01 prior marriage history required even without a new deduction", () => {
  for (const status of [null, undefined, "unknown", "bad"]) blocked(gift({ ...G, priorGiftMarriageBirthStatus: status as GiftInput["priorGiftMarriageBirthStatus"] }));
});
test("B02 missing prior deduction and taxable base are not zero", () => {
  for (const key of ["priorGiftMarriageBirthAppliedWon", "priorGiftTaxableBaseWon"] as const) for (const value of [null, undefined]) blocked(gift({ ...G, [key]: value }));
});
test("B03 unknown validity or ordinary cash history", () => {
  blocked(gift({ ...G, priorGiftHistoryConfirmed: null }));
  blocked(gift({ ...G, ordinaryCashHistory: null }));
});
test("B04 prior special allowance cannot exceed lifetime use or prior property", () => {
  blocked(gift({ ...G, marriageBirthPreviouslyUsedWon: 99_999_999 }));
  blocked(gift({ ...G, priorGiftWon: 99_999_999 }));
  blocked(gift({ ...G, priorGiftMarriageBirthAppliedWon: 100_000_001 }));
});
test("B05 new marriage deduction plus prior gift remains unsupported", () => blocked(gift({ ...G, marriageBirthDeductionWon: 1 }), "unsupported"));
test("B06 exceptional past gift history remains unsupported", () => {
  for (const input of [{ priorGiftHistoryConfirmed: false }, { ordinaryCashHistory: false }, { priorGiftDonor: "other" }, { generationSkip: true }, { debtAssumedWon: 1 }, { appraisalFeeWon: 1 }, { relationship: "linealAscendantMinor" }]) blocked(gift({ ...G, ...input } as GiftInput), "unsupported");
});
test("B07 other donor use reduces only new remaining allowance", () => {
  const r = gift(get("G03") as GiftInput);
  assert.equal(deduction(r, "합산 과거 혼인"), 0);
  assert.equal(deduction(r, "혼인·출산 추가"), 40_000_000);
});
test("B08 contradictory reported base or gross tax rejected", () => {
  blocked(gift({ ...G, previousTaxPaidWon: 1 }));
  blocked(gift({ ...G, priorGiftTaxableBaseWon: 1 }));
  blocked(gift({ ...get("G02") as GiftInput, previousTaxPaidWon: 4_850_000 }));
});
test("B09 prior dates are checked in actual input", () => {
  blocked(gift({ ...G, priorGiftDate: null }));
  for (const date of ["2023-12-31", "2026-09-19", "2010-01-10"]) blocked(gift({ ...G, priorGiftDate: date }), "unsupported");
  blocked(gift({ ...G, priorGiftMarriageBirthEventDate: "2020-01-01" }), "unsupported");
});
test("B10 unknown insurance inclusion and classification", () => {
  blocked(inheritance(insurance({ estateIncludedWon: null })));
  blocked(inheritance(insurance({ financialEligibleWon: null })));
  blocked(inheritance(insurance({ classification: "unknown" })));
  blocked(inheritance(insurance({ classification: "unsupported" })), "unsupported");
});
test("B11 eligible insurance cannot exceed included amount", () => blocked(inheritance(insurance({ financialEligibleWon: 200_000_001 }))));
test("B12 legacy positive total cannot bypass the breakdown", () => {
  blocked(inheritance({ ...I, deemedAssetBreakdown: undefined, deemedAssetsWon: 200_000_000 }));
  blocked(inheritance({ ...I, deemedAssetsWon: 1 }));
  assert.equal(inheritance({ ...I, deemedAssetsWon: 200_000_000 }).totalTaxWon, 132_405_000);
});
test("B13 prior donated cash does not create current financial deduction", () => {
  const r = inheritance({ ...get("I06") as InheritanceInput, financialAssetsWon: 0 });
  assert.equal(r.status, "ready");
  assert.equal(deduction(r, "금융재산 상속공제"), 0);
});
test("B14 financial debt cannot exceed total debt", () => blocked(inheritance({ ...I, financialDebtWon: 1 })));
test("B15 exclusions cannot use the insurance bucket", () => blocked(inheritance({ ...I, financialExclusionsWon: 1 })));
test("B16 unclassified trust and overlapping non-taxable financial assets", () => {
  blocked(inheritance(insurance({ kind: "moneyTrust", classification: "unknown" })));
  blocked(inheritance({ ...I, nonTaxableWon: 1 }));
  blocked(inheritance({ ...I, nonTaxableWon: 1, nonTaxableFinancialOverlap: "yes" }), "unsupported");
  assert.equal(inheritance({ ...I, nonTaxableWon: 1, nonTaxableFinancialOverlap: "no" }).status, "ready");
});
test("B17 home exemption and annual aggregation unsupported", () => blocked(capital({ ...get("C05") as CapitalGainsInput, annualAggregation: true, otherGainsGeneralRate: "yes" }), "unsupported"));
test("B18 mixed rates and unsupported assets remain blocked", () => {
  blocked(capital({ ...C, otherGainsGeneralRate: "no" }), "unsupported");
  blocked(capital({ ...C, acquisitionDate: "2026-01-01" }), "unsupported");
  blocked(capital({ ...C, assetType: "otherUnsupported" }), "unsupported");
});
test("B19 no annual aggregation with previous use or payments", () => blocked(capital({ ...C, annualAggregation: false })));
test("B20 national refund and local payment retain independent signs", () => {
  const r = capital({ ...C, previousNationalTaxWon: 100_000_000, previousLocalTaxWon: 0 });
  assert.equal(r.status, "ready");
  assert.equal(r.nationalTaxWon, -540_000);
  assert.equal(r.localTaxWon, 9_946_000);
  assert.equal(r.totalTaxWon, 9_406_000);
});
for (const [kind, start] of [["gift", "2023-01-01"], ["inheritance", "2023-01-01"], ["capitalGains", "2021-12-08"]] as const) test(`B23 ${kind} support period boundaries`, () => {
  const before = new Date(`${start}T00:00:00Z`); before.setUTCDate(before.getUTCDate() - 1);
  for (const [date, status] of [[before.toISOString().slice(0, 10), "unsupported"], [start, "ready"], ["2026-09-19", "ready"], ["2026-09-20", "unsupported"]]) {
    const r = kind === "gift" ? gift({ ...get("G04") as GiftInput, giftDate: date }) : kind === "inheritance" ? inheritance({ ...I, deathDate: date }) : capital({ ...get("C01") as CapitalGainsInput, transferDate: date });
    assert.equal(r.status, status, JSON.stringify(r));
  }
});
test("B24 bad amounts/enums never calculate as ready", () => {
  for (const value of [null, undefined, -1, NaN, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    blocked(inheritance(insurance({ estateIncludedWon: value as number | null })));
    blocked(gift({ ...G, priorGiftMarriageBirthAppliedWon: value as number | null }));
  }
  blocked(gift({ ...G, relationship: "bad" as GiftInput["relationship"] }));
  blocked(inheritance(insurance({ kind: "bad" as DeemedAssetPart["kind"] })));
  blocked(inheritance({ ...I, spouse: "bad" as InheritanceInput["spouse"] }));
  blocked(capital({ ...C, assetType: "bad" as CapitalGainsInput["assetType"] }));
  assert.equal(gift({ ...get("G04") as GiftInput, amountWon: 0 }).status, "ready");
});
for (const [net, expected] of [[0,0],[20_000_000,20_000_000],[20_000_001,20_000_000],[100_000_000,20_000_000],[100_000_001,20_000_000],[1_000_000_000,200_000_000],[1_000_000_001,200_000_000]]) test(`new insurance financial boundary ${net}`, () => {
  const r = inheritance(insurance({ estateIncludedWon: net, financialEligibleWon: net }));
  assert.equal(r.status, "ready");
  assert.equal(deduction(r, "금융재산 상속공제"), expected);
});
