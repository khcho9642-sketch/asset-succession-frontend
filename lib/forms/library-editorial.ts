import type { LibraryDocument } from "./catalog";
import { LOOKUP_SERVICES } from "./lookup-services";
import { POST_DEATH_LOOKUP_SERVICES } from "./post-death-lookup-services";

export const EDITORIAL_DATE = "2026-09-23";
export const EXCLUDED_IDS = ["SC-23", "SC-24", "SC-25", "SC-31", "NTS-CG-06", "NTS-CG-13", "P1-07", "P1-12", "P3-04", "P5-07", "P8-11", "P9-08", "P9-09"];
export const SERVICE_CONTEXTS: Record<string, string[]> = {
  "P0-06": ["family", "estate-family"], "P9-10": ["property-prices", "estate-prices"],
  "P6-02": ["dormant-deposits", "estate-dormant"], "P6-05": ["unclaimed-shares", "estate-shares"],
  "P0-01": ["inheritance-one-stop"], "P0-02": ["heirs-finance"], "P0-16": ["survivors-pension"],
  "SVC-ACCOUNTS": ["accounts"], "SVC-INSURANCE": ["insurance", "estate-insurance"],
  "SVC-CREDIT": ["debts"], "SVC-PENSION": ["pension"], "SVC-REGISTRY": ["registry", "estate-registry"],
};
export function serviceContexts(id: string, timing: string[] = []) {
  const ids = SERVICE_CONTEXTS[id] || [];
  return [
    ...(!timing.length || timing.includes("before_death") ? LOOKUP_SERVICES.filter(s => ids.includes(s.id)).map(service => ({ timing: "before-death" as const, service })) : []),
    ...(!timing.length || timing.includes("after_death") ? POST_DEATH_LOOKUP_SERVICES.filter(s => ids.includes(s.id)).map(service => ({ timing: "after-death" as const, service })) : []),
  ];
}
export function detailServiceContexts(id: string, timing: string[] = []) {
  const matching = serviceContexts(id, timing);
  const contexts = matching.length ? matching : serviceContexts(id);
  const fallback = Boolean(timing.length && !matching.length && contexts.length);
  return { contexts, notice: fallback ? (contexts[0].timing === "after-death" ? "상속 발생 후 이용하는 서비스입니다. 목록 조건을 유지한 채 사후 이용 안내를 보여드립니다." : "생전에 본인 자료를 조회하는 서비스입니다. 목록 조건을 유지한 채 본인 이용 안내를 보여드립니다.") : "" };
}
export function preferredProviderContext(timing: string[], guide?: string): "owner" | "heir" {
  return (timing.includes("after_death") && !timing.includes("before_death")) || (!timing.length && guide === "after-death") ? "heir" : "owner";
}
const allPurposes = ["inheritance", "gift", "capital_transfer", "business_succession"];
const both = ["before_death", "after_death"];
const gov = (id: string) => `https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=${id}`;
const hometax = "https://www.hometax.go.kr/";
const valuation = "https://nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7723&mi=2330";
type Addition = { id: string; title: string; institution: string; url: string; purposes: string[]; assets: string[]; common?: boolean; kind?: "form"; stage?: string; when: string; prepare: string[]; steps: string[]; note: string; sources?: string[] };
const additions: Addition[] = [
  { id: "LIB-ADD-01", title: "인감증명서 발급 안내", institution: "행정안전부 · 정부24", url: gov("13100000025"), purposes: allPurposes, assets: [], common: true,
    when: "거래·등기 등 제출기관이 인감증명서를 요구할 때", prepare: ["제출처와 발급 용도", "본인 신분증, 대리 발급이면 공식 안내의 위임·신분 확인 서류"], steps: ["정부24에서 온라인 발급 대상 용도인지 먼저 확인합니다.", "온라인 대상이 아니면 시·군·구 또는 읍·면·동의 방문 발급 절차를 확인합니다."],
    note: "부동산·자동차 매도용과 법원·금융기관 제출용은 일반용 온라인 발급 범위와 다릅니다. 고인의 인감증명서를 대리 발급받는 절차로 사용하지 마세요.", sources: ["https://mois.go.kr/frt/bbs/type010/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000008&nttId=112743"] },
  { id: "LIB-ADD-02", title: "본인서명사실확인서 발급 안내", institution: "행정안전부 · 정부24", url: gov("13110000047"), purposes: allPurposes, assets: [], common: true,
    when: "제출기관이 본인서명사실확인서를 받는 업무인지 확인할 때", prepare: ["본인 신분증", "제출처·용도와 수임인 정보가 필요한지 확인"], steps: ["본인이 발급기관을 방문해 신분 확인 후 서명합니다.", "전자본인서명확인서를 쓰려면 별도 이용승인 절차와 제출기관의 수용 여부를 확인합니다."], note: "종이 본인서명사실확인서의 방문 발급과 전자본인서명확인서를 구별하세요. 대리인이 대신 서명하는 서비스가 아닙니다." },
  { id: "LIB-ADD-03", title: "토지·임야대장 발급·열람 안내", institution: "국토교통부 · 정부24", url: gov("13100000026"), purposes: allPurposes, assets: ["real_estate"],
    when: "토지의 소재지·지번·지목·면적 등 대장 정보를 확인할 때", prepare: ["토지 소재지와 지번", "열람 또는 제출용 발급 여부"], steps: ["정부24의 토지(임야)대장 등본 발급(열람)에서 대장 종류와 필지를 선택합니다.", "발급 결과와 등기사항의 대상 부동산이 같은지 대조합니다."], note: "누구나 신청 가능한 공개 대장입니다. 대장만으로 현재의 모든 권리관계가 확정되는 것은 아니므로 등기사항도 확인하세요." },
  { id: "LIB-ADD-04", title: "건축물대장 발급·열람 안내", institution: "국토교통부 · 정부24", url: gov("15000000098"), purposes: allPurposes, assets: ["real_estate"],
    when: "건물의 용도·면적과 일반·집합건물 구분을 확인할 때", prepare: ["건물 소재지와 동·호수", "일반대장, 집합건물 표제부·전유부 중 필요한 종류"], steps: ["정부24 건축물대장 발급(열람)에서 소재지와 대장 종류를 선택합니다.", "대장의 건물·호수·면적을 계약·등기 자료와 대조합니다."], note: "건축물대장은 누구나 신청할 수 있습니다. 평면도 등 건축물현황도는 별도 세움터 발급 절차와 자격을 확인하세요." },
  { id: "LIB-ADD-05", title: "상속·증여재산 평가정보 조회", institution: "국세청 · 홈택스", url: valuation, purposes: ["inheritance", "gift"], assets: ["real_estate", "securities"],
    when: "상속·증여재산의 평가에 참고할 공식 정보를 찾을 때", prepare: ["재산 종류·소재지 또는 종목", "평가기준일과 비교할 거래 자료"], steps: ["국세청 안내에서 지원 자산과 제공 정보를 확인합니다.", "홈택스에서 ‘상속·증여재산 평가하기’를 검색하고 해당 서비스의 인증 안내를 따릅니다.", "비교 거래와 보충적 평가액을 확인한 뒤 실제 적용할 평가방법을 검토합니다."], note: "토지·주택·건물·오피스텔·상장주식 등 지원 범위가 정해져 있습니다. 반영 시차가 있으며 조회값 자체가 최종 신고가액은 아닙니다. 인증 후 개인별 조회는 이 사이트에서 수행하지 않습니다.", sources: [hometax] },
  { id: "LIB-ADD-06", title: "합산대상 증여재산 결정정보 조회", institution: "국세청 · 홈택스", url: "https://nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7730&mi=2342", purposes: ["gift", "inheritance"], assets: [], common: true,
    when: "과거 증여의 합산 대상 여부를 검토하기 위해 결정정보를 확인할 때", prepare: ["수증자 본인 확인 수단과 증여자·수증자 관계", "기존 신고서·결정내역·이체 등 별도 증빙"], steps: ["공식 안내에서 증여세 결정정보 조회 서비스를 확인합니다.", "홈택스에서 ‘증여세 결정정보 조회’를 검색하고 수증자 본인이 인증합니다.", "조회 결과를 이전 신고서와 실제 증여 증빙에 대조합니다."], note: "미신고 등으로 조회되지 않는 증여도 합산 여부를 별도로 검토하세요. 고인·타인의 인증정보로 로그인하지 마세요. 본인 외 조회 자격은 국세청에 확인해야 합니다. 로그인 이후 현재 메뉴·개인별 조회 결과는 직접 검증하지 않았습니다.", sources: [hometax] },
  { id: "LIB-ADD-07", title: "부동산 실거래가 조회", institution: "국토교통부", url: "https://rt.molit.go.kr/", purposes: allPurposes, assets: ["real_estate"],
    when: "비교할 부동산 거래와 계약 시점·가격을 확인할 때", prepare: ["지역과 부동산 유형", "계약 기간과 면적·층 등 비교 조건"], steps: ["실거래가 공개시스템에서 자산 유형과 지역을 선택합니다.", "계약일·해제 여부와 면적·층 등 조건을 확인합니다.", "필요한 범위는 자료제공 메뉴에서 조건을 선택해 받습니다."], note: "실거래가는 공시가격과 다릅니다. 공개된 거래 한 건을 세법상 시가로 바로 확정하지 마세요.", sources: ["https://rt.molit.go.kr/pt/xls/xls.do?mobileAt="] },
  { id: "LIB-ADD-08", title: "증권거래세 신고서·이용 안내", institution: "국가법령정보센터 · 국세청", url: "https://law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lspttninfSeq=64040", purposes: ["capital_transfer", "business_succession"], assets: ["securities"], kind: "form", stage: "S5",
    when: "주식 등의 양도에서 증권거래세 신고 대상과 작성 서식을 확인할 때", prepare: ["거래일·종목·수량·거래금액", "거래 방식과 납세의무자·신고 주체 확인"], steps: ["공식 PDF의 첫 두 페이지에서 본 신고서와 작성방법을 확인합니다.", "같은 합본의 부표 중 납세의무자 구분에 해당하는 자료만 준비합니다.", "홈택스의 증권거래세 신고 안내에서 적용 대상·신고 방식·기한을 확인합니다."], note: "양도소득세와 증권거래세는 다른 세목입니다. 2026-03-20 개정 본 신고서와 부표가 포함된 7쪽 공식 PDF로 연결하며 여기서 재배포하지 않습니다. 인증 후 신고 및 제출 적합성은 별도 확인이 필요합니다.", sources: ["https://www.nts.go.kr/nts/ad/nf/nltFormatTotalApiList.do", hometax] },
];
function addedDocument(row: Addition): LibraryDocument {
  const usage = { who: "해당 자료의 용도와 신청 자격을 확인하려는 이용자", when: row.when, prepare: row.prepare, steps: row.steps, note: row.note, timingRationale: "재산 이전 전 확인과 이전 후 절차에서 해당하는 경우 이용합니다.", sourceUrls: [row.url, ...(row.sources || [])] };
  return { id: row.id, title: row.title, category: row.kind ? "서식" : "조회·발급", description: row.when, tags: "", format: "", editable: "", example: null, thumbnail: null, sizeLabel: "", institution: row.institution, sourceUrl: row.url, checkedOn: EDITORIAL_DATE, license: "공식 제공처에서 이용. 원문·파일 재배포 없음.", verification: "공식 공개 안내 경로 확인. 인증 후 조회·발급·제출은 직접 실행하지 않음.", delivery: "official_link", originalCategory: "자료실 신규 안내", catalogTitle: row.title, exampleVerification: "", licenseUrl: row.url, files: [], usage, assetCommon: row.common,
    useCategory: row.kind ? "form" : "service", primaryAction: { label: row.kind ? "공식 서식 목록 열기" : "공식 이용 안내", url: row.url },
    editorialReview: { date: EDITORIAL_DATE, status: "public_guidance_reviewed", note: "공개 안내만 확인. 개인별 자격 판단·인증 후 이용은 별도." },
    resource: { resource_id: row.id, stage_ids: [row.stage || "S1"], primary_stage_id: row.stage || "S1", facets: { purposes: row.purposes, assets: row.assets, timing: both, kind: row.kind || "service_link", delivery: "official_link", origin: "official_institution", authority: row.kind ? "statutory" : "official_reference" }, presentation: { visibility: "standalone" }, relations: [], classification: { status: "editorial_reviewed", note: "공식 공개 안내의 이용 과업을 기준으로 분류. 제출 적합성 확인과 구별." } } };
}
export const NEW_DOCUMENTS = additions.map(addedDocument);
const securitiesForm = NEW_DOCUMENTS.find(item => item.id === "LIB-ADD-08")!;
securitiesForm.catalogTitle = "증권거래세 과세표준(정기, 수정, 기한 후)신고서";
securitiesForm.form_no = "증권거래세법 시행규칙 별지 제2호서식";
securitiesForm.revised_at = "2026-03-20";
securitiesForm.files = [{ name: "증권거래세 과세표준 신고서·작성방법·부표 (공식 합본 7쪽)", path: "https://law.go.kr/LSW/flDownload.do?bylClsCd=110202&flSeq=162621569", format: "PDF", role: "combined", bytes: 0, delivery: "official_link" }];
securitiesForm.verification = "2026-09-23 공식 PDF 본문·서식명·2026-03-20 개정 표시·7쪽 구성 확인. 법령 시행규칙의 서식이며 파일 재배포 없이 공식 원본으로 연결합니다.";
const serviceAssets: Record<string, string[]> = { "SVC-ACCOUNTS": ["cash_deposit"], "SVC-INSURANCE": ["insurance_pension"], "SVC-CREDIT": ["cash_deposit"], "SVC-PENSION": ["insurance_pension"], "SVC-REGISTRY": ["real_estate"] };
export const IMPORTED_SERVICES: LibraryDocument[] = Object.entries(serviceAssets).map(([id, assets]) => {
  const contexts = serviceContexts(id);
  const s = contexts[0].service;
  const item = addedDocument({ id, title: s.title, institution: s.provider, url: s.url, purposes: id === "SVC-REGISTRY" ? allPurposes : ["inheritance"], assets, when: s.purpose, prepare: [s.authentication.text], steps: [s.menu, ...s.checks], note: s.limitation, sources: s.evidenceUrls });
  item.checkedOn = "";
  item.verification = "기존 가이드의 조회 안내를 재사용합니다. 이번에 인증 후 조회를 실행하거나 출처를 전면 재검증한 것이 아닙니다.";
  item.resource!.facets.timing = [...new Set(contexts.map(c => c.timing.replace("-", "_")))];
  return item;
});

