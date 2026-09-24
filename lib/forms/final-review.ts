import { availableFiles, isPublicResource, useCategory, type LibraryDocument } from "./catalog";

export const FINAL_REVIEW_DATE = "2026-09-25";
type Correction = { assets?: string[]; common?: boolean; use?: LibraryDocument["useCategory"]; kind?: string; note: string };
export const CLASSIFICATION_CORRECTIONS: Record<string, Correction> = {
  "NTS-CG-10": { assets: ["real_estate", "business"], note: "사업용 자산의 이월과세 신청. 일반 배우자 증여 취득가액 이월과세 안내와 구별." },
  "NTS-CG-11": { assets: ["real_estate", "business"], note: "보존 원문의 사업전환·대토 등 자산 양도 및 대체 취득 내역을 기준으로 탐색 분류. 동명 주식 과세이연 서식과 구별." },
  "NTS-CG-12": { assets: ["real_estate", "business"], note: "현물출자·농지·공익사업용 토지 등 신청 구분에 따른 탐색 분류. 감면 자격 확정 아님." },
  "P0-13": { assets: ["real_estate", "other"], note: "취득세 납부서의 과세물건에 부동산 및 다른 취득세 대상 물건이 포함됨." },
  "P0-14": { common: true, note: "지방세 감면 신청은 특정 자산에 한정되지 않음. 해당 세목·감면 근거는 별도 확인." },
  "P0-15": { assets: ["real_estate", "other"], note: "취득세 비과세 확인의 과세물건 기준. 비과세 자격을 태그로 판단하지 않음." },
  "P2-11-GIFT-SPECIAL": { assets: ["cash_deposit", "securities", "business"], note: "창업자금 및 가업승계 주식 특례의 참고자료 범위." },
  "P9-01": { assets: ["real_estate", "business", "other"], note: "부동산·법인 등 등록에 관한 등록면허세 신고. 면허분 전체의 공통서식으로 분류하지 않음." },
  "NTS-IG-10-S5": { common: true, note: "영리법인의 상속 관련 면제·납부 명세는 특정 자산 종류에 한정되지 않음." },
  "NTS-IG-11-S6": { common: true, note: "공익법인 등의 가산세 명세는 자산 종류보다 의무 위반 유형에 따름." },
  "SVC-ACCOUNTS": { assets: ["cash_deposit", "securities"], note: "계좌정보통합관리서비스의 은행·증권사 계좌 조회 범위." },
  "SVC-CREDIT": { assets: ["debt"], note: "대출·보증 확인을 독립 채무 탐색 축으로 노출. 신용 조회를 자산 조회로 혼동하지 않음." },
  "BANK-ADD-03": { assets: ["debt"], note: "은행 부채 증명: 채무 확인 자료." },
  "BANK-ADD-04": { assets: ["debt", "cash_deposit"], note: "금융거래·차입 증빙. 거래은행의 발급 범위 확인 필요." },
  "P0-09": { use: "form", kind: "form", note: "한정승인에 첨부하여 작성하는 상속재산목록. 온라인 조회 서비스가 아님." },
  "P8-03": { use: "guide", kind: "guide", note: "친생자관계존부확인·인지청구의 소장 양식을 찾는 안내. 여기서 신청·발급하지 않음." },
};

