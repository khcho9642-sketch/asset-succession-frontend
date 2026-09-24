import type { LibraryDocument } from "./catalog";
import editions from "./current-editions.json";

const DATE = "2026-09-25";
const tax = "https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=289267&efYd=20260918";
const estate = "https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=284609&efYd=20260320";
const property = "https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=283339&efYd=20260210";
const evidence = "docs/forms-final-review-20260925/source-followup/REVIEW.md";
const eligibility = "현행 제공 파일 확인과 개별 거래의 적용 자격·공제·감면 판단은 별개입니다. 제출 전 해당 조항과 관할기관 요구를 확인하세요.";
type Version = NonNullable<LibraryDocument["currentVersionReview"]>;
const version = (sourceUrl: string, finding: string, decision = "retain_current_source", limitation = eligibility): Version => ({ reviewedOn: DATE, status: "current_attachment_checked", sourceUrl, finding, decision, limitation });
export const CURRENT_VERSION_REVIEWS: Record<string, Version> = {
  "BP-G-01": { ...version("https://www.icbp.go.kr/main/bbs/bbsMsgDetail.do?bcd=taxes_form&msg_seq=64", "2026-03-27 기관 게시물의 증여계약서·작성예시와 공공누리 제1유형 표시를 재확인했습니다. 법정 공통계약서가 아닌 기관 참고서식으로 유지합니다.", "retain_official_reference", "개별 계약의 적합성·관할청 검인 요건은 별도 확인이 필요합니다."), status: "provider_reference_checked" },
  "NTS-CG-10": version(tax, "2026-09-18 시행규칙의 별지 제12호(2015-03-13 개정) HWP·PDF 원본을 확보했습니다. 오래된 개정일이어도 현행 목록에 있는 사업용 자산 이월과세 신청서입니다.", "prefer_current_attachment_preserve_previous"),
  "NTS-CG-11": version(tax, "별지 제12호의4는 2024-03-22 개정본입니다. 기존 2011년 파일과 달리 기회발전특구 이전·종전/신규 사업용부동산 및 시행령 제116조의37제9항 등이 포함됩니다. 현행 HWP·PDF를 우선 제공합니다.", "replace_default_preserve_previous"),
  "NTS-CG-12": version(tax, "별지 제13호는 2026-03-20 개정본입니다. 기존 2016년 파일 대신 현재 감면 구분·첨부서류가 있는 HWP·PDF를 우선 제공합니다. 원문 앞뒤의 조항 표기는 임의 수정하지 않았습니다.", "replace_default_preserve_previous"),
  "NTS-IG-12": version(estate, "현행 별지 제10호의2 합본의 본 신고서(1~2쪽). 보존 HWP는 현행 첨부와 SHA-256 일치, PDF는 6쪽 전부 공백 제외 추출문 일치입니다. PDF 바이너리 자체는 다르므로 해시 일치로 표시하지 않습니다."),
  "P2-05": version(estate, "현행 별지 제9호 합본의 가업(영농)상속공제 사후관리추징사유 신고(13~14쪽). 보존 HWP 해시 일치, PDF 17쪽 전부 공백 제외 추출문 일치입니다. 최초 공제신청과 구별합니다."),
  "P4-04": version(property, "2026-02-10 시행규칙의 별지 제4호(2020-02-27 개정) 해제등 신고서를 확보했습니다. 신고 후 해제·무효·취소용이며 변경신고와 다릅니다. 현행 법령 첨부 HWP·PDF를 우선 제공합니다.", "prefer_current_attachment_preserve_previous"),
  "P5-02": version(estate, "현행 별지 제10호의2의 창업자금 평가·과세가액 명세(3~4쪽). 합본 HWP 해시 및 PDF 전쪽 추출문을 대조했습니다. 특례 본 신고서에 연결하는 부표입니다."),
  "P5-03": version(estate, "현행 별지 제10호의2의 가업승계 주식 평가·과세가액 명세(5쪽). 합본 HWP 해시 및 PDF 전쪽 추출문을 대조했습니다. 창업자금 부표와 구분합니다."),
  "P6-03": { ...version("https://consumer.insure.or.kr/info/insuranceGuide/1/view.do", "생명보험협회의 현재 보험안내간행물 페이지와 PDF 다운로드 제공을 확인했습니다. 가입·유지·보험금 청구 참고자료이며 보험사별 청구서가 아닙니다.", "retain_provider_guidance", "연결 페이지는 확인했지만 PDF의 최종 개정일·현재 계약별 청구서까지 확인한 것은 아닙니다. 보험사와 수익자별 필요 서류는 해당 보험사에 확인하세요."), status: "provider_page_checked_document_revision_unverified" },
};

