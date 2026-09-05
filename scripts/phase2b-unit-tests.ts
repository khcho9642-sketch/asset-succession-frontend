import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildBaselineRequiredComparison,
  compareCalculatedResults,
  moneyResult
} from "../lib/phase2b/calculation";
import { buildScenarioPlan } from "../lib/phase2b/engine";
import { phase2bFixtures } from "../lib/phase2b/fixtures";
import type { CalculationResult, ClientFacts, PlanningTrack } from "../lib/phase2b/types";

describe("Phase 2B scenario engine", () => {
  it("returns deterministic scenario priorities for identical inputs", () => {
    for (const fixture of Object.values(phase2bFixtures)) {
      const first = serializePriorities(buildScenarioPlan(fixture));
      const second = serializePriorities(buildScenarioPlan(clone(fixture)));
      assert.equal(first, second);
    }
  });

  it("branches all four top-level tracks without inventing product categories", () => {
    const observedTracks = new Set<PlanningTrack>();
    for (const fixture of Object.values(phase2bFixtures)) {
      const plan = buildScenarioPlan(fixture);
      for (const scenario of plan.scenarios) observedTracks.add(scenario.track);
      assert.ok(plan.scenarios.every((scenario) => ["inheritance", "gift", "business_succession", "capital_gains"].includes(scenario.track)));
    }
    assert.deepEqual([...observedTracks].sort(), ["business_succession", "capital_gains", "gift", "inheritance"]);
  });

  it("requires a baseline before expected savings or net effect can be displayed", () => {
    const comparison = buildBaselineRequiredComparison(null, "기준안 없음");
    assert.equal(comparison.expected_tax_savings.value_eok, null);
    assert.equal(comparison.expected_tax_savings.status, "needs_engine");
    assert.equal(comparison.expected_net_effect.value_eok, null);
  });

  it("does not convert missing calculated values to zero", () => {
    const plan = buildScenarioPlan(phase2bFixtures.caseCBusinessSuccession);
    for (const scenario of plan.scenarios) {
      assert.equal(scenario.calculation_result.total_tax.value_eok, null);
      assert.notEqual(scenario.calculation_result.total_tax.label, "0원");
      assert.equal(scenario.comparison.expected_tax_savings.value_eok, null);
    }
  });

  it("calculates savings and net effect only from calculated baseline/scenario values", () => {
    const baseline = calculatedResult("basis-1", 10, 12);
    const scenario = calculatedResult("basis-1", 7, 9);
    const comparison = compareCalculatedResults("baseline-1", baseline, scenario);
    assert.equal(comparison.expected_tax_savings.value_eok, 3);
    assert.equal(comparison.savings_rate.value_eok, 0.3);
    assert.equal(comparison.expected_net_effect.value_eok, 3);
  });

  it("labels negative savings as additional burden, not savings", () => {
    const baseline = calculatedResult("basis-1", 10, 12);
    const scenario = calculatedResult("basis-1", 12, 14);
    const comparison = compareCalculatedResults("baseline-1", baseline, scenario);
    assert.equal(comparison.expected_tax_savings.value_eok, -2);
    assert.match(comparison.expected_tax_savings.label, /추가 예상 세부담/);
    assert.doesNotMatch(comparison.expected_tax_savings.label, /절세 예상/);
  });

  it("blocks comparisons across different valuation/family/asset bases", () => {
    const baseline = calculatedResult("basis-1", 10, 12);
    const scenario = calculatedResult("basis-2", 7, 9);
    const comparison = compareCalculatedResults("baseline-1", baseline, scenario);
    assert.equal(comparison.comparison_status, "incomparable");
    assert.equal(comparison.expected_tax_savings.value_eok, null);
  });

  it("separates Report V2 and Conversational Precheck contracts", () => {
    const plan = buildScenarioPlan(phase2bFixtures.caseAInheritance);
    assert.equal(plan.report_v2_contract.issue, "#5");
    assert.equal(plan.conversational_precheck_contract.issue, "#6");
    assert.ok(plan.report_v2_contract.blocked_until_engine.includes("예상 절세액"));
    assert.deepEqual(plan.conversational_precheck_contract.accepted_sources, ["button", "confirmed_extraction"]);
  });

  it("does not fabricate numbers from omitted debts or tax calculations", () => {
    const debtlessFacts: ClientFacts = {
      ...phase2bFixtures.caseAInheritance,
      debts: [],
      unknown_items: []
    };
    const plan = buildScenarioPlan(debtlessFacts);
    assert.equal(plan.baseline.calculation_result.asset_value.value_eok, 50);
    assert.equal(plan.baseline.calculation_result.total_tax.value_eok, null);
    assert.equal(plan.baseline.calculation_result.liquidity_gap.value_eok, null);
    assert.ok(plan.scenarios.every((scenario) => scenario.calculation_result.total_burden.value_eok === null));
  });
});

function serializePriorities(plan: ReturnType<typeof buildScenarioPlan>) {
  return plan.scenarios.map((scenario) => `${scenario.scenario_id}:${scenario.priority}:${scenario.calculation_status}`).join("|");
}

function calculatedResult(basis: string, totalTax: number, totalBurden: number): CalculationResult {
  return {
    asset_value: moneyResult(100, "calculable", "100억", basis),
    taxable_value: moneyResult(100, "calculable", "100억", basis),
    inheritance_tax: moneyResult(0, "calculable", "0억", basis),
    gift_tax: moneyResult(0, "calculable", "0억", basis),
    capital_gains_tax: moneyResult(0, "calculable", "0억", basis),
    acquisition_related_tax: moneyResult(0, "calculable", "0억", basis),
    other_tax: moneyResult(0, "calculable", "0억", basis),
    execution_cost: moneyResult(totalBurden - totalTax, "calculable", `${totalBurden - totalTax}억`, basis),
    total_tax: moneyResult(totalTax, "calculable", `${totalTax}억`, basis),
    total_burden: moneyResult(totalBurden, "calculable", `${totalBurden}억`, basis),
    immediate_cash_required: moneyResult(0, "calculable", "0억", basis),
    liquidity_gap: moneyResult(0, "calculable", "0억", basis),
    parent_remaining_assets: moneyResult(0, "calculable", "0억", basis),
    child_transferred_assets: moneyResult(0, "calculable", "0억", basis),
    confidence: "calculable",
    status: "calculable",
    status_reasons: []
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
