# 미리보기 일관성 수정 — 2026-09-22

대상: `khcho9642-sketch/asset-succession-frontend`
기준: `64eb307f62d1bd2a5925cfd8ef0ab66bb724b6fb`
작업 브랜치: `codex/forms-preview-completion-20260922`

## 구현

- [x] 이미지, 실제 PDF, 제공처 안내, 미리보기 준비 중을 같은 정책으로 구분한다.
- [x] 작은 썸네일이 아니라 원본 크기 이미지를 상세에 사용한다.
- [x] 원본 크기/화면 맞춤, 실제 PDF 전체 보기, 새 창 보기를 제공한다.
- [x] 묶음 자료에도 개별 자료 선택과 같은 미리보기 컴포넌트를 제공한다.
- [x] 이미지 오류와 PDF 확인 실패 때 빈 영역 대신 오류·원본 경로를 표시한다.
- [x] 현재 필터와 일치하는 고유 원자료 기준으로 미리보기 지원 현황을 표시한다.
- [x] 기존 생성 명령의 74개 고정을 제거한다. 별도 생성기로 현재 manifest 전체를 처리한다.
- [x] 원본 manifest, 공식 다운로드, 기존 ZIP은 변경하지 않는다. 새 렌더링 결과는 별도 인덱스로 합친다.
- [x] 새 미리보기의 원본·PNG·썸네일·PDF 해시를 검증하고 연결이 틀리면 빌드를 중단한다.
- [x] 누락·변환 실패가 하나라도 있으면 검사 명령이 실패한다. 제공처 안내와 미완료를 혼동하지 않는다.

## 현재 실행한 검증

- [x] 미리보기 정책 테스트 19개 통과.
- [x] 실제 테스트용 PDF/PNG를 사용하는 생성기 테스트 15개 통과.
- [x] 테스트용 75개 자료 전체 처리 확인. 수량을 74로 고정하지 않는다.
- [x] 손상된 PDF, 변경된 원본, 손상된 썸네일, 중복 ID, 잘못된 경로에서 실패 확인.
- [x] 테스트에서 원본 PDF와 manifest의 바이트 보존 확인.
- [x] `preview.ts` 단독 strict TypeScript 검사 통과.
- [x] 변경된 TypeScript/TSX 소스 구문 검사 통과.
- [x] 수정 전 FormsLibrary.tsx가 기준 Git blob `cbd771e06765bb9b1f8e05f7c81c3400f66b5c24`와 일치함을 확인하고 제한된 변경만 적용.

## 아직 완료로 표시하지 않는 항목

- [ ] 실제 저장소의 모든 원본으로 생성기를 실행하고 `coverage.json`의 pending=0 확인.
- [ ] 새로 생성한 PNG/PDF/preview-index.json의 실물 검수와 커밋.
- [ ] 저장소 전체 npm ci / lint / typecheck / production build.
- [ ] 이 브랜치의 실제 빌드에서 PC 1440px·모바일 390px 및 전체 문서 브라우저 검사.
- [ ] 배포 URL의 커밋 일치 확인. 예전 고정 Preview URL이 갱신됐다고 보고하지 않는다.

현재 검증은 격리된 로컬 테스트 기준이다. 실제 177개 자료의 미리보기가 모두 생성·검수됐다는 의미가 아니다.
자동검사 workflow 설정은 변경하지 않았다. 메인 브랜치, 운영 설정, 세금 계산 로직은 변경하지 않는다.

## 실행 명령

```sh
node scripts/forms-preview-policy-tests.mjs
python scripts/forms-preview-generator-tests.py
python scripts/forms-generate-official-previews.py
python scripts/forms-generate-official-previews.py --check
npm run lint
npm run typecheck
npm run test:forms
npm run test:forms-integration
npm run build
# 이 빌드로 서버를 실행한 다음 (Playwright + Chromium 필요):
BASE_URL=http://127.0.0.1:3000 node scripts/forms-preview-completion-audit.mjs
```

변환 의존성: Pillow, Poppler(`pdftoppm`, `pdfinfo`), HWP·Office 변환에 LibreOffice.
새 결과물: `public/downloads/official-forms/previews-completed/`, `preview-index.json`.
검사 기록: `docs/forms-preview-completion/coverage.json`.
생성기는 외부 사이트에 접속하거나 원본을 새로 수집하지 않는다. 저장소에 이미 있는 실제 파일만 변환한다.
