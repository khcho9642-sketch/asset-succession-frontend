import type { ChatState } from "../chat/intake";

const purposes: Record<string, string> = {
  상속: "inheritance", 증여: "gift", 양도: "capital_transfer",
  가업상속: "business_succession", 가업승계: "business_succession",
};
const preparationAnswers = new Set([
  "미리 준비 중이에요", "미리 준비하고 있어요", "상속을 미리 준비 중이에요",
  "생전에 지분을 넘길 예정이에요",
]);

/** Transfer only the current explicit navigation context, never private facts. */
export function formsHrefFromPrecheck(state: Pick<ChatState, "facts">): string {
  const topic = state.facts.topic;
  const timing = state.facts.timing;
  const selected = topic?.status === "needs_confirmation" ? [] :
    [...new Set((topic?.value ?? "").split(/\s*[,·/]\s*/).flatMap(value => purposes[value] ? [purposes[value]] : []))];
  if (!selected.length) return "/forms";
  const params = new URLSearchParams({ purpose: selected.join(","), from: "precheck" });
  const answer = timing?.status === "needs_confirmation" ? "" : timing?.value ?? "";
  // Business succession includes an inheritance route. Unknown/mixed cases remain open.
  const hasSuccession = selected.includes("inheritance") || selected.includes("business_succession");
  const hasLifetimePurpose = selected.includes("gift") || selected.includes("capital_transfer");
  if (!hasSuccession) {
    // A previous inheritance answer must not constrain a newly selected gift/sale topic.
    params.set("timing", "before_death");
  } else if (preparationAnswers.has(answer)) params.set("timing", "before_death");
  else if (answer === "이미 상속이 발생했어요" && !hasLifetimePurpose) params.set("timing", "after_death");
  return `/forms?${params.toString()}`;
}
