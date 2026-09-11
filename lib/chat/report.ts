import { createAssessmentId, type AssessmentAnswer, type AssessmentSnapshot } from "../assessment";
import { parseKoreanMoneyRangeToEok, parseKoreanMoneyToEok } from "../phase2b/money";
import { CHAT_ASSET_KEYS, CHAT_FIELD_KEYS, CHAT_FIELD_LABELS, getCurrentFactSources, getMissingRequiredFields, getPendingFactSources, validateChatState, type ChatFieldKey, type ChatState } from "./intake";
import { getAssistantReply } from "./choices";

export type ChatAmount =
  | { status: "confirmed"; value_eok: number; value_won: number; label: string }
  | { status: "range"; min_eok: number; max_eok: number; min_won: number; max_won: number; label: string }
  | { status: "unknown" | "needs_confirmation"; value_eok: null; value_won: null; label: string; reason: string };

const MONEY_PATTERN = /\d+(?:\.\d+)?\s*억(?:원)?(?:\s*\d+(?:\.\d+)?\s*(?:천\s*만|만)(?:원)?)?|\d+(?:\.\d+)?\s*(?:천\s*만|만)(?:원)?/g;
const UNKNOWN_PATTERN = /모르|모름|미정|미입력|미확인|불명|확인\s*필요|미상|unknown|모름/i;

function unresolved(raw: string, reason: string, status: "unknown" | "needs_confirmation" = "needs_confirmation"): ChatAmount {
  return { status, value_eok: null, value_won: null, label: raw || "모름", reason };
}

function confirmed(won: number): ChatAmount {
  return { status: "confirmed", value_eok: won / 100_000_000, value_won: won, label: `${won / 100_000_000}억` };
}

function explicitNone(raw: string) {
  return /^(?:(?:채무|빚|대출|담보대출|임대보증금|부동산|금융자산|금융|법인지분|사업자산|기타\s*자산|과거\s*증여|증여)(?:은|는|이|가)?\s*[:：]?\s*)?(?:없음|없어요|없습니다|없다|전혀\s*없음|해당\s*없음|0\s*(?:원|억(?:원)?|만(?:원)?)?)\s*[.!]?$/i.test(raw.trim());
}

