import { extractMoneyMentions, extractMoneyRanges, formatEokLabel } from "./money";
import type { TaxKind } from "./types";

export type ConversationFactTarget =
  | { answerKey: "purpose"; kind: "choice"; choice: string }
  | { answerKey: "family"; kind: "choice"; choice: string }
  | { answerKey: "family"; kind: "fact"; label: string; value: string }
  | {
      answerKey: "assets";
      kind: "choice";
      choice: string;
      amount?: string;
      amountWon?: number;
      amountStatus?: "confirmed" | "range" | "needs_confirmation" | "unknown";
      range?: { min_won: number; max_won: number; label: string };
      quantity?: number;
    }
  | { answerKey: "assets"; kind: "fact"; label: string; value: string }
  | {
      answerKey: "debt";
      kind: "choice";
      choice: string;
      amount?: string;
      amountWon?: number;
      amountStatus?: "confirmed" | "needs_confirmation" | "unknown";
    }
  | { answerKey: "goal"; kind: "choice"; choice: string }
  | { answerKey: "review"; kind: "choice"; choice: string }
  | {
      answerKey: "review";
      kind: "tax_base";
      scenarioId: "baseline" | "gift-stepwise-transfer" | "inheritance-spouse-allocation";
      taxKind: Extract<TaxKind, "inheritance_tax" | "gift_tax">;
      amount: string;
      amountWon: number;
    };

export type ConversationCandidateFact = {
  id: string;
  label: string;
  value: string;
  raw_text: string;
  confidence: "high" | "medium" | "needs_confirmation";
  target: ConversationFactTarget;
};

export type ConversationParseResult = {
  status: "candidate" | "help" | "empty";
  assistantText: string;
  facts: ConversationCandidateFact[];
};

type AssetDefinition = {
  label: string;
  patterns: RegExp[];
};

const trackChoices: Array<{ choice: string; patterns: RegExp[] }> = [
  { choice: "상속", patterns: [/상속|상속세|사후|돌아가시면/] },
  { choice: "증여", patterns: [/증여|생전\s*이전|미리\s*주/] },
  { choice: "가업·회사 승계", patterns: [/가업|회사|법인|비상장|지분|승계/] },
  { choice: "양도", patterns: [/양도|매각|팔(?:고|아서|면)|처분/] }
];

const assetDefinitions: AssetDefinition[] = [
  { label: "법인지분", patterns: [/법인\s*지분|회사\s*지분|비상장\s*주식/] },
  { label: "부동산", patterns: [/부동산|아파트|건물|상가|토지|주택/] },
  { label: "금융자산", patterns: [/금융\s*자산|예금|현금|주식|펀드|계좌/] },
  { label: "보험", patterns: [/보험/] }
];

const debtLabels = [
  { label: "담보대출 있음", patterns: [/담보대출|대출|근저당/] },
  { label: "임대보증금 있음", patterns: [/임대보증금|전세보증금|보증금/] }
];

export function parseConversationalInput(rawText: string): ConversationParseResult {
  const text = rawText.trim();
  if (!text) {
    return {
      status: "empty",
      assistantText: "편하게 한 줄만 적어줘도 됩니다. 예: 상속 준비, 배우자 있음, 자녀 2명, 부동산 42억, 금융자산 8억",
      facts: []
    };
  }

  const help = matchHelp(text);
  if (help) {
    return {
      status: "help",
      assistantText: help,
      facts: []
    };
  }

  const facts: ConversationCandidateFact[] = [
    ...extractPurposeFacts(text),
    ...extractFamilyFacts(text),
    ...extractAssetFacts(text),
    ...extractDebtFacts(text),
    ...extractGoalFacts(text),
    ...extractReviewFacts(text),
    ...extractTaxBaseFacts(text)
  ];

  if (facts.length === 0) {
    return {
      status: "help",
      assistantText: "아직 확정할 수 있는 사실은 못 찾았어요. 가족 수, 자산 종류, 금액처럼 상담에 필요한 단서를 한두 개만 더 적어주세요.",
      facts: []
    };
  }

  return {
    status: "candidate",
    assistantText: "제가 이렇게 이해했습니다. 맞는 사실만 개별 확정하고, 틀린 후보는 제외하거나 문장을 고쳐 다시 입력해 주세요.",
    facts: dedupeFacts(facts)
  };
}

