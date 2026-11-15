import type { LibraryDocument } from "./catalog";

const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g, "");

// Search-only wording. These equivalents do not change source records, resource
// classification, provider coverage or the meaning of a financial certificate.
const COMPOUND_TERMS: readonly [RegExp, string][] = [
  [/상속예금|예금상속/g, " 상속 예금 "],
  [/현금증여|증여현금/g, " 현금 증여 "],
  // BANK-ADD-02 already records 잔고증명 as an alternative name.
  [/잔고증명서/g, "잔액증명서"],
];
const GENERIC_TERMS = new Set(["서류", "자료"]);

/** Only reviewed compounds are expanded; unknown words remain required. */
export function resourceSearchTerms(query: string): string[] {
  let expanded = query.normalize("NFKC").toLocaleLowerCase("ko-KR");
  for (const [pattern, replacement] of COMPOUND_TERMS) expanded = expanded.replace(pattern, replacement);
  // Keep the bank name as a required term: 하나은행상속예금 → 하나은행 상속 예금.
  expanded = expanded.replace(/은행(?=[가-힣a-z0-9])/gu, "은행 ");
  const raw = expanded.trim().split(/\s+/).filter(Boolean)
    .flatMap(term => term.replace(/(.+)(서류|자료)$/u, "$1 $2").split(" "))
    .map(normalize).filter(Boolean);
  const specific = raw.filter(term => !GENERIC_TERMS.has(term));
  // A generic-only query must never pass every document through an empty AND.
  return [...new Set(specific.length ? specific : raw)];
}

/** Rank facts from this resource, including its own named provider routes. */
export function rankResourceSearch(item: LibraryDocument, query: string, groupTitles: string[] = []): number {
  if (!query.trim()) return 1;
  const q = normalize(query);
  if ([item.id, item.form_no].some(value => value && normalize(value) === q)) return 5;
  if ([item.title, item.catalogTitle].some(title => normalize(title || "") === q)) return 4;
  const terms = resourceSearchTerms(query);
  if (!terms.length) return 0;
  const providers = [item.institution, item.providerScope, ...(item.providerRoutes || []).map(route => route.provider)];
  const titleAndProvider = normalize([item.title, item.catalogTitle, ...providers].join(" "));
  if (terms.every(term => titleAndProvider.includes(term))) return 3;
  if ((item.searchAliases || []).some(alias => normalize(alias).includes(q))) return 2;
  const body = normalize([
    item.id, item.form_no, item.title, item.catalogTitle, item.description, item.tags,
    ...providers, item.originalCategory, item.category, ...(item.searchAliases || []),
    item.usage?.when || "", ...groupTitles,
  ].join(" "));
  return terms.every(term => body.includes(term)) ? 1 : 0;
}
