import { createChatState, type ChatFieldKey } from "./intake";
import { extractLocalChatPatches } from "./local";

export type DiagnosisSource = { id: string; value: string; evidence: string };

const VALUE_LIMIT = 600;
const EVIDENCE_LIMIT = 1_200;
const SOURCE_LIMIT = 80;
type Span = { start: number; end: number };
type SuggestedQuote = { key: ChatFieldKey; value: string; evidence: string; grouped?: boolean };
const UNKNOWN_QUOTE = /모르|모름|몰라|미정|미확인|불명|확인\s*필요|정하지\s*않|결정하지\s*않|안\s*정했|기억[\s\S]{0,12}(?:안\s*(?:나|남)|못|없)|unknown/i;
const FIELD_SUBJECTS: Array<[ChatFieldKey, RegExp]> = [
  ["topic", /(?:상담|검토)\s*주제/g],
  ["owner", /(?:재산\s*)?소유자(?:는|가|[:：])/g],
  ["recipient", /수증자|증여\s*받는\s*사람|받는\s*사람/g],
  ["spouse", /배우자/g],
  ["adultChildren", /(?:성년|성인)\s*자녀/g],
  ["minorChildren", /미성년\s*자녀/g],
  ["children", /자녀/g],
  ["realEstate", /아파트|상가|토지|주택|빌딩|오피스텔|건물|부동산/g],
  ["financialAssets", /금융\s*자산|예금|적금|현금|펀드|주식|채권/g],
  ["businessAssets", /법인\s*지분|비상장\s*주식|회사\s*(?:지분|주식)|사업\s*자산/g],
  ["otherAssets", /기타\s*자산/g],
  ["debt", /주택\s*담보\s*대출|담보\s*대출|신용\s*대출|학자금\s*대출|전세\s*대출|금융\s*대출|임대\s*보증금|전세\s*보증금|보증금|대출|채무|빚|공과금/g],
  ["timing", /(?:준비|진행|매각|양도|증여|상속)?\s*(?:시기|시점|일정|날짜)/g],
  ["pastGifts", /과거\s*증여|이전\s*증여|최근\s*\d+\s*년(?:\s*안에)?\s*증여/g],
  ["notes", /취득일|취득가(?:격)?|예상\s*매도가|매도\s*예정가|매도가|양도가|평가액/g],
  ["goal", /노후\s*생활비|생활비|목표|고민|걱정/g],
];

function lexicalQuotes(text: string): SuggestedQuote[] {
  const result: SuggestedQuote[] = [];
  for (const match of text.matchAll(/(?:검토|상담)\s*주제\s*[:：]\s*(가업\s*(?:상속|승계)?|상속(?:세)?|증여(?:세)?|양도(?:세)?)/g)) result.push({ key: "topic", value: match[1], evidence: match[0] });
  for (const match of text.matchAll(/(아버지|어머니|부모님(?:\s*두\s*분)?|배우자|본인|제|저)(?:의)?\s*(?:명의|재산|자산|건물|아파트|상가|주택|예금|현금)/g)) result.push({ key: "owner", value: match[1], evidence: match[0] });
  return result;
}

function numberSpans(text: string): Span[] {
  const expression = /\d+(?:,\d+)*(?:\.\d+)?(?:[ \t]*(?:조|억|천[ \t]*만|만|원|퍼센트|%|명|세|년|개월|월|일|채|개|건)(?:[ \t]*원)?)*(?:[ \t]*\d+(?:,\d+)*(?:\.\d+)?[ \t]*(?:천[ \t]*만|만|원))?/g;
  return [...text.matchAll(expression)].filter(match => match[0].length <= VALUE_LIMIT).map(match => ({ start: match.index!, end: match.index! + match[0].length }));
}

function insideNumber(position: number, spans: Span[]): boolean {
  return spans.some(span => span.start < position && position < span.end);
}

/** Chunks are slices, never reconstructed words or normalized amounts. */
function chunks(text: string): string[] {
  const spans = numberSpans(text);
  const result: string[] = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + VALUE_LIMIT, text.length);
    if (end < text.length) {
      let boundary = end;
      while (boundary > start && (insideNumber(boundary, spans) || !/[\s,.;!?。！？/]/.test(text[boundary - 1]) && !/\s/.test(text[boundary]))) boundary--;
      if (boundary > start) end = boundary;
      else {
        const number = spans.find(span => span.start < end && end < span.end);
        if (number && number.start > start) end = number.start;
      }
      if (end < text.length && /[\uDC00-\uDFFF]/.test(text[end]) && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    }
    const value = text.slice(start, end).trim();
    if (value) result.push(value);
    start = end;
  }
  return result;
}

function sentences(text: string): string[] {
  const result: string[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (!/[.!?。！？;\r\n]/.test(character) || character === "." && /\d/.test(text[index - 1] ?? "") && /\d/.test(text[index + 1] ?? "")) continue;
    const value = text.slice(start, /[\r\n]/.test(character) ? index : index + 1).trim();
    if (value) result.push(value);
    start = index + 1;
  }
  const last = text.slice(start).trim();
  if (last) result.push(last);
  return result;
}

function clauses(text: string): string[] {
  const result: string[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    if (!/[,/]/.test(text[index]) || /\d/.test(text[index - 1] ?? "") && /\d/.test(text[index + 1] ?? "")) continue;
    const value = text.slice(start, index).trim();
    if (value) result.push(value);
    start = index + 1;
  }
  const last = text.slice(start).trim();
  if (last) result.push(last);
  return result;
}

