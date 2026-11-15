# 전체 자료 배치표

최신 177개 고유 자료와 카드가 아닌 추가 작업 6개를 구분한 설계 초안. 분류 변경·삭제는 실행하지 않았다.

## S1 현황 정리

| ID | 자료명 | 처리 | 대표카드/부모 | 목적 매핑 |
|---|---|---|---|---|
| P0-01 | 사망자 등 재산조회 통합처리 신청서(안심상속) | 대표카드 통합 | G-FIND-ASSETS | inheritance |
| P0-02 | 상속인 금융거래조회 신청서 | 대표카드 통합 | G-FIND-ASSETS | inheritance |
| P0-03 | 상속인 금융거래조회 위임장 | 상세로 이동 | P0-02 | inheritance |
| P0-04 | 외국인 사망자 조회 안내문 | 상세로 이동 | P0-02 | inheritance |
| P0-05 | 사망신고서 | 유지 | — | inheritance |
| P0-06 | 가족관계증명서(상세)·기본증명서(상세)·제적등본 발급 안내 | 유지 | — | inheritance |
| P6-02 | 휴면예금·미청구 보험금 조회 | 대표카드 통합 | G-FIND-ASSETS | inheritance |
| P6-05 | 미수령 주식·배당금 조회 | 대표카드 통합 | G-FIND-ASSETS | inheritance |
| P8-12 | 후견등기사항증명서·부존재증명서 발급 안내 | 유지 | — | 확인 필요 |
| P9-10 | 개별공시지가·공동주택가격 조회 안내 | 유지 | — | 확인 필요 |

## S2 방법·재원 설계

| ID | 자료명 | 처리 | 대표카드/부모 | 목적 매핑 |
|---|---|---|---|---|
| P5-06 | 장애인 신탁 증여세 과세가액 불산입 안내 | 유지 | — | gift |

## S3 의사·계약 확정

