# Issue #9 implementation verification

Status: LOCAL_GATES_PASSED_PENDING_REMOTE_CI_AND_PREVIEW_METADATA

Branch: `docs/codex-integrated-implementation-directive`

Implemented scope:

- Phase 2B calculation/scenario foundation from PR #8 merged into the #9 branch.
- Hybrid precheck flow with top-level planning purpose, button choices, free-text candidate extraction, and explicit user confirmation.
- Session-only assessment handoff from precheck to result, report, and consultation.
- Supported narrow inheritance/gift tax calculation from a confirmed taxable base using the Inheritance and Gift Tax Act Article 26 rate schedule; gift tax follows Article 56.
- Seven-page Report V2 screen/PDF layout.
- UI, smoke, and PDF audits updated for the new #9 flow.
- Follow-up review hardening: conservative fact extraction, asset-money binding, range-money preservation, individual candidate confirmation/exclusion, draft reload recovery, confirmed taxable-base end-to-end calculation, denser seven-page report, and defect-focused regression tests.
- Internal 36-scenario candidate library summary: the full candidate library is evaluated internally, while customer screens and PDF expose only the baseline, up to three recommended scenarios, up to two additional review items, and one liquidity-support item.
- Final chat stage: before report generation the user can add more facts, ask a question, or click `맞춤 보고서 만들기`; the forbidden `분석 시작` label is not used.
- Parent-child loan handling: family loans are not treated as secured debt, and repayment capacity, actual interest/principal payment, estate receivable treatment, waiver risk, and first/second-child allocation differences are surfaced.
- Visual sections share the scenario data model across screen and PDF: asset composition, baseline-vs-recommendation comparison, tax-payment resources/funding gap, and gift/loan/inheritance timeline.

Verification commands:

```text
npm run lint
npm run typecheck
npm run test:phase2b
npm run build
BASE_URL=http://127.0.0.1:4173 UI_AUDIT_DIR=.tmp/issue-9-final-ui-audit-v2 node scripts/ui-audit.mjs
PR2_BASE_URL=http://127.0.0.1:4173 npm run test:smoke
BASE_URL=http://127.0.0.1:4173 PDF_AUDIT_DIR=.tmp/issue-9-final-pdf-audit-v3 node scripts/pdf-audit.mjs
```

Observed local results:

- lint: passed
- typecheck: passed
- phase2b unit tests: passed, 28 tests
- build: passed
- UI audit: passed for 8 routes plus hybrid flow across desktop 1440px and mobile 390px
- smoke audit: passed
- PDF audit: passed, actual A4 PDF page count 7, each report page rendered to PNG, required DOM text and content density checked
- Manual visual QA: desktop/mobile result screenshots inspected; A4 PDF pages 1-7 rendered as PNG and checked for clipping, overlap, blank pages, internal IDs, and 36-candidate full-list exposure.

Review artifacts from this follow-up:

- Source-controlled latest screenshots/PDF are in `docs/review-assets/issue-9/`.
- Local regenerated evidence directories were `.tmp/issue-9-final-ui-audit-v2` and `.tmp/issue-9-final-pdf-audit-v3`.
- Evidence uses synthetic 50억원 family data only; no real customer name, address, resident registration number, secret key, database, raw data, or MCP config is included.
