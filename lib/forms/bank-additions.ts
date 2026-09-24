import type { LibraryDocument, ProviderRoute } from "./catalog";

export const BANK_CHECKED_ON = "2026-09-24";
export const BANK_SOURCES = {
  hanaDeposit: "https://www.kebhana.com/cont/customer/customer07/customer0701/customer070101/index.jsp",
  hanaDepositPdf: "https://image.kebhana.com/cont/customer/customer07/customer0701/customer070101/__icsFiles/afieldfile/2026/09/07/5-08-0084.pdf",
  kbDeposit: "https://obank.kbstar.com/quics?page=C112064",
  kbRepresentative: "https://okbfex.kbstar.com/quics?page=C112649",
  kbRepresentativeDoc: "https://okbfex.kbstar.com/quics?asfilecode=566703&QSL=F&_FILE_NAME=%EA%B3%B5%ED%86%B5%EB%8C%80%ED%91%9C%EC%83%81%EC%86%8D%EC%9D%B8%EC%A7%80%EC%A0%95.doc&_LANG_TYPE=KOR&formDocNo=68007&gubun=",
  wooriBalance: "https://spib.wooribank.com/pib/Dream?withyou=PSBKM0213",
  wooriDebt: "https://spib.wooribank.com/pib/Dream?withyou=PSBKM0137",
  wooriTransfer: "https://spib.wooribank.com/pib/help?withyou=PSTRS0015",
  wooriContact: "https://spot.wooribank.com/pot/Dream?withyou=CQCCS0004",
  hanaPension: "https://www.kebhana.com/cont/customer/customer07/customer0701/customer070108/index.jsp",
  hanaPensionPdf: "https://image.kebhana.com/cont/customer/customer07/customer0701/customer070108/__icsFiles/afieldfile/2026/09/18/5-14-0037.pdf",
  cooperatives: "https://www.nonghyup.com/complaint/complaint/newlyComplaintFaq.do",
} as const;
const allPurposes = ["inheritance", "gift", "capital_transfer", "business_succession"];
const related = (...ids: string[]) => ids.map(target_resource_id => ({ type: "related_to", target_resource_id }));
const heirNote = "상속인의 온라인 발급 자격·필요 서류는 이 공개 안내만으로 확인되지 않았습니다. 고인의 인증정보를 사용하지 말고 은행에 신청 자격, 대상 계좌, 필요 서류와 방문 여부를 확인하세요.";
function issueRoutes(url: string): ProviderRoute[] {
  return [
    { provider: "우리은행", customerType: "개인 인터넷뱅킹 이용자", applicantContext: "owner", label: "본인 발급 안내", url, sourceUrl: url, checkedOn: BANK_CHECKED_ON, channel: "개인 인터넷뱅킹 안내 · 제한 대상은 영업점 확인", authentication: "발급 시 본인 인증과 이용 자격 확인이 필요합니다. 로그인 후 발급은 여기서 실행하지 않았습니다.", note: "기업의 증명서는 기업뱅킹·거래 영업점에 별도로 확인하세요. 이 링크는 기업 발급 경로가 아닙니다." },
    { provider: "우리은행", customerType: "상속인 · 대리 신청 자격 확인 필요", applicantContext: "heir", label: "은행에 발급 방법 문의", url: BANK_SOURCES.wooriContact, sourceUrl: BANK_SOURCES.wooriContact, checkedOn: BANK_CHECKED_ON, channel: "공식 고객상담 · 영업점 방문 필요 여부 문의", authentication: "상속인 자격·위임·서류 요건은 은행 확인이 필요합니다.", note: heirNote },
  ];
}
function document(id: string, title: string, description: string, sourceUrl: string, form = false): LibraryDocument {
  return { id, title, catalogTitle: title, description, sourceUrl, category: form ? "은행 서식" : "조회·발급", originalCategory: "은행 자료", tags: "", format: form ? "PDF" : "", editable: "", example: null, thumbnail: null, sizeLabel: "", institution: form ? "하나은행" : "우리은행", institutionKind: form ? "은행 지정 서식" : "은행 발급 안내", providerScope: form ? "하나은행 전용" : "발급 경로: 우리은행", checkedOn: BANK_CHECKED_ON,
    license: "은행 공식 원문으로 연결합니다. 우리 서버에 파일을 복제·재배포하지 않습니다.", licenseUrl: sourceUrl, verification: "공식 공개 안내와 적용 범위를 확인했습니다. 인증 후 발급·창구 접수는 직접 실행하지 않았습니다.", exampleVerification: "", delivery: "official_link", files: [], useCategory: form ? "form" : "service", primaryAction: { label: form ? "하나은행 공식 PDF 열기" : "발급 안내", url: sourceUrl },
    resource: { resource_id: id, stage_ids: [form ? "S4" : "S1"], primary_stage_id: form ? "S4" : "S1", facets: { purposes: form ? ["inheritance"] : allPurposes, timing: form ? ["after_death"] : ["before_death", "after_death"], assets: ["cash_deposit"], kind: form ? "form" : "service_link", delivery: "official_link", origin: "private_institution", authority: "private_terms" }, presentation: { visibility: "standalone" }, relations: [], classification: { status: "editorial_reviewed", note: "은행별 적용 범위와 본인·상속인 맥락을 구별합니다." } } };
}
const deposit = document("BANK-ADD-01", "하나은행 상속예금 지급·명의변경 신청서", "하나은행 상속예금의 지급·명의변경을 신청할 때 사용하는 은행 지정 서식입니다.", BANK_SOURCES.hanaDeposit, true);
deposit.catalogTitle = "상속예금 명의변경(지급) 의뢰서 및 손해담보 확약서(상속예금 지급 위임장 겸용)";
deposit.files = [{ name: deposit.catalogTitle, path: BANK_SOURCES.hanaDepositPdf, format: "PDF", role: "original", bytes: 0, delivery: "official_link" }];
deposit.primaryAction!.url = BANK_SOURCES.hanaDepositPdf;
deposit.revised_at = "2026-09"; deposit.publishedOn = "2026-09-08";
deposit.searchAliases = ["하나 위임장", "하나 상속예금", "고인 통장 지급"];
deposit.resource!.relations = related("P6-01", "P0-06", "LIB-ADD-01", "LIB-ADD-02");
deposit.usage = { who: "하나은행 상속예금의 공동상속인·대표상속인 등 신청 자격을 확인한 사람", when: "상속관계와 은행별 지급 요건을 확인한 후 신청할 때", prepare: ["상속인 구성과 방문자·대리인 구분", "은행이 요구하는 상속관계·본인확인·위임 서류"], steps: ["P6-01 안내에서 해당 은행의 신청 조건을 확인합니다.", "하나은행 공식 PDF 2쪽과 현재 서식 목록을 확인합니다.", "공동상속인·대표상속인의 서명과 별도 위임 필요 여부를 은행에 확인하고 접수합니다."], note: "이 위임장은 대표상속인에 대한 지급 위임을 포함합니다. 대표상속인이 다시 다른 사람에게 위임하는 경우 별도 위임 요건을 확인하세요. P0-03 금융거래조회 위임장을 지급용으로 대체하지 마세요.", timingRationale: "상속 발생 후 지급 절차입니다.", sourceUrls: [BANK_SOURCES.hanaDeposit, BANK_SOURCES.hanaDepositPdf] };
deposit.verification = "2026-09-24 공식 목록의 2026-09-08 게시 표시, 실제 PDF 2쪽의 제목·2026.09 개정 표시·대표상속인 위임 범위를 확인했습니다. 접수 적합성은 은행에 확인해야 합니다.";

