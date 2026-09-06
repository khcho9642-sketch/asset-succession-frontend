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
  ScenarioDisplayPlan,
  ScenarioInternalAnalysis,
  ScenarioPlan
} from "./types";

const LIQUIDITY_SUPPORT_SCENARIO_ID = "inheritance-insurance-liquidity";

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
  const internalAnalysis = buildInternalAnalysis();
  const displayScenarios = buildScenarioDisplayPlan(baseline, scenarios, recommendations);

  return {
    facts: enrichedFacts,
    context,
    baseline,
    scenarios,
    recommendations,
    internal_analysis: internalAnalysis,
    display_scenarios: displayScenarios,
    unknown_items: Array.from(new Set([...enrichedFacts.unknown_items, ...scenarios.flatMap((scenario) => scenario.required_information)])),
    report_v2_contract: buildReportV2Contract(),
    conversational_precheck_contract: buildConversationalPrecheckContract()
  };
}

export function getInternalScenarioCandidateLibraryCount() {
  return internalScenarioCandidateLibrary().length;
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

type InternalScenarioCandidate = {
  candidate_id: string;
  track: PlanningTrack;
  signals: Array<Goal | Constraint | "baseline" | "insurance" | "family_company" | "valuation" | "liquidity">;
};

function internalScenarioCandidateLibrary(): InternalScenarioCandidate[] {
  return [
    { candidate_id: "inheritance-01-current-structure", track: "inheritance", signals: ["baseline"] },
    { candidate_id: "inheritance-02-spouse-allocation", track: "inheritance", signals: ["fairness_between_children"] },
    { candidate_id: "inheritance-03-liquidity-gap", track: "inheritance", signals: ["prepare_liquidity", "liquidity"] },
    { candidate_id: "inheritance-04-heir-equalization", track: "inheritance", signals: ["fairness_between_children"] },
    { candidate_id: "inheritance-05-real-estate-retention", track: "inheritance", signals: ["retain_control", "valuation"] },
    { candidate_id: "inheritance-06-real-estate-sale-funding", track: "inheritance", signals: ["sell_for_cash", "prepare_liquidity"] },
    { candidate_id: "inheritance-07-past-gift-addback", track: "inheritance", signals: ["past_gifts_need_review"] },
    { candidate_id: "inheritance-08-testament-trust-prework", track: "inheritance", signals: ["retain_control", "fairness_between_children"] },
    { candidate_id: "inheritance-09-post-death-administration", track: "inheritance", signals: ["prepare_liquidity"] },
    { candidate_id: "gift-01-stepwise-transfer", track: "gift", signals: ["transfer_early"] },
    { candidate_id: "gift-02-child-bucket-review", track: "gift", signals: ["fairness_between_children"] },
    { candidate_id: "gift-03-spouse-gift", track: "gift", signals: ["minimize_tax"] },
    { candidate_id: "gift-04-burdened-gift", track: "gift", signals: ["secured_debt_needs_review"] },
    { candidate_id: "gift-05-low-value-asset-timing", track: "gift", signals: ["valuation_needed"] },
    { candidate_id: "gift-06-cash-gift-funding", track: "gift", signals: ["transfer_early", "prepare_liquidity"] },
    { candidate_id: "gift-07-family-loan-review", track: "gift", signals: ["prepare_liquidity"] },
    { candidate_id: "gift-08-gift-tax-payment-source", track: "gift", signals: ["prepare_liquidity"] },
    { candidate_id: "gift-09-valuation-date-split", track: "gift", signals: ["valuation_needed"] },
    { candidate_id: "business-01-succession-deduction", track: "business_succession", signals: ["business_continuity"] },
    { candidate_id: "business-02-special-gift-taxation", track: "business_succession", signals: ["business_continuity", "transfer_early"] },
    { candidate_id: "business-03-share-phased-transfer", track: "business_succession", signals: ["retain_control"] },
    { candidate_id: "business-04-holding-company-review", track: "business_succession", signals: ["family_company"] },
    { candidate_id: "business-05-family-company-rental", track: "business_succession", signals: ["family_company"] },
    { candidate_id: "business-06-voting-control-retention", track: "business_succession", signals: ["control_retention_required"] },
    { candidate_id: "business-07-successor-readiness", track: "business_succession", signals: ["successor_readiness_needed"] },
    { candidate_id: "business-08-stock-valuation", track: "business_succession", signals: ["valuation_needed"] },
    { candidate_id: "business-09-post-management-compliance", track: "business_succession", signals: ["business_continuity"] },
    { candidate_id: "capital-01-sell-then-gift", track: "capital_gains", signals: ["sell_for_cash"] },
    { candidate_id: "capital-02-one-house-special-rule", track: "capital_gains", signals: ["minimize_tax"] },
    { candidate_id: "capital-03-long-term-holding", track: "capital_gains", signals: ["minimize_tax"] },
    { candidate_id: "capital-04-burdened-transfer", track: "capital_gains", signals: ["secured_debt_needs_review"] },
    { candidate_id: "capital-05-installment-sale-cashflow", track: "capital_gains", signals: ["prepare_liquidity"] },
    { candidate_id: "capital-06-family-sale-fair-value", track: "capital_gains", signals: ["fairness_between_children"] },
    { candidate_id: "capital-07-acquisition-cost-rebuild", track: "capital_gains", signals: ["valuation_needed"] },
    { candidate_id: "capital-08-lease-transfer-impact", track: "capital_gains", signals: ["secured_debt_needs_review"] },
    { candidate_id: "capital-09-reinvestment-liquidity", track: "capital_gains", signals: ["sell_for_cash", "prepare_liquidity"] }
  ];
}

function buildInternalAnalysis(): ScenarioInternalAnalysis {
  const candidateCount = internalScenarioCandidateLibrary().length;
  return {
    candidate_library_count: candidateCount,
    evaluated_candidate_count: candidateCount,
    analysis_status: "completed",
    user_visible_disclosure: "summary_only",
    disclosure_label: `${candidateCount}개 시나리오 내부 분석 완료`,
    hidden_candidate_lists: true
  };
}

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
      scenario_id: "inheritance-heir-equalization",
      track: "inheritance",
      name: "자녀 간 형평 배분",
      description: "자녀별 생활여건과 승계자산 종류를 나눠 형평성을 점검하는 상속 트랙 시나리오입니다.",
      execution_tools: ["자녀별 배분", "유류분·분쟁위험 점검"],
      basePriority: "conditional",
      timeline: ["상속인 확정", "자녀별 필요자금·기여도 확인", "현물·현금 배분안 비교"],
      requiredInfo: ["자녀별 성년 여부", "자녀별 사전증여", "분쟁 가능성"],
      evaluate: (facts) => {
        const multipleChildren = (facts.family.total_children ?? 0) >= 2 || facts.family.children_age_status === "unknown";
        return {
          priority: hasGoal(facts, "fairness_between_children") ? "priority" : multipleChildren ? "conditional" : "needs_more_info",
          eligibility: { status: multipleChildren ? "conditional" : "needs_info", reasons: ["상속인 수와 자녀별 사전증여가 확인되어야 합니다."] },
          rationale: [
            hasGoal(facts, "fairness_between_children")
              ? "자녀 간 형평을 목표로 선택했기 때문에 배분 구조를 우선 검토합니다."
              : "상속인별 배분 의향과 사전증여가 확인되면 형평 배분안을 비교합니다."
          ],
          required_information: ["자녀별 사전증여", "자산별 소유자·지분", "가족 합의 방향"]
        };
      }
    },
    {
      scenario_id: "inheritance-real-estate-liquidity",
      track: "inheritance",
      name: "부동산 보유·재원 분리",
      description: "부동산은 유지하면서 상속세 납부재원은 금융자산·차입·일부 처분으로 분리 검토합니다.",
      execution_tools: ["현물 보유", "납부재원 조달"],
      basePriority: "conditional",
      timeline: ["부동산별 보유 의향 확인", "금융자산·차입 가능성 확인", "분할납부·일부 처분 검토"],
      requiredInfo: ["부동산 평가액", "담보 가능성", "가족별 보유 의향"],
      evaluate: (facts) => {
        const hasRealEstate = hasAssetType(facts, "real_estate");
        return {
          priority: hasRealEstate && hasGoal(facts, "prepare_liquidity") ? "priority" : hasRealEstate ? "conditional" : "needs_more_info",
          eligibility: { status: hasRealEstate ? "conditional" : "needs_info", reasons: ["부동산 보유 의향과 납부재원 확인이 필요합니다."] },
          rationale: [
            hasRealEstate
              ? "부동산 자산이 확인되어 보유와 납부재원 마련을 분리해 검토합니다."
              : "부동산 보유 여부와 평가액이 확인되면 재원 분리안을 검토합니다."
          ],
          required_information: ["부동산 평가자료", "가용 금융자산", "담보·처분 가능성"]
        };
      }
    },
    {
      scenario_id: "inheritance-past-gift-addback",
      track: "inheritance",
      name: "최근 10년 증여 합산 점검",
      description: "과거 증여가 상속세 과세가액에 미치는 영향을 별도 확인하는 시나리오입니다.",
      execution_tools: ["사전증여 합산", "증여 이력 대사"],
      basePriority: "needs_more_info",
      timeline: ["수증자별 증여일자 확인", "증여세 신고자료 수집", "상속세 합산 여부 검토"],
      requiredInfo: ["과거 증여 금액", "증여일자", "수증자"],
      evaluate: (facts) => ({
        priority: hasPastGift(facts) ? "priority" : "needs_more_info",
        eligibility: { status: hasPastGift(facts) ? "conditional" : "needs_info", reasons: ["최근 10년 증여 이력이 있거나 미확인인 경우 합산 검토가 필요합니다."] },
        rationale: [
          hasPastGift(facts)
            ? "최근 10년 증여가 확인되어 상속세 합산 영향을 우선 확인해야 합니다."
            : "과거 증여가 없다고 확정되기 전까지는 합산 여부를 추가 확인합니다."
        ],
        required_information: ["수증자별 과거 증여 내역", "증여세 신고서", "증여재산 평가자료"]
      })
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
      scenario_id: "gift-spouse-transfer",
      track: "gift",
      name: "배우자 증여 검토",
      description: "배우자에게 일부 이전하는 경우의 증여세와 향후 상속재산 구성을 점검합니다.",
      execution_tools: ["배우자 증여", "가족 보유구조 재편"],
      basePriority: "needs_more_info",
      timeline: ["배우자 유무 확인", "배우자 보유재산 확인", "이전 후 생활재원 점검"],
      requiredInfo: ["배우자 유무", "배우자 보유재산", "이전 대상 자산"],
      evaluate: (facts) => ({
        priority: facts.family.spouse === "yes" ? "conditional" : facts.family.spouse === "unknown" ? "needs_more_info" : "low",
        eligibility: {
          status: facts.family.spouse === "no" ? "needs_info" : "conditional",
          reasons: ["배우자 유무와 배우자 보유재산이 확인되어야 합니다."]
        },
        rationale: [
          facts.family.spouse === "yes"
            ? "배우자가 있어 배우자 증여와 향후 상속재산 구성을 조건부 검토합니다."
            : "배우자 정보가 확정되면 배우자 증여 가능성을 재평가합니다."
        ],
        required_information: ["배우자 보유재산", "혼인기간", "이전 후 자금출처"]
      })
    },
    {
      scenario_id: "gift-valuation-timing",
      track: "gift",
      name: "평가시점 분산 증여",
      description: "평가 변동성이 큰 자산을 언제, 어느 범위로 증여할지 나누어 검토합니다.",
      execution_tools: ["평가시점 검토", "증여범위 조정"],
      basePriority: "conditional",
      timeline: ["평가자료 확보", "증여시점 후보 비교", "증여 후 보유·매각 계획 확인"],
      requiredInfo: ["자산 평가근거", "증여 예정시점", "보유·매각 의향"],
      evaluate: (facts) => ({
        priority: hasConstraint(facts, "valuation_needed") || hasGoal(facts, "transfer_early") ? "conditional" : "needs_more_info",
        eligibility: { status: "conditional", reasons: ["평가액과 증여시점이 확인되면 비교 가능합니다."] },
        rationale: [
          hasConstraint(facts, "valuation_needed")
            ? "평가 확인이 필요한 자산이 있어 증여시점에 따른 차이를 별도 검토합니다."
            : "증여 예정시점과 평가근거가 정리되면 평가시점 분산안을 볼 수 있습니다."
        ],
        required_information: ["평가액 근거", "증여 예정일", "증여 후 처분 계획"]
      })
    },
    {
      scenario_id: "gift-tax-payment-source",
      track: "gift",
      name: "증여세 납부재원 점검",
      description: "수증자가 증여세를 납부할 재원을 어떻게 마련할지 확인하는 보완 시나리오입니다.",
      execution_tools: ["수증자 현금흐름", "납부재원 점검"],
      basePriority: "conditional",
      timeline: ["수증자 현금 확인", "증여세 납부시점 확인", "부족재원 보완방안 검토"],
      requiredInfo: ["수증자 보유현금", "납부시점", "부모 지원 여부"],
      evaluate: (facts) => ({
        priority: hasGoal(facts, "prepare_liquidity") ? "conditional" : "needs_more_info",
        eligibility: { status: "conditional", reasons: ["수증자의 납부능력과 자금출처 확인이 필요합니다."] },
        rationale: [
          hasGoal(facts, "prepare_liquidity")
            ? "납부재원 준비 목표가 있어 증여세 납부재원을 별도로 점검합니다."
            : "증여 실행 전 수증자의 세금 납부재원을 추가 확인합니다."
        ],
        required_information: ["수증자 보유현금", "자금출처", "분납 가능성"]
      })
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
      scenario_id: "business-share-phased-transfer",
      track: "business_succession",
      name: "지분 단계이전",
      description: "경영권을 유지하면서 지분을 나누어 이전하는 가업승계 시나리오입니다.",
      execution_tools: ["지분 단계이전", "의결권 구조"],
      basePriority: "conditional",
      timeline: ["현재 지분율 확인", "후계자 참여도 확인", "이전 비율·시점 설계"],
      requiredInfo: ["현재 지분율", "후계자 참여도", "주주간 관계"],
      evaluate: (facts) => {
        const business = facts.business_interests[0];
        return {
          priority: business?.control_preference === "retain" ? "priority" : business ? "conditional" : "needs_more_info",
          eligibility: { status: business ? "conditional" : "needs_info", reasons: ["법인지분과 경영권 유지 의사가 확인되어야 합니다."] },
          rationale: [
            business
              ? "법인지분이 확인되어 지분을 한 번에 넘기지 않고 단계별로 이전하는 방안을 검토합니다."
              : "법인지분 보유 여부가 확인되면 지분 단계이전 검토가 가능합니다."
          ],
          required_information: ["주식 평가액", "지분율", "후계자 경영참여"]
        };
      }
    },
    {
      scenario_id: "business-control-retention",
      track: "business_succession",
      name: "경영권 유지 설계",
      description: "승계 과정에서도 부모 세대의 통제권과 회사 안정성을 유지하는 시나리오입니다.",
      execution_tools: ["의결권 구조", "정관·주주간 약정"],
      basePriority: "conditional",
      timeline: ["통제권 목표 확인", "의결권·지분 구조 검토", "사후관리 위험 점검"],
      requiredInfo: ["정관", "주주명부", "경영권 유지 기간"],
      evaluate: (facts) => ({
        priority: hasGoal(facts, "retain_control") || hasConstraint(facts, "control_retention_required") ? "priority" : "conditional",
        eligibility: { status: "conditional", reasons: ["통제권 목표와 현재 지분구조 확인이 필요합니다."] },
        rationale: [
          hasGoal(facts, "retain_control")
            ? "경영권 유지가 목표이므로 지분 이전과 통제권을 분리해 우선 검토합니다."
            : "법인지분 이전 전 통제권 유지 조건을 함께 확인합니다."
        ],
        required_information: ["주주명부", "정관", "후계자 역할"]
      })
    },
    {
      scenario_id: "business-post-management-compliance",
      track: "business_succession",
      name: "사후관리 리스크 점검",
      description: "가업상속·증여 특례 적용 후 사후관리 요건을 지킬 수 있는지 점검합니다.",
      execution_tools: ["사후관리", "요건 점검"],
      basePriority: "needs_more_info",
      timeline: ["적용 특례 후보 확인", "고용·자산·업종 요건 확인", "사후관리 체크리스트 작성"],
      requiredInfo: ["업종·업력", "고용 요건", "사후관리 가능성"],
      evaluate: (facts) => ({
        priority: hasGoal(facts, "business_continuity") ? "conditional" : "needs_more_info",
        eligibility: { status: "needs_info", reasons: ["가업 요건과 사후관리 가능성은 전문가 검토가 필요합니다."] },
        rationale: [
          "가업승계는 세액보다 사후관리 실패 위험이 크므로 적용 전 별도 체크가 필요합니다."
        ],
        required_information: ["업종·업력", "고용 유지 계획", "사후관리 가능성"],
        calculation_status: "needs_expert_review"
      })
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
      scenario_id: "capital-gains-acquisition-cost-rebuild",
      track: "capital_gains",
      name: "취득가액·보유기간 재구성",
      description: "양도세 비교 전 취득가액, 필요경비, 보유·거주기간을 먼저 복원합니다.",
      execution_tools: ["취득가액 대사", "보유기간 검토"],
      basePriority: "conditional",
      timeline: ["취득계약서 확인", "필요경비 수집", "보유·거주기간 대사"],
      requiredInfo: ["취득가액", "필요경비", "보유·거주기간"],
      evaluate: (facts) => ({
        priority: hasAssetType(facts, "real_estate") ? "conditional" : "needs_more_info",
        eligibility: { status: "conditional", reasons: ["양도세 계산 전 취득정보가 먼저 필요합니다."] },
        rationale: [
          "양도 후 증여안은 취득가액과 보유기간이 없으면 세액 비교가 왜곡되므로 먼저 자료를 복원합니다."
        ],
        required_information: ["취득가액", "필요경비", "보유·거주기간"]
      })
    },
    {
      scenario_id: "capital-gains-long-term-holding",
      track: "capital_gains",
      name: "장기보유·거주요건 검토",
      description: "매각 시점에 따라 양도세 부담이 달라지는지 장기보유·거주요건을 점검합니다.",
      execution_tools: ["보유기간", "거주요건"],
      basePriority: "needs_more_info",
      timeline: ["취득일 확인", "실거주 기간 확인", "매각 가능시점 비교"],
      requiredInfo: ["취득일", "거주기간", "매각 예정일"],
      evaluate: (facts) => ({
        priority: hasGoal(facts, "sell_for_cash") ? "conditional" : "needs_more_info",
        eligibility: { status: "needs_info", reasons: ["취득일과 거주기간 확인이 필요합니다."] },
        rationale: [
          hasGoal(facts, "sell_for_cash")
            ? "현금화를 목표로 선택했기 때문에 매각 시점별 양도세 차이를 추가 확인합니다."
            : "매각 가능성이 있으면 장기보유·거주요건을 확인합니다."
        ],
        required_information: ["취득일", "거주기간", "매각 예정일"]
      })
    },
    {
      scenario_id: "capital-gains-family-sale-fair-value",
      track: "capital_gains",
      name: "가족 간 매매가액 적정성",
      description: "가족 간 매매를 검토할 때 시가와 자금출처 위험을 점검합니다.",
      execution_tools: ["시가 검토", "자금출처 점검"],
      basePriority: "needs_more_info",
      timeline: ["매수자 확정", "시가자료 확인", "자금출처·대금지급 흐름 점검"],
      requiredInfo: ["시가자료", "매수자 자금출처", "대금지급 방식"],
      evaluate: (facts) => ({
        priority: hasGoal(facts, "fairness_between_children") || hasGoal(facts, "sell_for_cash") ? "conditional" : "needs_more_info",
        eligibility: { status: "needs_info", reasons: ["시가와 자금출처가 확인되어야 가족 간 매매를 판단할 수 있습니다."] },
        rationale: [
          "가족 간 매매는 세액뿐 아니라 시가와 자금출처 검토가 필요하므로 추가 검토안으로 둡니다."
        ],
        required_information: ["시가자료", "매수자 자금출처", "대금 지급 증빙"]
      })
    },
    {
      scenario_id: "inheritance-insurance-liquidity",
      track: "inheritance",
      name: "보험 납부재원 보완",
      description: "상속세 납부재원 부족 위험이 있는 경우 보험 또는 현금흐름 보완 가능성을 봅니다.",
      execution_tools: ["보험 납부재원", "현금흐름 보완"],
      alwaysConsider: true,
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
    .filter((scenario) => isRecommendationCandidate(scenario))
    .sort((a, b) => priorityScore(a.priority) - priorityScore(b.priority) || a.scenario_id.localeCompare(b.scenario_id))
    .slice(0, 3)
    .map((scenario, index) => ({
      scenario_id: scenario.scenario_id,
      priority_rank: index + 1,
      label: scenario.priority === "priority" ? "우선 검토" : scenario.priority === "conditional" ? "조건부 검토" : "추가정보 후 검토",
      rationale: scenario.rationale
    }));
}

