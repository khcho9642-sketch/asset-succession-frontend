import type {
  CapitalGainsInput,
  GiftInput,
  InheritanceInput,
  SimpleCalculationResult,
  SimpleTaxKind,
  UnsupportedItem,
} from "./types";

export const SIMPLE_CALCULATOR_CHECKED_ON = "2026-09-17";

export const MAX_SIMPLE_CALCULATOR_WON = 100_000_000_000_000;
const BASIC_CAPITAL_DEDUCTION = 2_500_000;

export function parseWonInput(raw: string): number | null {
  const normalized = raw.replace(/[,\s]/g, "");
  if (!normalized) return null;
  if (!/^\d+$/.test(normalized)) return null;
  const value = BigInt(normalized);
  return value <= BigInt(MAX_SIMPLE_CALCULATOR_WON) ? Number(value) : null;
}

export function formatWon(won: number): string {
  return `${Math.trunc(won).toLocaleString("ko-KR")}원`;
}

export function formatKoreanWon(won: number): string {
  const value = Math.trunc(Math.max(0, won));
  if (value === 0) return "0원";
  const eok = Math.floor(value / 100_000_000);
  const man = Math.floor((value % 100_000_000) / 10_000);
  const rest = value % 10_000;
  const parts: string[] = [];
  if (eok) parts.push(`${eok.toLocaleString("ko-KR")}억`);
  if (man) parts.push(`${man.toLocaleString("ko-KR")}만`);
  if (!eok && !man && rest) parts.push(`${rest.toLocaleString("ko-KR")}`);
  return `${parts.join(" ")} 원`;
}

export function roundPayment(won: number): number {
  return Math.floor(Math.max(0, won) / 10) * 10;
}

function percent(won: number, rate: number): number {
  return Number(BigInt(Math.max(0, Math.trunc(won))) * BigInt(rate) / BigInt(100));
}

function ratio(won: number, numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Number(BigInt(Math.max(0, Math.trunc(won))) * BigInt(numerator) / BigInt(denominator));
}

export function deriveSpouseLegalShare({
  spouse,
  spouseSoleHeir,
  childrenCount,
}: {
  spouse: "yes" | "no";
  spouseSoleHeir: boolean;
  childrenCount: number | null;
}): { numerator: number | null; denominator: number | null; label: string; unsupported?: string } {
  if (spouse === "no") return { numerator: 0, denominator: 1, label: "배우자 없음" };
  if (spouseSoleHeir) return { numerator: 1, denominator: 1, label: "배우자가 단독 법정상속인" };
  if (childrenCount !== null && childrenCount > 0) {
    return {
      numerator: 3,
      denominator: 2 * childrenCount + 3,
      label: `배우자 1.5 : 자녀 ${childrenCount}명 각 1`,
    };
  }
  return {
    numerator: null,
    denominator: null,
    label: "지원 범위 밖 가족관계",
    unsupported: "현재 화면은 배우자와 자녀만 있는 단순 가족관계에서 법정상속분을 자동 산출합니다.",
  };
}

export function calculateMinorDeductionFromAges(ages: number[]): number {
  return ages.reduce((sum, age) => sum + Math.max(0, 19 - age) * 10_000_000, 0);
}

export function calculateDisabledDeductionFromLifeExpectancyYears(years: number): number {
  return Math.max(0, Math.trunc(years)) * 10_000_000;
}

function base(kind: SimpleTaxKind, title: string, taxName: string): SimpleCalculationResult {
  return {
    kind,
    title,
    status: "needs_info",
    taxName,
    taxableBaseWon: 0,
    grossTaxWon: 0,
    creditWon: 0,
    nationalTaxWon: 0,
    localTaxWon: 0,
    totalTaxWon: 0,
    lines: [],
    missing: [],
    assumptions: [],
    unsupported: [],
    scopeNotes: [],
    references: [],
    checkedOn: SIMPLE_CALCULATOR_CHECKED_ON,
  };
}

function requireMoney(value: number | null, label: string, missing: string[]): number | null {
  if (value === null || !Number.isSafeInteger(value) || value < 0 || value > MAX_SIMPLE_CALCULATOR_WON) {
    missing.push(`${label}: 0원 이상 금액을 입력해 주세요.`);
    return null;
  }
  return value;
}

function requireCount(value: number | null, label: string, missing: string[], min = 0, max = 99): number | null {
  if (value === null || !Number.isInteger(value) || value < min || value > max) {
    missing.push(`${label}: ${min}~${max} 사이의 정수를 입력해 주세요.`);
    return null;
  }
  return value;
}