const certificates = [
  { id: "BANK-ADD-02", title: "예금잔액증명서 발급 안내", description: "특정 기준일의 예금 잔액을 증명할 때 발급 경로와 제한을 확인합니다.", url: BANK_SOURCES.wooriBalance, prepare: ["제출처·용도", "증명 기준일과 대상 계좌", "명의자 본인인지 상속인인지 구분"], aliases: ["잔액증명", "잔고증명", "우리은행 예금잔액"], ids: ["SVC-ACCOUNTS", "P0-02", "P6-01", "NTS-IG-06"] },
  { id: "BANK-ADD-03", title: "부채증명서 발급 안내", description: "차입·상속채무 확인에 필요한 부채 증명과 발급 대상을 확인합니다.", url: BANK_SOURCES.wooriDebt, prepare: ["제출처·증명 기준일", "차입자·대출 등 대상 거래", "부채증명서와 금융거래확인서 중 요구되는 서류"], aliases: ["부채증명", "대출잔액증명", "우리은행 채무"], ids: ["SVC-CREDIT", "P0-02", "BANK-ADD-04", "NTS-IG-06"] },
  { id: "BANK-ADD-04", title: "금융거래확인서 발급 안내", description: "제출처가 요구하는 금융거래 내용을 확인할 때 증명 종류와 발급 경로를 확인합니다.", url: BANK_SOURCES.wooriDebt, prepare: ["제출처와 요구 문서명", "거래 당사자·증명 기준일", "개인·기업 구분과 필요한 거래 범위"], aliases: ["금융거래확인", "우리은행 거래확인"], ids: ["SVC-CREDIT", "BANK-ADD-03", "P0-02"] },
  { id: "BANK-ADD-05", title: "이체확인증 발급 안내", description: "증여·양도 대금 등의 송금 증빙을 보관할 때 이체결과 조회와 확인증을 확인합니다.", url: BANK_SOURCES.wooriTransfer, prepare: ["이체일·조회 기간", "출금 계좌·금액·받는 사람", "제출처가 요구하는 증빙 종류"], aliases: ["송금확인증", "이체확인", "우리은행 송금", "자녀 현금 증여 증빙"], ids: ["P3-05", "NTS-IG-11", "NTS-CG-01", "SVC-ACCOUNTS"] },
].map(row => {
  const item = document(row.id, row.title, row.description, row.url);
  item.providerRoutes = issueRoutes(row.url);
  item.searchAliases = row.aliases;
  item.resource!.relations = related(...row.ids);
  // The existing asset axis has no debt enum; keep its values and document this mapping.
  if (["BANK-ADD-03", "BANK-ADD-04"].includes(row.id)) item.resource!.facets.assets = ["other"];
  if (row.id === "BANK-ADD-05") { item.resource!.stage_ids = ["S4"]; item.resource!.primary_stage_id = "S4"; }
  item.usage = { who: "명의자 본인 또는 발급 자격을 확인하려는 상속인", when: row.description, prepare: row.prepare, steps: ["제출처가 요구하는 문서와 기준일·기간을 확인합니다.", "아래에서 본인 또는 상속인 안내를 구별해 확인합니다.", "은행 발급 결과의 대상·기준일·거래 내용을 대조합니다."], note: row.id === "BANK-ADD-05" ? "이체확인 도움말은 모든 거래내역·모든 과거 기간을 보장하지 않습니다. 이체 사실만으로 증여 여부나 세무 처리가 확정되지는 않습니다." : "인터넷 발급이 제한되는 대상은 영업점에 문의하세요. 상속예금 지급용 구비서류를 증명서 발급 요건으로 그대로 적용하지 마세요.", timingRationale: "생전 본인 증빙과 상속 후 자격을 확인한 증빙 준비에 각각 사용합니다.", sourceUrls: [row.url, BANK_SOURCES.wooriContact] };
  return item;
});
const pension = document("BANK-ADD-06", "하나은행 퇴직급여 지급신청서 · DC·기업형IRP", "하나은행 DC·기업형IRP의 퇴직급여 지급신청서입니다. 사망 시에는 추가 첨부서류를 확인해야 합니다.", BANK_SOURCES.hanaPension, true);
pension.catalogTitle = "퇴직급여 지급신청서(DC, 기업형IRP)";
pension.files = [{ name: pension.catalogTitle, path: BANK_SOURCES.hanaPensionPdf, format: "PDF", role: "original", bytes: 0, delivery: "official_link" }];
pension.primaryAction!.url = BANK_SOURCES.hanaPensionPdf;
pension.revised_at = "2026-09"; pension.publishedOn = "2026-09-18";
pension.searchAliases = ["DC 사망", "기업형IRP 사망", "하나 퇴직연금 지급"];
pension.resource!.facets.assets = ["insurance_pension"];
pension.resource!.relations = related("P6-06", "SVC-PENSION", "P0-16");
pension.usage = { who: "하나은행 DC·기업형IRP 가입 사업장·가입자와 사망 시 청구 자격을 확인한 사람", when: "계약 제도가 DC·기업형IRP에 해당하고 은행의 지급 요건을 확인할 때", prepare: ["가입 제도·계약 금융기관·사업장 확인", "사업장 확인란과 신청 대상 정보", "사망 청구 시 은행이 정한 대표수익자 지정합의서 등 추가 첨부서류"], steps: ["DB·개인형IRP가 아닌 해당 제도인지 먼저 확인합니다.", "공식 PDF 2쪽의 사망 시 첨부 안내와 현재 서식 목록을 확인합니다.", "필요한 대표수익자 서류와 사업장 확인·접수 방법을 하나은행에 문의합니다."], note: "DB·개인형IRP 공통 서식이 아닙니다. 미확보 첨부서류의 다운로드를 제공하지 않습니다. P0-16 국민연금 급여 청구와도 다른 절차입니다.", timingRationale: "상속 발생 후의 퇴직급여 청구 용도로 연결합니다.", sourceUrls: [BANK_SOURCES.hanaPension, BANK_SOURCES.hanaPensionPdf] };
pension.verification = "2026-09-24 공식 목록의 2026-09-18 게시 표시와 실제 PDF 2쪽의 제목·2026.09 개정·사업장 확인란·사망 시 첨부 안내를 확인했습니다. 실제 청구는 실행하지 않았습니다.";
const kbRepresentative = document("BANK-ADD-07", "KB국민은행 퇴직연금 대표상속인 지정합의서", "KB국민은행 퇴직연금 가입자 사망 시 지급받을 대표상속인을 지정하고 공동상속인이 동의하는 은행 지정 서식입니다.", BANK_SOURCES.kbRepresentative, true);
kbRepresentative.catalogTitle = "대표상속인 지정합의서 [공통]";
kbRepresentative.institution = "KB국민은행";
kbRepresentative.providerScope = "KB국민은행 퇴직연금 전용";
kbRepresentative.format = "DOC";
kbRepresentative.editable = "Word";
kbRepresentative.revised_at = "2022-03";
kbRepresentative.form_no = "06206033";
kbRepresentative.files = [{ name: kbRepresentative.catalogTitle, path: BANK_SOURCES.kbRepresentativeDoc, format: "DOC", role: "original", bytes: 105984, delivery: "official_link" }];
kbRepresentative.primaryAction = { label: "KB국민은행 공식 DOC 받기", url: BANK_SOURCES.kbRepresentativeDoc };
kbRepresentative.searchAliases = ["KB 대표상속인", "국민은행 대표상속인 합의서", "퇴직연금 대표상속인 지정", "KB 퇴직연금 사망"];
kbRepresentative.resource!.facets.assets = ["insurance_pension"];
kbRepresentative.resource!.relations = related("P6-06", "P0-06", "LIB-ADD-01", "LIB-ADD-02");
kbRepresentative.usage = { who: "KB국민은행 퇴직연금 가입자가 사망한 경우의 공동상속인·대표상속인", when: "퇴직연금을 지급받을 대표상속인을 지정하고 상속인 동의·위임을 준비할 때", prepare: ["퇴직연금 계좌와 대표상속인·나머지 상속인 정보", "가족관계증명서 등 상속관계 확인 서류", "방문·미방문 및 미성년 상속인 여부에 따른 은행 요구 서류"], steps: ["KB퇴직연금 공식 서식 목록에서 대표상속인 지정합의서[공통]을 확인합니다.", "원본 Word 파일의 상속인 동의·위임 및 미성년자 법정대리인 항목을 확인합니다.", "해당 계약 제도에 맞는 지급신청서와 추가 구비서류를 KB국민은행에 확인한 뒤 함께 준비합니다."], note: "퇴직연금 지급용입니다. 일반 상속예금 지급 위임장, 금융거래조회 위임장 또는 다른 은행의 서식으로 대체하지 마세요. 이 합의서만으로 지급 신청이 완료되지는 않습니다. 파일은 DOC 형식이며 PDF 미리보기·작성예시는 제공하지 않습니다.", timingRationale: "상속 발생 후 퇴직연금 지급을 위한 대표상속인 지정입니다.", sourceUrls: [BANK_SOURCES.kbRepresentative, BANK_SOURCES.kbRepresentativeDoc] };
kbRepresentative.verification = "2026-09-24 현재 KB퇴직연금 공식 목록과 다운로드 원본 DOC를 대조했습니다. 원문의 제목·06206033·2022.3월 개정 표시, 퇴직연금 지급 동의·위임 및 첨부서류 내용을 확인했습니다. 2022-03은 파일 개정월이며 오늘의 게시일을 뜻하지 않습니다. 실제 창구 접수와 개별 계약의 수리 여부는 미검증입니다.";
export const BANK_DOCUMENTS: LibraryDocument[] = [deposit, ...certificates, pension, kbRepresentative];

