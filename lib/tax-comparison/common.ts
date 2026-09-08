import type { TaxComparison, TaxTrack } from "./types";

export const LAW_CHECKED_ON = "2026-09-08";
const MAX_WON = 100_000_000_000_000;

/** Parse decimal 억원 without floating point or silently interpreting a blank as zero. */
export function parseAmountWon(raw: string | undefined): number | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!/^\d+(?:\.\d{1,8})?$/.test(value) || value.length > 24) return null;
  const [whole, decimal = ""] = value.split(".");
  const won = BigInt(whole) * BigInt(100_000_000) + BigInt(decimal.padEnd(8, "0"));
  return won <= BigInt(MAX_WON) ? Number(won) : null;
}

export function money(values: Record<string, string>, key: string, label: string, missing: string[]): number | null {
  const won = parseAmountWon(values[key]);
  if (won === null) missing.push(`${label}: 0 이상의 금액을 억원 단위로 입력해 주세요.`);
  return won;
}

export function integer(values: Record<string, string>, key: string, label: string, missing: string[], min: number, max: number): number | null {
  const raw = values[key]?.trim() ?? "";
  const value = /^\d{1,3}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(value) || value < min || value > max) {
    missing.push(`${label}: ${min}~${max} 사이의 정수를 입력해 주세요.`);
    return null;
  }
  return value;
}

export function requireYes(values: Record<string, string>, key: string, label: string, missing: string[]): boolean {
  if (values[key] === "yes") return true;
  missing.push(label);
  return false;
}

export function roundPayment(won: number): number {
  return Math.floor(Math.max(0, won) / 10) * 10;
}

export function ordinaryTax(taxableWon: number, filingCredit = true) {
  if (!Number.isSafeInteger(taxableWon) || taxableWon < 0 || taxableWon > MAX_WON) throw new RangeError("과세표준 범위를 확인해 주세요.");
  if (taxableWon < 500_000) return { grossTaxWon: 0, creditWon: 0, nationalTaxWon: 0 };
  const brackets = [[100_000_000, 10, 0], [500_000_000, 20, 10_000_000], [1_000_000_000, 30, 60_000_000], [3_000_000_000, 40, 160_000_000], [MAX_WON, 50, 460_000_000]];
  const [, rate, deduction] = brackets.find(([limit]) => taxableWon <= limit)!;
  const grossTaxWon = Number(BigInt(taxableWon) * BigInt(rate) / BigInt(100)) - deduction;
  const creditWon = filingCredit ? Number(BigInt(grossTaxWon) * BigInt(3) / BigInt(100)) : 0;
  return { grossTaxWon, creditWon, nationalTaxWon: roundPayment(grossTaxWon - creditWon) };
}

export function baseComparison(track: TaxTrack, title: string, scope: string): TaxComparison {
  return { version: 1, track, status: "needs_info", title, scope, lawCheckedOn: LAW_CHECKED_ON,
    baseline: null, alternatives: [], missing: [], assumptions: [], exclusions: [], references: [], availableCashWon: null };
}

export function formatWon(won: number): string {
  return `${won.toLocaleString("ko-KR")}원`;
}

export function wonToInput(won: number): string {
  const value = BigInt(won);
  const whole = value / BigInt(100_000_000);
  const decimal = String(value % BigInt(100_000_000)).padStart(8, "0").replace(/0+$/, "");
  return `${whole}${decimal ? `.${decimal}` : ""}`;
}
