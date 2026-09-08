import { parseKoreanMoneyToEok } from "./phase2b/money";
import { calculateProgressiveTaxEok } from "./phase2b/tax";

export const ASSESSMENT_STORAGE_KEY = "as360.precheck.assessment.v1";
export const PRECHECK_DRAFT_STORAGE_KEY = "as360.precheck.draft.v2";

export type AssessmentAnswer = {
  label: string;
  choices: string[];
  detail?: string;
  facts?: Record<string, string>;
  assetAmounts?: Record<string, string>;
  assetAmountWons?: Record<string, number>;
  assetAmountStatus?: Record<string, "confirmed" | "range" | "needs_confirmation" | "unknown">;
  assetAmountRanges?: Record<string, { min_won: number; max_won: number; label: string }>;
  debtAmounts?: Record<string, string>;
  debtAmountWons?: Record<string, number>;
  taxBaseAmounts?: Record<string, string>;
  taxBaseAmountWons?: Record<string, number>;
  taxBaseTaxKind?: Record<string, "inheritance_tax" | "gift_tax">;
};

type AssessmentAnswerValue = Omit<AssessmentAnswer, "label">;

export type AssessmentSnapshot = {
  assessment_id: string;
  created_at: string;
  review_focus: string[];
  answers: Record<string, AssessmentAnswer>;
  conversation?: {
    mode?: "chat";
    messages: Array<{ role: "user" | "assistant"; text: string; created_at: string }>;
    confirmed_facts: Array<{ id: string; label: string; value: string; raw_text: string; confidence: string }>;
    pending_candidates?: Array<{ id: string; label: string; value: string; raw_text: string; confidence: string }>;
    raw_inputs: string[];
    current_question_key?: string;
  };
};

export type AssessmentLoadResult =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "mismatch"; requestedId: string; snapshotId: string }
  | { status: "ready"; snapshot: AssessmentSnapshot; metrics: AssessmentMetrics };

export type AssessmentMetrics = {
  totalAssets: string;
  financialAssets: string;
  estimatedDebt: string;
  netAssets: string;
  totalBurden: string;
  immediateCash: string;
  fundingGap: string;
  familySummary: string;
  assetSummary: string;
  goalSummary: string;
  confidenceNote: string;
};

export function createAssessmentId() {
  const now = new Date();
  const stamp = now.toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `AS360-${stamp}-${suffix}`;
}

