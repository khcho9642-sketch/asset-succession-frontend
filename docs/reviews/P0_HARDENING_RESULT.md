# P0 Hardening Result

Date: 2026-09-11

Base branch: `codex/chat-opening-topics`
Base commit: `1b465526cdce8b5edd8742d8ab98b79a8a9cedb7`
Work branch: `codex/phase1-hardening`

## Scope

This pass only addressed:

- preserving separate debt and past-gift facts from chat intake through saved assessment, normalization, summaries, and tax draft creation;
- replacing overclaiming "36 candidates completed" labels with input-linked candidate status;
- ensuring PR CI runs for the actual target branch and this work branch.

The common header, logo/menu, Kakao/expert consultation links, mobile chat layout work, sample report assets/PDFs, Vercel Toolbar setting, tax rates/deductions/formulas, AI model settings, keys, billing, and deployment settings were not changed.

## Reproduction And Fixes

1. Debt and past-gift preservation

- Reproduced on the latest code by inspection: `applyChatPatches` only merged asset fields, so later debt/past-gift turns could replace earlier ones.
- Added source-preserving merge/correction handling for `debt` and `pastGifts`.
- Added item identity handling so "bank loan" corrections replace only that debt while lease deposits remain.
- Kept duplicate replay from adding another copy of the same message/evidence.
- Kept unknown/unclear answers from becoming zero.
- Updated the confirmed assessment adapter to emit separate debt choices/amounts and past-gift item facts.
- Updated normalization to keep multiple past gifts with recipient, date, amount, and status.
- Updated chat tax draft seeding to total current confirmed debt items, not prior and corrected amounts together.

2. "36 analyses complete" label

- Reproduced on latest code by inspection: result page displayed static "36 candidate analysis complete", and engine set `evaluated_candidate_count` to the library count.
- Kept the 36-item library count internal/available.
- Added `reviewable_candidate_count` and `needs_information_count` from actual scenario evaluation state.
- Replaced user-facing "completed" copy with "candidate library" and "reviewable candidates / additional information needed" copy.
- Did not invent missing calculations or force all 36 candidates into a calculated state.

3. Automated checks

- `.github/workflows/pr-ci.yml` now includes PRs targeting `codex/chat-opening-topics`.
- Push checks now include `codex/phase1-hardening`.
- Added/updated regression tests for debt correction, duplicate prevention, past-gift preservation, and 36-candidate display semantics.
- Updated existing UI audit locators to match the current accessible UI labels and the approved v5 sample manifest without changing sample assets.

## Changed Files

- `.github/workflows/pr-ci.yml`: include actual PR target and work branch.
- `lib/chat/intake.ts`: merge/correct/delete handling for appendable facts.
- `lib/chat/report.ts`: preserve separate debt and past-gift facts in confirmed assessment snapshots.
- `lib/chat/tax.ts`: seed tax drafts from current confirmed debt items.
- `lib/phase2b/normalize.ts`: normalize multiple past-gift items.
- `lib/phase2b/engine.ts`, `lib/phase2b/types.ts`: expose actual reviewable/needs-info counts.
- `app/precheck/result/page.tsx`, `app/phase-2b/page.tsx`, `components/ScenarioPlanPanel.tsx`: replace overclaiming 36-complete labels.
- `scripts/*audit*`, `scripts/*tests*`: add regressions and keep audits aligned with current UI/sample v5.

## Verification

Local unit/static checks:

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test:phase2b`: passed, 28 tests.
- `npm run test:chat`: passed, 87 tests.
- `npm run test:tax`: passed, 83 tests.
- `npm run build`: passed after rerun outside sandbox; sandbox run failed at Next TypeScript spawn with `spawn EPERM`.

Local production server:

- Server: `npm start -- --hostname 127.0.0.1 --port 4173`
- URL: `http://127.0.0.1:4173`
- This was the server built from the modified local source, not an existing Preview URL.

Local UI and report checks against the production server:

- `npm run test:chat-api`: passed; provider was not invoked.
- `npm run test:chat-ui`: passed, 13 flows, AI requests mocked.
- `npm run test:tax-ui`: passed, 13 flows across 4 tax tracks at 390px and 1440px, 4 seven-page PDFs.
- `npm run test:tax-extensions-ui`: passed, 16 checks for housing and business inheritance at 390px and 1440px, 4 seven-page PDFs.
- `node scripts/sample-report-static-audit.mjs`: passed.
- `node scripts/sample-report-ui-audit.mjs`: passed; artifacts in `.tmp/sample-report-audit`.
- `node scripts/estimate-report-ui-audit.mjs`: passed.
- `npm run test:smoke`: passed.
- `node scripts/ui-audit.mjs`: passed for 10 routes plus hybrid flow across 2 viewports.
- `node scripts/pdf-audit.mjs`: passed; generated local review assets under `docs/review-assets/pr-2`.
- `node scripts/paper-report-audit.mjs`: passed.

Baseline/environment notes:

- Before installing dependencies, tests failed because `typescript` was not installed.
- Sandboxed Node test/build commands hit `spawn EPERM`; the same checks were rerun with approved execution.
- Local Node was `v24.14.0` while the project declares `22.x`; npm emitted engine warnings.
- Temporary `npm install --no-save playwright@1.55.0` reported one high-severity audit item in temporary test tooling. No package manifest or lockfile change was made.

