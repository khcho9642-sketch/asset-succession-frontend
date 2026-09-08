import type { TaxField, TaxTrack } from "./types";

export const TAX_TRACK_LABELS: Record<TaxTrack, string> = { inheritance: "상속", gift: "증여", capital_gains: "양도", business_succession: "가업승계" };
const residency: TaxField = { key: "resident", label: "세법상 거주자 조건", type: "select", hint: "상속은 피상속인, 증여는 수증자 기준입니다. 가업주식 증여는 증여자·수증자 모두 확인합니다.", options: [{ value: "yes", label: "거주자 조건에 해당" }, { value: "no", label: "비거주자 포함 / 해당하지 않음" }] };
const availableCash: TaxField = { key: "availableCash", label: "세금 납부에 쓸 수 있는 현금", type: "money", optional: true, hint: "선택 항목. 비워두면 납부재원 부족액을 계산하지 않습니다." };

export function getTrackDescription(track: TaxTrack, values: Record<string, string> = {}): string {
  if (track === "capital_gains" && values.capitalAsset === "home") return "주택을 지금 양도하는 경우와 1년 뒤 양도하는 경우를 같은 가격·비용과 현행 세법으로 비교합니다. 보유·거주 및 주택 수 조건을 함께 확인합니다.";
  if (track === "business_succession" && values.businessMethod === "inheritance") return "같은 재산 배분에서 가업상속공제를 적용하기 전과 적용한 뒤의 상속세를 비교합니다.";
  return {
    inheritance: "같은 상속재산에서 배우자에게 배분하는 금액에 따른 1차 상속세를 비교합니다.",
    gift: "같은 현금 총액을 1명 또는 확인한 여러 명에게 증여할 때의 세금을 비교합니다.",
    capital_gains: "일반 상가·건물을 지금 양도하는 경우와 1년 더 보유하는 경우를 같은 가격과 현행 세법으로 비교합니다.",
    business_succession: "요건을 충족한 가업주식을 성년 자녀 1명에게 증여할 때 일반 과세와 과세특례를 비교합니다."
  }[track];
}

