import {
  Banknote,
  Building2,
  CircleAlert,
  Factory,
  FileText,
  HeartHandshake,
  Home,
  Landmark,
  Layers3,
  ShieldCheck,
  Umbrella
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type StrategyStatus =
  | "계산 완료"
  | "예상 범위"
  | "추가정보 필요"
  | "전문가 검토 필수"
  | "현재 조건에서는 계산 제한";

export type Strategy = {
  name: string;
  description: string;
  current_tax_and_cost: string;
  future_tax_and_cost: string;
  total_burden: string;
  immediate_cash_required: string;
  parent_remaining_assets: string;
  child_transferred_assets: string;
  liquidity_gap: string;
  control_level: string;
  complexity: "낮음" | "중간" | "높음";
  calculation_status: StrategyStatus;
  key_review_items: string[];
  status_detail: string;
  timeline_events: string[];
  family_transfer_results: Array<{ person: string; value: string; note: string }>;
  icon: LucideIcon;
};

export type WizardStep = {
  key: "family" | "assets" | "debt" | "goal" | "review";
  label: string;
  eyebrow: string;
  title: string;
  helper: string;
  primaryQuestion: string;
  choices: string[];
  secondaryQuestion?: string;
  secondaryPlaceholder?: string;
};

export const publicValuePoints = ["회원가입 없이", "상세주소 불필요", "결과 즉시 확인"];

export const strategyBranches: Strategy[] = [
  {
    name: "현 상태 유지 후 상속",
    description: "현재 보유 구조를 유지하고 상속 시점의 세금과 납부재원 부족 가능성을 봅니다.",
    current_tax_and_cost: "계산엔진 연결 후 산정",
    future_tax_and_cost: "전문가 검토 필요",
    total_burden: "계산엔진 연결 후 산정",
    immediate_cash_required: "낮음",
    parent_remaining_assets: "가족별 계산 후 산정",
    child_transferred_assets: "상속 시점 집중",
    liquidity_gap: "정밀 계산에서 산정",
    control_level: "부모 통제 유지",
    complexity: "중간",
    calculation_status: "전문가 검토 필수",
    key_review_items: ["상속공제", "배우자공제", "납부재원"],
    status_detail: "배우자공제와 사전증여 가산 여부 확인 전에는 확정 계산하지 않습니다.",
    timeline_events: ["2026 현재 구조 유지", "2032 납부재원 사전 점검", "2042 잔여재산 상속"],
    family_transfer_results: [
      { person: "배우자", value: "공제 검토", note: "상속 시점 배우자공제 확인" },
      { person: "자녀 1", value: "상속 시점", note: "사전 이전 없음" },
      { person: "자녀 2", value: "상속 시점", note: "사전 이전 없음" }
    ],
    icon: Home
  },
  {
    name: "일부·단계적 증여",
    description: "증여재산공제와 평가시점을 고려해 일부 지분 또는 현금을 단계적으로 이전합니다.",
    current_tax_and_cost: "계산엔진 연결 후 산정",
    future_tax_and_cost: "계산엔진 연결 후 산정",
    total_burden: "계산엔진 연결 후 산정",
    immediate_cash_required: "추가정보 필요",
    parent_remaining_assets: "가족별 계산 후 산정",
    child_transferred_assets: "가족별 계산 후 산정",
    liquidity_gap: "정밀 계산에서 산정",
    control_level: "공동 의사결정",
    complexity: "중간",
    calculation_status: "예상 범위",
    key_review_items: ["10년 합산", "평가액", "취득세"],
    status_detail: "평가액과 과거 증여 내역이 확인되면 비교 후보로 볼 수 있습니다.",
    timeline_events: ["2026 증여 대상 선별", "2027 1차 일부 증여", "2031 추가 증여 여부 재검토", "2042 잔여재산 상속"],
    family_transfer_results: [
      { person: "부모", value: "정밀 산정", note: "생활재원과 통제권 일부 유지" },
      { person: "자녀 1", value: "정밀 산정", note: "단계적 이전 예시" },
      { person: "자녀 2", value: "정밀 산정", note: "단계적 이전 예시" }
    ],
    icon: Layers3
  },
  {
    name: "매각 후 현금 증여",
    description: "자산 매각으로 유동성을 확보한 뒤 가족별 현금 이전 여력을 비교합니다.",
    current_tax_and_cost: "추가정보 필요",
    future_tax_and_cost: "계산엔진 연결 후 산정",
    total_burden: "전문가 산정",
    immediate_cash_required: "매각 후 확보",
    parent_remaining_assets: "현금 중심",
    child_transferred_assets: "현금 이전",
    liquidity_gap: "낮음",
    control_level: "유동성 중심",
    complexity: "중간",
    calculation_status: "추가정보 필요",
    key_review_items: ["양도세", "장기보유", "매각비용"],
    status_detail: "취득가액과 보유기간이 입력되어야 양도세 범위를 좁힐 수 있습니다.",
    timeline_events: ["2026 매각 가능 자산 분류", "2027 양도세 범위 산정", "2028 현금 증여 실행 여부 결정"],
    family_transfer_results: [
      { person: "부모", value: "현금 중심", note: "매각 후 유동성 확보" },
      { person: "자녀 1", value: "현금 이전", note: "증여 한도와 세율 확인" },
      { person: "자녀 2", value: "현금 이전", note: "증여 한도와 세율 확인" }
    ],
    icon: Banknote
  },
  {
    name: "부담부증여 검토",
    description: "채무 인수를 동반한 증여가 가능한지 보고 증여 부분과 양도 부분을 나눕니다.",
    current_tax_and_cost: "현재 조건에서는 계산 제한",
    future_tax_and_cost: "전문가 검토 필요",
    total_burden: "미계산",
    immediate_cash_required: "증빙 확인 후 산정",
    parent_remaining_assets: "채무 승계 반영",
    child_transferred_assets: "자산·채무 동시 이전",
    liquidity_gap: "추가정보 필요",
    control_level: "채권자 승인 영향",
    complexity: "높음",
    calculation_status: "현재 조건에서는 계산 제한",
    key_review_items: ["채무승계 증빙", "담보 여부", "양도세 연결"],
    status_detail: "채무승계 증빙이 없으면 부담부증여 계산을 제한합니다.",
    timeline_events: [],
    family_transfer_results: [
      { person: "부모", value: "자산·채무", note: "채무 인수 가능성 확인 전" },
      { person: "자녀", value: "인수 후보", note: "금융기관 승인과 담보 확인 필요" },
      { person: "채권자", value: "승인 필요", note: "증빙 없으면 계산 제한" }
    ],
    icon: Landmark
  },
  {
    name: "가족법인 활용",
    description: "법인 설립과 지분승계를 통해 자산 통제권과 이전 시점을 분리합니다.",
    current_tax_and_cost: "전문가 검토 필요",
    future_tax_and_cost: "계산엔진 연결 후 산정",
    total_burden: "전문가 산정",
    immediate_cash_required: "추가정보 필요",
    parent_remaining_assets: "법인 구조 전환",
    child_transferred_assets: "지분 이전",
    liquidity_gap: "정밀 계산에서 산정",
    control_level: "정관·지분 설계",
    complexity: "높음",
    calculation_status: "전문가 검토 필수",
    key_review_items: ["법인세", "지분평가", "사후관리"],
    status_detail: "지분평가와 운영비가 미확정이면 전문가 검토가 필수입니다.",
    timeline_events: ["2026 가족법인 설립", "2027 현금 출자 및 부동산 취득", "2030 법인지분 20% 증여", "2042 잔여지분 상속"],
    family_transfer_results: [
      { person: "부모", value: "60%", note: "의사결정권 유지" },
      { person: "가족법인", value: "20%", note: "자산 보유 구조 전환" },
      { person: "자녀", value: "20%", note: "지분 이전 예시" }
    ],
    icon: Factory
  },
  {
    name: "보험 납부재원",
    description: "상속세 납부재원 부족을 보험과 현금흐름으로 보강하는 방안을 봅니다.",
    current_tax_and_cost: "계산엔진 연결 후 산정",
    future_tax_and_cost: "계산엔진 연결 후 산정",
    total_burden: "보완 전략",
    immediate_cash_required: "보험료 필요",
    parent_remaining_assets: "가족별 계산 후 산정",
    child_transferred_assets: "납부재원 확보",
    liquidity_gap: "정밀 계산에서 산정",
    control_level: "보장 구조",
    complexity: "중간",
    calculation_status: "추가정보 필요",
    key_review_items: ["계약자", "수익자", "보험료 재원"],
    status_detail: "계약자·피보험자·수익자 정보가 입력되어야 분석 가능합니다.",
    timeline_events: ["2026 보험계약 구조 확인", "2027 보험료 재원 점검", "2035 상속세 납부재원 보강"],
    family_transfer_results: [
      { person: "부모", value: "정밀 산정", note: "자산 보유 유지" },
      { person: "보험", value: "재원 후보", note: "계약자·수익자 확인 필요" },
      { person: "자녀", value: "수익자 검토", note: "세무상 귀속 확인" }
    ],
    icon: Umbrella
  },
  {
    name: "혼합 전략",
    description: "증여, 매각, 보험, 법인 구조를 조합해 세금과 통제권을 함께 조정합니다.",
    current_tax_and_cost: "계산엔진 연결 후 산정",
    future_tax_and_cost: "계산엔진 연결 후 산정",
    total_burden: "계산엔진 연결 후 산정",
    immediate_cash_required: "단계별",
    parent_remaining_assets: "균형",
    child_transferred_assets: "분산 이전",
    liquidity_gap: "추가 산정",
    control_level: "맞춤 설계",
    complexity: "높음",
    calculation_status: "예상 범위",
    key_review_items: ["순서 설계", "현금흐름", "특수관계"],
    status_detail: "증여·보험·법인 활용을 조합해 납부재원 부족을 줄이는 후보입니다.",
    timeline_events: ["2026 우선순위 확정", "2027 일부 증여와 보험 구조 설계", "2030 법인 또는 매각 조합 검토", "2042 잔여재산 정리"],
    family_transfer_results: [
      { person: "부모", value: "균형", note: "통제권과 유동성 동시 관리" },
      { person: "자녀", value: "분산 이전", note: "증여·상속 시점 분리" },
      { person: "보험·법인", value: "조합", note: "부족액 보완 후보" }
    ],
    icon: ShieldCheck
  }
];

export const flowSteps = [
  { title: "가족과 자산 구조 입력", body: "정확한 주소나 증빙 없이 큰 틀의 자산 유형과 금액대를 먼저 정리합니다." },
  { title: "7가지 승계 전략 비교", body: "상속, 증여, 매각, 부담부증여, 가족법인, 보험, 혼합 전략을 같은 기준으로 비교합니다." },
  { title: "무료 사전진단 보고서 확인", body: "확정 세액이 아닌 상담 전 의사결정용 보고서로 쟁점과 방향을 확인합니다." },
  { title: "조경호 회계사 정밀상담 연결", body: "입력한 내용을 다시 쓰지 않고 상담 신청으로 자연스럽게 이어집니다." }
];

export const wizardSteps: WizardStep[] = [
  {
    key: "family",
    label: "가족",
    eyebrow: "Step 1",
    title: "승계 의사결정에 참여할 가족 구성을 알려주세요.",
    helper: "정확한 실명 대신 관계, 배우자 유무, 자녀 수만으로 사전진단을 시작할 수 있습니다.",
    primaryQuestion: "상담 기준이 되는 가족 구조는 무엇인가요?",
    choices: ["부모 1명 기준", "부모 2명 기준", "공동상속인 많음", "아직 정리 전"],
    secondaryQuestion: "가족 관계에서 특별히 고려할 점이 있나요?",
    secondaryPlaceholder: "예: 자녀별 형평, 배우자 생활재원"
  },
  {
    key: "assets",
    label: "자산",
    eyebrow: "Step 2",
    title: "승계 대상 자산의 큰 구성을 선택해 주세요.",
    helper: "상세주소·계좌번호 없이 자산 유형별 대략 금액만 입력합니다.",
    primaryQuestion: "보유한 자산 유형을 모두 선택해 주세요.",
    choices: ["부동산", "금융자산", "법인지분", "보험", "기타"],
    secondaryQuestion: "전체 자산을 한 줄로 요약하면 어떻게 보이나요?",
    secondaryPlaceholder: "예: 부동산 비중이 높고 현금성 자산은 별도 확인 필요"
  },
  {
    key: "debt",
    label: "채무·과거 증여",
    eyebrow: "Step 3",
    title: "채무나 과거 증여처럼 결과에 영향을 주는 항목이 있나요?",
    helper: "부담부증여와 10년 합산 검토가 필요한지 판단하는 단계입니다.",
    primaryQuestion: "해당되는 항목을 선택해 주세요.",
    choices: ["담보대출 있음", "임대보증금 있음", "최근 10년 증여 있음", "해당 없음", "잘 모르겠음"],
    secondaryQuestion: "가장 확인이 필요한 항목은 무엇인가요?",
    secondaryPlaceholder: "예: 임대보증금 승계 가능성"
  },
  {
    key: "goal",
    label: "승계 목표",
    eyebrow: "Step 4",
    title: "가족이 가장 중요하게 보는 목표는 무엇인가요?",
    helper: "절세만이 아니라 통제권, 유동성, 가족 간 형평을 함께 비교합니다.",
    primaryQuestion: "우선순위에 가까운 목표를 선택해 주세요.",
    choices: ["현재 구조 유지", "일부를 미리 이전", "자산을 매각해 현금화", "가족법인 활용", "상속세 납부재원 준비", "아직 모르겠음"],
    secondaryQuestion: "상담에서 꼭 보고 싶은 쟁점이 있나요?",
    secondaryPlaceholder: "예: 자녀별 형평과 납부재원"
  },
  {
    key: "review",
    label: "결과 준비",
    eyebrow: "Step 5",
    title: "입력값을 확인하면 사전진단 결과를 볼 수 있습니다.",
    helper: "아래 요약은 브라우저 안에서만 표시되는 합성 예시이며 실제 저장은 하지 않습니다.",
    primaryQuestion: "결과에서 우선 비교할 관점을 선택해 주세요.",
    choices: ["세금·비용", "즉시 필요현금", "부모 통제권", "자녀 이전효과", "납부재원 부족액"]
  }
];

export const projectSnapshot = {
  title: "가족 A 자산승계",
  stage: "자료 검토 중",
  totalAssets: "입력 후 산정",
  totalDebt: "직접 입력 필요",
  netAssets: "채무 확인 후 산정",
  cashAvailable: "입력 후 확인",
  estimatedFundingGap: "정밀 계산에서 산정",
  scenarioCount: "7개",
  unresolvedIssues: "7건"
};

export const expertIssues = [
  { title: "부동산 평가방법", tone: "warning", body: "시가·공시가격·감정가 중 적용 기준 확인 필요" },
  { title: "부담부증여 채무승계", tone: "danger", body: "금융기관 채무 인수 증빙 없으면 계산 제한" },
  { title: "보험 납부재원", tone: "success", body: "계약자·수익자 구조 확인 후 납부재원 분석 가능" }
];

export const timelineEvents = [
  "2026 가족법인 설립",
  "2027 현금 출자 및 부동산 취득",
  "2030 법인지분 20% 증여",
  "2032 부담부증여 가능성 검토",
  "2035 보험 납부재원 보강",
  "2042 잔여지분 상속"
];

export const publicNav = [
  { href: "/", label: "서비스 소개" },
  { href: "/precheck", label: "무료 진단" },
  { href: "/precheck/result", label: "결과 예시" },
  { href: "/consultation", label: "상담 신청" }
];

export const expertNav = [
  { href: "/expert/overview", label: "프로젝트 개요", icon: Landmark, enabled: true },
  { href: "/expert/overview#family-assets", label: "가족·자산", icon: Home, enabled: true },
  { href: "/expert/workspace", label: "시나리오", icon: Building2, enabled: true },
  { href: "/expert/workspace#issues", label: "검토·쟁점", icon: CircleAlert, enabled: true },
  { href: "/expert/overview#report", label: "보고서", icon: FileText, enabled: true },
  { href: "/expert/workspace#sources", label: "규칙·출처", icon: HeartHandshake, enabled: true }
];

export const simulationDisclaimer = "합성 데이터 기반 화면입니다. 실제 세액 산정 전 전문가 검토가 필요합니다.";
