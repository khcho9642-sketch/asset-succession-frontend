import { buildBaselineRequiredComparison, buildUncalculatedResult, compareCalculatedResults, formatEok, moneyResult } from "./calculation";
import { calculateInheritanceOrGiftTax } from "./tax";
import type {
  Baseline,
  CalculationContext,
  ConversationalPrecheckContract,
  ClientFacts,
  Constraint,
  Goal,
  PlanningTrack,
  Recommendation,
  ReportV2Contract,
  Scenario,
  ScenarioPlan
} from "./types";

const trackLabels: Record<PlanningTrack, string> = {
  inheritance: "상속",
  gift: "증여",
  business_succession: "가업상속·가업승계",
  capital_gains: "양도"
};

export function buildScenarioPlan(facts: ClientFacts, context: CalculationContext = buildDefaultCalculationContext()): ScenarioPlan {
  const enrichedFacts = { ...facts, constraints: deriveConstraints(facts) };
  const baseline = buildBaseline(enrichedFacts, context);
  const scenarios = scenarioDefinitions()
    .filter((definition) => enrichedFacts.planning_tracks.includes(definition.track) || definition.alwaysConsider)
    .map((definition) => buildScenario(definition, enrichedFacts, baseline));
  const recommendations = rankRecommendations(scenarios);

  return {
    facts: enrichedFacts,
    context,
    baseline,
    scenarios,
    recommendations,
    unknown_items: Array.from(new Set([...enrichedFacts.unknown_items, ...scenarios.flatMap((scenario) => scenario.required_information)])),
    report_v2_contract: buildReportV2Contract(),
    conversational_precheck_contract: buildConversationalPrecheckContract()
  };
}

export function buildDefaultCalculationContext(): CalculationContext {
  return {
    valuation_date: "2026-09-06",
    assumed_transfer_date: "미정",
    law_version: "상속세 및 증여세법 제26조·제56조 세율표 확인 기준(2026-09-06)",
    assumptions: [
      "미래가치 가정이 없으면 현재가액 기준으로만 표시합니다.",
      "상속세·증여세는 사용자가 확인한 과세표준이 있는 경우에만 제26조 세율표를 적용합니다.",
      "과세표준 산정, 공제, 가산, 신고세액공제, 지방세·취득세·양도세는 별도 정밀 계산 전까지 산정하지 않습니다."
    ],
    included_taxes: ["inheritance_tax", "gift_tax"],
    excluded_taxes: ["capital_gains_tax", "acquisition_related_tax", "other_tax"]
  };
}

function buildBaseline(facts: ClientFacts, context: CalculationContext): Baseline {
  const track = facts.planning_tracks.includes("capital_gains") && !facts.planning_tracks.includes("inheritance") ? "capital_gains" : "inheritance";

  return {
    baseline_id: `baseline-${facts.client_facts_id}`,
    track,
    name: track === "capital_gains" ? "현재 보유 후 기준 비교안" : "현재 구조 유지 후 상속",
    description:
      track === "capital_gains"
        ? "현재 보유 구조를 유지한 뒤 동일 자산가액과 기준일로 양도·증여 대안을 비교하기 위한 기준안입니다."
        : "현재 구조를 유지하고 별도 생전 이전 없이 가정된 승계시점에 상속이 발생하는 경우입니다.",
    context,
    calculation_result: buildCalculationShell(facts, context, "baseline", ["기준안 세액은 확인된 과세표준이 있을 때만 산정합니다.", "기준안 없이는 절세액을 표시하지 않습니다."])
  };
}

type ScenarioDefinition = {
  scenario_id: string;
  track: PlanningTrack;
  name: string;
  description: string;
  execution_tools: string[];
  alwaysConsider?: boolean;
  basePriority: Scenario["priority"];
  timeline: string[];
  requiredInfo: string[];
  evaluate: (facts: ClientFacts) => {
    priority?: Scenario["priority"];
    eligibility: Scenario["eligibility"];
    rationale: string[];
    required_information?: string[];
    calculation_status?: Scenario["calculation_status"];
  };
};

