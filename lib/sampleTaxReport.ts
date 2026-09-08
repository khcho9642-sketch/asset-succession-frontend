import type { AssessmentSnapshot } from "./assessment";
import { calculateTaxComparison } from "./tax-comparison";
import type { TaxComparisonInput } from "./tax-comparison/types";

export const sampleTaxReportSections = [
  "추정 세액 요약", "가족·자산과 계산 조건", "대안별 세액 비교",
  "기준안 계산 근거", "대안 계산 근거", "납부재원 점검", "실행 준비와 근거",
] as const;

/** A standalone fictional example. Never reads or writes a customer's assessment. */
export function createSampleTaxReport() {
  const createdAt = "2026-09-08T00:00:00.000Z";
  const input: TaxComparisonInput = {
    version: 1, track: "inheritance", confirmed: true, confirmedAt: createdAt,
    values: {
      estate: "52", financial: "12", debt: "0", financialDebt: "0",
      spouse: "yes", children: "3", funeral: "0.05", resident: "yes",
      standardCase: "yes", availableCash: "",
    },
  };
  const snapshot: AssessmentSnapshot = {
    assessment_id: "AS360-SAMPLE-INHERITANCE-52",
    created_at: createdAt,
    review_focus: ["샘플 · 가상 사례"],
    answers: {
      purpose: { label: "가상 사례의 비교 주제", choices: ["상속"], detail: "배우자 배분에 따른 추정 상속세 비교" },
      family: { label: "가정한 가족관계", choices: [], facts: { "배우자 유무": "있음", "성년 자녀 수": "3명" } },
      assets: { label: "가정한 상속재산", choices: ["부동산", "금융자산"],
        detail: "피상속인 1인 소유: 건물 25억원, 아파트 15억원, 공제 대상 금융재산 12억원",
        assetAmountWons: { "부동산": 4_000_000_000, "금융자산": 1_200_000_000 },
        assetAmountStatus: { "부동산": "confirmed", "금융자산": "confirmed" } },
      debt: { label: "가정한 채무·사전증여", choices: [], detail: "채무와 합산할 사전증여 없음" },
    },
    taxComparisonInput: input,
  };
  return { snapshot, comparison: calculateTaxComparison(input) };
}