export function getScopeStatement(track: TaxTrack, values: Record<string, string> = {}): string {
  if (track === "capital_gains" && values.capitalAsset === "home") return "거주자 1인이 직접 매수한 등기된 국내 주택을 100% 소유합니다. 세대 내 조합원입주권·분양권이 없고, 입력 주택 수는 세법상 산정한 수입니다. 입력한 1주택 특례 외에 주택 수 제외·중과 제외 특례는 없습니다. 상속·증여 취득, 부담부증여·이월과세, 겸용주택·용도변경·재건축 기간 통산은 제외합니다. 조정대상지역 지정 전 계약에 따른 거주요건 예외도 없습니다. 필요경비 요건을 갖추었고 각 비교 연도에 다른 양도소득·손실·세액공제는 없어 기본공제 250만원을 전액 적용합니다. 두 시점의 특례 요건을 확인하고 추가 거주는 별도 입력합니다. 향후 가격·비용·세법·주택 수·지역 지정은 현재와 같다고 가정합니다.";
  if (track === "business_succession" && values.businessMethod === "inheritance") return "피상속인 1인의 전체 상속재산이며 법정상속인은 배우자(있는 경우)와 성년 자녀뿐이고 상속포기는 없습니다. 합산할 사전증여·추정/간주 재산·비과세 재산 및 추가 인적공제는 없습니다. 채무·금융재산·장례비는 공제 요건을 갖추었습니다. 입력 가업재산은 적격 자녀가 실제 상속받는 재산이고 배우자 배분액과 겹치지 않습니다. 기한 내 신고·재산분할 및 가업상속공제 신청·사후관리 요건을 이행하는 조건입니다. 기업·피상속인·상속인의 가업 요건은 아래에서 별도로 확인합니다.";
  return {
    inheritance: "재산은 피상속인 1인의 전체 상속재산이며, 법정상속인은 배우자(있는 경우)와 성년 자녀뿐이고 상속포기는 없습니다. 합산할 사전증여·추정/간주 상속재산·비과세 재산 및 장애인·연로자 등 추가 인적공제는 없습니다. 금융자산은 공제 대상 자산만 포함하며 최대주주 주식 등은 제외했습니다. 채무와 공과금은 공제 요건을 갖추었습니다. 기한 내 신고와 배우자 재산분할 요건을 충족하는 가정으로 비교합니다.",
    gift: "입력한 수의 서로 다른 수증자가 실제 증여 대상입니다. 같은 관계 유형이며, 관계는 증여자를 기준으로 확인했습니다. 최근 10년 합산 증여와 사용한 증여재산공제가 없고, 혼인·출산 등 추가공제는 적용하지 않습니다. 순수 현금을 증여하고 수증자가 자기 재원으로 세금을 내며 기한 내 신고합니다. 손자녀 등 세대생략 증여는 포함하지 않습니다.",
    capital_gains: "거주자 1인이 100% 소유한 등기된 일반 상가·건물 1건입니다. 주택·토지·비사업용 토지·미등기·부담부증여·증여받은 자산의 이월과세는 포함하지 않습니다. 필요경비는 인정 요건을 갖추었으며, 각 비교 연도에 다른 양도소득·손실·세액공제는 없어 연 250만원 기본공제를 전액 적용합니다. 향후 가격·비용·세법은 현재와 같다고 가정합니다.",
    business_succession: "60세 이상 부모가 19세 이상 성년 자녀 1명에게 증여하며, 최근 10년 합산 증여 및 사용한 공제가 없습니다. 조세특례제한법 제30조의6 및 시행령 제27조의6의 기업 규모·업종·10년 경영·지분 보유·대표이사 재직·수증자 종사 및 취임 요건을 확인했습니다. 입력 주식가액 전부가 특례 대상이며 비사업용 자산은 없습니다. 기한 내 신청과 5년 사후관리 요건을 지키며 세금은 수증자 재원으로 냅니다."
  }[track];
}

