import { baseComparison, integer, money, ordinaryTax, requireYes, roundPayment } from "./common";
import type { TaxCase, TaxComparison, TaxComparisonInput } from "./types";

const EOK = 100_000_000;
const BASIC_CAPITAL_DEDUCTION = 2_500_000;
const ADULT_CHILD_DEDUCTION = 50_000_000;
const SPECIAL_BUSINESS_DEDUCTION = 10 * EOK;
const SPECIAL_BUSINESS_LOW_BRACKET = 120 * EOK;

function percent(won: number, rate: number): number {
  return Number(BigInt(won) * BigInt(rate) / BigInt(100));
}

/** 2023 onward ordinary capital-gains schedule; special asset/rate cases are excluded. */
function ordinaryCapitalTax(taxableWon: number): number {
  const brackets = [
    [14_000_000, 6, 0],
    [50_000_000, 15, 1_260_000],
    [88_000_000, 24, 5_760_000],
    [150_000_000, 35, 15_440_000],
    [300_000_000, 38, 19_940_000],
    [500_000_000, 40, 25_940_000],
    [1_000_000_000, 42, 35_940_000],
    [Infinity, 45, 65_940_000],
  ] as const;
  const [, rate, offset] = brackets.find(([ceiling]) => taxableWon <= ceiling)!;
  return Math.max(0, percent(taxableWon, rate) - offset);
}

function capitalCase(
  id: string,
  label: string,
  saleWon: number,
  purchaseWon: number,
  expenseWon: number,
  completedYears: number,
): TaxCase {
  const gainWon = saleWon - purchaseWon - expenseWon;
  const positiveGainWon = Math.max(0, gainWon);
  const holdingRate = completedYears < 3 ? 0 : Math.min(30, completedYears * 2);
  const holdingDeductionWon = percent(positiveGainWon, holdingRate);
  const incomeWon = positiveGainWon - holdingDeductionWon;
  const basicDeductionWon = Math.min(incomeWon, BASIC_CAPITAL_DEDUCTION);
  const taxableWon = Math.max(0, incomeWon - basicDeductionWon);
  const grossTaxWon = ordinaryCapitalTax(taxableWon);
  const nationalTaxWon = roundPayment(grossTaxWon);
  // In this scoped case there are no credits/reductions. Apply the local ordinary
  // schedule to the same base (1/10 national gross), not to rounded national tax.
  const localTaxWon = roundPayment(Math.floor(grossTaxWon / 10));
  return {
    id, label, taxableWon, grossTaxWon, creditWon: 0, nationalTaxWon, localTaxWon,
    totalTaxWon: nationalTaxWon + localTaxWon,
    lines: [
      { label: "양도가액", amountWon: saleWon },
      { label: "취득가액 차감", amountWon: purchaseWon },
      { label: "인정 필요경비 차감", amountWon: expenseWon },
      { label: "양도차익", amountWon: gainWon },
      { label: `장기보유특별공제 (${holdingRate}%)`, amountWon: holdingDeductionWon, note: `만 ${completedYears}년 보유 기준` },
      { label: "양도소득 기본공제", amountWon: basicDeductionWon, note: "해당 연도 다른 양도가 없어 연 250만원 한도 전액 사용 가능" },
      { label: "과세표준", amountWon: taxableWon },
      { label: "양도소득세", amountWon: nationalTaxWon },
      { label: "개인지방소득세", amountWon: localTaxWon },
    ],
    assumptions: [
      "국내 거주자 1인이 전부 소유한 등기된 비주거용 일반 건물 1건을 양도합니다.",
      "일반 누진세율 및 일반 장기보유특별공제 적용 대상이며, 입력한 필요경비는 세법상 인정됩니다.",
      "해당 연도 다른 양도·손익통산·기본공제 사용이 없고, 세액공제·감면이 없습니다.",
      ...(gainWon < 0 ? ["양도손실은 이번 건의 세액을 0원으로 계산하며, 다른 거래와의 손익통산은 포함하지 않습니다."] : []),
    ],
  };
}

function captureScope(comparison: TaxComparison, input: TaxComparisonInput, scopeLabel: string): void {
  requireYes(input.values, "resident", "국내 거주자 여부", comparison.missing);
  requireYes(input.values, "standardCase", scopeLabel, comparison.missing);
  if (input.values.resident === "no" || input.values.standardCase === "no") {
    comparison.status = "unsupported";
  }
}

