/** AI extraction is a draft. Only the report adapter records customer confirmation. */
export const CHAT_FIELD_KEYS = [
  "topic", "timing", "owner", "spouse", "children", "adultChildren", "minorChildren",
  "realEstate", "financialAssets", "businessAssets", "otherAssets", "debt", "pastGifts", "goal", "notes"
] as const;

export type ChatFieldKey = typeof CHAT_FIELD_KEYS[number];
export type ChatMessage = { id: string; role: "user" | "assistant"; text: string; created_at: string };
export type ChatFactSource = { value: string; evidence: string; messageId: string };
export type ChatFact = ChatFactSource & { sources?: ChatFactSource[] };
export type ChatPatch = { key: ChatFieldKey; value: string; evidence: string };
export type ChatState = { version: 1; messages: ChatMessage[]; facts: Partial<Record<ChatFieldKey, ChatFact>> };

export const CHAT_FIELD_LABELS: Record<ChatFieldKey, string> = {
  topic: "상담 주제", timing: "준비 시기", owner: "재산 소유자", spouse: "소유자의 배우자",
  children: "소유자의 자녀 수", adultChildren: "성년 자녀 수", minorChildren: "미성년 자녀 수",
  realEstate: "부동산", financialAssets: "금융자산", businessAssets: "법인지분·사업자산",
  otherAssets: "기타 자산", debt: "채무", pastGifts: "과거 증여", goal: "희망하는 결과", notes: "추가 상황"
};

export const CHAT_ASSET_KEYS = ["realEstate", "financialAssets", "businessAssets", "otherAssets"] as const;
export const CHAT_STORAGE_KEY = "as360.chat.intake.v1";
const MAX_MESSAGES = 160;
const MAX_MESSAGE_LENGTH = 12_000;
const MAX_FACT_LENGTH = 4_000;

export function createChatState(): ChatState {
  return { version: 1, messages: [], facts: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonemptyString(value: unknown, limit: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= limit;
}

function compact(text: string) {
  // Never turn an ambiguous pair such as "2 5억" into "25억" while checking a quotation.
  return text.replace(/(\d)\s+(?=\d)/g, "$1\u200b").replace(/\s+/g, "").trim();
}

function isFieldKey(value: unknown): value is ChatFieldKey {
  return typeof value === "string" && CHAT_FIELD_KEYS.includes(value as ChatFieldKey);
}

/** Both evidence and value remain quotations; model-authored paraphrases cannot become facts. */
function validSource(value: unknown, messages: ChatMessage[]): value is ChatFactSource {
  if (!isRecord(value) || !nonemptyString(value.value, MAX_FACT_LENGTH) || !nonemptyString(value.evidence, MAX_MESSAGE_LENGTH) || typeof value.messageId !== "string") return false;
  const message = messages.find((entry) => entry.id === value.messageId && entry.role === "user");
  return Boolean(message && compact(message.text).includes(compact(value.evidence)) && compact(value.evidence).includes(compact(value.value)));
}

/** Invalid persisted/API state is rejected, including invented evidence or duplicate message IDs. */
export function validateChatState(value: unknown): ChatState | null {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.messages) || value.messages.length > MAX_MESSAGES || !isRecord(value.facts)) return null;
  const messages: ChatMessage[] = [];
  const ids = new Set<string>();
  for (const entry of value.messages) {
    if (!isRecord(entry) || !nonemptyString(entry.id, 160) || ids.has(entry.id) || (entry.role !== "user" && entry.role !== "assistant") || !nonemptyString(entry.text, MAX_MESSAGE_LENGTH) || typeof entry.created_at !== "string" || !Number.isFinite(Date.parse(entry.created_at))) return null;
    ids.add(entry.id);
    messages.push({ id: entry.id, role: entry.role, text: entry.text, created_at: entry.created_at });
  }
  const facts: ChatState["facts"] = {};
  for (const [key, entry] of Object.entries(value.facts)) {
    if (!isFieldKey(key) || !isRecord(entry)) return null;
    if (entry.sources !== undefined) {
      if (!Array.isArray(entry.sources) || entry.sources.length < 2 || entry.sources.length > 24 || !entry.sources.every((source) => validSource(source, messages))) return null;
      const sources = entry.sources as ChatFactSource[];
      const last = sources[sources.length - 1];
      if (entry.value !== sources.map((source) => source.value).join("\n") || entry.evidence !== last.evidence || entry.messageId !== last.messageId || typeof entry.value !== "string" || entry.value.length > MAX_FACT_LENGTH) return null;
      facts[key] = { value: entry.value, evidence: last.evidence, messageId: last.messageId, sources: sources.map((source) => ({ value: source.value, evidence: source.evidence, messageId: source.messageId })) };
    } else {
      if (!validSource(entry, messages)) return null;
      facts[key] = { value: entry.value, evidence: entry.evidence, messageId: entry.messageId };
    }
  }
  return { version: 1, messages, facts };
}