| ID | 자료명 | 처리 | 대표카드/부모 | 목적 매핑 |
|---|---|---|---|---|
| BP-I-01 | 상속재산분할협의서 | 유지 | — | inheritance |
| BP-G-01 | 부동산 증여계약서 | 대표카드 통합 | G-GIFT-REAL | gift |
| DD-G-01 | 증여계약서 일반·복수 + 기관 샘플 | 대표카드 통합 | G-GIFT-REAL | gift |
| SC-01 | 매매 · [단독주택] 간이하게 작성하는 경우 | 대표카드 통합 | G-SALE-HOUSE | capital_transfer, inheritance |
| SC-02 | 매매 · [아파트,연립주택] 간이하게 작성하는 경우 | 대표카드 통합 | G-SALE-UNIT | capital_transfer, inheritance |
| SC-03 | 매매 · [토지] 간이하게 작성하는 경우 | 대표카드 통합 | G-SALE-LAND | capital_transfer, inheritance |
| SC-04 | 매매 · [단독주택] 일반적인 경우 | 대표카드 통합 | G-SALE-HOUSE | capital_transfer, inheritance |
| SC-05 | 매매 · [단독주택] 저당권이 있는 경우 | 대표카드 통합 | G-SALE-HOUSE | capital_transfer, inheritance |
| SC-06 | 매매 · [단독주택] 전세를 안고 사는 경우 | 대표카드 통합 | G-SALE-HOUSE | capital_transfer, inheritance |
| SC-07 | 매매 · [단독주택] 저당권도 있고 전세도 안고 사는 경우 | 대표카드 통합 | G-SALE-HOUSE | capital_transfer, inheritance |
| SC-08 | 매매 · [아파트,연립주택] 일반적인 경우 | 대표카드 통합 | G-SALE-UNIT | capital_transfer, inheritance |
| SC-09 | 매매 · [아파트,연립주택] 저당권이 있는 경우 | 대표카드 통합 | G-SALE-UNIT | capital_transfer, inheritance |
| SC-10 | 매매 · [아파트,연립주택] 전세를 안고 사는 경우 | 대표카드 통합 | G-SALE-UNIT | capital_transfer, inheritance |
| SC-11 | 매매 · [아파트,연립주택] 저당권도 있고 전세도 안고 사는 경우 | 대표카드 통합 | G-SALE-UNIT | capital_transfer, inheritance |
| SC-12 | 매매 · [토지] 일반적인 경우 | 대표카드 통합 | G-SALE-LAND | capital_transfer, inheritance |
| SC-13 | 매매 · [토지] 저당권이 있는 경우 | 대표카드 통합 | G-SALE-LAND | capital_transfer, inheritance |
| SC-14 | 매매 · [토지] 전세를 안고 사는 경우 | 대표카드 통합 | G-SALE-LAND | capital_transfer, inheritance |
| SC-15 | 매매 · [토지] 저당권도 있고 전세도 안고 사는 경우 | 대표카드 통합 | G-SALE-LAND | capital_transfer, inheritance |
| SC-16 | 임대차 · [일반건물] 간이하게 작성하는 경우 | 목록 삭제 제안 | — | 확인 필요 |
| SC-17 | 임대차 · [아파트,연립주택] 간이하게 작성하는 경우 | 목록 삭제 제안 | — | 확인 필요 |
| SC-18 | 임대차 · [상가건물] 간이하게 작성하는 경우 | 목록 삭제 제안 | — | 확인 필요 |
| SC-19 | 임대차 · [일반건물] 일반적인 경우 | 목록 삭제 제안 | — | 확인 필요 |
| SC-20 | 임대차 · [아파트,연립주택] 일반적인 경우 | 목록 삭제 제안 | — | 확인 필요 |
| SC-21 | 임대차 · [상가건물] 일반적인 경우 | 목록 삭제 제안 | — | 확인 필요 |
| SC-22 | 금전대차 · 일반적인 경우 | 대표카드 통합 | G-LOAN | 확인 필요 |
| SC-23 | 금전대차 · 연대보증인이 있는 경우 | 대표카드 통합 | G-LOAN | 확인 필요 |
| SC-24 | 금전대차 · 차용인 부동산에 저당권 설정하는 경우 | 대표카드 통합 | G-LOAN | 확인 필요 |
| SC-25 | 금전대차 · 제3자 부동산에 저당권 설정하는 경우 | 대표카드 통합 | G-LOAN | 확인 필요 |
| SC-30 | 차용·영수증 · [차용증] 일반적인 경우 | 대표카드 통합 | G-IOU | 확인 필요 |
| SC-31 | 차용·영수증 · [차용증] 연대보증인이 있는 경우 | 대표카드 통합 | G-IOU | 확인 필요 |
| P0-07 | 상속포기 심판청구서 | 대표카드 통합 | G-INHERIT-CHOICE | inheritance |
| P0-08 | 상속한정승인 심판청구서 | 대표카드 통합 | G-INHERIT-CHOICE | inheritance |
| P0-09 | 상속재산목록(한정승인 첨부) | 상세로 이동 | P0-08 | inheritance |
| P0-10 | 특별한정승인 심판청구서 | 대표카드 통합 | G-INHERIT-CHOICE | inheritance |
| P1-14 | 자필증서 유언 작성 안내 | 대표카드 통합 | G-WILL-PREPARE | inheritance |
| P1-15 | 유언증서 검인 청구서 | 대표카드 통합 | G-WILL-EXECUTE | inheritance |
| P1-16 | 유언집행자 선임 심판청구서 | 대표카드 통합 | G-WILL-EXECUTE | inheritance |
| P1-17 | 공정증서 유언 안내 | 대표카드 통합 | G-WILL-PREPARE | inheritance |
| P1-21 | 상속재산관리인 선임 심판청구서 | 유지 | — | inheritance |
| P1-22 | 성년후견 개시 심판청구서 | 대표카드 통합 | G-GUARDIAN-START | 확인 필요 |
| P1-23 | 부재자 재산관리인 선임·실종선고 심판청구서 | 유지 | — | 확인 필요 |
| P3-01 | 농지취득자격증명 신청서 | 유지 | — | capital_transfer |
| P3-05 | 현금 증여계약서 | 유지 | — | gift |
| P3-06 | 부담부증여 계약서 안내 | 유지 | — | gift |
| P8-01 | 미성년자 특별대리인 선임 청구서 | 유지 | — | inheritance |
| P8-08 | 한정후견 / 특정후견 개시 심판청구서 | 대표카드 통합 | G-GUARDIAN-START | 확인 필요 |
| P8-09 | 임의후견(후견계약) 관련 양식 | 유지 | — | 확인 필요 |
| P8-10 | 후견인 권한 초과행위 허가 청구서 | 유지 | — | 확인 필요 |
| P9-03 | 금전소비대차 공정증서 / 확정일자 안내 | 상세로 이동 | G-LOAN | 확인 필요 |
| P9-05 | 사업포괄양수도 관련 안내 | 유지 | — | business_succession |

