/** AI extraction is a draft. Only the report adapter records customer confirmation. */
export const CHAT_FIELD_KEYS = [
  "topic", "timing", "owner", "recipient", "spouse", "children", "adultChildren", "minorChildren",
  "realEstate", "financialAssets", "businessAssets", "otherAssets", "debt", "pastGifts", "goal", "notes", "unconfirmed"
] as const;

export type ChatFieldKey = typeof CHAT_FIELD_KEYS[number];
export type ChatMessage = { id: string; role: "user" | "assistant"; text: string; created_at: string };
export type ChatFactSource = { value: string; evidence: string; messageId: string };
export type ChatFact = ChatFactSource & { sources?: ChatFactSource[] };
export type ChatPatch = { key: ChatFieldKey; value: string; evidence: string };
export type ChatState = { version: 1; messages: ChatMessage[]; facts: Partial<Record<ChatFieldKey, ChatFact>> };

export const CHAT_FIELD_LABELS: Record<ChatFieldKey, string> = {
  topic: "상담 주제", timing: "준비 시기", owner: "재산 소유자", recipient: "증여받는 사람", spouse: "소유자의 배우자",
  children: "소유자의 자녀 수", adultChildren: "성년 자녀 수", minorChildren: "미성년 자녀 수",
  realEstate: "부동산", financialAssets: "금융자산", businessAssets: "법인지분·사업자산",
  otherAssets: "기타 자산", debt: "채무", pastGifts: "과거 증여", goal: "희망하는 결과", notes: "추가 상황", unconfirmed: "확인할 내용"
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

const UNKNOWN = /모르|모름|미정|미입력|미확인|불명|확인\s*(?:필요|중)|미상|unknown/i;
const CORRECTION = /정정|수정|정확히는|아니라|아니고|잘못|변경|고칠|바꿀|대신|다시\s*입력/;
const SUBJECTS: Partial<Record<ChatFieldKey, RegExp>> = {
  topic: /가업(?:상속|승계)?|상속(?:세)?|증여(?:세)?|양도(?:세)?/g,
  owner: /아버지|어머니|부모님|배우자|본인|소유자/g,
  spouse: /배우자/g,
  children: /(?:큰|작은|첫째|둘째|셋째|막내)?\s*(?:아들|딸)|자녀/g,
  adultChildren: /(?:성년|성인)\s*자녀/g,
  minorChildren: /미성년\s*자녀/g,
  realEstate: /아파트|상가|토지|주택|빌딩|오피스텔|건물|부동산/g,
  financialAssets: /예금|적금|주식|펀드|채권|현금|금융\s*자산/g,
  businessAssets: /법인\s*지분|비상장\s*주식|회사\s*지분|사업\s*자산/g,
  otherAssets: /기타\s*자산/g,
  debt: /주택\s*담보\s*대출|담보\s*대출|신용\s*대출|학자금\s*대출|전세\s*대출|금융\s*대출|임대\s*보증금|전세\s*보증금|보증금|대출|공과금|채무|빚/g,
  recipient: /(?:큰|작은|첫째|둘째|셋째|막내)?\s*(?:아들|딸|손자녀|손자|손녀)|배우자|다른\s*가족/g,
  pastGifts: /(?:큰|작은|첫째|둘째|셋째|막내)?\s*(?:아들|딸|손자녀|손자|손녀)|배우자|아버지|어머니/g,
};

export function getChatFactSources(fact: ChatFact | undefined): ChatFactSource[] {
  return fact ? (fact.sources ?? [{ value: fact.value, evidence: fact.evidence, messageId: fact.messageId }]).map(source => ({ ...source })) : [];
}

function factFromSources(sources: ChatFactSource[]): ChatFact | undefined {
  if (!sources.length) return undefined;
  const last = sources[sources.length - 1];
  if (sources.length === 1) return { ...last };
  return { ...last, value: sources.map(source => source.value).join("\n"), sources };
}

function appendSource(sources: ChatFactSource[], next: ChatFactSource): ChatFactSource[] {
  if (sources.some(source => compact(source.value) === compact(next.value))) return sources;
  const merged = [...sources, next];
  return merged.length <= 24 && merged.map(source => source.value).join("\n").length <= MAX_FACT_LENGTH ? merged : sources;
}

/** Split only into quotations. No replacement text is synthesized from old and new words. */
function sourceParts(source: ChatFactSource, key: ChatFieldKey): ChatFactSource[] {
  const parts = source.value.split(/,(?!\d)|(?<!\d),|[;\n]|\/(?=\s*[^\d\s])/).map(value => value.trim()).filter(Boolean);
  if (key !== "debt") return parts.map(value => ({ ...source, value }));
  return parts.flatMap(part => {
    const markers = [...part.matchAll(SUBJECTS.debt!)];
    // This also handles an unpunctuated "대출 5억 보증금 모름".
    if (markers.length < 2) return [{ ...source, value: part }];
    return markers.map((marker, index) => ({ ...source, value: part.slice(index === 0 ? 0 : marker.index!, markers[index + 1]?.index ?? part.length).trim() }));
  });
}

/** A unique, explicit subject can be corrected; a generic amount cannot identify an item. */
function subject(key: ChatFieldKey, raw: string): string | null {
  raw = raw.replace(/^정정:\s*[^—\n]+—\s*/, "");
  const expression = SUBJECTS[key];
  if (!expression) return null;
  const markers = [...raw.matchAll(expression)];
  if (markers.length !== 1) return null;
  let name = compact(markers[0][0]);
  if (key === "debt") name = name.replace(/^(?:임대|전세)보증금$/, "보증금").replace(/^금융대출$/, "대출");
  const identifier = raw.match(/([가-힣A-Za-z0-9]+은행|[A-Za-z]동|[가-힣]+동|\d+번|첫째|둘째|셋째|큰아들|작은아들|큰딸|작은딸)/)?.[0];
  return identifier && !name.includes(compact(identifier)) ? `${compact(identifier)}:${name}` : name;
}

function completeReplacement(key: ChatFieldKey, text: string): boolean {
  if (text.startsWith(`정정: ${CHAT_FIELD_LABELS[key]} — `)) return true;
  if (CHAT_ASSET_KEYS.some(asset => asset === key) && /^재산\s*전체\s*:/m.test(text)) return true;
  if (!CORRECTION.test(text) || !/(?:전체|전부|총액|합계)/.test(text)) return false;
  const scope = key === "debt" ? "(?:채무|빚)" : CHAT_FIELD_LABELS[key];
  return new RegExp(`${scope}\\s*(?:의\\s*)?(?:전체|전부|총액|합계)|(?:전체|전부)\\s*(?:${scope})`).test(text);
}

function sameSource(left: ChatFactSource, right: ChatFactSource): boolean {
  return left.messageId === right.messageId && compact(left.value) === compact(right.value);
}

function resolvesUnknown(key: ChatFieldKey, old: ChatFactSource, next: ChatFactSource): boolean {
  if (!UNKNOWN.test(old.value) || UNKNOWN.test(next.value)) return false;
  if (/나이|연령|성년\s*여부|성인\s*여부/.test(old.value)) return /\d+\s*세|성년|성인|미성년/.test(next.value);
  if (/만기|기한|날짜|상환\s*(?:기일|시기)/.test(old.value)) return /만기|기한|날짜|상환/.test(next.value) && /\d{2,4}년|\d{1,2}월|\d{1,2}일|내년|올해/.test(next.value);
  if (/이자|금리/.test(old.value)) return /이자|금리/.test(next.value) && /\d+(?:\.\d+)?\s*(?:%|퍼센트)/.test(next.value);
  // Knowing an amount does not resolve the identity, contract or ownership of that item.
  if (/종류|유형|채권자|채무자|명의|소유자|주소|계약/.test(old.value)) return false;
  if (key === "debt" || CHAT_ASSET_KEYS.some(asset => asset === key)) return /\d[\s\S]*(?:억|만|원)|없음|없어요|없습니다/.test(next.value);
  return true;
}

/** Only the latest user turn can update draft facts. Invalid patches have no effect. */
export function applyChatPatches(state: ChatState, patches: unknown, messageId: string): ChatState {
  const latest = [...state.messages].reverse().find(message => message.role === "user");
  if (!latest || latest.id !== messageId || !Array.isArray(patches)) return state;
  const facts = { ...state.facts };
  let pending = getChatFactSources(facts.unconfirmed);
  const seen = new Set<ChatFieldKey>();
  for (const patch of patches.slice(0, CHAT_FIELD_KEYS.length)) {
    if (!isRecord(patch) || !isFieldKey(patch.key) || seen.has(patch.key)) continue;
    const source = { value: patch.value, evidence: patch.evidence, messageId };
    if (!validSource(source, [latest])) continue;
    seen.add(patch.key);
    const key = patch.key;
    const next: ChatFactSource = { value: source.value.trim(), evidence: source.evidence.trim(), messageId };
    const previous = getChatFactSources(facts[key]);
    if (key === "unconfirmed") {
      pending = completeReplacement(key, latest.text) ? [next] : appendSource(pending, next);
      continue;
    }
    const correction = CORRECTION.test(next.evidence);
    const replaceAll = completeReplacement(key, latest.text);
    const nextSubject = subject(key, next.value) ?? subject(key, next.evidence);
    const parts = previous.flatMap(item => sourceParts(item, key));
    const candidates = nextSubject === null ? [] : parts.filter(item => subject(key, item.value) === nextSubject);
    const known = !UNKNOWN.test(next.value);
    const matched = candidates.length === 1 && known && parts.length <= 24 &&
      parts.map(item => item === candidates[0] ? next.value : item.value).join("\n").length <= MAX_FACT_LENGTH &&
      ((correction && !UNKNOWN.test(candidates[0].value)) || resolvesUnknown(key, candidates[0], next));
    if (replaceAll || !previous.length) {
      facts[key] = next;
    } else if (matched) {
      facts[key] = factFromSources(parts.map(item => sameSource(item, candidates[0]) ? next : item));
    } else {
      facts[key] = factFromSources(appendSource(previous, next));
    }
    // Resolve only this item's uncertainty. Other unknowns survive a correction.
    if (known && (matched || replaceAll || nextSubject !== null)) {
      const matchingUnknowns = pending.filter(item => nextSubject !== null && subject(key, item.value) === nextSubject && resolvesUnknown(key, item, next));
      pending = pending.filter(item => {
        if (nextSubject !== null && subject(key, item.value) === nextSubject &&
          (((matched || candidates.length === 0) && matchingUnknowns.length === 1 && resolvesUnknown(key, item, next)) || (matched && !UNKNOWN.test(item.value)))) return false;
        if (!replaceAll) return true;
        return !previous.some(old => old.messageId === item.messageId && compact(old.value).includes(compact(item.value)));
      });
    }
    for (const item of sourceParts(next, key).filter(item => UNKNOWN.test(item.value))) pending = appendSource(pending, item);
    if ((correction || candidates.length > 0) && previous.length && !replaceAll && !matched && compact(facts[key]?.value ?? "") !== compact(next.value)) pending = appendSource(pending, next);
  }
  const pendingFact = factFromSources(pending);
  if (pendingFact) facts.unconfirmed = pendingFact;
  else delete facts.unconfirmed;
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