/** Conservative money parsing around the existing unit parser. A total is never added to its parts. */
export function parseChatAmount(value: string): ChatAmount {
  const raw = value.trim().replace(/(\d),(?=\d{3}(?:\D|$))/g, "$1");
  if (!raw || UNKNOWN_PATTERN.test(raw)) return unresolved(value, "금액을 확인하지 않았습니다.", "unknown");
  if (explicitNone(raw)) return confirmed(0);
  if (/마이너스|음수|−|(^|\s)-\s*\d/.test(raw)) return unresolved(value, "음수 금액은 지원하지 않습니다.");
  if (/약|대략|정도|쯤|내외|이상|이하|초과|미만|가량|추정|예상|최소|최대|또는|혹은|아니라|아니고|취득가|매입가|공시가|과세표준|세금|대출|채무|보증금|각각?\s*\d|각\s*\d|\d+\s*(?:%|퍼센트)|절반/.test(raw)) return unresolved(value, "추정·조건·차감·지분·여러 평가기준이 포함되어 금액 확인이 필요합니다.");
  const range = parseKoreanMoneyRangeToEok(raw);
  if (range.status === "range") {
    const rangeText = raw.match(/\d+(?:\.\d+)?\s*(?:억(?:원)?|천\s*만(?:원)?|만(?:원)?)?\s*(?:~|〜|부터|에서|-)\s*\d+(?:\.\d+)?\s*(?:억(?:원)?|천\s*만(?:원)?|만(?:원)?)?/)?.[0] ?? "";
    const remainder = raw.replace(rangeText, "");
    if (/\d/.test(remainder) || /[~〜]/.test(remainder)) return unresolved(value, "범위 외의 금액이 함께 있어 합계를 확인해야 합니다.");
    return { status: "range", min_eok: range.min_eok, max_eok: range.max_eok, min_won: range.min_won, max_won: range.max_won, label: range.normalized_label };
  }
  if (range.status === "invalid" || /[~〜–—-]/.test(raw)) return unresolved(value, "범위 또는 음수 표현을 확인해야 합니다.");
  const matches = [...raw.matchAll(MONEY_PATTERN)];
  if (matches.length === 0) return unresolved(value, "억원·만원 등 단위가 명시된 금액이 필요합니다.");
  const amounts = matches.map((match) => parseKoreanMoneyToEok(match[0], { allowZero: true }));
  if (amounts.some((amount) => amount.status !== "parsed")) return unresolved(value, "지원하지 않는 금액 표현입니다.");
  const wons = amounts.map((amount) => amount.status === "parsed" ? amount.value_won : 0);
  const remainder = raw.replace(MONEY_PATTERN, "");
  // Other digits may be an omitted unit, quantity, old valuation, or multiplied amount.
  if (/\d/.test(remainder) || /[×*÷/]|조(?:원)?|달러|USD|KRW|평균|매년|매월|연간|월간|씩/.test(remainder)) return unresolved(value, "다른 숫자·단위·수량이 포함되어 확인이 필요합니다.");
  if (matches.length === 1) return Number.isSafeInteger(wons[0]) ? confirmed(wons[0]) : unresolved(value, "지원 가능한 금액 범위를 넘었습니다.");

  const labels = matches.map((match, index) => raw.slice(index === 0 ? 0 : (matches[index - 1].index ?? 0) + matches[index - 1][0].length, match.index ?? 0).replace(/^[\s,;:+()·\n]+|[\s:]+$/g, "").trim());
  const totals = labels.map((label, index) => /총(?:자산|액|합)?|합계|합산/.test(label) ? index : -1).filter((index) => index >= 0);
  if (totals.length > 0) {
    if (totals.length !== 1) return unresolved(value, "여러 합계 금액이 있어 확인이 필요합니다.");
    const totalIndex = totals[0];
    const componentSum = wons.reduce((sum, won, index) => sum + (index === totalIndex ? 0 : won), 0);
    return componentSum === wons[totalIndex] ? confirmed(wons[totalIndex]) : unresolved(value, "합계와 개별 금액이 일치하지 않거나 중복될 수 있습니다.");
  }
  const explicitAddition = matches.slice(1).every((match, index) => /\+/.test(raw.slice((matches[index].index ?? 0) + matches[index][0].length, match.index ?? 0)));
  const itemLabels = labels.map((label) => label
    .replace(/그리고|추가로?|별도로?|또한|또|있고|있어요|입니다/g, "")
    .replace(/(아파트|상가|토지|주택|빌딩|오피스텔|예금|적금|주식|펀드|채권|현금|부동산|금융자산|건물)(?:은|는|이|가|에|도)?/g, "$1")
    .replace(/[\s,;:+()·]/g, ""));
  const labeledInventory = itemLabels.every((label) => /아파트|상가|토지|주택|빌딩|오피스텔|예금|적금|주식|펀드|채권|현금|부동산|금융|자산|건물/.test(label)) && new Set(itemLabels).size === itemLabels.length;
  if (!explicitAddition && !labeledInventory) return unresolved(value, "여러 금액이 별도 자산인지, 정정 또는 중복인지 확인해야 합니다.");
  const sum = wons.reduce((total, won) => total + won, 0);
  return Number.isSafeInteger(sum) ? confirmed(sum) : unresolved(value, "지원 가능한 금액 범위를 넘었습니다.");
}

function spouseValue(raw?: string): string | undefined {
  if (!raw) return undefined;
  if (UNKNOWN_PATTERN.test(raw)) return "모름";
  if (explicitNone(raw.replace(/^(?:소유자의?\s*)?배우자(?:은|는|이|가)?\s*/, "")) || /^(?:미혼|이혼|사별)(?:입니다|했어요)?[.!]?$/.test(raw)) return "없음";
  if (/^(?:배우자(?:은|는|이|가)?\s*)?(?:있음|있어요|있습니다|있다|1\s*명)[.!]?$/.test(raw.trim())) return "있음";
  return "확인 필요";
}