export function applyBankAdditions(documents: LibraryDocument[]): LibraryDocument[] {
  return [...documents.map(original => {
    if (!["P6-01", "P6-06", "P0-02", "P6-02"].includes(original.id)) return original;
    const item = structuredClone(original);
    if (item.id === "P6-01") {
      item.description = "금융기관을 확인한 뒤 은행별 상속예금 지급 요건과 신청 서식을 준비합니다.";
      item.sourceUrl = BANK_SOURCES.hanaDeposit;
      item.providerScope = "KB국민은행 · 하나은행 · 농·축협(상호금융)";
      item.institutionKind = "은행별 절차 안내";
      item.checkedOn = BANK_CHECKED_ON;
      item.verification = "2026-09-24 KB국민은행·하나은행·농·축협의 공식 공개 안내를 확인했습니다. 실제 창구 접수는 실행하지 않았습니다. 기존 하나은행 공지는 아래 이력으로 보존합니다.";
      item.providerRoutes = [
        { provider: "KB국민은행", url: BANK_SOURCES.kbDeposit, note: "전원·일부 상속인 방문, 미성년자, 해외 거주, 유언 등 해당 상황의 구비서류를 확인하세요." },
        { provider: "하나은행", url: BANK_SOURCES.hanaDeposit, note: "현재 상속예금 서식과 대표상속인·별도 위임 여부를 확인하세요. 아래 관련 자료에 실제 서식이 있습니다." },
        { provider: "농·축협(상호금융)", url: BANK_SOURCES.cooperatives, note: "농·축협 FAQ의 상속예금 지급 안내입니다. NH농협은행 안내와 구분하고 거래 조합에 확인하세요." },
      ].map(route => ({ ...route, customerType: "거래기관의 상속예금 청구 대상", applicantContext: "heir", label: "상속예금 지급 안내", sourceUrl: route.url, checkedOn: BANK_CHECKED_ON, channel: "공식 안내 확인 후 거래기관에 신청 방법 문의", authentication: "방문자·대리 여부에 따른 본인확인·서류 요건은 해당 기관에 확인" }));
      item.usage = { who: "거래 금융기관을 확인한 상속인", when: item.description, prepare: ["전원·일부 상속인 방문 여부", "미성년자·해외 거주·유언·대리 신청 해당 여부"], steps: ["상속인 금융거래조회 등으로 거래기관을 확인합니다.", "아래 은행별 요건과 필요한 증빙을 확인합니다.", "해당 은행의 지정 신청서를 준비하고 거래기관에 접수합니다."], note: "은행별 소액 지급 기준·위임 방법·서류 유효기간이 다릅니다. 한 은행의 조건을 다른 은행에 적용하지 마세요.", timingRationale: "상속 발생 후 지급 절차입니다.", sourceUrls: item.providerRoutes.map(route => route.url) };
      item.supplementalSources = [...(item.supplementalSources || []).filter(source => source.url !== original.sourceUrl), { title: "이전 하나은행 상속예금 안내 (이력)", url: original.sourceUrl, institution: "하나은행", origin: "private_institution", note: "기존 출처를 보존한 이력입니다. 신청에는 위 현재 안내·서식을 먼저 확인하세요.", checkedOn: original.checkedOn }];
      item.resource!.relations.push(...related("P0-02", "BANK-ADD-01", "BANK-ADD-02", "BANK-ADD-03"));
    } else if (item.id === "P6-06") {
      item.description = "가입한 제도(DB·DC·개인형IRP·기업형IRP)와 계약 금융기관에 따라 청구 서류가 다릅니다.";
      item.usage = { who: "퇴직연금 계약과 사망 청구 자격을 확인하는 상속인", when: item.description, prepare: ["가입 제도와 계약 금융기관", "사업장 담당자·상속관계와 신청 자격"], steps: ["계약 금융기관에 제도별 청구 절차를 확인합니다.", "하나은행 DC·기업형IRP는 아래 관련 지급신청서를 확인합니다.", "미확보 제도별 서식은 계약 금융기관에 요청합니다."], note: "기존 고용노동부 자료는 제도 참고 출처이며 은행의 접수 경로가 아닙니다. 통합연금조회는 생전 조회, 국민연금 급여 청구는 별도 절차입니다.", timingRationale: "사망 후 퇴직연금 청구 안내입니다.", sourceUrls: [original.sourceUrl, BANK_SOURCES.hanaPension] };
      item.resource!.relations.push(...related("BANK-ADD-06", "SVC-PENSION", "P0-16"));
    } else if (item.id === "P0-02") {
      item.afterLookup = { title: "조회 결과를 확인한 다음", text: "통합조회는 은행 증명서 발급이나 예금 지급 신청이 아닙니다. 거래기관을 확인한 뒤 개별 은행 증빙과 상속예금 지급 요건을 확인하세요.", resourceIds: ["BANK-ADD-02", "BANK-ADD-03", "BANK-ADD-04", "P6-01"] };
      item.resource!.relations.push(...related(...item.afterLookup.resourceIds));
    } else item.resource!.relations.push(...related("P0-01", "P6-01"));
    return item;
  }), ...BANK_DOCUMENTS.filter(item => !documents.some(existing => existing.id === item.id))];
}
