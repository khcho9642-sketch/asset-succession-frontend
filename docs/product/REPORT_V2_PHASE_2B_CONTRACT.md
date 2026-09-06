# Report V2(#5) 연결 계약

Report V2는 Phase 2B의 `ScenarioPlan`을 읽어 7장 가족 의사결정 보고서를 만든다.

## 페이지별 사용 필드

### 1장

- `facts.planning_tracks`: 선택된 진단 트랙
- `baseline.calculation_result.asset_value`: 현재 입력 자산가액 또는 확인 필요 상태
- `baseline.calculation_result.total_tax`: 기준안 예상세액
- `internal_analysis.disclosure_label`: 내부 후보 분석 완료 요약
- `display_scenarios.recommended[0..2]`: 사용자에게 노출할 AI 추천 후보
- `unknown_items`: 추가 확인사항

계산엔진 미연결 상태에서는 기준안 예상세액, 우선 시나리오 예상세액, 예상 절세액, 절세율, 납부재원 부족액을 숫자로 표시하지 않는다.

### 2장

- `facts.family`
- `facts.assets`
- `facts.debts`
- `facts.past_gifts`

작성자와 실제 소유자·지분이 분리되어야 하며, 확인되지 않은 소유자나 지분은 가족별 이전금액으로 만들지 않는다.

### 3장

- `baseline`
- `baseline.calculation_result.total_tax`
- `baseline.calculation_result.liquidity_gap`
- `facts.confirmed_tax_bases`

현 상태 기준안과 납세재원은 별도 페이지에서 먼저 보여준다.

### 4장

- `baseline`
- `display_scenarios.recommended`

기준안과 AI 추천 3개만 세금·현금·기간·위험 기준으로 비교한다. 내부 36개 후보의 전체 목록이나 제외 매트릭스는 표시하지 않는다.

### 5장

- `display_scenarios.recommended[0..1]`

추천안 1·2의 당사자, 대상자산, 예상세액, 필요현금, 선행확인을 상세 표시한다.

### 6장

- `display_scenarios.recommended[2]`
- `display_scenarios.liquidity_support`
- `display_scenarios.additional_reviews[0..1]`

추천안 3과 보험·연부연납 등 납세재원 보완안을 표시한다. 추가 검토안은 필요한 경우 최대 2개만 표시한다.

### 7장

- `display_scenarios.recommended[].timeline`
- `unknown_items`
- `SUPPORTED_TAX_LAW_REFERENCES`

실행 로드맵, 주의사항, 공식 근거를 함께 표시한다.

## 금지

- 계산엔진 결과 없는 예상세액 숫자 표시
- 계산 불가 값을 0원으로 표시
- 음수 절세액을 절세로 표현
- DEMO fixture 숫자를 고객 보고서 숫자로 재사용
- 보험·가족법인·부담부증여를 최상위 트랙으로 표시
- 36개 내부 후보 전체 목록·전체 매트릭스·제외 시나리오 목록 노출
