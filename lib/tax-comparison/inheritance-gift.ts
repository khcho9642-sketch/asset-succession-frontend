import { baseComparison, integer, money, ordinaryTax, requireYes } from "./common";
import type { TaxCase, TaxComparison, TaxComparisonInput, TaxReference } from "./types";

const MILLION = 1_000_000;

const COMMON_REFERENCES: TaxReference[] = [
  { label: "국세청 · 공과금·장례비용·채무 공제", url: "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7954&mi=3208" },
  { label: "상속세 및 증여세법 제69조 · 신고세액공제", url: "https://www.law.go.kr/LSW//lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0069&lsiSeq=276123&urlMode=lsScJoRltInfoR" },
  { label: "국고금 관리법 제47조 · 끝수 계산", url: "https://www.law.go.kr/LSW//lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0047&lsiSeq=276079&urlMode=lsScJoRltInfoR" },
];

/** Won amounts and ratios remain integers, including a statutory share's remainder. */
function floorRatio(amount: number, numerator: number, denominator: number): number {
  return Number((BigInt(amount) * BigInt(numerator)) / BigInt(denominator));
}

function requireStandardCase(input: TaxComparisonInput, result: TaxComparison): boolean {
  requireYes(input.values, "resident", "거주자 요건 확인", result.missing);
  requireYes(input.values, "standardCase", "계산 적용 조건 확인", result.missing);
  if (input.values.resident === "no" || input.values.standardCase === "no") {
    result.status = "unsupported";
    return false;
  }
  return true;
}

/**
 * A first-death estate calculation for a resident with adult children and an
 * optional spouse. There are no prior/deemed gifts, special property, additional
 * deductions, or other beneficiaries in this expressly confirmed scope.
 */
