# 자료실 수정 작업 — 2026-09-22

## 2026-09-23 사용자 요청: 자체 준비자료 6종 제거

- PLAN-01~06 카드, 작성 화면, 요약 생성, 메모리 초안 저장, 전용 콘텐츠·스타일을 제거했다.
- 자료실 배너·검색 결과·준비자료 숫자와 worksheet/toolkit/inline 필터 항목을 제거했다.
- 생전/사후 가이드의 노트 연결 및 조회 결과 기록 CTA를 제거했다. 공식 조회 18개의 기관 URL·신청자격·본인인증·준비서류·제약 안내는 유지했다.
- `/forms/planning` 및 PLAN-01~06 주소는 `/forms`로 307 이동한다. 유효하지 않은 PLAN ID는 404를 유지한다.
- 최신 기준 `44642e5565bd9f58b532b7ac61bb46f0b35fc577`의 문서 분리·미리보기 개선을 보존했다. 원본 manifest 177건·원본 파일·생성된 미리보기 자산은 수정하지 않았다.
- 실행 결과: `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:forms`, `npm run test:forms-routes` 모두 통과. 삭제 기능의 테스트는 제거하고 사전진단에서 자료실로 이동하는 개인정보·시점 검사를 유지했다.
- HTTP 검사에서 기존 주소 7개의 307/Location, 잘못된 ID의 404, 자료실·가이드의 노트 링크 제거, 공식 조회 18개의 안내와 원본 PDF 응답을 확인했다.
- 이번 제거 작업은 로컬 production build의 HTTP 검사까지 수행했다. 연결된 Vercel은 재인증이 필요한 403을 반환하여 새 Preview 배포·실제 화면 확인 완료로 표시하지 않는다.


## 2026-09-23 복구·개별 문서 보완

- 기존 HWP PrvImage 40개를 원본 SHA-256, 내장 스트림 SHA-256, PNG 픽셀로 검증.
- 38개는 기존 PNG를 그대로 연결. 상속세·증여세 합본 대표 2개는 정확한 원본 PDF 페이지로 개선.
- 원본 manifest 177개와 파일·기존 ZIP은 변경하지 않음. 별도 표시용 정의로 7개 다중서류 레코드를 17개 카드로 분리.
- 국세청 합본 PDF 3개에서 21개 서류(33쪽)를 재작성 없이 발췌. 기존 P5-02~05 및 P2-05 ID 재사용, 나머지는 안정된 부표 ID 추가.
- 총 표시 대상 200개 중 일반 목록 191개 / 보관 9개. 일반 목록은 실제 문서 미리보기 123개 / 제공처 안내 68개 / 준비 중 0개.
- 관련 서류는 별도 내부 링크로 연결하며 검색·필터는 개별 문서에만 적용. 형식만 다른 파일은 같은 카드 유지.
- 원본이 단일 HWP인 자료는 내장 첫 페이지 미리보기이며 전체 페이지 렌더링 완료로 간주하지 않음. 저해상도 이미지 확대 재작성 없음.
- 과거 103개 대표카드·177개 원자료 표시 기준을 개별 문서 기준으로 갱신. 원자료·바이너리 보존 검사 삭제 없음.
- Windows 긴 파일명은 원본 Git blob ID로 비교. 텍스트 줄바꿈 규칙을 고정하여 같은 내용의 CRLF/LF 차이로 증거 해시 검사가 실패하지 않도록 함.

검증 명령: 기존 test:forms + 새 forms-current-preview-tests.mjs 8개, generator fixture 15개,
실제 assets 검사 4개(40개 원본 이미지·전체 파일 해시·33쪽 텍스트 및 픽셀 일치), lint, build, typecheck, test:forms-routes.
실제 Preview 주소·배포 커밋·PC/모바일 검수 결과는 PR #9 배포 코멘트에 기록.

저장소: khcho9642-sketch/asset-succession-frontend
브랜치: codex/forms-preview-completion-20260922 / PR #9
묶음 해제 작업의 기준 커밋: 545d6ac83b0e467f568f59b7166f6bae30a64e3b

