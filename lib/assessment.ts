export const ASSESSMENT_STORAGE_KEY = "as360.precheck.assessment.v1";

export type AssessmentAnswer = {
  label: string;
  choices: string[];
  detail?: string;
  facts?: Record<string, string>;
  assetAmounts?: Record<string, string>;
  debtAmounts?: Record<string, string>;
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
    raw_inputs: string[];
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
    answer.debtAmounts ? formatAmountMap(answer.debtAmounts) : ""
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

function formatAmountMap(amounts: Record<string, string>) {
  return Object.entries(amounts)
    .map(([key, value]) => {
      const amount = parseEokAmount(value);
      return `${key}: ${amount === null ? "금액 확인 필요" : formatEok(amount)}`;
    })
    .join(" · ");
}

function formatEok(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "추가정보 필요";
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}억`;
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
  const hasNoDebt = debt?.choices.includes("해당 없음") || (debt && selectedDebtChoices.length === 0 && !debt.choices.includes("잘 모르겠음"));
  const hasDebtAmount = selectedDebtChoices.length > 0 && parsedDebtAmounts.every((amount) => amount !== null);
  const debtAmount = hasNoDebt ? 0 : hasDebtAmount ? parsedDebtAmounts.reduce((sum, amount) => sum + (amount ?? 0), 0) : null;
  const netAssetAmount = totalAssetAmount !== null && debtAmount !== null ? Math.max(totalAssetAmount - debtAmount, 0) : null;

  return {
    totalAssets: totalAssetAmount !== null ? formatEok(totalAssetAmount) : "자산금액 확인 필요",
    financialAssets: formatEok(financialAmount),
    estimatedDebt: debtAmount !== null ? formatEok(debtAmount) : "채무 금액 미입력",
    netAssets: netAssetAmount !== null ? formatEok(netAssetAmount) : "순자산 산정 불가",
    totalBurden: "계산엔진 연결 후 산정",
    immediateCash: financialAmount !== null ? `입력 금융자산 ${formatEok(financialAmount)}` : "금융자산 확인 필요",
    fundingGap: "정밀 계산에서 산정",
    familySummary: family ? formatAnswer(family) : "미입력",
    assetSummary: assets ? formatAnswer(assets) : "미입력",
    goalSummary: goal ? formatAnswer(goal) : "미입력",
    confidenceNote: "현재 화면은 정밀 계산 연결 전 미리보기입니다. 가족·자산 합계와 직접 입력한 채무만 표시하고, 전략별 세액·부족액은 정밀 계산 전까지 숫자로 산정하지 않습니다."
  };
}
