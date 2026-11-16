import type { DiagnosisReply } from "./choices";
import { getChatFactSources, type ChatState } from "./intake";
import { BRIEF_REPORT_REQUEST, getBriefReportContextFeedback, getBriefReportJudgmentFeedback } from "./brief-report";

export type DialogueQualitySubject = "deposit" | "loan" | "acquisition_date" | "stock_value" | "timing" | "child_age" | "past_gifts";
export type DialogueQualityIssue = { kind: "repeated_unknown_question" | "brief_report_missing_judgment" | "brief_report_missing_context"; subjects: DialogueQualitySubject[]; feedback: string };
type Aspect = "amount" | "presence" | "date" | "age" | "timing" | "details";
export type DialogueUnknownContext = { unknowns: Partial<Record<DialogueQualitySubject, Aspect[]>>; resolved: DialogueQualitySubject[] };
type Kind = DialogueQualitySubject | "stock" | "valuation" | "children" | "age" | "other";
type Segment = { raw: string; subject: DialogueQualitySubject | null };

const LABELS: Record<DialogueQualitySubject, string> = { deposit: "보증금", loan: "대출", acquisition_date: "취득일", stock_value: "주식 평가액", timing: "진행 시기", child_age: "자녀 성년 여부", past_gifts: "과거 증여" };
const UNKNOWN = /모르|모름|몰라|미정|미확인|미상|불명|확인(?:이|은)?\s*필요|알지\s*못|정하지\s*않|결정하지\s*않|정해지지\s*않|안\s*정했|기억[\s\S]{0,12}(?:안\s*(?:나|남)|나지\s*않|못|없)/;
const BARE_UNKNOWN = /^(?:아직\s*)?(?:잘\s*)?(?:모름|모르겠(?:어요|습니다)|몰라(?:요)?|미정(?:이에요|입니다)?|확인(?:이)?\s*필요(?:해요|합니다)?)(?:[.!。])?$/;
function isUnknown(raw: string): boolean {
  return UNKNOWN.test(raw) && !/[?？]|만약|모르면|모른다면|모를\s*경우|모름이라면|모르는\s*(?:게|것이|것은)?\s*아니|모름(?:이)?\s*아니|모르(?:지|지는)\s*않/.test(raw);
}
const MARKERS: Array<[Kind, RegExp]> = [
  ["deposit", /임대\s*보증금|전세\s*보증금|보증금/g],
  ["loan", /주택\s*담보\s*대출|담보\s*대출|신용\s*대출|학자금\s*대출|전세\s*대출|금융\s*대출|대출|차입금/g],
  ["acquisition_date", /취득\s*(?:일자|날짜|시기|일)|매입일|구입일/g],
  ["past_gifts", /과거\s*증여|이전\s*증여|기존\s*증여|최근\s*(?:10|십)\s*년(?:\s*(?:안에|내에?|동안))?\s*(?:했던\s*)?증여|증여한\s*적|(?:가족|자녀|아들|딸)(?:에게|한테)\s*(?:이미\s*)?(?:주신|준|주셨던|주었던)\s*재산|이미\s*(?:주신|준|주셨던|주었던)\s*재산/g],
  ["timing", /(?:진행|준비|상속|증여|매각|양도)?\s*(?:시기|시점|일정|날짜)/g],
  ["child_age", /(?:미성년|성년|성인)\s*자녀/g],
  ["children", /자녀|아들|딸|아이/g],
  ["age", /미성년|성년|성인|나이|연령/g],
  ["stock", /비상장\s*주식|회사\s*주식|주식/g],
  ["valuation", /평가액|평가\s*금액|평가\s*가치|가액|가치|주가/g],
  ["other", /아파트|주택|상가|토지|건물|부동산|예금|현금|배우자|생활비|목표|고민|다른\s*(?:것|내용|부분|항목)|그\s*외/g],
];

function sentences(text: string): string[] {
  return text.replace(/([.!?。！？;\n])(?!\d)/g, "$1\n").split(/\r?\n/).map(value => value.trim()).filter(Boolean);
}

