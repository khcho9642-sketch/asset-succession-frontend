import type { TaxField, TaxTrack } from "./types";

export const TAX_TRACK_LABELS: Record<TaxTrack, string> = { inheritance: "상속", gift: "증여", capital_gains: "양도", business_succession: "가업승계" };
const residency: TaxField = { key: "resident", label: "세법상 거주자 조건", type: "select", hint: "상속은 피상속인, 증여는 수증자 기준입니다. 가업주식 증여는 증여자·수증자 모두 확인합니다.", options: [{ value: "yes", label: "거주자 조건에 해당" }, { value: "no", label: "비거주자 포함 / 해당하지 않음" }] };
const availableCash: TaxField = { key: "availableCash", label: "세금 납부에 쓸 수 있는 현금", type: "money", optional: true, hint: "선택 항목. 비워두면 납부재원 부족액을 계산하지 않습니다." };

export function getTrackDescription(track: TaxTrack): string {
  return {
    inheritance: "같은 상속재산에서 배우자에게 배분하는 금액에 따른 1차 상속세를 비교합니다.",
    gift: "같은 현금 총액을 1명 또는 확인한 여러 명에게 증여할 때의 세금을 비교합니다.",
    capital_gains: "일반 상가·건물을 지금 양도하는 경우와 1년 더 보유하는 경우를 같은 가격과 현행 세법으로 비교합니다.",
    business_succession: "요건을 충족한 가업주식을 성년 자녀 1명에게 증여할 때 일반 과세와 과세특례를 비교합니다."
  }[track];
}

export function getScopeStatement(track: TaxTrack): string {
  return {
    inheritance: "재산은 피상속인 1인의 전체 상속재산이며, 법정상속인은 배우자(있는 경우)와 성년 자녀뿐이고 상속포기는 없습니다. 합산할 사전증여·추정/간주 상속재산·비과세 재산 및 장애인·연로자 등 추가 인적공제는 없습니다. 금융자산은 공제 대상 자산만 포함하며 최대주주 주식 등은 제외했습니다. 채무와 공과금은 공제 요건을 갖추었습니다. 기한 내 신고와 배우자 재산분할 요건을 충족하는 가정으로 비교합니다.",
    gift: "입력한 수의 서로 다른 수증자가 실제 증여 대상입니다. 같은 관계 유형이며, 관계는 증여자를 기준으로 확인했습니다. 최근 10년 합산 증여와 사용한 증여재산공제가 없고, 혼인·출산 등 추가공제는 적용하지 않습니다. 순수 현금을 증여하고 수증자가 자기 재원으로 세금을 내며 기한 내 신고합니다. 손자녀 등 세대생략 증여는 포함하지 않습니다.",
    capital_gains: "거주자 1인이 100% 소유한 등기된 일반 상가·건물 1건입니다. 주택·토지·비사업용 토지·미등기·부담부증여·증여받은 자산의 이월과세는 포함하지 않습니다. 필요경비는 인정 요건을 갖추었으며, 각 비교 연도에 다른 양도소득·손실·세액공제는 없어 연 250만원 기본공제를 전액 적용합니다. 향후 가격·비용·세법은 현재와 같다고 가정합니다.",
    business_succession: "60세 이상 부모가 19세 이상 성년 자녀 1명에게 증여하며, 최근 10년 합산 증여 및 사용한 공제가 없습니다. 조세특례제한법 제30조의6 및 시행령 제27조의6의 기업 규모·업종·10년 경영·지분 보유·대표이사 재직·수증자 종사 및 취임 요건을 확인했습니다. 입력 주식가액 전부가 특례 대상이며 비사업용 자산은 없습니다. 기한 내 신청과 5년 사후관리 요건을 지키며 세금은 수증자 재원으로 냅니다."
  }[track];
}

export function getTaxFields(track: TaxTrack): TaxField[] {
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
  return [...fields[track], residency, availableCash];
}
