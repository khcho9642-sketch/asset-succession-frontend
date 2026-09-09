# 구글 무료 API로 채팅 시험

2026-09-09 사용자가 “무료 구글 ai 쓰자”라고 요청해 Google Gemini Developer API 직접 연결로 변경했다. 사이트 호스팅은 Vercel에 유지하며, AI 요청은 `@ai-sdk/google`를 통해 Google에 직접 전송한다.

## 모델과 동작

- 주 모델: `gemini-3.8-flash`, 보조 모델: `gemini-3.5-flash-lite`. 2026-09-09 공식 가격표에서 두 안정판의 Standard 텍스트 입력·출력 Free Tier 무료 제공을 확인했다.
- 같은 날 사용자가 요청한 실패 대응으로 보조 모델 전환을 추가했다. 기존 Google 키를 재사용하며 추가 환경변수는 필요 없다.
- 첫 주제 버튼과 이어지는 대표 선택 흐름은 앱에서 즉시 처리하므로 AI 제공자를 호출하지 않는다.
- 자유 입력과 정해지지 않은 흐름은 제공자 시도마다 `facts`, `message`, `choices`를 한 번의 엄격한 구조화 생성으로 받는다. 사실 추출과 고객 답변을 위한 별도 호출을 만들지 않는다.
- `thinkingLevel: low`, 호출당 출력 최대 3,000토큰, SDK 자체 재시도 0회다. 주 모델을 한 번 시도하고 전환 조건에 해당할 때만 보조 모델을 한 번 시도하므로 외부 호출은 한 턴에 최대 2회다.
- 서버는 최신 고객 원문을 기준으로 `facts`를 검증한다. 수락된 사실과 고객용 `message`·`choices`만 클라이언트에 전달하며, 거절된 사실이나 제공자의 원본 JSON은 보내지 않는다.
- 매 질문의 선택지와 자유 입력, 원문 근거를 검증한 사실 제안, 고객 확인 후 보고서 생성은 유지한다.
- Gateway·OIDC, 검색 그라운딩, 배치·우선 처리, 유료 서비스 추가는 없다.

## 실패 시 전환

- 주 모델의 일시적 서버 오류, 호출 한도, 연결·스트림 실패, 시간 초과 또는 불완전한 응답에는 보조 모델을 한 번 시도한다. 인증·결제·잘못된 요청·없는 모델 오류에는 전환하지 않는다. 콘텐츠 필터 종료도 전환하지 않는다.
- 각 모델의 전체 응답 시간을 최대 24초로 제한한다. 요청 본문 읽기 최대 10초를 포함해 Vercel 함수의 60초 제한 안에 마친다. 사용자가 취소하거나 연결을 끊으면 보조 모델을 새로 호출하지 않는다.
- 각 시도는 원래 대화와 확인된 사실에서 시작한다. 실패한 모델의 구조화 응답이나 생각 서명은 다음 모델에 전달하지 않는다.
- 응답 전체를 제한된 서버 버퍼에서 검증한 뒤 성공한 시도의 고객용 답변·선택지와 서버가 수락한 사실만 전달한다. 실패한 시도의 부분 답변이나 사실 카드가 화면에 중복 반영되지 않는다.
- 두 모델이 모두 실패하면 기존 오류 안내와 직접 입력 기능으로 이어간다. 보조 모델도 Google이므로 Google 전체 장애나 프로젝트 공통 한도에는 실패할 수 있다.

## 연결 설정

1. [Google AI Studio API 키](https://aistudio.google.com/api-keys)에서 **Free Tier 프로젝트**의 키를 만든다. 이미 결제 계정이 연결된 프로젝트의 키를 사용하지 않는다. 이번 시험을 위해 결제 연결·선불 충전·유료 티어 전환을 진행하지 않는다.
2. Vercel `frontend-prototype` 프로젝트의 Environment Variables에서 아래 값을 **Preview / codex/chat-opening-topics** 범위에 저장하고 새 배포에 적용한다.

| 환경변수 | 값 |
| --- | --- |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google AI Studio의 Free Tier 프로젝트에서 발급한 실제 키 |

기존 Vercel Gateway 키는 Google 키로 사용할 수 없다. 실제 키는 채팅·문서·Git에 붙여넣지 않는다. `NEXT_PUBLIC_` 접두사를 붙이지 않는다. `GEMINI_API_KEY`도 지원하지만 기본 이름을 함께 설정했다면 `GOOGLE_GENERATIVE_AI_API_KEY`가 우선한다. 기본 이름을 명시한 빈 값도 우선하므로 중복 설정하지 않는 것이 좋다.

승인한 Preview 브랜치에서는 아래 비밀이 아닌 기본값을 코드에서 제공하므로 새로 입력할 필요가 없다. 이미 환경변수로 명시한 값은 기본값보다 우선한다.

```env
AI_DIAGNOSIS_FREE_TRIAL_ENABLED=true
GOOGLE_DIAGNOSIS_MODEL=gemini-3.8-flash
```

다른 Preview·로컬·Production에서는 위 두 설정을 명시해야 한다. Production 활성화는 이번 작업 범위가 아니다. 중단하려면 해당 범위의 `AI_DIAGNOSIS_FREE_TRIAL_ENABLED=false`로 배포한다.

이전 `AI_GATEWAY_API_KEY`, `VERCEL_OIDC_TOKEN`, `AI_DIAGNOSIS_MODEL`이 남아 있어도 현재 AI 연결에는 사용하지 않는다.

## 무료 조건과 검증

무료 여부는 Google 프로젝트의 과금 티어로 결정된다. 모델명이나 활성화 스위치로 무료 과금을 강제할 수 없다. 따라서 **Free Tier 프로젝트의 키**를 사용해야 한다. 앱은 결제 설정을 변경하지 않으며 계정 티어를 자동 조회하지 않는다.

Google 무료 API에도 모델별 요청·토큰 한도가 있다. 실제 한도는 AI Studio에 표시된 프로젝트 값을 확인한다. 주 모델이 429를 반환하면 다른 무료 모델을 한 번 시도하고, 보조 모델도 실패하면 멈춘다. 새 키를 만들거나 반복 호출해 프로젝트 한도를 우회하지 않는다.

공식 무료 요금표는 입력과 응답이 제품 개선에 사용될 수 있다고 안내한다. 이 연결은 가상 사례 시험용이며 실제 고객의 재산·개인정보를 시험에 보내지 않는다. 실제 고객 서비스 전환과 데이터 처리 방식은 별도 결정 사항이다.

`GET /api/diagnosis`는 외부 AI 호출 없이 설정과 가이드 준비 상태만 반환한다.

- 키 미설정: `configured: false`, `GOOGLE_API_KEY_MISSING`.
- 준비됨: `configured: true`, `issues: []`. 이 값만으로 무료 티어·인증 성공·대화 품질이 검증된 것은 아니다.
- 키를 저장한 뒤 가상 사례로 응답·선택지·사실 제안을 함께 확인한다. 실제 AI 확인 전에는 연결 완료라고 표시하지 않는다.

## 공식 근거

- [Gemini 가격표](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini 3.8 Flash 모델](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)
- [Gemini 3.5 Flash-Lite 모델](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)
- [GenerateContent 구조화 출력](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)
- [Google API 과금과 프로젝트 티어](https://ai.google.dev/gemini-api/docs/billing)
- [API 키](https://ai.google.dev/gemini-api/docs/api-key)
- [요청 제한](https://ai.google.dev/gemini-api/docs/rate-limits)
