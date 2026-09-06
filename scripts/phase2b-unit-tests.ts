import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAssessmentMetrics, eokAmountToWon } from "../lib/assessment";
import type { AssessmentSnapshot } from "../lib/assessment";
import {
  buildBaselineRequiredComparison,
  compareCalculatedResults,
  moneyResult
} from "../lib/phase2b/calculation";
import { getQuestionHelp, parseConversationalInput } from "../lib/phase2b/conversation";
import { buildScenarioPlan, getInternalScenarioCandidateLibraryCount } from "../lib/phase2b/engine";
import { phase2bFixtures } from "../lib/phase2b/fixtures";
import { parseKoreanMoneyRangeToEok, parseKoreanMoneyToEok } from "../lib/phase2b/money";
import { normalizeAssessmentSnapshot } from "../lib/phase2b/normalize";
import { calculateProgressiveTaxEok, calculateProgressiveTaxWon } from "../lib/phase2b/tax";
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

  it("parses explicit Korean money units without treating plain numbers as confirmed money", () => {
    assert.deepEqual(pickMoney(parseKoreanMoneyToEok("5000만원")), { status: "parsed", value_eok: 0.5, value_won: 50_000_000 });
    assert.deepEqual(pickMoney(parseKoreanMoneyToEok("5천만원")), { status: "parsed", value_eok: 0.5, value_won: 50_000_000 });
    assert.deepEqual(pickMoney(parseKoreanMoneyToEok("1억 5천만원")), { status: "parsed", value_eok: 1.5, value_won: 150_000_000 });
    assert.deepEqual(pickMoney(parseKoreanMoneyToEok("3억 5천만원")), { status: "parsed", value_eok: 3.5, value_won: 350_000_000 });
    assert.deepEqual(pickMoney(parseKoreanMoneyToEok("0.5억")), { status: "parsed", value_eok: 0.5, value_won: 50_000_000 });
    assert.equal(parseKoreanMoneyToEok("42").status, "needs_confirmation");
    assert.equal(parseKoreanMoneyToEok("-5억").status, "invalid");
    assert.equal(parseKoreanMoneyToEok("abc").status, "invalid");
  });

  it("keeps money ranges as ranges rather than confirmed sums", () => {
    const rangeA = parseKoreanMoneyRangeToEok("5억~10억");
    const rangeB = parseKoreanMoneyRangeToEok("5~10억");
    assert.equal(rangeA.status, "range");
    assert.equal(rangeB.status, "range");
    if (rangeA.status === "range" && rangeB.status === "range") {
      assert.equal(rangeA.min_won, 500_000_000);
      assert.equal(rangeA.max_won, 1_000_000_000);
      assert.equal(rangeB.min_won, 500_000_000);
      assert.equal(rangeB.max_won, 1_000_000_000);
    }
  });

  it("calculates only the supported inheritance/gift progressive tax schedule", () => {
    assert.equal(calculateProgressiveTaxEok(0), 0);
    assert.equal(calculateProgressiveTaxEok(1), 0.1);
    assert.equal(calculateProgressiveTaxEok(3), 0.5);
    assert.equal(calculateProgressiveTaxEok(7), 1.5);
    assert.equal(calculateProgressiveTaxEok(20), 6.4);
    assert.equal(calculateProgressiveTaxEok(40), 15.4);
    assert.equal(calculateProgressiveTaxWon(0), 0);
    assert.equal(calculateProgressiveTaxWon(300_000_000), 50_000_000);
  });

  it("connects a confirmed gift-tax-base fixture to baseline/scenario comparison", () => {
    const plan = buildScenarioPlan(phase2bFixtures.caseBGift);
    const stepwise = plan.scenarios.find((scenario) => scenario.scenario_id === "gift-stepwise-transfer");
    assert.equal(plan.baseline.calculation_result.total_tax.value_eok, 0.5);
    assert.equal(stepwise?.calculation_result.total_tax.value_eok, 0.2);
    assert.equal(stepwise?.comparison.expected_tax_savings.value_eok, 0.3);
    assert.equal(stepwise?.comparison.comparison_status, "calculable");
  });

  it("extracts conversational candidates but requires explicit confirmation outside the parser", () => {
    const parsed = parseConversationalInput("상속 준비, 배우자 있음, 자녀 2명, 부동산 42억, 금융자산 8억");
    assert.equal(parsed.status, "candidate");
    assert.ok(parsed.facts.some((fact) => fact.label === "준비 목적" && fact.value === "상속"));
    assert.ok(parsed.facts.some((fact) => fact.label === "배우자 유무" && fact.value === "있음"));
    assert.ok(parsed.facts.some((fact) => fact.label === "자녀 수" && fact.value.includes("성년 여부 미상")));
    assert.ok(parsed.facts.every((fact) => fact.label !== "성년 자녀 수" && fact.label !== "미성년 자녀 수"));
    assert.ok(parsed.facts.some((fact) => fact.value === "부동산 42억"));
    assert.ok(parsed.facts.every((fact) => fact.confidence));
  });

  it("does not infer parent basis or child age buckets from spouse and child count", () => {
    const parsed = parseConversationalInput("배우자 있음, 자녀 2명");
    assert.equal(parsed.status, "candidate");
    assert.ok(parsed.facts.some((fact) => fact.label === "배우자 유무" && fact.value === "있음"));
    assert.ok(parsed.facts.some((fact) => fact.label === "자녀 수" && fact.value === "2명(성년 여부 미상)"));
    assert.ok(!parsed.facts.some((fact) => fact.label === "가족 기준" && fact.value === "부모 2명 기준"));
    assert.ok(!parsed.facts.some((fact) => fact.label === "미성년 자녀 수" && fact.value === "0명"));
  });

  it("flags parent-owned property as owner confirmation, not writer-owned assets", () => {
    const parsed = parseConversationalInput("아버지 재산이에요. 아파트 두 채와 예금 8억이 있어요.");
    assert.equal(parsed.status, "candidate");
    assert.ok(parsed.facts.some((fact) => fact.label === "소유자 관계" && fact.value.includes("실제 소유자 확인 필요")));
    assert.ok(parsed.facts.some((fact) => fact.value === "부동산 2개, 금액 미상"));
    assert.ok(parsed.facts.some((fact) => fact.value === "금융자산 8억"));
    assert.ok(!parsed.facts.some((fact) => fact.value === "부동산 8억"));
  });

  it("does not convert uncertain no-debt language into confirmed zero debt", () => {
    const parsed = parseConversationalInput("대출 없는 것 같아요");
    assert.equal(parsed.status, "candidate");
    assert.ok(parsed.facts.some((fact) => fact.label === "채무 여부" && fact.value.includes("미확정")));
    assert.ok(!parsed.facts.some((fact) => fact.target.kind === "choice" && fact.target.answerKey === "debt" && fact.target.choice === "해당 없음"));
  });

  it("connects real assessment tax-base inputs to baseline, alternative, web/PDF model values", () => {
    const snapshot = assessmentSnapshotWithTaxBases({
      baseline: "3",
      alternative: "1.5",
      taxKind: "gift_tax"
    });
    const facts = normalizeAssessmentSnapshot(snapshot);
    const plan = buildScenarioPlan(facts);
    const stepwise = plan.scenarios.find((scenario) => scenario.scenario_id === "gift-stepwise-transfer");
    assert.equal(facts.confirmed_tax_bases?.length, 2);
    assert.equal(plan.baseline.calculation_result.total_tax.value_eok, 0.5);
    assert.equal(stepwise?.calculation_result.total_tax.value_eok, 0.2);
    assert.equal(stepwise?.comparison.expected_tax_savings.value_eok, 0.3);
    assert.equal(stepwise?.comparison.comparison_status, "calculable");
  });

  it("treats confirmed taxable base zero as valid calculable zero tax", () => {
    const snapshot = assessmentSnapshotWithTaxBases({
      baseline: "0",
      alternative: "0",
      taxKind: "inheritance_tax"
    });
    const plan = buildScenarioPlan(normalizeAssessmentSnapshot(snapshot));
    assert.equal(plan.baseline.calculation_result.total_tax.status, "calculable");
    assert.equal(plan.baseline.calculation_result.total_tax.value_eok, 0);
  });

  it("calculates a liquidity gap when confirmed financial assets are zero", () => {
    const facts: ClientFacts = {
      ...phase2bFixtures.caseBGift,
      assets: [
        ...phase2bFixtures.caseBGift.assets,
        {
          asset_id: "zero-financial-assets",
          type: "financial",
          owner: "unknown",
          current_value_eok: 0,
          current_value_won: 0,
          current_value_status: "confirmed",
          location_level: "none",
          disposable: "yes",
          succession_preference: "compare"
        }
      ]
    };
    const plan = buildScenarioPlan(facts);
    assert.equal(plan.baseline.calculation_result.total_tax.value_eok, 0.5);
    assert.equal(plan.baseline.calculation_result.liquidity_gap.value_eok, 0.5);
  });

  it("does not hide negative net assets behind zero", () => {
    const snapshot = assessmentSnapshotWithTaxBases({
      baseline: "0",
      alternative: "0",
      taxKind: "inheritance_tax",
      realEstate: "1",
      debt: "3"
    });
    const metrics = buildAssessmentMetrics(snapshot);
    assert.equal(metrics.netAssets, "-1.9억");
  });

  it("keeps help text and unknown paths distinct from confirmed answers", () => {
    assert.match(getQuestionHelp("assets"), /소유자/);
    const parsed = parseConversationalInput("금액을 정확히 모르겠어요");
    assert.equal(parsed.status, "help");
    assert.equal(parsed.facts.length, 0);
  });

  it("does not rank insurance as a first-priority solution from a liquidity ratio alone", () => {
    const plan = buildScenarioPlan(phase2bFixtures.caseAInheritance);
    const insurance = plan.scenarios.find((scenario) => scenario.scenario_id === "inheritance-insurance-liquidity");
    assert.notEqual(insurance?.priority, "priority");
  });

  it("keeps the 36-scenario candidate library internal and exposes only selected results", () => {
    const plan = buildScenarioPlan(phase2bFixtures.caseAInheritance);
    assert.equal(getInternalScenarioCandidateLibraryCount(), 36);
    assert.equal(plan.internal_analysis.candidate_library_count, 36);
    assert.equal(plan.internal_analysis.evaluated_candidate_count, 36);
    assert.equal(plan.internal_analysis.disclosure_label, "36개 시나리오 내부 분석 완료");
    assert.equal(plan.internal_analysis.user_visible_disclosure, "summary_only");
    assert.equal(plan.internal_analysis.hidden_candidate_lists, true);
    assert.equal(plan.display_scenarios.baseline.baseline_id, plan.baseline.baseline_id);
    assert.ok(plan.display_scenarios.recommended.length <= 3);
    assert.ok(plan.display_scenarios.additional_reviews.length <= 2);
    assert.ok(plan.display_scenarios.comparison_scenarios.length <= 6);
    assert.ok(plan.display_scenarios.comparison_scenarios.every((scenario) => scenario.priority !== "baseline"));
  });

  it("separates insurance liquidity support from the main three recommendations", () => {
    const plan = buildScenarioPlan(phase2bFixtures.caseAInheritance);
    assert.ok(plan.display_scenarios.recommended.every((scenario) => scenario.scenario_id !== "inheritance-insurance-liquidity"));
    assert.equal(plan.display_scenarios.liquidity_support?.scenario_id, "inheritance-insurance-liquidity");
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

function pickMoney(value: ReturnType<typeof parseKoreanMoneyToEok>) {
  return { status: value.status, value_eok: value.value_eok, value_won: value.value_won };
}

function assessmentSnapshotWithTaxBases(options: {
  baseline: string;
  alternative: string;
  taxKind: "inheritance_tax" | "gift_tax";
  realEstate?: string;
  debt?: string;
}): AssessmentSnapshot {
  const alternativeScenario = options.taxKind === "gift_tax" ? "gift-stepwise-transfer" : "inheritance-spouse-allocation";
  const realEstate = options.realEstate ?? "42";
  const debt = options.debt ?? "2";
  return {
    assessment_id: "AS360-20260906-UNIT01",
    created_at: "2026-09-06T00:00:00.000Z",
    review_focus: ["세금·비용", "납부재원 부족액"],
    answers: {
      purpose: { label: "준비 목적", choices: [options.taxKind === "gift_tax" ? "증여" : "상속"], detail: "" },
      family: {
        label: "가족",
        choices: ["부모 1명 기준"],
        detail: "",
        facts: { "배우자 유무": "있음", "자녀 수": "2명" }
      },
      assets: {
        label: "자산",
        choices: ["부동산", "금융자산"],
        detail: "",
        assetAmounts: { "부동산": realEstate, "금융자산": "0.1" },
        assetAmountWons: { "부동산": eokAmountToWon(Number(realEstate)), "금융자산": 10_000_000 }
      },
      debt: {
        label: "채무·과거 증여",
        choices: ["담보대출 있음"],
        detail: "",
        debtAmounts: { "담보대출 있음": debt },
        debtAmountWons: { "담보대출 있음": eokAmountToWon(Number(debt)) }
      },
      goal: { label: "승계 목표", choices: [options.taxKind === "gift_tax" ? "일부를 미리 이전" : "상속세 납부재원 준비"], detail: "" },
      review: {
        label: "결과 준비",
        choices: ["세금·비용", "납부재원 부족액"],
        detail: "",
        taxBaseAmounts: { baseline: options.baseline, [alternativeScenario]: options.alternative },
        taxBaseAmountWons: {
          baseline: eokAmountToWon(Number(options.baseline)),
          [alternativeScenario]: eokAmountToWon(Number(options.alternative))
        },
        taxBaseTaxKind: { baseline: options.taxKind, [alternativeScenario]: options.taxKind }
      }
    },
    conversation: {
      messages: [],
      confirmed_facts: [],
      raw_inputs: [],
      current_question_key: "review"
    }
  };
}