function scenarioDefinitions(): ScenarioDefinition[] {
  return [
    {
      scenario_id: "inheritance-current-structure",
      track: "inheritance",
      name: "현 구조 유지 상속",
      description: "현재 가족·자산 구조를 기준안으로 삼아 상속세와 납부재원 위험을 검토합니다.",
      execution_tools: ["상속 기준안", "납부재원 점검"],
      alwaysConsider: true,
      basePriority: "baseline",
      timeline: ["가족·자산 사실 확정", "기준안 계산", "납부재원 부족 여부 검토"],
      requiredInfo: ["상속 예상시점", "배우자공제 검토", "과거 증여 내역"],
      evaluate: (facts) => ({
        eligibility: { status: "eligible", reasons: ["모든 비교에는 기준안이 필요합니다."] },
        rationale: [`${trackLabelList(facts)} 검토를 위한 공통 기준안입니다.`],
        calculation_status: "needs_engine"
      })
    },
    {
      scenario_id: "inheritance-spouse-allocation",
      track: "inheritance",
      name: "배우자 배분 조정",
      description: "배우자 생활재원과 배우자공제 영향을 함께 보는 상속 트랙 시나리오입니다.",
      execution_tools: ["배우자 배분", "상속공제 검토"],
      basePriority: "conditional",
      timeline: ["배우자 유무 확인", "배우자 생활재원 확인", "상속재산 배분안 비교"],
      requiredInfo: ["배우자 유무", "배우자 생활재원", "상속인별 배분 의향"],
      evaluate: (facts) => {
        if (facts.family.spouse === "yes") {
          return {
            priority: "priority",
            eligibility: { status: "eligible", reasons: ["배우자가 있어 배우자공제와 배분 조정 검토가 가능합니다."] },
            rationale: ["배우자가 있다고 답했기 때문에 배우자 배분과 배우자공제 검토를 우선 후보로 둡니다."],
            required_information: ["배우자 생활재원", "상속재산 배분 의향"]
          };
        }
        return {
          priority: facts.family.spouse === "unknown" ? "needs_more_info" : "excluded",
          eligibility: { status: facts.family.spouse === "unknown" ? "needs_info" : "excluded", reasons: ["배우자 유무에 따라 적용 여부가 달라집니다."] },
          rationale: ["배우자 정보가 확인되어야 배우자 배분 조정을 검토할 수 있습니다."],
          required_information: ["배우자 유무"]
        };
      }
    },
    {
      scenario_id: "gift-stepwise-transfer",
      track: "gift",
      name: "일부·단계적 증여",
      description: "증여 시점과 증여재산공제, 과거 10년 증여 합산 위험을 나눠 검토합니다.",
      execution_tools: ["단계적 증여", "증여 시점 분산"],
      basePriority: "conditional",
      timeline: ["수증자 확정", "과거 10년 증여 확인", "1차 이전 범위 산정", "추가 증여 재검토"],
      requiredInfo: ["수증자", "증여 대상 금액", "과거 10년 증여"],
      evaluate: (facts) => ({
        priority: hasGoal(facts, "transfer_early") ? "priority" : "conditional",
        eligibility: { status: "conditional", reasons: ["수증자·증여 시점·과거 증여가 확인되면 비교 가능합니다."] },
        rationale: [
          hasGoal(facts, "transfer_early")
            ? "일부를 미리 이전하고 싶다고 답했기 때문에 단계적 증여를 우선 검토합니다."
            : "증여 트랙 또는 비교 모드가 활성화되어 단계적 증여를 조건부 후보로 둡니다.",
          hasPastGift(facts) ? "최근 10년 증여가 있어 증여 합산 검토를 강화합니다." : "과거 증여가 없거나 미확인 상태이므로 합산 여부 확인이 필요합니다."
        ],
        required_information: hasPastGift(facts) ? ["과거 증여 금액과 일자", "증여 대상 평가액"] : ["증여 대상 평가액", "증여 시점"]
      })
    },
    {
      scenario_id: "gift-burdened-gift",
      track: "gift",
      name: "부담부증여 검토",
      description: "담보대출이나 임대보증금 승계가 있는 증여를 증여·양도 부분으로 나눠 검토합니다.",
      execution_tools: ["부담부증여", "채무승계"],
      basePriority: "needs_more_info",
      timeline: ["채무 금액 확인", "채무승계 가능성 확인", "증여·양도 부분 분리 계산"],
      requiredInfo: ["채무 금액", "채권자 승낙", "담보·임대차 증빙"],
      evaluate: (facts) => {
        const hasDebt = facts.debts.some((debt) => debt.amount_eok !== null);
        const missingDebt = facts.debts.some((debt) => debt.amount_eok === null);
        return {
          priority: hasDebt ? "conditional" : missingDebt ? "needs_more_info" : "low",
          eligibility: {
            status: hasDebt ? "conditional" : missingDebt ? "needs_info" : "needs_info",
            reasons: [hasDebt ? "확인된 채무가 있어 부담부증여 조건 검토가 가능합니다." : "채무 금액과 승계 가능성이 필요합니다."]
          },
          rationale: [
            hasDebt
              ? "담보대출 또는 임대보증금 금액을 입력했기 때문에 부담부증여를 조건부 검토합니다."
              : "채무가 없거나 금액이 확인되지 않아 부담부증여는 우선순위를 낮추거나 추가정보 후 검토합니다."
          ],
          required_information: hasDebt ? ["채무승계 증빙", "취득가액", "채권자 승인 여부"] : ["채무 금액", "채무승계 가능 여부"],
          calculation_status: hasDebt ? "needs_engine" : "needs_info"
        };
      }
    },
    {
      scenario_id: "business-succession-deduction",
      track: "business_succession",
      name: "가업상속·가업승계 검토",
      description: "비상장법인 지분, 후계자 경영참여, 경영권 유지 의사를 바탕으로 가업승계 트랙을 검토합니다.",
      execution_tools: ["가업상속공제", "증여세 과세특례", "지분 단계이전"],
      basePriority: "needs_more_info",
      timeline: ["법인지분 확인", "후계자 경영참여 확인", "가업 요건 검토", "지분 이전 순서 설계"],
      requiredInfo: ["비상장주식 평가", "후계자 경영참여", "사후관리 가능성"],
      evaluate: (facts) => {
        const business = facts.business_interests[0];
        if (!business) {
          return {
            priority: "excluded",
            eligibility: { status: "excluded", reasons: ["법인지분 또는 가업승계 관심이 확인되지 않았습니다."] },
            rationale: ["비상장법인 지분이 없으면 가업승계 트랙은 현재 조건에서는 제외합니다."],
            required_information: ["법인지분 보유 여부"],
            calculation_status: "not_applicable"
          };
        }
        return {
          priority: business.successor_management_status === "active" || business.control_preference === "retain" ? "priority" : "conditional",
          eligibility: { status: "conditional", reasons: ["법인지분과 후계자 요건 확인이 필요합니다."] },
          rationale: [
            "비상장법인 지분이 있어 가업상속·가업승계 트랙을 활성화합니다.",
            business.successor_management_status === "active" ? "자녀가 경영에 참여하고 있어 후계자 요건 검토 우선순위가 올라갑니다." : "후계자 경영참여 상태 확인이 필요합니다.",
            business.control_preference === "retain" ? "경영권 유지가 중요하므로 지분 단계이전과 경영권 설계를 함께 검토합니다." : "경영권 유지 의사가 확인되면 시나리오 우선순위를 재평가합니다."
          ],
          required_information: ["비상장주식 평가액", "업종·업력", "사후관리 가능성"],
          calculation_status: "needs_expert_review"
        };
      }
    },
    {
      scenario_id: "capital-gains-sell-then-gift",
      track: "capital_gains",
      name: "양도 후 현금 증여",
      description: "양도세를 먼저 검토한 뒤 매각대금을 자녀에게 증여하는 대안을 봅니다.",
      execution_tools: ["양도", "현금 증여"],
      basePriority: "conditional",
      timeline: ["취득가액·보유기간 확인", "예상 양도가액 확인", "양도세 계산", "현금 증여 시점 검토"],
      requiredInfo: ["취득가액", "취득시기", "보유·거주기간", "필요경비"],
      evaluate: (facts) => {
        const sellableAsset = facts.assets.find((asset) => asset.succession_preference === "sell" || asset.disposable === "yes");
        return {
          priority: hasGoal(facts, "sell_for_cash") ? "priority" : sellableAsset ? "conditional" : "low",
          eligibility: { status: sellableAsset ? "conditional" : "needs_info", reasons: ["양도대상과 취득정보가 있어야 비교할 수 있습니다."] },
          rationale: [
            hasGoal(facts, "sell_for_cash")
              ? "자산을 매각해 현금화하고 싶다고 답했기 때문에 양도 후 현금 증여를 우선 검토합니다."
              : "매각 가능 자산 여부가 확인되면 양도 트랙에서 비교합니다."
          ],
          required_information: sellableAsset?.acquisition_value_eok ? ["보유·거주기간", "필요경비", "예상 양도가액"] : ["취득가액", "취득시기", "보유·거주기간", "필요경비"],
          calculation_status: "needs_engine"
        };
      }
    },
    {
      scenario_id: "inheritance-insurance-liquidity",
      track: "inheritance",
      name: "보험 납부재원 보완",
      description: "상속세 납부재원 부족 위험이 있는 경우 보험 또는 현금흐름 보완 가능성을 봅니다.",
      execution_tools: ["보험 납부재원", "현금흐름 보완"],
      basePriority: "conditional",
      timeline: ["금융자산 확인", "보험료 감당 가능성 확인", "계약자·수익자 구조 점검"],
      requiredInfo: ["보험 계약자", "수익자", "보험료 재원"],
      evaluate: (facts) => {
        const wantsLiquidity = hasGoal(facts, "prepare_liquidity");
        return {
          priority: wantsLiquidity ? "conditional" : "needs_more_info",
          eligibility: { status: "conditional", reasons: ["보험료 재원과 계약 구조 확인이 필요합니다."] },
          rationale: [
            wantsLiquidity
              ? "납부재원 준비 목표가 있어 보험은 검토 후보로 둡니다. 실제 부족액·계약자·수익자 확인 전에는 우선안으로 확정하지 않습니다."
              : "실제 부족액과 보험계약 사실이 확인되어야 보험 납부재원 보완안을 평가할 수 있습니다."
          ],
          required_information: ["보험료 감당 가능성", "계약자·피보험자·수익자", "예상 상속세"],
          calculation_status: "needs_info"
        };
      }
    }
  ];
}