export function getQuestionHelp(questionKey: string) {
  const help: Record<string, string> = {
    purpose: "첫 질문은 상속·증여·가업승계·양도 중 어떤 계산 트랙을 열지 정하는 단계예요. 잘 모르겠으면 여러 방법 비교로 둬도 됩니다.",
    family: "배우자와 자녀 정보는 상속공제·증여 수증자·가족회의 이해관계자를 나누기 위한 최소 단서예요. 성년 여부를 모르면 unknown으로 남깁니다.",
    assets: "자산 종류와 금액은 세액이 아니라 검토 범위를 잡는 입력입니다. 소유자가 불명확하면 작성자 재산으로 보지 않고 확인 필요로 남깁니다.",
    debt: "채무와 과거 증여는 부담부증여·10년 합산 검토에 영향을 줍니다. ‘없는 것 같아요’처럼 불확실하면 0원으로 확정하지 않습니다.",
    goal: "목표는 최대 3개까지 보존합니다. 절세, 유동성, 통제권, 형평성 중 가족회의에서 무엇을 먼저 볼지 정하기 위한 질문입니다.",
    review: "마지막 단계는 결과와 PDF에서 어떤 관점을 앞에 둘지 정합니다. 외부에서 확인된 과세표준이 있으면 좁은 범위의 산출세액만 계산합니다."
  };
  return help[questionKey] ?? "이 질문은 세액을 임의 계산하려는 것이 아니라, 다음에 확인해야 할 사실을 분리하기 위한 단계입니다.";
}

function matchHelp(text: string) {
  if (/왜|이유|뭐가\s*필요|왜\s*필요/.test(text)) {
    return "이 질문들은 세액을 바로 확정하려는 게 아니라, 어떤 세목과 시나리오를 볼지 나누기 위한 최소 단서예요. 실명·상세주소·연락처는 입력하지 않아도 됩니다.";
  }
  if (/금액.*모르|얼마인지.*모르|대략|정확/.test(text)) {
    return "정확한 금액을 모르면 ‘잘 모르겠음’을 선택해도 됩니다. 금액 범위는 범위로 보존하고, 확정 계산에는 쓰지 않습니다.";
  }
  if (/가업승계|회사승계|가업/.test(text) && /뭐|요건|방법/.test(text)) {
    return "가업·회사 승계는 지분평가, 후계자 경영참여, 사후관리 가능성이 핵심이에요. 지금 단계에서는 회사 지분 보유 여부와 후계자 참여 여부만 확인하면 됩니다.";
  }
  if (/최근.*증여|10년/.test(text) && /모르|왜|뭐/.test(text)) {
    return "최근 10년 증여는 상속·증여 계산에서 합산 여부가 문제될 수 있어요. 금액과 일자를 모르면 ‘있음, 금액 미확인’으로만 남깁니다.";
  }
  if (/자녀.*대신|대리|부모님.*대신/.test(text)) {
    return "자녀가 대신 입력해도 괜찮습니다. 다만 작성자와 실제 재산 소유자는 분리해서 확인해야 합니다.";
  }
  return null;
}

function extractPurposeFacts(text: string): ConversationCandidateFact[] {
  const matched = trackChoices.filter((item) => item.patterns.some((pattern) => pattern.test(text)));
  const choices = matched.length > 1 ? ["여러 방법 비교"] : matched.map((item) => item.choice);
  return choices.map((choice, index) => ({
    id: `purpose-${index}`,
    label: "준비 목적",
    value: choice,
    raw_text: text,
    confidence: matched.length > 1 ? "medium" : "high",
    target: { answerKey: "purpose", kind: "choice", choice }
  }));
}