function ordinaryInheritanceGiftTax(taxableWon: number, filingCredit: boolean) {
  if (taxableWon < 500_000) return { grossTaxWon: 0, creditWon: 0, nationalTaxWon: 0, rateLabel: "과세최저한 미만" };
  const brackets = [
    { ceiling: 100_000_000, rate: 10, deduction: 0 },
    { ceiling: 500_000_000, rate: 20, deduction: 10_000_000 },
    { ceiling: 1_000_000_000, rate: 30, deduction: 60_000_000 },
    { ceiling: 3_000_000_000, rate: 40, deduction: 160_000_000 },
    { ceiling: MAX_SIMPLE_CALCULATOR_WON, rate: 50, deduction: 460_000_000 },
  ];
  const bracket = brackets.find((item) => taxableWon <= item.ceiling) ?? brackets[brackets.length - 1];
  const grossTaxWon = percent(taxableWon, bracket.rate) - bracket.deduction;
  const creditWon = filingCredit ? percent(grossTaxWon, 3) : 0;
  return {
    grossTaxWon,
    creditWon,
    nationalTaxWon: roundPayment(grossTaxWon - creditWon),
    rateLabel: `${bracket.rate}% / 누진공제 ${formatWon(bracket.deduction)}`,
  };
}

function ordinaryCapitalTax(taxableWon: number, transferDate: string) {
  const brackets = transferDate < "2023-01-01" ? [
    { ceiling: 12_000_000, rate: 6, deduction: 0 },
    { ceiling: 46_000_000, rate: 15, deduction: 1_080_000 },
    { ceiling: 88_000_000, rate: 24, deduction: 5_220_000 },
    { ceiling: 150_000_000, rate: 35, deduction: 14_900_000 },
    { ceiling: 300_000_000, rate: 38, deduction: 19_400_000 },
    { ceiling: 500_000_000, rate: 40, deduction: 25_400_000 },
    { ceiling: 1_000_000_000, rate: 42, deduction: 35_400_000 },
    { ceiling: MAX_SIMPLE_CALCULATOR_WON, rate: 45, deduction: 65_400_000 },
  ] : [
    { ceiling: 14_000_000, rate: 6, deduction: 0 },
    { ceiling: 50_000_000, rate: 15, deduction: 1_260_000 },
    { ceiling: 88_000_000, rate: 24, deduction: 5_760_000 },
    { ceiling: 150_000_000, rate: 35, deduction: 15_440_000 },
    { ceiling: 300_000_000, rate: 38, deduction: 19_940_000 },
    { ceiling: 500_000_000, rate: 40, deduction: 25_940_000 },
    { ceiling: 1_000_000_000, rate: 42, deduction: 35_940_000 },
    { ceiling: MAX_SIMPLE_CALCULATOR_WON, rate: 45, deduction: 65_940_000 },
  ];
  const bracket = brackets.find((item) => taxableWon <= item.ceiling) ?? brackets[brackets.length - 1];
  return {
    grossTaxWon: Math.max(0, percent(taxableWon, bracket.rate) - bracket.deduction),
    rateLabel: `${bracket.rate}% / 누진공제 ${formatWon(bracket.deduction)}`,
  };
}