function childCount(raw?: string): string | undefined {
  if (!raw || UNKNOWN_PATTERN.test(raw)) return undefined;
  const cleaned = raw.replace(/^(?:소유자의?\s*)?(?:(?:성년|성인|미성년)\s*)?(?:자녀|아이|아들|딸)(?:은|는|이|가)?\s*[:：]?\s*/, "").trim();
  if (explicitNone(cleaned)) return "0명";
  const match = cleaned.match(/^(\d{1,2})\s*명?(?:이에요|입니다|이요|있어요)?[.!]?$/);
  if (match) return `${Number(match[1])}명`;
  const korean = cleaned.match(/^(한|하나|두|둘|세|셋|네|넷|다섯|여섯|일곱|여덟|아홉|열)\s*명?(?:이에요|입니다|이요|있어요)?[.!]?$/);
  const counts: Record<string, number> = { 한: 1, 하나: 1, 두: 2, 둘: 2, 세: 3, 셋: 3, 네: 4, 넷: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10 };
  return korean ? `${counts[korean[1]]}명` : undefined;
}

const ASSET_LABELS = { realEstate: "부동산", financialAssets: "금융자산", businessAssets: "법인지분", otherAssets: "기타자산" } as const;
const ASSET_WORDS = {
  realEstate: /부동산|건물|아파트|상가|주택|토지|오피스텔|빌딩/g,
  financialAssets: /금융\s*자산|예금|적금|현금|펀드|주식|채권/g,
  businessAssets: /법인\s*지분|비상장\s*주식|회사\s*지분|사업\s*자산/g,
  otherAssets: /기타\s*자산/g
} as const;
const DEBT_WORDS = /담보\s*대출|은행\s*대출|금융\s*대출|임대\s*보증금|전세\s*보증금|보증금|대출|채무|빚/g;

export function parseAssetAmount(key: typeof CHAT_ASSET_KEYS[number], state: ChatState): ChatAmount {
  const fact = state.facts[key]!;
  const remainder = fact.value.replace(ASSET_WORDS[key], "");
  if (CHAT_ASSET_KEYS.some((otherKey) => otherKey !== key && remainder.match(ASSET_WORDS[otherKey]))) return unresolved(fact.value, "다른 자산 종류의 금액이 함께 있어 중복 합산하지 않습니다.");
  const isPartialCorrection = fact.sources?.slice(1).some((source) => {
    const message = state.messages.find((item) => item.id === source.messageId);
    return message && /정정|수정|정확히는|아니라|아니고|잘못|변경|고칠|바꿀|대신|다시\s*입력/.test(message.text);
  });
  if (isPartialCorrection) return unresolved(fact.value, "여러 자산 중 일부의 정정입니다. 이 자산 종류의 전체 내역을 정보 확인에서 수정해 주세요.");
  return parseChatAmount(fact.value);
}

function debtChoiceFor(raw: string) {
  if (/임대\s*보증금|전세\s*보증금|보증금/.test(raw)) return "임대보증금 있음";
  if (/담보\s*대출/.test(raw)) return "담보대출 있음";
  if (/은행|금융|대출|채무|빚/.test(raw)) return "기타채무 있음";
  return null;
}

function addDebtAmount(answer: AssessmentAnswer, choice: string, parsed: Extract<ChatAmount, { status: "confirmed" }>) {
  if (!answer.choices.includes(choice)) answer.choices.push(choice);
  if (parsed.value_won <= 0) return;
  const previousWon = answer.debtAmountWons?.[choice] ?? 0;
  const nextWon = previousWon + parsed.value_won;
  answer.debtAmounts = { ...(answer.debtAmounts ?? {}), [choice]: String(nextWon / 100_000_000) };
  answer.debtAmountWons = { ...(answer.debtAmountWons ?? {}), [choice]: nextWon };
}

