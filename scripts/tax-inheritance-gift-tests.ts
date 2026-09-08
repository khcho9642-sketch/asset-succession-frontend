import assert from "node:assert/strict";
import test from "node:test";
import { compareGift, compareInheritance } from "../lib/tax-comparison/inheritance-gift";
import type { TaxCase, TaxComparisonInput } from "../lib/tax-comparison/types";

function inheritance(values: Record<string, string> = {}): TaxComparisonInput {
  return { version: 1, track: "inheritance", confirmed: true, values: {
    estate: "50", debt: "0", financial: "10", financialDebt: "0", funeral: "0.05", children: "3", spouse: "yes", resident: "yes", standardCase: "yes", ...values,
  } };
}

function gift(values: Record<string, string> = {}): TaxComparisonInput {
  return { version: 1, track: "gift", confirmed: true, values: {
    giftAmount: "3", recipientType: "adult_child", recipientCount: "3", resident: "yes", standardCase: "yes", ...values,
  } };
}

function line(taxCase: TaxCase | null, label: string): number | undefined {
  return taxCase?.lines.find((item) => item.label === label)?.amountWon;
}

test("50억원 inheritance computes the tax base and credits before comparison", () => {
  const result = compareInheritance(inheritance());
  assert.equal(result.status, "ready");
  assert.equal(result.baseline?.taxableWon, 3_795_000_000);
  assert.equal(result.baseline?.grossTaxWon, 1_437_500_000);
  assert.equal(result.baseline?.creditWon, 43_125_000);
  assert.equal(result.baseline?.totalTaxWon, 1_394_375_000);
  const alternative = result.alternatives[0];
  assert.equal(line(alternative, "가정한 배우자 상속액"), 1_666_666_666);
  assert.equal(alternative.taxableWon, 2_628_333_334);
  assert.equal(alternative.grossTaxWon, 891_333_333);
  assert.equal(alternative.creditWon, 26_739_999);
  assert.equal(alternative.totalTaxWon, 864_593_330);
});

test("spouse statutory ceiling subtracts public charges/debt but not funeral", () => {
  const result = compareInheritance(inheritance({ estate: "50", debt: "5", funeral: "0.1" }));
  assert.equal(line(result.alternatives[0], "가정한 배우자 상속액"), 1_500_000_000);
  assert.equal(line(result.alternatives[0], "배우자 상속공제"), 1_500_000_000);
});

test("spouse actual amount is subject to minimum, statutory share, and 30억원 cap", () => {
  const zero = compareInheritance(inheritance({ spouseAllocation: "0" }));
  assert.equal(line(zero.alternatives[1], "배우자 상속공제"), 500_000_000);
  const actual = compareInheritance(inheritance({ spouseAllocation: "10" }));
  assert.equal(line(actual.alternatives[1], "배우자 상속공제"), 1_000_000_000);
  const statutory = compareInheritance(inheritance({ spouseAllocation: "30" }));
  assert.equal(line(statutory.alternatives[1], "배우자 상속공제"), 1_666_666_666);
  const capped = compareInheritance(inheritance({ estate: "100", children: "1", spouseAllocation: "90" }));
  assert.equal(line(capped.alternatives[0], "가정한 배우자 상속액"), 6_000_000_000);
  assert.equal(line(capped.alternatives[0], "배우자 상속공제"), 3_000_000_000);
  assert.equal(line(capped.alternatives[1], "배우자 상속공제"), 3_000_000_000);
});

test("NTS interpretation retains spouse's 500m minimum when statutory share is lower", () => {
  const below = compareInheritance(inheritance({ estate: "20", children: "10", spouseAllocation: "4.99999999" }));
  const boundary = compareInheritance(inheritance({ estate: "20", children: "10", spouseAllocation: "5" }));
  assert.equal(line(boundary.alternatives[0], "가정한 배우자 상속액"), 260_869_565);
  assert.equal(line(boundary.alternatives[0], "배우자 상속공제"), 500_000_000);
  assert.equal(line(below.alternatives[1], "배우자 상속공제"), 500_000_000);
  assert.equal(line(boundary.alternatives[1], "배우자 상속공제"), 500_000_000);
  assert.equal(boundary.baseline?.totalTaxWon, 114_945_000);
  assert.equal(boundary.alternatives[1].taxableWon, 595_000_000);
  assert.equal(boundary.alternatives[1].totalTaxWon, 114_945_000);
});

