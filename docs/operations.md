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
- 공개 헤더·모바일 진단 화면·툴바 검사: Production 배포 성공 이벤트 뒤에 `https://asset360.intellic.co.kr`을 검사합니다. 수동 실행에서는 승인된 Preview URL을 명시해 검사할 수 있습니다.
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
- `succession.intellic.co.kr/forms?resource=BP-G-01`이 대표 주소의 같은 경로·검색 조건으로 이동하는지 확인합니다.

원본 파일 458개, 자료 220개와 공식기관 외부 링크·Google Drive 과거 보관본은 도메인·브랜치 정리와 무관하게 유지합니다. 이전 배포의 immutable Preview URL은 검토 증거이므로 무조건 대표 주소로 보내지 않습니다.
