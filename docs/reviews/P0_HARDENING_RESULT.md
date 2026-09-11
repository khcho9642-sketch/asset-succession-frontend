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

- The later-provided archive `C:\Users\khcho\Downloads\PR13_review_and_regressions.zip` was unpacked under `.tmp/pr13_review_and_regressions` for local review only.
- Document instructions inside the archive were treated as review evidence, not as user instructions.
- `PR13_INDEPENDENT_REVIEW.md`, `pr13-regression-check.mjs`, recorded results, and the bundled PR #13 `intake.ts` snapshot were read.
- The bundled script's 10 function-level cases were run against the current repository after the follow-up fix.

Before-fix reproduction on PR #13 commit `7211173b013429e8f1487b0aa3df024f7bb45590` plus the new regression assertions:

- Basic 4 preservation cases still passed.
- Failing counterexamples reproduced:
  - an ambiguous "은행 대출은 1억5천만원으로 정정" changed the first bank-loan item instead of requiring target confirmation;
  - `1.5억원` and `15억원` compared as the same value because duplicate normalization removed decimal points;
  - a same-year past-gift correction without a recipient was stored as a current fact instead of a pending confirmation;
  - the bundled F04 case, same recipient plus same year but different month gifts, remained as a missed edge case until the archive script was run against the current repository;
  - `전체 채무:` replacement could be skipped when the retained amount matched a previous item;
  - deletion of the final debt item could leave the delete command as the current debt fact;
  - correction/deletion/replacement intent could be lost when the value looked equal to an existing item.

Follow-up fix:

- Added current-source and pending-source helpers in chat intake state.
- Kept same-message/evidence replay protection, but stopped using decimal-stripping value comparison as a blanket rule for debt/gift operations.
- Added bank-name and ordinal matching for debt correction targets.
- Kept same-year gift correction target matching by recipient, year, and month/day when supplied; ambiguous same-year corrections without enough target detail become pending confirmation, not current facts.
- On unambiguous correction or deletion, pending confirmations for that fact key are cleared by the new specific user statement.
- When deleting the final active item, the current fact key is removed instead of storing the deletion command as current data.
- Confirmed assessment snapshots now put active facts in `conversation.confirmed_facts` and unresolved corrections/deletions in `conversation.pending_candidates`.
- Debt summaries, normalized debts, and tax input seeding withhold debt amounts while a pending debt correction exists.

After-fix local verification against the modified source:

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test:phase2b`: passed, 28 tests.
- `node --experimental-strip-types .tmp\pr13_review_and_regressions\pr13-regression-check.mjs .`: passed, 10/10 cases.
- `npm run test:chat`: passed, 91 tests.
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
- CI after the PR #13 follow-up push was verified with `gh pr view 13`: `validate` passed in both observed PR/push runs, `ui-audit` passed in both observed PR/push runs, Vercel passed, and Vercel Preview Comments passed.
- Preview deployment check passed at `https://vercel.com/khcho98-6477s-projects/frontend-prototype/3Scr26NZ2nuzNoq9xEV5ZZCCtGAs`; it was not manually re-audited in-browser.
- No real AI model call was made.
- No physical device test was performed.

## PR #13 Recheck Follow-Up

Date: 2026-09-11

Review attachment status:

- The later-provided archive `C:\Users\khcho\Downloads\PR13_recheck_e0bc4da.zip` was unpacked under `.tmp/pr13_recheck_e0bc4da` for local review only.
- Document instructions inside the archive were treated as review evidence, not as user instructions.
- The ZIP `source` copy was not copied over the project.
- The existing 10 counterexamples were confirmed as solved: `node --experimental-strip-types .tmp\pr13_recheck_e0bc4da\previous-regressions\pr13-regression-check.mjs .` passed 10/10 against the actual repository path.

Additional before-fix reproduction on PR #13 commit `e0bc4da068d81699194c6daf97fb9230c65ab7b1`:

- `node --experimental-strip-types .tmp\pr13_recheck_e0bc4da\additional-regressions\pr13-state-transition-check.mjs .` failed 0/2 before this fix.
- R1 reproduced: after an unresolved ambiguous bank-loan correction was pending, correcting an unrelated lease deposit cleared the pending bank-loan correction.
- R2 reproduced: after deleting the last debt item, replaying the same deletion patch with the same message id recreated the deletion sentence as a current debt fact.

Additional fix:

