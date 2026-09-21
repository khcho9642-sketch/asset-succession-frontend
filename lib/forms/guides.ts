import { canonicalResourceId, catalogUrl, emptyFilters, resourceUrl, type ResourceMetadata } from "./catalog";

export type GuideTiming = "before-death" | "after-death";
export type GuideResource = { id: string; label: string; use: string };
export type GuideSource = { title: string; url: string };
export type GuideStep = {
  id: string;
  title: string;
  question: string;
  why: string;
  actions: string[];
  resources: GuideResource[];
  note?: { title: string; body: string };
  sources?: GuideSource[];
};
export type InheritanceGuide = {
  timing: GuideTiming;
  title: string;
  question: string;
  description: string;
  overview: string[];
  startLabel: string;
  notice: { title: string; body: string };
  steps: GuideStep[];
};
export type GuideResourceContext = {
  timing: GuideTiming;
  guideTitle: string;
  stepId: string;
  stepTitle: string;
  href: string;
};

const sources = {
  death: { title: "찾기쉬운 생활법령 · 사망신고", url: "https://m.easylaw.go.kr/MOB/CsmInfoRetrieve.laf?ccfNo=6&cciNo=1&cnpClsNo=1&csmSeq=707" },
  inquiry: { title: "정부24 · 안심상속 원스톱서비스", url: "https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=17400000001" },
  acceptance: { title: "찾기쉬운 생활법령 · 상속의 승인과 포기", url: "https://www.easylaw.go.kr/CSP/CnpClsMain.laf?ccfNo=4&cciNo=1&cnpClsNo=1&csmSeq=255" },
  inheritanceTax: { title: "국세청 · 상속세 신고납부기한", url: "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7719&mi=2325" },
  guardianship: { title: "찾기쉬운 생활법령 · 임의후견", url: "https://m.easylaw.go.kr/MOB/CsmInfoRetrieve.laf?ccfNo=3&cciNo=5&cnpClsNo=1&csmSeq=694" },
  will: { title: "찾기쉬운 생활법령 · 유언의 무효·취소", url: "https://easylaw.go.kr/CSP/CnpClsMainBtr.laf?ccfNo=4&cciNo=1&cnpClsNo=2&csmSeq=234&popMenu=ov" },
} satisfies Record<string, GuideSource>;

