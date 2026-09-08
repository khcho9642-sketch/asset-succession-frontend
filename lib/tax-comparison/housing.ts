import { baseComparison, integer, money, roundPayment } from "./common";
import type { TaxCase, TaxComparison, TaxComparisonInput } from "./types";

const EXEMPT_PRICE_WON = 1_200_000_000;
const BASIC_DEDUCTION_WON = 2_500_000;
const RELIEF_END = "2026-05-09";

type Day = { iso: string; year: number; month: number; day: number };
type Transition = { months: number; permitRequired: boolean; contract: Day; depositPaid: boolean; permitApplication: Day | null; permitApproved: boolean };
type HousingFacts = {
  saleWon: number; purchaseWon: number; expenseWon: number; acquisition: Day;
  residenceYears: number; houseCount: number; regulatedAtSale: boolean;
  regulatedAtAcquisition: boolean; singleHomeSpecial: boolean; transition: Transition | null;
};

function percent(won: number, rate: number): number {
  return Number(BigInt(won) * BigInt(rate) / BigInt(100));
}

function ordinaryCapitalTax(taxableWon: number, surcharge: number): number {
  const bands = [[14_000_000, 6, 0], [50_000_000, 15, 1_260_000], [88_000_000, 24, 5_760_000],
    [150_000_000, 35, 15_440_000], [300_000_000, 38, 19_940_000], [500_000_000, 40, 25_940_000],
    [1_000_000_000, 42, 35_940_000], [Infinity, 45, 65_940_000]] as const;
  const [, rate, deduction] = bands.find(([ceiling]) => taxableWon <= ceiling)!;
  // Section 104 adds percentage points to the rate before multiplication.
  // Separately flooring the ordinary and surcharge taxes can lose a won.
  return Math.max(0, percent(taxableWon, rate + surcharge) - deduction);
}

function yesNo(values: Record<string, string>, key: string, label: string, missing: string[]): boolean | null {
  if (values[key] === "yes") return true;
  if (values[key] === "no") return false;
  missing.push(`${label}: 예 또는 아니오를 확인해 주세요.`);
  return null;
}

function readDay(values: Record<string, string>, key: string, label: string, missing: string[]): Day | null {
  const iso = values[key]?.trim() ?? "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [year, month, day] = iso.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (year >= 1900 && year <= 9998 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      return { iso, year, month, day };
    }
  }
  missing.push(`${label}: 유효한 날짜를 YYYY-MM-DD 형식으로 입력해 주세요.`);
  return null;
}

