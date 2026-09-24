import type {
  CapitalGainsInput,
  GiftInput,
  InheritanceInput,
  SimpleCalculationResult,
  SimpleTaxKind,
  UnsupportedItem,
} from "./types";

export const SIMPLE_CALCULATOR_CHECKED_ON = "2026-09-19";
// An explicitly reviewed input window, not a claim that the tax law expires here.
// Do not derive either value from the build date or current clock.
export const SIMPLE_CALCULATOR_SUPPORTED_THROUGH = "2026-09-19";

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
  else addUnsupported(result.unsupported, value < start || value > SIMPLE_CALCULATOR_SUPPORTED_THROUGH,
    label, `${start}부터 ${SIMPLE_CALCULATOR_SUPPORTED_THROUGH}까지의 입력일을 지원합니다. 그 밖의 날짜는 적용 기준 검토가 완료되지 않았습니다.`);
}

function anniversary(value: string, years: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year + years, month, 0)).getUTCDate();
  return `${year + years}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function deemedAssetTotals(input: InheritanceInput, result: SimpleCalculationResult) {
  const parts = input.deemedAssetBreakdown;
  const m = result.missing;
  let estate = 0;
  let financial = 0;
  if (!Array.isArray(parts)) {
    if (parts === undefined && input.deemedAssetsWon === 0) return { estate, financial };
    m.push("퇴직금·보험금·신탁재산 등: 종류별 상속재산 포함액과 금융공제 대상액을 확인해 주세요.");
    return { estate, financial };
  }
  if (parts.length > 4) m.push("퇴직금·보험금·신탁재산 등: 종류별 합계로 4개 이내 입력해 주세요.");
  const ids = new Set<string>();
  for (const part of parts) {
    if (!part || typeof part !== "object") { m.push("퇴직금·보험금·신탁재산 등: 재산 분류를 확인해 주세요."); continue; }
    const label = { insurance: "보험금", retirement: "사망 후 퇴직급여", moneyTrust: "금전신탁", other: "기타 간주상속재산" }[part.kind];
    if (!label || !part.id || ids.has(part.id)) m.push("퇴직금·보험금·신탁재산 등: 종류 또는 식별자가 올바르지 않습니다.");
    ids.add(part.id);
    const included = requireMoney(part.estateIncludedWon, `${label} 상속재산 포함액`, m);
    const eligible = requireMoney(part.financialEligibleWon, `${label} 금융공제 대상액`, m);
    if (part.classification !== "confirmed" && part.classification !== "unsupported") m.push(`${label} 분류 확인: 상속재산 포함 범위와 금융공제 성격을 확인해 주세요.`);
    addUnsupported(result.unsupported, part.classification === "unsupported" || (part.classification === "confirmed" && part.kind === "other"), `${label} 분류 확인`, "특수 계약·기타 간주재산은 포함 범위와 금융공제 성격의 별도 검토가 필요합니다.");
    const supportedSubtype = { insurance: "financial_institution_death_insurance", retirement: "post_death_retirement_benefit_not_eligible", moneyTrust: "financial_institution_money_trust", other: "" }[part.kind];
    if (part.classification === "confirmed" && part.subtype !== supportedSubtype) m.push(`${label} 분류 확인: 지원하는 재산 유형인지 확인해 주세요.`);
    if (included !== null && eligible !== null) {
      if (eligible > included) m.push(`${label} 금융공제 대상액: 상속재산 포함액을 초과할 수 없습니다.`);
      if (part.kind === "retirement" && eligible !== 0) m.push("사망 후 퇴직급여 금융공제 대상액: 지원하는 사망 후 지급 퇴직급여는 금융공제에서 제외됩니다.");
      estate += included;
      financial += eligible;
    }
  }
  requireMoney(estate, "간주상속재산 합계", m);
  if (input.deemedAssetsWon !== undefined && input.deemedAssetsWon !== estate) m.push("퇴직금·보험금·신탁재산 등: 기존 합계와 종류별 포함액이 일치하지 않습니다.");
  return { estate, financial };
}

export function calculateInheritanceTax(input: InheritanceInput): SimpleCalculationResult {
  const result = base("inheritance", "상속세 간편계산", "상속세");
  result.references = [
    { label: "국세청 사전증여 증여세액공제·신고세액공제", url: "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7959&mi=6531" },
    { label: "국세청 상속공제 항목별 설명", url: "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7956&mi=6528" },
    { label: "상속세 및 증여세법 제22조 (2025-10-01 시행 판본)", url: "https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0022&lsiSeq=276123&urlMode=lsScJoRltInfoR" },
    { label: "국세청 보험금의 금융재산 상속공제 (재산세과-843, 2009-11-24)", url: "https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=010000000000137520" },
    { label: "국세청 사망 후 퇴직연금의 금융공제 제외 (상속증여세과-615, 2013-12-10)", url: "https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=010000000000152375" },
    { label: "상속세 및 증여세법 제69조 신고세액공제", url: "https://www.law.go.kr/LSW//lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0069&lsiSeq=276123&urlMode=lsScJoRltInfoR" },
  ];

  const m = result.missing;
  checkCalculationDate(input.deathDate, "상속개시일", "2023-01-01", result);
  if (input.spouse !== "yes" && input.spouse !== "no") m.push("배우자 여부: 확인해 주세요.");
  if (typeof input.spouseSoleHeir !== "boolean") m.push("가족관계: 배우자 단독 상속인 여부를 확인해 주세요.");
  const childrenCount = requireCount(input.childrenCount, "자녀 수", m, 0, 20);
  const seniorCount = requireCount(input.seniorCount, "연로자 수", m, 0, 20);
  const realEstate = requireMoney(input.realEstateWon, "부동산가액", m);
  const financialAssets = requireMoney(input.financialAssetsWon, "금융재산가액", m);
  const financialExclusions = requireMoney(input.financialExclusionsWon, "금융재산 중 공제 제외 금액", m);
  const otherAssets = requireMoney(input.otherAssetsWon, "기타재산가액", m);
  const deemed = deemedAssetTotals(input, result);
  const deemedAssets = deemed.estate;
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
  if (nonTaxable !== null && nonTaxable > 0 && (deemed.financial > 0 || (financialAssets ?? 0) > 0)) {
    if (input.nonTaxableFinancialOverlap !== "no" && input.nonTaxableFinancialOverlap !== "yes") m.push("비과세 재산과 금융공제 중복 여부: 불산입액이 공제 대상 금융재산에 포함되는지 확인해 주세요.");
    addUnsupported(result.unsupported, input.nonTaxableFinancialOverlap === "yes", "비과세 재산과 금융공제 중복 여부", "비과세·불산입 금융재산의 배분 계산은 별도 검토가 필요합니다.");
  }
  if (input.spouse === "yes" && (!input.statutoryShareNumerator || !input.statutoryShareDenominator)) {
    m.push("배우자 법정지분율의 분자와 분모를 입력해 주세요.");
  }
  if (financialDebt !== null && debt !== null && financialDebt > debt) m.push("총채무 중 금융채무 금액: 총채무를 초과할 수 없습니다.");
  if (financialExclusions !== null && financialAssets !== null && financialExclusions > financialAssets) {
    m.push("금융재산 중 공제 제외 금액: 금융재산가액을 초과할 수 없습니다.");
  }
  const gifts = input.priorGifts;
  if (!Array.isArray(gifts)) m.push("상속 전 사전증여: 수증자별 신고 내역을 확인해 주세요.");
  else {
    if (gifts.length > 21) m.push("사전증여 수증자 수: 21명 이하로 입력해 주세요.");
    gifts.forEach((gift, index) => {
      const label = `사전증여 ${index + 1}`;
      const amount = requireMoney(gift.amountWon, `${label} 증여재산가액`, m);
      const taxable = requireMoney(gift.taxableBaseWon, `${label} 신고 과세표준`, m);
      const calculatedTax = requireMoney(gift.calculatedTaxWon, `${label} 신고 산출세액`, m);
      if (!["spouse", "child", "other"].includes(gift.recipient ?? "")) m.push(`${label} 수증자: 관계를 선택해 주세요.`);
      if (!["cash", "other"].includes(gift.propertyKind ?? "")) m.push(`${label} 재산 종류: 현금 증여 여부를 확인해 주세요.`);
      addUnsupported(result.unsupported, gift.propertyKind === "other", `${label} 재산 종류`, "사전증여 세액공제는 별도 평가비용·부담부채무가 없는 일반 현금증여 신고 내역부터 지원합니다. 부동산·주식 등은 별도 검토가 필요합니다.");
      addUnsupported(result.unsupported, gift.recipient === "other", `${label} 수증자`, "상속인 외 수증자·손자녀·과세특례가 섞인 사전증여는 수증자별 별도 계산이 필요합니다. 현재는 배우자와 자녀의 일반 증여 신고 내역만 지원합니다.");
      if (gift.creditEligible !== "yes" && gift.creditEligible !== "no") m.push(`${label} 공제요건 확인: 신고 내역과 부과제척기간 만료 여부를 확인해 주세요.`);
      if (amount === 0) m.push(`${label} 증여재산가액: 증여가 있는 수증자의 금액을 입력해 주세요.`);
      if (amount !== null && taxable !== null && taxable > amount) m.push(`${label} 신고 과세표준: 해당 증여재산가액을 초과할 수 없습니다.`);
      if (taxable === 0 && calculatedTax !== null && calculatedTax > 0) m.push(`${label} 신고 산출세액: 과세표준이 0원이면 산출세액도 0원이어야 합니다.`);
      if (taxable !== null && calculatedTax !== null && calculatedTax > percent(taxable, 50)) m.push(`${label} 신고 산출세액: 일반세율 범위를 초과합니다. 과세특례·할증 또는 합산 내역을 확인해 주세요.`);
    });
    if (gifts.filter(gift => gift.recipient === "spouse").length > (input.spouse === "yes" ? 1 : 0)) m.push("사전증여 수증자 수: 배우자 내역은 배우자가 있을 때 한 명만 입력합니다.");
    if (childrenCount !== null && gifts.filter(gift => gift.recipient === "child").length > childrenCount) m.push("사전증여 수증자 수: 자녀 수를 초과했습니다. 같은 수증자의 내역은 합산 신고서 기준 한 번만 입력합니다.");
    if (!m.length) {
      const sum = (recipient: "spouse" | "child" | "other", key: "amountWon" | "taxableBaseWon") => gifts.filter(gift => gift.recipient === recipient).reduce((total, gift) => total + gift[key]!, 0);
      if (sum("spouse", "amountWon") !== priorGiftSpouse || sum("child", "amountWon") !== priorGiftHeirs || sum("other", "amountWon") !== priorGiftOthers || sum("spouse", "taxableBaseWon") !== spousePriorTaxable) {
        m.push("상속 전 사전증여: 수증자별 내역과 합산 금액이 일치하지 않습니다.");
      }
    }
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
  const eligibleFinancialAssets = financialAssets! - financialExclusions! + deemed.financial;
  const netFinancial = Math.max(0, eligibleFinancialAssets - financialDebt!);
  const financialDeduction = netFinancial <= 20_000_000
    ? netFinancial
    : Math.min(200_000_000, Math.max(20_000_000, percent(netFinancial, 20)));
  const itemizedDeduction = 200_000_000 + childrenCount! * 50_000_000 + minorDeduction! + seniorCount! * 50_000_000 + disabledDeduction!;
  const personalDeduction = input.spouseSoleHeir ? itemizedDeduction : Math.max(500_000_000, itemizedDeduction);
  const spouseLegalLimit = input.spouse === "yes"
    ? Math.max(0, ratio(Math.max(0, totalAssets + priorGiftSpouse! + priorGiftHeirs! - nonTaxable! - debt! - publicCharges!), input.statutoryShareNumerator!, input.statutoryShareDenominator!) - spousePriorTaxable!)
    : 0;
  const spouseDeduction = input.spouse === "yes"
    ? Math.max(500_000_000, Math.min(spouseActual!, spouseLegalLimit, 3_000_000_000))
    : 0;
  const grossDeductions = personalDeduction + spouseDeduction + financialDeduction;
  const priorGiftTaxable = gifts!.reduce((total, gift) => total + gift.taxableBaseWon!, 0);
  const deductionLimit = Math.max(0, taxableEstate - (taxableEstate > 500_000_000 ? priorGiftTaxable : 0));
  const appliedDeductions = Math.min(deductionLimit, grossDeductions);
  const taxableBaseWon = Math.max(0, taxableEstate - appliedDeductions);
  const tax = ordinaryInheritanceGiftTax(taxableBaseWon, false);
  // With heir-only gifts, each heir's taxable-base share cancels between
  // Enforcement Decree art. 3 allocation and Act art. 28(2)'s individual cap.
  const priorGiftCredit = taxableEstate <= 500_000_000 ? 0 : Math.min(tax.grossTaxWon, gifts!.reduce((total, gift) => total + (gift.creditEligible === "yes"
    ? Math.min(gift.calculatedTaxWon!, ratio(tax.grossTaxWon, gift.taxableBaseWon!, taxableBaseWon)) : 0), 0));
  const filingCredit = percent(tax.grossTaxWon - priorGiftCredit, 3);
  const nationalTaxWon = roundPayment(tax.grossTaxWon - priorGiftCredit - filingCredit);

  result.status = result.missing.length ? "needs_info" : "ready";
  result.taxableBaseWon = taxableBaseWon;
  result.grossTaxWon = tax.grossTaxWon;
  result.creditWon = priorGiftCredit + filingCredit;
  result.nationalTaxWon = nationalTaxWon;
  result.totalTaxWon = nationalTaxWon;
  result.lines = [
    { label: "총 상속재산", amountWon: totalAssets },
    { label: "비과세·과세가액 불산입", amountWon: -nonTaxable! },
    { label: "사전증여재산 가산", amountWon: priorGiftSpouse! + priorGiftHeirs! + priorGiftOthers! },
    { label: "채무·공과금 차감", amountWon: -(debt! + publicCharges!) },
    { label: "장례비·봉안시설 비용 공제", amountWon: -(funeralDeduction + burialDeduction), note: "일반 장례비 500만원~1,000만원, 봉안시설 등 500만원 한도" },
    { label: "상속세 과세가액", amountWon: taxableEstate },
    { label: "인적공제 또는 일괄공제", amountWon: -personalDeduction },
    { label: "배우자 상속공제", amountWon: -spouseDeduction, note: input.spouse === "yes" ? `입력 상속액·법정지분 한도·30억원 한도 기준` : "배우자 없음" },
    { label: "별도 금융재산", amountWon: financialAssets! },
    { label: "간주상속재산 중 금융공제 대상액", amountWon: deemed.financial },
    { label: "금융공제 제외 재산", amountWon: -financialExclusions! },
    { label: "금융채무", amountWon: -financialDebt!, note: "총채무에 포함된 금액입니다. 과세가액에서는 총채무로 한 번만 차감됩니다." },
    { label: "공제 대상 순금융재산", amountWon: netFinancial },
    { label: "금융재산 상속공제", amountWon: -financialDeduction, note: "별도 금융재산 - 공제 제외액 + 확인된 보험금·금전신탁 대상액 - 금융채무. 사전증여 금융재산은 포함하지 않습니다." },
    { label: "상속공제 적용 합계", amountWon: -appliedDeductions, note: `공제 한도 ${formatWon(deductionLimit)}. 과세가액 5억원 초과 시 합산 사전증여 과세표준을 한도에서 차감합니다.` },
    { label: "과세표준", amountWon: taxableBaseWon },
    { label: `산출세액 (${tax.rateLabel})`, amountWon: tax.grossTaxWon },
    { label: "사전증여 증여세액공제", amountWon: -priorGiftCredit, note: "수증자별 신고 산출세액과 법정 한도 중 작은 금액. 과세가액 5억원 이하 또는 부과제척기간 만료분은 제외" },
    { label: "신고세액공제 3%", amountWon: -filingCredit },
    { label: "예상 납부 상속세", amountWon: nationalTaxWon },
  ];
  result.assumptions = [
    "피상속인은 거주자이고, 유증·상속인 외 수유자·상속포기 특례는 없다고 가정합니다.",
    "재산가액은 사용자가 이미 세법상 평가한 금액이며, 이 화면은 재산평가 서비스를 제공하지 않습니다.",
    "배우자 상속재산 분할과 신고 요건을 기한 내 충족하는 것으로 계산합니다.",
    "사전증여는 배우자·자녀의 일반 현금증여 신고 내역만 지원합니다. 피상속인에게 받은 합산 대상만 포함된 수증자별 신고 과세표준과 산출세액을 사용하며, 재차증여 신고서를 중복 합산하지 않습니다.",
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
    { label: "상증세법 제53조의2 혼인·출산 공제 (2025-10-01 시행 판본)", url: "https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=02&joNo=0053&lsiSeq=276123&urlMode=lsScJoRltInfoR" },
    { label: "상증세법 제55조 과세표준 (2025-10-01 시행 판본)", url: "https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0055&lsiSeq=276123&urlMode=lsScJoRltInfoR" },
    { label: "상증세법 제58조 납부세액공제 (2025-10-01 시행 판본)", url: "https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0058&lsiSeq=276123&urlMode=lsScJoRltInfoR" },
    { label: "국세청 증여재산공제·세율·납부세액공제", url: "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7960&mi=6533" },
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
  const hasPastSpecial = (priorGift ?? 0) > 0 && input.priorGiftMarriageBirthStatus === "yes";
  const marriageBirthUsed = (marriageBirth ?? 0) > 0 || hasPastSpecial ? requireMoney(input.marriageBirthPreviouslyUsedWon, "이미 사용한 혼인·출산 공제", m) : 0;
  if (marriageBirthUsed !== null && marriageBirthUsed > 100_000_000) m.push("이미 사용한 혼인·출산 공제: 통합 1억원 한도를 초과할 수 없습니다.");
  if ((marriageBirth ?? 0) > 0) {
    addUnsupported(result.unsupported, !["linealAscendantAdult", "linealAscendantMinor"].includes(input.relationship), "혼인·출산 증여재산공제", "직계존속으로부터 받은 증여에만 적용됩니다.");
    if (input.marriageBirthEvent !== "marriage" && input.marriageBirthEvent !== "birth") m.push("혼인·출산 구분: 적용 사유를 선택해 주세요.");
    if (!input.marriageBirthEventDate || !validDate(input.marriageBirthEventDate)) m.push("혼인·출산 기준일: 올바른 날짜를 입력해 주세요.");
    else if (validDate(input.giftDate)) {
      const eventDate = input.marriageBirthEventDate;
      const withinPeriod = input.giftDate <= anniversary(eventDate, 2)
        && input.giftDate >= (input.marriageBirthEvent === "marriage" ? anniversary(eventDate, -2) : eventDate);
      addUnsupported(result.unsupported, !withinPeriod, "혼인·출산 기준일", "혼인일 전후 2년 또는 출생일·입양신고일부터 2년 이내 증여만 지원합니다.");
    }
  }
  const previousTax = requireMoney(input.previousTaxPaidWon, "종전 증여재산 산출세액", m);
  let preservedMarriageBirth = 0;
  let confirmedPriorBase: number | null = null;
  if (typeof input.generationSkip !== "boolean" || typeof input.minorOverTwoBillion !== "boolean") m.push("세대생략 할증 여부: 해당 여부를 확인해 주세요.");
  if ((priorGift ?? 0) > 0 && input.priorGiftMarriageBirthStatus !== "yes" && input.priorGiftMarriageBirthStatus !== "no") m.push("과거 혼인·출산 공제 이력: 합산하는 과거 증여의 공제 여부를 확인해 주세요.");
  if (!hasPastSpecial && (input.priorGiftMarriageBirthAppliedWon ?? 0) !== 0) m.push("과거 혼인·출산 공제액: 공제 이력 및 과거 증여 금액과 일치하지 않습니다.");
  if (hasPastSpecial) {
    const applied = requireMoney(input.priorGiftMarriageBirthAppliedWon ?? null, "과거 혼인·출산 공제액", m);
    confirmedPriorBase = requireMoney(input.priorGiftTaxableBaseWon ?? null, "과거 신고 과세표준", m);
    if (input.priorGiftHistoryConfirmed !== true && input.priorGiftHistoryConfirmed !== false) m.push("과거 신고·공제 유효성: 신고 내역과 공제의 유효성을 확인해 주세요.");
    if (input.ordinaryCashHistory !== true && input.ordinaryCashHistory !== false) m.push("일반 현금증여 이력: 단순 현금증여 여부를 확인해 주세요.");
    if (input.priorGiftDonor !== "sameFather" && input.priorGiftDonor !== "other") m.push("과거 증여자: 동일한 아버지의 증여인지 확인해 주세요.");
    addUnsupported(result.unsupported, input.priorGiftHistoryConfirmed === false || input.ordinaryCashHistory === false || input.priorGiftDonor === "other" || (Object.hasOwn(GIFT_DEDUCTIONS, input.relationship) && input.relationship !== "linealAscendantAdult") || (debt ?? 0) > 0 || (appraisal ?? 0) > 0,
      "과거 혼인·출산 공제 이력", "이번 지원 범위는 동일한 아버지에게 받은 성년 자녀의 유효한 일반 현금증여 신고입니다. 다른 증여자·중복 신고·부담부·평가비용·특례·공제 취소·수정 내역은 별도 검토가 필요합니다.");
    const date = input.priorGiftDate;
    const event = input.priorGiftMarriageBirthEvent;
    const eventDate = input.priorGiftMarriageBirthEventDate;
    if (!date || !validDate(date)) m.push("과거 증여일: 올바른 날짜를 입력해 주세요.");
    else if (validDate(input.giftDate)) {
      addUnsupported(result.unsupported, date < "2024-01-01" || date >= input.giftDate || date < anniversary(input.giftDate, -10), "과거 증여일", "2024-01-01 이후, 이번 증여 전 10년 내의 과거 증여만 지원합니다.");
    }
    if (event !== "marriage" && event !== "birth") m.push("과거 혼인·출산 구분: 공제 사유를 확인해 주세요.");
    if (!eventDate || !validDate(eventDate)) m.push("과거 혼인·출산 기준일: 올바른 날짜를 입력해 주세요.");
    else if (date && validDate(date) && validDate(input.giftDate)) {
      addUnsupported(result.unsupported, eventDate > input.giftDate || date > anniversary(eventDate, 2) || date < (event === "marriage" ? anniversary(eventDate, -2) : eventDate), "과거 혼인·출산 기준일", "유효한 혼인 전후 2년 또는 출생·입양 후 2년의 과거 증여만 지원합니다. 미혼인·취소·수정신고는 별도 확인이 필요합니다.");
    }
    if (applied !== null && priorGift !== null && priorDeduction !== null) {
      if (applied === 0 || applied > 100_000_000 || applied + priorDeduction > priorGift || (marriageBirthUsed !== null && applied > marriageBirthUsed)) m.push("과거 혼인·출산 공제액: 과거 재산·전체 사용액·1억원 한도를 확인해 주세요.");
      if (confirmedPriorBase !== null && confirmedPriorBase !== priorGift - priorDeduction - applied) m.push("과거 신고 과세표준: 과거 재산에서 일반공제와 혼인·출산 공제를 뺀 신고 내역과 다릅니다.");
      preservedMarriageBirth = priorGift >= 10_000_000 ? applied : 0;
    }
    if (confirmedPriorBase !== null && previousTax !== null && previousTax !== ordinaryInheritanceGiftTax(confirmedPriorBase, false).grossTaxWon) m.push("종전 증여재산 산출세액: 과거 신고 과세표준의 일반 산출세액과 다릅니다. 납부 영수증 금액·특례·중복 신고 여부를 확인해 주세요.");
  }
  const relation = Object.hasOwn(GIFT_DEDUCTIONS, input.relationship) ? GIFT_DEDUCTIONS[input.relationship] : undefined;
  if (!relation) m.push("증여자와 수증자의 관계를 선택해 주세요.");
  if (priorDeduction !== null && priorGift !== null && priorDeduction > priorGift) m.push("같은 증여자의 과거 증여에 적용한 공제: 과거 증여재산가액을 초과할 수 없습니다.");
  if (relation && priorDeduction !== null && otherDeduction !== null && priorDeduction + otherDeduction > relation.deductionWon) m.push("그 밖의 증여에서 사용한 같은 구분의 공제: 과거 사용 공제 합계가 관계별 10년 한도를 초과합니다.");
  addUnsupported(result.unsupported, (priorGift ?? 0) > 0 && (input.generationSkip || (marriageBirth ?? 0) > 0),
    "재차증여와 특수 공제·할증", "과거 증여와 이번 신규 혼인·출산 공제 또는 세대생략 할증을 결합한 계산은 별도 검토가 필요합니다.");
  addUnsupported(result.unsupported, (marriageBirth ?? 0) > 0 && input.giftDate < "2024-01-01", "혼인·출산 증여재산공제", "2024-01-01 이후 증여분부터 적용합니다.");
  if (result.unsupported.length) result.status = "unsupported";
  if (m.length || result.unsupported.length || !relation) return result;
  if (debt! > amount!) result.missing.push("수증자 인수 채무는 증여재산가액 이하여야 합니다.");
  const netGift = Math.max(0, amount! - debt!);
  const aggregatedPriorGift = priorGift! >= 10_000_000 ? priorGift! : 0;
  const aggregateGift = netGift + aggregatedPriorGift;
  const remainingBasicDeduction = Math.max(0, relation.deductionWon - priorDeduction! - otherDeduction!);
  const currentDeduction = Math.min(netGift, remainingBasicDeduction);
  const appliedBasicDeduction = (aggregatedPriorGift ? priorDeduction! : 0) + currentDeduction;
  const remainingMarriageBirth = Math.max(0, 100_000_000 - marriageBirthUsed!);
  const appliedMarriageBirth = Math.min(Math.max(0, aggregateGift - appliedBasicDeduction - preservedMarriageBirth), marriageBirth!, remainingMarriageBirth);
  const taxableBaseWon = Math.max(0, aggregateGift - appliedBasicDeduction - preservedMarriageBirth - appliedMarriageBirth - appraisal!);
  const aggregateTax = ordinaryInheritanceGiftTax(taxableBaseWon, false);
  const priorDeductionForCredit = priorDeduction! > 0 ? priorDeduction!
    : ratio(appliedBasicDeduction, aggregatedPriorGift, aggregateGift);
  const priorTaxable = hasPastSpecial ? (aggregatedPriorGift ? confirmedPriorBase! : 0) : Math.max(0, aggregatedPriorGift - priorDeductionForCredit);
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
    { label: "합산 증여 과세가액", amountWon: aggregateGift },
    { label: `${relation.label} 증여재산공제 적용`, amountWon: -appliedBasicDeduction, note: `합산된 과거 재산의 공제 ${formatWon(aggregatedPriorGift ? priorDeduction! : 0)} + 이번 공제 ${formatWon(currentDeduction)}. 다른 증여의 사용 공제 ${formatWon(otherDeduction!)}는 한도에서 차감합니다.` },
    { label: "합산 과거 혼인·출산 공제 보존", amountWon: -preservedMarriageBirth, note: "합산 대상 과거 재산에서 유효하게 적용한 금액입니다. 이번에 새로 부여한 공제가 아닙니다." },
    { label: "혼인·출산 추가 공제", amountWon: -appliedMarriageBirth, note: marriageBirth! > 0 ? `이번 신규 적용분. 통합 1억원 - 모든 증여자 이전 사용액 ${formatWon(marriageBirthUsed!)} = 남은 한도 ${formatWon(remainingMarriageBirth)}` : "이번 신규 적용 없음" },
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
    "혼인·출산 공제는 입력한 기준일과 통합 평생 1억원의 남은 한도를 적용합니다. 혼인일은 혼인신고일, 출산은 출생일 또는 입양신고일입니다. 혼인 예정 후 미혼인·혼인 무효 등은 별도 수정신고 확인이 필요합니다.",
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
    { label: "국세청 양도소득세 확정신고·합산 신고 안내", url: "https://www.nts.go.kr/nts/na/ntt/selectNttList.do?bbsId=131041&mi=2307" },
    { label: "국세청 1세대 1주택 비과세 요건", url: "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7707&mi=2308" },
    { label: "국세청 고가주택 안분 산식·공개 계산사례", url: "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=8799&mi=12271" },
    { label: "국세청 양도소득세 세액계산 흐름도", url: "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7709&mi=2310" },
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
  const otherGainMagnitude = requireMoney(input.otherCapitalGainWon === null ? null : Math.abs(input.otherCapitalGainWon), "같은 해 다른 양도소득금액", m);
  const otherGain = otherGainMagnitude === null ? null : input.otherCapitalGainWon!;
  const usedBasic = requireMoney(input.basicDeductionUsedWon, "이미 사용한 양도소득 기본공제", m);
  const paidNational = requireMoney(input.previousNationalTaxWon, "같은 해 이미 납부한 양도소득세", m);
  const paidLocal = requireMoney(input.previousLocalTaxWon, "같은 해 이미 납부한 지방소득세", m);
  if (typeof input.annualAggregation !== "boolean") m.push("같은 해 다른 양도소득금액: 다른 거래 여부를 확인해 주세요.");
  if (input.annualAggregation) {
    if (input.otherGainsGeneralRate !== "yes" && input.otherGainsGeneralRate !== "no") m.push("다른 양도 거래의 일반세율 확인: 모름이면 합산할 수 없습니다.");
    addUnsupported(result.unsupported, input.otherGainsGeneralRate === "no", "다른 양도 거래의 일반세율 확인", "국내 토지·건물의 일반세율 과세소득만 합산합니다. 단기·중과·감면·주식·국외자산 등이 섞이면 별도 세율 비교가 필요합니다.");
  } else if ((otherGain ?? 0) !== 0 || (usedBasic ?? 0) > 0 || (paidNational ?? 0) > 0 || (paidLocal ?? 0) > 0) {
    m.push("같은 해 다른 양도소득금액: 사용 공제나 납부세액이 있으면 해당 거래 소득까지 합산해 주세요.");
  }
  const isHome = input.assetType === "oneHome";
  if (!["generalBuilding", "land", "oneHome", "otherUnsupported"].includes(input.assetType)) m.push("자산 종류: 지원 자산 종류를 선택해 주세요.");
  addUnsupported(result.unsupported, isHome && input.annualAggregation, "같은 해 다른 양도소득금액", "주택 비과세·고가주택 안분과 연간 합산을 결합한 계산은 추가 검증이 필요합니다. 이번 연간 합산은 일반 건물·토지를 지원합니다.");
  const homeCount = isHome ? requireCount(input.homeCount, "세대 기준 보유 주택 수", m, 1, 20) : 0;
  const residence = isHome ? requireCount(input.residenceYears, "거주 연수", m, 0, 99) : 0;
  addUnsupported(result.unsupported, input.assetType === "otherUnsupported", "분양권·입주권·비사업용 토지 등", "자산별 중과·특례가 달라 현재 직접 계산 범위에서 제외합니다.");
  addUnsupported(result.unsupported, isHome && homeCount !== null && homeCount > 1, "세대 기준 보유 주택 수", "다주택·일시적 2주택의 중과·특례는 미지원입니다.");
  if (usedBasic !== null && usedBasic > BASIC_CAPITAL_DEDUCTION) m.push("이미 사용한 양도소득 기본공제: 연 250만원을 초과할 수 없습니다.");
  if (isHome) {
    if (input.homeOwnership !== "solePurchased" && input.homeOwnership !== "other") m.push("주택 소유·취득 형태를 선택해 주세요.");
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
  const taxableGain = exemptHome ? ratio(positiveGain, Math.max(0, sale! - 1_200_000_000), sale!) : gain;
  const rate = longTermDeductionRate(exemptHome, heldYears!, residence!);
  const fullLongTermDeduction = percent(positiveGain, rate);
  // The law apportions the gain and the full long-term deduction separately.
  const longTermDeduction = exemptHome ? ratio(fullLongTermDeduction, Math.max(0, sale! - 1_200_000_000), sale!) : fullLongTermDeduction;
  const capitalIncome = Math.max(0, taxableGain - longTermDeduction + otherGain!);
  // Aggregate income is before the basic deduction: keep the annual deduction
  // once, then subtract payments. Subtracting only the unused portion loses it.
  const appliedBasicDeduction = Math.min(capitalIncome, BASIC_CAPITAL_DEDUCTION);
  const taxableBaseWon = Math.max(0, capitalIncome - appliedBasicDeduction);
  const shortTermRate = heldYears! < 1 ? (isHome ? 70 : 50) : heldYears! < 2 ? (isHome ? 60 : 40) : null;
  addUnsupported(result.unsupported, shortTermRate !== null && input.annualAggregation, "같은 해 다른 양도소득금액", "단기보유 자산과 다른 양도소득이 섞인 세율 비교는 별도 계산이 필요합니다.");
  if (result.unsupported.length) { result.status = "unsupported"; return result; }
  const progressiveTax = ordinaryCapitalTax(taxableBaseWon, input.transferDate);
  const grossTaxWon = shortTermRate === null ? progressiveTax.grossTaxWon : Math.max(progressiveTax.grossTaxWon, percent(taxableBaseWon, shortTermRate));
  const rateLabel = shortTermRate === null ? progressiveTax.rateLabel : `기본세율과 단기 ${shortTermRate}% 중 큰 세액`;
  const annualNationalTax = roundPayment(grossTaxWon);
  const annualLocalTax = roundPayment(Math.floor(grossTaxWon / 10));
  const nationalTaxWon = annualNationalTax - paidNational!;
  const localTaxWon = annualLocalTax - paidLocal!;
  result.status = result.unsupported.length ? "unsupported" : "ready";
  result.taxableBaseWon = taxableBaseWon;
  result.grossTaxWon = grossTaxWon;
  result.nationalTaxWon = nationalTaxWon;
  result.localTaxWon = localTaxWon;
  result.totalTaxWon = nationalTaxWon + localTaxWon;
  result.annualAggregation = input.annualAggregation;
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
    { label: "공제 후 양도소득금액", amountWon: capitalIncome },
    { label: "양도소득 기본공제", amountWon: -appliedBasicDeduction, note: input.annualAggregation ? `연간 합산 소득에서 250만원 한 번 적용. 앞선 신고의 사용 공제 ${formatWon(usedBasic!)}를 중복 차감하지 않습니다.` : "연 250만원 한도" },
    { label: "과세표준", amountWon: taxableBaseWon },
    { label: `양도소득세 산출세액 (${rateLabel})`, amountWon: grossTaxWon },
    { label: "기납부 차감 전 국세", amountWon: annualNationalTax },
    { label: "개인지방소득세 산출세액", amountWon: annualLocalTax, note: "일반세율의 10% 수준으로 별도 표시" },
    ...(input.annualAggregation ? [
      { label: "기납부 양도소득세 차감", amountWon: -paidNational! },
      { label: "기납부 지방소득세 차감", amountWon: -paidLocal! },
      { label: "차가감 양도소득세", amountWon: nationalTaxWon },
      { label: "차가감 지방소득세", amountWon: localTaxWon },
    ] : []),
    { label: input.annualAggregation ? "추가 납부·환급 차액 합계" : "예상 납부세액 합계", amountWon: nationalTaxWon + localTaxWon },
  ];
  result.assumptions = [
    input.annualAggregation ? "같은 해 국내 토지·건물의 일반세율 과세소득(장기보유특별공제 후, 기본공제 전)을 합산합니다. 과세대상 양도차손은 통산하며 비과세 손실은 제외합니다. 음수 차액은 환급 예상액으로 신고·심사가 필요합니다." : "국내 거주자 1인이 보유한 부동산 1건의 일반 양도이며, 감면·이월과세·부담부증여는 제외합니다.",
    "취득가액과 필요경비는 세법상 인정되는 실지거래가액과 비용입니다.",
    "양도소득세에는 신고세액공제 3%를 적용하지 않습니다.",
    `기본세율은 양도일 ${input.transferDate} 기준 ${input.transferDate < "2023-01-01" ? "2021~2022년" : "2023년 이후"} 구간을 적용했습니다.`,
  ];
  result.scopeNotes = [{ label: "주택 계산 범위", reason: "거주자·매수한 단독 소유 주택의 일반 비과세와 12억원 초과 안분을 지원합니다. 공동명의·입주권·분양권·겸용·다주택 특례는 제외합니다." }];
  return result;
}