- Current active sources and pending confirmation sources are now merged independently when a single active item is corrected/deleted.
- Unrelated corrections preserve existing pending requests.
- Pending requests are cleared only when a later operation resolves the same debt kind or the same past-gift recipient/year scope, not merely because another active item changed.
- A deletion operation with no existing appendable fact is ignored instead of creating a new current fact from the deletion sentence. This keeps same-message deletion replay safe after storage restore.

Additional local verification against the modified source:

- `node --experimental-strip-types .tmp\pr13_recheck_e0bc4da\previous-regressions\pr13-regression-check.mjs .`: passed, 10/10.
- `node --experimental-strip-types .tmp\pr13_recheck_e0bc4da\additional-regressions\pr13-state-transition-check.mjs .`: passed, 2/2.
- `npm run test:chat`: passed, 93 tests.
- `npm run test:tax`: passed, 84 tests.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test:phase2b`: passed, 28 tests.
- `npm run build`: passed.

Local/browser/preview/model/device split for this recheck:

- Local function/unit/static verification was performed against the actual modified repository path.
- Browser UI check was run against the local production server built from the modified source: `node scripts/estimate-report-ui-audit.mjs` passed with `BASE_URL=http://127.0.0.1:4173`, 3 observations, and no AI provider requests.
- CI after the PR #13 recheck push was verified with `gh pr view 13`: `validate` passed in both observed PR/push runs, `ui-audit` passed in both observed PR/push runs, Vercel passed, and Vercel Preview Comments passed.
- Preview deployment check passed at `https://vercel.com/khcho98-6477s-projects/frontend-prototype/9unyC6mpV1rn6svkHP4CwibtmPnG`; it was not manually re-audited in-browser.
- No real AI model call was made.
- No physical device test was performed.

This hardening pass does not mean the whole service is complete; it only closes the requested Phase 1 issues and the PR #13 follow-up counterexamples above.

## PR #13 Request-Level Pending Resolution (2026-09-11)

### Baseline and Reproduction