function populateDebtAnswer(answer: AssessmentAnswer, state: ChatState) {
  const debtFact = state.facts.debt;
  if (!debtFact) return;
  const debtRaw = debtFact.value;
  answer.detail = debtRaw;
  answer.facts!["채무 원문"] = debtRaw;
  const pendingDebtSources = getPendingFactSources(debtFact);
  if (pendingDebtSources.length === 0 && explicitNone(debtRaw)) {
    answer.choices.push("해당 없음");
    answer.facts!["채무 여부"] = "없음";
    return;
  }

  answer.facts!["채무 여부"] = "확인 필요";
  const debtSources = getCurrentFactSources(debtFact);
  let matchedDebtCount = 0;
  let confirmedDebtCount = 0;
  debtSources.forEach((source, index) => {
    const raw = source.value;
    const choice = debtChoiceFor(raw);
    if (!choice) return;
    matchedDebtCount += 1;
    answer.facts![`채무 항목 ${index + 1}`] = raw;
    if (pendingDebtSources.length === 0) {
      const parsed = parseChatAmount(raw.replace(DEBT_WORDS, ""));
      if (parsed.status === "confirmed") {
        confirmedDebtCount += 1;
        addDebtAmount(answer, choice, parsed);
      }
    }
  });
  if (pendingDebtSources.length > 0) {
    answer.facts!["채무 정정 확인 필요"] = pendingDebtSources.map((source) => source.value).join("\n");
    return;
  }

  if (matchedDebtCount === 0) {
    const choice = debtChoiceFor(debtRaw);
    if (choice) {
      const parsed = parseChatAmount(debtRaw.replace(DEBT_WORDS, ""));
      if (!answer.choices.includes(choice)) answer.choices.push(choice);
      if (parsed.status === "confirmed") {
        confirmedDebtCount += 1;
        addDebtAmount(answer, choice, parsed);
      }
    }
  }
  if (confirmedDebtCount > 0) answer.facts!["채무 여부"] = "있음";
}

function populatePastGiftsAnswer(answer: AssessmentAnswer, state: ChatState) {
  const giftFact = state.facts.pastGifts;
  if (!giftFact) return;
  const giftRaw = giftFact.value;
  answer.facts!["과거 증여 상세"] = giftRaw;
  const pendingGiftSources = getPendingFactSources(giftFact);
  if (pendingGiftSources.length > 0) answer.facts!["과거 증여 확인 필요"] = pendingGiftSources.map((source) => source.value).join("\n");
  if (explicitNone(giftRaw) || !giftRaw) return;
  if (!answer.choices.includes("최근 10년 증여 있음")) answer.choices.push("최근 10년 증여 있음");
  const giftSources = getCurrentFactSources(giftFact);
  giftSources.forEach((source, index) => {
    answer.facts![`과거 증여 항목 ${index + 1}`] = source.value;
  });
}

