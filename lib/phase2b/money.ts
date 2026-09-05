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

export type MoneyMention = {
  raw: string;
  parsed: ParsedMoney;
  start: number;
  end: number;
};

const EOK_WON = 100_000_000;
const MAN_WON = 10_000;

export function parseKoreanMoneyToEok(input?: string): ParsedMoney {
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
    return {
      status: "needs_confirmation",
      value_eok: Number(normalized),
      value_won: Number(normalized) * EOK_WON,
      normalized_label: `${formatNumber(Number(normalized))}억원으로 이해해도 될까요?`,
      reason: "단위가 없는 숫자는 억원 단위인지 확인이 필요합니다."
    };
  }

  let totalWon = 0;
  let matched = false;
  const consumedRanges: Array<[number, number]> = [];

  for (const match of normalized.matchAll(/(\d+(?:\.\d+)?)\s*억(?:원)?/g)) {
    const amount = Number(match[1]);
    if (!isUsablePositive(amount)) return invalidNumber(raw);
    totalWon += amount * EOK_WON;
    matched = true;
    consumedRanges.push([match.index ?? 0, (match.index ?? 0) + match[0].length]);
  }

  for (const match of normalized.matchAll(/(\d+(?:\.\d+)?)\s*천\s*만(?:원)?/g)) {
    const amount = Number(match[1]);
    if (!isUsablePositive(amount)) return invalidNumber(raw);
    totalWon += amount * 1_000 * MAN_WON;
    matched = true;
    consumedRanges.push([match.index ?? 0, (match.index ?? 0) + match[0].length]);
  }

  for (const match of normalized.matchAll(/(\d+(?:\.\d+)?)\s*만(?:원)?/g)) {
    const range: [number, number] = [match.index ?? 0, (match.index ?? 0) + match[0].length];
    if (overlaps(range, consumedRanges)) continue;
    const amount = Number(match[1]);
    if (!isUsablePositive(amount)) return invalidNumber(raw);
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
  if (!isUsablePositive(valueEok)) return invalidNumber(raw);

  return {
    status: "parsed",
    value_eok: valueEok,
    value_won: Math.round(totalWon),
    normalized_label: formatEokLabel(valueEok),
    basis: "explicit_unit"
  };
}

export function extractMoneyMentions(text: string): MoneyMention[] {
  const mentions: MoneyMention[] = [];
  const pattern = /\d+(?:\.\d+)?\s*(?:억(?:원)?|천\s*만(?:원)?|만(?:원)?)/g;
  for (const match of text.matchAll(pattern)) {
    const raw = match[0];
    mentions.push({
      raw,
      parsed: parseKoreanMoneyToEok(raw),
      start: match.index ?? 0,
      end: (match.index ?? 0) + raw.length
    });
  }
  return mentions;
}

export function formatEokLabel(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "추가정보 필요";
  if (Math.abs(value) < 0.0001) return "0억";
  const fixed = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(value < 1 ? 2 : 1);
  return `${trimTrailingZeros(fixed)}억`;
}

function isUsablePositive(value: number) {
  return Number.isFinite(value) && value > 0;
}

function invalidNumber(raw: string): ParsedMoney {
  return {
    status: "invalid",
    value_eok: null,
    value_won: null,
    normalized_label: raw,
    reason: "해석 가능한 양수 금액이 아닙니다."
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
