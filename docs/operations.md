# 운영·배포 기준

이 문서는 현재 운영 기준입니다. 과거 기능별 지시서·실험 기록·검토 증거는 당시 이력으로 보존하며, 운영 대상 선택에는 이 문서를 우선합니다.

## 하나의 운영 기준

| 항목 | 기준 |
| --- | --- |
| 대표 주소 | https://asset360.intellic.co.kr |
| GitHub 저장소 | https://github.com/khcho9642-sketch/asset-succession-frontend |
| 기본 브랜치 / 운영 배포 브랜치 | `main` |
| Vercel 팀 | `khcho9642-s-projects` (`team_7V4lQzfQ1oXyaW1FjJYzRkGa`) |
| Vercel 프로젝트 | `asset-succession-frontend` (`prj_WTMVqz7zqLxW9p5VpXnPAeO5z7Or`) |
| 설치·빌드 기준 | 저장소 루트, Node.js 22, Next.js 서버 배포 |
| 이전 대표 주소 | `succession.intellic.co.kr` → `asset360.intellic.co.kr`, HTTP 308 |
| 프로젝트 기본 주소 | `asset-succession-frontend-lovat.vercel.app` → `asset360.intellic.co.kr`, HTTP 308 |

2026-11-16 통합 기준은 실제 운영 커밋 `8b1d83672ca038850d949bfe1a93705e94c550d1`입니다. 이 커밋은 전체 자료실 복구 `e7f7ada`, 상황별 탐색 `04ef5f0`, 사용성 개선 `79c557d`, 검색 제출 `8b1d836`을 모두 포함합니다. 이후 운영본은 `main`의 이력과 Vercel Production 배포 SHA를 대조합니다. 운영 SHA를 예전 기능 브랜치 이름으로 추정하지 않습니다.

기존 `main`은 통합 기준 커밋의 조상이므로 이력을 덮어쓰지 않고 fast-forward로 통합합니다. 과거 작업 브랜치는 보존합니다. 이 작업이 다른 실험 브랜치의 미배포 기능을 모두 병합했다는 의미는 아닙니다.

## 수정에서 배포까지

1. 최신 `main`에서 `codex/작업명` 브랜치를 만들고 변경합니다.
2. Pull Request의 코드·자료실 회귀검사를 통과시키고 Vercel Preview에서 실제 동선을 확인합니다.
3. 검토한 변경을 `main`에 통합합니다. Vercel의 Production Branch Tracking은 `main`입니다.
4. Vercel Production이 READY가 되고 대표 도메인에 연결된 뒤, 배포 SHA와 GitHub `main`을 대조합니다.
5. `asset360`에서 배포 후 화면 검사를 확인합니다. 되돌려야 한다면 마지막 검증된 Production 배포로 롤백한 뒤 원인 수정을 별도 브랜치에서 진행합니다.

`out` 정적 내보내기로 대체하지 않습니다. `/api/diagnosis`가 있는 Next.js 서버 배포를 사용합니다. 기존 Production 환경변수는 브랜치 정리와 분리하여 유지합니다. AI 공급자·키·모델 활성화는 `lib/chat/server.ts`가 실제 읽는 설정을 기준으로 별도 검증합니다. 예전 Preview 브랜치에 한정된 무료 체험 기본값을 Production 설정으로 간주하지 않습니다.

## 자동 점검 대상

- `PR Quality Checks`: `main` 대상 PR, `main` push, 수동 실행. 해당 커밋을 빌드하고 로컬 서버에서 기능을 검사합니다. 이때 `127.0.0.1:4173`은 수정 코드를 검사하기 위한 정상적인 대상입니다.
- 자료실 회귀검사: 같은 CI에서 `node scripts/run-forms-library-tests.mjs`를 실행합니다. 자료 ID·검색·업무 목록·상세·다운로드 연결을 검사합니다.
- 공개 헤더·모바일 진단 화면·툴바 검사: Production 배포 성공 이벤트 또는 `main` 코드 검사 성공 뒤에 `https://asset360.intellic.co.kr`을 검사합니다. `/api/deployment`의 공개 빌드 SHA가 검사 대상 커밋과 일치한 뒤 화면 검사를 시작하므로 이전 배포를 잘못 통과시키지 않습니다. 수동 실행에서는 승인된 Preview URL과 확인할 SHA를 명시할 수 있습니다.
- 자동 점검을 과거 `khcho98` 프로젝트의 Preview 주소에 고정하지 않습니다. 배포 성공 시에는 배포 SHA를 checkout합니다.

