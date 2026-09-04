import {
  Banknote,
  Building2,
  CircleAlert,
  Factory,
  HeartHandshake,
  Home,
  Landmark,
  Layers3,
  ShieldCheck,
  Umbrella
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type StrategyStatus = "검토 가치 있음" | "추가정보 필요" | "전문가 검토 필수" | "현재 조건에서는 계산 제한";

export type Strategy = {
  name: string;
  description: string;
  expectedCost: string;
  immediateCash: string;
  parentAssets: string;
  childTransfer: string;
  fundingGap: string;
  control: string;
  complexity: "낮음" | "중간" | "높음";
  status: StrategyStatus;
  considerations: string[];
  icon: LucideIcon;
};

export const publicValuePoints = ["회원가입 없이", "상세주소 불필요", "결과 즉시 확인"];

export const strategyBranches: Strategy[] = [
  {
    name: "현 상태 유지 후 상속",
    description: "현재 보유 구조를 유지하고 상속 시점의 세금과 납부재원 부족 가능성을 봅니다.",
    expectedCost: "높음",
    immediateCash: "낮음",
    parentAssets: "높음",
    childTransfer: "상속 시점 집중",
    fundingGap: "7억 추정",
    control: "부모 통제 유지",
    complexity: "중간",
    status: "전문가 검토 필수",
    considerations: ["상속공제", "배우자공제", "납부재원"],
    icon: Home
  },
  {
    name: "일부·단계적 증여",
    description: "증여재산공제와 평가시점을 고려해 일부 지분 또는 현금을 단계적으로 이전합니다.",
    expectedCost: "중간",
    immediateCash: "중간",
    parentAssets: "일부 감소",
    childTransfer: "점진 이전",
    fundingGap: "3억 추정",
    control: "공동 의사결정",
    complexity: "중간",
    status: "검토 가치 있음",
    considerations: ["10년 합산", "평가액", "취득세"],
    icon: Layers3
  },
  {
    name: "매각 후 현금 증여",
    description: "자산 매각으로 유동성을 확보한 뒤 가족별 현금 이전 여력을 비교합니다.",
    expectedCost: "높음",
    immediateCash: "높음",
    parentAssets: "현금화",
    childTransfer: "현금 이전",
    fundingGap: "낮음",
    control: "유동성 중심",
    complexity: "중간",
    status: "추가정보 필요",
    considerations: ["양도세", "장기보유", "매각비용"],
    icon: Banknote
  },
  {
    name: "가족법인 활용",
    description: "법인 설립과 지분승계를 통해 자산 통제권과 이전 시점을 분리합니다.",
    expectedCost: "분산",
    immediateCash: "중간",
    parentAssets: "법인 구조 전환",
    childTransfer: "지분 이전",
    fundingGap: "4억 추정",
    control: "정관·지분 설계",
    complexity: "높음",
    status: "전문가 검토 필수",
    considerations: ["법인세", "지분평가", "사후관리"],
    icon: Factory
  },
  {
    name: "보험 납부재원",
    description: "상속세 납부재원 부족을 보험과 현금흐름으로 보강하는 방안을 봅니다.",
    expectedCost: "보완형",
    immediateCash: "보험료 필요",
    parentAssets: "유지",
    childTransfer: "납부재원 확보",
    fundingGap: "2억 추정",
    control: "보장 구조",
    complexity: "중간",
    status: "검토 가치 있음",
    considerations: ["계약자", "수익자", "보험료 재원"],
    icon: Umbrella
  },
  {
    name: "혼합 전략",
    description: "증여, 매각, 보험, 법인 구조를 조합해 세금과 통제권을 함께 조정합니다.",
    expectedCost: "최적화 후보",
    immediateCash: "단계별",
    parentAssets: "균형",
    childTransfer: "분산 이전",
    fundingGap: "추가 산정",
    control: "맞춤 설계",
    complexity: "높음",
    status: "현재 조건에서는 계산 제한",
    considerations: ["순서 설계", "현금흐름", "특수관계"],
    icon: ShieldCheck
  }
];

export const flowSteps = [
  { title: "가족과 자산 구조 입력", body: "정확한 주소나 증빙 없이 큰 틀의 자산 유형과 금액대를 먼저 정리합니다." },
  { title: "6가지 승계 전략 비교", body: "상속, 증여, 매각, 가족법인, 보험, 혼합 전략을 같은 기준으로 비교합니다." },
  { title: "무료 사전진단 보고서 확인", body: "확정 세액이 아닌 상담 전 의사결정용 보고서로 쟁점과 방향을 확인합니다." },
  { title: "조경호 회계사 정밀상담 연결", body: "입력한 내용을 다시 쓰지 않고 상담 신청으로 자연스럽게 이어집니다." }
];

export const wizardSteps = [
  {
    label: "가족",
    eyebrow: "Step 1",
    title: "누가 누구에게 자산을 남기려 하나요?",
    questions: ["부모 세대 인원", "자녀 세대 인원", "배우자 유무"]
  },
  {
    label: "자산",
    eyebrow: "Step 2",
    title: "승계 대상 자산의 큰 구성을 알려주세요.",
    questions: ["부동산", "금융자산", "법인지분", "보험", "기타"]
  },
  {
    label: "채무·과거 증여",
    eyebrow: "Step 3",
    title: "채무나 과거 증여가 있나요?",
    questions: ["담보대출", "임대보증금", "최근 10년 증여"]
  },
  {
    label: "승계 목표",
    eyebrow: "Step 4",
    title: "가족이 가장 중요하게 보는 목표는 무엇인가요?",
    questions: ["현재 구조 유지", "일부를 미리 이전", "자산 매각", "가족법인 활용", "상속세 납부재원 준비", "아직 모르겠음"]
  },
  {
    label: "결과 준비",
    eyebrow: "Step 5",
    title: "입력값을 바탕으로 사전진단 결과를 준비합니다.",
    questions: ["비교 기준 확인", "보고서 생성", "상담 연결"]
  }
];

export const projectSnapshot = {
  title: "홍길동 가족 자산승계",
  stage: "자료 검토 중",
  totalAssets: "55억",
  totalDebt: "8억",
  netAssets: "47억",
  cashAvailable: "5억",
  estimatedFundingGap: "7억",
  scenarioCount: "7개",
  unresolvedIssues: "7건"
};

export const expertIssues = [
  { title: "부동산 평가방법", tone: "warning", body: "시가·공시가격·감정가 중 적용 기준 확인 필요" },
  { title: "부담부증여 채무승계", tone: "danger", body: "금융기관 채무 인수 증빙 없으면 계산 제한" },
  { title: "보험 납부재원", tone: "success", body: "납부재원 부족액 일부 보완 가능성 있음" }
];

export const timelineEvents = [
  "2026 가족법인 설립",
  "2027 현금 출자 및 부동산 취득",
  "2030 법인지분 20% 증여",
  "2035 보험 납부재원 보강",
  "2042 잔여지분 상속"
];

export const stateExamples = [
  { label: "Loading", body: "전략별 비교표를 구성하는 중입니다." },
  { label: "Empty", body: "보험 정보가 없어 납부재원 분석은 비어 있습니다." },
  { label: "Warning", body: "취득세 중과 가능성은 전문가 검토가 필요합니다." },
  { label: "Blocked", body: "채무 승계 증빙이 없으면 부담부증여 계산을 제한합니다." }
];

export const publicNav = [
  { href: "/", label: "서비스 소개" },
  { href: "/precheck", label: "무료 진단" },
  { href: "/precheck/result", label: "결과 예시" },
  { href: "/consultation", label: "상담 신청" }
];

export const expertNav = [
  { href: "/expert/overview", label: "프로젝트 개요", icon: Landmark },
  { href: "/expert/workspace", label: "시나리오", icon: Building2 },
  { href: "/expert/workspace#issues", label: "검토·쟁점", icon: CircleAlert },
  { href: "/expert/overview#report", label: "보고서", icon: HeartHandshake }
];

export const prototypeDisclaimer = "UI 프로토타입 · 합성 데이터 기반 · 실제 세액 산정 전 전문가 검토 필요";
