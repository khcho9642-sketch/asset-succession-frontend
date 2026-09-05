export type PlanningTrack = "inheritance" | "gift" | "business_succession" | "capital_gains";

export type CalculationStatus =
  | "calculable"
  | "needs_info"
  | "needs_engine"
  | "needs_expert_review"
  | "incomparable"
  | "not_applicable";

export type ScenarioPriority =
  | "baseline"
  | "priority"
  | "conditional"
  | "needs_more_info"
  | "low"
  | "excluded";

export type ValueSource = "button" | "confirmed_extraction" | "fixture" | "manual";

export type SourceTrace = {
  source: ValueSource;
  raw_text?: string;
  confirmation_status: "confirmed" | "candidate" | "unknown";
};

export type ClientFacts = {
  client_facts_id: string;
  planning_tracks: PlanningTrack[];
  family: {
    basis: "one_parent" | "two_parents" | "multiple_heirs" | "unknown";
    spouse: "yes" | "no" | "unknown";
    adult_children: number | null;
    minor_children: number | null;
  };
  assets: Asset[];
  debts: Debt[];
  past_gifts: PastGift[];
  insurance: InsurancePolicy[];
  business_interests: BusinessInterest[];
  goals: Goal[];
  constraints: Constraint[];
  time_horizon: "now" | "within_3_years" | "within_10_years" | "succession_event" | "unknown";
  confirmed_tax_bases?: ConfirmedTaxBase[];
  unknown_items: string[];
  source_trace: SourceTrace[];
};

export type Asset = {
  asset_id: string;
  type: "real_estate" | "financial" | "business_interest" | "insurance" | "other";
  owner: "parent" | "spouse" | "child" | "family_company" | "unknown";
  current_value_eok: number | null;
  acquisition_value_eok?: number | null;
  acquisition_date?: string | null;
  location_level?: "none" | "city_district" | "full_address_not_collected" | "unknown";
  debt_eok?: number | null;
  disposable?: "yes" | "no" | "partial" | "unknown";
  succession_preference?: "keep" | "transfer" | "sell" | "compare" | "unknown";
};

export type Debt = {
  debt_id: string;
  type: "secured_loan" | "lease_deposit" | "other";
  amount_eok: number | null;
  linked_asset_id?: string;
  confirmation_status: "confirmed" | "amount_missing" | "unknown";
};

export type PastGift = {
  gift_id: string;
  recipient: "spouse" | "adult_child" | "minor_child" | "other" | "unknown";
  amount_eok: number | null;
  gift_date?: string | null;
  confirmation_status: "confirmed" | "amount_missing" | "unknown";
};

export type InsurancePolicy = {
  policy_id: string;
  premium_capacity: "yes" | "no" | "unknown";
  policyholder?: string;
  insured?: string;
  beneficiary?: string;
  note?: string;
};

export type BusinessInterest = {
  business_interest_id: string;
  company_type: "private_company" | "listed_company" | "family_company" | "unknown";
  ownership_percentage: number | null;
  estimated_share_value_eok: number | null;
  successor: "adult_child" | "spouse" | "professional_manager" | "unknown";
  successor_management_status: "active" | "not_active" | "unknown";
  control_preference: "retain" | "transfer" | "compare" | "unknown";
  business_succession_interest: "yes" | "no" | "unknown";
};

export type Goal =
  | "minimize_tax"
  | "prepare_liquidity"
  | "retain_control"
  | "fairness_between_children"
  | "transfer_early"
  | "sell_for_cash"
  | "business_continuity"
  | "compare_options";

export type Constraint =
  | "insufficient_financial_assets"
  | "past_gifts_need_review"
  | "secured_debt_needs_review"
  | "valuation_needed"
  | "control_retention_required"
  | "successor_readiness_needed";

export type CalculationContext = {
  valuation_date: string;
  assumed_transfer_date: string;
  law_version: string;
  assumptions: string[];
  included_taxes: TaxKind[];
  excluded_taxes: TaxKind[];
};

export type ConfirmedTaxBase = {
  scenario_id: "baseline" | string;
  tax_kind: Extract<TaxKind, "inheritance_tax" | "gift_tax">;
  taxable_value_eok: number;
  basis_id: string;
  source: ValueSource;
  confirmation_status: "confirmed";
  law_references: string[];
  note: string;
};

export type TaxKind =
  | "inheritance_tax"
  | "gift_tax"
  | "capital_gains_tax"
  | "acquisition_related_tax"
  | "other_tax";

export type MoneyResult = {
  value_eok: number | null;
  status: CalculationStatus;
  label: string;
  basis?: string;
};

export type CalculationResult = {
  asset_value: MoneyResult;
  taxable_value: MoneyResult;
  inheritance_tax: MoneyResult;
  gift_tax: MoneyResult;
  capital_gains_tax: MoneyResult;
  acquisition_related_tax: MoneyResult;
  other_tax: MoneyResult;
  execution_cost: MoneyResult;
  total_tax: MoneyResult;
  total_burden: MoneyResult;
  immediate_cash_required: MoneyResult;
  liquidity_gap: MoneyResult;
  parent_remaining_assets: MoneyResult;
  child_transferred_assets: MoneyResult;
  confidence: CalculationStatus;
  status: CalculationStatus;
  status_reasons: string[];
};

export type Baseline = {
  baseline_id: string;
  track: PlanningTrack;
  name: string;
  description: string;
  context: CalculationContext;
  calculation_result: CalculationResult;
};

export type ScenarioEligibility = {
  status: "eligible" | "conditional" | "needs_info" | "excluded";
  reasons: string[];
};

export type Scenario = {
  scenario_id: string;
  track: PlanningTrack;
  name: string;
  description: string;
  execution_tools: string[];
  eligibility: ScenarioEligibility;
  priority: ScenarioPriority;
  rationale: string[];
  required_information: string[];
  calculation_status: CalculationStatus;
  timeline: string[];
  calculation_result: CalculationResult;
  comparison: ScenarioComparison;
};

export type ScenarioComparison = {
  baseline_id: string | null;
  expected_tax_savings: MoneyResult;
  savings_rate: MoneyResult;
  expected_net_effect: MoneyResult;
  comparison_status: CalculationStatus;
  comparison_reasons: string[];
};

export type ScenarioPlan = {
  facts: ClientFacts;
  context: CalculationContext;
  baseline: Baseline;
  scenarios: Scenario[];
  recommendations: Recommendation[];
  unknown_items: string[];
  report_v2_contract: ReportV2Contract;
  conversational_precheck_contract: ConversationalPrecheckContract;
};

export type Recommendation = {
  scenario_id: string;
  priority_rank: number;
  label: "우선 검토" | "조건부 검토" | "추가정보 후 검토";
  rationale: string[];
};

export type ReportV2Contract = {
  issue: "#5";
  pages_supported: Array<1 | 2 | 3 | 4 | 5 | 6 | 7>;
  may_display_customer_numbers: string[];
  blocked_until_engine: string[];
  baseline_required_for: string[];
};

export type ConversationalPrecheckContract = {
  issue: "#6";
  accepted_sources: Array<"button" | "confirmed_extraction">;
  rejected_sources: Array<"candidate" | "unknown_free_text">;
  normalization_target: "ClientFacts";
  raw_conversation_retained: boolean;
};
