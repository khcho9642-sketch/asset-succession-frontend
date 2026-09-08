import { baseComparison, parseAmountWon } from "./common";
import { getAllowedTaxKeys } from "./config";
import { compareInheritance, compareGift } from "./inheritance-gift";
import { compareCapitalGains, compareBusinessGift } from "./capital-business";
import { compareHousing } from "./housing";
import { compareBusinessInheritance } from "./business-inheritance";
import type { TaxComparisonInput, TaxTrack } from "./types";
export { formatWon } from "./common";
export type { TaxComparisonInput, TaxComparison, TaxTrack, TaxCase } from "./types";

const TRACKS: TaxTrack[] = ["inheritance", "gift", "capital_gains", "business_succession"];

export function validateTaxComparisonInput(raw: unknown): TaxComparisonInput | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  if (input.version !== 1 || !TRACKS.includes(input.track as TaxTrack) || typeof input.confirmed !== "boolean") return null;
  if (!input.values || typeof input.values !== "object" || Array.isArray(input.values)) return null;
  const keys = new Set(getAllowedTaxKeys(input.track as TaxTrack));
  const values: Record<string, string> = {};
  const entries = Object.entries(input.values);
  if (entries.length > 40) return null;
  for (const [key, value] of entries) {
    if (!keys.has(key) || typeof value !== "string" || value.length > 100) return null;
    values[key] = value;
  }
  if (values.capitalAsset !== undefined && !["commercial", "home"].includes(values.capitalAsset)) return null;
  if (values.businessMethod !== undefined && !["gift", "inheritance"].includes(values.businessMethod)) return null;
  if (input.confirmed && (typeof input.confirmedAt !== "string" || !Number.isFinite(Date.parse(input.confirmedAt)))) return null;
  return { version: 1, track: input.track as TaxTrack, values, confirmed: input.confirmed,
    ...(typeof input.confirmedAt === "string" ? { confirmedAt: input.confirmedAt } : {}) };
}

/** Preview is allowed before confirmation; only the report handoff accepts confirmed inputs. */
export function calculateTaxComparison(raw: TaxComparisonInput) {
  const input = validateTaxComparisonInput(raw);
  if (!input) {
    const invalid = baseComparison("inheritance", "세액 비교 입력 확인", "입력값 확인 전");
    invalid.missing = ["저장된 계산 조건을 읽을 수 없습니다. 계산 조건을 다시 확인해 주세요."];
    return invalid;
  }
  const calculators = { inheritance: compareInheritance, gift: compareGift, capital_gains: compareCapitalGains, business_succession: compareBusinessGift };
  const result = input.track === "capital_gains" && input.values.capitalAsset === "home"
    ? compareHousing(input)
    : input.track === "business_succession" && input.values.businessMethod === "inheritance"
      ? compareBusinessInheritance(input)
      : calculators[input.track](input);
  const rawCash = input.values.availableCash;
  if (rawCash?.trim()) {
    const cash = parseAmountWon(rawCash);
    if (cash === null) {
      result.missing.push("납부 가능 현금: 금액을 수정하거나 비워 주세요.");
      result.status = "needs_info";
      result.baseline = null;
      result.alternatives = [];
    } else result.availableCashWon = cash;
  }
  result.missing = [...new Set(result.missing)];
  return result;
}