export function compareInheritance(input: TaxComparisonInput): TaxComparison {
  const result = baseComparison("inheritance", "상속재산 배분에 따른 예상 상속세", "동일한 상속재산에서 배우자 상속액에 따른 1차 상속세를 비교합니다.");
  result.references = [
    { label: "상속세 및 증여세법 제19조~제22조 · 상속공제", url: "https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1024572131" },
    { label: "국세청 재산상속46014-508 · 배우자 상속공제 최저한도", url: "https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=010000000000069061" },
    { label: "국세청 · 배우자 단독 상속과 일괄공제 적용", url: "https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=010000000000071432" },
    ...COMMON_REFERENCES,
  ];
  result.exclusions = [
    "미성년자·장애인·연로자 추가공제, 가업·영농상속공제, 사전증여재산·추정상속재산·간주상속재산 및 상속인 외 수유자는 포함하지 않습니다.",
    "비과세·과세가액 불산입 재산, 봉안시설·자연장 비용, 최대주주 주식 등 금융재산 공제 제외 대상은 별도 검토가 필요합니다.",
    "배우자의 향후 2차 상속세, 상속취득세 및 분납·연부연납 비용은 포함하지 않습니다.",
  ];
  if (!requireStandardCase(input, result)) return result;
  const values = input.values;
  const estate = money(values, "estate", "상속재산 평가액", result.missing);
  const debt = money(values, "debt", "공과금·채무 합계", result.missing);
  const financial = money(values, "financial", "공제 대상 금융재산", result.missing);
  const financialDebt = money(values, "financialDebt", "금융채무", result.missing);
  const funeral = money(values, "funeral", "직접 장례비용", result.missing);
  const children = integer(values, "children", "성년 자녀 수", result.missing, 1, 20);
  const spouse = values.spouse;
  if (spouse !== "yes" && spouse !== "no") result.missing.push("배우자 유무");
  const customText = values.spouseAllocation?.trim() ?? "";
  const spouseAllocation = customText ? money(values, "spouseAllocation", "직접 입력한 배우자 상속액", result.missing) : null;
  if (estate !== null && debt !== null && debt > estate) result.missing.push("공과금·채무 합계는 상속재산 평가액 이하여야 합니다.");
  if (financial !== null && estate !== null && financial > estate) result.missing.push("공제 대상 금융재산은 상속재산 평가액 이하여야 합니다.");
  if (financialDebt !== null && debt !== null && financialDebt > debt) result.missing.push("금융채무는 공과금·채무 합계에 포함되어야 합니다.");
  if (spouseAllocation !== null && spouse === "no") result.missing.push("배우자가 없는 경우 배우자 상속액을 입력할 수 없습니다.");
  if (spouseAllocation !== null && estate !== null && debt !== null && spouseAllocation > estate - debt) result.missing.push("배우자 상속액은 공과금·채무를 뺀 상속재산 이하여야 합니다.");
  if (result.missing.length || estate === null || debt === null || financial === null || financialDebt === null || funeral === null || children === null) return result;

  const funeralDeduction = Math.min(10 * MILLION, Math.max(5 * MILLION, funeral));
  const netEstate = Math.max(0, estate - debt - funeralDeduction);
  const basicAndChildren = 200 * MILLION + children * 50 * MILLION;
  // NTS's Article 21 interpretation concerns a sole LEGAL spouse-heir, not a
  // spouse receiving all property by agreement with existing child co-heirs.
  const personalDeduction = Math.max(500 * MILLION, basicAndChildren);
  const netFinancial = Math.max(0, financial - financialDebt);
  const financialDeduction = netFinancial <= 20 * MILLION
    ? netFinancial
    : Math.min(200 * MILLION, Math.max(20 * MILLION, floorRatio(netFinancial, 1, 5)));
  // Article 19's statutory-share ceiling subtracts debts/public charges, not funeral expenses.
  const statutoryAllocation = spouse === "yes" ? floorRatio(estate - debt, 3, 2 * children + 3) : 0;
  // NTS interpretation 재산상속46014-508 (2000-04-25) and its published Q&A
  // retain the 500m minimum even when actual inheritance is >=500m and the
  // statutory-share ceiling is lower. Reading Article 19(4) alone misses this.
  const spouseDeductionFor = (allocation: number): number => spouse === "yes"
    ? Math.max(500 * MILLION, Math.min(allocation, statutoryAllocation, 3_000 * MILLION))
    : 0;

  const makeCase = (id: string, label: string, spouseDeduction: number, assumption: string): TaxCase => {
    const totalDeduction = Math.min(netEstate, personalDeduction + spouseDeduction + financialDeduction);
    const taxableWon = netEstate - totalDeduction;
    const tax = ordinaryTax(taxableWon);
    return {
      id, label, taxableWon, ...tax, localTaxWon: 0, totalTaxWon: tax.nationalTaxWon,
      lines: [
        { label: "상속재산 평가액", amountWon: estate },
        { label: "차감: 공과금·채무", amountWon: debt },
        { label: "차감: 장례비 공제", amountWon: funeralDeduction, note: "직접 장례비는 500만원 이상 1,000만원 한도로 반영" },
        { label: "상속세 과세가액", amountWon: netEstate },
        { label: basicAndChildren > 500 * MILLION ? "기초·자녀 공제" : "일괄공제", amountWon: personalDeduction },
        { label: "배우자 상속공제", amountWon: spouseDeduction },
        { label: "금융재산 상속공제", amountWon: financialDeduction },
        { label: "상속공제 적용 합계", amountWon: totalDeduction, note: "상속세 과세가액 한도로 적용" },
        { label: "과세표준", amountWon: taxableWon },
      ],
      assumptions: [assumption, "기한 내 신고와 필요한 배우자 상속재산 분할 요건을 충족하는 것으로 계산합니다."],
    };
  };

  result.baseline = makeCase("inheritance-minimum", spouse === "yes" ? "배우자 최소 공제 적용" : "현재 조건의 상속", spouseDeductionFor(0), spouse === "yes" ? "배우자 상속공제 5억원을 적용한 비교 기준안입니다." : "배우자가 없는 성년 자녀 상속을 계산합니다.");
  if (spouse === "yes") {
    const shareCase = makeCase("inheritance-statutory-spouse", "배우자 법정지분 상속", spouseDeductionFor(statutoryAllocation), "배우자가 공과금·채무 차감 후 재산의 법정상속분을 상속받는 가정입니다.");
    shareCase.lines.splice(5, 0, { label: "가정한 배우자 상속액", amountWon: statutoryAllocation });
    result.alternatives.push(shareCase);
    if (spouseAllocation !== null) {
      const customCase = makeCase("inheritance-custom-spouse", "입력한 배우자 상속액 적용", spouseDeductionFor(spouseAllocation), "고객이 직접 입력한 배우자 상속액을 기준으로 공제 한도를 적용합니다.");
      customCase.lines.splice(5, 0, { label: "입력한 배우자 상속액", amountWon: spouseAllocation });
      result.alternatives.push(customCase);
    }
  }
  result.assumptions = [
    "상속재산 평가액과 공과금·채무는 법정 평가·공제 요건을 충족한 금액입니다.",
    "거주자인 피상속인의 성년 자녀와 선택한 배우자만 법정상속인이며 상속포기가 없는 일반 상속을 가정합니다.",
    "동일한 재산을 동일한 자녀들 사이에서 나누는 비율만 바꾸어도 총상속세가 줄어드는 것은 아닙니다.",
    "상속세 과세표준 50만원 미만은 과세하지 않고, 기한 내 신고세액공제 3% 및 국고금 끝수 처리를 적용합니다.",
  ];
  result.status = "ready";
  return result;
}

const RECIPIENTS = {
  adult_child: { label: "성년 자녀", deduction: 50 * MILLION },
  minor_child: { label: "미성년 자녀", deduction: 20 * MILLION },
  spouse: { label: "배우자", deduction: 600 * MILLION },
  other_relative: { label: "기타 친족", deduction: 10 * MILLION },
  unrelated: { label: "친족 외 수증자", deduction: 0 },
} as const;

