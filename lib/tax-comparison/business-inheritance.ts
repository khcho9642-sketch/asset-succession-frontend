import { baseComparison, integer, money, ordinaryTax, requireYes } from "./common";
import { compareInheritance } from "./inheritance-gift";
import type { TaxCase, TaxComparison, TaxComparisonInput } from "./types";

const EOK = 100_000_000;

/** A legal business-asset ratio expressed as percent, preserved in basis points. */
function businessRatio(raw: string | undefined, missing: string[]): number | null {
  const value = raw?.trim() ?? "";
  if (/^\d{1,3}(?:\.\d{1,2})?$/.test(value)) {
    const [whole, fraction = ""] = value.split(".");
    const basisPoints = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    if (basisPoints <= 10_000) return basisPoints;
  }
  missing.push("가업자산 해당 비율: 0~100%를 소수 둘째 자리까지 입력해 주세요.");
  return null;
}

function amountOf(taxCase: TaxCase, label: string): number {
  const line = taxCase.lines.find((item) => item.label === label);
  if (!line) throw new Error(`상속세 계산 근거 누락: ${label}`);
  return line.amountWon;
}

/**
 * Compare the SAME estate, business successor, spouse allocation and event.
 * The business valuation and qualifying conditions must be expressly confirmed;
 * no market value, family allocation, business ratio or tax base is inferred.
 */
