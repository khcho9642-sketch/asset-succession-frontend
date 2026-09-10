import type { ChatFieldKey, ChatPatch, ChatState } from "./intake";
import { getMissingRequiredFields } from "./intake";
import type { DiagnosisReply } from "./choices";

/** The non-AI fallback also offers answers to one question at a time. */
export function getLocalChatReply(state: ChatState): DiagnosisReply {
  const missing = getMissingRequiredFields(state);
  if (missing.includes("owner")) return {
    message: "말씀하신 재산은 누구 소유인가요?",
    choices: ["본인", "아버지", "어머니", "부모님", "배우자"],
  };
  if (missing.includes("realEstate")) return {
    message: "어떤 재산을 검토하고 싶으세요?",
    choices: ["부동산", "예금·현금", "주식", "회사 지분", "기타 자산"],
    selectionMode: "multiple",
  };
  return {
    message: "찾은 내용을 입력 요약에 정리했어요. 빠지거나 다른 내용은 직접 고친 뒤 보고서를 열 수 있어요.",
    choices: [],
  };
}

// Explicitly labelled guided mode. This parser never impersonates an LLM.
// Keep raw spans so the same evidence validator can check local and AI proposals.
export function extractLocalChatPatches(text: string, state: ChatState): ChatPatch[] {
  const found = new Map<ChatFieldKey, string>();
  const capture = (key: ChatFieldKey, expression: RegExp) => {
    const match = expression.exec(text);
    if (match) found.set(key, match[0].trim());
  };
  capture("topic", /^(?:가업(?:상속|승계)?|상속(?:세)?|증여(?:세)?|양도(?:세)?)(?:요|여|입니다|이요)?[.!]?$/);
  if (!found.has("topic")) capture("topic", /^검토 주제:\s*(?:가업승계|상속|증여|양도)/m);
  if (!found.has("topic")) capture("topic", /(?:가업(?:상속|승계)?|상속(?:세)?|증여(?:세)?|양도(?:세)?)(?:을|를|이|도|에)?\s*(?:준비|상담|진단|걱정|고민|알아|비교)[^,;\n]*/);
  capture("timing", /미리\s*준비(?:해요|요|하고\s*있어요)?|사전\s*준비|이미\s*상속(?:이)?\s*발생|돌아가셨[^,;\n]*|사망[^,;\n]*/);
  capture("owner", /(?:아버지|어머니|부모님|배우자|본인|제)(?:의)?\s*(?:명의|재산|자산|건물|아파트|상가|주택|예금)/);
  if (!found.has("owner") && !state.facts.owner) capture("owner", /^(?:아버지|어머니|부모님|배우자|본인)(?:요|입니다|예요|이에요)?[.!]?$/);
  capture("spouse", /배우자(?:가|는|도)?\s*(?:있(?:어요|습니다|음)?|없(?:어요|습니다|음)?|모르[^,;\n]*)/);
  for (const match of text.matchAll(/자녀(?:가|는)?\s*(?:\d+|한|하나|둘|두|셋|세|넷|네|다섯|여섯)\s*명?/g)) {
    if (!/(?:성인|성년|미성년)\s*$/.test(text.slice(0,match.index))) { found.set("children",match[0]); break; }
  }
  capture("adultChildren", /(?:성인|성년)\s*자녀(?:가|는)?\s*(?:\d+|한|둘|두|셋|세|넷|네)\s*명?/);
  capture("minorChildren", /미성년\s*자녀(?:가|는)?\s*(?:\d+|한|둘|두|셋|세|넷|네)\s*명?/);

  const assetKeys: Record<string, ChatFieldKey> = {
    부동산:"realEstate", 건물:"realEstate", 아파트:"realEstate", 상가:"realEstate", 주택:"realEstate", 토지:"realEstate",
    금융자산:"financialAssets", 예금:"financialAssets", 현금:"financialAssets", 펀드:"financialAssets", 주식:"financialAssets",
    법인지분:"businessAssets", 비상장주식:"businessAssets", 회사지분:"businessAssets", 기타자산:"otherAssets"
  };
  const markers = Array.from(text.matchAll(/부동산|건물|아파트|상가|주택|토지|금융\s*자산|예금|현금|법인\s*지분|비상장\s*주식|회사\s*지분|펀드|주식|기타\s*자산|대출|보증금|채무|빚|과거\s*증여|자녀|배우자|목표/g));
  const assetSpans = new Map<ChatFieldKey, Array<{start:number;end:number}>>();
  for (let i=0;i<markers.length;i++) {
    const marker=markers[i]; const key=assetKeys[marker[0].replace(/\s/g,"")];
    if (!key) continue;
    const start=marker.index!; const next=markers[i+1]?.index ?? text.length;
    let span=text.slice(start,next).replace(/[,;\n][\s\S]*$/,"").trim();
    // A bare category is still useful; it remains amount-unknown in the report.
    span=span.replace(/[.!?]+$/,"").trim();
    if (span) assetSpans.set(key,[...(assetSpans.get(key)??[]),{start,end:start+span.length}]);
  }
  for (const [key,spans] of assetSpans) {
    // Contiguous raw category runs preserve multiple properties. Interleaved categories
    // remain manual-review material, never silently summed across unrelated amounts.
    const first=spans[0],last=spans[spans.length-1];
    const run=text.slice(first.start,last.end);
    const otherKind=markers.some(m=>m.index!>first.start&&m.index!<last.end&&assetKeys[m[0].replace(/\s/g,"")]!==key);
    if (!otherKind) found.set(key,run);
    else found.set("notes",text);
  }
  capture("debt", /(?:대출|채무|빚|담보대출|임대보증금)(?:이|은|는|도)?\s*[^,;\n]*/);
  capture("pastGifts", /(?:과거\s*증여|최근\s*\d+년\s*증여|이전\s*증여)(?:는|가)?\s*[^,;\n]*/);
  capture("goal", /(?:목표(?:는|:)?\s*|세금|상속세|절세|노후|생활비|공평|균등)[^,;\n]*(?:걱정|줄이|절감|준비|유지|확보|나누|배분)[^,;\n]*/);
  if (!found.size) found.set("notes",text);
  return Array.from(found,([key,value])=>({key,value,evidence:value}));
}
