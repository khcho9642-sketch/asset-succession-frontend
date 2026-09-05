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
