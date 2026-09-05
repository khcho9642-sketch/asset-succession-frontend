import type { ClientFacts } from "./types";

export const phase2bFixtures: Record<string, ClientFacts> = {
  caseAInheritance: {
    client_facts_id: "FIXTURE-A-INHERITANCE",
    planning_tracks: ["inheritance"],
    family: { basis: "two_parents", spouse: "yes", total_children: 2, children_age_status: "known", adult_children: 2, minor_children: 0 },
    assets: [
      {
        asset_id: "asset-a-real-estate",
        type: "real_estate",
        owner: "parent",
        current_value_eok: 42,
        location_level: "city_district",
        disposable: "partial",
        succession_preference: "keep"
      },
      {
        asset_id: "asset-a-financial",
        type: "financial",
        owner: "parent",
        current_value_eok: 8,
        location_level: "none",
        disposable: "yes",
        succession_preference: "compare"
      }
    ],
    debts: [],
    past_gifts: [{ gift_id: "gift-a-unknown", recipient: "adult_child", amount_eok: null, confirmation_status: "amount_missing" }],
    insurance: [{ policy_id: "insurance-a", premium_capacity: "unknown" }],
    business_interests: [],
    goals: ["prepare_liquidity", "fairness_between_children", "compare_options"],
    constraints: ["insufficient_financial_assets", "past_gifts_need_review"],
    time_horizon: "succession_event",
    unknown_items: ["과거 증여 금액", "상속 예상시점", "배우자공제 적용 검토"],
    source_trace: [{ source: "fixture", confirmation_status: "confirmed" }]
  },
  caseBGift: {
    client_facts_id: "FIXTURE-B-GIFT",
    planning_tracks: ["gift"],
    family: { basis: "one_parent", spouse: "unknown", total_children: 2, children_age_status: "known", adult_children: 2, minor_children: 0 },
    assets: [
      {
        asset_id: "asset-b-real-estate",
        type: "real_estate",
        owner: "parent",
        current_value_eok: 30,
        location_level: "city_district",
        debt_eok: 6,
        disposable: "no",
        succession_preference: "transfer"
      }
    ],
    debts: [{ debt_id: "debt-b-secured", type: "secured_loan", amount_eok: 6, linked_asset_id: "asset-b-real-estate", confirmation_status: "confirmed" }],
    past_gifts: [],
    insurance: [],
    business_interests: [],
    goals: ["transfer_early", "compare_options"],
    constraints: ["secured_debt_needs_review", "valuation_needed"],
    time_horizon: "within_3_years",
    confirmed_tax_bases: [
      {
        scenario_id: "baseline",
        tax_kind: "gift_tax",
        taxable_value_eok: 3,
        taxable_value_won: 300_000_000,
        basis_id: "FIXTURE-B-GIFT::confirmed-tax-base-demo",
        source: "fixture",
        confirmation_status: "confirmed",
        law_references: ["상속세 및 증여세법 제26조", "상속세 및 증여세법 제56조"],
        note: "DEMO 전용: 사용자가 별도 확인한 증여세 과세표준 3억원 기준"
      },
      {
        scenario_id: "gift-stepwise-transfer",
        tax_kind: "gift_tax",
        taxable_value_eok: 1.5,
        taxable_value_won: 150_000_000,
        basis_id: "FIXTURE-B-GIFT::confirmed-tax-base-demo",
        source: "fixture",
        confirmation_status: "confirmed",
        law_references: ["상속세 및 증여세법 제26조", "상속세 및 증여세법 제56조"],
        note: "DEMO 전용: 일부·단계적 증여안의 확인 과세표준 1.5억원 기준"
      }
    ],
    unknown_items: ["증여 대상 지분율", "채무승계 가능 여부"],
    source_trace: [{ source: "fixture", confirmation_status: "confirmed" }]
  },
  caseCBusinessSuccession: {
    client_facts_id: "FIXTURE-C-BUSINESS",
    planning_tracks: ["business_succession"],
    family: { basis: "two_parents", spouse: "yes", total_children: 1, children_age_status: "known", adult_children: 1, minor_children: 0 },
    assets: [
      {
        asset_id: "asset-c-shares",
        type: "business_interest",
        owner: "parent",
        current_value_eok: null,
        location_level: "none",
        disposable: "partial",
        succession_preference: "compare"
      }
    ],
    debts: [],
    past_gifts: [],
    insurance: [],
    business_interests: [
      {
        business_interest_id: "business-c-private",
        company_type: "private_company",
        ownership_percentage: 72,
        estimated_share_value_eok: null,
        successor: "adult_child",
        successor_management_status: "active",
        control_preference: "retain",
        business_succession_interest: "yes"
      }
    ],
    goals: ["business_continuity", "retain_control", "compare_options"],
    constraints: ["successor_readiness_needed", "valuation_needed", "control_retention_required"],
    time_horizon: "within_10_years",
    unknown_items: ["비상장주식 평가액", "가업상속공제 요건", "사후관리 가능성"],
    source_trace: [{ source: "fixture", confirmation_status: "confirmed" }]
  },
  caseDCapitalGains: {
    client_facts_id: "FIXTURE-D-CAPITAL-GAINS",
    planning_tracks: ["capital_gains", "gift"],
    family: { basis: "one_parent", spouse: "no", total_children: 1, children_age_status: "known", adult_children: 1, minor_children: 0 },
    assets: [
      {
        asset_id: "asset-d-real-estate",
        type: "real_estate",
        owner: "parent",
        current_value_eok: 24,
        acquisition_value_eok: 10,
        acquisition_date: "2014-05-01",
        location_level: "city_district",
        disposable: "yes",
        succession_preference: "sell"
      }
    ],
    debts: [],
    past_gifts: [],
    insurance: [],
    business_interests: [],
    goals: ["sell_for_cash", "transfer_early", "compare_options"],
    constraints: ["valuation_needed"],
    time_horizon: "now",
    unknown_items: ["필요경비", "거주기간", "매각 후 증여 시점"],
    source_trace: [{ source: "fixture", confirmation_status: "confirmed" }]
  }
};
