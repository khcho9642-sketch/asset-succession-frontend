import { getAssistantReply } from "./choices";
import { CHAT_FIELD_KEYS, CHAT_FIELD_LABELS, getChatFactSources, getMissingRequiredFields, validateChatState, type ChatState } from "./intake";

/** A visible customer action, not a fabricated assistant answer. No new facts. */
export const BRIEF_REPORT_REQUEST = "추가 질문 없이 상담을 마무리하고 간략 검토보고서에 담을 내용을 작성해 주세요. 현재 판단, 우선할 일, 확인할 사항이라는 제목으로 세 단락을 써 주세요. 사실 목록을 되읽는 데서 끝내지 말고 제 고민에 답하고 다음 행동을 구체적으로 알려주세요. 세액이나 법적 가능성을 근거 없이 확정하지 마세요.";

export type ChatBriefReport = {
  createdAt: string;
  responseId: string;
  sections: Array<{ title: string; body: string }>;
  facts: Array<{ key: string; label: string; value: string; evidence: string[] }>;
  pending: string[];
};

function isConclusionRequest(text: string) {
  return text === BRIEF_REPORT_REQUEST || /결론|간략\s*(?:검토)?\s*보고서|(?:상담|여기까지|지금까지|현재까지)[\s\S]{0,40}(?:정리|마무리)|(?:질문\s*없이|질문은\s*하지)[\s\S]{0,40}정리/.test(text);
}

function sectionsFromReply(text: string): ChatBriefReport["sections"] {
  const sections: ChatBriefReport["sections"] = [];
  let current: ChatBriefReport["sections"][number] | undefined;
  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^\s*(?:#{1,3}\s*|\*\*|\d+[.)]\s*)?(현재 판단|우선할 일|확인할 사항)\s*(?:\*\*)?\s*[:：]?\s*(.*)$/);
    if (heading) {
      current = { title: heading[1], body: heading[2] };
      sections.push(current);
    } else if (current) current.body += `${current.body ? "\n" : ""}${line}`;
  }
  return sections.length === 3 && sections.every(section => section.body.trim())
    ? sections.map(section => ({ ...section, body: section.body.trim() }))
    : [{ title: "현재 판단과 우선할 일", body: text }];
}

/** Only the current, complete AI conclusion can become a draft brief report. */
export function buildChatBriefReport(state: ChatState, origins: Record<string, "ai" | "local">, createdAt: string): ChatBriefReport | null {
  const valid = validateChatState(state);
  if (!valid || !Number.isFinite(Date.parse(createdAt))) return null;
  const last = valid.messages.at(-1);
  const user = valid.messages.at(-2);
  if (last?.role !== "assistant" || origins[last.id] !== "ai" || user?.role !== "user" || !isConclusionRequest(user.text)) return null;
  const reply = getAssistantReply(last.text);
  if (!reply || reply.choices.length || !Object.keys(valid.facts).length) return null;
  const facts = CHAT_FIELD_KEYS.flatMap(key => {
    const fact = valid.facts[key];
    if (!fact || key === "unconfirmed") return [];
    return [{ key, label: key === "children" ? "자녀 관련 내용" : CHAT_FIELD_LABELS[key], value: fact.value, evidence: [...new Set(getChatFactSources(fact).map(source => source.evidence))] }];
  });
  const pending = [valid.facts.unconfirmed?.value, ...getMissingRequiredFields(valid).map(key => `${CHAT_FIELD_LABELS[key]} 확인 필요`)].filter((value): value is string => Boolean(value));
  return { createdAt, responseId: last.id, sections: sectionsFromReply(reply.message), facts, pending: [...new Set(pending)] };
}
