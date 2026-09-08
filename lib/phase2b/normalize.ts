import type { AssessmentSnapshot } from "../assessment";
import { eokAmountToWon, parseEokAmount, parseNonnegativeEokAmount } from "../assessment";
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
  "세금 부담 절감": "minimize_tax",
  "현재 구조 유지": "retain_control",
  "노후생활비 유지": "maintain_living_expenses",
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
    .filter((choice) => choice !== "해당 없음" && choice !== "잘 모르겠음")
    .map((choice, index) => mapAsset(choice, assetsAnswer, index));

  const debts: Debt[] = (debtAnswer?.choices ?? [])
    .filter((choice) => choice === "담보대출 있음" || choice === "임대보증금 있음" || choice === "기타채무 있음")
    .map((choice, index) => ({
      debt_id: `assessment-debt-${index + 1}`,
      type: choice === "담보대출 있음" ? "secured_loan" : choice === "임대보증금 있음" ? "lease_deposit" : "other",
      amount_eok: parseEokAmount(debtAnswer?.debtAmounts?.[choice]),
      amount_won: amountWonFromAnswer(debtAnswer?.debtAmounts?.[choice], debtAnswer?.debtAmountWons?.[choice]),
      confirmation_status: parseEokAmount(debtAnswer?.debtAmounts?.[choice]) === null ? "amount_missing" : "confirmed"
    }));

  const totalChildren = parseChildCount(family?.facts?.["자녀 수"]);
  const adultChildren = parseChildCount(family?.facts?.["성년 자녀 수"]);
  const minorChildren = parseChildCount(family?.facts?.["미성년 자녀 수"]);
  const childrenAgeKnown = adultChildren !== null || minorChildren !== null;
  const ownerNeedsConfirmation = assetsAnswer?.facts?.["소유자 관계"] || assets.some((asset) => asset.owner === "unknown");
  const confirmed_tax_bases = buildConfirmedTaxBases(snapshot);
  const intrafamilyLoans = buildIntrafamilyLoans(snapshot);
  const insuranceStatus = inferInsuranceStatus(snapshot);
  const availableTaxPaymentCash = parseEokAmount(factValue("상속세 납부 가능 현금", snapshot));
  const debtStatus = inferDebtStatus(debtAnswer, debts);
  const unknown_items = [
    family?.choices.length || family?.facts?.["가족 기준"] ? "" : "피상속인·부모 수 기준",
    family?.facts?.["배우자 유무"] ? "" : "배우자 유무",
    totalChildren !== null && !childrenAgeKnown ? "성년/미성년 자녀 구분" : "",
    totalChildren === null && adultChildren === null && minorChildren === null ? "자녀 수" : "",
    ownerNeedsConfirmation ? "작성자와 실제 재산 소유자·지분" : "",
    assets.some((asset) => asset.current_value_eok === null) ? "자산별 확정 금액" : "",
    debts.some((debt) => debt.amount_eok === null) ? "채무 금액" : "",
    debtAnswer?.choices.includes("최근 10년 증여 있음") && !factValue("과거 증여 상세", snapshot) ? "최근 10년 증여 금액과 일자" : "",
    intrafamilyLoans.length > 0 ? "부모·자녀 대여 이자·원금 실제 지급 증빙" : "",
    intrafamilyLoans.some((loan) => loan.repayment_capacity === "no") ? "상환능력 부족 자녀의 증여 위험과 최종 배분 차이" : "",
    availableTaxPaymentCash === null ? "상속세 납부 가능 현금" : "",
    confirmed_tax_bases.length === 0 ? "외부 확인 과세표준" : "",
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
      total_children: totalChildren ?? sumKnownChildren(adultChildren, minorChildren),
      children_age_status: childrenAgeKnown ? "known" : "unknown",
      adult_children: adultChildren,
      minor_children: minorChildren
    },
    assets,
    debts,
    debt_status: debtStatus,
    past_gifts: debtAnswer?.choices.includes("최근 10년 증여 있음")
      ? [{ gift_id: "assessment-past-gift-1", recipient: "adult_child", amount_eok: parseEokAmount(factValue("과거 증여 상세", snapshot)), gift_date: pastGiftDate(factValue("과거 증여 상세", snapshot)), confirmation_status: parseEokAmount(factValue("과거 증여 상세", snapshot)) === null ? "amount_missing" : "confirmed" }]
      : [],
    insurance: assetsAnswer?.choices.includes("보험") || goalAnswer?.choices.includes("상속세 납부재원 준비")
      ? [{ policy_id: "assessment-insurance-1", premium_capacity: "unknown" }]
      : [],
    insurance_status: insuranceStatus,
    intrafamily_loans: intrafamilyLoans,
    available_tax_payment_cash_eok: availableTaxPaymentCash,
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
    confirmed_tax_bases,
    unknown_items,
    source_trace: snapshot.conversation?.mode === "chat"
      ? snapshot.conversation.confirmed_facts.map((fact) => ({ source: "confirmed_extraction" as const, raw_text: fact.raw_text, confirmation_status: "confirmed" as const }))
      : [{ source: "button", confirmation_status: "confirmed" }]
  };
}