function extractFamilyFacts(text: string): ConversationCandidateFact[] {
  const facts: ConversationCandidateFact[] = [];
  if (/배우자\s*없|배우자.*사망|이혼|사별/.test(text)) {
    facts.push(fact("family-spouse-no", "배우자 유무", "없음", text, { answerKey: "family", kind: "fact", label: "배우자 유무", value: "없음" }));
  } else if (/배우자|남편|아내/.test(text)) {
    facts.push(fact("family-spouse-yes", "배우자 유무", "있음", text, { answerKey: "family", kind: "fact", label: "배우자 유무", value: "있음" }));
  }

  const totalChildren = parseChildren(text);
  if (totalChildren !== null) {
    facts.push(fact("family-total-children", "자녀 수", totalChildren >= 3 ? "3명 이상(성년 여부 미상)" : `${totalChildren}명(성년 여부 미상)`, text, { answerKey: "family", kind: "fact", label: "자녀 수", value: totalChildren >= 3 ? "3명 이상" : `${totalChildren}명` }, "needs_confirmation"));
  }

  const adultChildren = parseSpecificChildren(text, /성년\s*자녀|성인\s*자녀/);
  if (adultChildren !== null) {
    facts.push(fact("family-adult-children", "성년 자녀 수", adultChildren >= 3 ? "3명 이상" : `${adultChildren}명`, text, { answerKey: "family", kind: "fact", label: "성년 자녀 수", value: adultChildren >= 3 ? "3명 이상" : `${adultChildren}명` }));
  }
  const minorChildren = parseSpecificChildren(text, /미성년\s*자녀|어린\s*자녀/);
  if (minorChildren !== null) {
    facts.push(fact("family-minor-children", "미성년 자녀 수", minorChildren >= 2 ? "2명 이상" : `${minorChildren}명`, text, { answerKey: "family", kind: "fact", label: "미성년 자녀 수", value: minorChildren >= 2 ? "2명 이상" : `${minorChildren}명` }));
  }

  if (/부모\s*1명|한\s*분|홀어머니|홀아버지/.test(text)) {
    facts.push(fact("family-one-parent", "가족 기준", "부모 1명 기준", text, { answerKey: "family", kind: "choice", choice: "부모 1명 기준" }));
  } else if (/부모\s*2명|두\s*분|부모님\s*두\s*분/.test(text)) {
    facts.push(fact("family-two-parents", "가족 기준", "부모 2명 기준", text, { answerKey: "family", kind: "choice", choice: "부모 2명 기준" }));
  }

  return facts;
}

function extractAssetFacts(text: string): ConversationCandidateFact[] {
  const mentions = findAssetMentions(text);
  const facts: ConversationCandidateFact[] = [];

  for (const mention of mentions) {
    const amount = moneyForAssetMention(text, mention, mentions);
    const quantity = parseAssetQuantity(text, mention);
    const target: Extract<ConversationFactTarget, { answerKey: "assets"; kind: "choice" }> = {
      answerKey: "assets",
      kind: "choice",
      choice: mention.definition.label,
      quantity
    };

    let value = quantity ? `${mention.definition.label} ${quantity}개` : `${mention.definition.label} 확인`;
    let confidence: ConversationCandidateFact["confidence"] = "medium";

    if (amount?.kind === "confirmed") {
      target.amount = String(amount.valueEok);
      target.amountWon = amount.valueWon;
      target.amountStatus = "confirmed";
      value = `${mention.definition.label} ${formatEokLabel(amount.valueEok)}`;
      confidence = "high";
    } else if (amount?.kind === "range") {
      target.amountStatus = "range";
      target.range = amount.range;
      value = `${mention.definition.label} ${amount.range.label} 범위(확정값 아님)`;
    } else if (amount?.kind === "needs_confirmation") {
      target.amountStatus = "needs_confirmation";
      value = `${mention.definition.label} 금액 단위 확인 필요`;
      confidence = "needs_confirmation";
    } else {
      target.amountStatus = "unknown";
      value = quantity ? `${mention.definition.label} ${quantity}개, 금액 미상` : `${mention.definition.label} 금액 확인 필요`;
    }

    facts.push(fact(`asset-${mention.definition.label}-${mention.start}`, "자산", value, text, target, confidence));
  }

  const owner = extractOwnerSignal(text);
  if (owner) {
    facts.push(fact("asset-owner-relation", "소유자 관계", owner, text, { answerKey: "assets", kind: "fact", label: "소유자 관계", value: owner }, "needs_confirmation"));
  }

  return facts;
}

function extractDebtFacts(text: string): ConversationCandidateFact[] {
  if (/채무\s*없(?:음|습니다)?|대출\s*없(?:음|습니다)?|보증금\s*없(?:음|습니다)?|빚\s*없(?:음|습니다)?/.test(text) && !/같|아마|듯|모르|확실/.test(text)) {
    return [fact("debt-none", "채무·과거 증여", "해당 없음", text, { answerKey: "debt", kind: "choice", choice: "해당 없음" })];
  }

  const facts: ConversationCandidateFact[] = [];
  if (/(채무|대출|보증금|빚).*(없.*같|없는\s*듯|아마\s*없|확실.*않|잘\s*모르)/.test(text)) {
    return [fact("debt-unknown-none", "채무 여부", "채무 미확정(없을 가능성)", text, { answerKey: "debt", kind: "choice", choice: "잘 모르겠음", amountStatus: "unknown" }, "needs_confirmation")];
  }

  for (const debt of debtLabels) {
    const match = firstPatternMatch(text, debt.patterns);
    if (!match) continue;
    const amount = moneyAfterAnchorBeforeNextDebt(text, match.end);
    const target: Extract<ConversationFactTarget, { answerKey: "debt"; kind: "choice" }> = {
      answerKey: "debt",
      kind: "choice",
      choice: debt.label,
      amountStatus: amount ? "confirmed" : "unknown"
    };
    if (amount && amount.parsed.status === "parsed") {
      target.amount = String(amount.parsed.value_eok);
      target.amountWon = amount.parsed.value_won;
    }
    facts.push(fact(`debt-${debt.label}`, "채무", amount ? `${debt.label} ${formatEokLabel(amount.parsed.value_eok)}` : `${debt.label} 금액 확인 필요`, text, target, amount ? "high" : "needs_confirmation"));
  }

  if (/최근\s*10년|10년|증여\s*받|증여\s*한/.test(text)) {
    facts.push(fact("past-gift", "과거 증여", "최근 10년 증여 있음", text, { answerKey: "debt", kind: "choice", choice: "최근 10년 증여 있음" }));
  }

  return facts;
}