export function getTaxFields(track: TaxTrack, values: Record<string, string> = {}): TaxField[] {
  const fields: Record<TaxTrack, TaxField[]> = {
    inheritance: [
      { key: "estate", label: "전체 상속재산 평가액", type: "money", hint: "1인 소유 재산 전체의 세무상 평가액. 대화에서 옮긴 금액도 확인해 주세요." },
      { key: "debt", label: "공과금·입증 가능한 채무 합계", type: "money", hint: "금융채무를 포함한 총액입니다. 없으면 0을 입력하세요." },
      { key: "financial", label: "공제 대상 금융재산", type: "money", hint: "전체 상속재산에 포함된 금액. 공제에서 제외되는 주식 등은 빼주세요." },
      { key: "financialDebt", label: "금융재산에서 차감할 금융채무", type: "money", hint: "위 채무 합계에 이미 포함된 금액입니다." },
      { key: "funeral", label: "일반 장례비용", type: "money", hint: "0.05억원(500만원) 가정으로 시작합니다. 법정 공제 500만~1,000만원, 봉안시설 비용 제외." },
      { key: "spouse", label: "배우자", type: "select", options: [{ value: "yes", label: "있음" }, { value: "no", label: "없음" }] },
      { key: "children", label: "상속인인 성년 자녀 수", type: "integer", hint: "이 비교는 성년 자녀 1~20명이 있는 경우를 지원합니다." },
      { key: "spouseAllocation", label: "추가 비교할 배우자 배분액", type: "money", optional: true, hint: "선택 항목. 기본적으로 배우자 최소공제안과 법정상속분 배분안을 비교합니다." },
    ],
    gift: [
      { key: "giftAmount", label: "증여할 현금 총액", type: "money" },
      { key: "recipientType", label: "증여자와 수증자의 관계", type: "select", options: [{ value: "adult_child", label: "부모 → 성년 자녀" }, { value: "minor_child", label: "부모 → 미성년 자녀" }, { value: "spouse", label: "배우자" }, { value: "other_relative", label: "기타 공제 대상 친족" }, { value: "unrelated", label: "친족 외" }], hint: "기타 친족은 세법상 공제 범위에 해당하는 친족입니다. 직계존속·세대생략 증여는 이 비교에 포함하지 않습니다." },
      { key: "recipientCount", label: "균등하게 나눠 받을 수증자 수", type: "integer", hint: "실제 대상자 수 1~20명, 배우자는 1명만 가능합니다." },
    ],
    capital_gains: [
      { key: "salePrice", label: "양도가액", type: "money" },
      { key: "purchasePrice", label: "취득가액", type: "money" },
      { key: "expenses", label: "인정되는 필요경비", type: "money" },
      { key: "heldYears", label: "현재 만 보유연수", type: "integer", hint: "취득일부터 계산한 만 2년 이상. 다음 비교안은 만 1년을 더 보유한 시점입니다." },
    ],
    business_succession: [
      { key: "businessValue", label: "증여할 가업주식 평가액", type: "money", hint: "입력 금액 전부가 특례 대상인 경우에 한합니다." },
      { key: "businessYears", label: "부모의 가업 경영기간", type: "integer", hint: "만 10년 이상. 10·20·30년에 따라 특례 대상 가액 한도가 달라집니다." },
    ],
  };
  let selected = fields[track];
  if (track === "capital_gains") selected = [capitalAsset, ...(values.capitalAsset === "home" ? homeFields(values) : selected)];
  if (track === "business_succession") selected = [businessMethod, ...(values.businessMethod === "inheritance" ? businessInheritanceFields(values) : selected)];
  const selectedResidency = track === "business_succession" && values.businessMethod === "inheritance"
    ? { ...residency, label: "피상속인의 세법상 거주자 조건", hint: "가업상속은 피상속인을 기준으로 확인합니다." }
    : residency;
  return [...selected, selectedResidency, availableCash];
}

const capitalAsset: TaxField = { key: "capitalAsset", label: "양도할 자산", type: "select", options: [{ value: "commercial", label: "일반 상가·건물" }, { value: "home", label: "주택" }] };
const businessMethod: TaxField = { key: "businessMethod", label: "가업을 이전하는 방식", type: "select", options: [{ value: "gift", label: "생전 증여 · 가업주식 과세특례" }, { value: "inheritance", label: "상속 · 가업상속공제" }] };
function yesNo(key: string, label: string, hint?: string): TaxField {
  return { key, label, type: "select", options: [{ value: "yes", label: "예" }, { value: "no", label: "아니요" }], ...(hint ? { hint } : {}) };
}