const aliases: Record<string, string[]> = { "P0-01": ["부모님 돌아가심", "부모님 돌아가셨", "사망 후 재산"], "P0-07": ["빚이 더 많음", "빚이 많아요"], "P0-08": ["빚이 더 많음", "빚이 많아요"], "P6-01": ["상속 통장", "고인 예금"], "P3-05": ["자녀에게 돈 주기", "자녀 현금 증여"], "LIB-ADD-06": ["자녀에게 돈 주기", "예전 증여"], "SVC-ACCOUNTS": ["내 통장 찾기"] };
const enrichment: Record<string, { prepare: string[]; steps: string[]; note: string; urls: string[] }> = {
  "NTS-IG-10": { prepare: ["상속재산·채무·공과금 및 장례비 증빙", "가족관계·기존 증여·공제 검토 자료"], steps: ["홈택스에서 상속세 신고 안내와 전자신고 지원 조건을 확인합니다.", "본 신고서와 해당 재산·평가·공제 부표를 구별해 작성합니다.", "증빙 첨부와 접수 결과·납부를 각각 확인합니다."], note: "부표 한 장을 작성하거나 내려받는 것만으로 신고가 완료되지 않습니다.", urls: [hometax] },
  "NTS-IG-11": { prepare: ["관계·증여일·이전 증빙", "과거 증여 신고·결정 자료와 공제 검토 자료"], steps: ["홈택스 증여세 신고 안내에서 일반 증여와 특례 서식을 구별합니다.", "합산대상 증여 결정정보를 실제 과거 증빙과 대조합니다.", "본 신고서·해당 부표·증빙을 준비하고 접수와 납부를 확인합니다."], note: "현재 자료는 기본세율 신고서입니다. 과거 조회 결과만으로 미신고 증여가 없다고 판단하지 마세요.", urls: [hometax, valuation] },
  "NTS-CG-01": { prepare: ["취득·양도 계약서와 지급 증빙", "자산 종류·필요경비·공제 요건 검토 자료"], steps: ["홈택스에서 부동산·주식 등 해당 자산의 양도소득세 신고 안내를 확인합니다.", "본 신고서와 해당 계산명세서를 준비합니다.", "국세 신고 후 지방소득세 신고·납부 절차도 별도로 확인합니다."], note: "부동산용 조건을 주식 등 다른 자산에 그대로 적용하지 마세요.", urls: [hometax] },
  "NTS-CG-15": { prepare: ["국세 양도소득세 신고 내역", "납세지와 개인지방소득세 신고 내역"], steps: ["위택스에서 개인지방소득세 양도소득분 신고 경로를 확인합니다.", "이미 신고했다면 납부할 내역과 납부서를 대조합니다."], note: "납부서는 신고서 전체가 아닙니다. 이 파일을 받는 것만으로 지방소득세 신고가 완료되지 않습니다.", urls: ["https://www.wetax.go.kr/"] },
  "P6-01": { prepare: ["거래 은행 확인", "은행이 요구하는 사망·상속관계 증명 및 신청인 본인확인 서류"], steps: ["해당 은행의 상속예금 지급 안내에서 상속인·대표자·대리인별 구비서류를 확인합니다.", "은행에 협의 내용과 인감·서명·위임 요건, 방문 여부를 확인한 뒤 접수합니다."], note: "현재 연결은 하나은행 안내입니다. 은행별 절차가 다르므로 공통 지급청구서로 사용하지 마세요.", urls: ["https://www.kebhana.com/cont/news/news01/news0101/1424358_118324.jsp"] },
  "P6-04": { prepare: ["보유 주식의 발행회사·보관기관", "상속관계와 이전 대상 계좌 확인 자료"], steps: ["명의개서가 필요한 주식은 발행회사 또는 해당 명의개서대리인 안내를 확인합니다.", "증권계좌 보관 주식은 해당 증권사의 상속 계좌 이전 절차를 확인합니다."], note: "발행회사 주주명부의 명의개서와 증권사 계좌 이전은 서로 다른 절차입니다. 한국예탁결제원이 모든 증권사 상속 이전을 처리하는 것은 아닙니다.", urls: ["https://ta.ksd.or.kr/"] },
};