## S4 권리 이전·수령

| ID | 자료명 | 처리 | 대표카드/부모 | 목적 매핑 |
|---|---|---|---|---|
| SC-26 | 차용·영수증 · [영수증] 매매대금을 받는 경우 | 유지 | — | capital_transfer, inheritance |
| SC-27 | 차용·영수증 · [영수증] 전세금을 받는 경우 | 목록 삭제 제안 | — | 확인 필요 |
| REG-I-01 | 상속에 의한 소유권 이전등기 신청서 | 대표카드 통합 | G-REG-INHERIT | inheritance |
| REG-I-02 | 상속에 의한 소유권 이전등기 신청서(구분건물) | 대표카드 통합 | G-REG-INHERIT | inheritance |
| REG-I-03 | 협의분할에 의한 상속을 원인으로 한 소유권 이전등기 신청서 | 대표카드 통합 | G-REG-INHERIT | inheritance |
| REG-I-04 | 협의분할에 의한 상속을 원인으로 한 소유권 이전등기 신청서(구분건물) | 대표카드 통합 | G-REG-INHERIT | inheritance |
| REG-G-01 | 증여에 의한 소유권 이전등기 신청서 | 대표카드 통합 | G-REG-GIFT | gift |
| REG-G-02 | 증여에 의한 소유권 이전등기 신청서(구분건물) | 대표카드 통합 | G-REG-GIFT | gift |
| P0-16 | 유족연금/반환일시금·사망일시금 지급 청구서 | 대표카드 통합 | G-SURVIVOR-BENEFIT | inheritance |
| P1-01 | 매매 소유권이전등기 신청서 | 대표카드 통합 | G-REG-SALE | capital_transfer |
| P1-02 | 매매 소유권이전등기 신청서(구분건물) | 대표카드 통합 | G-REG-SALE | capital_transfer |
| P1-06 | 공유물분할 소유권이전등기 신청서 | 유지 | — | 확인 필요 |
| P1-07 | 근저당권설정등기 신청서 | 대표카드 통합 | G-MORTGAGE | 확인 필요 |
| P1-08 | 근저당권말소등기 신청서 | 대표카드 통합 | G-MORTGAGE | 확인 필요 |
| P1-09 | 전세권설정등기 신청서 | 목록 삭제 제안 | — | 확인 필요 |
| P1-10 | 신탁등기 신청서 | 유지 | — | 확인 필요 |
| P1-12 | 소유권이전청구권 가등기 신청서 | 유지 | — | 확인 필요 |
| P1-13 | 등기신청 위임장·등기신청수수료 안내 | 상세로 이동 | G-REG-INHERIT | 확인 필요 |
| P1-24 | 자동차 이전등록 신청서(상속) | 유지 | — | inheritance |
| P2-04 | 사업자등록 정정신고서(상속 대표자 변경) | 유지 | — | inheritance, business_succession |
| P6-01 | 상속예금 지급 청구 안내 | 유지 | — | inheritance |
| P6-03 | 상속 보험금 청구 안내 | 유지 | — | inheritance |
| P6-04 | 상속 주식 명의개서 / 계좌 이전 안내 | 유지 | — | inheritance |
| P6-06 | 퇴직연금(DB·DC·IRP) 상속 수령 안내 | 유지 | — | inheritance |
| P7-01 | 공무원연금 유족급여 청구서 | 대표카드 통합 | G-SURVIVOR-BENEFIT | inheritance |
| P7-02 | 사학연금 유족급여 청구서 | 대표카드 통합 | G-SURVIVOR-BENEFIT | inheritance |
| P7-03 | 군인연금 유족급여 청구서 | 대표카드 통합 | G-SURVIVOR-BENEFIT | inheritance |
| P7-04 | 산재 유족급여·장의비 청구서 | 대표카드 통합 | G-SURVIVOR-BENEFIT | inheritance |
| P7-05 | 건설근로자 퇴직공제금 청구 | 대표카드 통합 | G-SURVIVOR-BENEFIT | inheritance |
| P7-06 | 대한지방행정공제회 급여 청구 | 대표카드 통합 | G-SURVIVOR-BENEFIT | inheritance |
| P9-02 | 계약서 검인 신청 안내 | 상세로 이동 | G-GIFT-REAL | gift |
| P9-04 | 폐업신고서 | 유지 | — | business_succession |
| P9-07 | 임대사업자 지위 승계 신고 | 대표카드 통합 | G-RENTAL-BUSINESS | inheritance, business_succession |