/** A different explicit subject ends the scope of an unknown or a question. */
function segments(text: string): Segment[] {
  const result: Segment[] = [];
  let context: Kind | null = null;
  let previousRaw = "";
  for (const sentence of sentences(text)) {
    for (const clause of sentence.split(/,(?!\d)|(?<!\d),/)) {
      const matches = MARKERS.flatMap(([kind, expression]) => [...clause.matchAll(expression)].map(match => ({ kind, start: match.index!, end: match.index! + match[0].length })));
      matches.sort((left, right) => left.start - right.start || right.end - left.end);
      const markers = matches.filter((match, index) => !matches.slice(0, index).some(previous => previous.start <= match.start && match.start < previous.end));
      if (!markers.length) { result.push({ raw: clause, subject: null }); context = null; previousRaw = clause; continue; }
      markers.forEach((marker, index) => {
        const start = index === 0 && /왜|이유|무슨\s*뜻|어떻게/.test(clause.slice(0, marker.start)) ? 0 : marker.start;
        const raw = clause.slice(start, markers[index + 1]?.start ?? clause.length).trim();
        let subject: DialogueQualitySubject | null;
        if (marker.kind === "stock") subject = /평가|금액|가액|가치|가격|얼마/.test(raw) ? "stock_value" : null;
        else if (marker.kind === "valuation") subject = context === "stock" || context === "stock_value" ? "stock_value" : null;
        else if (marker.kind === "children") subject = /성년|성인|미성년|나이|연령/.test(raw) ? "child_age" : null;
        else if (marker.kind === "age") subject = context === "children" || context === "child_age" ? "child_age" : null;
        else if (marker.kind === "other") subject = null;
        else if (marker.kind === "timing" && context === "past_gifts") subject = "past_gifts";
        else if (marker.kind === "timing" && (context === "loan" || context === "deposit") && /만기|상환|계약/.test(previousRaw)) subject = context;
        else subject = marker.kind;
        result.push({ raw, subject });
        context = subject ?? marker.kind;
        previousRaw = raw;
      });
    }
  }
  return result;
}

function aspects(subject: DialogueQualitySubject, raw: string): Aspect[] {
  if (subject === "acquisition_date") return ["date"];
  if (subject === "stock_value") return ["amount"];
  if (subject === "timing") return ["timing", "date"];
  if (subject === "child_age") return ["age"];
  if (subject === "past_gifts" && /금액|얼마|가액/.test(raw)) return ["amount"];
  if (/만기|날짜|일자|언제|시기/.test(raw) && !/금액|얼마/.test(raw)) return ["date"];
  if (/금리|이자율|은행|채권자|계약|명의/.test(raw) && !/금액|얼마|\d[\s\S]*(?:억|만|원)/.test(raw)) return ["details"];
  return subject === "past_gifts" ? ["amount", "presence", "date", "details"] : ["amount", "presence"];
}

function isKnown(segment: Segment): boolean {
  return Boolean(segment.subject && !isUnknown(segment.raw) &&
    !/[?？]|아마|추정|예상|같|정도|쯤|인지|일까|만약|대략|약\s*\d/.test(segment.raw) &&
    /\d[\s\S]*(?:억|만원|원|년|월|일|세)|없(?:음|어요|습니다|었어요|었습니다)|없다고\s*확인(?:했|됐|되었|하였)|성년|성인|미성년|내년|올해/.test(segment.raw));
}