/** Explicit editorial sets, not guesses from empty tags or file extensions. */
const commonIds = new Set(("BP-I-01 BP-I-01-EXAMPLE DD-G-01 DD-G-01-MULTIPLE DD-G-01-EXAMPLE FAMILY-I-01 FAMILY-I-01-BLANK NTS-IG-03 NTS-IG-04 NTS-IG-05 NTS-IG-07 NTS-IG-09 NTS-IG-10 NTS-IG-11 NTS-IG-13 NTS-CG-01 NTS-CG-02 NTS-CG-03 NTS-CG-04 NTS-CG-14 NTS-CG-15 NTS-IE-01 NTS-IE-02 NTS-IE-03 P0-01 P0-04 P0-05 P0-06 P0-07 P0-08 P0-09 P0-10 P1-14 P1-15 P1-16 P1-17 P1-18 P1-19 P1-20 P1-21 P1-22 P2-07 P2-10 P2-10-EXAMPLE P2-11 P2-11-GIFT P2-11-TRANSFER P2-12 P2-13 P2-14 P2-15 P3-03 P4-05 P5-04 P5-05 P5-06 P5-08 P8-01 P8-02 P8-03 P8-04 P8-05 P8-06 P8-08 P8-09 P8-10 P8-12 NTS-IG-10-S1 NTS-IG-10-S3 NTS-IG-10-S3-2 NTS-IG-10-S4-A NTS-IG-10-S4-B NTS-IG-11-S3 NTS-IG-11-S4").split(" "));
const realEstate = new Set("REG-I-01 REG-I-03 REG-G-01 P1-01 P1-06 P1-10 P1-11 P1-13 P3-06 P9-02 NTS-CG-09".split(" "));
const purposeOverrides: Record<string, string[]> = {};
const retainedReviewed = new Set(("SC-01 SC-02 SC-03 SC-04 SC-05 SC-06 SC-07 SC-08 SC-09 SC-10 SC-11 SC-12 SC-13 SC-14 SC-15 SC-26 NTS-IG-01 NTS-IG-02 NTS-IG-06 NTS-IG-08 NTS-IG-14 NTS-CG-05 NTS-CG-07 NTS-CG-08 NTS-CE-01 REG-I-02 REG-I-04 REG-G-02 P0-03 P0-11 P1-02 P1-23 P1-24 P2-01 P2-02 P2-03 P2-04 P2-08 P2-09 P3-01 P3-02 P3-05 P4-01 P4-02 P5-01 P6-03 P6-06 P7-01 P7-02 P7-03 P7-04 P7-05 P7-06 P9-04 P9-05 P9-07").split(" "));
const providerCorrections: Record<string, string> = {
  "P0-01": "행정안전부 · 정부24", "P0-02": "금융감독원", "P0-03": "금융감독원", "P0-04": "금융감독원",
  "P0-11": "국가법령정보센터", "P0-12": "국가법령정보센터", "P0-13": "국가법령정보센터", "P0-15": "국가법령정보센터",
  "P1-14": "법제처 찾기쉬운 생활법령정보", "P1-17": "법제처 찾기쉬운 생활법령정보",
  "P2-01": "국가법령정보센터", "P2-02": "국가법령정보센터", "P2-04": "국가법령정보센터", "P2-05": "국가법령정보센터",
  "P2-06": "중소벤처기업부", "P2-07": "국가법령정보센터", "P2-09": "국세청", "P2-10": "국가법령정보센터", "P2-12": "국가법령정보센터", "P2-13": "국가법령정보센터",
};
for (const id of "P0-12 P0-13 P0-14 P0-15 P1-08 P1-11 P1-13 P9-01".split(" ")) purposeOverrides[id] = ["inheritance", "gift", "capital_transfer"];
for (const id of "P1-06 P1-10 P1-22 P8-08 P8-09 P8-10 P8-12".split(" ")) purposeOverrides[id] = ["inheritance"];
for (const id of "P2-10 P2-10-EXAMPLE P2-12 P2-13 P2-14".split(" ")) purposeOverrides[id] = allPurposes;
purposeOverrides["P2-15"] = ["inheritance", "gift"];
purposeOverrides["P9-10"] = allPurposes;
purposeOverrides["P1-23"] = ["inheritance"];
purposeOverrides["P2-08"] = allPurposes;
purposeOverrides["P2-09"] = ["inheritance"];
purposeOverrides["P3-01"] = ["gift", "capital_transfer"];
for (const id of "SC-22 SC-28 SC-29 SC-30 P9-03".split(" ")) purposeOverrides[id] = ["inheritance", "gift"];
for (const id of "SC-16 SC-17 SC-18 SC-19 SC-20 SC-21 SC-27 P1-09 P9-06".split(" ")) purposeOverrides[id] = ["inheritance", "capital_transfer"];