// Restore the actual earlier review date, never turn this metadata repair into a new source check.
export const RESTORED_SOURCE_IDS = ["SVC-ACCOUNTS", "SVC-INSURANCE", "SVC-CREDIT", "SVC-PENSION", "SVC-REGISTRY"];
type Route = NonNullable<LibraryDocument["providerInstructions"]>;
const routes: Record<string, Route> = {};
function route(ids: string[], menu: string, keywords: string, status: string, limitation: string, url?: string) {
  for (const id of ids) routes[id] = { documentName: "", menu, keywords, status, checkedOn: DATE, limitation: `파일 직접 다운로드가 아닌 제공처 안내입니다. ${limitation}`, url };
}
route(["P0-03"], "금융감독원 파인 → 상속인 금융거래조회 → 신청서류 → 위임장 다운로드", "상속인의 위임장", "attachment_list_confirmed", "위임장 버튼을 확인했습니다. 인감·본인서명 확인서와 대리인 서류는 신청기관 안내를 확인하세요.");
route(["P0-05"], "전자가족관계등록시스템 → 민원안내 → 신청서 양식 다운로드", "사망신고서", "menu_confirmed", "사망 신고 안내와 양식 다운로드 메뉴를 확인했습니다. 검색 후 현재 첨부를 선택하세요.");
const courtBlocked = "이번 공개 경로 확인은 HTTP 403으로 차단되었습니다. 현재 양식 목록·첨부는 미확인입니다. 전자소송포털의 양식모음에서 검색하거나 관할 가정법원에 문의하세요. 서식 폐지 판정은 아닙니다.";
for (const [id, term] of Object.entries({"P0-07":"상속포기", "P0-08":"상속한정승인", "P0-09":"상속재산목록 한정승인", "P0-10":"특별한정승인", "P1-15":"유언증서 검인", "P1-18":"상속재산분할", "P1-19":"기여분 결정", "P1-21":"상속재산관리인 선임", "P1-23":"부재자 재산관리인 선임 / 실종선고", "P8-01":"미성년자 특별대리인 선임", "P8-04":"상속재산 파산"})) route([id], "전자소송포털 양식모음 · 현재 접속 제한", term, "access_blocked", courtBlocked);
for (const [id, term] of Object.entries({"P1-01":"매매에 의한 소유권 이전등기 신청서", "P1-06":"공유물 분할에 의한 소유권 이전등기 신청서", "P1-08":"일부포기 / 해지에 의한 근저당권 말소등기 신청서"})) route([id], "생활법령 신청서 작성 안내 → 인터넷등기소 고객센터 → 지원안내 → 등기신청양식", term, "guidance_route_confirmed", "생활법령에 적힌 이동 경로·문서명을 확인했습니다. 인터넷등기소의 실제 첨부 화면은 오류 응답으로 확인하지 못했습니다. 구분건물 여부와 등기 원인을 구별하세요.");
for (const [id, term] of Object.entries({"P1-02":"매매 소유권이전등기 구분건물", "P1-10":"신탁등기", "P1-11":"소유권경정등기"})) route([id], "인터넷등기소 · 현재 접속 오류", term, "provider_error", "현재 주소가 오류 페이지로 이동하여 세부 메뉴·첨부를 확인하지 못했습니다. 인터넷등기소의 등기신청양식 또는 관할 등기소에 문서명으로 문의하세요.");
const klac = (q: string) => `https://www.klac.or.kr/legalinfo/legalFrm.do?pageIndex=1&folderId=000&listNm=${encodeURIComponent("전체")}&searchCnd=0&searchWrd=${encodeURIComponent(q)}&scdFolderId=`;
route(["P1-16"], "대한법률구조공단 → 법률정보 → 법률서식 → 서식제목 검색", "유언집행자 → 1068 유언집행자 선임청구서", "search_result_confirmed", "해당 제목과 HWP 다운로드 항목을 확인했습니다. 사건 사실관계와 관할법원 요구를 별도 확인하세요.", klac("유언집행자"));
route(["P1-20"], "대한법률구조공단 → 법률정보 → 법률서식 → 서식제목 검색", "유류분 → 461 유류분반환청구의 소", "search_result_confirmed", "해당 제목의 사례 서식을 확인했습니다. 현재 적용 법령·청구 요건을 보장하는 공통 소장이 아닙니다.", klac("유류분"));
route(["P8-02"], "대한법률구조공단 → 법률정보 → 법률서식", "상속회복", "no_matching_result", "상속회복 검색 결과는 0건입니다. 이전 진정명의회복 검색 결과를 상속회복 소장으로 동일시하지 않습니다. 공단·관할법원에 사건에 맞는 서식을 문의하세요.", klac("상속회복"));
route(["P1-22"], "서울가정법원 → 민원 → 각종 양식 → 성년후견", "[가사] 성년후견개시심판청구", "attachment_list_confirmed", "법원 목록의 해당 제목·검색 연결을 확인했습니다. 후속 파일 열기와 제출은 미실행입니다.");
route(["P8-08"], "서울가정법원 → 민원 → 각종 양식 → 한정후견 / 특정후견", "한정후견개시심판청구 / 특정후견심판청구", "attachment_list_confirmed", "각 후견 유형의 양식 목록을 확인했습니다. 두 유형의 신청 요건을 서로 대체하지 마세요.");
route(["P8-09"], "서울가정법원 → 민원 → 각종 양식 → 임의후견", "후견계약 등기신청서 / 임의후견감독인선임심판 청구", "attachment_list_confirmed", "계약 등기와 감독인 선임은 별개 양식입니다. 공정증서 작성·등기 등 절차는 제공처에서 확인하세요.");
route(["P8-10"], "서울가정법원 → 민원 → 각종 양식 → 해당 후견 유형", "거주 건물 또는 대지 매도허가 / 법정대리권의 범위변경", "related_titles_only", "포괄적인 권한 초과행위 허가라는 단일 양식으로 확인되지 않았습니다. 행위와 후견 유형에 맞는 허가·범위변경 양식을 법원에 확인하세요.");
route(["P2-14"], "국세청 불복청구 안내 → 각종 신청서 등 서식", "심사청구서 / 심판청구서", "attachment_list_confirmed", "두 청구서와 HWP·PDF 제공 메뉴를 확인했습니다. 과세전적부심사청구와 구별하고 제출기관을 확인하세요.");
route(["P3-05"], "세무법인 위드 → 서식자료실 → 현금증여계약서 → 첨부파일", "현금증여계약서.hwp", "attachment_list_confirmed", "민간 참고서식입니다. 정부 공식 서식·법정 필수 계약서가 아니며 개별 증여 조건 검토가 필요합니다.");
route(["P7-01"], "공무원연금공단 → 퇴직(유족)급여 청구방법 → 유족급여 / 고객참여와 상담 → 각종서식 → 연금서식", "유족급여 청구서", "guidance_route_confirmed", "현재 안내의 유족급여 작성방법을 확인했습니다. 재직 중 사망과 연금 수급 중 사망의 급여·서식을 공단에 구분 확인하세요.");
route(["P7-02"], "사학연금 → 퇴직급여종류 및 청구안내 → 유족 → 제203호 서식", "퇴직유족급여/퇴직수당 청구서", "attachment_list_confirmed", "현재 안내에서 제203호 게시물 연결을 확인했습니다. 재직 중 발생 유족급여용이며 퇴직 후 수급 중 사망은 별도 확인하세요.", "https://tp.or.kr/tp-kr/bbs/i-138/detail.do?ntt_sn=122");
route(["P7-03"], "군인연금 → 유족연금신청안내 → 4-1 청구서 및 구비서류 안내", "별지 제3호 퇴역유족연금 / 별지 제2호 상이유족연금", "attachment_list_confirmed", "퇴역·상이 연금에 따른 파일을 별도로 확인했습니다. 같은 이름의 공무원·사학연금 서식과 혼동하지 마세요.");
route(["P7-04"], "생활법령 산업재해보상보험 → 유족급여 → 유족보상연금의 청구", "유족급여 및 장례비 청구서", "guidance_route_confirmed", "현재 안내는 유족급여 및 장례비 청구서를 명시합니다. 장의비라는 기존 목록 표현과 구별하고 근로복지공단의 현재 청구 서식을 확인하세요.");
route(["P9-06"], "렌트홈 → 알림마당 → 민원법정서식 → 서식명 검색", "임대사업자 등록 / 등록사항 변경 / 등록 말소", "menu_confirmed", "실제 검색 메뉴는 확인했지만 동적 목록의 개별 첨부는 미확인입니다. 등록·변경·말소를 구별해 선택하세요.");
export const PROVIDER_REVIEW_ROUTES = routes;