function mapAsset(choice: string, assetsAnswer: AssessmentSnapshot["answers"][string] | undefined, index: number): Asset {
  const type = choice === "부동산" ? "real_estate" : choice === "금융자산" ? "financial" : choice === "법인지분" ? "business_interest" : choice === "보험" ? "insurance" : "other";
  const rawAmount = assetsAnswer?.assetAmounts?.[choice];
  const currentValueEok = parseEokAmount(rawAmount);
  const storedWon = assetsAnswer?.assetAmountWons?.[choice];
  const range = assetsAnswer?.assetAmountRanges?.[choice];
  return {
    asset_id: `assessment-asset-${index + 1}`,
    type,
    owner: "unknown",
    owner_note: assetsAnswer?.facts?.["소유자 관계"] ?? "작성자와 실제 소유자·지분 확인 전까지 특정 가족 소유로 확정하지 않습니다.",
    current_value_eok: currentValueEok,
    current_value_won: amountWonFromAnswer(rawAmount, storedWon),
    current_value_status: range ? "range" : currentValueEok === null ? "unknown" : "confirmed",
    current_value_range_won: range ? { min: range.min_won, max: range.max_won } : null,
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

function sumKnownChildren(adultChildren: number | null, minorChildren: number | null) {
  if (adultChildren === null && minorChildren === null) return null;
  return (adultChildren ?? 0) + (minorChildren ?? 0);
}

function amountWonFromAnswer(rawAmount?: string, storedWon?: number) {
  if (storedWon !== undefined && Number.isInteger(storedWon) && storedWon >= 0) return storedWon;
  const eok = parseEokAmount(rawAmount);
  return eok === null ? null : eokAmountToWon(eok);
}

function buildConfirmedTaxBases(snapshot: AssessmentSnapshot) {
  const reviewAnswer = snapshot.answers.review;
  const taxBaseAmounts = reviewAnswer?.taxBaseAmounts ?? {};
  const taxBaseAmountWons = reviewAnswer?.taxBaseAmountWons ?? {};
  const taxBaseTaxKind = reviewAnswer?.taxBaseTaxKind ?? {};
  const entries = Object.entries(taxBaseAmounts)
    .filter(([scenarioId]) => scenarioId !== "__default")
    .map(([scenarioId, amount]) => {
      const taxableEok = parseNonnegativeEokAmount(amount);
      if (taxableEok === null) return null;
      const taxableWon = taxBaseAmountWons[scenarioId] ?? eokAmountToWon(taxableEok);
      const taxKind = taxBaseTaxKind[scenarioId] ?? inferTaxKind(snapshot);
      return {
        scenario_id: scenarioId,
        tax_kind: taxKind,
        taxable_value_eok: taxableEok,
        taxable_value_won: taxableWon,
        basis_id: `${snapshot.assessment_id}::confirmed-tax-base::${taxKind}::2026-09-06`,
        source: "confirmed_extraction" as const,
        confirmation_status: "confirmed" as const,
        law_references: ["상속세 및 증여세법 제26조", "상속세 및 증여세법 제56조"],
        note: "사용자가 외부에서 확인했다고 입력한 과세표준입니다. 일반 자산가액을 과세표준으로 간주하지 않습니다."
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  return entries;
}

function inferTaxKind(snapshot: AssessmentSnapshot) {
  const choices = [
    ...(snapshot.answers.purpose?.choices ?? []),
    ...(snapshot.answers.goal?.choices ?? [])
  ].join(" ");
  return /증여|미리|이전/.test(choices) ? "gift_tax" as const : "inheritance_tax" as const;
}

function buildIntrafamilyLoans(snapshot: AssessmentSnapshot) {
  const loanFact = factValue("부모·자녀 대출 검토", snapshot);
  const loanAmount = parseEokAmount(loanFact);
  const firstCapacity = repaymentCapacity(factValue("첫째 자녀 상환능력", snapshot));
  const secondCapacity = repaymentCapacity(factValue("둘째 자녀 상환능력", snapshot));
  const hasLoanSignal = loanFact || firstCapacity !== "unknown" || secondCapacity !== "unknown";
  if (!hasLoanSignal) return [];

  const loans = [];
  if (firstCapacity !== "unknown") {
    loans.push({
      loan_id: "assessment-family-loan-first-child",
      target_child: "first_child" as const,
      amount_eok: loanAmount,
      confirmation_status: loanAmount === null ? "amount_missing" as const : "confirmed" as const,
      repayment_capacity: firstCapacity,
      note: "차용증뿐 아니라 이자와 원금의 실제 지급흐름 확인 필요"
    });
  }
  if (secondCapacity !== "unknown") {
    loans.push({
      loan_id: "assessment-family-loan-second-child",
      target_child: "second_child" as const,
      amount_eok: loanAmount,
      confirmation_status: loanAmount === null ? "amount_missing" as const : "confirmed" as const,
      repayment_capacity: secondCapacity,
      note: "상환능력 부족 시 증여 또는 채무면제 위험 검토 필요"
    });
  }
  if (loans.length === 0) {
    loans.push({
      loan_id: "assessment-family-loan-unknown-child",
      target_child: "unknown" as const,
      amount_eok: loanAmount,
      confirmation_status: loanAmount === null ? "amount_missing" as const : "confirmed" as const,
      repayment_capacity: "unknown" as const,
      note: "대여 대상 자녀와 상환능력 확인 필요"
    });
  }
  return loans;
}

function repaymentCapacity(value?: string) {
  if (!value) return "unknown" as const;
  if (/부족|없|어려/.test(value)) return "no" as const;
  if (/있|가능/.test(value)) return "yes" as const;
  return "unknown" as const;
}

function inferInsuranceStatus(snapshot: AssessmentSnapshot) {
  const insuranceFact = factValue("보험", snapshot);
  if (insuranceFact && /없/.test(insuranceFact)) return "none" as const;
  if (snapshot.answers.assets?.choices.includes("보험")) return "has_policy" as const;
  return "unknown" as const;
}

function inferDebtStatus(debtAnswer: AssessmentSnapshot["answers"][string] | undefined, debts: Debt[]) {
  if (debtAnswer?.choices.includes("해당 없음") || debtAnswer?.facts?.["채무 여부"] === "없음") return "none" as const;
  if (debts.length > 0) return "has_debt" as const;
  return "unknown" as const;
}

function pastGiftDate(value?: string) {
  if (!value) return null;
  const match = value.match(/(\d+)\s*년\s*전/);
  return match ? `${match[1]}년 전` : null;
}

function factValue(label: string, snapshot: AssessmentSnapshot) {
  const answers = Object.values(snapshot.answers);
  const answerFact = answers
    .map((answer) => answer.facts?.[label])
    .find((value): value is string => Boolean(value));
  if (answerFact) return answerFact;
  return snapshot.conversation?.confirmed_facts.find((fact) => fact.label === label)?.value;
}

function uniqueTracks(values: PlanningTrack[]) {
  return Array.from(new Set(values));
}

function uniqueGoals(values: Goal[]) {
  return Array.from(new Set(values));
}
