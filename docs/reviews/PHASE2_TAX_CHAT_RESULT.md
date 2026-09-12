# 고객 세법 MCP 응답 연결 결과

검사일: 2026-09-12 (KST). 상태: **서버 연결 코드와 독립 검증 완료, 실제 사이트의 MCP + Google 통합 활성화는 차단됨. Draft 유지.**

## 1. 기준과 제출

- 저장소: `khcho98-maker/asset-succession-frontend`
- 시작 전 원격 fetch와 PR #13 상태를 확인했다. PR #13은 Draft, OPEN, 미병합이며 HEAD는 `63b6a66fd9c02bba553a11962d62cfbf9c558971`이었다.
- 기준 브랜치: `codex/phase1-hardening`. 별도 후속 브랜치: `codex/phase2-grounded-tax-chat`.
- 구현 커밋: `d4e0e2eced224881f9d455cd49d94b4767a88469`.
- 최종 소스 커밋: **`24559a0b0f3b4b9ffd1819d9fc99ea378bbbd36e`**. 실제 국세청 사전답변 링크 유형을 확인한 뒤 추가 보완했다.
- 후속 [Draft PR #14](https://github.com/khcho98-maker/asset-succession-frontend/pull/14), base는 `codex/phase1-hardening`이다. PR #13 자체를 확장하거나 병합하지 않았다.
- 이 보고서와 증빙은 위 소스를 바꾸지 않는 후속 문서 커밋으로 제출한다. 소스 검증 SHA와 문서 커밋 HEAD를 혼동하지 않는다.
- 첨부 `C:\Users\khcho\Downloads\asset_succession_phase2_tax_chat.md`를 읽었다. 관련 AGENTS.md는 저장소 및 상위 경로 검사에서 찾지 못했다.
- 사용자의 기존 미추적 `artifacts/`, `docs/review-assets/paper-report/`, `docs/review-assets/pr-2/`의 PDF/PNG/JSON을 삭제하거나 커밋하지 않았다. 검토 ZIP의 source도 덮어쓰지 않았다.

## 2. 이번 구현

최신 요청인 "사이트가 세법 MCP 근거로 답변"에 해당하는 고객 서버 경로를 구현했다. Codex 개발 도구 등록만 한 작업이 아니다.

1. 고객의 세법 질문을 감지하고 공개 세법 용어로만 검색어를 구성한다. 단순 재산/채무 입력은 MCP를 호출하지 않는다.
2. `/api/diagnosis`의 서버 응답 경로가 실제 MCP `tools/list`를 확인하고, 읽기 전용 `law_article_as_of`, `nts_ruling_search`를 호출한다.
3. 실제 반환된 법령/국세청 자료를 기존 Google 설명 호출에 전달한다. 같은 응답의 모델 재시도는 조회 자료를 재사용한다.
4. 서버가 확인한 출처 ID만 채택하고 제목, 기관, 원문 링크, 발췌, 조회일과 확인된 날짜를 표시한다. 회신일과 시행일을 구분한다.
5. 근거가 없으면 AI로 세법 결론을 만들지 않는다. 인증 실패, 자료 없음, 조회/응답 오류를 구분한다. 개인 세액 요청은 기존 확인 및 계산엔진 흐름으로 안내한다.
6. 혼합 입력은 고객이 단정한 사실과 세법 질문을 분리한다. 원문 근거, 저장 복원, 동일 메시지 재처리 방지, 사실 수정 시 계산 확인 해제를 유지한다. 조회 문서/설명/가정은 고객 사실이나 계산 입력으로 복사하지 않는다.

**대출 총액 단일화와 연락처 미리보기 양식 숨김은 이번 MCP 중심 PR에 구현하지 않았다.** 기존 상세 채무 및 미해결 요청 보호 로직을 그대로 보존했다. 따라서 전체 2차 개발이나 서비스 전체가 완료됐다는 보고가 아니다.

## 3. 실제 연결 조사

- 확인한 기존 MCP: `C:\Users\khcho\Documents\nts-tax-mcp\server_ext_stdio.py`. `server_ext.py`, `server.py`의 실제 도구와 입출력 스키마를 읽었다.
- 로컬 검증은 기존 인증 설정을 프로세스 환경으로만 전달했다. `LAW_API_OC` 값은 코드, 로그, Git, 화면에 출력하지 않았다. 제품 코드가 Codex 설정을 읽지는 않는다.
- 로컬 stdio와 Vercel HTTPS는 별개다. Vercel에서는 stdio 설정을 거부하며 인증된 Streamable HTTP와 서버용 Bearer 자격증명만 지원한다. OAuth-only 연결은 인증 흐름 확인 전 지원한다고 주장하지 않는다.
- 기존 로컬 HTTP 서버는 인증 없이 바인딩하는 경로가 있어 공개하거나 터널링하지 않았다. 새 서버/유료 호스팅을 만들지 않았다.
- 사용자는 기존 인증 주소와 Google 무료 상태가 있다고 답했으나 실제 HTTPS 주소/인증 방식은 제공되지 않았다. 접근 가능한 Vercel 연결의 팀 목록도 비어 있어 원격 환경변수 등록 권한을 확인하지 못했다.
- 새 주소, MCP 도구, 비밀키를 만들어 넣지 않았다. 설정 항목만 `.env.example`과 [연결 문서](../tax-mcp-chat.md)에 기록했다.

## 4. 실제 MCP 조회 증빙

실제 수정 저장소의 절대 경로를 전달해 다음 명령을 실행했다. 별도 검토 사본을 시험한 것이 아니다.

```text
node scripts/tax-mcp-live-audit.mjs "C:\Users\khcho\Documents\ChatGPT\상속증여\asset-succession-frontend"
```

기존 MCP 프로세스 환경은 로컬 인증 설정에서 읽어 전달했으며 값은 기록하지 않았다. 스크립트는 해당 저장소의 `tax-grounding.ts`, `tax-mcp.ts`를 새로 변환하고 SHA256 및 Git HEAD를 기록한다.

| 공개 가상 질문 | 최종 상태 | 표시 가능 출처 | 실제 도구 결과 |
| --- | --- | --- | --- |
| 상속 공제는 무엇을 확인하나요? | ready | 2 | 두 도구 모두 OK |
| 증여 공제는 무엇을 확인하나요? | ready | 3 | 두 도구 모두 OK |
| 양도세 비과세 요건을 알려주세요 | ready | 2 | 두 도구 모두 OK |
| 가업승계 요건을 알려주세요 | ready | 2 | 두 도구 모두 OK |

최종 실행은 `24559a0...`, 2026-09-12 09:43:32 UTC에 기록되었다. 네 질문에 총 8회 실제 MCP 도구 호출을 했고, 이 실행에서 **Google 호출은 0회**다. [실제 조회 JSON](phase2-tax-chat-evidence/live-mcp.json)에 제목/기관/원문 URL/발췌/도구 상태/소스 해시가 있다.

초기 `d4e0e2e`에서는 최신 국세청 사전답변이 허용된 문서 유형에 없어 4개 질문 모두 `partial`이었다. [수정 전 기록](phase2-tax-chat-evidence/live-mcp-before-advance-answer-fix.json)을 보존했다. 실제 [국세청 사전답변 원문](https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=200000000000022895)을 브라우저로 열어 문서번호 `사전-2026-법규재산-0283`과 상세 화면을 확인한 뒤 해당 유형을 추가했다. 모르는 유형은 `UNSUPPORTED_DOCUMENT`로 구분한다. 초기 부분 성공을 전체 성공으로 바꾸어 기록하지 않았다.

이 조회는 주요 조문과 관련 회신의 제한된 발췌다. 모든 세법/적용례/시행령을 종합 검토했거나 고객에게 적용 가능하다고 확정한 것이 아니다.

## 5. 자동검사

로컬 Node `v24.14.0`, CI Node `22.x`다. 로컬의 엔진 버전 차이를 숨기지 않았고 프로젝트의 Node 22 설정은 변경하지 않았다.

| 명령/검사 | 결과 | 검증 대상과 한계 |
| --- | --- | --- |
| `npm run lint` | 통과 | 최종 소스와 동일한 코드, 오류 무시 없음 |
| `npm run typecheck` | 통과 | 최종 소스 |
| `npm run test:chat` | 112/112 | Google/MCP 응답은 모의, 실제 SDK/서버 응답 조립 경로 검사 |
| `npm run test:tax` | 105/105 | 기존 계산, PR13 보존/미해결 요청/재처리 회귀시험 유지 |
| `npm run test:phase2b` | 28/28 | 기존 시나리오 엔진 유지 |
| `npm run build` | 통과 | `24559a0...` 소스로 다시 빌드 |
| `npm run test:chat-api` | 25/25 | 최종 빌드 서버, 공급자 호출 0회 |
| `npm run test:chat-ui` | 21개 흐름 통과 | 최종 빌드 서버, 41개 AI 요청 전부 모의 |
| `node scripts/sample-report-static-audit.mjs` | 통과 | 기존 7장 샘플 정적 검사 유지 |
| `node scripts/sample-report-ui-audit.mjs` | 통과 | 기존 샘플 화면/PDF 유지 |
| `npm run test:tax-ui` | 통과 | 비교/개인 보고서 흐름 유지 |
| `npm run test:tax-extensions-ui` | 통과 | 주택/가업 보고서 유지 |
| `node scripts/estimate-report-ui-audit.mjs` | 통과 | 저장된 진단과 계산 보고서 연결 |
| `node scripts/ui-audit.mjs` | 통과 | 공통 상단/반응형/모바일 검사 유지 |
| `npm run test:smoke` | 통과 | 기존 종단 검사 유지 |
| `node scripts/pdf-audit.mjs` | 통과 | 실제 생성 PDF 검사 |
| `node scripts/paper-report-audit.mjs` | 통과 | 기존 52억 대화 및 7장 형식 검사 유지 |
| `git diff --check` | 통과 | CRLF 안내 외 공백 오류 없음 |
| `npm audit --json` | 취약점 0 | 추적된 package-lock 기준, 임의 업데이트 없음 |

로컬 최종 빌드/도메인 로그는 [검사 결과](phase2-tax-chat-evidence/local-checks.json), [대화](phase2-tax-chat-evidence/test-chat.log), [세금](phase2-tax-chat-evidence/test-tax.log), [빌드](phase2-tax-chat-evidence/build.log)에 있다. API 및 최종 대화 UI는 `http://127.0.0.1:4186`에서 **해당 소스로 빌드 후 새로 시작한 서버**를 검사했다.

전체 기존 UI 9개 스크립트의 로컬 실행은 `d4e0e2e` 빌드 기준으로도 통과했다([기록](phase2-tax-chat-evidence/local-full-ui-d4e0e2e.json)). 이후 최종 `24559a0`에서는 전체 목록을 CI에서 다시 실행했고, 로컬에서는 빌드/도메인/API/대화 UI를 다시 실행했다. 이전 로컬 전체 UI 결과를 최종 소스 전체 UI 결과로 대체하지 않는다.

최종 소스 CI:

- [PR 이벤트 전체 CI](https://github.com/khcho98-maker/asset-succession-frontend/actions/runs/34686532553): `validate`, `ui-audit` 모두 성공.
- [push 이벤트 전체 CI](https://github.com/khcho98-maker/asset-succession-frontend/actions/runs/34686530578): `validate`, `ui-audit` 모두 성공.
- [SHA와 단계별 CI 증빙](phase2-tax-chat-evidence/ci-source.json). PR 검사는 실제 base와의 PR 검사이며 push 검사는 소스 HEAD 검사다. 문서 추가 후 HEAD 검사는 PR Checks에서 별도로 확인한다.

기존 12개 독립 반례의 해결 기록은 취소하지 않았다. 채무/증여 저장 처리 핵심인 `lib/chat/intake.ts`와 기존 세금 엔진을 수정하지 않았고, R1 추가 3개 및 다중 대기 해소/취소/동일 재처리 시험을 포함한 기존 검사를 유지했다.

## 6. 화면과 Preview

검사한 정확한 소스 Preview:
[24559a0 Preview](https://frontend-prototype-m2vyqhd9r-khcho98-6477s-projects.vercel.app/precheck)

GitHub Deployment ID `6408258231`의 SHA가 `24559a0b0f3b4b9ffd1819d9fc99ea378bbbd36e`인 것을 확인했다. PR #13의 과거 Preview를 새 코드 검증에 사용하지 않았다.

- 실제 Preview `GET /api/diagnosis`: HTTP 200, `configured:false`, `FREE_TRIAL_NOT_ENABLED`, `MODEL_MISSING`, `GOOGLE_API_KEY_MISSING`.
- 세법 질문에 미연결 안내가 표시되고 새로고침 후 유지되는 것을 확인했다. 가짜 출처와 고객 확정 사실은 생성되지 않았다.
- 이후 가상 50억 사례를 직접 입력하고 계산 조건을 별도로 확인했다. 최종 확인 전 보고서 버튼 비활성, 확인 후 같은 입력의 개인 보고서 7장, 확인화면과 보고서 계산값 일치를 검사했다. 고정 샘플을 개인 보고서로 사용하지 않았다.
- 카카오 오픈채팅, 전화, 이메일 href를 실제 Preview DOM과 기존 코드에서 확인했다. 상담 전송/전화 연결/메일 발송은 하지 않았다.
- 이 Preview 검사에서 diagnosis POST는 0회다. 실제 AI 답변 또는 배포된 MCP 호출을 검증한 것으로 해석하면 안 된다.
- [Preview 결과](phase2-tax-chat-evidence/preview.json), [재실행 코드](phase2-tax-chat-evidence/preview-audit.mjs).

화면 증빙:

- [모의 출처 답변: 모바일 390px](phase2-tax-chat-evidence/mock-grounding-mobile.png)
- [모의 출처 답변: 데스크톱 1440px](phase2-tax-chat-evidence/mock-grounding-desktop.png)
- [실제 Preview: 미연결 질문 안내](phase2-tax-chat-evidence/preview-query-unconfigured.png)
- [실제 Preview: 확인한 입력의 개인 보고서](phase2-tax-chat-evidence/preview-personal-report.png)

모의 화면은 실제 AI 결과가 아니다. 혼합 입력 저장, 출처 복원, 요약, 계산 입력, 개인 보고서, 사실 수정 후 최종 확인 해제와 보고서 무효화를 [대화 UI 시험](phase2-tax-chat-evidence/chat-ui.json)으로 확인했다. 모바일은 Chromium viewport 모의 검사이며 실기기/실제 소프트키보드 검사는 하지 않았다.

## 7. 실패와 차단 구분

- 기존부터 실패한 기능 검사는 최종 실행 범위에서 발견하지 못했다. 성공을 위해 테스트를 삭제하거나 오류를 무시하지 않았다.
- 작업 중 새로 추가한 UI 시험은 React 저장 효과보다 먼저 값을 읽어 한 번 실패했다. 명시적으로 저장 값 갱신을 기다리도록 고쳐 재실행했다.
- Preview 임시 검사는 카카오 주소를 `pf.kakao.com`으로 잘못 가정해 실패했다([실패 기록](phase2-tax-chat-evidence/preview-initial-selector-failure.json)). 기존 `open.kakao.com/o/ss665WMi`를 확인하고 시험만 고쳤다. 애플리케이션 링크는 변경하지 않았다.
- 작업 중 unused 변수 lint 오류는 코드 수정 후 해결했다. Windows sandbox의 `spawn EPERM`은 승인된 실행 환경에서 재실행하여 해결했다. 기능 실패나 테스트 삭제로 처리하지 않았다.
- 초기 실제 MCP 사전답변 누락은 이번 어댑터의 미지원 유형 문제였고 재현 후 수정했다. 다른 문서 유형/도구는 아직 모두 지원하지 않는다.
- **실제 Google 호출: 미실행(0회).** 무료 사용 승인은 있었으나 사용할 수 있는 키/해당 Preview 설정 접근이 없었다. 모의 한도 초과와 실패 시험만 실행했다.
- **Vercel에서 실제 MCP: 미실행.** 도달 가능한 인증된 HTTPS 주소, 인증 방식/서버 자격증명, 필요시 법령 API의 호스트 승인 여부가 필요하다. 이 내용은 임의로 추정하지 않았다.
- **실모델 + 실제 MCP + Preview 전체 상담: 차단.** 기존 승인된 Google 무료 설정을 해당 Preview에 연결하고 기존 MCP 인증 경로를 제공한 후 별도 검증해야 한다. 비밀값은 대화/Git에 넣지 않는다.
- **실기기: 미실행.** 법률 설명의 정성적 타당성을 숫자/출처 ID 검사만으로 보증하지 않는다. 실제 모델 답변과 적용 시점 검토가 남아 있다.

## 8. 변경 파일과 보존

| 파일 | 변경 이유 |
| --- | --- |
| `lib/chat/tax-mcp.ts` | 실제 MCP 연결, 도구 호출 제한, 결과/출처 정규화, 인증/실패 처리 |
| `lib/chat/tax-grounding.ts` | 질문 분류, 비식별 검색, 날짜 처리, 근거 스키마/응답 검증 |
| `lib/chat/agent.ts` | 조회 자료를 기존 Google 설명 요청에 전달 |
| `lib/chat/fallback.ts` | MCP 우선 조회, 실패/한도 처리, 사실과 설명 분리 |
| `lib/chat/choices.ts` | 저장 가능한 출처 메타데이터 스키마 |
| `lib/chat/local.ts` | 혼합 질문의 명시적 사실만 원문으로 보존 |
| `components/DiagnosisChat.tsx` | 출처/실패 표시와 네트워크 전 사실 보존 연결 |
| `lib/chat/tax-grounding.test.ts` | 새 MCP/혼합 입력/오류/숫자/출처 회귀시험 |
| `scripts/run-chat-domain-tests.mjs` | 기존 테스트 실행에 새 회귀시험 연결 |
| `scripts/chat-ui-audit.mjs` | 출처 복원/확인 해제/개인 보고서 UI 시험 추가 |
| `scripts/tax-mcp-live-audit.mjs` | 실제 저장소 경로 및 SHA 기반 실조회 증빙 |
| `package.json`, `package-lock.json` | 기존 전이 의존성이던 `@ai-sdk/mcp` 2.0.45를 직접 의존성으로 명시 |
| `.env.example` | 값이 없는 서버 연결 설정 예시, 실제 키/운영 설정 변경 아님 |
| `.github/workflows/pr-ci.yml` | 후속 PR base와 push 브랜치 검사 포함, 기존 검사 보존 |
| `docs/tax-mcp-chat.md` | 실제 연결 조건과 지원 한계 설명 |
| 이 결과 보고서와 `phase2-tax-chat-evidence/` | SHA에 연결된 로그, 화면, 실패/차단 증빙 |

[소스 변경 목록과 PR 상태](phase2-tax-chat-evidence/source-manifest.json)를 보존했다. 공통 상단/로고/메뉴, 기존 카카오 버튼·상담 링크, 모바일/키보드 CSS, 샘플 7장·PDF·이미지, 세율/공제/계산식, Vercel Toolbar 설정, Google 모델/무료시험 기본값 및 운영 환경변수는 변경하지 않았다. 새 유료 전환, Upstage fallback, 결제, 회원가입, CRM, 운영 배포, 자동 병합도 하지 않았다.

**현재 판단: 구현 및 독립 검증은 제출 가능하나, 고객 사이트의 실제 근거 답변 활성화는 인증 연결과 실모델 검증 전까지 완료가 아니다.**