function subjectQuotes(text: string): SuggestedQuote[] {
  const result: SuggestedQuote[] = [];
  for (const sentence of sentences(text)) {
    const parts = clauses(sentence);
    for (const clause of parts.length > 1 ? [sentence, ...parts] : parts) {
      const matches = FIELD_SUBJECTS.flatMap(([key, expression]) => [...clause.matchAll(expression)].map(match => ({ key, start: match.index!, end: match.index! + match[0].length })));
      matches.sort((left, right) => left.start - right.start || right.end - left.end);
      const subjects = matches.filter((match, index) => !matches.slice(0, index).some(previous => previous.start <= match.start && match.start < previous.end));
      for (let index = 0; index < subjects.length;) {
        let last = index;
        while (subjects[last + 1]?.key === subjects[index].key) last++;
        if (last > index) {
          const value = clause.slice(subjects[index].start, subjects[last + 1]?.start ?? clause.length).trim().replace(/[,/]+$/, "").trim();
          result.push({ key: subjects[index].key, value, evidence: value, grouped: true });
        }
        index = last + 1;
      }
      subjects.forEach((subject, index) => {
        const value = clause.slice(subject.start, subjects[index + 1]?.start ?? clause.length).trim().replace(/[,/]+$/, "").trim();
        if (value) result.push({ key: subject.key, value, evidence: value });
      });
    }
  }
  return result;
}

/** Give the model IDs for literal customer quotes, without inventing a role or a value. */
export function buildDiagnosisSources(text: string): DiagnosisSource[] {
  const result: DiagnosisSource[] = [];
  const seen = new Set<string>();
  const numbers = numberSpans(text);
  const add = (rawValue: string, rawEvidence: string) => {
    const value = rawValue.trim(), evidence = rawEvidence.trim();
    if (!value || !evidence || value.length > VALUE_LIMIT || evidence.length > EVIDENCE_LIMIT || result.length >= SOURCE_LIMIT || seen.has(value) || !evidence.includes(value)) return;
    let position = text.indexOf(evidence);
    while (position >= 0) {
      const offset = evidence.indexOf(value);
      if (!insideNumber(position, numbers) && !insideNumber(position + evidence.length, numbers) && !insideNumber(position + offset, numbers) && !insideNumber(position + offset + value.length, numbers)) {
        seen.add(value);
        result.push({ id: `q${result.length + 1}`, value, evidence });
        return;
      }
      position = text.indexOf(evidence, position + 1);
    }
  };
  for (const quote of lexicalQuotes(text)) add(quote.value, quote.evidence);
  for (const proposal of extractLocalChatPatches(text, createChatState())) add(proposal.value, proposal.evidence);
  // Cover the entire input before adding finer alternatives, including the tail of long messages.
  for (const value of chunks(text)) add(value, value);
  for (const quote of subjectQuotes(text)) add(quote.value, quote.evidence);
  for (const sentence of sentences(text)) {
    for (const value of chunks(sentence)) add(value, sentence.length <= EVIDENCE_LIMIT ? sentence : value);
    for (const clause of clauses(sentence)) {
      for (const value of chunks(clause)) add(value, sentence.length <= EVIDENCE_LIMIT ? sentence : value);
    }
  }
  return result;
}

/** Optional recommendations reference existing literal quotes; they never authorize a fact. */
export function getDiagnosisSourceHints(text: string, sources: DiagnosisSource[]): Partial<Record<ChatFieldKey, string[]>> {
  const hints: Partial<Record<ChatFieldKey, string[]>> = {};
  const recommend = (key: ChatFieldKey, value: string) => {
    for (const source of sources.filter(candidate => candidate.value === value && text.includes(candidate.evidence) && candidate.evidence.includes(candidate.value))) {
      const ids = hints[key] ?? [];
      if (!ids.includes(source.id)) hints[key] = [...ids, source.id];
    }
  };
  const comparisonSentences = sentences(text).filter(sentence => /비교|중|뭐가|어떤/.test(sentence) && new Set(sentence.match(/상속|증여|양도|가업/g) ?? []).size > 1);
  for (const sentence of comparisonSentences) recommend("topic", sentence);
  const lexical = lexicalQuotes(text), subjects = subjectQuotes(text), local = extractLocalChatPatches(text, createChatState());
  const lexicalOnly = (key: ChatFieldKey) => (key === "owner" || key === "topic") && lexical.some(quote => quote.key === key);
  const companySharesOnly = /가업|승계|경영/.test(text) && /회사\s*주식|비상장\s*주식/.test(text) && !subjects.some(quote => quote.key === "financialAssets");
  const skipLocal = (key: ChatFieldKey) => lexicalOnly(key) || key === "financialAssets" && companySharesOnly;
  for (const quote of lexical) recommend(quote.key, quote.value);
  // Prefer complete local inventories when their words cover only that field.
  for (const proposal of local) {
    if (!skipLocal(proposal.key) && subjectQuotes(proposal.value).every(quote => quote.key === proposal.key)) recommend(proposal.key, proposal.value);
  }
  for (const quote of [...subjects.filter(quote => quote.grouped), ...subjects.filter(quote => !quote.grouped)]) {
    if (!lexicalOnly(quote.key)) recommend(quote.key, quote.value);
  }
  for (const quote of [...subjects.filter(quote => !quote.grouped), ...subjects.filter(quote => quote.grouped)]) if (UNKNOWN_QUOTE.test(quote.value)) recommend("unconfirmed", quote.value);
  for (const proposal of local) if (!skipLocal(proposal.key)) recommend(proposal.key, proposal.value);
  for (const sentence of sentences(text)) {
    if (/생활비|노후|걱정|고민|비교|뭐가[\s\S]{0,12}나|어떤[\s\S]{0,12}나/.test(sentence)) recommend("goal", sentence);
    if (UNKNOWN_QUOTE.test(sentence)) recommend("unconfirmed", sentence);
  }
  return hints;
}