export function createDemoAssessmentSnapshot(): AssessmentSnapshot {
  const createdAt = "2026-09-06T00:00:00.000Z";
  const demoInput = [
    "본인 자산",
    "총자산 50억원",
    "금융자산 30억원",
    "아파트 20억원",
    "채무 없음",
    "배우자 1명",
    "성인 자녀 2명",
    "3년 전 자녀별 1억원 증여 및 신고",
    "목표: 세금 부담 절감과 노후생활비 유지",
    "자녀에게 5억원 대출 검토",
    "첫째는 상환능력 있음",
    "둘째는 상환능력 부족",
    "보험 없음",
    "상속세 납부 가능 현금 3억원"
  ].join(", ");

  return {
    assessment_id: "AS360-20260906-DEMO1",
    created_at: createdAt,
    review_focus: ["전체 요약 먼저 보기"],
    answers: {
      purpose: { label: "준비 목적", choices: ["여러 방법 비교"], detail: "상속·증여를 함께 비교" },
      family: {
        label: "가족",
        choices: ["부모 1명 기준"],
        detail: "",
        facts: { "배우자 유무": "있음", "자녀 수": "2명", "성년 자녀 수": "2명", "미성년 자녀 수": "0명" }
      },
      assets: {
        label: "자산",
        choices: ["금융자산", "부동산"],
        detail: "",
        facts: { "보험": "없음", "소유자 관계": "본인 자산 — 실제 소유자와 지분은 상담 전 확인 필요" },
        assetAmounts: { "금융자산": "30", "부동산": "20" },
        assetAmountWons: { "금융자산": 3_000_000_000, "부동산": 2_000_000_000 },
        assetAmountStatus: { "금융자산": "confirmed", "부동산": "confirmed" }
      },
      debt: {
        label: "채무·과거 증여",
        choices: ["최근 10년 증여 있음"],
        detail: "",
        facts: { "채무 여부": "없음", "과거 증여 상세": "3년 전 자녀별 1억 증여 및 신고" }
      },
      goal: {
        label: "승계 목표",
        choices: ["세금 부담 절감", "노후생활비 유지", "상속세 납부재원 준비"],
        detail: ""
      },
      review: {
        label: "결과 준비",
        choices: ["전체 요약 먼저 보기"],
        detail: "",
        facts: {
          "부모·자녀 대출 검토": "5",
          "첫째 자녀 상환능력": "있음",
          "둘째 자녀 상환능력": "부족",
          "상속세 납부 가능 현금": "3"
        },
        taxBaseAmounts: {
          baseline: "30",
          "gift-stepwise-transfer": "12",
          "gift-family-loan-and-gift-mix": "14",
          "inheritance-spouse-allocation": "20",
          "capital-gains-acquisition-cost-rebuild": "18",
          "capital-gains-sell-then-gift": "16",
          "inheritance-insurance-liquidity": "30"
        },
        taxBaseTaxKind: {
          baseline: "inheritance_tax",
          "gift-stepwise-transfer": "inheritance_tax",
          "gift-family-loan-and-gift-mix": "inheritance_tax",
          "inheritance-spouse-allocation": "inheritance_tax",
          "capital-gains-acquisition-cost-rebuild": "inheritance_tax",
          "capital-gains-sell-then-gift": "inheritance_tax",
          "inheritance-insurance-liquidity": "inheritance_tax"
        }
      }
    },
    conversation: {
      messages: [
        { role: "user", text: demoInput, created_at: createdAt },
        { role: "user", text: "없어요, 분석해 주세요", created_at: "2026-09-06T00:00:01.000Z" },
        { role: "assistant", text: "알겠습니다. 확인된 정보를 기준으로 적용 가능한 자산승계 방법을 분석하겠습니다.", created_at: "2026-09-06T00:00:02.000Z" },
        { role: "assistant", text: "분석이 완료되었습니다.", created_at: "2026-09-06T00:00:03.000Z" },
        { role: "assistant", text: "현재 상황에서는 다음 3개 방법을 우선 비교할 가치가 있습니다.", created_at: "2026-09-06T00:00:04.000Z" }
      ],
      confirmed_facts: [],
      pending_candidates: [],
      raw_inputs: [demoInput, "없어요, 분석해 주세요"],
      current_question_key: "review"
    }
  };
}

export function formatAnswer(answer?: AssessmentAnswer | AssessmentAnswerValue) {
  if (!answer) return "미입력";
  const parts = [
    answer.choices.length > 0 ? answer.choices.join(", ") : "",
    answer.detail,
    answer.facts ? Object.entries(answer.facts).map(([key, value]) => `${key}: ${value || "미입력"}`).join(" · ") : "",
    answer.assetAmounts ? formatAmountMap(answer.assetAmounts) : "",
    answer.assetAmountRanges ? formatRangeMap(answer.assetAmountRanges) : "",
    answer.debtAmounts ? formatAmountMap(answer.debtAmounts) : "",
    answer.taxBaseAmounts ? formatTaxBaseMap(answer.taxBaseAmounts) : ""
  ].filter(Boolean);
  return parts.join(" · ") || "미입력";
}

export function parseEokAmount(value?: string) {
  return parseExplicitEokInput(value, false);
}

export function normalizeEokAmount(value?: string) {
  const amount = parseEokAmount(value);
  if (amount === null) return "";
  return Number.isInteger(amount) ? amount.toFixed(0) : amount.toString();
}

export function parseNonnegativeEokAmount(value?: string) {
  return parseExplicitEokInput(value, true);
}

export function normalizeNonnegativeEokAmount(value?: string) {
  const amount = parseNonnegativeEokAmount(value);
  if (amount === null) return "";
  return Number.isInteger(amount) ? amount.toFixed(0) : amount.toString();
}

export function eokAmountToWon(amount: number) {
  return Math.round(amount * 100_000_000);
}

function formatAmountMap(amounts: Record<string, string>) {
  return Object.entries(amounts)
    .map(([key, value]) => {
      const amount = parseEokAmount(value);
      return `${key}: ${amount === null ? "금액 확인 필요" : formatEok(amount)}`;
    })
    .join(" · ");
}

function formatRangeMap(ranges: Record<string, { min_won: number; max_won: number; label: string }>) {
  return Object.entries(ranges)
    .map(([key, range]) => `${key}: ${range.label || `${formatWonAsEok(range.min_won)}~${formatWonAsEok(range.max_won)}`} 범위(확정값 아님)`)
    .join(" · ");
}

