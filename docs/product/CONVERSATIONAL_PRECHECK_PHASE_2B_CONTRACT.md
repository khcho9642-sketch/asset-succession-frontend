# Conversational Precheck V2(#6) 연결 계약

Conversational Precheck V2는 버튼 답변과 자유입력을 `ClientFacts`로 정규화한다.

## 저장 구조

대화형 입력은 다음 정보를 보존한다.

- `conversation_messages`
- `source`: `button | free_text | confirmed_extraction`
- `raw_text`
- `extracted_candidates`
- `confirmation_status`
- `customer_notes`

현재 Phase 2B의 계산·시나리오 엔진에는 `button` 또는 `confirmed_extraction`으로 확인된 값만 전달한다.

## 정규화 대상

- `planning_tracks`
- `family`
- `assets[]`
- `debts[]`
- `past_gifts[]`
- `insurance[]`
- `business_interests[]`
- `goals[]`
- `constraints[]`
- `time_horizon`
- `unknown_items[]`

## 자유입력 처리

사용자 문장은 곧바로 확정값으로 저장하지 않는다.

```text
사용자 문장
→ 제한된 deterministic parsing
→ 제가 이렇게 이해했습니다 확인 카드
→ 사용자 확인
→ confirmed facts
```

확인 전 candidate는 보고서와 계산엔진 입력에서 제외한다.

## AI adapter 경계

향후 AI adapter는 고객 자연어 이해, 쉬운 추가질문, 계산결과 설명, 보고서 문장 초안에만 사용한다.

AI는 세액, 절세액, 납부재원 부족액, 순효과를 생성하지 않는다.
