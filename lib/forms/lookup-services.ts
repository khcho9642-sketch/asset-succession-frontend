export type LookupTarget = {
  resourceId: 'PLAN-01' | 'PLAN-04';
  questionId: string;
  label: string;
  record: string;
  example: string;
};

export type LookupService = {
  id: string;
  title: string;
  provider: string;
  url: string;
  menu: string;
  purpose: string;
  authentication: { kind: 'self' | 'public' | 'certificate'; text: string };
  checks: string[];
  targets: LookupTarget[];
  limitation: string;
  evidenceUrls: string[];
  relatedResourceIds: string[];
};

const ASSET_LABEL = '재산별로 소유자와 현재 사용 상황을 적어 주세요.';
const DEBT_LABEL = '채무나 보증 등 함께 확인할 부담이 있나요?';
const UNKNOWN_LABEL = '아직 확인하지 못한 내용은 무엇인가요?';

// Public service instructions only. The site does not collect credentials or fetch financial records.
// Evidence and access limits: docs/forms-life-guides-20260921/lookup-sources.md
export const LOOKUP_SERVICES: readonly LookupService[] = [
  {
    id: 'accounts',
    title: '은행·증권 계좌 확인',
    provider: '금융결제원 · 계좌정보통합관리서비스',
    url: 'https://www.payinfo.or.kr/gatePay.html',
    menu: '내계좌한눈에 → 은행권 / 제2금융권 / 증권사',
    purpose: '본인 명의 금융기관과 계좌 종류를 확인해 생전 재산 목록을 만듭니다.',
    authentication: {
      kind: 'self',
      text: '명의자 본인이 인증서와 추가 본인확인 절차로 조회합니다. 부모님 재산은 부모님이 직접 인증하고, 직접 이용이 어려우면 해당 금융기관에 정식 대리 절차를 문의하세요.',
    },
    checks: [
      '은행권·제2금융권·증권사를 나누어 확인하고 조회 기준일을 남깁니다.',
      '기관·계좌 종류·대략 잔액을 확인하고, 투자자산의 상세 평가액은 해당 증권사 자료와 대조합니다.',
      '보험·연금·휴면예금 조회에 같은 금액이 다시 표시되면 한 번만 정리합니다.',
    ],
    targets: [
      {
        resourceId: 'PLAN-01', questionId: 'asset_notes', label: ASSET_LABEL,
        record: '명의자는 관계로 적고 기관·자산 종류·대략 잔액·조회일을 남기세요. 계좌번호는 옮기지 마세요.',
        example: '본인 · A은행 예금 약 2,000만원 / B증권 투자계좌 · 금액 확인 중 · 9월 21일 조회',
      },
      {
        resourceId: 'PLAN-01', questionId: 'unconfirmed_items', label: UNKNOWN_LABEL,
        record: '조회하지 못한 금융기관이나 계좌, 추가로 확인할 잔액을 남기세요.',
        example: 'B증권 상세 평가액 미확인 · 증권사에서 확인 예정',
      },
    ],
    limitation: '참여기관과 조회 대상의 범위가 있습니다. 조회 실패·인증 미완료·결과 미표시는 재산이 없다는 뜻이 아닙니다.',
    evidenceUrls: ['https://www.payinfo.or.kr/gatePay.html', 'https://www.payinfo.or.kr/guide/useguideAcntcb.do?menu=4'],
    relatedResourceIds: [],
  },
  {
    id: 'insurance',
    title: '가입 보험·미청구보험금 확인',
    provider: '생명보험협회·손해보험협회 · 내보험찾아줌',
    url: 'https://cont.insure.or.kr/',
    menu: '안내 → 생존자 조회안내 / 조회신청',
    purpose: '생전 가입 계약과 아직 청구하지 않은 보험금을 나누어 확인합니다.',
    authentication: {
      kind: 'self',
      text: '조회대상자 본인이 공동인증서·아이핀·휴대폰 등 제공되는 수단으로 인증합니다. 대리 조회는 협회가 안내하는 방문·위임 절차를 확인하세요.',
    },
    checks: [
      '보험사·보험 종류·계약 상태를 확인하고 계약자·피보험자·수익자는 구분합니다.',
      '가입 계약 목록과 미청구보험금 금액을 따로 확인합니다. 수익자·해약환급금 등 필요한 상세는 보험사에 확인합니다.',
      '휴면예금·보험금 조회에 같은 보험금이 나오면 중복 합산하지 않습니다.',
    ],
    targets: [
      {
        resourceId: 'PLAN-01', questionId: 'asset_notes', label: ASSET_LABEL,
        record: '관계·보험사·보험 종류·확인된 미청구금·조회일만 적으세요. 증권번호나 보장금액 전체를 재산총액으로 옮기지 마세요.',
        example: '본인 · A생명 연금보험 가입 확인 / 미청구금 약 20만원 · 9월 21일 조회',
      },
      {
        resourceId: 'PLAN-01', questionId: 'unconfirmed_items', label: UNKNOWN_LABEL,
        record: '계약자·수익자 관계나 조회 밖의 보험, 현재 환급금 등 추가 질문을 남기세요.',
        example: 'A생명 수익자 관계와 현재 해약환급금 확인 필요 · 우체국보험 별도 확인',
      },
    ],
    limitation: '우체국·새마을금고·신협·수협 등의 공제·보험은 이 조회에서 빠질 수 있습니다. 사망보험금·보장금액은 현재 쓸 수 있는 현금이나 확정 상속재산총액이 아닙니다.',
    evidenceUrls: ['https://cont.insure.or.kr/cont_web/information/information.do'],
    relatedResourceIds: [],
  },
  {
    id: 'debts',
    title: '대출·보증 부담 확인',
    provider: '한국신용정보원 · 본인신용정보 열람서비스(Credit4U)',
    url: 'https://www.credit4u.or.kr/',
    menu: '일반신용정보 → 개인대출정보 / 채무보증정보',
    purpose: '생전 본인의 대출과 타인을 위해 부담한 보증을 구분해 정리합니다.',
    authentication: {
      kind: 'self',
      text: '조회대상자 본인이 서비스의 본인확인·로그인 안내에 따라 이용합니다. 가족이라는 이유로 다른 사람의 로그인·인증수단을 대신 사용하지 마세요.',
    },
    checks: [
      '대출과 채무보증을 따로 조회하고 금융기관·기준일을 확인합니다.',
      '대출 잔액·한도·보증금액은 서로 다른 값입니다. 현재 갚아야 할 잔액은 금융기관에 대조합니다.',
      '가족 간 차입·임대보증금 반환의무·조회 밖의 보증은 계약이나 해당 기관에서 별도 확인합니다.',
    ],
    targets: [
      {
        resourceId: 'PLAN-01', questionId: 'debt_notes', label: DEBT_LABEL,
        record: '누구의 부담인지 관계로 적고 기관·대출/보증 구분·대략 금액·기준일을 남기세요. 보증은 대출잔액에 더하지 마세요.',
        example: '본인 · A은행 대출 잔액 약 3,000만원 / 별도 보증 약 1,000만원, 실제 부담 미확인 · 9월 21일',
      },
      {
        resourceId: 'PLAN-01', questionId: 'unconfirmed_items', label: UNKNOWN_LABEL,
        record: '최신 잔액이나 보증의 범위, 서비스에 나오지 않은 부담을 질문으로 남기세요.',
        example: '보증 종료 여부와 가족 간 차입잔액 확인 필요',
      },
    ],
    limitation: '등록·갱신 시점과 제공 범위가 있어 모든 채무가 확인되는 것은 아닙니다. 조회되지 않거나 접속하지 못한 부담은 없음으로 기록하지 마세요.',
    evidenceUrls: ['https://www.credit4u.or.kr/'],
    relatedResourceIds: [],
  },
  {
    id: 'pension',
    title: '연금 가입·예상 수입 확인',
    provider: '금융감독원 · 통합연금포털',
    url: 'https://www.fss.or.kr/fss/lifeplan/lifeplanIndex/index.do?menuNo=201101',
    menu: '내 연금조회·재무설계 → 내연금조회',
    purpose: '가입 연금과 수령 전망을 확인해 재산 이전 후에도 필요한 생활비를 준비합니다.',
    authentication: {
      kind: 'self',
      text: '연금 가입자 본인이 포털의 회원가입·본인확인·조회신청 안내에 따라 이용합니다. 부모님 연금은 부모님의 직접 확인이나 제공기관이 인정하는 대리 절차로 확인하세요.',
    },
    checks: [
      '연금 종류·제공기관·조회 기준일과 결과 준비 여부를 확인합니다.',
      '수령 시작 시점·예상 월수입·변동 조건을 확인합니다. 연액 표시라면 월액과 구분하세요.',
      '월 연금수입과 계좌 적립금은 별도 항목입니다. 같은 연금계좌가 다른 조회에도 있으면 중복 정리하지 않습니다.',
    ],
    targets: [
      {
        resourceId: 'PLAN-01', questionId: 'asset_notes', label: ASSET_LABEL,
        record: '관계·가입 기관·연금 종류·조회일을 적고 계좌 적립금은 확인된 경우에만 별도로 표시하세요.',
        example: '본인 · A기관 퇴직연금 가입 확인 · 적립금 미확인 · 9월 21일 조회',
      },
      {
        resourceId: 'PLAN-04', questionId: 'income_notes', label: '수입이 유지되는 조건이나 변동 가능성을 적어 주세요.',
        record: '연금 종류별 예상 월수입과 수령 시작 시점·변동 조건·확인일을 적으세요. 월수입을 재산총액에 더하지 마세요.',
        example: '본인 · A기관 연금 예상 월 80만원 · 수령 시작 시점 확인 필요 · 9월 21일 기준',
      },
      {
        resourceId: 'PLAN-01', questionId: 'unconfirmed_items', label: UNKNOWN_LABEL,
        record: '조회 준비 중인 연금이나 제공기관에 물어볼 수령 조건을 남기세요.',
        example: '연금 조회 결과 준비 중 · 수령 시작 조건을 제공기관에 확인',
      },
    ],
    limitation: '조회 준비 중·자료 미제공은 가입 연금이 없다는 뜻이 아닙니다. 예상 연금은 확정 지급액이나 사망 시 승계할 재산가액이 아닙니다.',
    evidenceUrls: ['https://www.fss.or.kr/fss/main/main.do?menuNo=200000', 'https://www.fss.or.kr/fss/lifeplan/lifeplanIndex/index.do?menuNo=201101'],
    relatedResourceIds: [],
  },
  {
    id: 'registry',
    title: '알고 있는 부동산의 등기 확인',
    provider: '대한민국 법원 · 인터넷등기소',
    url: 'https://www.iros.go.kr/',
    menu: '부동산 등기 열람·발급 → 대상 부동산 검색',
    purpose: '주소를 알고 있는 부동산의 등기상 소유자·지분·담보권을 확인합니다.',
    authentication: {
      kind: 'public',
      text: '특정 부동산의 공개 등기기록을 찾는 경로입니다. 열람·발급 방식에 따른 로그인·결제 안내를 확인하세요.',
    },
    checks: [
      '대상 부동산을 먼저 찾고 토지·건물·구분건물 중 맞는 기록인지 확인합니다.',
      '소유 관계와 지분을 확인하고 실제 사용 상황은 본인 보유자료와 대조합니다.',
      '근저당권의 채권최고액은 대출잔액과 다릅니다. 실제 채무는 금융기관 자료로 확인합니다.',
    ],
    targets: [
      {
        resourceId: 'PLAN-01', questionId: 'asset_notes', label: ASSET_LABEL,
        record: '상세 주소 없이 관계·부동산 종류·단독/공동 소유와 지분·확인일을 남기세요.',
        example: '부모님 · 공동명의 주택 · 지분 각 1/2 · 거주 중 · 9월 21일 등기 확인',
      },
      {
        resourceId: 'PLAN-01', questionId: 'debt_notes', label: DEBT_LABEL,
        record: '담보권의 존재와 실제 잔액 확인 여부만 적고 채권최고액을 채무잔액으로 옮기지 마세요.',
        example: '부모님 주택에 A은행 근저당권 있음 · 실제 대출잔액은 확인 필요',
      },
    ],
    limitation: '이 경로는 개인의 전국 보유 부동산 전체를 찾아주는 조회가 아닙니다. 등기만으로 모든 채무·임대차·실제 사용관계가 확인되지는 않습니다.',
    evidenceUrls: ['https://www.iros.go.kr/', 'https://play.google.com/store/apps/details?id=kr.go.iros'],
    relatedResourceIds: [],
  },
  {
    id: 'property-prices',
    title: '부동산 공시가격 확인',
    provider: '국토교통부·한국부동산원 · 부동산공시가격 알리미',
    url: 'https://www.realtyprice.kr/notice/main/main.do',
    menu: '공시가격열람 → 공동주택 / 개별주택 / 개별지',
    purpose: '알고 있는 부동산의 공시가격을 기초자료로 확인합니다.',
    authentication: {
      kind: 'public',
      text: '대상 부동산과 기준연도로 공개가격을 조회합니다. 개별지·개별주택은 연결되는 지자체 조회 안내도 확인하세요.',
    },
    checks: [
      '아파트·단독주택·토지에 맞는 메뉴와 대상 연도를 선택합니다.',
      '가격의 기준일·종류와 단위를 확인합니다. 토지의 단위면적당 가격을 전체 가격과 구분하세요.',
      '등기로 확인한 같은 부동산에 가격 근거를 덧붙이고 별도 재산처럼 중복 합산하지 않습니다.',
    ],
    targets: [
      {
        resourceId: 'PLAN-01', questionId: 'asset_notes', label: ASSET_LABEL,
        record: '부동산 종류·공시가격이라는 구분·대략 금액·기준연도·조회일을 남기세요. 상세 주소는 적지 마세요.',
        example: '부모님 주택 · 2026년 공동주택 공시가격 약 3억원 · 9월 21일 조회 · 시가 별도 확인',
      },
      {
        resourceId: 'PLAN-01', questionId: 'unconfirmed_items', label: UNKNOWN_LABEL,
        record: '현재 시가나 평가 기준을 확인하지 못했다면 미확인으로 남기세요.',
        example: '주택 현재 시가와 증여 시 적용할 평가자료 확인 필요',
      },
    ],
    limitation: '공시가격은 현재 시세나 상속·증여세의 최종 평가액을 확정하지 않습니다. 소유자나 보유 부동산 전체를 확인하는 서비스도 아닙니다.',
    evidenceUrls: ['https://www.realtyprice.kr/notice/main/main.do'],
    relatedResourceIds: ['P9-10'],
  },
  {
    id: 'family',
    title: '가족관계 확인',
    provider: '대한민국 법원 · 전자가족관계등록시스템',
    url: 'https://efamily.scourt.go.kr/',
    menu: '증명서발급 → 가족관계등록부 → 가족관계증명서',
    purpose: '생전 재산 계획에서 함께 고려할 가족관계를 확인합니다.',
    authentication: {
      kind: 'certificate',
      text: '신청 자격이 있는 사람이 본인의 인증수단으로 발급합니다. 가족의 증명서는 발급 가능한 관계와 범위를 확인하고, 가족의 인증정보를 대신 사용하지 마세요.',
    },
    checks: [
      '누구를 기준으로 발급할지와 필요한 증명서 종류를 먼저 확인합니다.',
      '일반·상세·특정 증명서의 기재 범위를 확인합니다. 상담 준비만을 위해 모든 내용을 발급할 필요는 없습니다.',
      '증명서 원문을 옮기지 말고 계획에서 고려할 관계와 추가 확인할 사실만 정리합니다.',
    ],
    targets: [
      {
        resourceId: 'PLAN-01', questionId: 'family_context', label: '함께 고려할 가족과 관계를 적어 주세요.',
        record: '실명·주민등록번호 없이 배우자·자녀 등 관계와 확인일을 적으세요.',
        example: '배우자 · 자녀 2명 · 부모님 부양 고려 · 9월 21일 관계 확인',
      },
      {
        resourceId: 'PLAN-01', questionId: 'unconfirmed_items', label: UNKNOWN_LABEL,
        record: '현재 자료로 확인되지 않은 관계나 추가 증명서가 필요한 이유를 남기세요.',
        example: '현재 증명서에 표시되지 않은 가족관계에 추가 확인 필요',
      },
    ],
    limitation: '한 사람의 가족관계증명서 한 장만으로 모든 가족이나 향후 상속인 범위가 확정되지는 않습니다. 발급 실패는 관계가 없다는 뜻이 아닙니다.',
    evidenceUrls: ['https://efamily.scourt.go.kr/', 'https://efamily.scourt.go.kr/cs/CsBltnWrtGuide.do?bltnbordId=0000007&guideCd=0000007001&guideYn=Y'],
    relatedResourceIds: ['P0-06'],
  },
  {
    id: 'dormant-deposits',
    title: '휴면예금·휴면보험금 확인',
    provider: '서민금융진흥원 · 휴면예금 조회',
    url: 'https://www.kinfa.or.kr/financialLife/sleepmoney.do',
    menu: '휴면예금 조회·지급 바로가기',
    purpose: '생전에 빠뜨린 휴면재산이 있는지 해당 서비스의 제공 범위에서 확인합니다.',
    authentication: {
      kind: 'self',
      text: '재산 명의자 본인이 제공처의 본인확인 절차를 거쳐 조회합니다. 직접 이용이 어려우면 서민금융진흥원에 인정되는 대리 신청방법을 문의하세요.',
    },
    checks: [
      '서민금융진흥원에 출연된 휴면예금·보험금 등 조회 대상 범위를 확인합니다.',
      '기관·종류·조회 금액·기준일을 확인하고 일반 예금·보험 조회 결과와 대조합니다.',
      '같은 금액이 다른 조회에도 표시되면 기존 기록을 보완하고, 지급 신청은 필요할 때 별도로 판단합니다.',
    ],
    targets: [
      {
        resourceId: 'PLAN-01', questionId: 'asset_notes', label: ASSET_LABEL,
        record: '관계·기관·휴면예금/보험금 구분·대략 금액·조회일과 중복 여부를 남기세요.',
        example: '본인 · A은행 휴면예금 약 10만원 · 9월 21일 조회 · 계좌 목록과 중복 여부 확인 중',
      },
      {
        resourceId: 'PLAN-01', questionId: 'unconfirmed_items', label: UNKNOWN_LABEL,
        record: '중복 여부나 지급 가능 여부가 확인되지 않았으면 질문으로 남기세요.',
        example: 'A은행 휴면예금이 기존 예금 기록과 같은 금액인지 확인 필요',
      },
    ],
    limitation: '전체 미청구보험금·모든 장기 미사용 계좌와 조회 범위가 같지 않습니다. 조회되지 않거나 이용하지 못한 경우를 재산 없음으로 기록하지 마세요.',
    evidenceUrls: ['https://www.kinfa.or.kr/financialLife/sleepmoney.do', 'https://www.kinfa.or.kr/cyber/pymntReqst/indvdlinfo.do'],
    relatedResourceIds: ['P6-02'],
  },
  {
    id: 'unclaimed-shares',
    title: '미수령 주식·현금배당금 확인',
    provider: '한국예탁결제원 · 주주서비스',
    url: 'https://ta.ksd.or.kr/index.jsp',
    menu: '주주 서비스 → 주식찾기 / 현금배당금 조회 신청',
    purpose: '생전 주식 목록에서 빠진 미수령 주식과 제공 범위의 현금배당 내역을 확인합니다.',
    authentication: {
      kind: 'self',
      text: '주주 본인이 각 조회 메뉴의 본인확인 안내에 따라 이용합니다. 대리·방문 조회가 필요하면 예탁결제원에 신청 자격과 준비서류를 확인하세요.',
    },
    checks: [
      '주식찾기와 현금배당금 조회의 대상·조회기간을 각각 확인합니다. 배당내역이 모두 미수령금인 것은 아닙니다.',
      '회사·주식 종류·확인된 주식 수량과 배당금을 구분하고, 조회 기준일을 확인해 증권계좌 자료와 대조합니다.',
      '주식의 현재 평가금액과 배당금 수령 여부는 별도로 확인합니다. 이미 받은 배당금을 현재 잔액에 다시 더하지 않습니다.',
    ],
    targets: [
      {
        resourceId: 'PLAN-01', questionId: 'asset_notes', label: ASSET_LABEL,
        record: '관계·회사·확인한 주식 수량을 적고 평가금액·배당내역·수령 여부·조회일은 구분해 남기세요. 주권번호는 옮기지 마세요.',
        example: '본인 · A회사 미수령 주식 10주 · 평가액 미확인 / 배당내역 약 5만원, 수령 여부 확인 필요 · 9월 21일',
      },
      {
        resourceId: 'PLAN-01', questionId: 'unconfirmed_items', label: UNKNOWN_LABEL,
        record: '조회 밖의 회사나 주식 평가·수령 방법 등 남은 질문을 적으세요.',
        example: 'A회사 주식 현재 평가액과 수령 절차 확인 필요',
      },
    ],
    limitation: '모든 회사의 주식과 모든 증권계좌를 조회하는 서비스는 아닙니다. 조회 범위와 명의개서 대행기관을 확인하고, 조회 실패를 보유 주식 없음으로 적지 마세요.',
    evidenceUrls: ['https://ta.ksd.or.kr/index.jsp'],
    relatedResourceIds: ['P6-05'],
  },
];