/** Curated tasks are entry points, not a mandatory order or a completion checklist. */
export const GUIDES: readonly InheritanceGuide[] = [
  {
    timing: "before-death",
    title: "생전 준비",
    question: "가족을 위해 무엇부터 준비할까요?",
    description: "가족과 재산을 정리하고, 이전 방법과 생활비를 함께 살펴보세요. 필요한 주제부터 시작할 수 있습니다.",
    overview: ["가족·재산 정리", "이전 방법·재원 비교", "의사 확인·실행 준비"],
    startLabel: "생전 준비 가이드 보기",
    notice: {
      title: "모든 서류를 한 번에 작성할 필요는 없어요",
      body: "먼저 아는 내용을 정리하고, 결정하지 못한 항목은 상담 질문으로 남기세요. 준비자료는 내 상황을 정리하는 용도이며, 실제 계약·신청에는 해당 서식과 별도 확인이 필요합니다.",
    },
    steps: [
      {
        id: "inventory", title: "가족과 재산을 한눈에 정리", question: "누가 있고, 무엇을 가지고 있나요?",
        why: "가족관계, 재산, 빚과 과거 증여 이력이 이후 비교의 출발점입니다.",
        actions: ["가족 구성과 부동산·예금·주식·보험·채무를 아는 범위에서 적으세요.", "과거에 주고받은 재산과 자금이동 증빙을 모으고, 확인하지 못한 사항을 표시하세요."],
        resources: [
          { id: "PLAN-01", label: "가족·자산·채무 정리 노트", use: "현황을 처음 정리할 때" },
          { id: "PLAN-02", label: "과거 증여·자금이동 점검표", use: "이전 내역과 증빙을 모을 때" },
          { id: "P0-06", label: "가족관계·기본증명서 발급 안내", use: "가족관계 확인이 필요할 때" },
          { id: "P9-10", label: "공시지가·공동주택가격 조회", use: "부동산 기초정보를 찾을 때" },
          { id: "P6-02", label: "휴면예금·미청구 보험금 조회", use: "누락된 예금과 보험금을 확인할 때" },
          { id: "P6-05", label: "미수령 주식·배당금 조회", use: "아직 수령하지 않은 주식·배당금을 확인할 때" },
        ],
        note: { title: "처음에는 대략적인 현황으로 충분해요", body: "정확한 금액이나 법적 관계가 불분명하면 추측으로 채우지 말고 ‘확인 필요’로 남기세요. 공시가격만으로 세금이나 이전 가격이 확정되지는 않습니다." },
      },
      {
        id: "options", title: "원하는 결과와 이전 방법 비교", question: "언제, 누구에게, 어떤 방식으로 이전할까요?",
        why: "절세뿐 아니라 소유권, 관리 권한, 가족의 필요와 이전 이후의 생활을 함께 비교해야 합니다.",
        actions: ["상속으로 남길지, 생전에 증여하거나 매각할지 비교하고 싶은 대안을 적으세요.", "누가 재산을 관리할지, 언제 사용할지, 가족 간 합의가 필요한 부분을 함께 정리하세요."],
        resources: [
          { id: "PLAN-03", label: "상속·증여·매각 대안 비교표", use: "비교 기준과 상담 질문을 정할 때" },
          { id: "P3-05", label: "현금 증여계약서", use: "현금 증여를 검토할 때 · 계약 내용 참고" },
          { id: "BP-G-01", label: "부동산 증여계약서", use: "부동산 증여를 검토할 때 · 계약 내용 참고" },
          { id: "P3-06", label: "부담부증여 계약 안내", use: "채무가 있는 재산의 이전을 검토할 때" },
        ],
      },
      {
        id: "funding", title: "생활비와 세금 낼 돈 함께 확인", question: "재산을 이전한 뒤에도 생활에 여유가 있나요?",
        why: "재산 가치와 당장 쓸 수 있는 현금은 다릅니다. 생활비와 예상 납부재원을 따로 정리하세요.",
        actions: ["계속 필요한 생활비·의료비와 유지할 현금, 재산에서 나오는 수입을 적으세요.", "세금에 쓸 수 있는 자금과 마련 가능한 시기를 비교하고 부족한 부분을 상담 질문으로 남기세요."],
        resources: [
          { id: "PLAN-04", label: "생활비·납부재원 점검표", use: "유지할 자금과 마련할 자금을 나눌 때" },
          { id: "P2-09", label: "분납 안내", use: "납부 방법을 미리 알아볼 때" },
          { id: "NTS-IG-13", label: "상속세·증여세 연부연납 신청서", use: "제도와 필요자료 확인용 · 생전 상속세 신청용 아님" },
          { id: "P2-07", label: "상속세 물납 신청서", use: "향후 납부 대안을 알아볼 때 · 요건 별도 확인" },
        ],
        note: { title: "제도를 먼저 알아보는 단계예요", body: "분납·연부연납·물납은 각각 요건과 절차가 다릅니다. 서식을 내려받았다는 이유로 이용 가능 여부가 확정되지는 않습니다." },
      },
      {
        id: "intent", title: "유언·신탁·후견의 역할 확인", question: "내 뜻과 재산 관리는 어떻게 이어질까요?",
        why: "유언으로 남길 뜻, 신탁으로 정할 재산 관리, 판단 능력 저하에 대비할 후견은 서로 다른 검토 주제입니다.",
        actions: ["재산을 누구에게 남길지와 내가 직접 관리하기 어려워질 때의 희망을 나눠 적으세요.", "방법을 결정하기 전에 요건·효력·실행 절차와 맡길 사람의 역할을 확인하세요."],
        resources: [
          { id: "PLAN-05", label: "유언·신탁·후견 상담 질문", use: "각 제도가 필요한 이유를 정리할 때" },
          { id: "P1-14", label: "자필증서 유언 작성 안내", use: "유언 방식과 작성 요건을 확인할 때" },
          { id: "P1-17", label: "공정증서 유언 안내", use: "공증을 통한 유언 방식을 알아볼 때" },
          { id: "P8-09", label: "임의후견 관련 양식", use: "장래의 판단 능력 저하에 대비할 때" },
          { id: "P1-10", label: "신탁등기 신청서", use: "신탁에 따른 부동산 등기 단계 참고" },
        ],
        note: { title: "현재 판단 능력에 어려움이 있다면", body: "생전이라는 이유만으로 모든 방법을 바로 선택할 수 있는 것은 아닙니다. 본인의 의사와 현재 상태에 맞는 절차를 먼저 확인하세요." },
        sources: [sources.will, sources.guardianship],
      },
      {
        id: "prepare", title: "상담 내용을 모아 실행 준비", question: "결정한 내용을 어떤 서류로 이어갈까요?",
        why: "정리한 사실, 확인할 질문, 결정할 사항을 모으면 상담과 실제 계약·신청을 이어가기 쉬워집니다.",
        actions: ["작성한 요약과 증빙을 모으고, 실행 전에 검토받을 질문을 추리세요.", "선택한 방법에 맞는 계약·등기·세금 신고를 준비하고, 재산이나 가족 상황이 바뀌면 다시 확인하세요."],
        resources: [
          { id: "PLAN-06", label: "전문가 상담 준비 묶음", use: "정리한 내용과 미확인 질문을 모을 때" },
          { id: "REG-G-01", label: "증여 소유권 이전등기 신청서", use: "부동산 증여 실행 시" },
          { id: "NTS-IG-11", label: "증여세 신고서 묶음", use: "증여 후 신고 자료를 준비할 때" },
          { id: "P3-04", label: "세무대리 위임장", use: "세무 업무를 위임하기로 한 경우" },
        ],
      },
    ],
  },
  {
    timing: "after-death",
    title: "상속 발생 후",
    question: "상속이 발생했어요. 무엇부터 해야 하나요?",
    description: "신고와 조회, 상속받을지에 대한 판단, 재산 정리와 세금까지 필요한 일을 찾아보세요.",
    overview: ["신고·기한 확인", "재산·채무 조회와 선택", "분할·이전·신고납부"],
    startLabel: "상속 발생 후 가이드 보기",
    notice: {
      title: "기한 확인과 재산조회는 함께 시작하세요",
      body: "아래는 필요한 일을 찾는 안내입니다. 모두 순서대로 마쳐야 하는 절차가 아니에요. 조회 결과를 기다리는 동안에도 상속포기·한정승인 등 신청기간을 따로 확인하세요.",
    },
    steps: [
      {
        id: "first-actions", title: "사망신고와 놓치면 안 될 일정 확인", question: "오늘 확인할 일은 무엇인가요?",
        why: "신고·조회·법원 신청·세금 신고는 필요한 서류와 기간이 서로 다릅니다.",
        actions: ["사망신고에 필요한 서류와 가족관계 증명자료를 준비하세요.", "재산조회 신청과 함께 상속포기·한정승인 등 선택의 신청기간을 확인하고, 세금·명의이전 일정도 따로 기록하세요."],
        resources: [
          { id: "P0-05", label: "사망신고서", use: "사망신고 서류를 준비할 때" },
          { id: "P0-06", label: "가족관계·기본증명서 발급 안내", use: "상속관계와 신청 자격을 확인할 때" },
          { id: "P0-01", label: "안심상속 통합조회 신청서", use: "재산·채무 조회를 함께 시작할 때" },
        ],
        note: { title: "빚이 있거나 아직 잘 모른다면", body: "아래 ‘받을지·포기할지 검토’도 지금 함께 확인하세요. 재산조회 결과가 모두 나온 다음에만 시작하는 단계가 아닙니다." },
        sources: [sources.death, sources.acceptance, sources.inheritanceTax],
      },
      {
        id: "estate-inquiry", title: "재산과 채무 함께 조회", question: "남겨진 재산과 빚은 얼마인가요?",
        why: "예금과 부동산뿐 아니라 대출·보증·미확인 채무까지 함께 파악해야 다음 판단을 할 수 있습니다.",
        actions: ["안심상속·상속인 금융거래조회 등 본인에게 해당하는 신청 방법을 확인하세요.", "조회 결과와 별도로 알고 있는 계약·채무 자료를 모으고, 기관별 추가 확인이 필요한 항목을 표시하세요."],
        resources: [
          { id: "P0-01", label: "안심상속 통합조회 신청서", use: "여러 기관의 재산정보를 신청할 때" },
          { id: "P0-02", label: "상속인 금융거래조회 신청서", use: "금융기관 거래를 확인할 때" },
          { id: "P0-03", label: "금융거래조회 위임장", use: "대리인이 조회를 신청하는 경우" },
          { id: "PLAN-01", label: "가족·자산·채무 정리 노트", use: "조회한 재산과 채무·미확인 사항을 모을 때" },
          { id: "PLAN-02", label: "과거 증여·자금이동 점검표", use: "생전 증여와 자금이동 증빙을 정리할 때" },
          { id: "P6-02", label: "휴면예금·미청구 보험금 조회", use: "해당 조회의 신청 자격과 범위를 확인할 때" },
          { id: "P6-05", label: "미수령 주식·배당금 조회", use: "추가로 확인할 주식·배당금이 있을 때" },
        ],
        sources: [sources.inquiry],
      },
      {
        id: "acceptance", title: "받을지·한정승인할지·포기할지 검토", question: "재산과 빚을 어떻게 이어받을까요?",
        why: "단순승인·한정승인·상속포기는 서로 다른 선택입니다. 각각을 모두 진행하는 절차가 아닙니다.",
        actions: ["확인한 재산·채무와 아직 모르는 사항을 바탕으로 선택별 효과와 신청기간을 확인하세요.", "상속재산을 인출·처분하거나 그 재산으로 채무를 갚기 전에는 선택에 미치는 영향을 확인하고, 판단이 어려우면 법률 상담을 받으세요."],
        resources: [
          { id: "P0-07", label: "상속포기 심판청구서", use: "상속포기를 검토하거나 신청하는 경우" },
          { id: "P0-08", label: "상속한정승인 심판청구서", use: "한정승인을 검토하거나 신청하는 경우" },
          { id: "P0-09", label: "한정승인 첨부 재산목록", use: "재산과 채무를 첨부자료로 정리할 때" },
          { id: "P0-10", label: "특별한정승인 심판청구서", use: "뒤늦게 초과채무를 알게 된 경우 · 요건 확인" },
          { id: "P8-05", label: "한정승인 후 청산 절차 안내", use: "한정승인 이후 필요한 절차를 확인할 때" },
        ],
        note: { title: "기한이나 채무가 불분명한 경우", body: "지금 가진 자료로 먼저 신청기간과 대응 방법을 확인하세요. 특별한정승인은 기간이 지난 모든 경우에 이용할 수 있는 대안이 아닙니다." },
        sources: [sources.acceptance],
      },
      {
        id: "transfer", title: "분할과 명의이전·급여 청구 준비", question: "누가 무엇을 받고, 어디에 신청하나요?",
        why: "유언의 유무와 상속인 관계를 확인하고, 재산별로 분할·명의이전·청구에 필요한 절차를 정리합니다.",
        actions: ["유언과 상속인 관계를 확인한 뒤 분할 협의가 필요한지 살펴보세요.", "부동산·예금·주식·보험·연금 중 해당 자산을 골라 기관별 최신 구비서류를 확인하세요."],
        resources: [
          { id: "BP-I-01", label: "상속재산분할협의서", use: "상속인 간 분할 내용을 문서로 정리할 때" },
          { id: "REG-I-03", label: "협의분할 상속등기 신청서", use: "협의분할한 부동산을 이전할 때" },
          { id: "REG-I-01", label: "상속 소유권 이전등기 신청서", use: "해당 방식의 상속등기를 준비할 때" },
          { id: "P6-01", label: "상속예금 지급 청구 안내", use: "은행별 예금 수령 절차 확인" },
          { id: "P6-04", label: "상속 주식 명의개서·계좌 이전", use: "주식과 증권계좌를 이전할 때" },
          { id: "P6-03", label: "상속 보험금 청구 안내", use: "보험계약별 수익자와 청구 절차 확인" },
          { id: "P0-16", label: "유족연금·일시금 청구서", use: "해당 급여의 수급 요건을 확인할 때" },
          { id: "P8-01", label: "미성년자 특별대리인 선임 청구서", use: "법정대리인과 이해상반 여부를 검토할 때" },
          { id: "P1-15", label: "유언증서 검인 청구서", use: "해당 유언에 검인이 필요한지 확인할 때" },
        ],
        note: { title: "배우자·미성년 상속인 또는 유언이 있다면", body: "배우자가 실제 상속받을 재산과 배우자 상속공제 요건을 함께 검토하세요. 미성년 상속인의 대리와 이해상반 여부, 유언 방식별 검인·집행 절차도 먼저 확인할 사항입니다. 보험·연금은 계약과 제도에 따라 수령 자격이 다릅니다." },
      },
      {
        id: "tax-payment", title: "세금 신고와 납부재원 준비", question: "어떤 세금을 언제, 어떻게 낼까요?",
        why: "상속세와 자산별 세금은 따로 확인해야 합니다. 신고 준비와 실제 납부할 자금 마련을 함께 진행하세요.",
        actions: ["재산평가·공제·과거 증여 등 신고 검토자료를 모으고 적용되는 신고납부기한을 확인하세요.", "납부 가능한 현금을 확인하고, 필요하면 분납·연부연납·물납 등의 요건과 신청 절차를 검토하세요."],
        resources: [
          { id: "PLAN-04", label: "생활비·납부재원 점검표", use: "남은 가족의 생활비와 상속세 납부재원을 나눠 볼 때" },
          { id: "NTS-IG-10", label: "상속세 신고서 묶음", use: "상속세 신고를 준비할 때" },
          { id: "P5-05", label: "상속재산 및 평가명세서", use: "재산 종류별 평가자료를 정리할 때" },
          { id: "NTS-IG-06", label: "금융재산 상속공제 신고서", use: "금융재산 공제 요건을 검토할 때" },
          { id: "NTS-IG-03", label: "배우자 상속재산 미분할 신고서", use: "배우자의 상속재산 분할이 지연된 경우 · 요건 확인" },
          { id: "P0-11", label: "취득세 신고서", use: "부동산 등 취득세 신고가 필요한 경우" },
          { id: "NTS-IG-13", label: "상속세·증여세 연부연납 신청서", use: "나누어 낼 기간과 신청 요건을 검토할 때" },
          { id: "P2-07", label: "상속세 물납 신청서", use: "허용 재산과 신청 요건을 검토할 때" },
        ],
        sources: [sources.inheritanceTax],
      },
      {
        id: "follow-up", title: "남은 절차와 정정·분쟁 확인", question: "추가로 확인하거나 마무리할 일이 있나요?",
        why: "추가 재산 발견, 신고 수정, 사업 관련 변경, 분할 분쟁 등은 상황에 따라 후속 처리가 필요합니다.",
        actions: ["접수·납부·이전 증빙과 남은 업무를 모으고, 추가 재산이나 채무를 알게 되면 기존 처리를 다시 확인하세요.", "신고 수정·사업 승계·가업상속 사후관리·가족 간 분쟁 중 해당 사항의 절차와 기한을 따로 확인하세요."],
        resources: [
          { id: "PLAN-06", label: "전문가 상담 준비 묶음", use: "확인한 사실과 남은 질문을 상담 전에 모을 때" },
          { id: "P2-10", label: "경정청구서", use: "이미 신고한 세금의 경정을 검토할 때" },
          { id: "P2-11", label: "기한후과세표준신고서", use: "법정 신고기한을 넘긴 경우" },
          { id: "P2-04", label: "사업자등록 정정신고서", use: "상속으로 사업 대표자가 변경되는 경우" },
          { id: "P2-05", label: "가업상속공제 사후관리 위반 신고서", use: "가업상속공제 사후관리 문제가 생긴 경우" },
          { id: "P5-08", label: "협의분할 후 재분할 안내", use: "이미 나눈 재산을 다시 나누려는 경우" },
          { id: "P1-18", label: "상속재산분할 심판청구서", use: "분할 협의가 어려워 법원 절차를 검토할 때" },
          { id: "FAMILY-I-01", label: "법원 상속재산명세표와 작성 예시", use: "상속재산분할 사건에 제출할 명세를 작성하는 경우" },
          { id: "P8-04", label: "상속재산 파산 신청서", use: "초과채무의 정리를 검토할 때" },
        ],
      },
    ],
  },
];

