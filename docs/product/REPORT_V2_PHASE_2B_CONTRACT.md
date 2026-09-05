# Report V2(#5) 연결 계약

Report V2는 Phase 2B의 `ScenarioPlan`을 읽어 7장 가족 의사결정 보고서를 만든다.

## 페이지별 사용 필드

### 1장

- `facts.planning_tracks`: 선택된 진단 트랙
- `baseline.calculation_result.asset_value`: 현재 입력 자산가액 또는 확인 필요 상태
- `baseline.calculation_result.total_tax`: 기준안 예상세액
- `recommendations[0..2]`: 우선 검토 후보
- `unknown_items`: 추가 확인사항

계산엔진 미연결 상태에서는 기준안 예상세액, 우선 시나리오 예상세액, 예상 절세액, 절세율, 납부재원 부족액을 숫자로 표시하지 않는다.

### 4장

- `recommendations`
- `scenarios[].rationale`
- `scenarios[].required_information`
- `scenarios[].comparison`

고객 답변을 인용한 제시 이유는 `rationale`에서 가져온다.

### 5장

- `scenarios[]`
- `priority`
- `eligibility`
- `calculation_status`
- `comparison.expected_tax_savings`
- `comparison.expected_net_effect`

서로 다른 기준일·자산가액·가족구성의 결과는 비교표에서 절세액으로 합치지 않는다.

### 6장

- `scenarios[].timeline`
- `required_information`

계산 또는 실행 전 확인사항은 timeline과 required information으로 분리한다.

## 금지

- 계산엔진 결과 없는 예상세액 숫자 표시
- 계산 불가 값을 0원으로 표시
- 음수 절세액을 절세로 표현
- DEMO fixture 숫자를 고객 보고서 숫자로 재사용
- 보험·가족법인·부담부증여를 최상위 트랙으로 표시