function formatTaxBaseMap(amounts: Record<string, string>) {
  const formatted = Object.entries(amounts)
    .map(([key, value]) => {
      const amount = parseNonnegativeEokAmount(value);
      return `${formatTaxBaseLabel(key)} ${amount === null ? "미입력" : formatEok(amount)}`;
    })
    .join(" / ");
  return formatted ? `과세표준: ${formatted}` : "";
}

function formatTaxBaseLabel(key: string) {
  const labels: Record<string, string> = {
    baseline: "기준안",
    "gift-stepwise-transfer": "사전증여",
    "gift-family-loan-and-gift-mix": "대출·증여 배분",
    "inheritance-spouse-allocation": "배우자 배분",
    "capital-gains-acquisition-cost-rebuild": "취득가액 재구성",
    "capital-gains-sell-then-gift": "양도 후 증여",
    "inheritance-insurance-liquidity": "보험 재원보완"
  };
  return labels[key] ?? key;
}

function formatEok(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "추가정보 필요";
  const absolute = Math.abs(value);
  const label = `${Number.isInteger(absolute) ? absolute.toFixed(0) : absolute.toFixed(1)}억`;
  return value < 0 ? `-${label}` : label;
}

function formatWonAsEok(valueWon: number) {
  return formatEok(valueWon / 100_000_000);
}

function debtChoiceNeedsAmount(choice: string) {
  return choice === "담보대출 있음" || choice === "임대보증금 있음" || choice === "기타채무 있음";
}

// Memory exists only in this browser runtime, never in a server-side customer store.
let currentMemoryAssessment: AssessmentSnapshot | null = null;