## S5 신고·납부

| ID | 자료명 | 처리 | 대표카드/부모 | 목적 매핑 |
|---|---|---|---|---|
| NTS-IG-01 | 가업상속공제신고서·가업상속재산명세서·가업용 자산 명세 | 유지 | — | inheritance, business_succession |
| NTS-IG-02 | 영농상속공제신고서 | 유지 | — | inheritance |
| NTS-IG-03 | 배우자 상속재산 미분할 신고서 | 유지 | — | inheritance |
| NTS-IG-04 | 임신사실확인서 | 유지 | — | inheritance, gift |
| NTS-IG-05 | 장애인증명서 | 유지 | — | inheritance, gift |
| NTS-IG-06 | 금융재산 상속공제 신고서 | 유지 | — | inheritance |
| NTS-IG-07 | 재해손실 공제신고서(상속세, 증여세) | 유지 | — | inheritance, gift |
| NTS-IG-08 | 동거주택상속공제신고서 | 유지 | — | inheritance |
| NTS-IG-09 | 외국납부세액공제신청서(상속세, 증여세) | 유지 | — | inheritance, gift |
| NTS-IG-10 | 상속세과세표준신고 및 자진납부계산서 등 · 서식9 묶음 | 유지 | — | inheritance |
| NTS-IG-11 | 증여세과세표준신고 및 자진납부계산서(기본세율 적용 증여재산 신고용) 등 · 서식10 묶음 | 유지 | — | gift |
| NTS-IG-12 | 증여세과세표준신고 및 자진납부계산서(창업자금 및 가업승계주식 등 특례세율 적용 증여재산 신고용) 등 | 유지 | — | gift, business_succession |
| NTS-IG-13 | 상속세(증여세) 연부연납허가(변경, 철회) 신청서·연부연납세액 계산명세 | 유지 | — | inheritance, gift |
| NTS-IG-14 | 가업상속 납부유예 신청서·가업상속재산명세서·가업용 자산 명세 | 유지 | — | inheritance, business_succession |
| NTS-CG-01 | 양도소득세과세표준 신고 및 납부계산서 | 유지 | — | capital_transfer |
| NTS-CG-02 | 양도소득금액 계산명세서 | 상세로 이동 | NTS-CG-01 | capital_transfer |
| NTS-CG-03 | 취득가액 및 필요경비 상세명세서 | 상세로 이동 | NTS-CG-01 | capital_transfer |
| NTS-CG-04 | 양도소득세 간편신고서(소명자료제출서) | 유지 | — | capital_transfer |
| NTS-CG-05 | 주식 등 양도소득 계산명세서 | 상세로 이동 | NTS-CG-01 | capital_transfer |
| NTS-CG-06 | 파생상품등 양도소득금액 계산명세서 | 상세로 이동 | NTS-CG-01 | capital_transfer |
| NTS-CG-07 | 주식 등 양도소득세 간편신고서 | 유지 | — | capital_transfer |
| NTS-CG-08 | 농어촌주택 소유자 1세대1주택 특례적용신고서 | 유지 | — | capital_transfer |
| NTS-CG-09 | 주택임대사업자의 거주주택 1세대1주택 특례적용신고서 | 유지 | — | capital_transfer |
| NTS-CG-10 | 이월과세적용신청서 | 유지 | — | capital_transfer |
| NTS-CG-11 | 과세이연신청서 | 유지 | — | capital_transfer |
| NTS-CG-12 | 현물출자 등에 대한 세액감면(면제)신청서 | 유지 | — | capital_transfer |
| NTS-CG-13 | 개발제한구역 지정에 따른 매수대상 토지 등에 대한 세액감면신청서 | 유지 | — | capital_transfer |
| NTS-CG-14 | 영수증서(납세자용)납부서(수납기관용) | 유지 | — | capital_transfer |
| NTS-CG-15 | 개인지방소득세 납부서 | 유지 | — | capital_transfer |
| NTS-IE-01 | 사례01_피상속인이 비거주자인 경우 | 상세로 이동 | NTS-IG-10 | inheritance |
| NTS-IE-02 | 사례02_피상속인이 거주자로 과세미달인 경우 | 상세로 이동 | NTS-IG-10 | inheritance |
| NTS-IE-03 | 사례03_피상속인이 거주자로 과세인 경우 | 상세로 이동 | NTS-IG-10 | inheritance |
| NTS-CE-01 | 비상장 대기업 주식 양도 · 실지거래가액이 있는 경우 | 상세로 이동 | NTS-CG-01 | capital_transfer |
| P0-11 | 취득세(기한내/기한후) 신고서 | 유지 | — | inheritance, gift, capital_transfer |
| P0-12 | 주택(무상·유상거래) 취득 상세 명세서 | 유지 | — | 확인 필요 |
| P0-13 | 취득세 납부서 | 유지 | — | 확인 필요 |
| P0-14 | 지방세 감면 신청서 | 유지 | — | 확인 필요 |
| P0-15 | 취득세 비과세 확인서 | 유지 | — | 확인 필요 |
| P2-01 | 창업자금 증여세 과세특례 적용신청서 | 유지 | — | gift, business_succession |
| P2-02 | 가업승계 주식 증여세 과세특례 적용신청서 | 유지 | — | gift, business_succession |
| P2-07 | 상속세 물납 신청서 | 유지 | — | inheritance |
| P2-08 | 납세담보 제공서 | 유지 | — | 확인 필요 |
| P2-09 | 분납 신청 안내 | 유지 | — | 확인 필요 |
| P2-15 | 재산 평가심의위원회 심의신청서 | 유지 | — | 확인 필요 |
| P3-02 | 부동산 거래계약 신고서 | 유지 | — | capital_transfer |
| P3-04 | 세무대리 위임장 | 유지 | — | 확인 필요 |
| P4-01 | 주택취득자금 조달 및 입주계획서 | 유지 | — | capital_transfer |
| P4-02 | 토지취득자금 조달계획서 | 유지 | — | capital_transfer |
| P5-01 | 영농자녀가 증여받은 농지 등에 대한 증여세 감면신청서 | 유지 | — | gift, business_succession |
| P5-02 | 창업자금 증여재산평가 및 과세가액 계산명세서 | 상세로 이동 | NTS-IG-12 | gift, business_succession |
| P5-03 | 가업승계 주식 등 증여재산평가 및 과세가액 계산명세서 | 상세로 이동 | NTS-IG-12 | gift, business_succession |
| P5-04 | 증여재산 및 평가명세서 | 상세로 이동 | NTS-IG-11 | gift |
| P5-05 | 상속재산 및 평가명세서 | 상세로 이동 | NTS-IG-10 | inheritance |
| P9-01 | 등록면허세 신고서 | 유지 | — | 확인 필요 |
| P9-09 | 국외전출자 국내주식 양도소득세 신고 안내 | 유지 | — | capital_transfer |