export function compareBusinessInheritance(input: TaxComparisonInput): TaxComparison {
  const result = baseComparison("business_succession", "가업상속공제 적용 전후 예상 상속세", "같은 상속재산과 실제 배분에서 가업상속공제 적용 여부에 따른 이번 상속세를 비교합니다.");
  result.references = [
    { label: "상속세 및 증여세법 제18조의2 · 가업상속공제", url: "https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=02&joNo=0018&lsiSeq=276123&urlMode=lsScJoRltInfoR" },
    { label: "상속세 및 증여세법 시행령 제15조 · 가업상속 요건·재산·사후관리", url: "https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0015&lsiSeq=283637&urlMode=lsScJoRltInfoR" },
    { label: "상속세 및 증여세법 제24조 · 공제 적용의 한도", url: "https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0024&lsiSeq=276123&urlMode=lsScJoRltInfoR" },
  ];
  result.assumptions = [
    "거주자인 피상속인의 성년 자녀와 선택한 배우자만 법정상속인이며, 사전증여·간주·추정상속재산·상속포기가 없는 조건입니다.",
    "입력 재산은 법정 평가액입니다. 가업재산 전부를 적격 자녀 1명이 승계하며, 배우자 배분액은 두 비교안에서 동일합니다.",
    "법인 주식의 가업자산 비율은 법정 평가에 따라 비사업용자산을 제외한 비율이며, 회사 지분율이 아닙니다. 가업주식은 금융재산 공제 대상에서 제외합니다.",
    "배우자가 있으면 가업재산 외 상속재산으로 나머지 채무를 정산하는 배분을 계산합니다. 개인사업의 담보채무는 총채무에도 포함되어야 합니다.",
    "기업 규모·업종, 피상속인의 경영·지분·대표자 요건, 적격 상속인의 연령·종사·대표 취임 요건 및 신청 조건이 모두 확인되어야 합니다.",
    "기한 내 신고세액공제 3%와 10원 미만 끝수 처리를 적용합니다. 사후관리 위반에 따른 추징 및 이후 2차 상속세는 이번 세액에 포함하지 않습니다.",
  ];
  result.exclusions = [
    "미성년자·장애인·연로자 추가공제, 영농상속공제, 사전증여·추정·간주상속재산, 비과세·불산입 재산 및 상속인 외 수유자",
    "개인사업 가업재산에 비사업용 토지 등 부적격 자산을 포함하지 않습니다. 법인은 법정 평가액에 따른 사업무관자산 비율을 먼저 제외합니다.",
    "여러 가업·여러 적격 승계자의 배분, 외부 자금으로 채무를 정산하는 배우자 배분, 취득세·사후관리 추징·향후 주식 처분 및 생애 전체 세금",
  ];
  const values = input.values;
  requireYes(values, "resident", "피상속인 거주자 요건 확인", result.missing);
  requireYes(values, "standardCase", "가업재산 외 일반 상속 계산 조건 확인", result.missing);
  requireYes(values, "eligibilityConfirmed", "가업·피상속인·상속인 적용 요건 확인", result.missing);
  if ([values.resident, values.standardCase, values.eligibilityConfirmed].includes("no")) {
    result.status = "unsupported";
    return result;
  }
  const estate = money(values, "estate", "상속재산 평가액", result.missing);
  const debt = money(values, "debt", "공과금·채무 합계", result.missing);
  const financial = money(values, "financial", "가업주식을 제외한 공제 대상 금융재산", result.missing);
  const inheritedBusiness = money(values, "inheritedBusinessValue", "상속하는 가업재산의 법정 평가액", result.missing);
  const years = integer(values, "businessYears", "가업 영위 연수", result.missing, 10, 99);
  const propertyType = values.businessPropertyType;
  const companySize = values.companySize;
  if (propertyType !== "corporate" && propertyType !== "sole") result.missing.push("가업재산 구분: 법인 주식 또는 개인사업 재산을 선택해 주세요.");
  if (companySize !== "small" && companySize !== "medium") result.missing.push("법정 기업 규모: 중소기업 또는 중견기업을 선택해 주세요.");
  const ratio = propertyType === "corporate" ? businessRatio(values.businessEligiblePercent, result.missing) : null;
  const securedDebt = propertyType === "sole" ? money(values, "businessSecuredDebt", "가업재산에 담보된 채무", result.missing) : 0;
  const spouseAmount = values.spouse === "yes" ? money(values, "spouseInheritance", "배우자가 실제 상속받는 순재산", result.missing) : null;
  const otherNetAssets = companySize === "medium" ? money(values, "successorOtherNetAssets", "적격 상속인의 가업 외 순상속재산", result.missing) : null;
  const successorTax = companySize === "medium" ? money(values, "successorTaxWithoutDeduction", "적격 상속인의 가업공제·신고세액공제 전 부담 상속세액", result.missing) : null;
  if (inheritedBusiness !== null && estate !== null && inheritedBusiness > estate) result.missing.push("가업재산 평가액은 전체 상속재산 평가액 이하여야 합니다.");
  if (inheritedBusiness !== null && estate !== null && financial !== null && inheritedBusiness + financial > estate) result.missing.push("가업재산과 공제 대상 금융재산이 중복되지 않도록 확인해 주세요.");
  if (securedDebt !== null && debt !== null && securedDebt > debt) result.missing.push("가업재산 담보채무는 공과금·채무 합계에 포함되어야 합니다.");
  if (securedDebt !== null && inheritedBusiness !== null && securedDebt > inheritedBusiness) result.missing.push("가업재산 담보채무는 해당 가업재산 평가액 이하여야 합니다.");
  if (inheritedBusiness !== null && securedDebt !== null && spouseAmount !== null && estate !== null && debt !== null && inheritedBusiness - securedDebt + spouseAmount > estate - debt) {
    result.missing.push("가업 승계재산과 배우자 순상속액이 채무 차감 후 재산을 초과합니다. 채무 정산과 배분을 확인해 주세요.");
  }
  if (values.spouse === "no" && values.spouseInheritance?.trim()) result.missing.push("배우자가 없는 경우 배우자 상속액을 입력할 수 없습니다.");

  // Explicitly overwrite the wizard's optional allocation: these two scenarios
  // keep the customer's actual spouse allocation, rather than comparing it to
  // a different spouse share. No part of the business deduction changes Article 19.
  const ordinary = compareInheritance({
    ...input, track: "inheritance", values: { ...values, spouseAllocation: values.spouse === "yes" ? values.spouseInheritance ?? "" : "" },
  });
  result.references.push(...ordinary.references);
  result.missing.push(...ordinary.missing.filter((item) => !result.missing.includes(item)));
  if (ordinary.status === "unsupported") result.status = "unsupported";
  if (result.status === "unsupported" || result.missing.length || ordinary.status !== "ready" || estate === null || debt === null || inheritedBusiness === null || years === null || securedDebt === null || (propertyType === "corporate" && ratio === null)) return result;
  const sourceCase = values.spouse === "yes"
    ? ordinary.alternatives.find((item) => item.id === "inheritance-custom-spouse")
    : ordinary.baseline;
  if (!sourceCase) return result;

  const eligibleBusiness = propertyType === "corporate"
    ? Number(BigInt(inheritedBusiness) * BigInt(ratio!) / BigInt(10_000))
    : inheritedBusiness - securedDebt;
  if (companySize === "medium" && otherNetAssets !== null && successorTax !== null) {
    // Article 15's heir-level test is an externally verified statutory amount.
    // It uses Article 3-2 liability based on gross assessed tax, before the 3%
    // filing credit. The whole estate is only a sanity ceiling, never a default.
    if (successorTax > sourceCase.grossTaxWon) {
      result.missing.push("상속인별 부담 상속세액은 가업공제·신고세액공제 전 전체 산출세액을 초과할 수 없습니다.");
      return result;
    }
    // The shared debt input includes public charges, while Article 15's other
    // net assets deduct verified successor debt. Do not mistake the aggregate
    // for that narrower definition. These deliberately broad necessary bounds
    // still prevent fictional zero non-business assets in partly eligible shares.
    const knownOtherMinimum = Math.max(0, inheritedBusiness - eligibleBusiness - debt);
    const knownOtherMaximum = Math.max(0, estate - eligibleBusiness - (spouseAmount ?? 0));
    if (otherNetAssets < knownOtherMinimum || otherNetAssets > knownOtherMaximum) {
      result.missing.push(`상속인별 가업 외 순상속재산은 확인된 재산 배분상 ${knownOtherMinimum.toLocaleString("ko-KR")}~${knownOtherMaximum.toLocaleString("ko-KR")}원 범위여야 합니다. 비사업용자산·상속인별 입증채무를 확인해 주세요.`);
      return result;
    }
    if (otherNetAssets > successorTax * 2) {
      result.status = "unsupported";
      result.missing.push("중견기업은 적격 상속인의 가업 외 순상속재산이 해당 상속인의 부담 상속세액의 2배를 초과하여 가업상속공제 조건을 충족하지 않습니다.");
      return result;
    }
    result.assumptions.push("중견기업의 가업 외 순상속재산과 법 제3조의2에 따른 상속인별 부담세액은 전문가가 확인한 입력값입니다. 부담세액은 가업공제·신고세액공제 전 산출세액을 기준으로 하며, 전체 유산세로 대신하지 않습니다.");
  }
  const businessCap = (years >= 30 ? 600 : years >= 20 ? 400 : 300) * EOK;
  const businessDeduction = Math.min(eligibleBusiness, businessCap);
  const netEstate = amountOf(sourceCase, "상속세 과세가액");
  const existingDeduction = amountOf(sourceCase, "상속공제 적용 합계");
  const totalDeduction = Math.min(netEstate, existingDeduction + businessDeduction);
  const taxableWon = netEstate - totalDeduction;
  const tax = ordinaryTax(taxableWon);
  const allocationNote = values.spouse === "yes" ? "입력한 배우자 실제 상속액과 가업 승계자 배분을 두 비교안에서 동일하게 유지합니다." : "배우자 없는 상속이며 같은 적격 자녀가 같은 가업재산을 승계합니다.";
  result.baseline = {
    ...sourceCase, id: "business-inheritance-ordinary", label: "가업상속공제 미적용",
    assumptions: [allocationNote, "가업상속공제를 제외한 일괄·기초 및 인적·배우자·금융 공제는 확인된 일반 상속 조건에 따라 적용합니다."],
  };
  const calculationLines = sourceCase.lines.filter((item) => item.label !== "상속공제 적용 합계" && item.label !== "과세표준");
  result.alternatives = [{
    id: "business-inheritance-deduction", label: "가업상속공제 적용", taxableWon, ...tax,
    localTaxWon: 0, totalTaxWon: tax.nationalTaxWon,
    lines: [
      ...calculationLines,
      { label: "가업상속공제 대상 재산", amountWon: eligibleBusiness, note: propertyType === "corporate" ? `가업주식 평가액 × 가업자산 비율 ${values.businessEligiblePercent}%` : "개인사업 가업재산 평가액에서 해당 재산 담보채무 차감" },
      { label: "가업상속공제", amountWon: businessDeduction, note: `가업 ${years}년, 법정 한도 ${businessCap / EOK}억원 적용` },
      { label: "상속공제 적용 합계", amountWon: totalDeduction, note: "일반 공제와 가업상속공제를 합산하되 상속세 과세가액 한도로 적용" },
      { label: "과세표준", amountWon: taxableWon },
    ],
    assumptions: [allocationNote, "가업상속공제는 기존 인적·배우자·금융 공제와 합산합니다. 가업공제로 배우자 법정상속분 공제 한도를 줄이지 않습니다.", "신청 및 사후관리 요건 준수를 전제로 한 이번 상속세 추정이며, 위반 시 추징될 수 있습니다."],
  }];
  result.status = "ready";
  return result;
}