export function applyLibraryEditorial(originals: LibraryDocument[]): LibraryDocument[] {
  return [...originals, ...NEW_DOCUMENTS, ...IMPORTED_SERVICES].map(original => {
    const item = { ...original, resource: original.resource ? structuredClone(original.resource) : undefined };
    const meta = item.resource;
    if (!meta) return item;
    if (providerCorrections[item.id]) item.institution = providerCorrections[item.id];
    if (EXCLUDED_IDS.includes(item.id)) { meta.presentation = { ...meta.presentation, visibility: "excluded", reason: "이번 자료실의 기본 제공 범위에서 제외" }; return item; }
    if (meta.presentation.visibility === "archived") return item;
    item.searchAliases = aliases[item.id] || [];
    if (commonIds.has(item.id)) item.assetCommon = true;
    if (item.id.startsWith("DD-G-01")) { item.assetCommon = false; meta.facets.assets = ["real_estate"]; }
    if (["P1-23", "P2-08", "P2-09"].includes(item.id)) item.assetCommon = true;
    if (item.id === "SC-26") meta.facets.assets = ["real_estate"];
    if (item.id === "P1-24") meta.facets.assets = ["other"];
    if (item.id === "P0-11") meta.facets.assets = ["real_estate", "other"];
    if (item.id === "P7-06") meta.facets.assets = ["insurance_pension"];
    if (realEstate.has(item.id)) meta.facets.assets = ["real_estate"];
    if (purposeOverrides[item.id]) meta.facets.purposes = purposeOverrides[item.id];
    if (["NTS-IG-06", "P0-02", "P0-03"].includes(item.id)) meta.facets.assets = ["cash_deposit", "insurance_pension", "securities"];
    if (["P9-04", "P9-05"].includes(item.id)) meta.facets.assets = ["business"];
    if (item.id === "NTS-IG-02") meta.facets.assets = ["real_estate", "business"];
    if (["NTS-IG-10-S7", "NTS-IG-11-S2"].includes(item.id)) {
      meta.facets.purposes = [item.id === "NTS-IG-10-S7" ? "inheritance" : "gift", "business_succession"];
      meta.facets.assets = ["business", "securities"];
      meta.stage_ids = [item.id === "NTS-IG-10-S7" ? "S6" : "S5"]; meta.primary_stage_id = meta.stage_ids[0];
      item.description = item.id === "NTS-IG-10-S7" ? "가업상속 납부유예를 적용받은 뒤 추징 사유가 생긴 경우 사용하는 신고·계산 자료입니다." : "가업승계 증여세 납부유예를 검토할 때 증여재산 평가와 세액을 작성하는 부표입니다.";
    }
    if (["NTS-IG-10-S8", "NTS-IG-11-S5"].includes(item.id)) meta.facets.assets = ["other"];
    if (SERVICE_CONTEXTS[item.id]) {
      item.useCategory = "service";
      const contexts = serviceContexts(item.id);
      meta.facets.timing = [...new Set(contexts.map(c => c.timing.replace("-", "_")))];
      if (item.id === "P0-06") { meta.facets.purposes = allPurposes; item.assetCommon = true; }
    } else item.useCategory ||= meta.facets.kind === "guide" ? "guide" : meta.facets.kind === "service_link" ? "service" : "form";
    const extra = enrichment[item.id];
    if (extra) {
      item.usage = { who: "해당 자산·절차의 신고 또는 이전을 준비하는 사람", when: item.description, prepare: extra.prepare, steps: extra.steps, note: extra.note, timingRationale: "자료별 적용 시점에 해당할 때 이용합니다.", sourceUrls: [item.sourceUrl, ...extra.urls] };
      item.supplementalSources = [...(item.supplementalSources || []), ...extra.urls.map(url => ({ title: url === hometax ? "홈택스 신고·조회 안내" : url.includes("wetax") ? "위택스 개인지방소득세" : "제공기관 절차 확인", url, institution: url === hometax ? "국세청" : url.includes("wetax") ? "위택스" : item.institution, origin: url.includes("kebhana") ? "private_institution" : "official_institution", note: "인증 후 실제 신청·신고는 해당 기관에서 진행하세요.", checkedOn: "" }))];
    }
    if (item.sourceRecordId && item.sourceRecordId !== item.id && !extra && !item.usage) item.usage = { who: "해당 문서의 제목과 적용 조건에 해당하는 사람", when: item.description, prepare: ["관련 본서식과 함께 필요한 증빙", "원본의 작성 방법과 개별 자료의 적용 조건"], steps: ["이 문서의 제목과 원본 페이지를 확인합니다.", "해당 항목을 본서식·증빙과 대조해 사용합니다."], note: "관련 본서식·증빙과 함께 검토하세요. 이 자료 하나만으로 전체 신고·신청이 완료되지 않습니다.", timingRationale: "개별 문서의 적용 조건을 확인합니다.", sourceUrls: [item.sourceUrl] };
    const reviewed = retainedReviewed.has(item.id) || commonIds.has(item.id) || realEstate.has(item.id) || Boolean(purposeOverrides[item.id]) || Boolean(item.usage) || Boolean(SERVICE_CONTEXTS[item.id]);
    item.editorialReview ||= { date: EDITORIAL_DATE, status: reviewed ? "editorial_reviewed" : "retained_needs_content_review", note: reviewed ? "자료명·용도에 따른 분류·이용 안내 검토. 법적 적용 판단 또는 서식 현행성의 전면 검증은 아님." : "기존 분류를 유지합니다. 원문 내용과 적용 조건의 추가 검토가 필요합니다." };
    meta.classification = { status: item.editorialReview.status, note: item.editorialReview.note };
    return item;
  });
}