export function applySourceFollowup(item: LibraryDocument): LibraryDocument {
  const edition = (editions as Record<string, NonNullable<LibraryDocument["currentEdition"]>>)[item.id];
  if (edition) {
    item.currentEdition = edition;
    item.revised_at = edition.revision;
    item.form_no = ({ "NTS-CG-10": "조세특례제한법 시행규칙 별지 제12호서식", "NTS-CG-11": "조세특례제한법 시행규칙 별지 제12호의4서식", "NTS-CG-12": "조세특례제한법 시행규칙 별지 제13호서식", "P4-04": "부동산 거래신고 등에 관한 법률 시행규칙 별지 제4호서식" } as Record<string, string>)[item.id];
    if (item.resource) item.resource.facets.authority = "statutory";
    item.authorityEvidence = "현행 시행규칙 별지 목록에서 직접 확보한 원본. current-20260925/index.json의 공식 다운로드 URL·SHA-256 참조. 개별 적용 자격 검증과 별개.";
  }
  const review = CURRENT_VERSION_REVIEWS[item.id];
  if (review) {
    item.currentVersionReview = review;
    item.reviewSummary = { reviewedOn: DATE, status: "partial", scope: "공식 제공본 대조 · 개별 적용은 별도 확인", finding: review.finding, limitation: review.limitation };
    item.sourceReview = { checkedOn: DATE, scope: "공식 공개 목록·첨부 또는 안내 확인", evidence };
  }
  if (RESTORED_SOURCE_IDS.includes(item.id)) item.sourceReview = { checkedOn: "2026-09-21", scope: "기존 공개 안내 검토 기록 복구 · 인증 후 개인조회 미실행", evidence: "docs/forms-life-guides-20260921/lookup-sources.md" };
  if (routes[item.id]) item.providerInstructions = { ...routes[item.id], documentName: item.catalogTitle || item.title };
  return item;
}