## S6 유지·사후관리

| ID | 자료명 | 처리 | 대표카드/부모 | 목적 매핑 |
|---|---|---|---|---|
| SC-28 | 차용·영수증 · [영수증] 대여금을 전부 돌려받는 경우 | 대표카드 통합 | G-REPAYMENT | 확인 필요 |
| SC-29 | 차용·영수증 · [영수증] 대여금을 일부 돌려받는 경우 | 대표카드 통합 | G-REPAYMENT | 확인 필요 |
| P2-03 | 주식등변동상황명세서 | 유지 | — | business_succession |
| P2-05 | 가업상속공제 사후관리 위반 신고서 | 유지 | — | inheritance, business_succession |
| P2-06 | 명문장수기업 확인 신청 | 목록 삭제 제안 | — | business_succession |
| P3-03 | 국민건강보험 자격상실 안내 | 상세로 이동 | P0-05 | inheritance |
| P5-07 | 공익법인 출연재산 보고서 / 출연재산 명세서 | 유지 | — | 확인 필요 |
| P8-05 | 한정승인 후 청산 절차 안내 | 상세로 이동 | P0-08 | inheritance |
| P8-06 | 상속인 부존재 시 상속재산 청산 공고 안내 | 유지 | — | inheritance |
| P8-11 | 후견사무보고서 / 재산목록보고서 | 유지 | — | 확인 필요 |
| P9-06 | 주택임대사업자 등록·변경·말소 신청서 | 대표카드 통합 | G-RENTAL-BUSINESS | 확인 필요 |
| P9-08 | 해외금융계좌 신고서 | 유지 | — | 확인 필요 |

