# 자료실 수정 작업 — 2026-09-22

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