/** Call only from the customer's explicit final confirmation action, never from an AI reply. */
export function buildConfirmedAssessmentSnapshot(
  state: ChatState,
  confirmation: { confirmed: true; confirmedAt: string; assessmentId?: string }
): AssessmentSnapshot {
  if (confirmation?.confirmed !== true || !Number.isFinite(Date.parse(confirmation.confirmedAt))) throw new Error("고객의 명시적인 정보 확인이 필요합니다.");
  const validated = validateChatState(state);
  if (!validated) throw new Error("대화 정보와 원문 근거를 확인할 수 없습니다.");
  if (getMissingRequiredFields(validated).length > 0) throw new Error("재산 소유자와 주요 자산 정보를 먼저 입력해 주세요.");
  const facts = validated.facts;
  const raw = (key: ChatFieldKey) => facts[key]?.value;
  const purpose: AssessmentAnswer = { label: "준비 목적", choices: [], detail: raw("topic") ?? "미입력", facts: { "준비 시기": raw("timing") ?? "모름" } };
  const topic = raw("topic") ?? "";
  if (/상속/.test(topic)) purpose.choices.push("상속");
  if (/증여/.test(topic)) purpose.choices.push("증여");
  if (/가업|회사\s*승계/.test(topic)) purpose.choices.push("가업·회사 승계");
  if (/양도|매각/.test(topic)) purpose.choices.push("양도");
  const familyFacts: Record<string, string> = {};
  const spouse = spouseValue(raw("spouse"));
  if (spouse) familyFacts["배우자 유무"] = spouse;
  for (const [key, label] of [["children", "자녀 수"], ["adultChildren", "성년 자녀 수"], ["minorChildren", "미성년 자녀 수"]] as const) {
    const count = childCount(raw(key));
    if (count !== undefined) familyFacts[label] = count;
    else if (raw(key)) familyFacts[`${label} 원문`] = raw(key)!;
  }
  // Supplying only one age group would make the legacy normalizer infer a total from an incomplete group.
  // Keep the raw statement, but only normalize age counts when both groups were explicitly supplied.
  if (!familyFacts["성년 자녀 수"] || !familyFacts["미성년 자녀 수"]) {
    for (const label of ["성년 자녀 수", "미성년 자녀 수"]) {
      if (familyFacts[label]) familyFacts[`${label} 원문`] = familyFacts[label];
      delete familyFacts[label];
    }
  }
  const family: AssessmentAnswer = { label: "가족", choices: [], facts: familyFacts };
  const assets: AssessmentAnswer = { label: "자산", choices: [], facts: { "소유자 관계": raw("owner") ?? "모름" }, assetAmounts: {}, assetAmountWons: {}, assetAmountStatus: {}, assetAmountRanges: {} };
  for (const key of CHAT_ASSET_KEYS) {
    const value = raw(key);
    if (!value) continue;
    const label = ASSET_LABELS[key];
    const parsed = parseAssetAmount(key, validated);
    assets.facts![`${label} 원문`] = value;
    assets.assetAmountStatus![label] = parsed.status;
    if (parsed.status === "confirmed" && parsed.value_won === 0) {
      assets.facts![`${label} 유무`] = "없음 (직접 확인)";
      continue;
    }
    assets.choices.push(label);
    if (parsed.status === "confirmed") {
      assets.assetAmounts![label] = String(parsed.value_eok);
      assets.assetAmountWons![label] = parsed.value_won;
    } else if (parsed.status === "range") {
      assets.assetAmounts![label] = "";
      assets.assetAmountRanges![label] = { min_won: parsed.min_won, max_won: parsed.max_won, label: parsed.label };
    } else {
      // Blank amount participates in the legacy completeness check; it is never zero.
      assets.assetAmounts![label] = "";
    }
  }
  const debt: AssessmentAnswer = { label: "채무·과거 증여", choices: [], facts: {}, detail: "채무 미확인" };
  populateDebtAnswer(debt, validated);
  populatePastGiftsAnswer(debt, validated);
  const goal: AssessmentAnswer = { label: "승계 목표", choices: [], detail: raw("goal") ?? "미입력" };
  const goalRaw = raw("goal") ?? "";
  for (const [pattern, label] of [[/절세|세금.*(?:줄|절감)|세부담.*줄/, "세금 부담 절감"], [/노후|생활비/, "노후생활비 유지"], [/미리.*(?:증여|이전)|생전\s*증여/, "일부를 미리 이전"], [/통제|현재.*유지/, "현재 구조 유지"]] as const) {
    if (pattern.test(goalRaw)) goal.choices.push(label);
  }
  const review: AssessmentAnswer = { label: "결과 준비", choices: ["전체 요약 먼저 보기"], facts: { "고객 확인 일시": confirmation.confirmedAt, "추가 상황": raw("notes") ?? "미입력", "산정 범위": "입력한 자산가액의 합계이며 전체 재산·세무상 평가액·과세표준을 확정한 값이 아닙니다. 미확인 채무와 증여는 0으로 보지 않습니다." } };
  return {
    assessment_id: confirmation.assessmentId ?? createAssessmentId(),
    created_at: confirmation.confirmedAt,
    review_focus: ["전체 요약 먼저 보기"],
    answers: { purpose, family, assets, debt, goal, review },
    conversation: {
      mode: "chat",
      messages: validated.messages.flatMap(({ role, text, created_at }) => {
        const visibleText = role === "assistant" ? getAssistantReply(text)?.message : text;
        return visibleText ? [{ role, text: visibleText, created_at }] : [];
      }),
      confirmed_facts: CHAT_FIELD_KEYS.flatMap((key) => facts[key] && getCurrentFactSources(facts[key]!).length > 0 ? [{ id: key, label: CHAT_FIELD_LABELS[key], value: facts[key]!.value, raw_text: getCurrentFactSources(facts[key]!).map((source) => `[${source.messageId}] ${source.evidence}`).join("\n"), confidence: "customer_confirmed" }] : []),
      pending_candidates: CHAT_FIELD_KEYS.flatMap((key) => facts[key] ? getPendingFactSources(facts[key]!).map((source) => ({ id: `${key}:${source.messageId}`, label: CHAT_FIELD_LABELS[key], value: source.value, raw_text: `[${source.messageId}] ${source.evidence}`, confidence: "needs_confirmation" })) : []),
      raw_inputs: validated.messages.filter((message) => message.role === "user").map((message) => message.text),
      current_question_key: "review"
    }
  };
}