/** Calendar anniversaries/month deadlines clamp to the target month's final day. */
function addMonths(date: Day, months: number): Day {
  const first = new Date(Date.UTC(date.year, date.month - 1 + months, 1));
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth() + 1;
  const day = Math.min(date.day, new Date(Date.UTC(year, month, 0)).getUTCDate());
  return { year, month, day, iso: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
}

/** Sections 95/104 count the acquisition day. A non-leap February end is
 * already the legal period end, so it must not be reduced a second time. */
function holdingPeriodEnd(acquisition: Day, years: number): string {
  const anniversary = addMonths(acquisition, years * 12);
  if (anniversary.day !== acquisition.day) return anniversary.iso;
  return new Date(Date.UTC(anniversary.year, anniversary.month - 1, anniversary.day - 1)).toISOString().slice(0, 10);
}

function completedYears(acquisition: Day, sale: Day): number {
  let years = Math.max(0, sale.year - acquisition.year);
  if (sale.iso >= holdingPeriodEnd(acquisition, years + 1)) years += 1;
  else if (years > 0 && sale.iso < holdingPeriodEnd(acquisition, years)) years -= 1;
  return years;
}

function transitionalRelief(facts: HousingFacts, sale: Day, heldYears: number): boolean {
  if (heldYears < 2) return false;
  if (sale.iso <= RELIEF_END) return true;
  const transition = facts.transition;
  if (!transition || !transition.depositPaid || transition.contract.iso > sale.iso) return false;
  if (sale.iso > addMonths(transition.contract, transition.months).iso) return false;
  if (!transition.permitRequired) return transition.contract.iso <= RELIEF_END;
  if (!transition.permitApproved || !transition.permitApplication || transition.permitApplication.iso > RELIEF_END || transition.permitApplication.iso > transition.contract.iso) return false;
  const absoluteEnd = transition.months === 6 ? "2026-11-09" : "2026-09-09";
  return transition.contract.iso < "2026-05-10" || sale.iso <= absoluteEnd;
}

function housingCase(id: string, label: string, facts: HousingFacts, sale: Day, residenceYears: number): TaxCase {
  const heldYears = completedYears(facts.acquisition, sale);
  const oneHome = facts.houseCount === 1 || facts.singleHomeSpecial;
  const residenceRequired = facts.acquisition.iso >= "2017-08-03" && facts.regulatedAtAcquisition;
  const exemptEligible = oneHome && heldYears >= 2 && (!residenceRequired || residenceYears >= 2);
  const relief = facts.houseCount > 1 && facts.regulatedAtSale && transitionalRelief(facts, sale, heldYears);
  // A deemed-one-home exception alone is insufficient: all section 154(1)
  // holding/residence requirements must also be met to escape multi-home rates.
  const heavy = facts.houseCount > 1 && facts.regulatedAtSale && !exemptEligible && !relief;
  const surcharge = heavy ? (facts.houseCount === 2 ? 20 : 30) : 0;
  const gainWon = facts.saleWon - facts.purchaseWon - facts.expenseWon;
  const positiveGain = Math.max(0, gainWon);
  const excessPrice = Math.max(0, facts.saleWon - EXEMPT_PRICE_WON);
  const highPrice = exemptEligible && facts.saleWon > EXEMPT_PRICE_WON;
  const taxableGainWon = exemptEligible
    ? (highPrice ? Number(BigInt(positiveGain) * BigInt(excessPrice) / BigInt(facts.saleWon)) : 0)
    : positiveGain;
  const specialHolding = oneHome && residenceYears >= 2;
  const holdingRate = heavy || heldYears < 3 ? 0
    : specialHolding ? Math.min(heldYears, 10) * 4 + Math.min(residenceYears, 10) * 4 : Math.min(heldYears * 2, 30);
  const holdingDeductionWon = highPrice
    ? Number(BigInt(positiveGain) * BigInt(excessPrice) * BigInt(holdingRate) / (BigInt(facts.saleWon) * BigInt(100)))
    : percent(taxableGainWon, holdingRate);
  const incomeWon = Math.max(0, taxableGainWon - holdingDeductionWon);
  const basicDeductionWon = Math.min(incomeWon, BASIC_DEDUCTION_WON);
  const taxableWon = incomeWon - basicDeductionWon;
  const ordinaryWithSurcharge = ordinaryCapitalTax(taxableWon, surcharge);
  const shortRate = heldYears < 1 ? 70 : heldYears < 2 ? 60 : 0;
  const shortTax = percent(taxableWon, shortRate);
  const grossTaxWon = Math.max(ordinaryWithSurcharge, shortTax);
  const nationalTaxWon = roundPayment(grossTaxWon);
  const localTaxWon = roundPayment(Math.floor(grossTaxWon / 10));
  const rateNote = shortRate ? `단기 ${shortRate}%와 기본세율${surcharge ? `+${surcharge}%p` : ""} 중 큰 세액`
    : surcharge ? `기본세율 + ${surcharge}%p 중과` : "기본 누진세율";
  return {
    id, label, taxableWon, grossTaxWon, creditWon: 0, nationalTaxWon, localTaxWon,
    totalTaxWon: nationalTaxWon + localTaxWon,
    lines: [
      { label: "양도가액", amountWon: facts.saleWon, note: sale.iso },
      { label: "취득가액·필요경비 차감", amountWon: facts.purchaseWon + facts.expenseWon },
      { label: "전체 양도차익", amountWon: gainWon },
      { label: "비과세 제외 후 양도차익", amountWon: taxableGainWon, note: exemptEligible ? (highPrice ? "전체 차익 × (양도가액 − 12억원) ÷ 양도가액" : "1세대 1주택 요건 충족 · 양도가액 12억원 이하") : "1세대 1주택 비과세 요건 미충족" },
      { label: `장기보유특별공제 (${holdingRate}%)`, amountWon: holdingDeductionWon, note: heavy ? "다주택 중과 적용으로 공제 제외" : `완료 보유 ${heldYears}년 · 거주 ${residenceYears}년` },
      { label: "양도소득 기본공제", amountWon: basicDeductionWon },
      { label: "과세표준", amountWon: taxableWon },
      { label: "양도소득세", amountWon: nationalTaxWon, note: rateNote },
      { label: "개인지방소득세", amountWon: localTaxWon },
    ],
    assumptions: [
      `양도일 ${sale.iso}, 완료 보유 ${heldYears}년·거주 ${residenceYears}년, 세대 주택 ${facts.houseCount}채를 적용했습니다.`,
      `1세대 1주택 비과세 ${exemptEligible ? "요건 충족" : "요건 미충족"}; ${rateNote}을 적용했습니다.`,
      ...(facts.houseCount > 1 && facts.regulatedAtSale ? [relief ? "해당 양도일에 2026년 다주택 중과 한시 배제 요건을 충족합니다." : "해당 양도일에 다주택 중과 한시 배제를 적용하지 않았습니다."] : []),
      ...(facts.singleHomeSpecial ? ["1세대 1주택 특례의 별도 적용 요건은 사용자가 확인했으며, 보유·거주 요건은 입력값으로 별도 판정했습니다."] : []),
      ...(gainWon < 0 ? ["이 거래의 양도손실은 세액 0원으로 표시하고 다른 거래와 통산하지 않습니다."] : []),
    ],
  };
}

export function compareHousing(input: TaxComparisonInput): TaxComparison {
  const result = baseComparison("capital_gains", "주택 양도 시점별 예상 세액 비교", "국내 주택 1건의 비과세·장기보유공제·단기 및 다주택 중과와 지방소득세");
  result.references = [
    { label: "소득세법 제95조 장기보유특별공제", url: "https://www.law.go.kr/법령/소득세법/제95조" },
    { label: "소득세법 제104조 단기·다주택 세율", url: "https://www.law.go.kr/법령/소득세법/제104조" },
    { label: "소득세법 시행령 제154조 1세대 1주택", url: "https://www.law.go.kr/법령/소득세법시행령/제154조" },
    { label: "소득세법 시행령 제160조 고가주택 계산", url: "https://www.law.go.kr/법령/소득세법시행령/제160조" },
    { label: "2026년 다주택 중과 한시 배제 경과규정", url: "https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=10&joNo=0167&lsiSeq=286211&urlMode=lsScJoRltInfoR" },
    { label: "2026년 6개월 양도기한 적용 지역", url: "https://www.law.go.kr/flDownload.do?flSeq=161845131" },
  ];
  result.exclusions = [
    "공동소유·미등기·해외 주택·입주권/분양권·겸용주택·특수관계 거래·이월과세·부담부증여·재건축 보유기간 통산",
    "같은 해 다른 양도·기본공제 기사용·감면·거주기간 예외·별도 중과 제외 특례의 자동 판단·사후 추징",
    "취득세·보유세·추가 보유비용·가격변동 및 2026년 이전 양도분",
  ];
  result.assumptions = [
    "국내 거주자 1인이 전부 소유한 등기 주택이며, 세법상 양도·취득일과 인정 필요경비를 입력했습니다. 해당 연도 다른 양도·손익통산·기본공제 사용·세액감면은 없습니다.",
    "보유기간은 취득일을 포함해 계산합니다. 두 안은 주택·가격·비용·세대 주택 수·조정대상지역이 같고 양도일만 달력상 1년 늦춥니다. 추가 거주를 확인한 경우에만 거주기간도 1년 늘립니다.",
    "미래 안은 확인일 현재 법령이 유지된다는 조건부 계산입니다. 2026년 한시 중과 배제는 각 양도일의 법정 기한을 다시 판정하며 이후로 연장하지 않습니다.",
    "주택 수는 세대 전체를 기준으로 확인합니다. 1세대 1주택 특례는 두 양도시점의 별도 요건을 확인한 경우만 선택합니다.",
    "국세·지방소득세는 각각 10원 미만을 버립니다. 양도소득세에 신고세액공제 3%를 적용하지 않습니다.",
  ];
  const { values } = input;
  const resident = yesNo(values, "resident", "국내 거주자 여부", result.missing);
  const standardCase = yesNo(values, "standardCase", "단독 소유 주택 1건·지원 조건 확인", result.missing);
  if (resident === false || standardCase === false) result.status = "unsupported";
  const saleWon = money(values, "salePrice", "양도가액", result.missing);
  const purchaseWon = money(values, "purchasePrice", "취득가액", result.missing);
  const expenseWon = money(values, "expenses", "인정 필요경비", result.missing);
  const acquisition = readDay(values, "acquisitionDate", "취득일", result.missing);
  const sale = readDay(values, "saleDate", "양도일", result.missing);
  const residenceYears = integer(values, "residenceYears", "완료한 거주 연수", result.missing, 0, 99);
  const houseCount = integer(values, "houseCount", "세대 전체 주택 수", result.missing, 1, 99);
  const regulatedAtSale = yesNo(values, "regulatedAtSale", "양도 시 조정대상지역 여부", result.missing);
  const additionalResidence = yesNo(values, "additionalResidence", "1년 후 안에서 거주도 1년 추가하는지", result.missing);
  const singleHomeSpecial = houseCount !== null && houseCount > 1 ? yesNo(values, "singleHomeSpecial", "두 양도시점의 1세대 1주택 특례 요건 확인", result.missing) : false;
  const potentialOneHome = houseCount === 1 || singleHomeSpecial === true;
  const regulatedAtAcquisition = acquisition && acquisition.iso >= "2017-08-03" && potentialOneHome
    ? yesNo(values, "regulatedAtAcquisition", "취득 시 조정대상지역 여부", result.missing) : false;
  if (sale && sale.iso < "2026-01-01") {
    result.status = "unsupported";
    result.missing.push("2026년 이전 양도는 해당 연도의 법령을 적용하는 별도 계산이 필요합니다.");
  }
  if (acquisition && sale && acquisition.iso > sale.iso) result.missing.push("양도일은 취득일보다 빠를 수 없습니다.");
  if (acquisition && sale && residenceYears !== null && residenceYears > completedYears(acquisition, sale)) result.missing.push("거주 연수는 완료한 보유 연수를 초과할 수 없습니다. 취득 전 거주 등 별도 통산 대상은 추가 검토가 필요합니다.");
  let transition: Transition | null = null;
  if (houseCount !== null && houseCount > 1 && regulatedAtSale === true && sale && sale.iso > RELIEF_END && sale.iso <= "2026-11-09") {
    const transitionCase = yesNo(values, "transitionCase", "2026년 중과 배제 경과규정 검토 여부", result.missing);
    if (transitionCase === true) {
      const months = values.transitionWindow === "four" ? 4 : values.transitionWindow === "six" ? 6 : null;
      if (months === null) result.missing.push("양도기한 적용 지역을 4개월 또는 법정 6개월 지역으로 확인해 주세요.");
      const permitRequired = yesNo(values, "permitRequired", "토지거래허가 대상 여부", result.missing);
      const contract = readDay(values, "contractDate", "매매계약 체결일", result.missing);
      const depositPaid = yesNo(values, "depositPaid", "계약일의 계약금 수령 및 증빙 확인", result.missing);
      const permitApplication = permitRequired === true ? readDay(values, "permitApplicationDate", "토지거래허가 신청일", result.missing) : null;
      const permitApproved = permitRequired === true ? yesNo(values, "permitApproved", "해당 신청에 대한 토지거래허가 취득 여부", result.missing) : false;
      if (contract && contract.iso > sale.iso) result.missing.push("매매계약 체결일은 양도일보다 늦을 수 없습니다.");
      if (permitApplication && contract && permitApplication.iso > contract.iso) result.missing.push("허가 신청일·허가에 따른 계약 체결 순서를 확인해 주세요.");
      if (months !== null && permitRequired !== null && contract && depositPaid !== null && permitApproved !== null) {
        transition = { months, permitRequired, contract, depositPaid, permitApplication, permitApproved };
      }
    }
  }
  if (result.status === "unsupported" || result.missing.length || saleWon === null || purchaseWon === null || expenseWon === null || !acquisition || !sale || residenceYears === null || houseCount === null || regulatedAtSale === null || regulatedAtAcquisition === null || singleHomeSpecial === null || additionalResidence === null) return result;
  const facts: HousingFacts = { saleWon, purchaseWon, expenseWon, acquisition, residenceYears, houseCount, regulatedAtSale, regulatedAtAcquisition, singleHomeSpecial, transition };
  result.baseline = housingCase("housing-now", "입력한 양도일에 양도", facts, sale, residenceYears);
  result.alternatives = [housingCase("housing-plus-one-year", "1년 후 같은 가격에 양도", facts, addMonths(sale, 12), residenceYears + (additionalResidence ? 1 : 0))];
  result.status = "ready";
  return result;
}