export function saveAssessmentForSession(snapshot: AssessmentSnapshot): boolean {
  if (typeof window === "undefined") return false;
  currentMemoryAssessment = snapshot;
  try {
    window.sessionStorage.setItem(ASSESSMENT_STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function clearAssessmentForSession(assessmentId: string): void {
  if (typeof window === "undefined") return;
  if (currentMemoryAssessment?.assessment_id === assessmentId) currentMemoryAssessment = null;
  try {
    const raw = window.sessionStorage.getItem(ASSESSMENT_STORAGE_KEY);
    if (raw && JSON.parse(raw)?.assessment_id === assessmentId) window.sessionStorage.removeItem(ASSESSMENT_STORAGE_KEY);
  } catch {
    // Do not remove an unrelated or unreadable stored assessment.
  }
}

export function readAssessmentFromSession(search = ""): AssessmentLoadResult {
  if (typeof window === "undefined") return { status: "loading" };

  const params = new URLSearchParams(search || window.location.search);
  const requestedId = params.get("assessment_id");
  if (params.get("demo") === "1") {
    const snapshot = createDemoAssessmentSnapshot();
    saveAssessmentForSession(snapshot);
    return { status: "ready", snapshot, metrics: buildAssessmentMetrics(snapshot) };
  }

  try {
    let raw: string | null = null;
    try { raw = window.sessionStorage.getItem(ASSESSMENT_STORAGE_KEY); } catch { /* Memory-only handoff. */ }
    const snapshot = requestedId && currentMemoryAssessment?.assessment_id === requestedId
      ? currentMemoryAssessment
      : raw ? JSON.parse(raw) as AssessmentSnapshot : currentMemoryAssessment;
    if (!snapshot || !snapshot.assessment_id || !snapshot.answers || !Array.isArray(snapshot.review_focus)) return { status: "missing" };
    if (requestedId && snapshot.assessment_id !== requestedId) {
      return { status: "mismatch", requestedId, snapshotId: snapshot.assessment_id };
    }
    return { status: "ready", snapshot, metrics: buildAssessmentMetrics(snapshot) };
  } catch {
    return { status: "missing" };
  }
}

export function buildAssessmentMetrics(snapshot: AssessmentSnapshot): AssessmentMetrics {
  const family = snapshot.answers.family;
  const assets = snapshot.answers.assets;
  const debt = snapshot.answers.debt;
  const goal = snapshot.answers.goal;

  const assetEntries = Object.entries(assets?.assetAmounts ?? {});
  const parsedAssetAmounts = assetEntries.map(([, amount]) => parseEokAmount(amount));
  const hasAssetAmount = assetEntries.length > 0 && parsedAssetAmounts.every((amount) => amount !== null);
  const totalAssetAmount = hasAssetAmount ? parsedAssetAmounts.reduce((sum, amount) => sum + (amount ?? 0), 0) : null;
  const financialAmount = parseEokAmount(assets?.assetAmounts?.["금융자산"]);
  const selectedDebtChoices = debt?.choices.filter(debtChoiceNeedsAmount) ?? [];
  const parsedDebtAmounts = selectedDebtChoices.map((choice) => parseEokAmount(debt?.debtAmounts?.[choice]));
  const hasNoDebt = debt?.choices.includes("해당 없음") || debt?.facts?.["채무 여부"] === "없음";
  const hasDebtAmount = selectedDebtChoices.length > 0 && parsedDebtAmounts.every((amount) => amount !== null);
  const debtAmount = hasNoDebt ? 0 : hasDebtAmount ? parsedDebtAmounts.reduce((sum, amount) => sum + (amount ?? 0), 0) : null;
  const netAssetAmount = totalAssetAmount !== null && debtAmount !== null ? totalAssetAmount - debtAmount : null;
  const hasConfirmedTaxBase = Boolean(snapshot.answers.review?.taxBaseAmounts && Object.values(snapshot.answers.review.taxBaseAmounts).some((value) => parseNonnegativeEokAmount(value) !== null));
  const baselineTaxBase = parseNonnegativeEokAmount(snapshot.answers.review?.taxBaseAmounts?.baseline);
  const baselineTax = baselineTaxBase === null ? null : calculateProgressiveTaxEok(baselineTaxBase);
  const fundingGap = baselineTax !== null && financialAmount !== null ? Math.max(baselineTax - financialAmount, 0) : null;

  return {
    totalAssets: totalAssetAmount !== null ? formatEok(totalAssetAmount) : "자산금액 확인 필요",
    financialAssets: formatEok(financialAmount),
    estimatedDebt: debtAmount !== null ? formatEok(debtAmount) : "채무 금액 미입력",
    netAssets: netAssetAmount !== null ? formatEok(netAssetAmount) : "순자산 산정 불가",
    totalBurden: baselineTax !== null ? `${formatEok(baselineTax)} 산출세액` : hasConfirmedTaxBase ? "확정 과세표준 기준 계산 가능" : "확정 과세표준 미입력",
    immediateCash: baselineTax !== null ? `${formatEok(baselineTax)} 필요` : hasConfirmedTaxBase ? "확정 산출세액 기준 확인" : "세액 계산 후 확정",
    fundingGap: fundingGap !== null ? (fundingGap === 0 ? "확인된 금융자산 범위 내" : `${formatEok(fundingGap)} 부족`) : hasConfirmedTaxBase ? "세액과 금융자산 비교 가능" : "비교 불가",
    familySummary: family ? formatAnswer(family) : "미입력",
    assetSummary: assets ? formatAnswer(assets) : "미입력",
    goalSummary: goal ? formatAnswer(goal) : "미입력",
    confidenceNote: hasConfirmedTaxBase
      ? "현재 화면은 사용자가 별도로 확인한 과세표준에 한해 산출세액을 계산합니다. 일반 자산가액을 과세표준으로 간주하지 않습니다."
      : "현재 화면은 정밀 계산 연결 전 미리보기입니다. 가족·자산 합계와 직접 입력한 채무만 표시하고, 세액·부족액은 확인 과세표준 전까지 숫자로 산정하지 않습니다."
  };
}

function parseExplicitEokInput(value: string | undefined, allowZero: boolean) {
  if (value === undefined || value === null) return null;
  const raw = value.trim();
  if (!raw) return null;
  if (/[−-]/.test(raw) || /마이너스|음수/.test(raw)) return null;

  const compact = raw.replaceAll(",", "").replace(/\s+/g, "");
  if (/^\d+(\.\d+)?$/.test(compact)) {
    const amount = Number(compact);
    if (!Number.isFinite(amount) || (allowZero ? amount < 0 : amount <= 0)) return null;
    return amount;
  }

  const explicitUnitExpression = /^(?:(\d+(?:\.\d+)?)억(?:원)?)?(?:(\d+(?:\.\d+)?)천만(?:원)?|(\d+(?:\.\d+)?)만(?:원)?)?$/;
  if (!explicitUnitExpression.test(compact) || !/\d/.test(compact) || !/억|만/.test(compact)) return null;
  const parsed = parseKoreanMoneyToEok(raw, { allowZero });
  if (parsed.status !== "parsed") return null;
  return parsed.value_eok;
}