function buildScenario(definition: ScenarioDefinition, facts: ClientFacts, baseline: Baseline): Scenario {
  const evaluated = definition.evaluate(facts);
  const priority = evaluated.priority ?? definition.basePriority;
  const calculationStatus = evaluated.calculation_status ?? "needs_engine";
  const calculationResult = buildCalculationShell(facts, baseline.context, definition.scenario_id, [`${definition.name}은 확인된 과세표준이 있을 때만 숫자를 산정합니다.`]);
  const comparison = baseline.calculation_result.status === "calculable" && calculationResult.status === "calculable"
    ? compareCalculatedResults(baseline.baseline_id, baseline.calculation_result, calculationResult)
    : buildBaselineRequiredComparison(baseline.baseline_id, "기준안과 시나리오 모두 계산엔진 결과가 있어야 예상 절세액·순효과를 산정합니다.");

  return {
    scenario_id: definition.scenario_id,
    track: definition.track,
    name: definition.name,
    description: definition.description,
    execution_tools: definition.execution_tools,
    eligibility: evaluated.eligibility,
    priority,
    rationale: evaluated.rationale,
    required_information: Array.from(new Set([...(evaluated.required_information ?? definition.requiredInfo)])),
    calculation_status: calculationResult.status === "calculable" ? "calculable" : calculationStatus,
    timeline: definition.timeline,
    calculation_result: calculationResult,
    comparison
  };
}

