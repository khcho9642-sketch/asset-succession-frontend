# Phase 2B 계산·시나리오 엔진 계약

Phase 2B는 화면 장식 작업이 아니라 Report V2(#5)와 Conversational Precheck V2(#6)가 함께 사용할 공통 모델과 deterministic rule engine을 제공한다.

## 최상위 진단 트랙

자산승계 360의 최상위 트랙은 네 개로 고정한다.

1. 상속
2. 증여
3. 가업상속·가업승계
4. 양도

보험, 가족법인, 부담부증여, 단계적 증여, 혼합안은 독립 상품군이 아니라 위 트랙에서 쓰이는 실행수단이다.

## 데이터 흐름

```text
AssessmentSnapshot
→ ClientFacts
→ CalculationContext
→ Baseline
→ Scenario
→ CalculationResult
→ Recommendation
→ ReportViewModel
```

자유채팅형 입력은 아래 순서를 지킨다.

```text
raw conversation
→ candidate facts
→ 사용자 확인
→ confirmed facts
→ ClientFacts
```

확인되지 않은 자유입력은 계산 입력으로 쓰지 않는다.

## 계산 상태

계산 결과는 숫자 대신 상태를 가질 수 있다.

- `calculable`: 계산 가능
- `needs_info`: 추가정보 필요
- `needs_engine`: 계산엔진 연결 필요
- `needs_expert_review`: 전문가 검토 필요
- `incomparable`: 현재 조건에서는 비교 불가
- `not_applicable`: 현재 조건에서는 제외

계산 불가 상태를 `0원`으로 대체하지 않는다.

## 기준안과 절세액

모든 절세 비교에는 기준안이 필요하다.

기본 기준안은 “현재 구조를 유지하고 별도 생전 이전 없이 가정된 승계시점에 상속이 발생하는 경우”이다. 양도 트랙은 동일 기준일·동일 자산가액·동일 가족구성으로 비교 가능한 별도 기준안을 둘 수 있다.

정의:

- 예상 절세액 = 기준안 예상세액 - 시나리오 예상세액
- 절세율 = 예상 절세액 / 기준안 예상세액
- 총부담 = 세금 + 실행비용
- 예상 순효과 = 기준안 총부담 - 시나리오 총부담

예상 절세액과 예상 순효과를 혼용하지 않는다. 절세액이 음수이면 “절세”가 아니라 “추가 예상 세부담”으로 표시한다.

## 숫자 생성 금지

AI와 UI는 세액, 절세액, 절세율, 실행비용, 순효과, 납부재원 부족액을 만들지 않는다. 현재 Phase에서는 직접 입력된 현재 자산가액과 직접 입력된 채무만 표시 가능하다.

계산엔진이 연결되지 않은 항목은 다음처럼 표시한다.

- 계산엔진 연결 후 산정
- 추가정보 필요
- 산정 불가
- 전문가 검토 필요
- 현재 조건에서는 비교 불가

## 산출물 위치

- 모델: `lib/phase2b/types.ts`
- 정규화: `lib/phase2b/normalize.ts`
- 룰 엔진: `lib/phase2b/engine.ts`
- 계산 인터페이스: `lib/phase2b/calculation.ts`
- fixture: `lib/phase2b/fixtures.ts`
- 검수 화면: `/phase-2b`
- 단위 테스트: `scripts/phase2b-unit-tests.ts`