test("NTS interpretation allows lump deduction when spouse takes all but children remain legal co-heirs", () => {
  for (const values of [{ spouseAllocation: "50" }, { debt: "5", spouseAllocation: "45" }] as Array<Record<string, string>>) {
    const result = compareInheritance(inheritance(values));
    assert.equal(result.status, "ready");
    assert.equal(line(result.alternatives[1], "일괄공제"), 500_000_000);
    assert.equal(result.alternatives[1].totalTaxWon, result.alternatives[0].totalTaxWon);
    assert.ok(result.assumptions.some((message) => message.includes("법정상속인") && message.includes("상속포기가 없는")));
  }
});

test("funeral expenses apply statutory minimum and maximum without inventing input", () => {
  assert.equal(line(compareInheritance(inheritance({ funeral: "0" })).baseline, "차감: 장례비 공제"), 5_000_000);
  assert.equal(line(compareInheritance(inheritance({ funeral: "0.07" })).baseline, "차감: 장례비 공제"), 7_000_000);
  assert.equal(line(compareInheritance(inheritance({ funeral: "0.5" })).baseline, "차감: 장례비 공제"), 10_000_000);
  assert.equal(compareInheritance(inheritance({ funeral: "" })).status, "needs_info");
});

test("net financial deduction applies full small amount, minimum, percentage, and cap", () => {
  for (const [financial, expected] of [["0", 0], ["0.17", 17_000_000], ["0.2", 20_000_000], ["0.5", 20_000_000], ["2", 40_000_000], ["20", 200_000_000]] as const) {
    assert.equal(line(compareInheritance(inheritance({ financial })).baseline, "금융재산 상속공제"), expected);
  }
  assert.equal(line(compareInheritance(inheritance({ financial: "2", financialDebt: "1", debt: "1" })).baseline, "금융재산 상속공제"), 20_000_000);
  assert.equal(line(compareInheritance(inheritance({ financial: "1", financialDebt: "2", debt: "2" })).baseline, "금융재산 상속공제"), 0);
});

test("basic plus child deductions may exceed lump sum, but total deduction cannot exceed estate", () => {
  const many = compareInheritance(inheritance({ children: "8" }));
  assert.equal(line(many.baseline, "기초·자녀 공제"), 600_000_000);
  const small = compareInheritance(inheritance({ estate: "1", debt: "0.9", financial: "0", children: "1" }));
  assert.equal(line(small.baseline, "상속세 과세가액"), 5_000_000);
  assert.equal(line(small.baseline, "상속공제 적용 합계"), 5_000_000);
  assert.equal(small.baseline?.taxableWon, 0);
  assert.equal(small.baseline?.totalTaxWon, 0);
  assert.equal(compareInheritance(inheritance({ estate: "0", financial: "0" })).baseline?.taxableWon, 0);
});

test("no spouse has one honest inheritance estimate and no fabricated distribution savings", () => {
  const result = compareInheritance(inheritance({ spouse: "no" }));
  assert.equal(result.status, "ready");
  assert.equal(line(result.baseline, "배우자 상속공제"), 0);
  assert.deepEqual(result.alternatives, []);
  assert.ok(result.assumptions.some((text) => text.includes("총상속세가 줄어드는 것은 아닙니다")));
});

test("inheritance taxable-base minimum is strict below 500,000 won", () => {
  const below = compareInheritance(inheritance({ estate: "5.05499999", financial: "0", spouse: "no", children: "1" }));
  const boundary = compareInheritance(inheritance({ estate: "5.055", financial: "0", spouse: "no", children: "1" }));
  assert.equal(below.baseline?.taxableWon, 499_999);
  assert.equal(below.baseline?.totalTaxWon, 0);
  assert.equal(boundary.baseline?.taxableWon, 500_000);
  assert.equal(boundary.baseline?.totalTaxWon, 48_500);
});