function homeFields(values: Record<string, string>): TaxField[] {
  const fields: TaxField[] = [
    { key: "salePrice", label: "양도가액", type: "money", hint: "현재와 1년 뒤에 같은 가격으로 양도하는 조건입니다." },
    { key: "purchasePrice", label: "취득가액", type: "money" },
    { key: "expenses", label: "인정되는 필요경비", type: "money", hint: "없으면 0을 입력해 주세요." },
    { key: "acquisitionDate", label: "취득일", type: "date", hint: "세법상 취득일을 입력하세요. 보유기간은 날짜로 계산합니다." },
    { key: "saleDate", label: "기준안의 양도일", type: "date", hint: "대안은 이 날짜의 1년 뒤입니다. 두 날짜 모두 현행 세법을 적용한 예상 비교입니다." },
    { key: "residenceYears", label: "양도일까지 실제 거주한 만 연수", type: "integer", hint: "현재 보유기간 안에서 완료한 거주연수입니다. 거주하지 않았다면 0을 입력하세요." },
    { key: "houseCount", label: "세대 기준 주택 수", type: "integer", hint: "세대 내 입주권·분양권이 없고, 세법상 산정한 주택 수를 입력합니다. 두 시점의 주택 수는 동일하며 별도 주택 수 제외·중과 제외 특례는 없습니다." },
    yesNo("regulatedAtSale", "양도일에 조정대상지역인가요?", "양도 주택 소재지를 기준으로 확인합니다. 1년 뒤에도 같은 지역 지정이라는 가정입니다."),
    yesNo("additionalResidence", "1년 뒤까지 실제 거주기간도 1년 늘어나나요?", "단순 보유만 연장하면 아니요를 선택하세요. 예를 선택한 경우에만 대안의 거주연수를 1년 더합니다."),
  ];
  if (Number(values.houseCount) > 1) fields.push(yesNo("singleHomeSpecial", "두 양도 시점 모두 1세대 1주택 특례에 해당하나요?", "일시적 2주택 등 해당 특례의 개별 요건을 현재와 1년 뒤 모두 확인한 경우에만 예를 선택하세요. 보유·거주 요건은 별도로 계산합니다."));
  if (values.acquisitionDate >= "2017-08-03" && (Number(values.houseCount) === 1 || values.singleHomeSpecial === "yes")) fields.push(yesNo("regulatedAtAcquisition", "취득 당시 조정대상지역이었나요?", "취득 당시 지역 지정에 따라 거주기간을 확인합니다. 지정 전 계약에 따른 거주요건 예외는 이번 계산에 포함하지 않습니다."));
  if (Number(values.houseCount) > 1 && values.regulatedAtSale === "yes" && values.saleDate > "2026-05-09" && values.saleDate <= "2026-11-09") {
    fields.push(yesNo("transitionCase", "2026년 5월 9일 중과 유예 종료 경과조치 대상인가요?", "대상 계약·계약금 증빙·양도기한을 확인한 경우에만 예를 선택하세요."));
    if (values.transitionCase === "yes") {
      fields.push(
        { key: "transitionWindow", label: "해당 지역의 경과조치 양도기한", type: "select", options: [{ value: "four", label: "일반 지역 · 계약일부터 4개월" }, { value: "six", label: "법정 추가 지역 · 계약일부터 6개월" }], hint: "법정 지역 구분을 확인해 선택하세요. 5월 10일 이후 허가 대상 계약은 계약일부터의 기한과 9월 9일·11월 9일의 최종 기한을 함께 확인합니다." },
        yesNo("permitRequired", "토지거래허가 대상 계약인가요?"),
        { key: "contractDate", label: "매매계약 체결일", type: "date" },
        yesNo("depositPaid", "계약일에 계약금을 받은 사실과 증빙이 있나요?"),
      );
      if (values.permitRequired === "yes") fields.push(
        { key: "permitApplicationDate", label: "토지거래허가 신청일", type: "date" },
        yesNo("permitApproved", "토지거래허가를 받았나요?"),
      );
    }
  }
  return fields;
}