export function compareCapitalGains(input: TaxComparisonInput): TaxComparison {
  const result = baseComparison("capital_gains", "건물 양도 시점별 예상 세액 비교", "일반 비주거용 건물 1건의 양도소득세·개인지방소득세");
  result.references = [
    { label: "국세청 양도소득세 계산 흐름", url: "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7709&mi=2310" },
    { label: "국세청 양도소득세 세율", url: "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7711&mi=2312" },
    { label: "국세청 장기보유특별공제율", url: "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7710&mi=2311" },
    { label: "지방세법 제103조의3", url: "https://www.law.go.kr/LSW/lsLawLinkInfo.do?chrClsCd=010202&lsId=001649&lsJoLnkSeq=1000899162&print=print" },
  ];
  result.exclusions = [
    "주택·토지·비사업용 토지·미등기 자산·2년 미만 보유·이월과세·부담부증여·공동소유·같은 해 다른 양도",
    "취득세·부가가치세·보유세·향후 가격변동·추가 보유비용·특별 세액공제 및 감면",
  ];
  result.assumptions = [
    "양도 시점 비교는 동일한 건물·양도가액·취득가액·필요경비를 사용합니다.",
    "1년 추가 보유안은 보유기간만 만 1년 증가시키고 현행 법령과 가격이 그대로 유지된다는 조건부 계산입니다. 미래 절세액이나 수익을 보장하지 않습니다.",
    "국세와 지방소득세는 각각 10원 미만을 버립니다. 양도소득세에 신고세액공제 3%를 적용하지 않습니다.",
  ];
  captureScope(result, input, "일반 비주거용 건물 1건의 지원 조건 확인");
  const saleWon = money(input.values, "salePrice", "양도가액", result.missing);
  const purchaseWon = money(input.values, "purchasePrice", "취득가액", result.missing);
  const expenseWon = money(input.values, "expenses", "인정 필요경비", result.missing);
  const heldYears = integer(input.values, "heldYears", "완료한 보유 연수 (2년 이상)", result.missing, 2, 99);
  if (result.status === "unsupported" || result.missing.length || saleWon === null || purchaseWon === null || expenseWon === null || heldYears === null) return result;
  result.baseline = capitalCase("capital-now", "현재 보유기간에 양도", saleWon, purchaseWon, expenseWon, heldYears);
  result.alternatives = [capitalCase("capital-plus-one-year", "만 1년 추가 보유 후 양도", saleWon, purchaseWon, expenseWon, heldYears + 1)];
  result.status = "ready";
  return result;
}

