import type { AssessmentSnapshot } from "../assessment";
import { calculateTaxComparison, validateTaxComparisonInput } from "../tax-comparison";
import { wonToInput } from "../tax-comparison/common";
import type { TaxComparisonInput, TaxTrack } from "../tax-comparison/types";
import { CHAT_ASSET_KEYS, getChatFactSources, type ChatState } from "./intake";
import { buildConfirmedAssessmentSnapshot, parseAssetAmount, parseChatAmount } from "./report";

export function taxFactsSignature(state: ChatState): string {
  return JSON.stringify(state.facts);
}

const DEBT_SUBJECT = /채무|대출|빚|보증금|공과금|차입|부채|상환/;
const FINANCIAL_SUBJECT = /금융\s*자산|예금|적금|현금|펀드|주식|채권/;
const BUSINESS_SUBJECT = /법인\s*지분|비상장\s*주식|회사\s*지분|사업\s*자산/;
const ASSET_SUBJECT = /재산|자산|부동산|건물|아파트|상가|주택|토지|오피스텔|빌딩|예금|적금|현금|펀드|주식|채권|지분/;
const PENDING_SUBJECT = /채무|대출|빚|보증금|공과금|차입|부채|상환|재산|자산|부동산|건물|아파트|상가|주택|토지|오피스텔|빌딩|예금|적금|현금|펀드|주식|채권|지분|배우자|자녀|아들|딸|소유자/;
const UNCERTAIN_SPOUSE = /[?？]|모르|모름|미확인|확인\s*필요|불명|아마|추정|예상|같|겠|가능|듯|인지|거나|또는|혹은|만약|가정/;

function hasPendingSubject(state: ChatState, subject: RegExp): boolean {
  return getChatFactSources(state.facts.unconfirmed).some(source => {
    // A short quote such as "모르겠어요" needs its evidence for context. A named
    // deposit uncertainty must not invalidate known assets elsewhere in that evidence.
    const raw = PENDING_SUBJECT.test(source.value) ? source.value : source.evidence;
    return subject.test(raw);
  });
}

function explicitSpouse(raw: string | undefined, evidence: string | undefined): "yes" | "no" | undefined {
  if (!raw) return undefined;
  const quote = raw.replace(/\s/g, "");
  const clause = evidence?.split(/(?<=[.!?？。])\s*|\n/).find(part => part.replace(/\s/g, "").includes(quote)) ?? evidence ?? raw;
  if (raw.includes("\n") || UNCERTAIN_SPOUSE.test(raw) || UNCERTAIN_SPOUSE.test(clause)) return undefined;
  const answer = raw.trim().replace(/^(?:(?:재산\s*소유자|소유자|피상속인|아버지|어머니|부친|모친|부모님|본인|제|저)(?:의|에게는|에게|은|는|이|가)?\s*)?배우자(?:분)?(?:께서|은|는|이|가|도)?\s*/, "");
  if (/^(?:있음|있어요|있습니다|있다|있으세요|있으십니다|계세요|계십니다|계심|계시다|1\s*명|한\s*(?:명|분))(?:[.!。])?$/.test(answer)) return "yes";
  if (/^(?:없음|없어요|없습니다|없다|없으세요|안\s*계세요|안\s*계십니다|계시지\s*않아요|계시지\s*않습니다|0\s*명|미혼(?:이에요|입니다)?|사별(?:했어요|했습니다)?|이혼(?:했어요|했습니다)?)(?:[.!。])?$/.test(answer)) return "no";
  return undefined;
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
  const capitalAssetContext = [topic, state.facts.realEstate?.value ?? ""].join("\n");
  if (track === "capital_gains" && /주택|아파트/.test(capitalAssetContext) && !/상가|토지|건물|빌딩|오피스텔/.test(capitalAssetContext)) values.capitalAsset = "home";
  if (track === "inheritance" || businessInheritance) {
    // This is a visible modelling assumption, not an extracted claim about actual funeral spending.
    values.funeral = "0.05";
    const amounts = CHAT_ASSET_KEYS.filter(key => state.facts[key]).map(key => ({ key, parsed: parseAssetAmount(key, state) }));
    if (!hasPendingSubject(state, ASSET_SUBJECT) && amounts.length && amounts.every(item => item.parsed.status === "confirmed")) {
      const total = amounts.reduce((sum, item) => sum + (item.parsed.status === "confirmed" ? item.parsed.value_won : 0), 0);
      if (Number.isSafeInteger(total)) values.estate = wonToInput(total);
    }
    const financial = amounts.find(item => item.key === "financialAssets")?.parsed;
    if (!hasPendingSubject(state, FINANCIAL_SUBJECT) && financial?.status === "confirmed") values.financial = wonToInput(financial.value_won);
    const rawDebt = state.facts.debt?.value;
    if (rawDebt && !hasPendingSubject(state, DEBT_SUBJECT) && getChatFactSources(state.facts.debt).length === 1) {
      const parsed = parseChatAmount(rawDebt.replace(/담보\s*대출|금융\s*채무|채무|대출|빚/g, "").trim());
      if (parsed.status === "confirmed") {
        values.debt = wonToInput(parsed.value_won);
        if (parsed.value_won === 0) values.financialDebt = "0";
      }
    }
    const spouse = explicitSpouse(state.facts.spouse?.value, state.facts.spouse?.evidence);
    if (spouse) values.spouse = spouse;
    // The calculator asks for adult heirs. A total child count is not evidence of their ages.
    const rawChildren = state.facts.adultChildren?.value ?? "";
    const clean = rawChildren.replace(/^(?:(?:성인|성년)\s*)?자녀(?:은|는|이|가)?\s*/, "").trim();
    const count = clean.match(/^(\d{1,2})\s*명?(?:이에요|입니다|이요|있어요)?[.!]?$/)?.[1];
    const korean = clean.match(/^(한|하나|두|둘|세|셋|네|넷|다섯|여섯)\s*명?(?:이에요|입니다|이요|있어요)?[.!]?$/)?.[1];
    const counts: Record<string, number> = { 한: 1, 하나: 1, 두: 2, 둘: 2, 세: 3, 셋: 3, 네: 4, 넷: 4, 다섯: 5, 여섯: 6 };
    if (count) values.children = count;
    else if (korean) values.children = String(counts[korean]);
  }
  if (track === "business_succession" && !businessInheritance && state.facts.businessAssets && !hasPendingSubject(state, BUSINESS_SUBJECT)) {
    const amount = parseAssetAmount("businessAssets", state);
    if (amount.status === "confirmed") values.businessValue = wonToInput(amount.value_won);
  }
  // Never assume residency, no prior gifts, available payment cash, recipients, or special eligibility.
  return { version: 1, track, values, confirmed: false };
}

export function attachConfirmedTaxComparison(snapshot: AssessmentSnapshot, raw: TaxComparisonInput): AssessmentSnapshot {
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
