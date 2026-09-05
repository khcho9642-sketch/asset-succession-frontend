import { buildUncalculatedResult, moneyResult } from "./calculation";
import type { CalculationContext, CalculationResult, TaxKind } from "./types";
import { formatEokLabel } from "./money";

export type SupportedTaxInput = {
  tax_kind: Extract<TaxKind, "inheritance_tax" | "gift_tax">;
  taxable_value_eok: number;
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
  const calculatedTax = calculateProgressiveTaxEok(input.taxable_value_eok);
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
  if (!Number.isFinite(taxableBaseEok) || taxableBaseEok <= 0) {
    throw new Error("taxableBaseEok must be a positive number.");
  }

  if (taxableBaseEok <= 1) return roundTax(taxableBaseEok * 0.1);
  if (taxableBaseEok <= 5) return roundTax(0.1 + (taxableBaseEok - 1) * 0.2);
  if (taxableBaseEok <= 10) return roundTax(0.9 + (taxableBaseEok - 5) * 0.3);
  if (taxableBaseEok <= 30) return roundTax(2.4 + (taxableBaseEok - 10) * 0.4);
  return roundTax(10.4 + (taxableBaseEok - 30) * 0.5);
}

function roundTax(value: number) {
  return Math.round(value * 10_000) / 10_000;
}
