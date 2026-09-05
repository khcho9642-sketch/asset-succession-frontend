import type { CalculationResult, CalculationStatus, MoneyResult, ScenarioComparison } from "./types";

export function moneyResult(
  value_eok: number | null,
  status: CalculationStatus,
  label: string,
  basis?: string
): MoneyResult {
  return { value_eok, status, label, basis };
}

export function blockedMoney(label = "계산엔진 연결 후 산정", status: CalculationStatus = "needs_engine") {
  return moneyResult(null, status, label);
}

export function buildUncalculatedResult(statusReasons: string[]): CalculationResult {
  return {
    asset_value: blockedMoney("현재 입력 자산가액 기준"),
    taxable_value: blockedMoney(),
    inheritance_tax: blockedMoney(),
    gift_tax: blockedMoney(),
    capital_gains_tax: blockedMoney(),
    acquisition_related_tax: blockedMoney(),
    other_tax: blockedMoney(),
    execution_cost: blockedMoney("실행비용 입력 후 산정", "needs_info"),
    total_tax: blockedMoney(),
    total_burden: blockedMoney(),
    immediate_cash_required: blockedMoney("추가정보 필요", "needs_info"),
    liquidity_gap: blockedMoney("정밀 계산에서 산정", "needs_engine"),
    parent_remaining_assets: blockedMoney("가족별 계산 후 산정", "needs_engine"),
    child_transferred_assets: blockedMoney("가족별 계산 후 산정", "needs_engine"),
    confidence: "needs_engine",
    status: "needs_engine",
    status_reasons: statusReasons
  };
}

export function buildBaselineRequiredComparison(baselineId: string | null, reason: string): ScenarioComparison {
  return {
    baseline_id: baselineId,
    expected_tax_savings: blockedMoney("기준안 계산 후 산정", "needs_engine"),
    savings_rate: blockedMoney("기준안 계산 후 산정", "needs_engine"),
    expected_net_effect: blockedMoney("기준안 총부담 계산 후 산정", "needs_engine"),
    comparison_status: "needs_engine",
    comparison_reasons: [reason]
  };
}

export function compareCalculatedResults(
  baselineId: string,
  baseline: CalculationResult,
  scenario: CalculationResult
): ScenarioComparison {
  const sameBasis = baseline.asset_value.basis && baseline.asset_value.basis === scenario.asset_value.basis;
  const baselineTax = baseline.total_tax.value_eok;
  const scenarioTax = scenario.total_tax.value_eok;
  const baselineBurden = baseline.total_burden.value_eok;
  const scenarioBurden = scenario.total_burden.value_eok;

  if (!sameBasis) {
    return {
      baseline_id: baselineId,
      expected_tax_savings: blockedMoney("비교 불가", "incomparable"),
      savings_rate: blockedMoney("비교 불가", "incomparable"),
      expected_net_effect: blockedMoney("비교 불가", "incomparable"),
      comparison_status: "incomparable",
      comparison_reasons: ["기준일·자산가액·가족구성이 다른 결과는 하나의 절세액으로 비교하지 않습니다."]
    };
  }

  if (baselineTax === null || scenarioTax === null || baselineBurden === null || scenarioBurden === null) {
    return buildBaselineRequiredComparison(baselineId, "기준안과 시나리오의 계산엔진 결과가 모두 있어야 절세액과 순효과를 산정합니다.");
  }

  const savings = baselineTax - scenarioTax;
  const netEffect = baselineBurden - scenarioBurden;
  const savingsRate = baselineTax === 0 ? null : savings / baselineTax;

  return {
    baseline_id: baselineId,
    expected_tax_savings: moneyResult(
      savings,
      "calculable",
      savings >= 0 ? `${formatEok(savings)} 절세 예상` : `${formatEok(Math.abs(savings))} 추가 예상 세부담`
    ),
    savings_rate: moneyResult(
      savingsRate,
      savingsRate === null ? "incomparable" : "calculable",
      savingsRate === null ? "기준안 세액 0원으로 절세율 비교 불가" : `${(savingsRate * 100).toFixed(1)}%`
    ),
    expected_net_effect: moneyResult(netEffect, "calculable", netEffect >= 0 ? `${formatEok(netEffect)} 순효과` : `${formatEok(Math.abs(netEffect))} 추가 총부담`),
    comparison_status: savingsRate === null ? "incomparable" : "calculable",
    comparison_reasons: ["예상 절세액은 기준안 예상세액과 시나리오 예상세액의 차이로만 산정합니다."]
  };
}

export function formatEok(value: number) {
  const absolute = Math.abs(value);
  const label = `${Number.isInteger(absolute) ? absolute.toFixed(0) : absolute.toFixed(1)}억`;
  return value < 0 ? `-${label}` : label;
}