export const getGuide = (timing: string) => GUIDES.find(guide => guide.timing === timing);
export const guideUrl = (timing: GuideTiming, stepId?: string) => `/forms/guides/${timing}${stepId ? `#${stepId}` : ""}`;
export const guideResourceUrl = (id: string) => /^PLAN-\d{2}$/.test(id) ? `/forms/planning/${id}` : resourceUrl(id);
export const guideCatalogUrl = (timing: GuideTiming) => catalogUrl({ ...emptyFilters(), timing: [timing.replace("-", "_")] });

const stageFallbacks: Record<GuideTiming, Record<string, string>> = {
  "before-death": { S1: "inventory", S2: "options", S3: "intent", S4: "prepare", S5: "prepare", S6: "prepare", S7: "prepare" },
  "after-death": { S1: "estate-inquiry", S2: "acceptance", S3: "transfer", S4: "transfer", S5: "tax-payment", S6: "follow-up", S7: "follow-up" },
};

/** Named resource links have precise anchors; other classified inheritance resources use their existing stage. */
export function guidesForResource(id: string, metadata?: Pick<ResourceMetadata, "stage_ids" | "facets">): GuideResourceContext[] {
  const canonicalId = canonicalResourceId(id);
  return GUIDES.flatMap(guide => {
    let steps = guide.steps.filter(step => step.resources.some(resource => canonicalResourceId(resource.id) === canonicalId));
    if (!steps.length && metadata?.facets.purposes.includes("inheritance") && metadata.facets.timing.includes(guide.timing.replace("-", "_"))) {
      const stepId = metadata.stage_ids.map(stage => stageFallbacks[guide.timing][stage]).find(Boolean);
      steps = guide.steps.filter(step => step.id === stepId);
    }
    return steps.map(step => ({ timing: guide.timing, guideTitle: guide.title, stepId: step.id, stepTitle: step.title, href: guideUrl(guide.timing, step.id) }));
  });
}