## S7 정정·분쟁 대응

| ID | 자료명 | 처리 | 대표카드/부모 | 목적 매핑 |
|---|---|---|---|---|
| FAMILY-I-01 | 상속재산명세표 빈칸용 + 예시용 | 상세로 이동 | P1-18 | inheritance |
| P1-11 | 소유권경정등기 신청서 | 유지 | — | 확인 필요 |
| P1-18 | 상속재산분할 심판청구서 | 유지 | — | inheritance |
| P1-19 | 기여분 결정 청구서 | 유지 | — | inheritance |
| P1-20 | 유류분반환청구 소장 | 유지 | — | inheritance |
| P2-10 | 경정청구서 | 대표카드 통합 | G-TAX-REMEDY | 확인 필요 |
| P2-11 | 기한후과세표준신고서 | 대표카드 통합 | G-TAX-REMEDY | 확인 필요 |
| P2-12 | 과세전적부심사 청구서 | 대표카드 통합 | G-TAX-REMEDY | 확인 필요 |
| P2-13 | 이의신청서 | 대표카드 통합 | G-TAX-REMEDY | 확인 필요 |
| P2-14 | 심사청구서/심판청구서 | 대표카드 통합 | G-TAX-REMEDY | 확인 필요 |
| P4-04 | 부동산거래계약 해제등 신고서 / 변경 신고서 | 유지 | — | capital_transfer |
| P4-05 | 증여추정 해명자료 제출 안내 | 유지 | — | gift |
| P5-08 | 상속재산 협의분할 후 재분할 안내 | 상세로 이동 | BP-I-01 | inheritance, gift |
| P8-02 | 상속회복청구 소장 | 유지 | — | inheritance |
| P8-03 | 친생자관계존부확인의 소 / 인지청구의 소 | 유지 | — | inheritance |
| P8-04 | 상속재산 파산 신청서 | 유지 | — | inheritance |

## 카드가 아닌 작업

| 작업 ID | 종류 | 연결 자료 | 새 카드 수 |
|---|---|---|---|
| P1-03 | source_url_update | REG-I-01 | 0 |
| P1-04 | source_url_update | REG-I-03 | 0 |
| P1-05 | source_url_update | REG-G-01 | 0 |
| P4-03 | alias | P3-02 | 0 |
| P7-07 | alias | P3-03 | 0 |
| P8-07 | alias | P1-22 | 0 |