function extractGoalFacts(text: string): ConversationCandidateFact[] {
  const candidates: Array<[string, RegExp]> = [
    ["상속세 납부재원 준비", /납부재원|현금\s*부족|세금\s*낼/],
    ["일부를 미리 이전", /미리|생전|일부.*이전|먼저\s*주/],
    ["자산을 매각해 현금화", /매각|팔아서|현금화/],
    ["가족법인 활용", /가족법인|법인\s*활용/],
    ["현재 구조 유지", /유지|그대로/]
  ];
  return candidates
    .filter(([, pattern]) => pattern.test(text))
    .slice(0, 3)
    .map(([choice], index) => fact(`goal-${index}`, "승계 목표", choice, text, { answerKey: "goal", kind: "choice", choice }));
}

function extractReviewFacts(text: string): ConversationCandidateFact[] {
  const candidates: Array<[string, RegExp]> = [
    ["세금·비용", /세금|비용|절세/],
    ["즉시 필요현금", /즉시.*현금|현금.*필요/],
    ["부모 통제권", /통제권|경영권|의사결정권/],
    ["자녀 이전효과", /자녀.*이전|형평/],
    ["납부재원 부족액", /부족액|납부재원/]
  ];
  return candidates
    .filter(([, pattern]) => pattern.test(text))
    .slice(0, 3)
    .map(([choice], index) => fact(`review-${index}`, "결과 관점", choice, text, { answerKey: "review", kind: "choice", choice }));
}

function extractTaxBaseFacts(text: string): ConversationCandidateFact[] {
  if (!/과세표준/.test(text)) return [];
  const facts: ConversationCandidateFact[] = [];
  const baseline = extractTaxBaseNear(text, /기준(?:안)?|현재|상속/);
  const alternative = extractTaxBaseNear(text, /대안|단계|일부|증여안|시나리오/);
  const taxKind: Extract<TaxKind, "inheritance_tax" | "gift_tax"> = /증여/.test(text) && !/상속/.test(text) ? "gift_tax" : "inheritance_tax";

  if (baseline && baseline.parsed.status === "parsed") {
    facts.push(fact("tax-base-baseline", "확인 과세표준", `기준안 ${formatEokLabel(baseline.parsed.value_eok)}`, text, {
      answerKey: "review",
      kind: "tax_base",
      scenarioId: "baseline",
      taxKind,
      amount: String(baseline.parsed.value_eok),
      amountWon: baseline.parsed.value_won
    }));
  }
  if (alternative && alternative.parsed.status === "parsed") {
    facts.push(fact("tax-base-alternative", "확인 과세표준", `우선 대안 ${formatEokLabel(alternative.parsed.value_eok)}`, text, {
      answerKey: "review",
      kind: "tax_base",
      scenarioId: taxKind === "gift_tax" ? "gift-stepwise-transfer" : "inheritance-spouse-allocation",
      taxKind,
      amount: String(alternative.parsed.value_eok),
      amountWon: alternative.parsed.value_won
    }));
  }
  return facts;
}

type AssetMention = {
  definition: AssetDefinition;
  start: number;
  end: number;
};

function findAssetMentions(text: string): AssetMention[] {
  const mentions: AssetMention[] = [];
  for (const definition of assetDefinitions) {
    const found = firstPatternMatch(text, definition.patterns);
    if (!found) continue;
    mentions.push({
      definition,
      start: found.start,
      end: found.end
    });
  }
  return mentions.sort((a, b) => a.start - b.start);
}