function knownUnknowns(latestText: string, facts: ChatState["facts"], previousQuestion?: string, context?: DialogueUnknownContext): Map<DialogueQualitySubject, Set<Aspect>> {
  const unknowns = new Map<DialogueQualitySubject, Set<Aspect>>();
  for (const subject of Object.keys(LABELS) as DialogueQualitySubject[]) {
    const saved = context?.unknowns[subject];
    if (saved?.length && !context?.resolved.includes(subject)) unknowns.set(subject, new Set(saved));
  }
  const collectSegment = (segment: Segment, persisted = false) => {
    if (!segment.subject || !isUnknown(segment.raw)) return;
    if (persisted && context?.resolved.includes(segment.subject)) return;
    const stored = unknowns.get(segment.subject) ?? new Set<Aspect>();
    aspects(segment.subject, segment.raw).forEach(aspect => stored.add(aspect));
    unknowns.set(segment.subject, stored);
  };
  for (const [key, fact] of Object.entries(facts)) {
    for (const source of getChatFactSources(fact)) {
      if (key !== "unconfirmed" && !isUnknown(source.value)) continue;
      if (key === "pastGifts" && BARE_UNKNOWN.test(source.value.trim()) && !context?.resolved.includes("past_gifts")) unknowns.set("past_gifts", new Set(aspects("past_gifts", source.value)));
      const scoped = segments(source.value).filter(segment => segment.subject && isUnknown(segment.raw));
      scoped.forEach(segment => collectSegment(segment, true));
      if (!scoped.length) {
        const contextual = segments(source.evidence).filter(segment => segment.subject && isUnknown(segment.raw));
        const selectedSubjects = segments(source.value).map(segment => segment.subject);
        if (new Set(contextual.map(segment => segment.subject)).size === 1 &&
          (isUnknown(source.value) || selectedSubjects.includes(contextual[0]?.subject))) contextual.forEach(segment => collectSegment(segment, true));
      }
    }
  }
  // A new explicit amount/date can resolve an older uncertainty; do not revive it from history.
  for (const segment of segments(latestText)) {
    if (!segment.subject) continue;
    if (isUnknown(segment.raw)) collectSegment(segment);
    else if (isKnown(segment)) unknowns.delete(segment.subject);
  }
  if (previousQuestion && BARE_UNKNOWN.test(latestText.trim())) {
    const target = previousUnknownTarget(previousQuestion);
    if (target?.subject) unknowns.set(target.subject, new Set(aspects(target.subject, target.raw)));
  }
  return unknowns;
}

const LATER = /나중|추후|확인(?:하신|한)\s*(?:후|뒤)|확인되면|알게\s*되면|준비되면|언제든/;
const EXPLANATION = /왜|이유|무슨\s*뜻|의미|설명|발급|방법|절차|어떻게[\s\S]*(?:확인|계산)/;
const ASK = /[?？]|인가요|나요|습니까|실까요|을까요|(?:있|없)(?:으신가요|으세요)|알고\s*계|아시(?:나|는|겠)|알려\s*주|말씀\s*해|입력\s*해|적어\s*주|선택\s*해|확인(?:해\s*주|을?\s*부탁)/;
const DATA_CHOICE = /알(?:고|아)|모르|모름|몰라|있(?:어|음|습)|없|금액|입력|확인\s*필요|성년|성인|미성년|\d[\s\S]*(?:억|만|원|년|월|일|세)/;
const STRONG_DATA_CHOICE = /알(?:고|아)|모르|모름|몰라|있(?:어|음|습)|없|입력|성년|성인|미성년|\d[\s\S]*(?:억|만|원|년|월|일|세)/;

function isAsk(raw: string): boolean {
  return !LATER.test(raw) && !EXPLANATION.test(raw) && ASK.test(raw);
}

function previousUnknownTarget(text: string): Segment | null {
  const previous = segments(text);
  const questions = previous.filter(segment => isAsk(segment.raw));
  const requests = questions.length ? questions : previous.filter(segment => segment.subject && !LATER.test(segment.raw) && !EXPLANATION.test(segment.raw) && /확인(?:이|은)?\s*필요|확인해야\s*(?:해|합)/.test(segment.raw));
  const target = requests[requests.length - 1];
  if (!target?.subject || new Set(requests.map(segment => segment.subject)).size !== 1) return null;
  const before = previous.slice(0, previous.indexOf(target));
  if (before.some(segment => segment.subject && segment.subject !== target.subject && /(?:과|와|및|하고|또는|혹은)\s*$/.test(segment.raw))) return null;
  if (previous.some(segment => segment.subject && segment.subject !== target.subject) && /함께|각각|모두|둘\s*다/.test(target.raw)) return null;
  return target;
}