test("missing, unknown, inconsistent, and out-of-scope inheritance inputs do not calculate", () => {
  for (const values of [
    { debt: "" }, { debt: "모름" }, { debt: "-1" }, { financial: "51" }, { debt: "51" },
    { financialDebt: "1", debt: "0" }, { children: "0" }, { children: "1.5" }, { children: "21" },
    { spouse: "unknown" }, { spouse: "no", spouseAllocation: "0" }, { spouseAllocation: "51" },
    { estate: "1e3" }, { estate: "Infinity" }, { resident: "" }, { standardCase: "" },
  ] as Array<Record<string, string>>) {
    const result = compareInheritance(inheritance(values));
    assert.equal(result.status, "needs_info", JSON.stringify(values));
    assert.equal(result.baseline, null);
    assert.deepEqual(result.alternatives, []);
  }
  assert.equal(compareInheritance(inheritance({ resident: "no" })).status, "unsupported");
  assert.equal(compareInheritance(inheritance({ standardCase: "no" })).status, "unsupported");
});

test("300m cash: one adult child pays 38.8m; three adult children pay 14.55m", () => {
  const result = compareGift(gift());
  assert.equal(result.status, "ready");
  assert.equal(result.baseline?.taxableWon, 250_000_000);
  assert.equal(result.baseline?.grossTaxWon, 40_000_000);
  assert.equal(result.baseline?.creditWon, 1_200_000);
  assert.equal(result.baseline?.totalTaxWon, 38_800_000);
  assert.equal(result.alternatives[0].taxableWon, 150_000_000);
  assert.equal(result.alternatives[0].grossTaxWon, 15_000_000);
  assert.equal(result.alternatives[0].creditWon, 450_000);
  assert.equal(result.alternatives[0].totalTaxWon, 14_550_000);
  assert.equal(result.baseline!.totalTaxWon - result.alternatives[0].totalTaxWon, 24_250_000);
});

test("gift deductions depend on confirmed relationship and each recipient", () => {
  for (const [recipientType, amount, expected] of [
    ["adult_child", "0.5", 0], ["minor_child", "0.5", 2_910_000],
    ["spouse", "6", 0], ["other_relative", "0.5", 3_880_000], ["unrelated", "0.5", 4_850_000],
  ] as const) {
    const result = compareGift(gift({ recipientType, giftAmount: amount, recipientCount: "1" }));
    assert.equal(result.baseline?.totalTaxWon, expected, recipientType);
    assert.deepEqual(result.alternatives, []);
  }
});

test("gift tax minimum applies per recipient, before credit and rounding", () => {
  assert.equal(compareGift(gift({ giftAmount: "0.50499999", recipientCount: "1" })).baseline?.totalTaxWon, 0);
  assert.equal(compareGift(gift({ giftAmount: "0.505", recipientCount: "1" })).baseline?.totalTaxWon, 48_500);
  const divided = compareGift(gift({ giftAmount: "0.01000011", recipientType: "unrelated", recipientCount: "3" }));
  assert.equal(divided.baseline?.taxableWon, 1_000_011);
  assert.equal(divided.baseline?.totalTaxWon, 97_000);
  assert.equal(divided.alternatives[0].taxableWon, 1_000_011);
  assert.equal(divided.alternatives[0].totalTaxWon, 0);
});

test("one-won remainder preserves total property and never taxes a combined base", () => {
  const result = compareGift(gift({ giftAmount: "3.00000001" }));
  const alternative = result.alternatives[0];
  assert.equal(line(alternative, "증여할 현금 총액"), 300_000_001);
  assert.equal(line(alternative, "1인당 증여액"), 100_000_000);
  assert.equal(line(alternative, "실제 적용 공제 합계"), 150_000_000);
  assert.equal(alternative.taxableWon, 150_000_001);
  assert.equal(alternative.totalTaxWon, 14_550_000);
  assert.match(alternative.lines[1].note ?? "", /1원/);
});

test("invalid relationship, multiple spouses, unknown count, and unsupported gift scope block output", () => {
  for (const values of [
    { recipientType: "grandchild" }, { recipientType: "toString" }, { recipientType: "" },
    { recipientType: "spouse", recipientCount: "2" }, { recipientCount: "0" }, { recipientCount: "21" },
    { giftAmount: "" }, { giftAmount: "모름" }, { giftAmount: "0.000000001" }, { recipientCount: "모름" },
    { resident: "" }, { standardCase: "" },
  ] as Array<Record<string, string>>) {
    const result = compareGift(gift(values));
    assert.equal(result.status, "needs_info", JSON.stringify(values));
    assert.equal(result.baseline, null);
    assert.deepEqual(result.alternatives, []);
  }
  assert.equal(compareGift(gift({ resident: "no" })).status, "unsupported");
  assert.equal(compareGift(gift({ standardCase: "no" })).status, "unsupported");
});