/** Same total CASH transferred to one person versus N distinct same-class recipients. */
export function compareGift(input: TaxComparisonInput): TaxComparison {
  const result = baseComparison("gift", "현금 증여 대상에 따른 예상 증여세", "동일한 현금 총액을 1명 또는 여러 명에게 증여할 때의 세액을 비교합니다.");
  result.references = [
    { label: "상속세 및 증여세법 제53조 · 증여재산공제", url: "https://www.law.go.kr/lsLinkProc.do?chrClsCd=010202&joNo=005300000%5E005400000&lsId=001561&mode=2" },
    { label: "상속세 및 증여세법 제55조 · 과세표준과 과세최저한", url: "https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1024572777" },
    { label: "국세청 · 증여세 항목별 설명", url: "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7960&mi=6533" },
    ...COMMON_REFERENCES.slice(1),
  ];
  result.exclusions = [
    "현금 증여만 계산합니다. 부동산·주식·부담부증여·가업승계 특례 및 세대생략 할증은 포함하지 않습니다.",
    "과거 10년 증여 합산·공제 사용, 혼인·출산 추가공제, 외국납부세액 및 증여자의 세금 대납은 포함하지 않습니다.",
    "기타 친족은 4촌 이내 혈족·3촌 이내 인척에 한하며, 직계존속·직계비속 등 별도 공제 대상은 이 항목에 포함하지 않습니다.",
  ];
  if (!requireStandardCase(input, result)) return result;
  const amount = money(input.values, "giftAmount", "증여할 현금 총액", result.missing);
  const count = integer(input.values, "recipientCount", "비교할 수증자 수", result.missing, 1, 20);
  const recipientKey = input.values.recipientType;
  const recipient = Object.hasOwn(RECIPIENTS, recipientKey ?? "") ? RECIPIENTS[recipientKey as keyof typeof RECIPIENTS] : null;
  if (!recipient) result.missing.push("증여자와 수증자의 관계");
  if (recipientKey === "spouse" && count !== null && count !== 1) result.missing.push("배우자 수증자는 1명이어야 합니다.");
  if (result.missing.length || amount === null || count === null || recipient === null) return result;

  const makeCase = (recipients: number): TaxCase => {
    const perPerson = Math.floor(amount / recipients);
    const remainder = amount % recipients;
    let taxableWon = 0;
    let grossTaxWon = 0;
    let creditWon = 0;
    let nationalTaxWon = 0;
    let appliedDeduction = 0;
    for (let index = 0; index < recipients; index += 1) {
      const received = perPerson + (index < remainder ? 1 : 0);
      const deduction = Math.min(received, recipient.deduction);
      const base = received - deduction;
      const tax = ordinaryTax(base);
      appliedDeduction += deduction;
      taxableWon += base;
      grossTaxWon += tax.grossTaxWon;
      creditWon += tax.creditWon;
      nationalTaxWon += tax.nationalTaxWon;
    }
    return {
      id: `gift-${recipients}-recipients`,
      label: recipients === 1 ? `${recipient.label} 1명에게 증여` : `${recipient.label} ${recipients}명에게 균등 증여`,
      taxableWon, grossTaxWon, creditWon, nationalTaxWon, localTaxWon: 0, totalTaxWon: nationalTaxWon,
      lines: [
        { label: "증여할 현금 총액", amountWon: amount },
        { label: "1인당 증여액", amountWon: perPerson, note: remainder ? `원 단위 잔액 ${remainder}원은 앞선 ${remainder}명에게 1원씩 배분` : `${recipients}명에게 동일 금액 배분` },
        { label: "1인당 증여재산공제 한도", amountWon: recipient.deduction, note: "과거 10년간 공제 사용이 없는 경우" },
        { label: "실제 적용 공제 합계", amountWon: appliedDeduction },
        { label: "수증자별 과세표준 합계", amountWon: taxableWon, note: "세율은 합계가 아닌 수증자별 과세표준에 각각 적용" },
      ],
      assumptions: ["각 수증자가 세금을 부담하며, 증여자의 세금 대납에 따른 추가 증여는 없습니다.", "모든 수증자는 같은 관계 구분에 해당하며 실제로 각자의 재산을 취득합니다."],
    };
  };

  result.baseline = makeCase(1);
  if (count > 1) result.alternatives = [makeCase(count)];
  result.assumptions = [
    "거주자인 수증자에게 현금을 증여하며 과거 10년간 합산할 증여와 사용한 증여재산공제가 없습니다.",
    "수증자마다 과세표준·세율·신고세액공제 3%·국고금 끝수 처리를 적용한 뒤 세액을 합산합니다.",
    "수증자별 과세표준 50만원 미만은 과세하지 않습니다.",
    "비교안은 재산을 받는 사람이 달라지는 선택입니다. 명의만 나누거나 한 사람에게 다시 모으는 거래를 가정하지 않습니다.",
  ];
  result.status = "ready";
  return result;
}
