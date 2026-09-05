import { buildUncalculatedResult, moneyResult } from "./calculation";
import type { CalculationContext, CalculationResult, TaxKind } from "./types";
import { EOK_WON, formatEokLabel, wonToEok } from "./money";

export type SupportedTaxInput = {
  tax_kind: Extract<TaxKind, "inheritance_tax" | "gift_tax">;
  taxable_value_eok: number;
  taxable_value_won?: number;
  basis_id: string;
  context: CalculationContext;
};

export const SUPPORTED_TAX_LAW_REFERENCES = [
  {
    label: "상속세 및 증여세법 제26조",
    url: "https://www.law.go.kr/lsInfoP.do?lsId=001561#0000",
    note: "상속세 과세표준 구간별 세율과 누진공제 방식"
  },
  {
    label: "상속세 및 증여세법 제56조",
    url: "https://www.law.go.kr/lsInfoP.do?lsId=001561#0000",
    note: "증여세 산출세액은 제26조 세율을 준용"
  }
] as const;

export function calculateInheritanceOrGiftTax(input: SupportedTaxInput): CalculationResult {
  const result = buildUncalculatedResult([
    "확인된 과세표준에 상속세 및 증여세법 제26조 세율표만 적용했습니다.",
    "과세표준 산정, 공제, 가산, 신고세액공제, 지방세·취득세·양도세는 포함하지 않았습니다."
  ]);
  const taxableValueWon = input.taxable_value_won ?? Math.round(input.taxable_value_eok * EOK_WON);
  const calculatedTaxWon = calculateProgressiveTaxWon(taxableValueWon);
  const calculatedTax = wonToEok(calculatedTaxWon);
  const label = `${formatEokLabel(calculatedTax)} 산출세액`;
  const taxResult = moneyResult(calculatedTax, "calculable", label, input.basis_id);

  result.taxable_value = moneyResult(input.taxable_value_eok, "calculable", `${formatEokLabel(input.taxable_value_eok)} 확인 과세표준`, input.basis_id);
  result.total_tax = taxResult;
  result.total_burden = taxResult;
  result.immediate_cash_required = taxResult;
  result.confidence = "calculable";
  result.status = "calculable";
  result.status_reasons = [
    `${input.tax_kind === "gift_tax" ? "증여세" : "상속세"} 협소 계산 지원`,
    ...SUPPORTED_TAX_LAW_REFERENCES.map((reference) => reference.label),
    `법령 기준: ${input.context.law_version}`
  ];

  if (input.tax_kind === "gift_tax") {
    result.gift_tax = taxResult;
    result.inheritance_tax = moneyResult(null, "not_applicable", "증여세 계산 사례", input.basis_id);
  } else {
    result.inheritance_tax = taxResult;
    result.gift_tax = moneyResult(null, "not_applicable", "상속세 계산 사례", input.basis_id);
  }

  return result;
}

export function calculateProgressiveTaxEok(taxableBaseEok: number) {
  if (!Number.isFinite(taxableBaseEok) || taxableBaseEok < 0) {
    throw new Error("taxableBaseEok must be a non-negative number.");
  }
  return wonToEok(calculateProgressiveTaxWon(Math.round(taxableBaseEok * EOK_WON)));
}

export function calculateProgressiveTaxWon(taxableBaseWon: number) {
  if (!Number.isInteger(taxableBaseWon) || taxableBaseWon < 0) {
    throw new Error("taxableBaseWon must be a non-negative integer.");
  }
  if (taxableBaseWon === 0) return 0;

  const brackets = [
    { threshold: 100_000_000, rate: 0.1, deduction: 0 },
    { threshold: 500_000_000, rate: 0.2, deduction: 10_000_000 },
    { threshold: 1_000_000_000, rate: 0.3, deduction: 60_000_000 },
    { threshold: 3_000_000_000, rate: 0.4, deduction: 160_000_000 },
    { threshold: Number.POSITIVE_INFINITY, rate: 0.5, deduction: 460_000_000 }
  ];
  const bracket = brackets.find((item) => taxableBaseWon <= item.threshold) ?? brackets.at(-1)!;
  return Math.max(0, Math.round(taxableBaseWon * bracket.rate - bracket.deduction));
}