function moneyForAssetMention(text: string, mention: AssetMention, allMentions: AssetMention[]) {
  const nextAsset = allMentions.find((item) => item.start > mention.start);
  const windowEnd = nextAsset?.start ?? text.length;
  const ranges = extractMoneyRanges(text).filter((range) => range.start >= mention.end && range.end <= windowEnd);
  const range = ranges.find((item) => item.parsed.status === "range");
  if (range && range.parsed.status === "range") {
    return {
      kind: "range" as const,
      range: {
        min_won: range.parsed.min_won,
        max_won: range.parsed.max_won,
        label: range.parsed.normalized_label
      }
    };
  }

  const confirmed = extractMoneyMentions(text).find((money) => money.start >= mention.end && money.end <= windowEnd && money.parsed.status === "parsed");
  if (confirmed && confirmed.parsed.status === "parsed") {
    return { kind: "confirmed" as const, valueEok: confirmed.parsed.value_eok, valueWon: confirmed.parsed.value_won };
  }

  const unitlessBetween = text.slice(mention.end, windowEnd).match(/\d+(?:\.\d+)?/);
  if (unitlessBetween) return { kind: "needs_confirmation" as const };
  return null;
}

function moneyAfterAnchorBeforeNextDebt(text: string, anchorEnd: number) {
  const nextDebtStart = debtLabels
    .flatMap((debt) => debt.patterns.map((pattern) => {
      const sliced = text.slice(anchorEnd);
      const match = sliced.match(pattern);
      return match?.index === undefined ? null : anchorEnd + match.index;
    }))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b)[0] ?? text.length;

  return extractMoneyMentions(text).find((money) => money.start >= anchorEnd && money.end <= nextDebtStart && money.parsed.status === "parsed") ?? null;
}

function parseAssetQuantity(text: string, mention: AssetMention) {
  const windowText = text.slice(mention.start, Math.min(text.length, mention.end + 12));
  if (/두\s*채|2\s*채|둘/.test(windowText)) return 2;
  if (/세\s*채|3\s*채|셋/.test(windowText)) return 3;
  const match = windowText.match(/(\d+)\s*(?:채|개|건)/);
  return match ? Number(match[1]) : undefined;
}

function extractOwnerSignal(text: string) {
  if (/아버지|부친|아빠/.test(text)) return "아버지 재산 — 작성자와 실제 소유자 확인 필요";
  if (/어머니|모친|엄마/.test(text)) return "어머니 재산 — 작성자와 실제 소유자 확인 필요";
  if (/부모님|부모\s*재산/.test(text)) return "부모님 재산 — 실제 소유자와 지분 확인 필요";
  if (/배우자\s*재산|남편\s*재산|아내\s*재산/.test(text)) return "배우자 재산 — 실제 소유자와 지분 확인 필요";
  return null;
}

function extractTaxBaseNear(text: string, anchorPattern: RegExp) {
  const anchor = text.match(anchorPattern);
  if (!anchor || anchor.index === undefined) return null;
  const windowTextStart = anchor.index;
  const windowTextEnd = Math.min(text.length, windowTextStart + 42);
  return extractMoneyMentions(text).find((money) => money.start >= windowTextStart && money.end <= windowTextEnd && money.parsed.status === "parsed") ?? null;
}

function parseChildren(text: string) {
  const numeric = text.match(/자녀\s*(\d+)/);
  if (numeric) return Number(numeric[1]);
  if (/자녀\s*(한|1)\s*명|외동/.test(text)) return 1;
  if (/자녀\s*(둘|두|2)\s*명?/.test(text)) return 2;
  if (/자녀\s*(셋|세|3)\s*명?/.test(text)) return 3;
  return null;
}

function parseSpecificChildren(text: string, prefix: RegExp) {
  const match = text.match(new RegExp(`${prefix.source}\\s*(\\d+)`));
  if (match) return Number(match[1]);
  return null;
}

function firstPatternMatch(text: string, patterns: RegExp[]) {
  const matches = patterns
    .map((pattern) => {
      const match = text.match(pattern);
      if (!match || match.index === undefined) return null;
      return { raw: match[0], start: match.index, end: match.index + match[0].length };
    })
    .filter((value): value is { raw: string; start: number; end: number } => value !== null)
    .sort((a, b) => a.start - b.start);
  return matches[0] ?? null;
}

function fact(
  id: string,
  label: string,
  value: string,
  rawText: string,
  target: ConversationFactTarget,
  confidence: ConversationCandidateFact["confidence"] = "high"
): ConversationCandidateFact {
  return {
    id,
    label,
    value,
    raw_text: rawText,
    confidence,
    target
  };
}

function dedupeFacts(facts: ConversationCandidateFact[]) {
  const seen = new Set<string>();
  return facts.filter((item) => {
    const key = `${item.label}:${item.value}:${JSON.stringify(item.target)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
