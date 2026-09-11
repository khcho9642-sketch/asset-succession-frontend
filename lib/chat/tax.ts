import type { AssessmentSnapshot } from "../assessment";
import { calculateTaxComparison, validateTaxComparisonInput } from "../tax-comparison";
import { wonToInput } from "../tax-comparison/common";
import type { TaxComparisonInput, TaxTrack } from "../tax-comparison/types";
import { CHAT_ASSET_KEYS, getCurrentFactSources, getPendingFactSources, type ChatState } from "./intake";
import { buildConfirmedAssessmentSnapshot, parseAssetAmount, parseChatAmount } from "./report";

const DEBT_WORDS = /담보\s*대출|은행\s*대출|금융\s*대출|임대\s*보증금|전세\s*보증금|보증금|채무|대출|빚/g;

function confirmedDebtWon(state: ChatState): number | null {
  const fact = state.facts.debt;
  if (!fact) return null;
  if (getPendingFactSources(fact).length > 0) return null;
  const sources = getCurrentFactSources(fact);
  const parsed = sources
    .filter((source) => /담보\s*대출|은행|금융|임대\s*보증금|전세\s*보증금|보증금|채무|대출|빚/.test(source.value))
    .map((source) => parseChatAmount(source.value.replace(DEBT_WORDS, "")));
  if (parsed.length === 0) {
    const single = parseChatAmount(fact.value.replace(DEBT_WORDS, ""));
    return single.status === "confirmed" ? single.value_won : null;
  }
  if (parsed.some((item) => item.status !== "confirmed")) return null;
  const total = parsed.reduce((sum, item) => sum + (item.status === "confirmed" ? item.value_won : 0), 0);
  return Number.isSafeInteger(total) ? total : null;
}

export function taxFactsSignature(state: ChatState): string {
  return JSON.stringify(state.facts);
}

export function createTaxInputFromChat(state: ChatState, preferredTrack?: TaxTrack): TaxComparisonInput {
  const topic = state.facts.topic?.value ?? "";
  const track = preferredTrack ?? (/가업|회사.*승계/.test(topic) ? "business_succession" : /양도|매각/.test(topic) ? "capital_gains" : /증여/.test(topic) && !/상속/.test(topic) ? "gift" : "inheritance");
  const values: Record<string, string> = {};
  // New business consultations start with inheritance unless the user explicitly asks for a lifetime gift.
  // This selects a calculator; it does not assert eligibility for the deduction.
  const businessInheritance = track === "business_succession" && !/증여/.test(topic);
  if (track === "business_succession") values.businessMethod = businessInheritance ? "inheritance" : "gift";
  // A named home sale can select a form, but does not establish its sale price or exemption.
  if (track === "capital_gains" && /주택|아파트/.test(topic) && !/상가|토지/.test(topic)) values.capitalAsset = "home";
  if (track === "inheritance" || businessInheritance) {
    // This is a visible modelling assumption, not an extracted claim about actual funeral spending.
    values.funeral = "0.05";
    const amounts = CHAT_ASSET_KEYS.filter(key => state.facts[key]).map(key => ({ key, parsed: parseAssetAmount(key, state) }));
    if (amounts.length && amounts.every(item => item.parsed.status === "confirmed")) {
      const total = amounts.reduce((sum, item) => sum + (item.parsed.status === "confirmed" ? item.parsed.value_won : 0), 0);
      if (Number.isSafeInteger(total)) values.estate = wonToInput(total);
    }
    const financial = amounts.find(item => item.key === "financialAssets")?.parsed;
    if (financial?.status === "confirmed") values.financial = wonToInput(financial.value_won);
    const rawDebt = state.facts.debt?.value;
    if (rawDebt) {
      const debtWon = confirmedDebtWon(state);
      if (debtWon !== null) {
        values.debt = wonToInput(debtWon);
        if (debtWon === 0) values.financialDebt = "0";
      }
    }
    const spouse = state.facts.spouse?.value?.replace(/^(?:소유자의?\s*)?배우자(?:은|는|이|가)?\s*/, "").trim() ?? "";
    if (/^(있음|있어요|있습니다|있다|1\s*명)[.!]?$/.test(spouse)) values.spouse = "yes";
    if (/^(없음|없어요|없습니다|없다|0\s*명)[.!]?$/.test(spouse)) values.spouse = "no";
    // The calculator asks for adult heirs. A total child count is not evidence of their ages.
    const rawChildren = state.facts.adultChildren?.value ?? "";
    const clean = rawChildren.replace(/^(?:(?:성인|성년)\s*)?자녀(?:은|는|이|가)?\s*/, "").trim();
    const count = clean.match(/^(\d{1,2})\s*명?(?:이에요|입니다|이요|있어요)?[.!]?$/)?.[1];
    const korean = clean.match(/^(한|하나|두|둘|세|셋|네|넷|다섯|여섯)\s*명?(?:이에요|입니다|이요|있어요)?[.!]?$/)?.[1];
    const counts: Record<string, number> = { 한: 1, 하나: 1, 두: 2, 둘: 2, 세: 3, 셋: 3, 네: 4, 넷: 4, 다섯: 5, 여섯: 6 };
    if (count) values.children = count;
    else if (korean) values.children = String(counts[korean]);
  }
  if (track === "business_succession" && !businessInheritance && state.facts.businessAssets) {
    const amount = parseAssetAmount("businessAssets", state);
    if (amount.status === "confirmed") values.businessValue = wonToInput(amount.value_won);
  }
  // Never assume residency, no prior gifts, available payment cash, recipients, or special eligibility.
  return { version: 1, track, values, confirmed: false };
}

export function attachConfirmedTaxComparison(snapshot: AssessmentSnapshot, raw: TaxComparisonInput): AssessmentSnapshot {
  if (snapshot.conversation?.pending_candidates?.length) throw new Error("확인 대기 요청의 대상을 확인하거나 요청을 취소한 뒤 보고서를 열어 주세요.");
  const input = validateTaxComparisonInput(raw);
  if (!input?.confirmed) throw new Error("계산 조건을 확인한 뒤 보고서를 열어 주세요.");
  const result = calculateTaxComparison(input);
  if (result.status !== "ready") throw new Error(result.missing.join(" ") || "계산 범위와 입력값을 확인해 주세요.");
  return { ...snapshot, taxComparisonInput: { ...input, values: { ...input.values } } };
}

/** Shared customer/CLI handoff: an estimate report always contains a ready, confirmed calculation. */
export function buildConfirmedTaxAssessmentSnapshot(
  state: ChatState,
  input: TaxComparisonInput,
  confirmation: { confirmed: true; confirmedAt: string; assessmentId?: string }
): AssessmentSnapshot {
  return attachConfirmedTaxComparison(buildConfirmedAssessmentSnapshot(state, confirmation), input);
}
