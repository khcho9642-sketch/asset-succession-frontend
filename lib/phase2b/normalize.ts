import type { AssessmentSnapshot } from "@/lib/assessment";
import { parseEokAmount } from "@/lib/assessment";
import type { Asset, ClientFacts, Debt, Goal, PlanningTrack } from "./types";

const trackByChoice: Record<string, PlanningTrack[]> = {
  "상속": ["inheritance"],
  "증여": ["gift"],
  "가업·회사 승계": ["business_succession"],
  "양도": ["capital_gains"],
  "여러 방법 비교": ["inheritance", "gift", "business_succession", "capital_gains"],
  "아직 잘 모르겠어요": ["inheritance", "gift"],
  "상속을 준비하고 있어요": ["inheritance"],
  "생전 증여를 고민하고 있어요": ["gift"],
  "가업·회사 승계를 준비하고 있어요": ["business_succession"],
  "부동산·주식 양도를 검토하고 있어요": ["capital_gains"],
  "상속과 증여를 비교하고 싶어요": ["inheritance", "gift"],
  "여러 방법을 함께 비교하고 싶어요": ["inheritance", "gift", "business_succession", "capital_gains"],
  "아직 무엇부터 해야 할지 모르겠어요": ["inheritance", "gift"]
};

const goalByChoice: Record<string, Goal> = {
  "현재 구조 유지": "retain_control",
  "일부를 미리 이전": "transfer_early",
  "자산을 매각해 현금화": "sell_for_cash",
  "가족법인 활용": "business_continuity",
  "상속세 납부재원 준비": "prepare_liquidity",
  "아직 모르겠음": "compare_options"
};

export function normalizeAssessmentSnapshot(snapshot: AssessmentSnapshot): ClientFacts {
  const purposeAnswer = snapshot.answers.purpose;
  const family = snapshot.answers.family;
  const assetsAnswer = snapshot.answers.assets;
  const debtAnswer = snapshot.answers.debt;
  const goalAnswer = snapshot.answers.goal;
  const reviewAnswer = snapshot.answers.review;

  const planning_tracks = uniqueTracks([
    ...(purposeAnswer?.choices.flatMap((choice) => trackByChoice[choice] ?? []) ?? []),
    ...snapshot.review_focus.flatMap((choice) => trackByChoice[choice] ?? []),
    ...(goalAnswer?.choices.flatMap((choice) => trackByChoice[choice] ?? []) ?? [])
  ]);

  const assets: Asset[] = (assetsAnswer?.choices ?? [])
    .filter((choice) => choice !== "해당 없음")
    .map((choice, index) => mapAsset(choice, assetsAnswer?.assetAmounts?.[choice], index));

  const debts: Debt[] = (debtAnswer?.choices ?? [])
    .filter((choice) => choice === "담보대출 있음" || choice === "임대보증금 있음")
    .map((choice, index) => ({
      debt_id: `assessment-debt-${index + 1}`,
      type: choice === "담보대출 있음" ? "secured_loan" : "lease_deposit",
      amount_eok: parseEokAmount(debtAnswer?.debtAmounts?.[choice]),
      confirmation_status: parseEokAmount(debtAnswer?.debtAmounts?.[choice]) === null ? "amount_missing" : "confirmed"
    }));

  const unknown_items = [
    family?.facts?.["배우자 유무"] ? "" : "배우자 유무",
    family?.facts?.["성년 자녀 수"] ? "" : "성년 자녀 수",
    assets.some((asset) => asset.current_value_eok === null) ? "자산별 금액" : "",
    debts.some((debt) => debt.amount_eok === null) ? "채무 금액" : "",
    debtAnswer?.choices.includes("최근 10년 증여 있음") ? "최근 10년 증여 금액과 일자" : "",
    reviewAnswer?.choices.length ? "" : "결과 비교 관점"
  ].filter(Boolean);

  return {
    client_facts_id: snapshot.assessment_id,
    planning_tracks: planning_tracks.length > 0 ? planning_tracks : ["inheritance", "gift"],
    family: {
      basis: family?.choices.includes("부모 1명 기준")
        ? "one_parent"
        : family?.choices.includes("부모 2명 기준")
          ? "two_parents"
          : family?.choices.includes("공동상속인 많음")
            ? "multiple_heirs"
            : "unknown",
      spouse: family?.facts?.["배우자 유무"] === "있음" ? "yes" : family?.facts?.["배우자 유무"] === "없음" ? "no" : "unknown",
      adult_children: parseChildCount(family?.facts?.["성년 자녀 수"]),
      minor_children: parseChildCount(family?.facts?.["미성년 자녀 수"])
    },
    assets,
    debts,
    past_gifts: debtAnswer?.choices.includes("최근 10년 증여 있음")
      ? [{ gift_id: "assessment-past-gift-1", recipient: "unknown", amount_eok: null, confirmation_status: "amount_missing" }]
      : [],
    insurance: assetsAnswer?.choices.includes("보험") || goalAnswer?.choices.includes("상속세 납부재원 준비")
      ? [{ policy_id: "assessment-insurance-1", premium_capacity: "unknown" }]
      : [],
    business_interests: assetsAnswer?.choices.includes("법인지분")
      ? [{
          business_interest_id: "assessment-business-1",
          company_type: "private_company",
          ownership_percentage: null,
          estimated_share_value_eok: parseEokAmount(assetsAnswer?.assetAmounts?.["법인지분"]),
          successor: "unknown",
          successor_management_status: "unknown",
          control_preference: goalAnswer?.choices.includes("가족법인 활용") ? "retain" : "unknown",
          business_succession_interest: "yes"
        }]
      : [],
    goals: uniqueGoals([
      ...(goalAnswer?.choices.map((choice) => goalByChoice[choice]).filter(Boolean) ?? []),
      ...(reviewAnswer?.choices.includes("즉시 필요현금") ? ["prepare_liquidity" as Goal] : []),
      ...(reviewAnswer?.choices.includes("부모 통제권") ? ["retain_control" as Goal] : []),
      ...(reviewAnswer?.choices.includes("자녀 이전효과") ? ["fairness_between_children" as Goal] : [])
    ]),
    constraints: [],
    time_horizon: "unknown",
    unknown_items,
    source_trace: [{ source: "button", confirmation_status: "confirmed" }]
  };
}

function mapAsset(choice: string, rawAmount: string | undefined, index: number): Asset {
  const type = choice === "부동산" ? "real_estate" : choice === "금융자산" ? "financial" : choice === "법인지분" ? "business_interest" : choice === "보험" ? "insurance" : "other";
  return {
    asset_id: `assessment-asset-${index + 1}`,
    type,
    owner: "parent",
    current_value_eok: parseEokAmount(rawAmount),
    location_level: type === "real_estate" ? "city_district" : "none",
    disposable: type === "financial" ? "yes" : "unknown",
    succession_preference: "compare"
  };
}

function parseChildCount(value?: string) {
  if (!value) return null;
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function uniqueTracks(values: PlanningTrack[]) {
  return Array.from(new Set(values));
}

function uniqueGoals(values: Goal[]) {
  return Array.from(new Set(values));
}
