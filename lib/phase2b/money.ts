export type ParsedMoney =
  | {
      status: "parsed";
      value_eok: number;
      value_won: number;
      normalized_label: string;
      basis: "explicit_unit";
    }
  | {
      status: "needs_confirmation";
      value_eok: number | null;
      value_won: number | null;
      normalized_label: string;
      reason: string;
    }
  | {
      status: "invalid" | "empty";
      value_eok: null;
      value_won: null;
      normalized_label: string;
      reason: string;
    };

export type ParsedMoneyRange =
  | {
      status: "range";
      min_eok: number;
      max_eok: number;
      min_won: number;
      max_won: number;
      normalized_label: string;
      basis: "explicit_unit_range";
    }
  | {
      status: "not_range" | "invalid";
      min_eok: null;
      max_eok: null;
      min_won: null;
      max_won: null;
      normalized_label: string;
      reason: string;
    };

export type MoneyMention = {
  raw: string;
  parsed: ParsedMoney;
  start: number;
  end: number;
};

export const EOK_WON = 100_000_000;
export const MAN_WON = 10_000;

export function eokToWon(valueEok: number) {
  return Math.round(valueEok * EOK_WON);
}

export function wonToEok(valueWon: number) {
  return roundEok(valueWon / EOK_WON);
}

export function parseKoreanMoneyToEok(input?: string, options: { allowZero?: boolean } = {}): ParsedMoney {
  const raw = input?.trim() ?? "";
  if (!raw) {
    return {
      status: "empty",
      value_eok: null,
      value_won: null,
      normalized_label: "",
      reason: "입력값이 없습니다."
    };
  }

  const normalized = raw
    .replaceAll(",", "")
    .replace(/\s+/g, " ")
    .replace(/원\s*정$/g, "원")
    .trim();

  if (/[−-]/.test(normalized) || /마이너스|음수/.test(normalized)) {
    return {
      status: "invalid",
      value_eok: null,
      value_won: null,
      normalized_label: raw,
      reason: "금액은 0보다 큰 양수만 사용할 수 있습니다."
    };
  }

  if (/^\d+(?:\.\d+)?$/.test(normalized)) {
    const numeric = Number(normalized);
    if (!isAllowedNonnegative(numeric, options.allowZero)) return invalidNumber(raw, options.allowZero);
    return {
      status: "needs_confirmation",
      value_eok: numeric,
      value_won: eokToWon(numeric),
      normalized_label: `${formatNumber(numeric)}억원으로 이해해도 될까요?`,
      reason: "단위가 없는 숫자는 억원 단위인지 확인이 필요합니다."
    };
  }

  let totalWon = 0;
  let matched = false;
  const consumedRanges: Array<[number, number]> = [];

  for (const match of normalized.matchAll(/(\d+(?:\.\d+)?)\s*억(?:원)?/g)) {
    const amount = Number(match[1]);
    if (!isAllowedNonnegative(amount, options.allowZero)) return invalidNumber(raw, options.allowZero);
    totalWon += amount * EOK_WON;
    matched = true;
    consumedRanges.push([match.index ?? 0, (match.index ?? 0) + match[0].length]);
  }

  for (const match of normalized.matchAll(/(\d+(?:\.\d+)?)\s*천\s*만(?:원)?/g)) {
    const amount = Number(match[1]);
    if (!isAllowedNonnegative(amount, options.allowZero)) return invalidNumber(raw, options.allowZero);
    totalWon += amount * 1_000 * MAN_WON;
    matched = true;
    consumedRanges.push([match.index ?? 0, (match.index ?? 0) + match[0].length]);
  }

  for (const match of normalized.matchAll(/(\d+(?:\.\d+)?)\s*만(?:원)?/g)) {
    const range: [number, number] = [match.index ?? 0, (match.index ?? 0) + match[0].length];
    if (overlaps(range, consumedRanges)) continue;
    const amount = Number(match[1]);
    if (!isAllowedNonnegative(amount, options.allowZero)) return invalidNumber(raw, options.allowZero);
    totalWon += amount * MAN_WON;
    matched = true;
  }

  if (!matched) {
    return {
      status: "invalid",
      value_eok: null,
      value_won: null,
      normalized_label: raw,
      reason: "억원·만원처럼 단위가 붙은 금액을 찾지 못했습니다."
    };
  }

  const valueEok = roundEok(totalWon / EOK_WON);
  if (!isAllowedNonnegative(valueEok, options.allowZero)) return invalidNumber(raw, options.allowZero);

  return {
    status: "parsed",
    value_eok: valueEok,
    value_won: Math.round(totalWon),
    normalized_label: formatEokLabel(valueEok),
    basis: "explicit_unit"
  };
}