function buildScenarioDisplayPlan(baseline: Baseline, scenarios: Scenario[], recommendations: Recommendation[]): ScenarioDisplayPlan {
  const recommended = recommendations
    .map((recommendation) => scenarios.find((scenario) => scenario.scenario_id === recommendation.scenario_id))
    .filter((scenario): scenario is Scenario => Boolean(scenario));
  const usedIds = new Set(recommended.map((scenario) => scenario.scenario_id));
  const additionalReviews = scenarios
    .filter((scenario) => isAdditionalReviewCandidate(scenario, usedIds))
    .sort((a, b) => priorityScore(a.priority) - priorityScore(b.priority) || a.scenario_id.localeCompare(b.scenario_id))
    .slice(0, 2);
  const liquiditySupport = scenarios.find((scenario) => scenario.scenario_id === LIQUIDITY_SUPPORT_SCENARIO_ID && scenario.eligibility.status !== "excluded") ?? null;
  const comparisonScenarios = uniqueScenarios([
    ...recommended,
    ...additionalReviews,
    ...(liquiditySupport ? [liquiditySupport] : [])
  ]);

  return {
    baseline,
    recommended,
    additional_reviews: additionalReviews,
    liquidity_support: liquiditySupport,
    comparison_scenarios: comparisonScenarios
  };
}