로컬 기본 검사:

```sh
npm ci
npm run lint
npm run typecheck
PYTHON=python3 node scripts/run-forms-library-tests.mjs
npm run build
```

`forms-preservation-check.mjs`는 별도의 전체 자료대장 JSON과 Git 기준 커밋 `e7f7ada`를 사용합니다. 이 커밋은 **운영 브랜치가 아니라 원본 보존 비교 기준**으로 유지합니다. 별도 대장이 없는 새 clone에서는 아래 명령에 대장 경로를 지정해야 합니다. 저장소에 개인 파일이나 인증정보를 추가하지 않습니다.

```sh
node scripts/forms-preservation-check.mjs --baseline=/path/to/materials-register.json
```

`forms-route-smoke.mjs` 등 과거 18개 카드·전체 가이드 일괄 렌더링을 전제한 일회성 점검을 최신 자료실의 합격 기준으로 사용하지 않습니다.

## 배포 후 확인

- `/forms`: 다섯 상황과 검색창. 검색 버튼·Enter로 검색할 수 있어야 합니다.
- `/forms?view=all`: 공개 195개, 보관 9개 별도. 제외 16개와 기존 자료 ID는 보존합니다.
- 상속 발생 후 → 이전·청구 → 은행·예금 → 업무 자료 전체 보기: 해당 업무 자료 5개와 가이드 복귀를 확인합니다.
- 자료 상세 → 원본 다운로드 → 목록/가이드 복귀. 현재 제공본과 이전 버전, HWP·PDF 등 실제 형식을 구분합니다.
- `/precheck`, `/consultation`, `/sample-report`도 기존 동작을 확인합니다. AI 활성화 여부는 서버 설정과 API 응답을 별도로 확인합니다.
- `/api/deployment`의 `commitSha`가 GitHub `main` 및 Vercel Production SHA와 일치해야 합니다. 이 API는 빌드 SHA·브랜치·배포 환경만 공개하며 인증정보를 반환하지 않습니다.
- `succession.intellic.co.kr/forms?resource=BP-G-01`이 대표 주소의 같은 경로·검색 조건으로 이동하는지 확인합니다.

원본 파일 458개, 자료 220개와 공식기관 외부 링크·Google Drive 과거 보관본은 도메인·브랜치 정리와 무관하게 유지합니다. 이전 배포의 immutable Preview URL은 검토 증거이므로 무조건 대표 주소로 보내지 않습니다.

## 상담 접수 운영

`/consultation`은 `POST /api/consultation`으로 연락처와 이용 동의, 재시도용 요청 ID를 제출합니다. 사전진단은 선택 사항이며, 연결된 경우 진단 ID만 전달합니다. 이 ID로 담당자가 브라우저에 보관된 보고서를 조회할 수 있는 것은 아닙니다.

접수 서버는 기존 Google Apps Script 웹앱을 사용합니다. Google 접수대장에 저장하고 담당자 메일로 알립니다. 웹앱 주소와 인증 토큰은 `CONSULTATION_WEBHOOK_URL`, `CONSULTATION_WEBHOOK_TOKEN`으로 **Production에만** 설정합니다. 값은 Git·클라이언트 코드·로그에 넣지 않습니다. 별도 유료 서비스나 데이터베이스를 추가하지 않습니다.

