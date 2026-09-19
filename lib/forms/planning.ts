export type PlanningQuestion = {
  id: string; label: string; helper: string;
  type: string; options?: { value: string; label: string; exclusive?: boolean }[]; unit?: string;
};
export type PlanningResource = {
  id: string; title: string; description: string; primary_stage_id: string;
  sections: { id: string; title: string; description: string; questions: PlanningQuestion[] }[];
  summary_template: string;
  planning_windows?: { label: string; availability_conditions: string[]; closing_events: string[] }[];
};
export type PlanningAnswers = Record<string, string | string[]>;

// Worksheet facts remain in this page's JavaScript memory. Client navigation can
// reuse them; a refresh or a new tab starts clean, without browser disk storage.
const drafts = new Map<string, PlanningAnswers>();

export function planningNumberError(value: unknown): string | null {
  if (value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(value.trim())) {
    return "0 이상의 숫자를 소수점 둘째 자리까지 입력해 주세요.";
  }
  if (Number(value) > 1e12) return "입력할 수 있는 금액 범위를 넘었습니다. 금액 단위가 만원인지 확인해 주세요.";
  return null;
}

export function sanitizePlanningAnswers(resource: PlanningResource, input: unknown): PlanningAnswers {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  const result: PlanningAnswers = {};
  for (const q of resource.sections.flatMap(section => section.questions)) {
    const value = source[q.id];
    if (q.type === "multiselect" && Array.isArray(value)) {
      const valid = [...new Set(value.filter((entry): entry is string =>
        typeof entry === "string" && Boolean(q.options?.some(option => option.value === entry))))];
      const exclusive = valid.find(entry => q.options?.find(option => option.value === entry)?.exclusive);
      result[q.id] = exclusive ? [exclusive] : valid;
    } else if (typeof value === "string" && q.type !== "multiselect") {
      if (q.type === "select" && !q.options?.some(option => option.value === value)) continue;
      if (q.type === "number" && planningNumberError(value)) continue;
      result[q.id] = q.type === "number" && value !== "" ? String(Number(value)) : value.slice(0, 2000);
    }
  }
  return result;
}

export function planningSummary(resource: PlanningResource, answers: PlanningAnswers): string {
  const safeAnswers = sanitizePlanningAnswers(resource, answers);
  const values: Record<string, string> = {};
  for (const q of resource.sections.flatMap(section => section.questions)) {
    const value = safeAnswers[q.id];
    const label = (entry: string) => q.options?.find(option => option.value === entry)?.label ?? entry;
    const display = Array.isArray(value) ? value.map(label).join(", ") : value?.trim() ? label(value.trim()) : "";
    values[q.id] = q.type === "number" && display ? Number(display).toLocaleString("ko-KR", { maximumFractionDigits: 2 }) : display || "미입력";
  }
  const body = resource.summary_template.replace(/\{\{\s*([A-Za-z0-9_-]+)\s*\}\}( 만원)?/g,
    (_, key: string, unit: string | undefined) => {
      const value = values[key] ?? "미입력";
      return value === "미입력" ? value : value + (unit ?? "");
    });
  return body;
}

export function getPlanningDraft(resource: PlanningResource): PlanningAnswers {
  return sanitizePlanningAnswers(resource, drafts.get(resource.id));
}

export function savePlanningDraft(resource: PlanningResource, answers: PlanningAnswers): void {
  drafts.set(resource.id, sanitizePlanningAnswers(resource, answers));
}

export function clearPlanningDraft(id: string): void {
  drafts.delete(id);
}

export function collectPlanningSummaries(resources: PlanningResource[], selectedIds: string[]): { summaries: string[]; missing: string[] } {
  const summaries: string[] = [];
  const missing: string[] = [];
  for (const resource of resources) {
    if (resource.id === "PLAN-06" || !selectedIds.includes(resource.id)) continue;
    const answers = getPlanningDraft(resource);
    if (Object.values(answers).some(value => Array.isArray(value) ? value.length > 0 : Boolean(value.trim()))) {
      summaries.push(planningSummary(resource, answers));
    } else missing.push(resource.title);
  }
  return { summaries, missing };
}
