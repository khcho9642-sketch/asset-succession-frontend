# 구글 무료 API로 채팅 시험

2026-09-09 사용자가 “무료 구글 ai 쓰자”라고 요청해 Google Gemini Developer API 직접 연결로 변경했다. 사이트 호스팅은 Vercel에 유지하며, AI 요청은 `@ai-sdk/google`를 통해 Google에 직접 전송한다.

## 모델과 동작

- 모델: `gemini-3.8-flash` 안정판. 같은 날 공식 가격표에서 Standard 텍스트 입력·출력의 Free Tier 무료 제공을 확인했다.
- Google GenerateContent 문서가 명시적으로 지원하는 함수 도구 + 구조화 출력 조합을 사용한다. 최신 Flash-Lite보다 이 조합의 지원 근거가 명확해서 선택했다.
- `thinkingLevel: low`, 출력 최대 3,000토큰, 사실 제안·답변의 최대 2단계, 자동 재시도 0회를 유지한다. 이 모델은 `minimal` thinking을 지원하지 않는다.
- 매 질문의 선택지와 자유 입력, 원문 근거를 검증한 사실 제안, 고객 확인 후 보고서 생성은 유지한다.
- Gateway·OIDC·다른 모델로의 자동 전환, 검색 그라운딩, 배치·우선 처리, 유료 서비스 추가는 없다.

## 남은 연결 설정

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

Google 무료 API에도 모델별 요청·토큰 한도가 있다. 실제 한도는 AI Studio에 표시된 프로젝트 값을 확인한다. 무료라는 이유로 무제한 요청을 보낼 수 있는 것은 아니다. 429가 나면 추가 호출을 중단하고, 한도에 맞춰 이후에 다시 시험한다.

공식 무료 요금표는 입력과 응답이 제품 개선에 사용될 수 있다고 안내한다. 이 연결은 가상 사례 시험용이며 실제 고객의 재산·개인정보를 시험에 보내지 않는다. 실제 고객 서비스 전환과 데이터 처리 방식은 별도 결정 사항이다.

`GET /api/diagnosis`는 외부 AI 호출 없이 설정과 가이드 준비 상태만 반환한다.

- 키 미설정: `configured: false`, `GOOGLE_API_KEY_MISSING`.
- 준비됨: `configured: true`, `issues: []`. 이 값만으로 무료 티어·인증 성공·대화 품질이 검증된 것은 아니다.
- 키를 저장한 뒤 가상 사례로 응답·선택지·사실 제안을 함께 확인한다. 실제 AI 확인 전에는 연결 완료라고 표시하지 않는다.

## 공식 근거

- [Gemini 가격표](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini 3.8 Flash 모델](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)
- [GenerateContent 구조화 출력과 도구](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)
- [Google API 과금과 프로젝트 티어](https://ai.google.dev/gemini-api/docs/billing)
- [API 키](https://ai.google.dev/gemini-api/docs/api-key)
- [요청 제한](https://ai.google.dev/gemini-api/docs/rate-limits)
