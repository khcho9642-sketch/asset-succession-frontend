import { extractMoneyMentions, formatEokLabel } from "./money";

export type ConversationFactTarget =
  | { answerKey: "purpose"; kind: "choice"; choice: string }
  | { answerKey: "family"; kind: "choice"; choice: string }
  | { answerKey: "family"; kind: "fact"; label: string; value: string }
  | { answerKey: "assets"; kind: "choice"; choice: string; amount?: string }
  | { answerKey: "debt"; kind: "choice"; choice: string; amount?: string }
  | { answerKey: "goal"; kind: "choice"; choice: string }
  | { answerKey: "review"; kind: "choice"; choice: string };

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

const trackChoices: Array<{ choice: string; patterns: RegExp[] }> = [
  { choice: "상속", patterns: [/상속|상속세|사후|돌아가시면/] },
  { choice: "증여", patterns: [/증여|생전\s*이전|미리\s*주/] },
  { choice: "가업·회사 승계", patterns: [/가업|회사|법인|비상장|지분|승계/] },
  { choice: "양도", patterns: [/양도|매각|팔(?:고|아서|면)|처분/] }
];

const assetLabels = [
  { label: "부동산", patterns: [/부동산|아파트|건물|상가|토지|주택/] },
  { label: "금융자산", patterns: [/금융|예금|현금|주식|펀드|계좌/] },
  { label: "법인지분", patterns: [/법인\s*지분|비상장\s*주식|회사\s*지분/] },
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
    ...extractReviewFacts(text)
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
    assistantText: "제가 이렇게 이해했습니다. 맞으면 ‘맞아요’를 눌러 확정하고, 틀리면 문장을 고쳐서 다시 입력해 주세요.",
    facts
  };
}

function matchHelp(text: string) {
  if (/왜|이유|뭐가\s*필요|왜\s*필요/.test(text)) {
    return "이 질문들은 세액을 바로 확정하려는 게 아니라, 어떤 세목과 시나리오를 볼지 나누기 위한 최소 단서예요. 실명·상세주소·연락처는 입력하지 않아도 됩니다.";
  }
  if (/금액.*모르|얼마인지.*모르|대략|정확/.test(text)) {
    return "정확한 금액을 모르면 ‘잘 모르겠음’을 선택해도 됩니다. 다만 계산 화면에 숫자를 만들려면 억원 단위의 확인 금액이 필요해요.";
  }
  if (/가업승계|회사승계|가업/.test(text) && /뭐|요건|방법/.test(text)) {
    return "가업·회사 승계는 지분평가, 후계자 경영참여, 사후관리 가능성이 핵심이에요. 지금 단계에서는 회사 지분 보유 여부와 후계자 참여 여부만 확인하면 됩니다.";
  }
  if (/최근.*증여|10년/.test(text) && /모르|왜|뭐/.test(text)) {
    return "최근 10년 증여는 상속·증여 계산에서 합산 여부가 문제될 수 있어요. 금액과 일자를 모르면 ‘있음, 금액 미확인’으로만 남깁니다.";
  }
  if (/자녀.*대신|대리|부모님.*대신/.test(text)) {
    return "자녀가 대신 입력해도 괜찮습니다. 다만 가족이 공유할 수 있는 비식별 시나리오만 만들고, 실제 개인정보는 상담 단계 전까지 넣지 않는 게 안전해요.";
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

  const children = parseChildren(text);
  if (children !== null) {
    facts.push(fact("family-children", "성년 자녀 수", children >= 3 ? "3명 이상" : `${children}명`, text, { answerKey: "family", kind: "fact", label: "성년 자녀 수", value: children >= 3 ? "3명 이상" : `${children}명` }));
    facts.push(fact("family-minor-children", "미성년 자녀 수", "0명", text, { answerKey: "family", kind: "fact", label: "미성년 자녀 수", value: "0명" }));
  }

  if (/부모\s*1명|한\s*분|홀어머니|홀아버지/.test(text)) {
    facts.push(fact("family-one-parent", "가족 기준", "부모 1명 기준", text, { answerKey: "family", kind: "choice", choice: "부모 1명 기준" }));
  } else if (/부모\s*2명|두\s*분|부모님/.test(text) || facts.some((item) => item.label === "배우자 유무")) {
    facts.push(fact("family-two-parents", "가족 기준", "부모 2명 기준", text, { answerKey: "family", kind: "choice", choice: "부모 2명 기준" }));
  }

  return facts;
}

function extractAssetFacts(text: string): ConversationCandidateFact[] {
  return assetLabels.flatMap((asset) => {
    if (!asset.patterns.some((pattern) => pattern.test(text))) return [];
    const mention = nearestMoneyAfter(text, asset.patterns);
    const amount = mention?.parsed.status === "parsed" ? String(mention.parsed.value_eok) : undefined;
    const value = amount ? `${asset.label} ${formatEokLabel(Number(amount))}` : `${asset.label} 금액 확인 필요`;
    return [fact(`asset-${asset.label}`, "자산", value, text, { answerKey: "assets", kind: "choice", choice: asset.label, amount })];
  });
}

function extractDebtFacts(text: string): ConversationCandidateFact[] {
  if (/채무\s*없|대출\s*없|보증금\s*없|빚\s*없/.test(text)) {
    return [fact("debt-none", "채무·과거 증여", "해당 없음", text, { answerKey: "debt", kind: "choice", choice: "해당 없음" })];
  }

  const debtFacts = debtLabels.flatMap((debt) => {
    if (!debt.patterns.some((pattern) => pattern.test(text))) return [];
    const mention = nearestMoneyAfter(text, debt.patterns);
    const amount = mention?.parsed.status === "parsed" ? String(mention.parsed.value_eok) : undefined;
    const value = amount ? `${debt.label} ${formatEokLabel(Number(amount))}` : `${debt.label} 금액 확인 필요`;
    return [fact(`debt-${debt.label}`, "채무", value, text, { answerKey: "debt", kind: "choice", choice: debt.label, amount })];
  });

  if (/최근\s*10년|10년|증여\s*받|증여\s*한/.test(text)) {
    debtFacts.push(fact("past-gift", "과거 증여", "최근 10년 증여 있음", text, { answerKey: "debt", kind: "choice", choice: "최근 10년 증여 있음" }));
  }

  return debtFacts;
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
    .slice(0, 2)
    .map(([choice], index) => fact(`review-${index}`, "결과 관점", choice, text, { answerKey: "review", kind: "choice", choice }));
}

function nearestMoneyAfter(text: string, patterns: RegExp[]) {
  const patternIndexes = patterns
    .map((pattern) => {
      const match = text.match(pattern);
      return match?.index ?? -1;
    })
    .filter((index) => index >= 0);
  if (patternIndexes.length === 0) return null;
  const anchor = Math.min(...patternIndexes);
  const mentions = extractMoneyMentions(text).filter((mention) => mention.start >= anchor);
  return mentions[0] ?? null;
}

function parseChildren(text: string) {
  const numeric = text.match(/자녀\s*(\d+)/);
  if (numeric) return Number(numeric[1]);
  if (/자녀\s*(한|1)\s*명|외동/.test(text)) return 1;
  if (/자녀\s*(둘|두|2)\s*명?/.test(text)) return 2;
  if (/자녀\s*(셋|세|3)\s*명?/.test(text)) return 3;
  return null;
}

function fact(id: string, label: string, value: string, rawText: string, target: ConversationFactTarget): ConversationCandidateFact {
  return {
    id,
    label,
    value,
    raw_text: rawText,
    confidence: "high",
    target
  };
}