## 최신 요청: 묶음자료를 풀어서 표시한다

이 요청은 이전의 '묶음 안에서 미리볼 자료를 선택'하는 구현을 대체한다.
서류 레코드 하나당 카드 하나를 표시한다. 같은 서류의 PDF/HWP 등 파일 형식은 해당 카드 안에 유지한다.

### 반영한 코드

- [x] buildIndividualCatalog 추가. standalone/within_parent 모두 개별 카드로 표시하고 archived만 기존 보관 영역에 유지.
- [x] 묶음 대표 카드, '자료 n개 선택', 구성 자료 펼치기와 묶음 미리보기 선택기를 제거.
- [x] 부표·작성사례·참고자료도 자신의 제목, 미리보기, 파일 링크로 독립 표시.
- [x] 검색·단계·복수 필터를 각 자료에 적용. 묶음 이름이나 다른 구성원의 일치로 검색 결과가 섞이지 않음.
- [x] 검색 결과 숫자와 미리보기 현황을 개별 자료 기준으로 표시.
- [x] 예전 묶음 URL은 개별 자료 링크 안내로 유지. 새 목록에서 묶음 카드를 만들지 않음.
- [x] 기존 74개 ZIP 다운로드는 하단 보조 링크로 이동. ZIP 내용이나 원본 파일을 바꾸지 않음.
- [x] DocumentPreview.tsx의 미등록 ESLint 규칙 비활성화 주석 제거. 사용하지 않는 GroupDocumentPreview 제거.
- [x] manifest, 원자료, 관계 메타데이터, 가이드, 계산 로직, package/lock, workflow, 운영 설정은 변경하지 않음.

### 이번 작업에서 실제 실행한 검증

- [x] 격리된 로컬 환경에서 묶음 해제 테스트 21개 통과. 로그: unbundle-tests.txt.
- [x] 기존 catalog.ts와 새 individual-catalog.ts의 strict TypeScript 검사 통과.
- [x] 수정한 FormsLibrary.tsx와 DocumentPreview.tsx의 TypeScript/JSX 구문 검사 통과.
- [x] 로컬 검증에 사용한 catalog.ts의 Git blob SHA가 저장소의 58c430ed95d3b6903924168a928d1c71936c4629와 일치함을 확인.
- [x] 테스트용 177개 레코드가 각각 한 번 표시되는지 확인. 실제 177개 자료 전수 검수와 다름.

### 실행하지 못했거나 남아 있는 검증

- [ ] 실제 manifest를 이용한 통합 검사. 테스트 스크립트는 저장소 데이터가 있을 때 이 검사를 추가 실행한다.
- [ ] 전체 npm ci / lint / typecheck / 회귀 테스트 / production build.
- [ ] 실제 배포에서 개별 카드 수, PC·모바일 배치, 클릭·스크롤·이미지·다운로드 확인.
- [ ] 이전 PR에서 남은 전체 미리보기 자산 생성·검수 및 coverage pending=0 확인.
- [ ] 새 Preview 배포와 배포 커밋 일치 확인.

현재 환경에서는 GitHub 직접 clone이 DNS 오류로 실패했고, 연결된 Vercel web_fetch_vercel_url도 대상 배포에 403 Forbidden을 반환했다. 따라서 실제 화면을 보았거나 배포를 완료했다고 보고하지 않는다.

## 실행 명령

```sh
node scripts/forms-individual-catalog-tests.mjs
npx tsc --strict --noEmit --target ES2020 --module commonjs --lib ES2023,DOM lib/forms/catalog.ts lib/forms/individual-catalog.ts
npm run lint
npm run typecheck
npm run test:forms
npm run test:forms-integration
npm run build
```

이전 미리보기 테스트 기록(policy-tests.txt, generator-tests.txt)과 생성 도구는 유지했다. 이번 작업에서는 그 테스트를 다시 실행하지 않았다.
묶음 해제 코드 반영은 전체 미리보기 생성·실제 화면 검수 완료를 뜻하지 않는다.