export const PRIORITY_REVIEW: Record<string, { finding: string; limitation: string; sourceChecked: boolean }> = {
  "BP-G-01": { finding: "부평구청 취득세팀의 2026-03-27 게시물에 증여계약서·작성예시 및 공공누리 제1유형 표시가 있습니다. 기관이 제공한 계약 참고서식이며 법정 공통 계약서라는 근거는 없습니다.", limitation: "관할청 검인과 계약 당사자의 조건을 확인하세요. 개별 계약의 법적 적합성은 미검증입니다.", sourceChecked: true },
  "NTS-IG-12": { finding: "보존된 별지 제10호의2 합본의 본 신고서 부분입니다. 시행규칙의 2026-03-20 시행 표시는 재확인했습니다.", limitation: "현재 별지 첨부 원문과의 전체 대조는 미완료입니다. 창업자금·가업승계 특례 자격을 별도로 확인하세요.", sourceChecked: true },
  "NTS-CG-10": { finding: "국세청 양도 서식 경로와 보존된 2015년 이월과세적용신청서를 검토했습니다. 사업용 자산 신청서로 분류합니다.", limitation: "현행 별지 전체 대조 미완료. 기존 파일을 최신본으로 확정하지 않습니다.", sourceChecked: true },
  "NTS-CG-11": { finding: "보존된 2011년 과세이연신청서와 국세청 제공 경로를 검토했습니다. 같은 제목의 다른 제도 서식과 구분이 필요합니다.", limitation: "현행 별지 전체 대조 미완료. 거래 유형에 맞는 조항과 현재 서식을 확인하세요.", sourceChecked: true },
  "NTS-CG-12": { finding: "보존된 2016년 감면 신청서와 현행 조세특례제한법 시행규칙의 서식 제공 경로를 검토했습니다.", limitation: "현행 첨부 원문의 조항별 대조 미완료. 감면 대상과 기한은 별도 확인해야 합니다.", sourceChecked: true },
  "P2-05": { finding: "보존된 별지 제9호 합본의 사후관리 추징 신고 부분입니다. 시행규칙 2026-03-20 시행 표시는 확인했습니다.", limitation: "현행 첨부 원문 전체 대조 및 개별 사후관리 위반 판단은 미완료입니다.", sourceChecked: true },
  "P4-04": { finding: "IFEZ 2022-08-26 게시물은 계약 신고 후 해제·무효·취소 시 사용하는 별지 제4호 해제등 신고서를 제공합니다. 제3호 거래계약 신고와 구별합니다.", limitation: "게시물의 첨부 제목·절차는 확인했지만 현행 법령 별지와 바이너리 전체 대조는 미완료입니다.", sourceChecked: true },
  "P5-02": { finding: "별지 제10호의2 본 신고서에 연결되는 창업자금 평가·과세가액 명세 부분입니다. 가업승계 주식 명세와 별개입니다.", limitation: "현재 별지 첨부 원문 전체 대조 및 창업자금 특례 자격은 미검증입니다.", sourceChecked: true },
  "P5-03": { finding: "별지 제10호의2 본 신고서에 연결되는 가업승계 주식 등의 평가·과세가액 명세 부분입니다.", limitation: "현재 별지 첨부 원문 전체 대조 및 가업승계 특례 자격은 미검증입니다.", sourceChecked: true },
  "P6-03": { finding: "기존 2017년 보험 청구 참고자료의 수집 기록을 보존했습니다. HTTP 접근과 실제 문서의 최신성은 별개이며 이번에는 현행 안내 원문 대조를 완료하지 못했습니다.", limitation: "최신 안내 대조 보류. 실제 보험사·보험수익자별 청구 서류는 해당 보험사에 확인하세요. 접속 실패는 폐지 판정이 아닙니다.", sourceChecked: false },
};

const archiveReasons: Record<string, string> = {
  "SC-16": "일반건물 간이 임대차 참고계약: 승계·증여·양도 핵심 업무 밖의 임대차 자료로 별도 보관.",
  "SC-17": "아파트·연립주택 간이 임대차 참고계약: 임대차 거래용으로 별도 보관.",
  "SC-18": "상가건물 간이 임대차 참고계약: 상가 임대차 거래용으로 별도 보관.",
  "SC-19": "일반건물 임대차 참고계약: 소유권 승계가 아닌 임대차 계약용으로 별도 보관.",
  "SC-20": "아파트·연립주택 임대차 참고계약: 임대차 계약용으로 별도 보관.",
  "SC-21": "상가건물 임대차 참고계약: 상가 임대차 계약용으로 별도 보관.",
  "SC-27": "전세금 수령 영수증: 전세금 증빙에 한정되는 자료로 별도 보관.",
  "P1-09": "전세권설정등기: 상속·증여 소유권 이전등기와 다른 절차로 별도 보관.",
  "P2-06": "명문장수기업 확인: 가업승계 세제 신청과 별개인 기업 확인 제도로 별도 보관.",
};

