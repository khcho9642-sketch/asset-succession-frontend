import type { AssessmentAnswer, AssessmentSnapshot } from "../assessment";
import { validateTaxComparisonInput } from "../tax-comparison";
import { parseAmountWon, wonToInput } from "../tax-comparison/common";
import type { TaxComparisonInput, TaxTrack } from "../tax-comparison/types";

const ABSENT_CHOICES = new Set(["해당 없음", "잘 모르겠음", "모름"]);

function exactCount(raw: string | undefined): string | undefined {
  const match = raw?.trim().match(/^(\d{1,2})\s*명?$/);
  return match ? String(Number(match[1])) : undefined;
}

function knownAmount(answer: AssessmentAnswer, label: string, kind: "asset" | "debt"): number | null {
  if (kind === "asset" && answer.assetAmountStatus?.[label] !== undefined && answer.assetAmountStatus[label] !== "confirmed") return null;
  if (kind === "asset" && answer.assetAmountRanges?.[label]) return null;
  const won = (kind === "asset" ? answer.assetAmountWons : answer.debtAmountWons)?.[label];
  const raw = (kind === "asset" ? answer.assetAmounts : answer.debtAmounts)?.[label];
  const parsed = raw === undefined ? null : parseAmountWon(raw);
  if (won !== undefined) {
    if (!Number.isSafeInteger(won) || won < 0 || parseAmountWon(wonToInput(won)) === null) return null;
    // Conflicting normalized representations need confirmation, not a preference rule.
    if (raw !== undefined && (parsed === null || parsed !== won)) return null;
    return won;
  }
  return parsed;
}

function confirmedTotal(answer: AssessmentAnswer | undefined, kind: "asset" | "debt"): number | null {
  if (!answer || answer.choices.some(choice => choice === "잘 모르겠음" || choice === "모름")) return null;
  const labels = [...new Set(answer.choices.filter(choice => !ABSENT_CHOICES.has(choice)))];
  if (labels.length === 0) return null;
  const amounts = labels.map(label => knownAmount(answer, label, kind));
  if (amounts.some(amount => amount === null)) return null;
  const total = amounts.reduce<number>((sum, amount) => sum + amount!, 0);
  return Number.isSafeInteger(total) && parseAmountWon(wonToInput(total)) !== null ? total : null;
}

function confirmedTopic(snapshot: AssessmentSnapshot): string {
  const purpose = snapshot.answers.purpose;
  const conversationTopics = snapshot.conversation?.confirmed_facts.filter(fact => fact.id === "topic" && fact.confidence === "customer_confirmed").map(fact => fact.value) ?? [];
  return [purpose?.detail, ...(purpose?.choices ?? []), ...conversationTopics].filter(Boolean).join(" ");
}

function inferTrack(snapshot: AssessmentSnapshot): TaxTrack {
  const topic = confirmedTopic(snapshot);
  if (/가업|회사.*(?:승계|상속)/.test(topic)) return "business_succession";
  if (/양도|매각/.test(topic)) return "capital_gains";
  if (/증여/.test(topic) && !/상속/.test(topic)) return "gift";
  return "inheritance";
}

/**
 * Seed the estimate editor from a saved, customer-confirmed assessment.
 * This remains a draft: an asset total is not yet a confirmed taxable estate,
 * and neither a known asset nor its value establishes a proposed sale or gift.
 */
export function createTaxInputFromSnapshot(snapshot: AssessmentSnapshot, preferredTrack?: TaxTrack): TaxComparisonInput {
  const existing = validateTaxComparisonInput(snapshot.taxComparisonInput);
  const track = preferredTrack ?? existing?.track ?? inferTrack(snapshot);
  if (existing?.track === track) {
    // Editing requires renewed confirmation; never mutate the saved calculation.
    return { version: 1, track, values: { ...existing.values }, confirmed: false };
  }

  const values: Record<string, string> = {};
  const topic = confirmedTopic(snapshot);
  if (track === "business_succession") values.businessMethod = /가업|회사/.test(topic) && /증여/.test(topic) && !/상속/.test(topic) ? "gift" : "inheritance";
  if (track !== "inheritance" && !(track === "business_succession" && values.businessMethod === "inheritance")) {
    if (track === "capital_gains" && /(?:주택|아파트).*양도|양도.*(?:주택|아파트)/.test(topic) && !/상가|토지|건물/.test(topic)) values.capitalAsset = "home";
    return { version: 1, track, values, confirmed: false };
  }

  const assets = snapshot.answers.assets;
  const total = confirmedTotal(assets, "asset");
  if (total !== null) values.estate = wonToInput(total);
  if (assets?.choices.includes("금융자산")) {
    const financial = knownAmount(assets, "금융자산", "asset");
    if (financial !== null) values.financial = wonToInput(financial);
  } else if (assets?.facts?.["금융자산 유무"] === "없음 (직접 확인)") {
    values.financial = "0";
  }

  const debt = snapshot.answers.debt;
  const knownDebt = confirmedTotal(debt, "debt");
  const hasDebtKinds = debt?.choices.some(choice => !ABSENT_CHOICES.has(choice)) ?? false;
  const noDebt = debt?.facts?.["채무 여부"] === "없음" || debt?.choices.includes("해당 없음");
  if (noDebt && !hasDebtKinds && !debt?.choices.some(choice => choice === "잘 모르겠음" || choice === "모름")) {
    values.debt = "0";
    values.financialDebt = "0";
  } else if (!noDebt && knownDebt !== null) {
    values.debt = wonToInput(knownDebt);
    if (knownDebt === 0) values.financialDebt = "0";
  }

  const family = snapshot.answers.family?.facts;
  if (family?.["배우자 유무"] === "있음") values.spouse = "yes";
  if (family?.["배우자 유무"] === "없음") values.spouse = "no";
  // The calculator's children field specifically means ADULT legal child-heirs.
  // A confirmed total child count must never be silently converted to adulthood.
  const adults = exactCount(family?.["성년 자녀 수"]);
  if (adults !== undefined) values.children = adults;

  // Residency, earlier gifts, funeral spending, available cash and eligibility
  // must be supplied in the estimate editor. They are not inferred from assets.
  return { version: 1, track, values, confirmed: false };
}