function deriveConstraints(facts: ClientFacts): Constraint[] {
  const totalAssets = facts.assets.reduce((sum, asset) => sum + (asset.current_value_eok ?? 0), 0);
  const financialAssets = facts.assets.filter((asset) => asset.type === "financial").reduce((sum, asset) => sum + (asset.current_value_eok ?? 0), 0);
  const constraints: Constraint[] = [...facts.constraints];

  if (totalAssets > 0 && financialAssets / totalAssets < 0.2) constraints.push("insufficient_financial_assets");
  if (facts.past_gifts.length > 0) constraints.push("past_gifts_need_review");
  if (facts.debts.length > 0) constraints.push("secured_debt_needs_review");
  if (facts.assets.some((asset) => asset.current_value_eok === null || asset.type === "real_estate" || asset.type === "business_interest")) constraints.push("valuation_needed");
  if (facts.goals.includes("retain_control")) constraints.push("control_retention_required");
  if (facts.business_interests.length > 0) constraints.push("successor_readiness_needed");

  return Array.from(new Set(constraints));
}

function buildCalculationShell(facts: ClientFacts, context: CalculationContext, scenarioId: string, reasons: string[]) {
  const result = buildUncalculatedResult(reasons);
  const assetValues = facts.assets.map((asset) => asset.current_value_eok);
  const currentAssetValue = assetValues.length > 0 && assetValues.every((value) => value !== null)
    ? assetValues.reduce((sum, value) => sum + (value ?? 0), 0)
    : null;
  const basis = comparisonBasis(facts);

  result.asset_value = currentAssetValue === null
    ? moneyResult(null, "needs_info", "현재 입력 자산가액 확인 필요", basis)
    : moneyResult(currentAssetValue, "calculable", `${formatEok(currentAssetValue)} 현재가액 기준`, basis);

  const confirmedTaxBase = facts.confirmed_tax_bases?.find((item) => item.scenario_id === scenarioId);
  if (!confirmedTaxBase) return result;

  const calculated = calculateInheritanceOrGiftTax({
    tax_kind: confirmedTaxBase.tax_kind,
    taxable_value_eok: confirmedTaxBase.taxable_value_eok,
    taxable_value_won: confirmedTaxBase.taxable_value_won,
    basis_id: confirmedTaxBase.basis_id,
    context
  });
  calculated.asset_value = result.asset_value.basis
    ? { ...result.asset_value, basis: confirmedTaxBase.basis_id }
    : result.asset_value;

  const financialAssetsList = facts.assets.filter((asset) => asset.type === "financial");
  const hasKnownFinancialAssets = financialAssetsList.some((asset) => asset.current_value_eok !== null);
  const financialAssets = financialAssetsList.reduce((sum, asset) => sum + (asset.current_value_eok ?? 0), 0);
  if (hasKnownFinancialAssets && calculated.total_tax.value_eok !== null) {
    const gap = Math.max(calculated.total_tax.value_eok - financialAssets, 0);
    calculated.liquidity_gap = moneyResult(gap, "calculable", gap === 0 ? "확인된 금융자산 범위 내" : `${formatEok(gap)} 추가 재원 필요`, confirmedTaxBase.basis_id);
  } else if (calculated.total_tax.value_eok !== null) {
    calculated.liquidity_gap = moneyResult(null, "needs_info", "확인된 조달 가능 금융자산 필요", confirmedTaxBase.basis_id);
  }

  return calculated;
}