export function applyFinalReview(documents: LibraryDocument[]): LibraryDocument[] {
  const titles = new Map(documents.map(item => [item.id, item.title]));
  const humanize = (text: string) => text.replace(/\b(?:BANK-ADD-\d+|LIB-ADD-\d+|NTS-[A-Z]+-\d+(?:-S[\w-]+)?|P\d+-\d+|SC-\d+)\b/g, id => titles.get(id) || id);
  return documents.map(original => {
    const item = structuredClone(original);
    if (!item.resource) return item;
    if (archiveReasons[item.id]) item.resource.presentation.reason = `${archiveReasons[item.id]} 구판·무효 판정이 아니며 대체 자료는 지정하지 않습니다.`;
    if (!isPublicResource(item)) return item;
    const correction = CLASSIFICATION_CORRECTIONS[item.id];
    if (correction) {
      if (correction.assets) { item.resource.facets.assets = correction.assets; item.assetCommon = false; }
      if (correction.common) item.assetCommon = true;
      if (correction.use) item.useCategory = correction.use;
      if (correction.kind) item.resource.facets.kind = correction.kind;
      item.editorialReview = { date: FINAL_REVIEW_DATE, status: "editorial_reviewed", note: correction.note };
      item.resource.classification = { status: "editorial_reviewed", note: correction.note };
    }
    if (["SVC-CREDIT", "BANK-ADD-03", "BANK-ADD-04"].includes(item.id)) item.searchAliases = [...(item.searchAliases || []), "채무", "빚", "대출", "부채 확인"];
    if (["P0-01", "P0-02", "P0-05", "P0-06", "P0-08"].includes(item.id)) item.searchAliases = [...(item.searchAliases || []), "부모님이 돌아가셨어요", "아버지가 돌아가셨어요", "어머니가 돌아가셨어요", "사망 후 할 일"];
    if (item.id === "BP-G-01") item.resource.facets.authority = "official_reference";
    const statutoryFile = (item.files as (LibraryDocument["files"][number] & { licenseBasis?: string; sourceUrl?: string; sha256?: string })[])
      .find(file => file.role === "original" && file.licenseBasis === "statutory-form" && file.sha256 && /^https:\/\/(www\.)?law\.go\.kr\//.test(file.sourceUrl || ""));
    if (item.resource.facets.authority === "unknown" && statutoryFile) {
      item.resource.facets.authority = "statutory";
      item.authorityEvidence = `보존된 국가법령정보센터 별지 원본 수집 기록: ${statutoryFile.sourceUrl}. 법정 서식의 성격만 반영하며 최신 개정·개별 적용 확인과 구분합니다.`;
    }
    if (item.id === "P4-04") item.form_no = "부동산 거래신고 등에 관한 법률 시행규칙 별지 제4호서식";
    if (item.id === "P0-09") {
      item.description = "한정승인을 준비하는 상속인이 재산·채무 내역을 작성하여 신고서에 첨부하는 목록입니다.";
      item.resource.relations.push({ type: "related_to", target_resource_id: "P0-08" });
    }
    if (item.id === "P8-03") item.description = "친생자관계 확인 또는 인지청구를 준비할 때 법원의 소장 양식과 절차를 찾는 안내입니다. 사건 유형에 맞는 양식을 따로 확인하세요.";
    if (item.usage) {
      item.usage.steps = item.usage.steps.map(humanize);
      item.usage.note = humanize(item.usage.note);
    }
    // Source collection, editorial classification and legal applicability are independent.
    const priority = PRIORITY_REVIEW[item.id];
    item.reviewSummary = priority ? { reviewedOn: FINAL_REVIEW_DATE, status: "partial", scope: "보존 자료·제공 경로 검토", finding: priority.finding, limitation: priority.limitation } : undefined;
    if (item.providerRoutes) item.providerRoutes = item.providerRoutes.map(route => ({ ...route, authentication: route.authentication.replace(" 로그인 후 발급은 여기서 실행하지 않았습니다.", "") }));
    if (useCategory(item) === "form" && !availableFiles(item).length) item.providerInstructions = {
      documentName: item.catalogTitle || item.title,
      menu: item.sourceUrl.includes("scourt") ? "법원 양식모음에서 문서명으로 검색" : item.sourceUrl.includes("nts.go.kr") ? "세무서식에서 문서명으로 검색" : "제공처의 서식·자료 메뉴에서 문서명으로 확인",
      limitation: "파일 직접 다운로드가 아닌 제공처 안내입니다. 하위 메뉴와 현재 첨부 제공 여부는 제공처에서 확인하세요.",
    };
    return item;
  });
}

// Entry points for common tasks across all five guides, followed by the complete stable list.
export const FIRST_TASK_IDS = ["P0-01", "SVC-ACCOUNTS", "P0-06", "P0-08", "P3-05", "BP-G-01", "REG-I-01", "NTS-CG-01", "NTS-IG-11", "NTS-IG-01", "P2-02", "P6-01"];
export const defaultPriority = (id: string) => FIRST_TASK_IDS.includes(id) ? FIRST_TASK_IDS.indexOf(id) : FIRST_TASK_IDS.length;
export function contextualGuide(query: string) {
  return /돌아가|사망|장례/.test(query) ? { href: "/forms/guides/after-death", label: "상속 발생 후: 신고·재산조회부터 확인" } : /증여|현금.*자녀/.test(query) ? { href: "/forms/guides/gift", label: "증여할 자산별로 필요한 자료 확인" } : null;
}