function addUnsupported(list: UnsupportedItem[], condition: boolean, label: string, reason: string): void {
  if (condition) list.push({ label, reason });
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function checkCalculationDate(value: string, label: string, start: string, result: SimpleCalculationResult): void {
  if (!validDate(value)) result.missing.push(`${label}: 올바른 날짜를 입력해 주세요.`);
  else addUnsupported(result.unsupported, value < start || value > SIMPLE_CALCULATOR_CHECKED_ON,
    label, `${start}부터 ${SIMPLE_CALCULATOR_CHECKED_ON}까지의 적용 기준을 지원합니다.`);
}

export function calculateInheritanceTax(input: InheritanceInput): SimpleCalculationResult {
  const result = base("inheritance", "상속세 간편계산", "상속세");
  result.references = [
    { label: "국세청 금융재산공제 대상·제외 및 공제액 (2026-09-18 확인)", url: "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7956&mi=6528" },
    { label: "상속세 및 증여세법 제22조 (2026-01-02 시행)", url: "https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1032161999" },
    { label: "손택스 상속세 간편계산 입력 항목", url: "https://mob.tbht.hometax.go.kr/jsonAction.do?actionId=UTBRNAAM02F001" },
    { label: "상속세 및 증여세법 제25조~제27조", url: "https://taxlaw.nts.go.kr/st/USESTA002P.do?ntstBscId=100000000000001561&ntstEnfrDt=2019.02.25.&ntstSysClCd=01&ntstTlawClCd=109" },
    { label: "상속세 및 증여세법 제69조 신고세액공제", url: "https://www.law.go.kr/LSW//lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0069&lsiSeq=276123&urlMode=lsScJoRltInfoR" },
  ];

  const m = result.missing;
  checkCalculationDate(input.deathDate, "상속개시일", "2023-01-01", result);
  const childrenCount = requireCount(input.childrenCount, "자녀 수", m, 0, 20);
  const seniorCount = requireCount(input.seniorCount, "연로자 수", m, 0, 20);
  const realEstate = requireMoney(input.realEstateWon, "부동산가액", m);
  const financialAssets = requireMoney(input.financialAssetsWon, "금융재산가액", m);
  const financialExclusions = requireMoney(input.financialExclusionsWon, "금융재산 중 공제 제외 금액", m);
  const otherAssets = requireMoney(input.otherAssetsWon, "기타재산가액", m);
  const deemedAssets = requireMoney(input.deemedAssetsWon, "퇴직금·보험금·신탁재산 등", m);
  const nonTaxable = requireMoney(input.nonTaxableWon, "비과세·과세가액 불산입액", m);
  const priorGiftSpouse = requireMoney(input.priorGiftSpouseWon, "10년 이내 배우자 사전증여", m);
  const priorGiftHeirs = requireMoney(input.priorGiftHeirsWon, "10년 이내 배우자 외 상속인 사전증여", m);
  const priorGiftOthers = requireMoney(input.priorGiftOthersWon, "5년 이내 상속인 외 사전증여", m);
  const debt = requireMoney(input.debtWon, "채무", m);
  const financialDebt = requireMoney(input.financialDebtWon, "총채무 중 금융채무 금액", m);
  const publicCharges = requireMoney(input.publicChargesWon, "공과금", m);
  const funeral = requireMoney(input.funeralWon, "일반 장례비용", m);
  const burial = requireMoney(input.burialWon, "봉안시설·자연장지 비용", m);
  const spouseActual = input.spouse === "yes" ? requireMoney(input.spouseActualInheritanceWon, "배우자가 실제 상속받은 금액", m) : 0;
  const spousePriorTaxable = requireMoney(input.spousePriorGiftTaxableWon, "10년 이내 배우자 사전증여 과세표준", m);
  const minorDeduction = requireMoney(input.minorDeductionWon, "미성년자 공제액", m);
  const disabledDeduction = requireMoney(input.disabledDeductionWon, "장애인 공제액", m);
  if (input.spouse === "yes" && (!input.statutoryShareNumerator || !input.statutoryShareDenominator)) {
    m.push("배우자 법정지분율의 분자와 분모를 입력해 주세요.");
  }
  if (financialDebt !== null && debt !== null && financialDebt > debt) m.push("총채무 중 금융채무 금액: 총채무를 초과할 수 없습니다.");
  if (financialExclusions !== null && financialAssets !== null && financialExclusions > financialAssets) {
    m.push("금융재산 중 공제 제외 금액: 금융재산가액을 초과할 수 없습니다.");
  }
  if (result.unsupported.length) result.status = "unsupported";
  if (m.length || result.unsupported.length) return result;

  const totalAssets = realEstate! + financialAssets! + otherAssets! + deemedAssets!;
  if (nonTaxable! > totalAssets) result.missing.push("비과세·과세가액 불산입액은 총 상속재산 이하여야 합니다.");
  const taxableEstateBeforeDeductions = Math.max(0, totalAssets - nonTaxable! + priorGiftSpouse! + priorGiftHeirs! + priorGiftOthers!);
  const funeralDeduction = Math.min(10_000_000, Math.max(5_000_000, funeral!));
  const burialDeduction = Math.min(5_000_000, burial!);
  const taxableEstate = Math.max(0, taxableEstateBeforeDeductions - debt! - publicCharges! - funeralDeduction - burialDeduction);
  // Excluded property stays in totalAssets; it only reduces financial deduction eligibility.
  const eligibleFinancialAssets = financialAssets! - financialExclusions!;
  const netFinancial = Math.max(0, eligibleFinancialAssets - financialDebt!);
  const financialDeduction = netFinancial <= 20_000_000
    ? netFinancial
    : Math.min(200_000_000, Math.max(20_000_000, percent(netFinancial, 20)));
  const itemizedDeduction = 200_000_000 + childrenCount! * 50_000_000 + minorDeduction! + seniorCount! * 50_000_000 + disabledDeduction!;
  const personalDeduction = input.spouseSoleHeir ? itemizedDeduction : Math.max(500_000_000, itemizedDeduction);
  const spouseLegalLimit = input.spouse === "yes"
    ? Math.max(0, ratio(Math.max(0, totalAssets - debt! - publicCharges!), input.statutoryShareNumerator!, input.statutoryShareDenominator!) - spousePriorTaxable!)
    : 0;
  const spouseDeduction = input.spouse === "yes"
    ? Math.max(500_000_000, Math.min(spouseActual!, spouseLegalLimit, 3_000_000_000))
    : 0;
  const grossDeductions = personalDeduction + spouseDeduction + financialDeduction;
  const deductionLimit = taxableEstate;
  const appliedDeductions = Math.min(deductionLimit, grossDeductions);
  const taxableBaseWon = Math.max(0, taxableEstate - appliedDeductions);
  const tax = ordinaryInheritanceGiftTax(taxableBaseWon, true);

  result.status = result.missing.length ? "needs_info" : "ready";
  result.taxableBaseWon = taxableBaseWon;
  result.grossTaxWon = tax.grossTaxWon;
  result.creditWon = tax.creditWon;
  result.nationalTaxWon = tax.nationalTaxWon;
  result.totalTaxWon = tax.nationalTaxWon;
  result.lines = [
    { label: "총 상속재산", amountWon: totalAssets },
    { label: "비과세·과세가액 불산입", amountWon: -nonTaxable! },
    { label: "사전증여재산 가산", amountWon: priorGiftSpouse! + priorGiftHeirs! + priorGiftOthers! },
    { label: "채무·공과금 차감", amountWon: -(debt! + publicCharges!) },
    { label: "장례비·봉안시설 비용 공제", amountWon: -(funeralDeduction + burialDeduction), note: "일반 장례비 500만원~1,000만원, 봉안시설 등 500만원 한도" },
    { label: "상속세 과세가액", amountWon: taxableEstate },
    { label: "인적공제 또는 일괄공제", amountWon: -personalDeduction },
    { label: "배우자 상속공제", amountWon: -spouseDeduction, note: input.spouse === "yes" ? `입력 상속액·법정지분 한도·30억원 한도 기준` : "배우자 없음" },
    { label: "금융재산 상속공제", amountWon: -financialDeduction, note: `금융재산 ${formatWon(financialAssets!)} - 공제 제외 재산 ${formatWon(financialExclusions!)} - 금융채무 ${formatWon(financialDebt!)} = 공제 대상 순금융재산 ${formatWon(netFinancial)}. 공제 제외 재산은 총 상속재산에 남고, 금융채무는 총채무에 포함되어 한 번만 차감됩니다.` },
    { label: "상속공제 적용 합계", amountWon: -appliedDeductions, note: "상속세 과세가액 한도" },
    { label: "과세표준", amountWon: taxableBaseWon },
    { label: `산출세액 (${tax.rateLabel})`, amountWon: tax.grossTaxWon },
    { label: "신고세액공제 3%", amountWon: -tax.creditWon },
    { label: "예상 납부 상속세", amountWon: tax.nationalTaxWon },
  ];
  result.assumptions = [
    "피상속인은 거주자이고, 유증·상속인 외 수유자·상속포기 특례는 없다고 가정합니다.",
    "재산가액은 사용자가 이미 세법상 평가한 금액이며, 이 화면은 재산평가 서비스를 제공하지 않습니다.",
    "배우자 상속재산 분할과 신고 요건을 기한 내 충족하는 것으로 계산합니다.",
  ];
  result.scopeNotes = [
    { label: "가업·영농상속공제", reason: "간편계산 범위를 벗어나 별도 요건 검토가 필요합니다." },
    { label: "상속인 외 수유자·비거주자", reason: "손택스 간편계산도 지원 제외로 안내합니다." },
  ];
  return result;
}

const GIFT_DEDUCTIONS: Record<GiftInput["relationship"], { label: string; deductionWon: number }> = {
  spouse: { label: "배우자", deductionWon: 600_000_000 },
  linealAscendantAdult: { label: "직계존속 → 성년 수증자", deductionWon: 50_000_000 },
  linealAscendantMinor: { label: "직계존속 → 미성년 수증자", deductionWon: 20_000_000 },
  linealDescendant: { label: "직계비속", deductionWon: 50_000_000 },
  otherRelative: { label: "기타 친족", deductionWon: 10_000_000 },
  unrelated: { label: "친족 외", deductionWon: 0 },
};

export function calculateGiftTax(input: GiftInput): SimpleCalculationResult {
  const result = base("gift", "증여세 간편계산", "증여세");
  result.references = [
    { label: "상속세 및 증여세법 제53·55·58조 (2026-01-02 시행)", url: "https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1026647923" },
    { label: "국세청 재차증여 납부세액공제 한도 해석", url: "https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=200000000000001535" },
    { label: "국세청 증여세 세액계산 흐름도", url: "https://g.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7728&mi=2340" },
    { label: "국세청 증여재산공제·세율", url: "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7960&mi=6538" },
    { label: "국세청 증여세 신고 작성 안내", url: "https://www.nts.go.kr/webtv/na/ntt/selectNttList.do?bbsId=50839&nttSn=1346300" },
  ];
  const m = result.missing;
  checkCalculationDate(input.giftDate, "증여일", "2023-01-01", result);
  if (input.resident !== "yes" && input.resident !== "no") m.push("수증자 거주자 여부를 선택해 주세요.");
  if (input.resident === "no") {
    result.status = "unsupported";
    result.unsupported.push({ label: "비거주자 수증자", reason: "증여재산공제 적용 여부 등 별도 검토가 필요합니다." });
  }
  const amount = requireMoney(input.amountWon, "증여재산가액", m);
  const debt = requireMoney(input.debtAssumedWon, "수증자가 인수한 채무", m);
  const priorGift = requireMoney(input.priorGiftWon, "최근 10년 동일인 관련 증여재산가액", m);
  const priorDeduction = requireMoney(input.priorGiftDeductionWon, "같은 증여자의 과거 증여에 적용한 공제", m);
  const otherDeduction = requireMoney(input.otherGiftDeductionWon, "그 밖의 증여에서 사용한 같은 구분의 공제", m);
  const appraisal = requireMoney(input.appraisalFeeWon, "감정평가수수료", m);
  const marriageBirth = requireMoney(input.marriageBirthDeductionWon, "혼인·출산 추가 공제", m);
  const previousTax = requireMoney(input.previousTaxPaidWon, "종전 증여재산 산출세액", m);
  const relation = GIFT_DEDUCTIONS[input.relationship];
  if (!relation) m.push("증여자와 수증자의 관계를 선택해 주세요.");
  if (priorDeduction !== null && priorGift !== null && priorDeduction > priorGift) m.push("같은 증여자의 과거 증여에 적용한 공제: 과거 증여재산가액을 초과할 수 없습니다.");
  if (relation && priorDeduction !== null && otherDeduction !== null && priorDeduction + otherDeduction > relation.deductionWon) m.push("그 밖의 증여에서 사용한 같은 구분의 공제: 과거 사용 공제 합계가 관계별 10년 한도를 초과합니다.");
  addUnsupported(result.unsupported, (priorGift ?? 0) > 0 && (input.generationSkip || (marriageBirth ?? 0) > 0),
    "재차증여와 특수 공제·할증", "혼인·출산 공제 또는 세대생략 할증이 섞인 과거 증여는 별도 확인이 필요합니다.");
  addUnsupported(result.unsupported, (marriageBirth ?? 0) > 0 && input.giftDate < "2024-01-01", "혼인·출산 증여재산공제", "2024-01-01 이후 증여분부터 적용합니다.");
  if (result.unsupported.length) result.status = "unsupported";
  if (m.length || result.unsupported.length) return result;
  if (debt! > amount!) result.missing.push("수증자 인수 채무는 증여재산가액 이하여야 합니다.");
  const netGift = Math.max(0, amount! - debt!);
  const aggregatedPriorGift = priorGift! >= 10_000_000 ? priorGift! : 0;
  const aggregateGift = netGift + aggregatedPriorGift;
  const remainingBasicDeduction = Math.max(0, relation.deductionWon - priorDeduction! - otherDeduction!);
  const currentDeduction = Math.min(netGift, remainingBasicDeduction);
  const appliedBasicDeduction = (aggregatedPriorGift ? priorDeduction! : 0) + currentDeduction;
  const appliedMarriageBirth = Math.min(Math.max(0, aggregateGift - appliedBasicDeduction), marriageBirth!);
  const taxableBaseWon = Math.max(0, aggregateGift - appliedBasicDeduction - appliedMarriageBirth - appraisal!);
  const aggregateTax = ordinaryInheritanceGiftTax(taxableBaseWon, false);
  const priorDeductionForCredit = priorDeduction! > 0 ? priorDeduction!
    : ratio(appliedBasicDeduction, aggregatedPriorGift, aggregateGift);
  const priorTaxable = Math.max(0, aggregatedPriorGift - priorDeductionForCredit);
  const previousCreditLimit = ratio(aggregateTax.grossTaxWon, priorTaxable, taxableBaseWon);
  const appliedPreviousTax = Math.min(previousTax!, previousCreditLimit);
  const currentGrossTax = Math.max(0, aggregateTax.grossTaxWon - appliedPreviousTax);
  const skipSurchargeRate = input.generationSkip ? (input.minorOverTwoBillion ? 40 : 30) : 0;
  const skipSurcharge = percent(currentGrossTax, skipSurchargeRate);
  const filingCredit = percent(currentGrossTax + skipSurcharge, 3);
  const nationalTaxWon = roundPayment(currentGrossTax + skipSurcharge - filingCredit);
  result.status = result.missing.length ? "needs_info" : "ready";
  result.taxableBaseWon = taxableBaseWon;
  result.grossTaxWon = currentGrossTax + skipSurcharge;
  result.creditWon = filingCredit;
  result.nationalTaxWon = nationalTaxWon;
  result.totalTaxWon = nationalTaxWon;
  result.lines = [
    { label: "이번 증여재산가액", amountWon: amount! },
    { label: "수증자 인수 채무 차감", amountWon: -debt!, note: "부담부증여는 양도소득세 등 별도 검토가 필요합니다." },
    { label: "최근 10년 동일인 관련 증여 가산", amountWon: aggregatedPriorGift, note: "동일인(직계존속은 그 배우자 포함)에게 받은 금액 합계 1천만원 이상일 때 합산" },
    { label: `${relation.label} 증여재산공제 적용`, amountWon: -appliedBasicDeduction, note: `합산된 과거 재산의 공제 ${formatWon(aggregatedPriorGift ? priorDeduction! : 0)} + 이번 공제 ${formatWon(currentDeduction)}. 다른 증여의 사용 공제 ${formatWon(otherDeduction!)}는 한도에서 차감합니다.` },
    { label: "혼인·출산 추가 공제", amountWon: -appliedMarriageBirth, note: "입력 금액만 반영, 요건은 사용자 확인" },
    { label: "감정평가수수료", amountWon: -appraisal! },
    { label: "과세표준", amountWon: taxableBaseWon },
    { label: `합산 산출세액 (${aggregateTax.rateLabel})`, amountWon: aggregateTax.grossTaxWon },
    { label: "종전 증여 산출세액 차감", amountWon: -appliedPreviousTax, note: `가산 재산의 과세표준 비율로 산출한 공제 한도 ${formatWon(previousCreditLimit)}` },
    { label: `세대생략 할증 ${skipSurchargeRate}%`, amountWon: skipSurcharge },
    { label: "신고세액공제 3%", amountWon: -filingCredit },
    { label: "예상 납부 증여세", amountWon: nationalTaxWon },
  ];
  result.assumptions = [
    "거주자인 수증자가 기한 내 신고하는 일반 증여를 기준으로 합니다.",
    "최근 10년 합산 증여와 이미 사용한 공제는 사용자가 확인해 입력한 금액입니다.",
    "혼인·출산 공제는 통합 평생 1억원 한도와 기간 요건을 사용자가 충족한다고 입력한 범위만 반영합니다.",
  ];
  result.scopeNotes = [
    { label: "창업자금·가업승계 과세특례", reason: "특례 한도와 사후관리 요건이 달라 이 간편계산에서 제외합니다." },
    { label: "부동산 부담부증여의 양도소득세", reason: "증여세와 별도 세목으로 분리 계산해야 합니다." },
  ];
  return result;
}

export function fullYearsBetween(start: string, end: string): number | null {
  if (!validDate(start) || !validDate(end)) return null;
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate <= startDate) return null;
  let years = endDate.getFullYear() - startDate.getFullYear();
  const anniversary = new Date(startDate);
  anniversary.setFullYear(startDate.getFullYear() + years);
  if (anniversary > endDate) years -= 1;
  return Math.max(0, years);
}

