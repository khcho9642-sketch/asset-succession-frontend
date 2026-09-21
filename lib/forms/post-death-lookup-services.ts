import type { LookupService } from './lookup-services';

export type PostDeathLookupService = LookupService & {
  stepId: 'first-actions' | 'estate-inquiry' | 'transfer';
  application: {
    eligibility: string;
    documents: string[];
    representative: string;
    channel: string;
  };
};

const ASSET_LABEL = '재산별로 소유자와 현재 사용 상황을 적어 주세요.';
const DEBT_LABEL = '채무나 보증 등 함께 확인할 부담이 있나요?';
const UNKNOWN_LABEL = '아직 확인하지 못한 내용은 무엇인가요?';

// Public guidance only: applications, identity checks and source documents stay with each provider.
// Verification scope: docs/forms-life-guides-20260921/post-death-lookup-sources.md
export const POST_DEATH_LOOKUP_SERVICES: readonly PostDeathLookupService[] = [
  {
    id: 'estate-family', stepId: 'first-actions',
    title: '사망 사실·가족관계 서류 확인',
    provider: '대한민국 법원 · 전자가족관계등록시스템',
    url: 'https://efamily.scourt.go.kr/',
    menu: '증명서발급 → 가족관계등록부 / 제적부',
    purpose: '조회 신청에 필요한 사망 사실과 신청인의 관계를 증명할 자료를 준비합니다.',
    authentication: { kind: 'certificate', text: '발급 자격이 있는 신청인이 본인의 인증수단을 사용합니다. 고인의 계정·인증서로 로그인하지 마세요.' },
    application: {
      eligibility: '고인과의 관계 및 증명서별 발급 자격을 확인한 신청인. 온라인 발급 가능 범위는 방문 신청과 다를 수 있습니다.',
      documents: ['방문 신청인의 신분증', '제출처가 요구하는 고인 기준 기본·가족관계증명서의 종류와 상세 여부', '대습상속·과거 가족관계 등 추가 확인에 필요한 제적등본 등의 범위'],
      representative: '대리 발급은 창구에 위임·대리인 신분확인 자료를 문의하세요. 모든 상속인이 다른 사람의 모든 증명서를 온라인 발급할 수 있는 것은 아닙니다.',
      channel: '전자가족관계등록시스템에서 가능한 증명서를 발급하고, 온라인 발급 대상이 아니거나 관계가 확인되지 않으면 시·구·읍·면·동 창구에 문의하세요.',
    },
    checks: ['사망 기록이 반영되었는지와 누구를 기준으로 발급할지를 확인합니다.', '접수기관이 요구하는 증명서 종류·발급시점·기재 범위를 확인합니다.', '서류에 표시된 가족과 추가 확인할 관계를 나누어 정리합니다.'],
    targets: [
      { resourceId: 'PLAN-01', questionId: 'family_context', label: '함께 고려할 가족과 관계를 적어 주세요.', record: '실명·주민등록번호 없이 고인과의 관계와 확인일을 남기세요.', example: '고인의 배우자·자녀 2명 관계 확인 · 9월 21일 · 추가 관계 확인 중' },
      { resourceId: 'PLAN-01', questionId: 'unconfirmed_items', label: UNKNOWN_LABEL, record: '추가 증명서나 가족관계 확인이 필요한 이유를 적으세요.', example: '먼저 사망한 자녀의 가족관계 확인 필요 · 대습상속 여부 상담 예정' },
    ],
    limitation: '가족관계증명서 한 장만으로 모든 상속인이 확정되지는 않습니다. 발급 실패나 미표시는 관계가 없다는 뜻이 아닙니다.',
    evidenceUrls: ['https://efamily.scourt.go.kr/cs/CsBltnWrtGuide.do?bltnbordId=0000007&guideCd=0000007001&guideYn=Y', 'https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=97400000004'],
    relatedResourceIds: ['P0-06'],
  },
  {
    id: 'inheritance-one-stop', stepId: 'estate-inquiry',
    title: '안심상속 통합조회 신청',
    provider: '행정안전부·정부24 · 안심상속 원스톱서비스',
    url: 'https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=17400000001',
    menu: '사망자 및 피후견인 등 재산조회 통합처리 신청 → 사망자 조회',
    purpose: '금융·토지·세금·연금 가입유무 등 제공 항목을 묶어 신청하고 기관별 회신을 모읍니다.',
    authentication: { kind: 'heir', text: '온라인 신청은 자격 있는 상속인 본인이 인증합니다. 고인의 본인조회가 아니라 신청인의 상속관계를 확인하는 절차입니다.' },
    application: {
      eligibility: '온라인은 제1·2순위 상속인과 배우자 중 자격 있는 사람입니다. 선순위자의 상속포기로 자격을 얻은 제2순위자는 방문 대상입니다. 후순위자는 선순위자 유무를 먼저 확인하세요.',
      documents: ['신청인 신분증', '고인과 신청인의 상속관계 증빙', '행정정보 공동이용으로 확인되지 않는 가족관계증명서 등 추가자료'],
      representative: '제3순위·대습상속인·상속재산관리인과 법정·임의대리인은 방문 신청 자격·위임 증빙을 확인하세요. 제4순위 등은 통합신청 대상이 아니므로 개별 조회를 문의하세요.',
      channel: '정부24 온라인 또는 시·구청·읍·면·동 행정복지센터 방문. 신청 가능 시기와 본인 상황의 접수 요건은 공식 안내에서 확인하세요.',
    },
    checks: ['이미 신청한 금융조회와 중복되는 항목을 확인합니다.', '회신된 자산·채무와 아직 기다리는 항목을 구분합니다.', '조회 결과를 기다리는 동안에도 상속 승인·한정승인·포기 등 별도 기한을 확인합니다.'],
    targets: [
      { resourceId: 'PLAN-01', questionId: 'asset_notes', label: ASSET_LABEL, record: '회신기관·고인과의 관계·재산 종류·확인된 대략 금액·회신일을 적으세요.', example: '고인(부모님) · 토지 보유 회신 · 지분·가액 미확인 · 9월 21일' },
      { resourceId: 'PLAN-01', questionId: 'debt_notes', label: DEBT_LABEL, record: '채무·체납 회신을 자산과 분리하고 금액의 기준일·확정 여부를 남기세요.', example: '고인 관련 지방세 회신 · 금액 확인 중 · 9월 21일' },
      { resourceId: 'PLAN-01', questionId: 'unconfirmed_items', label: UNKNOWN_LABEL, record: '신청한 기관과 미회신·추가 확인할 항목을 적으세요. 접수번호는 이 노트에 옮기지 마세요.', example: '금융 회신 대기 · 건축물 지분과 대출잔액 추가 확인 필요' },
    ],
    limitation: '통합신청은 모든 재산·채무의 확정이나 상속재산 지급 절차가 아닙니다. 조회되지 않음·미회신·신청 실패를 0원으로 적지 마세요.',
    evidenceUrls: ['https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=17400000001'],
    relatedResourceIds: ['P0-01'],
  },
  {
    id: 'heirs-finance', stepId: 'estate-inquiry',
    title: '상속인 금융거래조회 신청·결과 확인',
    provider: '금융감독원 · 상속인 금융거래 조회',
    url: 'https://www.fss.or.kr/fss/cvpl/inhCerEc/main.do?menuNo=200010',
    menu: '상속인 금융거래 조회 → 신청서·안내문 / 접수 후 결과 확인',
    purpose: '고인의 거래 금융기관과 예금·채무 등 제공되는 정보를 확인합니다.',
    authentication: { kind: 'heir', text: '상속인 또는 적법한 대리인이 자격을 증명해 접수하고 신청인 정보로 결과를 확인합니다. 고인의 계정·인증수단은 사용하지 않습니다.' },
    application: {
      eligibility: '상속인 또는 적법한 대리인. 미성년자·후견 관련 신청은 법정대리권과 접수 요건을 확인하세요.',
      documents: ['신청인 신분증', '고인의 사망 사실을 확인하는 기본증명서·사망진단서 등', '고인 기준 가족관계증명서와 필요한 추가 상속관계 서류'],
      representative: '대리 신청은 기본 서류에 위임장·위임인의 인감증명서 또는 본인서명사실확인서와 대리인 신분증 등 접수처가 요구하는 증빙을 확인하세요.',
      channel: '금융감독원·접수 금융기관 등의 방문 접수를 확인하세요. 안심상속으로 금융조회를 이미 신청했다면 접수 여부부터 확인합니다. 웹 결과 확인과 신규 온라인 신청은 다릅니다.',
    },
    checks: ['회신된 기관과 예금·채무·보험 가입·투자 잔고 유무를 구분합니다.', '상세 거래내역·정확한 잔액·주식 수량 등은 해당 금융회사에 확인하고, 사망일 기준 금액과 조회일 현재 금액을 구분합니다.', '대출잔액과 보증·한도는 따로 적고, 안심상속 회신과 같은 자산을 중복 합산하지 않습니다.'],
    targets: [
      { resourceId: 'PLAN-01', questionId: 'asset_notes', label: ASSET_LABEL, record: '기관·자산 종류·확인된 대략 금액·회신 기준일과 상세 확인 여부만 적으세요.', example: '고인(부모님) · A은행 예금 약 2,000만원 / B증권 잔고 있음, 상세 미확인 · 9월 21일' },
      { resourceId: 'PLAN-01', questionId: 'debt_notes', label: DEBT_LABEL, record: '대출과 보증을 나누어 기관·대략 금액·기준일·확인할 조건을 남기세요.', example: '고인 · A은행 대출 약 3,000만원 / 보증 여부 별도 확인 중 · 9월 21일' },
      { resourceId: 'PLAN-01', questionId: 'unconfirmed_items', label: UNKNOWN_LABEL, record: '미회신 금융기관·정확한 잔액·조회 밖의 채무를 질문으로 남기세요.', example: 'B증권 종목·수량·평가액과 가족 간 채무 확인 필요' },
    ],
    limitation: '조회 가능한 금융회사와 정보에 한계가 있습니다. 결과 확인은 지급·해지·명의이전 권한을 부여하지 않으며 미회신은 재산·채무 없음이 아닙니다.',
    evidenceUrls: ['https://www.fss.or.kr/fss/cvpl/inhCerEc/main.do?menuNo=200010', 'https://www.kofia.or.kr/files/www/inheritGuide.pdf', 'https://www.kofia.or.kr/files/www/guide_pdf.pdf'],
    relatedResourceIds: ['P0-02', 'P0-03'],
  },
  {
    id: 'estate-insurance', stepId: 'estate-inquiry',
    title: '고인의 보험 가입·미청구보험금 확인',
    provider: '생명보험협회·손해보험협회 · 내보험찾아줌',
    url: 'https://cont.insure.or.kr/cont_web/information/information.do',
    menu: '상속인 조회안내 / 상속인 방문조회 결과보기',
    purpose: '고인의 보험계약을 찾아 실제 보험금 청구권자와 필요한 후속 확인을 정리합니다.',
    authentication: { kind: 'heir', text: '신청인의 상속자격을 확인합니다. 접수 후 온라인 결과는 상속인 본인인증으로 확인하며 고인의 인증수단을 사용하지 않습니다.' },
    application: {
      eligibility: '협회의 상속순위·신청 자격을 충족하는 상속인 또는 적법한 대리인. 보험금 청구권자는 계약상 수익자 등을 별도로 확인합니다.',
      documents: ['신청인 신분증', '사망확인 서류 또는 사망일자가 기재된 기본증명서', '고인 기준 가족관계증명서(상세) 및 순위·대리권 확인에 필요한 추가서류'],
      representative: '대리인은 상속인 신청서류와 위임장·위임인의 인감증명서·대리인 신분증 등을 준비하며, 미성년자·후견인은 법정대리권 범위를 확인하세요.',
      channel: '협회가 안내하는 지역 조회처에 방문 신청합니다. 금감원 상속인 금융거래조회 접수 후 보험 결과는 상속인 방문조회 결과보기에서 확인할 수 있습니다. 온라인 결과보기는 신규 방문접수를 대신하지 않습니다.',
    },
    checks: ['계약자·피보험자·수익자 관계를 구분하고 보험사별 문의사항을 정리합니다.', '미청구보험금과 사망보험금의 청구·심사 상태를 나누어 확인합니다.', '휴면보험금이나 다른 금융조회에 같은 금액이 있으면 중복 기록을 합칩니다.'],
    targets: [
      { resourceId: 'PLAN-01', questionId: 'asset_notes', label: ASSET_LABEL, record: '보험사·보험 종류·확인된 금액·조회일을 적고 청구권자 미확인은 그대로 표시하세요.', example: '고인 관련 A생명 계약 확인 · 미청구금 약 20만원 · 청구권자 확인 필요 · 9월 21일' },
      { resourceId: 'PLAN-01', questionId: 'unconfirmed_items', label: UNKNOWN_LABEL, record: '수익자 관계·지급요건·상속세 검토와 조회 밖의 보험을 확인할 질문으로 남기세요.', example: '사망보험금 수익자 관계와 세무상 처리 확인 · 우체국보험 별도 문의' },
    ],
    limitation: '상속인이라는 이유만으로 모든 보험금을 받는 것은 아닙니다. 보험금 청구권과 상속세상 취급은 별도이며 조회 목록을 상속재산총액으로 곧바로 합산하지 마세요.',
    evidenceUrls: ['https://cont.insure.or.kr/cont_web/information/information.do'],
    relatedResourceIds: ['P6-03'],
  },
  {
    id: 'estate-registry', stepId: 'estate-inquiry',
    title: '확인한 부동산의 소유·담보 등기 확인',
    provider: '대한민국 법원 · 인터넷등기소',
    url: 'https://www.iros.go.kr/',
    menu: '부동산 등기 열람·발급 → 대상 부동산 검색',
    purpose: '소재지를 알고 있는 부동산의 등기상 소유자·지분·담보권을 확인합니다.',
    authentication: { kind: 'public', text: '특정 부동산의 공개 등기기록을 열람하는 경로입니다. 서비스의 로그인·결제 안내를 따르며 고인 계정은 사용하지 않습니다.' },
    application: {
      eligibility: '특정 부동산의 공개 등기기록을 확인하려는 사람. 상속인 전용 개인 보유재산 조회와 다릅니다.',
      documents: ['공식 조회창에서 대상 부동산을 찾을 소재지·종류 정보', '이미 받은 토지·건축물 회신과 대조할 자료'],
      representative: '공개기록 열람과 상속등기 대리는 서로 다릅니다. 명의이전 신청을 맡길 때는 별도 위임·등기 요건을 확인하세요.',
      channel: '인터넷등기소의 열람·발급 안내를 확인합니다. 이 카드가 연결하는 것은 공개기록 확인이며 상속등기 신청이 아닙니다.',
    },
    checks: ['토지·건물·구분건물 중 대상이 맞는지 먼저 확인합니다.', '고인 소유 지분과 타인의 지분을 나누어 적습니다.', '근저당권 채권최고액과 실제 대출잔액을 구분하고 임대차 관계는 별도로 확인합니다.'],
    targets: [
      { resourceId: 'PLAN-01', questionId: 'asset_notes', label: ASSET_LABEL, record: '상세 주소 없이 관계·부동산 종류·고인의 지분·확인일을 적으세요.', example: '고인(부모님) · 공동명의 주택 지분 1/2 · 나머지 배우자 지분 · 9월 21일 등기 확인' },
      { resourceId: 'PLAN-01', questionId: 'debt_notes', label: DEBT_LABEL, record: '담보권의 존재·기관과 잔액 확인 필요 여부를 적으세요. 채권최고액을 채무잔액으로 옮기지 마세요.', example: '고인 지분 관련 A은행 근저당권 있음 · 실제 채무잔액 확인 필요' },
    ],
    limitation: '고인의 전국 보유 부동산 전체를 찾아주는 서비스가 아닙니다. 등기만으로 모든 채무·임대차·상속분할 결과가 확정되지는 않습니다.',
    evidenceUrls: ['https://www.iros.go.kr/', 'https://play.google.com/store/apps/details?id=kr.go.iros'],
    relatedResourceIds: [],
  },
  {
    id: 'estate-prices', stepId: 'estate-inquiry',
    title: '부동산 공시가격 기초자료 확인',
    provider: '국토교통부·한국부동산원 · 부동산공시가격 알리미',
    url: 'https://www.realtyprice.kr/notice/main/main.do',
    menu: '공시가격열람 → 공동주택 / 개별주택 / 개별지',
    purpose: '확인한 부동산의 가격 기초자료를 모으고 평가에 필요한 질문을 남깁니다.',
    authentication: { kind: 'public', text: '부동산과 기준연도를 지정하는 공개가격 조회입니다. 고인의 로그인이나 상속인 본인 금융인증은 사용하지 않습니다.' },
    application: {
      eligibility: '대상 부동산의 공개가격을 확인하려는 사람. 상속자격 판정이나 개인 재산목록 조회는 아닙니다.',
      documents: ['공식 조회창에서 부동산을 찾을 소재지·종류 정보', '조회할 기준연도와 고인 지분을 대조할 자료'],
      representative: '공개가격 조회를 돕는 것과 상속세 평가·신고를 위임하는 것은 별개입니다. 신고 대리는 별도 절차를 확인하세요.',
      channel: '공시가격 알리미에서 부동산 유형을 선택합니다. 개별지·개별주택은 연결된 지자체 조회 안내를 따르세요.',
    },
    checks: ['부동산 종류·가격 기준일·단위를 확인합니다.', '토지의 단위면적당 가격을 전체 가격과 구분하고 고인 지분도 확인합니다.', '등기로 확인한 기존 부동산 기록에 가격 근거를 붙이고 별도 재산처럼 다시 더하지 않습니다.'],
    targets: [
      { resourceId: 'PLAN-01', questionId: 'asset_notes', label: ASSET_LABEL, record: '공시가격 종류·기준연도·대략 금액·확인일을 적고 전체 부동산 가격인지 고인 지분 금액인지 구분하세요.', example: '고인 관련 주택 전체 공시가격 약 3억원 · 2026년 기준 · 고인 지분 1/2, 상속평가 미확정' },
      { resourceId: 'PLAN-01', questionId: 'unconfirmed_items', label: UNKNOWN_LABEL, record: '사망 시점의 평가에 필요한 시가·감정 등 추가 자료를 질문으로 남기세요.', example: '상속개시일 기준 평가방법과 인근 거래·감정자료 확인 필요' },
    ],
    limitation: '공시가격은 상속세 신고가액이나 현재 매각가격을 확정하지 않습니다. 조회되지 않는 부동산은 가치가 0원이라는 뜻이 아닙니다.',
    evidenceUrls: ['https://www.realtyprice.kr/notice/main/main.do'],
    relatedResourceIds: ['P9-10'],
  },
  {
    id: 'estate-dormant', stepId: 'estate-inquiry',
    title: '고인의 출연 휴면예금·보험금 확인',
    provider: '서민금융진흥원 · 상속인 휴면예금 조회',
    url: 'https://www.kinfa.or.kr/financialLife/sleepmoney.do',
    menu: '휴면예금 조회·지급 → 상속인 조회',
    purpose: '서민금융진흥원에 출연된 고인의 휴면재산 조회 경로와 필요한 후속 신청을 확인합니다.',
    authentication: { kind: 'heir', text: '생존자 본인조회와 구분된 상속인 조회 경로를 이용합니다. 상속인·대리인 자격은 제공기관 안내에 따라 확인하고 고인 계정은 사용하지 않습니다.' },
    application: {
      eligibility: '고인의 휴면예금 조회를 신청할 상속인 또는 기관이 인정하는 대리인. 실제 접수·결과조회 대상은 서비스 안내에서 확인하세요.',
      documents: ['신청인 신분확인 자료', '사망 사실·상속관계를 확인할 서류의 종류를 기관에 확인', '기존 상속인 금융거래조회 접수 여부와 추가 제출 요구 확인'],
      representative: '대표 신청·대리 조회·상속 지급의 요건은 서로 다를 수 있습니다. 위임장 등 필요한 증빙과 방문 여부를 서민금융진흥원에 먼저 문의하세요.',
      channel: '공식 안내의 상속인 조회에서 약관동의·신청인 본인확인 후 신청 안내를 확인하세요. 미성년자는 법정대리인 동의와 방문 안내를 확인합니다. 지급·대리 신청 경로는 기관에 별도로 문의하세요.',
    },
    checks: ['조회 대상이 서민금융진흥원에 출연된 휴면예금·보험금인지 확인합니다.', '기관·종류·금액·회신일을 기존 금융·보험 조회와 대조합니다.', '조회 결과 확인과 실제 상속 지급 신청을 나누어 진행합니다.'],
    targets: [
      { resourceId: 'PLAN-01', questionId: 'asset_notes', label: ASSET_LABEL, record: '고인과의 관계·기관·휴면재산 종류·대략 금액·확인일과 중복 여부를 적으세요.', example: '고인(부모님) · 출연 휴면예금 약 10만원 · 9월 21일 · 기존 금융 회신과 중복 확인 중' },
      { resourceId: 'PLAN-01', questionId: 'unconfirmed_items', label: UNKNOWN_LABEL, record: '조회 대상·결과 대기·상속 지급서류 등 아직 확인할 내용을 적으세요.', example: '상속인 조회 대상 여부와 지급에 필요한 공동상속인 서류 문의 예정' },
    ],
    limitation: '모든 휴면계좌·미청구보험금을 포괄하지 않습니다. 온라인 상속 지급이 모두 가능하다는 뜻이 아니며 조회 미완료를 0원으로 기록하지 마세요.',
    evidenceUrls: ['https://www.kinfa.or.kr/financialLife/sleepmoney.do', 'https://www.kinfa.or.kr/cyber/pymntReqst/inhrtncIndvdlinfo.do'],
    relatedResourceIds: ['P6-02'],
  },
  {
    id: 'estate-shares', stepId: 'estate-inquiry',
    title: '고인의 미수령 주식·배당 관련 확인',
    provider: '한국예탁결제원 · 주주서비스',
    url: 'https://ta.ksd.or.kr/index.jsp',
    menu: '주주서비스 → 상속인 금융거래 조회',
    purpose: '상속인 조회 경로에서 고인의 주식을 확인하고 상세 수량·배당·수령 절차는 기관에 문의합니다.',
    authentication: { kind: 'heir', text: '상속인 조회·상속 업무 경로에서 신청인 자격을 확인합니다. 고인의 일반 주식찾기 본인인증을 대신 사용하지 마세요.' },
    application: {
      eligibility: '고인의 주식 관련 조회·업무를 진행하는 상속인 또는 적법한 대리인. 예탁결제원의 담당 범위와 접수 여부를 먼저 확인하세요.',
      documents: ['신청인 신분확인 자료', '고인의 사망·상속관계 증빙 중 해당 업무에서 요구하는 서류 확인', '확인한 회사·주식 종류와 기존 금융조회 결과'],
      representative: '대표 상속인·대리인의 위임 범위와 공동상속인 관련 서류는 조회·명의개서·수령별로 기관에 확인하세요.',
      channel: '공식 주주서비스의 상속인 금융거래 조회 안내를 확인하고, 상세 조회·명의개서·수령은 예탁결제원 또는 해당 증권사에 방문·접수 방법을 문의하세요.',
    },
    checks: ['조회된 회사와 담당 명의개서 대행기관·증권사를 확인합니다.', '확인한 주식 수량·평가금액·배당내역·실제 수령 여부를 구분합니다.', '증권계좌에 이미 잡힌 주식·배당을 중복 합산하지 않고 조회 결과와 이전·지급 완료를 구분합니다.'],
    targets: [
      { resourceId: 'PLAN-01', questionId: 'asset_notes', label: ASSET_LABEL, record: '관계·회사·확인한 주식 수량·평가 확인 여부·배당 수령 상태·확인일을 적으세요. 주권번호는 적지 마세요.', example: '고인(부모님) · A회사 주식 10주 · 평가액 미확인 / 배당내역 약 5만원, 수령 여부 미확인 · 9월 21일' },
      { resourceId: 'PLAN-01', questionId: 'unconfirmed_items', label: UNKNOWN_LABEL, record: '기관에서 확인할 주식 평가·미수령 여부·상속 이전 서류를 질문으로 남기세요.', example: 'A회사 주식의 명의개서 기관과 상속 이전 서류 확인 필요' },
    ],
    limitation: '모든 회사·증권계좌가 조회되는 것은 아닙니다. 일반 주주용 배당 조회가 상속인에게 그대로 제공된다고 보장하지 않으며 배당내역 전체를 미수령금으로 보지 마세요.',
    evidenceUrls: ['https://ta.ksd.or.kr/index.jsp'],
    relatedResourceIds: ['P6-04', 'P6-05'],
  },
  {
    id: 'survivors-pension', stepId: 'transfer',
    title: '유족연금 등 받을 급여 확인',
    provider: '국민연금공단 · 유족연금 안내',
    url: 'https://www.nps.or.kr/pnsinfo/ntpsklg/getOHAF0072M0.do?menuId=MN24001121',
    menu: '유족연금 → 청구방법·구비서류 / 지사 상담',
    purpose: '남은 가족의 수급권과 예상 생활비 수입을 확인합니다.',
    authentication: { kind: 'heir', text: '수급권을 확인할 유족 또는 인정되는 대리인이 신청합니다. 고인의 연금계정 로그인이나 기존 지급계좌의 임의 사용으로 진행하지 않습니다.' },
    application: {
      eligibility: '사망한 가입자 등의 가입·납부 요건과 유족의 관계·생계유지·순위 등 요건에 따라 심사합니다. 민법상 상속인과 수급권자가 항상 같지는 않습니다.',
      documents: ['유족연금지급청구서와 수급권자 신분증', '고인의 폐쇄등록부 가족관계증명서·사망진단서 또는 사체검안서', '장애발생·사망 경위 신고서와 수급권자 지급계좌 자료 · 사안별 추가서류는 공단 확인'],
      representative: '미성년자·후견·대리청구는 법정대리권 또는 위임 요건을 공단에 확인하세요. 가족이라는 사정만으로 모두 대신 청구할 수 있는 것은 아닙니다.',
      channel: '공식 안내는 전국 국민연금공단 지사 방문 또는 우편 청구를 안내합니다. 상담 1355에서 서류·대리청구·기한을 확인하세요. 이 링크는 온라인 청구를 약속하는 경로가 아닙니다.',
    },
    checks: ['유족연금·반환일시금·사망일시금 중 확인할 급여와 수급권자를 구분합니다.', '가입유무 조회 결과와 급여 지급결정을 구분합니다.', '확인된 월수입·수령 조건을 생활비 계획에 기록하고 고인의 상속재산총액에 더하지 않습니다.'],
    targets: [
      { resourceId: 'PLAN-04', questionId: 'income_notes', label: '수입이 유지되는 조건이나 변동 가능성을 적어 주세요.', record: '받을 사람은 관계로 적고 급여 종류·확인된 예상 월수입·조건·확인일을 남기세요. 심사 중이면 금액을 확정하지 마세요.', example: '고인의 배우자 · 유족연금 상담 완료, 수급 여부·월액 심사 중 · 9월 21일' },
      { resourceId: 'PLAN-01', questionId: 'unconfirmed_items', label: UNKNOWN_LABEL, record: '수급권·필요서류·기존 연금과의 조정 등 공단에 물어볼 내용을 적으세요.', example: '배우자 수급권과 기존 본인 연금과의 조정 여부 확인 필요' },
    ],
    limitation: '공적 유족급여는 고인의 연금잔액을 상속분대로 나누는 절차가 아닙니다. 퇴직연금·개인연금·다른 직역연금은 각 기관의 별도 요건을 확인하세요.',
    evidenceUrls: ['https://www.nps.or.kr/pnsinfo/ntpsklg/getOHAF0072M0.do?menuId=MN24001121'],
    relatedResourceIds: ['P0-16'],
  },
];