CI:

- GitHub Actions observed on Draft PR #13.
- `validate`: passed in both observed runs.
- `ui-audit`: passed in both observed runs.

Preview:

- Vercel deployment check passed for `https://vercel.com/khcho98-6477s-projects/frontend-prototype/H3Vo5ggBbxVSpcuPHF2bK3vGFKyx`.
- Vercel Preview Comments check passed.
- The deployed Preview URL was not manually opened or re-audited; full browser audits were run against the local production server built from this source.

Real model:

- Not verified. All AI-dependent flows used mocked/local responses; no external AI call was used.

Real device:

- Not verified. Browser audits covered desktop/mobile viewport sizes in Playwright, not a physical device.

## Screens And Logs

Observed locally:

- Chat review/report flow screenshots were generated by `npm run test:chat-ui` under `artifacts/ui-audit` when `UI_AUDIT_DIR` was not set.
- Sample report screenshots and downloaded/printed PDFs were generated under `.tmp/sample-report-audit`.
- A4 report assets were generated under `docs/review-assets/pr-2`.
- Console logs showed all listed local checks passing except the explicitly noted baseline/environment failures.

## Remaining Items

- GitHub Actions result and any Preview deployment result remain to be checked after pushing the Draft PR.
- Physical mobile device testing was not performed.
- Real AI-provider behavior was not tested by design; mock/local responses were used to avoid customer data, keys, billing, or external model calls.

## PR #13 Independent Review Follow-Up

Date: 2026-09-11

Review attachment status:

- `PR13_INDEPENDENT_REVIEW.md` and separate reproduction code were not found in the repository or the parent workspace by filename search.
- The six counterexample themes described in the follow-up request were reproduced directly in regression tests before changing the source.

Before-fix reproduction on PR #13 commit `7211173b013429e8f1487b0aa3df024f7bb45590` plus the new regression assertions:

- Basic 4 preservation cases still passed.
- Failing counterexamples reproduced:
  - an ambiguous "은행 대출은 1억5천만원으로 정정" changed the first bank-loan item instead of requiring target confirmation;
  - `1.5억원` and `15억원` compared as the same value because duplicate normalization removed decimal points;
  - a same-year past-gift correction without a recipient was stored as a current fact instead of a pending confirmation;
  - `전체 채무:` replacement could be skipped when the retained amount matched a previous item;
  - deletion of the final debt item could leave the delete command as the current debt fact;
  - correction/deletion/replacement intent could be lost when the value looked equal to an existing item.

Follow-up fix:

- Added current-source and pending-source helpers in chat intake state.
- Kept same-message/evidence replay protection, but stopped using decimal-stripping value comparison as a blanket rule for debt/gift operations.
- Added bank-name and ordinal matching for debt correction targets.
- Kept same-year gift correction target matching by recipient and year; ambiguous same-year corrections become pending confirmation, not current facts.
- On unambiguous correction or deletion, pending confirmations for that fact key are cleared by the new specific user statement.
- When deleting the final active item, the current fact key is removed instead of storing the deletion command as current data.
- Confirmed assessment snapshots now put active facts in `conversation.confirmed_facts` and unresolved corrections/deletions in `conversation.pending_candidates`.
- Debt summaries, normalized debts, and tax input seeding withhold debt amounts while a pending debt correction exists.

After-fix local verification against the modified source:

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test:phase2b`: passed, 28 tests.
- `npm run test:chat`: passed, 90 tests.
- `npm run test:tax`: passed, 84 tests.
- `npm run build`: passed.
- Production server: `npm start -- --hostname 127.0.0.1 --port 4173`.
- `npm run test:chat-api`: passed against `http://127.0.0.1:4173`; provider was not invoked.
- `npm run test:chat-ui`: passed, 13 flows, AI requests mocked.
- `npm run test:tax-ui`: passed, 13 flows across 4 tax tracks at 390px and 1440px, 4 seven-page PDFs.
- `npm run test:tax-extensions-ui`: passed, 16 checks for housing and business inheritance at 390px and 1440px, 4 seven-page PDFs.
- `node scripts/sample-report-static-audit.mjs`: passed.
- `node scripts/sample-report-ui-audit.mjs`: passed.
- `node scripts/estimate-report-ui-audit.mjs`: passed, personal report upgrade flow verified without provider calls.
- `node scripts/ui-audit.mjs`: passed for 10 routes plus hybrid flow across 2 viewports.
- `node scripts/pdf-audit.mjs`: passed.
- `node scripts/paper-report-audit.mjs`: passed.
- `npm run test:smoke`: first parallel run failed once on `/precheck` mobile content while multiple browser audits were running; immediate standalone rerun against the same server passed all 10 routes and required flows.

Local/browser/preview/model/device split:

- Local and browser automation were verified against the local production server built from the modified source.
- CI and Preview checks must be read again after pushing the follow-up commit.
- No real AI model call was made.
- No physical device test was performed.

This hardening pass does not mean the whole service is complete; it only closes the requested Phase 1 issues and the PR #13 follow-up counterexamples above.