function longTermDeductionRate(specialHomeRate: boolean, heldYears: number, residenceYears: number): number {
  if (heldYears < 3) return 0;
  if (specialHomeRate && residenceYears >= 2) {
    const holdingRate = Math.min(40, heldYears * 4);
    const residenceRate = Math.min(40, residenceYears * 4);
    return Math.min(80, holdingRate + residenceRate);
  }
  return Math.min(30, heldYears * 2);
}

export function calculateCapitalGainsTax(input: CapitalGainsInput): SimpleCalculationResult {
  const result = base("capitalGains", "양도소득세 간편계산", "양도소득세");
  result.references = [
    { label: "국세청 1세대 1주택 비과세 요건", url: "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7707&mi=2308" },
    { label: "국세청 고가주택 안분 산식·공개 계산사례", url: "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=8799&mi=12271" },
    { label: "국세청 양도소득세 세액계산 흐름도", url: "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7709&mi=2446" },
    { label: "국세청 양도소득세 세율", url: "https://b.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7711&mi=2312" },
    { label: "국세청 양도소득 기본공제 신고서식 안내", url: "https://www.nts.go.kr/tax/sub/1.2.3.%EC%96%91%EB%8F%84%EC%86%8C%EB%93%9D%EA%B3%BC%EC%84%B8%ED%91%9C%EC%A4%80%20%EC%8B%A0%EA%B3%A0%20%EB%B0%8F%20%EB%82%A9%EB%B6%80%EA%B3%84%EC%82%B0%EC%84%9C.html" },
  ];
  const m = result.missing;
  checkCalculationDate(input.transferDate, "양도일", "2021-12-08", result);
  if (input.resident !== "yes" && input.resident !== "no") m.push("양도자 거주자 여부를 선택해 주세요.");
  addUnsupported(result.unsupported, input.resident === "no", "양도자 거주자 여부", "현재는 국내 거주자의 일반 양도만 지원합니다.");
  const heldYears = fullYearsBetween(input.acquisitionDate, input.transferDate);
  if (heldYears === null) m.push("취득일과 양도일을 올바르게 입력해 주세요.");
  const sale = requireMoney(input.salePriceWon, "양도가액", m);
  const purchase = requireMoney(input.purchasePriceWon, "취득가액", m);
  const expense = requireMoney(input.necessaryExpenseWon, "필요경비", m);
  const otherGain = requireMoney(input.otherCapitalGainWon, "같은 해 다른 양도소득금액", m);
  const usedBasic = requireMoney(input.basicDeductionUsedWon, "이미 사용한 양도소득 기본공제", m);
  const isHome = input.assetType === "oneHome";
  const homeCount = isHome ? requireCount(input.homeCount, "세대 기준 보유 주택 수", m, 1, 20) : 0;
  const residence = isHome ? requireCount(input.residenceYears, "거주 연수", m, 0, 99) : 0;
  addUnsupported(result.unsupported, input.assetType === "otherUnsupported", "분양권·입주권·비사업용 토지 등", "자산별 중과·특례가 달라 현재 직접 계산 범위에서 제외합니다.");
  addUnsupported(result.unsupported, isHome && homeCount !== null && homeCount > 1, "세대 기준 보유 주택 수", "다주택·일시적 2주택의 중과·특례는 미지원입니다.");
  if (usedBasic !== null && usedBasic > BASIC_CAPITAL_DEDUCTION) m.push("이미 사용한 양도소득 기본공제: 연 250만원을 초과할 수 없습니다.");
  if (isHome) {
    if (!input.homeOwnership) m.push("주택 소유·취득 형태를 선택해 주세요.");
    addUnsupported(result.unsupported, input.homeOwnership === "other", "주택 소유·취득 형태", "공동명의·상속·증여 취득 등은 취득가액·지분별 별도 계산이 필요합니다.");
    for (const [value, label] of [
      [input.householdOtherRights, "세대의 입주권·분양권"],
      [input.regulatedAtAcquisition, "취득 당시 조정대상지역"],
      [input.homeSpecialConditions, "주택의 별도 특례·제외 조건"],
    ] as const) {
      if (value !== "yes" && value !== "no") m.push(`${label}: 해당 여부를 확인해 주세요. 모름이면 계산할 수 없습니다.`);
    }
    addUnsupported(result.unsupported, input.householdOtherRights === "yes", "세대의 입주권·분양권", "주택과 권리를 함께 보유한 경우의 비과세 특례는 미지원입니다.");
    addUnsupported(result.unsupported, input.homeSpecialConditions === "yes", "주택의 별도 특례·제외 조건", "미등기·겸용주택·초과 부수토지·상생임대 등은 별도 검토가 필요합니다.");
    if (residence !== null && heldYears !== null && residence > heldYears) m.push("거주 연수: 보유 연수를 초과할 수 없습니다.");
  }
  if (m.length || result.unsupported.length) {
    if (result.unsupported.length) result.status = "unsupported";
    return result;
  }

  const gain = sale! - purchase! - expense!;
  const positiveGain = Math.max(0, gain);
  const residenceRequired = isHome && input.acquisitionDate >= "2017-08-03" && input.regulatedAtAcquisition === "yes";
  const exemptHome = isHome && homeCount === 1 && heldYears! >= 2 && (!residenceRequired || residence! >= 2);
  const taxableGain = exemptHome ? ratio(positiveGain, Math.max(0, sale! - 1_200_000_000), sale!) : positiveGain;
  const rate = longTermDeductionRate(exemptHome, heldYears!, residence!);
  const fullLongTermDeduction = percent(positiveGain, rate);
  // The law apportions the gain and the full long-term deduction separately.
  const longTermDeduction = exemptHome ? ratio(fullLongTermDeduction, Math.max(0, sale! - 1_200_000_000), sale!) : fullLongTermDeduction;
  const capitalIncome = Math.max(0, taxableGain - longTermDeduction + otherGain!);
  const remainingBasicDeduction = Math.max(0, BASIC_CAPITAL_DEDUCTION - usedBasic!);
  const appliedBasicDeduction = Math.min(capitalIncome, remainingBasicDeduction);
  const taxableBaseWon = Math.max(0, capitalIncome - appliedBasicDeduction);
  const shortTermRate = heldYears! < 1 ? (isHome ? 70 : 50) : heldYears! < 2 ? (isHome ? 60 : 40) : null;
  addUnsupported(result.unsupported, shortTermRate !== null && otherGain! > 0, "같은 해 다른 양도소득금액", "단기보유 자산과 다른 양도소득이 섞인 세율 비교는 별도 계산이 필요합니다.");
  if (result.unsupported.length) { result.status = "unsupported"; return result; }
  const progressiveTax = ordinaryCapitalTax(taxableBaseWon, input.transferDate);
  const grossTaxWon = shortTermRate === null ? progressiveTax.grossTaxWon : Math.max(progressiveTax.grossTaxWon, percent(taxableBaseWon, shortTermRate));
  const rateLabel = shortTermRate === null ? progressiveTax.rateLabel : `기본세율과 단기 ${shortTermRate}% 중 큰 세액`;
  const nationalTaxWon = roundPayment(grossTaxWon);
  const localTaxWon = roundPayment(Math.floor(grossTaxWon / 10));
  result.status = result.unsupported.length ? "unsupported" : "ready";
  result.taxableBaseWon = taxableBaseWon;
  result.grossTaxWon = grossTaxWon;
  result.nationalTaxWon = nationalTaxWon;
  result.localTaxWon = localTaxWon;
  result.totalTaxWon = nationalTaxWon + localTaxWon;
  result.lines = [
    { label: "양도가액", amountWon: sale! },
    { label: "취득가액", amountWon: -purchase! },
    { label: "필요경비", amountWon: -expense! },
    { label: "양도차익", amountWon: gain },
    ...(isHome ? [
      { label: "1세대 1주택 비과세 양도차익", amountWon: -(positiveGain - taxableGain), note: exemptHome ? "세대·취득·보유·거주 요건 확인. 양도가액 12억원 초과분만 과세" : `비과세 요건 미충족: ${heldYears! < 2 ? "보유 2년 미만" : "취득 당시 조정대상지역의 거주 2년 미달"}` },
      { label: "과세대상 양도차익", amountWon: taxableGain },
    ] : []),
    { label: `장기보유특별공제 ${rate}%`, amountWon: -longTermDeduction, note: `만 ${heldYears}년 보유 기준` },
    { label: "같은 해 다른 양도소득금액", amountWon: otherGain! },
    { label: "양도소득 기본공제", amountWon: -appliedBasicDeduction, note: `연 250만원 한도 중 남은 금액 ${formatWon(remainingBasicDeduction)}` },
    { label: "과세표준", amountWon: taxableBaseWon },
    { label: `양도소득세 산출세액 (${rateLabel})`, amountWon: grossTaxWon },
    { label: "개인지방소득세", amountWon: localTaxWon, note: "양도소득세의 10% 수준으로 별도 표시" },
    { label: "예상 납부세액 합계", amountWon: nationalTaxWon + localTaxWon },
  ];
  result.assumptions = [
    "국내 거주자 1인이 보유한 부동산 1건의 일반 양도이며, 감면·이월과세·부담부증여는 제외합니다.",
    "취득가액과 필요경비는 세법상 인정되는 실지거래가액과 비용입니다.",
    "양도소득세에는 신고세액공제 3%를 적용하지 않습니다.",
    `기본세율은 양도일 ${input.transferDate} 기준 ${input.transferDate < "2023-01-01" ? "2021~2022년" : "2023년 이후"} 구간을 적용했습니다.`,
  ];
  result.scopeNotes = [{ label: "주택 계산 범위", reason: "거주자·매수한 단독 소유 주택의 일반 비과세와 12억원 초과 안분을 지원합니다. 공동명의·입주권·분양권·겸용·다주택 특례는 제외합니다." }];
  return result;
}