export function compareBusinessGift(input: TaxComparisonInput): TaxComparison {
  const result = baseComparison("business_succession", "가업주식 증여 방식 비교", "성년 자녀 1명에게 전액 특례 요건을 충족하는 가업주식을 증여할 때의 증여세");
  result.references = [
    { label: "조세특례제한법 제30조의6", url: "https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1033268799" },
    { label: "상속세 및 증여세법 제55조 과세최저한", url: "https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1024572777" },
    { label: "가업승계 증여세 과세특례 계산 서식·작성방법", url: "https://law.go.kr/LSW/flDownload.do?bylClsCd=110202&flSeq=154042571&gubun=" },
    { label: "국세청 증여세 계산 흐름", url: "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7728&mi=2340" },
  ];
  result.exclusions = [
    "가업상속공제·가업 외 자산·여러 수증자·기존 증여 합산·특례 한도 초과분과 일반 증여의 혼합 계산",
    "과점주주 간주취득세·향후 상속 합산세액·사후관리 위반 추징세액·주식 처분 시 세액",
  ];
  result.assumptions = [
    "일반 증여와 과세특례는 동일한 주식 전부의 평가액을 비교하며, 입력 평가액 전체가 특례 적용 대상 가업자산에 해당합니다.",
    "국내 거주 성년 자녀(19세 이상) 1명에게 증여하며, 직전 10년 증여 및 기존 가업승계 특례 적용이 없고 일반 증여재산공제 5천만원 전액을 사용할 수 있습니다.",
    "60세 이상 부모, 가업 영위 기간, 기업 규모·업종·지분 보유·대표자 재직, 수증자의 가업 종사·대표 취임 및 사후관리 등 모든 적용 요건을 확인한 조건부 계산입니다.",
    "기한 내 신고 및 특례 신청을 가정합니다. 일반 증여만 신고세액공제 3%를 적용하고 가업승계 특례에는 적용하지 않습니다.",
    "수증자가 자신의 별도 재원으로 증여세를 납부하며, 증여자의 세금 대납은 없습니다.",
  ];
  captureScope(result, input, "성년 자녀 1명·가업주식 전액의 특례 요건 확인");
  const businessWon = money(input.values, "businessValue", "전액 특례 요건을 충족한 가업주식 평가액", result.missing);
  const businessYears = integer(input.values, "businessYears", "가업 영위 연수 (10년 이상)", result.missing, 10, 99);
  if (result.status === "unsupported" || result.missing.length || businessWon === null || businessYears === null) return result;
  const capWon = (businessYears >= 30 ? 600 : businessYears >= 20 ? 400 : 300) * EOK;
  if (businessWon > capWon) {
    result.status = "unsupported";
    result.missing.push(`가업 영위 ${businessYears}년의 증여재산가액 한도 ${capWon / EOK}억원을 초과합니다. 초과분의 일반 증여세까지 합산하는 별도 계산이 필요합니다.`);
    return result;
  }
  const ordinaryTaxableWon = Math.max(0, businessWon - ADULT_CHILD_DEDUCTION);
  const ordinary = ordinaryTax(ordinaryTaxableWon, true);
  result.baseline = {
    id: "business-ordinary-gift", label: "일반 증여", taxableWon: ordinaryTaxableWon,
    ...ordinary, localTaxWon: 0, totalTaxWon: ordinary.nationalTaxWon,
    lines: [
      { label: "증여주식 평가액", amountWon: businessWon },
      { label: "성년 자녀 증여재산공제", amountWon: Math.min(businessWon, ADULT_CHILD_DEDUCTION) },
      { label: "과세표준", amountWon: ordinaryTaxableWon },
      { label: "산출세액", amountWon: ordinary.grossTaxWon },
      { label: "신고세액공제 (3%)", amountWon: ordinary.creditWon },
      { label: "납부 예상 증여세", amountWon: ordinary.nationalTaxWon },
    ],
    assumptions: ["성년 자녀 증여재산공제 5천만원 및 기한 내 신고세액공제 3%를 적용합니다."],
  };
  const specialTaxableWon = Math.max(0, businessWon - SPECIAL_BUSINESS_DEDUCTION);
  const lowBracketWon = Math.min(specialTaxableWon, SPECIAL_BUSINESS_LOW_BRACKET);
  const highBracketWon = Math.max(0, specialTaxableWon - SPECIAL_BUSINESS_LOW_BRACKET);
  // Article 30-6 overrides deductions/rates, not Gift Tax Act 55(2).
  const belowMinimum = specialTaxableWon < 500_000;
  const lowBracketTaxWon = belowMinimum ? 0 : percent(lowBracketWon, 10);
  const highBracketTaxWon = belowMinimum ? 0 : percent(highBracketWon, 20);
  const grossTaxWon = lowBracketTaxWon + highBracketTaxWon;
  const nationalTaxWon = roundPayment(grossTaxWon);
  result.alternatives = [{
    id: "business-special-gift", label: "가업승계 증여세 과세특례", taxableWon: specialTaxableWon,
    grossTaxWon, creditWon: 0, nationalTaxWon, localTaxWon: 0, totalTaxWon: nationalTaxWon,
    lines: [
      { label: "증여주식 평가액", amountWon: businessWon },
      { label: "증여재산가액 적용 한도", amountWon: capWon, note: "10억원 공제 전 평가액 기준이며, 공제액이 아닙니다." },
      { label: "가업승계 특례 공제", amountWon: Math.min(businessWon, SPECIAL_BUSINESS_DEDUCTION) },
      { label: "과세표준", amountWon: specialTaxableWon },
      { label: "과세표준 120억원 이하 세액 (10%)", amountWon: lowBracketTaxWon, ...(belowMinimum ? { note: "과세표준 50만원 미만으로 증여세를 부과하지 않습니다." } : {}) },
      { label: "과세표준 120억원 초과 세액 (20%)", amountWon: highBracketTaxWon },
      { label: "신고세액공제 (적용 안 함)", amountWon: 0 },
      { label: "납부 예상 증여세", amountWon: nationalTaxWon },
    ],
    assumptions: [
      `가업 ${businessYears}년 영위에 따른 증여재산가액 한도 ${capWon / EOK}억원 이내입니다.`,
      "10억원 공제 후 과세표준 120억원까지 10%, 초과분에 20%를 적용합니다.",
      "특례 적용 후 사후관리 및 추후 상속 시 정산이 남아 있어 이번 증여세 차이가 생애 전체 절세액은 아닙니다.",
    ],
  }];
  result.status = "ready";
  return result;
}
