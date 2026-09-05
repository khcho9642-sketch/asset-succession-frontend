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
  if (!value) return null;
  const compact = value.trim();
  if (!/^\d+(\.\d+)?$/.test(compact)) return null;
  const amount = Number(compact);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}

export function normalizeEokAmount(value?: string) {
  const amount = parseEokAmount(value);
  if (amount === null) return "";
  return Number.isInteger(amount) ? amount.toFixed(0) : amount.toString();
}

export function parseNonnegativeEokAmount(value?: string) {
  if (value === undefined || value === null) return null;
  const compact = value.trim();
  if (!/^\d+(\.\d+)?$/.test(compact)) return null;
  const amount = Number(compact);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return amount;
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
  return Object.entries(amounts)
    .map(([key, value]) => {
      const amount = parseNonnegativeEokAmount(value);
      const label = key === "baseline" ? "기준안 과세표준" : "대안 과세표준";
      return `${label}: ${amount === null ? "미입력" : formatEok(amount)}`;
    })
    .join(" · ");
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
  return choice === "담보대출 있음" || choice === "임대보증금 있음";
}

export function readAssessmentFromSession(search = ""): AssessmentLoadResult {
  if (typeof window === "undefined") return { status: "loading" };

  const requestedId = new URLSearchParams(search || window.location.search).get("assessment_id");
  const raw = window.sessionStorage.getItem(ASSESSMENT_STORAGE_KEY);
  if (!raw) return { status: "missing" };

  try {
    const snapshot = JSON.parse(raw) as AssessmentSnapshot;
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
  const hasNoDebt = debt?.choices.includes("해당 없음");
  const hasDebtAmount = selectedDebtChoices.length > 0 && parsedDebtAmounts.every((amount) => amount !== null);
  const debtAmount = hasNoDebt ? 0 : hasDebtAmount ? parsedDebtAmounts.reduce((sum, amount) => sum + (amount ?? 0), 0) : null;
  const netAssetAmount = totalAssetAmount !== null && debtAmount !== null ? totalAssetAmount - debtAmount : null;
  const hasConfirmedTaxBase = Boolean(snapshot.answers.review?.taxBaseAmounts && Object.values(snapshot.answers.review.taxBaseAmounts).some((value) => parseNonnegativeEokAmount(value) !== null));

  return {
    totalAssets: totalAssetAmount !== null ? formatEok(totalAssetAmount) : "자산금액 확인 필요",
    financialAssets: formatEok(financialAmount),
    estimatedDebt: debtAmount !== null ? formatEok(debtAmount) : "채무 금액 미입력",
    netAssets: netAssetAmount !== null ? formatEok(netAssetAmount) : "순자산 산정 불가",
    totalBurden: hasConfirmedTaxBase ? "확정 과세표준 기준 계산 가능" : "확정 과세표준 미입력",
    immediateCash: hasConfirmedTaxBase ? "확정 산출세액 기준 확인" : "세액 계산 후 확정",
    fundingGap: hasConfirmedTaxBase ? "세액과 금융자산 비교 가능" : "비교 불가",
    familySummary: family ? formatAnswer(family) : "미입력",
    assetSummary: assets ? formatAnswer(assets) : "미입력",
    goalSummary: goal ? formatAnswer(goal) : "미입력",
    confidenceNote: hasConfirmedTaxBase
      ? "현재 화면은 사용자가 별도로 확인한 과세표준에 한해 산출세액을 계산합니다. 일반 자산가액을 과세표준으로 간주하지 않습니다."
      : "현재 화면은 정밀 계산 연결 전 미리보기입니다. 가족·자산 합계와 직접 입력한 채무만 표시하고, 세액·부족액은 확인 과세표준 전까지 숫자로 산정하지 않습니다."
  };
}