/** Only the latest user turn can update draft facts. Invalid patches have no effect. */
export function applyChatPatches(state: ChatState, patches: unknown, messageId: string): ChatState {
  const latest = [...state.messages].reverse().find((message) => message.role === "user");
  if (!latest || latest.id !== messageId || !Array.isArray(patches)) return state;
  const facts = { ...state.facts };
  const seen = new Set<ChatFieldKey>();
  for (const patch of patches.slice(0, CHAT_FIELD_KEYS.length)) {
    if (!isRecord(patch) || !isFieldKey(patch.key) || seen.has(patch.key)) continue;
    const source = { value: patch.value, evidence: patch.evidence, messageId };
    if (!validSource(source, [latest])) continue;
    seen.add(patch.key);
    const next: ChatFactSource = { value: source.value.trim(), evidence: source.evidence.trim(), messageId };
    const previous = facts[patch.key];
    const isAsset = CHAT_ASSET_KEYS.some((key) => key === patch.key);
    const correction = /정정|수정|정확히는|아니라|아니고|잘못|변경|고칠|바꿀|대신|다시\s*입력/i.test(latest.text);
    const completeReplacement = latest.text.startsWith(`정정: ${CHAT_FIELD_LABELS[patch.key]} — `) || /(?:전체|전부|합계|총액)(?:를|는|은|가|이)?\s*(?:정정|수정|변경|다시|[:：]|\d)|(?:정정|수정|변경)[^\n]*(?:전체|전부|합계|총액)/.test(latest.text);
    const previousMoneyCount = previous ? [...previous.value.matchAll(/\d+(?:\.\d+)?\s*억(?:원)?(?:\s*\d+(?:\.\d+)?\s*(?:천\s*만|만)(?:원)?)?|\d+(?:\.\d+)?\s*(?:천\s*만|만)(?:원)?/g)].length : 0;
    const previousItemCount = previous ? [...previous.value.matchAll(/아파트|상가|토지|주택|빌딩|오피스텔|건물|예금|적금|주식|펀드|채권|현금/g)].length : 0;
    const partialCorrection = correction && !completeReplacement && (previousMoneyCount > 1 || previousItemCount > 1 || (previous?.sources?.length ?? 0) > 1 || /[2-9]\d*\s*(?:채|개|건)/.test(previous?.value ?? ""));
    if (isAsset && previous && (!correction || partialCorrection) && compact(previous.value) !== compact(next.value)) {
      const sources = previous.sources ?? [{ value: previous.value, evidence: previous.evidence, messageId: previous.messageId }];
      if (sources.some((item) => compact(item.value) === compact(next.value))) continue;
      const merged = [...sources, next];
      const combined = merged.map((item) => item.value).join("\n");
      // Keep old and new excerpts visible; ambiguity is resolved in review, never by dropping an item.
      if (combined.length <= MAX_FACT_LENGTH && merged.length <= 24) facts[patch.key] = { ...next, value: combined, sources: merged };
    } else {
      facts[patch.key] = next;
    }
  }
  return { ...state, facts };
}

/** Unknown is a usable answer; unanswered required context is not. */
export function getMissingRequiredFields(state: ChatState): ChatFieldKey[] {
  const missing: ChatFieldKey[] = [];
  if (!state.facts.owner?.value.trim()) missing.push("owner");
  if (!CHAT_ASSET_KEYS.some((key) => state.facts[key]?.value.trim())) missing.push("realEstate");
  return missing;
}

export function getNextQuestion(state: ChatState): string {
  const missing = getMissingRequiredFields(state);
  if (missing.includes("owner") && missing.includes("realEstate")) return "누구의 재산을 준비하고 계신가요? 부동산·금융자산 등 주요 자산과 대략적인 금액, 지금 가장 고민되는 점을 함께 말씀해 주세요. 모르는 부분은 모른다고 해도 괜찮습니다.";
  if (missing.includes("owner")) return "말씀하신 재산은 누구 소유인가요? 작성하시는 분과의 관계, 공동 소유 여부도 아는 범위에서 알려주세요.";
  if (missing.includes("realEstate")) return "주요 자산의 종류와 대략적인 금액을 알려주세요. 여러 부동산이 있으면 각각 말씀해 주시고, 금액을 모르시면 ‘금액 모름’이라고 해도 괜찮습니다.";
  if (!state.facts.spouse && !state.facts.children) return "가족관계도 아는 범위에서 알려주세요. 재산 소유자의 배우자와 자녀, 채무나 과거 증여 중 함께 검토할 내용이 있나요? 모르는 정보는 나중에 확인할 수 있습니다.";
  if (!state.facts.goal) return "이번 검토에서 가장 원하는 결과가 무엇인가요? 더 말씀하실 내용이 없다면 정리된 정보를 확인하고 보고서로 이어갈 수 있습니다.";
  return "말씀하신 내용을 정리했습니다. 추가하거나 고칠 부분을 알려주시거나, 정보 확인에서 내용을 검토한 뒤 보고서를 만들어 주세요.";
}