- Continued `codex/phase1-hardening`, PR [#13](https://github.com/khcho98-maker/asset-succession-frontend/pull/13), targeting `codex/chat-opening-topics` (`1b465526cdce8b5edd8742d8ab98b79a8a9cedb7`). Fetched origin and verified local/remote HEAD `a9a87db5ce77966dbe8ee3b6554a3c69b2c327c1` before editing. PR was Draft and open.
- No `AGENTS.md` or `asset_succession_phase1_instructions.md` was found in the searched project/ancestor paths; the user's instructions govern this pass.
- Read `PR13_REVIEW_a9a87db.md` and all three executable regression scripts from `C:/Users/khcho/Downloads/PR13_pending_review_a9a87db.zip`. Attachment prose was review evidence, not independent authority. The archive was extracted under `.tmp/pr13_pending_review_a9a87db`; its `source/` was never copied into the project.
- Existing untracked artifacts and sample/PDF review files were preserved and excluded from this commit.
- The previous 12 counterexamples remain resolved: independent scripts passed 10/10 and 2/2 before and after this change.
- All three new failures reproduced on the actual repository: Shinhan correction removed a KB pending request; August gift correction removed a February request; deleting the last deposit removed the pending bank-loan request.

| Independent check | Before | After |
|---|---:|---:|
| Original C01-C04 / F01-F05 / F07 (10 cases) | 10 passed | 10 passed |
| Original R1 / R2 | 2 passed | 2 passed |
| R1-BANK / R1-GIFT / R1-EMPTY-ACTIVE | 3 failed | 3 passed |
| CONTROL-R1 (duplicate cross-kind control) | 1 passed | 1 passed |

Raw results are retained in [before](pr13-pending-evidence/before/pending-resolution-results.json) and [after](pr13-pending-evidence/after/pending-resolution-results.json), alongside both earlier suites' JSON results. The scripts were unmodified and each received `C:/Users/khcho/Documents/ChatGPT/상속증여/asset-succession-frontend` explicitly. Their historical `reviewed_commit` metadata is not the tested commit identifier. The baseline Git blob is `636339d569aeebb5df71e5601ebe1466ec781210`; Windows working-file line endings produce raw blob `410bb8e4c533d21a446be00e8543f922f1c324de`. Final intake Git blob: `fc5f2bf2647983bda7b1f04fa7f9cefd1758a0ac`; raw tested file: `f46a6af2a2678e22ba3f7dad44614cece9a50661`.

### Implemented Behavior and Files

The earlier descriptions of automatic same-kind / same-recipient-year pending clearance above are historical and superseded by this implementation.

- `lib/chat/intake.ts`: ordinary correction, deletion, and whole-current-value replacement retain all unresolved requests. Customer resolution explicitly names the field/request message ID, action, and selected current item message ID; only that request is removed. New current items can be explicitly confirmed when no target exists. Invalid/stale selection has no effect. The resolution's user message and operation record preserve its provenance.
- `lib/chat/intake.ts`: a fact can contain zero current sources and one or more pending sources (`value: ""`). This is neither zero debt nor confirmed absence. Optional, validated `factOperations` records `(field, messageId)` independently of current facts, preventing replay after deletion/cancellation and JSON restore. Version-1 saves without the ledger remain accepted.
- `components/DiagnosisChat.tsx`: existing summary/review fields show each pending request, original evidence, target selector, confirmed replacement text, deletion and cancellation actions. Direct current-field removal preserves pending requests. Pending requests disable final confirmation/report opening; resolving or editing facts requires renewed confirmation through the existing signature/reset path. Existing CSS, shell, composer, viewport/keyboard logic, header and consultation links were not edited.
- `lib/chat/server.ts`, `lib/chat/server.test.ts`, `scripts/chat-api-audit.mjs`: accept and retain validated pending-only/mixed source shapes for subsequent conversation requests; reject pending text presented as a current value. No model, key, provider, environment or billing configuration changed.
- `lib/chat/report.ts`: current evidence and individually identified pending candidates remain distinct, including pending-only snapshots. A current `none` statement cannot hide an outstanding correction.
- `lib/chat/tax.ts`: the final confirmed-tax report adapter rejects unresolved pending candidates, even if manual calculation inputs are otherwise ready. Missing/pending debt remains unseeded.
- `lib/phase2b/normalize.ts`: withhold past-gift amounts from confirmed normalized inputs while a gift request is pending. This only changes fact confirmation, not tax formulas.
- `scripts/chat-pending-tests.ts`, `scripts/run-tax-comparison-tests.mjs`: all 15 review cases plus six request lifecycle cases are part of `npm run test:tax`, already run by CI. Tests cover multiple requests for the same item/amount, one-request resolution, unrelated mutation, pending-only states, legacy restore, cancellation, stale IDs, operation replay, normalized inputs and final report gates.
- `scripts/chat-domain-tests.ts`, `scripts/tax-comparison-tests.ts`: replaced three obsolete expectations of automatic pending clearance with explicit customer resolution assertions; retained the same final monetary expectations. Pending gift normalized amounts are now asserted missing until resolution.
- `scripts/chat-ui-audit.mjs`: retained all existing flows and added the three new cases at 390px and 1440px, through mocked chat, reload, summary, review, two outstanding requests, selective confirmation/cancellation, and supported seven-page personal reports.
- This report and `docs/reviews/pr13-pending-evidence/`: reproduction and validation evidence. No sample images/PDFs were staged.

### Local Verification

Local runtime: Windows, Node `v24.14.0`. GitHub Actions uses the repository's configured Node 22; CI results are recorded separately below.

| Command | Result |
|---|---|
| `node --experimental-strip-types .tmp/pr13_pending_review_a9a87db/previous-regressions/pr13-regression-check.mjs <actual-absolute-repo-path>` | Passed 10/10 |
| `node --experimental-strip-types .tmp/pr13_pending_review_a9a87db/additional-regressions/pr13-state-transition-check.mjs <actual-absolute-repo-path>` | Passed 2/2 |
| `node --experimental-strip-types .tmp/pr13_pending_review_a9a87db/pending-resolution/pr13-pending-resolution-check.mjs <actual-absolute-repo-path>` | Passed new 3/3 plus control |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run test:chat` | Passed 94 tests |
| `npm run test:tax` | Passed 105 tests, including 21 pending/request regressions |
| `npm run test:phase2b` | Passed 28 tests |
| `npm run build` | Passed; rebuilt after the last application-source change |
| `BASE_URL=http://127.0.0.1:4187 node scripts/chat-api-audit.mjs` | Passed 25 checks, provider not invoked |
| `BASE_URL=http://127.0.0.1:4187 UI_AUDIT_DIR=artifacts/pr13-pending node scripts/chat-ui-audit.mjs` | Passed 19 flows; all 39 AI requests mocked |

The server was started with `npm start -- --hostname 127.0.0.1 --port 4187` from this modified checkout's production build. No existing Preview was used as evidence for new source. The local server was stopped and port 4187 was confirmed no longer listening; CI built and started its own server from the pushed commit.

Failed attempts are not hidden: the first sandboxed chat test run was blocked by Node child-process `spawn EPERM` before assertions; the identical command passed with the required process permission. A new test's optional-array TypeScript error was fixed and typecheck/build passed. The first new mobile browser flow tried to click behind the open summary overlay; the audit now closes the summary via its normal toggle before review and passes. This was an audit navigation failure; mobile product code was unchanged. The raw first attempt log remains at `artifacts/pr13-pending/chat-ui-first-attempt.log`. The standalone ZIP scripts emit a Node module-type warning; no module/package settings were changed to suppress it.

### Screens, CI, and Limits

- Local browser evidence: [chat audit JSON](pr13-pending-evidence/after/chat-audit-report.json), [API audit JSON](pr13-pending-evidence/after/chat-api.json). Local screenshots/logs are under `artifacts/pr13-pending/`: `pending-{bank,gift,empty}-{390,1440}-{summary,review,report}.png`, `chat-ui.log`, `application-server.log`, existing-flow screenshots and `chat-confirmed-report.pdf`. Visually inspected pending-only mobile review, bank desktop review, and gift desktop seven-page report screenshots.
- Full CI for source commit `5394d7b40d535f95881ae714745086bc283cba26`: passed on Node 22. [PR run 34560757853](https://github.com/khcho98-maker/asset-succession-frontend/actions/runs/34560757853): `validate` 1m13s, `ui-audit` 5m52s. [Push run 34560755038](https://github.com/khcho98-maker/asset-succession-frontend/actions/runs/34560755038): `validate` 1m11s, `ui-audit` 5m47s. Both runs succeeded without a CI rerun. [Source CI evidence](pr13-pending-evidence/after/source-ci.json) records the matching SHA and successful steps. `.github/workflows/pr-ci.yml` and `package.json` already cover this branch and actual PR target; the existing validate, common-header/responsive, mobile, sample-v5/seven-page, tax, smoke and PDF steps were preserved. The pending tests are connected through existing test commands.
- Existing sample, responsive/UI, smoke, tax UI and PDF audit commands were not rerun locally in this pass beyond the chat UI's own report/PDF checks; their new-commit CI execution is recorded separately. Earlier local runs above are historical, not evidence for this commit.
- Preview manual audit, real-model calls and physical-device testing: not performed. Browser tests use synthetic data and mocked responses; supported personal-report output is verified only for the stated synthetic conditions, not arbitrary customer scenarios.
- Resolution is deliberately explicit: a free-text correction may update a uniquely matched current item, but does not automatically answer an earlier request. Customers can finish that request from its summary/review controls, or cancel it. General natural-language inference and broader service completeness are not claimed.
- Preserved: common header/logo/menu and consultation links; mobile/composer/keyboard behavior; sample first page v5, all six remaining pages, images/PDF; Vercel Toolbar settings; tax rates/deductions/legal dates/formulas; AI/provider/key/environment/billing and operational configuration.
- PR remains Draft. No merge, auto-merge or production deployment is authorized or performed.

The source commit's full CI executed and passed `npm run lint`, `npm run typecheck`, `npm run test:phase2b`, `npm run test:chat`, `npm run test:tax`, `npm run build`, `npm run test:chat-api`, `npm run test:chat-ui`, `npm run test:tax-ui`, `npm run test:tax-extensions-ui`, `npm run test:smoke`, and the `sample-report-static-audit.mjs`, `sample-report-ui-audit.mjs`, `estimate-report-ui-audit.mjs`, `ui-audit.mjs`, `pdf-audit.mjs`, and `paper-report-audit.mjs` scripts. No required validation or audit step was skipped or ignored. The automatic [Vercel Preview check](https://vercel.com/khcho98-6477s-projects/frontend-prototype/5D8gJAsjAdpPbNkufKbzjrD3eNBK) also succeeded; this is deployment-status evidence, not a manual Preview audit.

This documentation follow-up adds only the completed CI record. Application and test sources remain those of `5394d7b`. The final response separately identifies the documentation HEAD and its checks, since a commit cannot record its own resulting hash inside itself. Existing 12 fixes remain accepted; the three newly reproduced pending-request failures and six lifecycle checks are now covered. The service as a whole is not certified complete.