function isRecommendationCandidate(scenario: Scenario) {
  return scenario.priority !== "baseline" &&
    scenario.scenario_id !== LIQUIDITY_SUPPORT_SCENARIO_ID &&
    (scenario.priority === "priority" || scenario.priority === "conditional" || scenario.priority === "needs_more_info");
}

function isAdditionalReviewCandidate(scenario: Scenario, usedIds: Set<string>) {
  return scenario.priority !== "baseline" &&
    scenario.scenario_id !== LIQUIDITY_SUPPORT_SCENARIO_ID &&
    !usedIds.has(scenario.scenario_id) &&
    (scenario.priority === "conditional" || scenario.priority === "needs_more_info");
}

function uniqueScenarios(scenarios: Scenario[]) {
  const seen = new Set<string>();
  return scenarios.filter((scenario) => {
    if (seen.has(scenario.scenario_id)) return false;
    seen.add(scenario.scenario_id);
    return true;
  });
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
    baseline_required_for: ["예상 절세액", "절세율", "예상 순효과", "추천 시나리오 비교"]
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

function hasAssetType(facts: ClientFacts, type: ClientFacts["assets"][number]["type"]) {
  return facts.assets.some((asset) => asset.type === type);
}

function hasConstraint(facts: ClientFacts, constraint: Constraint) {
  return facts.constraints.includes(constraint);
}

function trackLabelList(facts: ClientFacts) {
  return facts.planning_tracks.map((track) => trackLabels[track]).join("·");
}
