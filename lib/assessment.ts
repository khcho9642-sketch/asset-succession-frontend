export const ASSESSMENT_STORAGE_KEY = "as360.precheck.assessment.v1";

export type AssessmentAnswer = {
  label: string;
  choices: string[];
  detail?: string;
  facts?: Record<string, string>;
  assetAmounts?: Record<string, string>;
};

export type AssessmentSnapshot = {
  assessment_id: string;
  created_at: string;
  review_focus: string[];
  answers: Record<string, AssessmentAnswer>;
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

export function formatAnswer(answer?: AssessmentAnswer) {
  if (!answer) return "미입력";
  const parts = [
    answer.choices.length > 0 ? answer.choices.join(", ") : "",
    answer.detail,
    answer.facts ? Object.entries(answer.facts).map(([key, value]) => `${key}: ${value || "미입력"}`).join(" · ") : "",
    answer.assetAmounts ? Object.entries(answer.assetAmounts).map(([key, value]) => `${key}: ${value || "금액 미입력"}`).join(" · ") : ""
  ].filter(Boolean);
  return parts.join(" · ") || "미입력";
}

function parseEokAmount(value?: string) {
  if (!value) return null;
  const compact = value.replaceAll(",", "").trim();
  const match = compact.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  return Number(match[1]);
}

function formatEok(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "추가정보 필요";
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}억`;
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
  const totalAssetAmount = assetEntries.reduce((sum, [, amount]) => sum + (parseEokAmount(amount) ?? 0), 0);
  const hasAssetAmount = assetEntries.some(([, amount]) => parseEokAmount(amount) !== null);
  const financialAmount = parseEokAmount(assets?.assetAmounts?.["금융자산"]);
  const debtAmount =
    debt?.choices.includes("해당 없음") ? 0 :
    debt?.choices.includes("담보대출 있음") && debt?.choices.includes("임대보증금 있음") ? 11 :
    debt?.choices.includes("담보대출 있음") ? 8 :
    debt?.choices.includes("임대보증금 있음") ? 3 :
    null;
  const netAssetAmount = hasAssetAmount && debtAmount !== null ? Math.max(totalAssetAmount - debtAmount, 0) : null;

  return {
    totalAssets: hasAssetAmount ? formatEok(totalAssetAmount) : "추가정보 필요",
    financialAssets: formatEok(financialAmount),
    estimatedDebt: formatEok(debtAmount),
    netAssets: formatEok(netAssetAmount),
    totalBurden: hasAssetAmount ? "전략별 합성 예시" : "추가정보 필요",
    immediateCash: financialAmount !== null ? `입력 금융자산 ${formatEok(financialAmount)}` : "금융자산 확인 필요",
    fundingGap: financialAmount !== null ? "정밀 계산에서 확정" : "납부재원 확인 필요",
    familySummary: family ? formatAnswer(family) : "미입력",
    assetSummary: assets ? formatAnswer(assets) : "미입력",
    goalSummary: goal ? formatAnswer(goal) : "미입력",
    confidenceNote: "현재 화면은 세법 계산엔진 연결 전 UI 프로토타입입니다. 가족·자산 합계는 입력 스냅샷에서 표시하고, 전략별 세액 수치는 합성 예시로만 제공합니다."
  };
}