function comparisonBasis(facts: ClientFacts) {
  return [
    facts.client_facts_id,
    facts.planning_tracks.join("+"),
    facts.family.basis,
    facts.family.spouse,
    facts.family.total_children ?? "children_unknown",
    facts.family.children_age_status,
    facts.family.adult_children ?? "adult_unknown",
    facts.family.minor_children ?? "minor_unknown",
    facts.assets.map((asset) => `${asset.type}:${asset.owner}:${asset.current_value_eok ?? "unknown"}`).join("|"),
    facts.debts.map((debt) => `${debt.type}:${debt.amount_eok ?? "unknown"}`).join("|")
  ].join("::");
}

function rankRecommendations(scenarios: Scenario[]): Recommendation[] {
  return scenarios
    .filter((scenario) => scenario.priority === "priority" || scenario.priority === "conditional" || scenario.priority === "needs_more_info")
    .sort((a, b) => priorityScore(a.priority) - priorityScore(b.priority) || a.scenario_id.localeCompare(b.scenario_id))
    .slice(0, 3)
    .map((scenario, index) => ({
      scenario_id: scenario.scenario_id,
      priority_rank: index + 1,
      label: scenario.priority === "priority" ? "우선 검토" : scenario.priority === "conditional" ? "조건부 검토" : "추가정보 후 검토",
      rationale: scenario.rationale
    }));
}

function priorityScore(priority: Scenario["priority"]) {
  return {
    baseline: 0,
    priority: 1,
    conditional: 2,
    needs_more_info: 3,
    low: 4,
    excluded: 5
  }[priority];
}

function buildReportV2Contract(): ReportV2Contract {
  return {
    issue: "#5",
    pages_supported: [1, 2, 3, 4, 5, 6, 7],
    may_display_customer_numbers: ["현재 입력 자산가액", "직접 입력한 채무", "확인된 금융자산", "확인된 과세표준 기반 상속세·증여세 산출세액"],
    blocked_until_engine: ["과세표준 미확인 세액", "시나리오 예상세액", "예상 절세액", "절세율", "예상 순효과", "취득세·양도세", "공제·가산 반영 세액"],
    baseline_required_for: ["예상 절세액", "절세율", "예상 순효과", "전체 시나리오 비교"]
  };
}

function buildConversationalPrecheckContract(): ConversationalPrecheckContract {
  return {
    issue: "#6",
    accepted_sources: ["button", "confirmed_extraction"],
    rejected_sources: ["candidate", "unknown_free_text"],
    normalization_target: "ClientFacts",
    raw_conversation_retained: true
  };
}

function hasGoal(facts: ClientFacts, goal: Goal) {
  return facts.goals.includes(goal);
}

function hasPastGift(facts: ClientFacts) {
  return facts.past_gifts.length > 0;
}

function trackLabelList(facts: ClientFacts) {
  return facts.planning_tracks.map((track) => trackLabels[track]).join("·");
}