export function parseKoreanMoneyRangeToEok(input?: string): ParsedMoneyRange {
  const raw = input?.trim() ?? "";
  if (!raw) {
    return {
      status: "not_range",
      min_eok: null,
      max_eok: null,
      min_won: null,
      max_won: null,
      normalized_label: "",
      reason: "입력값이 없습니다."
    };
  }

  const normalized = raw.replaceAll(",", "").replace(/\s+/g, " ").trim();
  const match = normalized.match(/(\d+(?:\.\d+)?\s*(?:억(?:원)?|천\s*만(?:원)?|만(?:원)?)?)\s*(?:~|〜|부터|에서|-)\s*(\d+(?:\.\d+)?\s*(?:억(?:원)?|천\s*만(?:원)?|만(?:원)?)?)/);
  if (!match) {
    return {
      status: "not_range",
      min_eok: null,
      max_eok: null,
      min_won: null,
      max_won: null,
      normalized_label: raw,
      reason: "범위 금액이 아닙니다."
    };
  }

  const [, leftRaw, rightRaw] = match;
  const inferredUnit = rightRaw.match(/억(?:원)?|천\s*만(?:원)?|만(?:원)?/)?.[0] ?? "";
  const left = parseKoreanMoneyToEok(appendUnitIfMissing(leftRaw, inferredUnit));
  const right = parseKoreanMoneyToEok(appendUnitIfMissing(rightRaw, inferredUnit));
  if (left.status !== "parsed" || right.status !== "parsed" || left.value_won > right.value_won) {
    return {
      status: "invalid",
      min_eok: null,
      max_eok: null,
      min_won: null,
      max_won: null,
      normalized_label: raw,
      reason: "범위 금액을 해석할 수 없습니다."
    };
  }

  return {
    status: "range",
    min_eok: left.value_eok,
    max_eok: right.value_eok,
    min_won: left.value_won,
    max_won: right.value_won,
    normalized_label: `${left.normalized_label}~${right.normalized_label}`,
    basis: "explicit_unit_range"
  };
}

export function extractMoneyMentions(text: string): MoneyMention[] {
  const mentions: MoneyMention[] = [];
  const ranges = extractMoneyRanges(text);
  const pattern = /\d+(?:\.\d+)?\s*억(?:원)?(?:\s*\d+(?:\.\d+)?\s*천\s*만(?:원)?)?|\d+(?:\.\d+)?\s*천\s*만(?:원)?|\d+(?:\.\d+)?\s*만(?:원)?/g;
  for (const match of text.matchAll(pattern)) {
    const raw = match[0];
    const start = match.index ?? 0;
    const end = start + raw.length;
    if (ranges.some((range) => start >= range.start && end <= range.end)) continue;
    mentions.push({
      raw,
      parsed: parseKoreanMoneyToEok(raw),
      start,
      end
    });
  }
  return mentions;
}

export function extractMoneyRanges(text: string) {
  const ranges: Array<{ raw: string; parsed: ParsedMoneyRange; start: number; end: number }> = [];
  const pattern = /(\d+(?:\.\d+)?\s*(?:억(?:원)?|천\s*만(?:원)?|만(?:원)?)?)\s*(?:~|〜|부터|에서|-)\s*(\d+(?:\.\d+)?\s*(?:억(?:원)?|천\s*만(?:원)?|만(?:원)?)?)/g;
  for (const match of text.matchAll(pattern)) {
    const raw = match[0];
    ranges.push({
      raw,
      parsed: parseKoreanMoneyRangeToEok(raw),
      start: match.index ?? 0,
      end: (match.index ?? 0) + raw.length
    });
  }
  return ranges;
}

export function formatEokLabel(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "추가정보 필요";
  if (Math.abs(value) < 0.0001) return "0억";
  const fixed = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(value < 1 ? 2 : 1);
  return `${trimTrailingZeros(fixed)}억`;
}

function isAllowedNonnegative(value: number, allowZero = false) {
  return Number.isFinite(value) && (allowZero ? value >= 0 : value > 0);
}

function invalidNumber(raw: string, allowZero = false): ParsedMoney {
  return {
    status: "invalid",
    value_eok: null,
    value_won: null,
    normalized_label: raw,
    reason: allowZero ? "해석 가능한 0 이상의 금액이 아닙니다." : "해석 가능한 양수 금액이 아닙니다."
  };
}

function overlaps(range: [number, number], ranges: Array<[number, number]>) {
  return ranges.some(([start, end]) => range[0] < end && start < range[1]);
}

function roundEok(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function formatNumber(value: number) {
  return trimTrailingZeros(Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2));
}

function trimTrailingZeros(value: string) {
  return value.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function appendUnitIfMissing(value: string, inferredUnit: string) {
  const trimmed = value.trim();
  if (/억(?:원)?|천\s*만(?:원)?|만(?:원)?/.test(trimmed) || !inferredUnit) return trimmed;
  return `${trimmed}${inferredUnit}`;
}
