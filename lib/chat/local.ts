import type { ChatFieldKey, ChatPatch, ChatState } from "./intake";
import { getMissingRequiredFields } from "./intake";
import { SAFE_REVIEW_MESSAGE, type DiagnosisReply } from "./choices";

const inheritanceSpouseQuestion: DiagnosisReply = {
  message: "재산 소유자의 배우자가 계신가요?",
  choices: ["배우자가 있어요", "배우자가 없어요", "잘 모르겠어요"],
};
const inheritanceAdultChildrenQuestion: DiagnosisReply = {
  message: "상속인인 성년 자녀는 몇 명인가요?",
  choices: ["1명이에요", "2명이에요", "3명이에요", "4명 이상이에요", "잘 모르겠어요"],
};
const inheritanceDebtQuestion: DiagnosisReply = {
  message: "공과금이나 채무가 있나요?",
  choices: ["없어요", "금융 대출이 있어요", "임대보증금이 있어요", "기타 채무가 있어요", "확인이 필요해요"],
  selectionMode: "multiple",
};
const inheritancePastGiftsQuestion: DiagnosisReply = {
  message: "최근 10년 안에 미리 증여한 재산이 있나요?",
  choices: ["있어요", "없어요", "확인이 필요해요"],
};
const inheritanceGoalQuestion: DiagnosisReply = {
  message: "상속과 관련해 무엇을 먼저 보고 싶으세요?",
  choices: ["상속세를 먼저 보고 싶어요", "생전 증여도 함께 보고 싶어요", "납부할 현금도 보고 싶어요", "아직 정하지 않았어요"],
  selectionMode: "multiple",
};
const giftOwnerQuestion: DiagnosisReply = {
  message: "증여할 재산은 누구 소유인가요?",
  choices: ["본인", "아버지", "어머니", "부모님 두 분", "배우자"],
};
const giftPastGiftsQuestion: DiagnosisReply = {
  message: "최근 10년 안에 같은 분에게 증여한 적이 있나요?",
  choices: ["있어요", "없어요", "확인이 필요해요"],
};
const giftGoalQuestion: DiagnosisReply = {
  message: "증여와 관련해 무엇을 먼저 보고 싶으세요?",
  choices: ["증여세를 먼저 보고 싶어요", "여러 명에게 나누는 경우", "상속과 함께 보고 싶어요", "아직 정하지 않았어요"],
  selectionMode: "multiple",
};

export const LOCAL_CHAT_QUESTIONS = {
  inheritanceSpouseQuestion,
  inheritanceAdultChildrenQuestion,
  inheritanceDebtQuestion,
  inheritancePastGiftsQuestion,
  inheritanceGoalQuestion,
  giftOwnerQuestion,
  giftPastGiftsQuestion,
  giftGoalQuestion,
} as const;

/** The non-AI fallback also offers answers to one question at a time. */
export function getLocalChatReply(state: ChatState): DiagnosisReply {
  const missing = getMissingRequiredFields(state);
  if (missing.includes("owner")) return {
    message: "말씀하신 재산은 누구 소유인가요?",
    choices: ["본인", "아버지", "어머니", "부모님", "배우자"],
  };
  if (missing.includes("realEstate")) return {
    message: "어떤 재산을 검토하고 싶으세요? 종류와 금액을 함께 적어주세요.",
    choices: ["부동산", "예금·현금", "주식", "회사 지분", "기타 자산"],
    selectionMode: "multiple",
    inputMode: "assetAmounts",
  };

  const topic = state.facts.topic?.value ?? "";
  if (/가업|회사\s*승계/.test(topic)) {
    if (!state.facts.timing) return {
      message: "승계는 어떻게 준비하고 계세요?",
      choices: ["생전에 지분을 넘길 예정이에요", "상속을 미리 준비 중이에요", "이미 상속이 발생했어요", "아직 정하지 않았어요"],
    };
    if (!state.facts.goal) return {
      message: "가업승계에서 가장 먼저 보고 싶은 것은 무엇인가요?",
      choices: ["세금 부담", "경영권 유지", "후계자 승계", "아직 정하지 않았어요"],
      selectionMode: "multiple",
    };
  } else if (/상속/.test(topic)) {
    if (!state.facts.spouse) return inheritanceSpouseQuestion;
    if (!state.facts.adultChildren) return inheritanceAdultChildrenQuestion;
    if (!state.facts.debt) return inheritanceDebtQuestion;
    if (!state.facts.pastGifts) return inheritancePastGiftsQuestion;
    if (!state.facts.goal) return inheritanceGoalQuestion;
  } else if (/증여/.test(topic)) {
    if (!state.facts.timing) return {
      message: "증여는 언제쯤 하실 예정인가요?",
      choices: ["올해 안에", "1~3년 안에", "아직 정하지 않았어요"],
    };
    if (!state.facts.pastGifts) return giftPastGiftsQuestion;
    if (!state.facts.goal) return giftGoalQuestion;
  } else if (/양도|매각/.test(topic)) {
    if (!state.facts.timing) return {
      message: "매각은 어느 단계인가요?",
      choices: ["팔 예정이에요", "이미 팔았어요", "아직 정하지 않았어요"],
    };
    if (!state.facts.goal) return {
      message: "양도에서 가장 먼저 확인하고 싶은 것은 무엇인가요?",
      choices: ["예상 양도세", "지금과 나중의 차이", "매각 후 남는 금액", "아직 정하지 않았어요"],
      selectionMode: "multiple",
    };
  }
  return {
    message: SAFE_REVIEW_MESSAGE,
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

/** Persist explicit clauses before networking; hypothetical examples remain conversation-only. */
export function extractAssertedChatPatches(text: string, state: ChatState): ChatPatch[] {
  if (/가정|예를|만약|이라면|이면|라고\s*(?:하면|가정)/.test(text)) return [];
  const clauses = text.split(/[,;\n]|(?:인데|이고|있고)\s*/).filter(clause => !/[?？]|무엇|어떻|어떤|왜|얼마|알려|궁금|되나요|인가요|있나요/.test(clause));
  const patches = clauses.flatMap(clause => extractLocalChatPatches(clause.trim(), state)).filter(patch => patch.key !== "notes" && text.includes(patch.evidence));
  const keys = [...new Set(patches.map(patch => patch.key))];
  return keys.flatMap(key => {
    const group = patches.filter(patch => patch.key === key);
    if (group.length === 1) return group;
    const start = text.indexOf(group[0].evidence), last = group.at(-1)!;
    const value = text.slice(start, text.lastIndexOf(last.evidence) + last.evidence.length);
    if (/[?？]|무엇|어떻|궁금/.test(value)) return [];
    return [{ key, value, evidence: value }];
  });
}
