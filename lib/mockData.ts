export type ScenarioMetric = {
  label: string;
  value: string;
  note: string;
};

export type ScenarioComparison = {
  name: string;
  taxBurden: string;
  familyCash: string;
  complexity: "낮음" | "중간" | "높음";
  risk: "검토필요" | "주의" | "낮음";
};

export const heroMetrics: ScenarioMetric[] = [
  { label: "검토 시나리오", value: "6개", note: "증여·양도·상속 흐름 비교" },
  { label: "개인정보", value: "0건", note: "합성 mock data만 사용" },
  { label: "전문가 확인", value: "필수", note: "세법 판단은 승인 전 확정하지 않음" }
];

export const scenarioComparisons: ScenarioComparison[] = [
  { name: "현금 증여", taxBurden: "보통", familyCash: "높음", complexity: "낮음", risk: "검토필요" },
  { name: "부동산 지분 증여", taxBurden: "중간", familyCash: "중간", complexity: "중간", risk: "주의" },
  { name: "부담부증여", taxBurden: "분산", familyCash: "중간", complexity: "높음", risk: "검토필요" },
  { name: "매각 후 증여", taxBurden: "높음", familyCash: "높음", complexity: "중간", risk: "주의" },
  { name: "현 상태 유지 후 상속", taxBurden: "검토필요", familyCash: "낮음", complexity: "높음", risk: "검토필요" }
];

export const workspaceSteps = [
  "가족 구성과 자산 구조 확인",
  "사전계산 입력값 검토",
  "시나리오별 세금·현금흐름 비교",
  "차단조건 및 수동검토 항목 분류",
  "상담용 요약 리포트 준비"
];

export const mockNotice =
  "이 화면은 UI 프로토타입입니다. 모든 수치와 인물은 합성 예시이며 실제 세무 자문 또는 신고 목적으로 사용할 수 없습니다.";