function businessInheritanceFields(values: Record<string, string>): TaxField[] {
  const fields: TaxField[] = [
    { key: "estate", label: "전체 상속재산 평가액", type: "money", hint: "피상속인 1인의 전체 상속재산으로, 아래 가업재산을 포함합니다." },
    { key: "debt", label: "공과금·입증 가능한 채무 합계", type: "money", hint: "금융채무와 가업재산 담보채무도 포함한 총액입니다. 없으면 0을 입력하세요." },
    { key: "financial", label: "공제 대상 금융재산", type: "money", hint: "전체 재산에 포함된 금액입니다. 아래 가업주식과 최대주주 주식 등 공제 제외 자산을 빼주세요." },
    { key: "financialDebt", label: "금융재산에서 차감할 금융채무", type: "money", hint: "위 채무 합계에 포함된 금액입니다. 없으면 0을 입력하세요." },
    { key: "funeral", label: "일반 장례비용", type: "money", hint: "실제 비용을 입력하세요. 봉안시설 비용은 포함하지 않습니다." },
    yesNo("spouse", "배우자가 있나요?"),
    { key: "children", label: "상속인인 성년 자녀 수", type: "integer", hint: "성년 자녀 1~20명인 경우를 지원합니다." },
  ];
  if (values.spouse === "yes") fields.push({ key: "spouseInheritance", label: "배우자가 실제 상속받는 금액", type: "money", hint: "가업을 승계하는 자녀의 재산과 구분해 입력합니다. 배우자가 받지 않으면 0을 입력하세요." });
  fields.push(
    { key: "businessPropertyType", label: "상속하는 가업재산의 종류", type: "select", options: [{ value: "corporate", label: "법인 · 가업주식" }, { value: "sole", label: "개인사업 · 가업용 자산" }] },
    { key: "inheritedBusinessValue", label: "적격 자녀가 실제 상속받는 가업재산 평가액", type: "money", hint: "회사 전체 가치가 아닌 해당 자녀가 받는 주식·가업용 자산의 총액입니다. 개인사업은 아래 담보채무 차감 전 금액을 입력합니다." },
  );
  if (values.businessPropertyType === "corporate") fields.push({ key: "businessEligiblePercent", label: "비사업용 자산을 제외한 가업자산 비율 (%)", type: "integer", hint: "법정 평가에 따른 적격 비율을 0~100으로 입력하세요(소수 둘째 자리까지). 자녀의 주식 지분율이 아닙니다." });
  if (values.businessPropertyType === "sole") fields.push({ key: "businessSecuredDebt", label: "가업재산에 담보된 채무", type: "money", hint: "위 전체 채무에 포함된 금액입니다. 나머지 채무는 가업 외 재산으로 정산하는 조건이며, 해당 채무가 없으면 0을 입력하세요." });
  fields.push(
    { key: "businessYears", label: "피상속인의 가업 경영기간", type: "integer", hint: "완료한 경영기간을 만 연수로 입력합니다. 만 10년 이상인 경우를 비교합니다." },
    { key: "companySize", label: "가업상속공제 기준 기업 규모", type: "select", options: [{ value: "small", label: "중소기업" }, { value: "medium", label: "적격 중견기업" }], hint: "해당 법령의 기업 규모와 매출 기준을 확인해 선택합니다." },
    yesNo("eligibilityConfirmed", "기업·피상속인·상속인의 가업상속 요건을 확인했나요?", "적격 업종·기업 규모, 경영기간·지분·대표자 재직, 상속인의 종사·취임 및 사후관리 요건을 모두 확인한 경우에만 예를 선택하세요."),
  );
  if (values.companySize === "medium") fields.push(
    { key: "successorOtherNetAssets", label: "가업 승계 자녀의 가업 외 순상속재산", type: "money", hint: "전문가가 확인한 해당 자녀의 법정 가업 외 상속재산에서 입증된 상속 채무를 차감한 금액입니다. 전체 상속인 합계가 아니며 장례비·공과금을 임의로 차감하지 않습니다." },
    { key: "successorTaxWithoutDeduction", label: "가업공제·신고세액공제 전 자녀별 부담세액", type: "money", hint: "상속세 및 증여세법 제3조의2에 따라 전문가가 확인한 상속인별 배분세액입니다. 가업상속공제와 신고세액공제 적용 전, 법정 배분한 산출세액 기준으로 입력합니다." },
  );
  return fields;
}

/** Union of all visible/conditional keys, used when validating persisted inputs. */
export function getAllowedTaxKeys(track: TaxTrack): string[] {
  const variants: Record<string, string>[] = [
    {},
    { capitalAsset: "home", acquisitionDate: "2020-01-01", saleDate: "2026-06-01", houseCount: "2", singleHomeSpecial: "yes", regulatedAtSale: "yes", transitionCase: "yes", permitRequired: "yes" },
    { businessMethod: "inheritance", spouse: "yes", businessPropertyType: "corporate", companySize: "medium" },
    { businessMethod: "inheritance", spouse: "yes", businessPropertyType: "sole", companySize: "medium" },
  ];
  return [...new Set(["standardCase", ...variants.flatMap((values) => getTaxFields(track, values).map((field) => field.key))])];
}
