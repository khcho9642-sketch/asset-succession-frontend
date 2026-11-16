import { createChatState } from "./intake";
import { extractLocalChatPatches } from "./local";

export type DiagnosisSource = { id: string; value: string; evidence: string };

const VALUE_LIMIT = 600;
const EVIDENCE_LIMIT = 1_200;
const SOURCE_LIMIT = 80;
type Span = { start: number; end: number };

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
  for (const proposal of extractLocalChatPatches(text, createChatState())) add(proposal.value, proposal.evidence);
  for (const match of text.matchAll(/(?:검토|상담)\s*주제\s*[:：]\s*(가업\s*(?:상속|승계)?|상속(?:세)?|증여(?:세)?|양도(?:세)?)/g)) add(match[1], match[0]);
  for (const match of text.matchAll(/(아버지|어머니|부모님(?:\s*두\s*분)?|배우자|본인|제|저)(?:의)?\s*(?:명의|재산|자산|건물|아파트|상가|주택|예금|현금)/g)) add(match[1], match[0]);
  // Cover the entire input before adding finer alternatives, including the tail of long messages.
  for (const value of chunks(text)) add(value, value);
  for (const sentence of sentences(text)) {
    for (const value of chunks(sentence)) add(value, sentence.length <= EVIDENCE_LIMIT ? sentence : value);
    for (const clause of clauses(sentence)) {
      for (const value of chunks(clause)) add(value, sentence.length <= EVIDENCE_LIMIT ? sentence : value);
    }
  }
  return result;
}