/** History supplies only closed unknown/resolved labels, never assistant amounts or customer facts. */
export function buildDialogueUnknownContext(messages: Array<{ role: "user" | "assistant"; text: string }>): DialogueUnknownContext {
  let context: DialogueUnknownContext = { unknowns: {}, resolved: [] };
  let previousQuestion: string | undefined;
  for (const message of messages) {
    if (message.role === "assistant") { previousQuestion = message.text; continue; }
    const unknowns = knownUnknowns(message.text, {}, previousQuestion, context);
    const resolved = new Set(context.resolved);
    for (const segment of segments(message.text)) if (segment.subject && isKnown(segment)) resolved.add(segment.subject);
    for (const subject of unknowns.keys()) resolved.delete(subject);
    context = {
      unknowns: Object.fromEntries([...unknowns].map(([subject, stored]) => [subject, [...stored]])),
      resolved: (Object.keys(LABELS) as DialogueQualitySubject[]).filter(subject => resolved.has(subject)),
    };
    previousQuestion = undefined;
  }
  return context;
}

export function getDialogueQualityIssue(latestText: string, facts: ChatState["facts"], reply: DiagnosisReply, previousQuestion?: string, unknownContext?: DialogueUnknownContext, customerText?: string): DialogueQualityIssue | null {
  if (latestText === BRIEF_REPORT_REQUEST) {
    const feedback = getBriefReportJudgmentFeedback(reply.message);
    if (feedback) return { kind: "brief_report_missing_judgment", subjects: [], feedback };
    const contextFeedback = getBriefReportContextFeedback(reply.message, customerText ?? Object.values(facts).flatMap(fact => fact ? getChatFactSources(fact).map(source => source.evidence) : []).join("\n"));
    if (contextFeedback) return { kind: "brief_report_missing_context", subjects: [], feedback: contextFeedback };
  }
  const unknowns = knownUnknowns(latestText, facts, previousQuestion, unknownContext);
  if (!unknowns.size) return null;
  const repeated = new Set<DialogueQualitySubject>();
  const check = (segment: Segment) => {
    if (segment.subject && aspects(segment.subject, segment.raw).some(aspect => unknowns.get(segment.subject!)?.has(aspect))) repeated.add(segment.subject);
  };
  const messageSegments = segments(reply.message);
  const questions = messageSegments.filter(segment => isAsk(segment.raw));
  questions.forEach(check);
  const goalChoices = /보고\s*싶|먼저\s*(?:볼|보)|설명|관심|어떤[\s\S]*(?:볼|보고)/.test(reply.message);
  for (const choice of reply.choices) {
    if (LATER.test(choice) || EXPLANATION.test(choice) || !DATA_CHOICE.test(choice)) continue;
    if (goalChoices && !STRONG_DATA_CHOICE.test(choice)) continue;
    const choiceSegments = segments(choice).filter(segment => segment.subject);
    if (choiceSegments.length) choiceSegments.forEach(check);
    else if (questions.length) check(questions[questions.length - 1]);
    else if (!EXPLANATION.test(reply.message)) {
      const last = messageSegments[messageSegments.length - 1];
      if (last && (STRONG_DATA_CHOICE.test(choice) || /금액|유무|여부|날짜|일자|시기|나이|확인\s*필요|알/.test(last.raw))) check(last);
    }
  }
  const subjects = (Object.keys(LABELS) as DialogueQualitySubject[]).filter(subject => repeated.has(subject));
  if (!subjects.length) return null;
  return { kind: "repeated_unknown_question", subjects, feedback: `${subjects.map(subject => LABELS[subject]).join(", ")}: 이미 모름으로 답한 항목입니다. 금액·유무 등 해당 정보를 message나 choices에서 다시 요구하지 마세요. 현재 받지 않은 다른 정보 한 가지만 질문하거나 질문 없이 설명·요약하세요. 사용자의 이유 설명·정리·종료 요청을 우선하며 추가 질문을 강요하지 마세요. 기존 sourceID, facts, 출력 형식을 유지하세요.` };
}