- 접수대장 저장이 확인된 뒤에만 접수번호를 표시합니다. HTTP 200만으로 성공을 판단하지 않습니다.
- 저장 후 메일 알림에 실패하면 동일 요청 ID로 한 번 더 확인합니다. 계속 실패하면 저장된 접수와 알림 지연을 구분해 안내합니다. 담당자는 접수대장의 `메일 대기` 상태를 확인하고 후속 연락을 처리합니다.
- 미확정 요청은 같은 탭의 세션에 요청 ID·무작위 salt·내용 대조용 해시만 최대 1시간 보관합니다. 전화번호 원문·동의·보고서 내용은 브라우저 저장소에 넣지 않습니다. 새로고침 후 같은 내용을 다시 입력하면 같은 요청 ID를 사용하며, 저장 확인 후 이 메타데이터를 삭제합니다. 저장소를 차단한 브라우저는 같은 화면 안에서의 재시도만 보호합니다.
- 기존 웹앱은 잠금과 같은 요청 ID로 중복 행을 방지하고, 메일 발송일시가 있으면 재발송하지 않습니다. 메일 발송 후 발송일시 기록과 응답이 모두 실패하는 경우에는 중복 알림이 생길 수 있으므로, 담당자는 접수번호가 같은 알림을 한 건으로 대조합니다.
- Preview에는 실제 접수 인증정보를 제공하지 않습니다. 자동 UI·스모크 검사는 접수 API를 가상 응답으로 대체하며, 서버 검사도 외부 저장·메일 없이 실행합니다.
- 운영 확인은 식별 가능한 합성 테스트 접수 한 건으로 화면의 접수번호, 접수대장 저장, 담당자 메일 도착을 대조합니다. 중복 확인은 같은 요청 ID를 재사용합니다. 실제 고객 연락처는 테스트나 증거 파일에 넣지 않습니다.

기존 `consultation-contact-review.md`의 미전송 화면은 과거 검토 기록입니다. 현재 동작은 이 운영 기준과 최신 코드·검사 결과를 따릅니다.

## AI 가상상담 시험

`codex/ai-conversation-trial`은 보호된 Preview 전용 무료 Gemini 시험이다. [답변·기억·실패 처리와 검증 기준](ai-conversation-trial.md)을 따른다. 실제 고객 정보는 입력하지 않는다. 운영 상담 접수 설정은 유지한다.

`asset360.intellic.co.kr`에도 무료 Gemini API를 연결한다. Production의 `main`에서 `AI_DIAGNOSIS_PRODUCTION_ENABLED=true`, `GOOGLE_DIAGNOSIS_MODEL=gemini-3.1-flash-lite`, 기존 APCI 무료 등급 프로젝트의 서버 전용 키를 모두 설정해야 활성화된다. 보호 Preview의 기본 모델은 `gemini-3.5-flash-lite`이며, 서버는 이 두 Flash-Lite 모델만 기본 모델로 허용한다. 운영은 3.5의 반복된 제공자 오류를 확인한 뒤 같은 무료 등급의 3.1을 사용한다. 유료 프로젝트 키·결제 연결·유료 전환은 사용하지 않는다. 무료 할당량이 소진되면 오류와 재시도를 안내하며 유료 서비스로 우회하지 않는다. [Google 무료 가격표](https://aistudio.google.com/docs/pricing#gemini-3.1-flash-lite)를 따른다.

운영 화면에는 가상정보 시험 배너를 표시하지 않는다. 입력창 옆의 ‘AI 안내’를 열면 Google Gemini 전송과 식별정보 입력 주의를 확인할 수 있다. 무료 API의 데이터 처리 조건은 [Google 약관](https://aistudio.google.com/docs/terms#data-use-unpaid)을 따른다. 보고서는 고객 확인 전·세액 미산정 초안이며, 계산과 상담 접수는 기존 확인 절차를 유지한다. 운영 API를 중지할 때는 Production 플래그를 false로 바꾸고 재배포한다. 보호 Preview의 별도 시험 설정과 상담 접수 설정은 유지한다.
