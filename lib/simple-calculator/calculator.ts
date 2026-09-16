import type {
  CapitalGainsInput,
  GiftInput,
  InheritanceInput,
  SimpleCalculationResult,
  SimpleTaxKind,
  UnsupportedItem,
} from "./types";

export const SIMPLE_CALCULATOR_CHECKED_ON = "2026-09-16";

const MAX_WON = 100_000_000_000_000;
const BASIC_CAPITAL_DEDUCTION = 2_500_000;

export function parseWonInput(raw: string): number | null {
  const normalized = raw.replace(/[,\s]/g, "");
  if (!normalized) return null;
  if (!/^\d+$/.test(normalized)) return null;
  const value = BigInt(normalized);
  return value <= BigInt(MAX_WON) ? Number(value) : null;
}

export function formatWon(won: number): string {
  return `${Math.trunc(won).toLocaleString("ko-KR")}원`;
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
    references: [],
    checkedOn: SIMPLE_CALCULATOR_CHECKED_ON,
  };
}

function requireMoney(value: number | null, label: string, missing: string[]): number | null {
  if (value === null || !Number.isSafeInteger(value) || value < 0) {
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
    { ceiling: MAX_WON, rate: 50, deduction: 460_000_000 },
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

function ordinaryCapitalTax(taxableWon: number) {
  const brackets = [
    { ceiling: 14_000_000, rate: 6, deduction: 0 },
    { ceiling: 50_000_000, rate: 15, deduction: 1_260_000 },
    { ceiling: 88_000_000, rate: 24, deduction: 5_760_000 },
    { ceiling: 150_000_000, rate: 35, deduction: 15_440_000 },
    { ceiling: 300_000_000, rate: 38, deduction: 19_940_000 },
    { ceiling: 500_000_000, rate: 40, deduction: 25_940_000 },
    { ceiling: 1_000_000_000, rate: 42, deduction: 35_940_000 },
    { ceiling: MAX_WON, rate: 45, deduction: 65_940_000 },
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

export function calculateInheritanceTax(input: InheritanceInput): SimpleCalculationResult {
  const result = base("inheritance", "상속세 간편계산", "상속세");
  result.references = [
    { label: "손택스 상속세 간편계산 입력 항목", url: "https://mob.tbht.hometax.go.kr/jsonAction.do?actionId=UTBRNAAM02F001" },
    { label: "상속세 및 증여세법 제25조~제27조", url: "https://taxlaw.nts.go.kr/st/USESTA002P.do?ntstBscId=100000000000001561&ntstEnfrDt=2019.02.25.&ntstSysClCd=01&ntstTlawClCd=109" },
    { label: "상속세 및 증여세법 제69조 신고세액공제", url: "https://www.law.go.kr/LSW//lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0069&lsiSeq=276123&urlMode=lsScJoRltInfoR" },
  ];

  const m = result.missing;
  if (!input.deathDate) m.push("상속개시일을 입력해 주세요.");
  const childrenCount = requireCount(input.childrenCount, "자녀 수", m, 0, 20);
  const seniorCount = requireCount(input.seniorCount, "연로자 수", m, 0, 20);
  const realEstate = requireMoney(input.realEstateWon, "부동산가액", m);
  const financialAssets = requireMoney(input.financialAssetsWon, "금융재산가액", m);
  const otherAssets = requireMoney(input.otherAssetsWon, "기타재산가액", m);
  const deemedAssets = requireMoney(input.deemedAssetsWon, "퇴직금·보험금·신탁재산 등", m);
  const nonTaxable = requireMoney(input.nonTaxableWon, "비과세·과세가액 불산입액", m);
  const priorGiftSpouse = requireMoney(input.priorGiftSpouseWon, "10년 이내 배우자 사전증여", m);
  const priorGiftHeirs = requireMoney(input.priorGiftHeirsWon, "10년 이내 배우자 외 상속인 사전증여", m);
  const priorGiftOthers = requireMoney(input.priorGiftOthersWon, "5년 이내 상속인 외 사전증여", m);
  const debt = requireMoney(input.debtWon, "채무", m);
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
  if (m.length) return result;

  const totalAssets = realEstate! + financialAssets! + otherAssets! + deemedAssets!;
  if (nonTaxable! > totalAssets) result.missing.push("비과세·과세가액 불산입액은 총 상속재산 이하여야 합니다.");
  const taxableEstateBeforeDeductions = Math.max(0, totalAssets - nonTaxable! + priorGiftSpouse! + priorGiftHeirs! + priorGiftOthers!);
  const funeralDeduction = Math.min(10_000_000, Math.max(5_000_000, funeral!));
  const burialDeduction = Math.min(5_000_000, burial!);
  const taxableEstate = Math.max(0, taxableEstateBeforeDeductions - debt! - publicCharges! - funeralDeduction - burialDeduction);
  const netFinancial = Math.max(0, financialAssets!);
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
    { label: "금융재산 상속공제", amountWon: -financialDeduction },
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
  result.unsupported = [
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
    { label: "국세청 증여세 세액계산 흐름도", url: "https://g.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7728&mi=2340" },
    { label: "국세청 증여재산공제·세율", url: "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7960&mi=6538" },
    { label: "국세청 증여세 신고 작성 안내", url: "https://www.nts.go.kr/webtv/na/ntt/selectNttList.do?bbsId=50839&nttSn=1346300" },
  ];
  const m = result.missing;
  if (!input.giftDate) m.push("증여일을 입력해 주세요.");
  if (input.resident === "no") {
    result.status = "unsupported";
    result.unsupported.push({ label: "비거주자 수증자", reason: "증여재산공제 적용 여부 등 별도 검토가 필요합니다." });
  }
  const amount = requireMoney(input.amountWon, "증여재산가액", m);
  const debt = requireMoney(input.debtAssumedWon, "수증자가 인수한 채무", m);
  const priorGift = requireMoney(input.priorGiftWon, "최근 10년 동일인 관련 증여재산가액", m);
  const usedDeduction = requireMoney(input.usedDeductionWon, "최근 10년 사용한 일반 공제액", m);
  const appraisal = requireMoney(input.appraisalFeeWon, "감정평가수수료", m);
  const marriageBirth = requireMoney(input.marriageBirthDeductionWon, "혼인·출산 추가 공제", m);
  const previousTax = requireMoney(input.previousTaxPaidWon, "종전 증여재산 산출세액", m);
  if (m.length || result.status === "unsupported") return result;
  const relation = GIFT_DEDUCTIONS[input.relationship];
  if (debt! > amount!) result.missing.push("수증자 인수 채무는 증여재산가액 이하여야 합니다.");
  const netGift = Math.max(0, amount! - debt!);
  const aggregateGift = netGift + priorGift!;
  const remainingBasicDeduction = Math.max(0, relation.deductionWon - usedDeduction!);
  const appliedBasicDeduction = Math.min(aggregateGift, remainingBasicDeduction);
  const appliedMarriageBirth = Math.min(Math.max(0, aggregateGift - appliedBasicDeduction), marriageBirth!);
  const taxableBaseWon = Math.max(0, aggregateGift - appliedBasicDeduction - appliedMarriageBirth - appraisal!);
  const aggregateTax = ordinaryInheritanceGiftTax(taxableBaseWon, false);
  const currentGrossTax = Math.max(0, aggregateTax.grossTaxWon - previousTax!);
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
    { label: "최근 10년 동일인 관련 증여 가산", amountWon: priorGift! },
    { label: `${relation.label} 증여재산공제 적용`, amountWon: -appliedBasicDeduction, note: `10년 한도 ${formatWon(relation.deductionWon)} 중 사용 공제 차감` },
    { label: "혼인·출산 추가 공제", amountWon: -appliedMarriageBirth, note: "입력 금액만 반영, 요건은 사용자 확인" },
    { label: "감정평가수수료", amountWon: -appraisal! },
    { label: "과세표준", amountWon: taxableBaseWon },
    { label: `합산 산출세액 (${aggregateTax.rateLabel})`, amountWon: aggregateTax.grossTaxWon },
    { label: "종전 증여 산출세액 차감", amountWon: -previousTax! },
    { label: `세대생략 할증 ${skipSurchargeRate}%`, amountWon: skipSurcharge },
    { label: "신고세액공제 3%", amountWon: -filingCredit },
    { label: "예상 납부 증여세", amountWon: nationalTaxWon },
  ];
  result.assumptions = [
    "거주자인 수증자가 기한 내 신고하는 일반 증여를 기준으로 합니다.",
    "최근 10년 합산 증여와 이미 사용한 공제는 사용자가 확인해 입력한 금액입니다.",
    "혼인·출산 공제는 통합 평생 1억원 한도와 기간 요건을 사용자가 충족한다고 입력한 범위만 반영합니다.",
  ];
  result.unsupported = [
    { label: "창업자금·가업승계 과세특례", reason: "특례 한도와 사후관리 요건이 달라 이 간편계산에서 제외합니다." },
    { label: "부동산 부담부증여의 양도소득세", reason: "증여세와 별도 세목으로 분리 계산해야 합니다." },
  ];
  return result;
}

function fullYearsBetween(start: string, end: string): number | null {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate <= startDate) return null;
  let years = endDate.getFullYear() - startDate.getFullYear();
  const anniversary = new Date(startDate);
  anniversary.setFullYear(startDate.getFullYear() + years);
  if (anniversary > endDate) years -= 1;
  return Math.max(0, years);
}

function longTermDeductionRate(assetType: CapitalGainsInput["assetType"], heldYears: number, residenceYears: number | null): number {
  if (heldYears < 3) return 0;
  if (assetType === "oneHome") {
    const holdingRate = Math.min(40, heldYears * 4);
    const residenceRate = Math.min(40, Math.max(0, residenceYears ?? 0) * 4);
    return Math.min(80, holdingRate + residenceRate);
  }
  return Math.min(30, heldYears * 2);
}

export function calculateCapitalGainsTax(input: CapitalGainsInput): SimpleCalculationResult {
  const result = base("capitalGains", "양도소득세 간편계산", "양도소득세");
  result.references = [
    { label: "국세청 양도소득세 세액계산 흐름도", url: "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7709&mi=2446" },
    { label: "국세청 양도소득세 세율", url: "https://b.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7711&mi=2312" },
    { label: "국세청 양도소득 기본공제 신고서식 안내", url: "https://www.nts.go.kr/tax/sub/1.2.3.%EC%96%91%EB%8F%84%EC%86%8C%EB%93%9D%EA%B3%BC%EC%84%B8%ED%91%9C%EC%A4%80%20%EC%8B%A0%EA%B3%A0%20%EB%B0%8F%20%EB%82%A9%EB%B6%80%EA%B3%84%EC%82%B0%EC%84%9C.html" },
  ];
  const m = result.missing;
  const heldYears = fullYearsBetween(input.acquisitionDate, input.transferDate);
  if (heldYears === null) m.push("취득일과 양도일을 올바르게 입력해 주세요.");
  const sale = requireMoney(input.salePriceWon, "양도가액", m);
  const purchase = requireMoney(input.purchasePriceWon, "취득가액", m);
  const expense = requireMoney(input.necessaryExpenseWon, "필요경비", m);
  const otherGain = requireMoney(input.otherCapitalGainWon, "같은 해 다른 양도소득금액", m);
  const usedBasic = requireMoney(input.basicDeductionUsedWon, "이미 사용한 양도소득 기본공제", m);
  const homeCount = requireCount(input.homeCount, "보유 주택 수", m, 0, 20);
  addUnsupported(result.unsupported, input.assetType === "otherUnsupported", "분양권·입주권·비사업용 토지 등", "자산별 중과·특례가 달라 현재 직접 계산 범위에서 제외합니다.");
  addUnsupported(result.unsupported, input.assetType === "oneHome" && homeCount !== null && homeCount > 1, "다주택·일시적 2주택", "중과 배제·특례 판단이 필요해 미검증으로 구분합니다.");
  addUnsupported(result.unsupported, input.assetType === "oneHome" && input.regulatedArea, "조정대상지역 주택", "현행 중과 유예·특례 여부 확인이 필요합니다.");
  if (m.length || result.unsupported.some((item) => item.label !== "분양권·입주권·비사업용 토지 등" ? false : input.assetType === "otherUnsupported")) {
    if (result.unsupported.length) result.status = "unsupported";
    return result;
  }

  const gain = sale! - purchase! - expense!;
  const positiveGain = Math.max(0, gain);
  const rate = longTermDeductionRate(input.assetType, heldYears!, input.residenceYears);
  const longTermDeduction = percent(positiveGain, rate);
  const capitalIncome = Math.max(0, positiveGain - longTermDeduction + otherGain!);
  const remainingBasicDeduction = Math.max(0, BASIC_CAPITAL_DEDUCTION - usedBasic!);
  const appliedBasicDeduction = Math.min(capitalIncome, remainingBasicDeduction);
  const taxableBaseWon = Math.max(0, capitalIncome - appliedBasicDeduction);
  const shortTermRate = heldYears! < 1 ? 50 : heldYears! < 2 && input.assetType !== "oneHome" ? 40 : null;
  const grossTaxWon = shortTermRate === null ? ordinaryCapitalTax(taxableBaseWon).grossTaxWon : percent(taxableBaseWon, shortTermRate);
  const rateLabel = shortTermRate === null ? ordinaryCapitalTax(taxableBaseWon).rateLabel : `${shortTermRate}% 단기보유 세율`;
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
  ];
  return result;
}
