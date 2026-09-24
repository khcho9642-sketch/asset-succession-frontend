# Final library review, 2026-09-25

## Scope and baseline

- Repository: `khcho9642-sketch/asset-succession-frontend` only.
- Base: `codex/forms-bank-additions-20260924`, PR #11, `7ad8f2cd17b7e59faababc8d03bb721ac6f1936b`.
- Head: `codex/forms-final-review-20260925`. Stacked on unmerged PR #11 and its predecessors, not old main.
- The root checkout's user changes are untouched. No production deployment, merge, environment change, new project, original-file replacement or calculator formula change.

## A-F results

| Work | Result | Evidence / limitation |
| --- | --- | --- |
| A classification | Implemented | Ten missing asset decisions; securities accounts; separate debt filter; inventory form and litigation guide; four-purpose correction claim unchanged. Per-ID reasons in `lib/forms/final-review.ts` and public review ledger. Tags are navigation, not legal eligibility. |
| B source/currentness | Partial | Priority nine have individual findings and visible limitations. 18 local file references inspected across nine IDs; 14 official source/file URLs accessed. Official file hash match does not prove current law. Full latest statutory attachment comparison remains open. |
| C discovery | Implemented | Five compact explained entrances; explicit common-task ranking without duplicate cards; bereavement aliases and contextual guide; no-result query-only/full reset; gift asset choices with cash transfer evidence inside cash; transfer/business choice links; customer warnings use document names. |
| D bank/provider/archive | Implemented, provider submenus partial | Bank eligibility/usage precedes files; duplicate source links reduced; internal execution notes in review disclosure; 33 provider-only forms show document name and route limitation. Generic provider menus are not claimed as verified exact submenus. Nine specific archive reasons remain accessible; none is declared invalid. KB trust contract remains unpublished. |
| E review ledger/recheck | Implemented | Exactly one record per final public ID. Original collection dates, editorial review, currentness and applicability separate. Manual queue/access/hash tool plus monthly GitHub workflow. HTTP success never advances human review dates. Schedule cannot be active before merge to default branch; no merge performed. |
| F calculator dates | Implemented | Checked-on and supported-through both remain 2026-09-19 but are separate constants. Lower dates unchanged. No rule-effective period is invented; UI distinguishes the input support window from law validity. Six boundary tests added to 140 prior tests. |

## Counts

| Measure | Before | After |
| --- | ---: | ---: |
| Public resources | 198 | 198 |
| Forms | 150 | 151 |
| Inquiry/issuance services | 27 | 25 |
| Guides | 21 | 22 |
| Archived | 9 | 9 |
| Excluded | 13 | 13 |
| Unique hosted file paths | 166 | 166 |
| External files | 4 | 4 |
| Forms without a direct file | 32 | 33 |
| Unresolved authority label, non-service resources | 125 | 124 |

The additional provider-only form is the existing limited-acceptance inventory, reclassified from service; no new resource or fake download was added. Unknown authority is not a finding of document invalidity. Existing explicit statutory-file acquisition evidence may establish document nature, never current-law applicability.

## Priority nine and insurance reference

All dates below are this review's date, **2026-09-25**. This does not replace original acquisition or document revision dates.

| ID | Actual observation | Decision / outstanding work |
| --- | --- | --- |
| BP-G-01 | [Provider post](https://www.icbp.go.kr/main/bbs/bbsMsgDetail.do?bcd=taxes_form&msg_seq=64) has contract, example, 2026-03-27 date and attribution license. Current HWP hash equals stored original. | Retain as **agency reference**, not statutory common contract. Individual contract/legal suitability unverified. |
| NTS-IG-12 | Stored form 10-2 main filing pages inspected; official original PDF/HWP hashes match stored copies. [Rule page](https://www.law.go.kr/lsInfoP.do?joNo=001700&lsId=007388) shows 2026-03-20 effective date. | Retain pending complete latest-attachment comparison; business/funding eligibility unverified. |
| NTS-CG-10 | HWP header: form 12, revised 2015-03-13; business assets/transferor/transferee. Current NTS download hash unchanged. | Retain with explicit limitation. Not the general spouse-gift acquisition-cost carryover guide. Compare current form 12 before claiming currentness. |
| NTS-CG-11 | HWP header: form 12-4, revised 2011-04-07; converted business, land compensation, factories/childcare property. Current NTS download hash unchanged. | Retain with limitation; do not substitute another same-title stock form. Current rule/form comparison incomplete. |
| NTS-CG-12 | HWP header: form 13, revised 2016-03-14; contribution/farmland/public-purpose land categories. Current NTS download hash unchanged. | Retain with limitation; current exemption clauses/attachment comparison incomplete. |
| P2-05 | Form 9 extracted post-management recapture section and original inspected; official combined PDF hash equals stored. | Retain, not a universal violation determination. Latest attachment/individual recapture analysis incomplete. |
| P4-04 | [IFEZ post](https://www.ifez.go.kr/main/pst/view.do?pst_id=ciz01&pst_sn=194681&search=) identifies form 4, contract cancellation after transaction reporting; stored file inspected. | Correct form number from combined 3/4 to 4. Current statutory attachment byte/content comparison incomplete. |
| P5-02 | Form 10-2 startup-funding schedule, extracted pages 3-4; source combined PDF hash matches. | Retain linked to main filing and distinguish from business-share schedule. Latest statutory comparison/individual eligibility incomplete. |
| P5-03 | Form 10-2 business-share schedule, extracted page 5; same combined source PDF hash matches. | Retain with appropriate scope; latest statutory comparison/individual eligibility incomplete. |
| P6-03 | 2017 insurance reference collection evidence retained. HTTP access succeeds; current text/document comparison not completed. | Retain as reference with explicit limitation; current insurer/beneficiary-specific claims requirements must be checked. |

NTS historical download route: [NTS transfer tax forms](https://www.nts.go.kr/tax/sub/1.%EC%96%91%EB%8F%84%EC%86%8C%EB%93%9D%EC%84%B8%20%EC%8B%A0%EA%B3%A0%EC%84%9C%EC%8B%9D%20%EB%B0%8F%20%EC%B2%A8%EB%B6%80%EC%84%9C%EB%A5%98%20%EB%8B%A4%EC%9A%B4%EB%B0%9B%EA%B8%B0.html).
Securities account coverage: [KFTC account service FAQ](https://payinfo.or.kr/cs/faq/qryListWebFaq.do).

## Evidence and tests

- `evidence/original-inspection.json`: preserved file headers, sizes and hashes; not a complete Office rendering or current-law review.
- `evidence/source-access.json`: actual access results, response types, hashes, timestamps. Fourteen endpoints, not fourteen legal approvals.
- `evidence/recheck-queue.json`: manual scan of all 198 current ledger entries on 2026-09-25. Five missing source-check dates, zero overdue dates. Missing: SVC-ACCOUNTS, SVC-INSURANCE, SVC-CREDIT, SVC-PENSION, SVC-REGISTRY. Their collection dates were not invented from this technical scan.
- `before-pc.png`, `before-mobile.png` in `evidence/`: actual baseline Preview, 1440 and 390 pixels.
- New library tests: 17. Library suite: 134 existing + 17 new = 151 passed. Calculator: 140 existing + 6 added date boundaries = 146 passed.
- Existing integration guard initially rejected the requested date-only change. It now reverses only the exact approved constant/import/message edits and compares all calculator code to the original byte-for-byte projection. No formula/file exemption or removed assertion.
- Lint, typecheck, local production build and Vercel build passed. Sandbox subprocess `EPERM` initially prevented a repeat run; the identical commands passed with approved process permissions. No test was removed or weakened.

## Actual Preview validation

The first Preview of this work (`60cd120`) was used for the full interaction pass. Inspection found three remaining presentation issues, fixed in `3536353`: 38 split/source records still had generic title/page-only descriptions; the gift guide repeated its preliminary checklist; the 360px download tab wrapped its last syllable. Descriptions now identify users and submission context, the duplicate gift block is suppressed without removing conditions, and tab widths accommodate the complete label at unchanged font size. The fixed Preview was inspected again at 1440x1000, 390x844 and 360x800. `browser-qa.json` retains intermediate observations, including pre-hydration state and tool input limitations; `browser-final-qa.json` contains the post-fix checks. Only evidence/workflow files changed after this application-code commit. The final PR body gives the current delivery SHA and Preview, not an obsolete deployment URL.

| Test | Result and actual scope |
| --- | --- |
| T01 | PASS: 198 items, five guide entrances, no forced timing. Form tab 151. PC and 390/360 first view captured; first card remains visible. |
| T02 | PASS: `취득세` + real estate retains all six results including P0-13/P0-15; baseline was four. Repeated on fixed Preview. |
| T03 | PASS: securities + account query finds SVC-ACCOUNTS; debt query/filter finds SVC-CREDIT and BANK-ADD-03/04. |
| T04 | PASS: actual inheritance + gift + real-estate selection; automated exact union/intersection checks retained. |
| T05 | PASS: correction claim remains in the combined purpose/asset result; four purposes/common scope checked in unit test. |
| T06 | PASS: inventory card/detail is a form with P0-08 relation; filiation card/detail is guidance. |
| T07 | PASS: everyday bereavement sentence returns five resources and the after-death guide. |
| T08 | PASS: inquiry/issuance + balance query, then full reset clears query, filters and URL and restores 198. Existing reset logic was not changed. Query-only recovery from zero results also checked. |
| T09 | PASS: direct P0-01 detail with before-death filter shows after-death context and a timing notice, not an empty detail. |
| T10 | PASS: gift cash guide to bank/form detail and close returns to `#cash`; repeated on fixed Preview. |
| T11 | PASS: modal close restores original title focus and scroll; reload restores search/filter after hydration; browser Back closes the detail and keeps six filtered results. |
| T12 | PASS for public guidance/file routes: Woori owner/heir disclosure, private/business distinction, KB retirement-only DOC. No bank login/issuance performed. Hana original scope is preserved by existing tests, not a new bank transaction. |
| T13 | PARTIAL source navigation: provider-only inventory shows exact document name, broad menu and explicit unverified submenu/current attachment warning. All 33 provider-only records get this treatment, but exact provider submenus are not individually verified. |
| T14 | PASS samples: real preview image 724x1024 loaded; PDF/HWP format choices and external KB DOC present. Four downloaded sample bodies return HTTP 200 and match original SHA-256. Browser OS save completion is not claimed. |
| T15 | PASS observed pages at 390/360: filters, long bank title, detail close/file controls, no page-width overflow. Fixed 360px tab label stays on one line. Evidence includes first-view and bank-detail images. |
| T16 | PASS: Shift+Tab from close wraps to last action, Tab returns to close, Escape returns focus to originating title. |
| T17 | PASS: all 198 public IDs have exactly one ledger record. Source, editorial, currentness and applicability are not conflated; partial reviews stay partial. |
| T18 | PASS tool scope: manual 198-record queue detects five missing dates; 14 actual URL observations recorded. Tests distinguish overdue/missing, changed bytes, 403/auth blocking and timeout. No content-review date is refreshed. Monthly workflow configured, NOT running on default branch before merge. |
| T19 | PASS displayed policy + engine boundaries: fixed 2026-09-19 review/support values and unchanged lower dates; six new boundary tests and all 140 prior calculator cases pass. IAB date-field fill left the example date unchanged, so no browser boundary-entry success is claimed. No HomeTax direct run. |
| T20 | Final delivery SHA, existing project ID and Preview target are checked through Vercel metadata and recorded in the PR. Final docs-only commit has the same application code as the screenshot revision. |

### Download samples

`evidence/downloads.json` records response status, type, byte count, full SHA-256 and expected-hash comparison. All four matched:

- P2-15 PDF: 137,687 bytes, `3aa19105978665a9c579afd3a3ff2107e64dc03307db706ac036974ab65d7d0b`.
- Korean-name inheritance agreement HWP: 22,528 bytes, `704287e3acfb7f3e66ebbdd4f8912c7ab6deab2a9945ddfb47ddcf1fe7fd590a`.
- Existing ZIP: 16,042,175 bytes, `b8ba06c99a3de918d0aa75c8c57506895057d9b75a270e3f50a9a1afc965e934`.
- KB retirement DOC: 105,984 bytes, `d9fa02f49b950d8d54b7405ab845ea12fec2684b30efe4ebca20dd1adc578833`.

Existing 182-path historical preservation assertions and 74-preview/ZIP byte checks also passed. Those are preservation checks, not 182 newly obtained institution originals.

### Screenshots

These committed images can be opened from the PR, not only a temporary directory:

| View | Before | After |
| --- | --- | --- |
| PC 1440x1000 | [Before](evidence/before-pc.png) | [After](evidence/after-pc.png) |
| Mobile 390x844 | [Before](evidence/before-mobile.png) | [After](evidence/after-mobile.png) |
| Mobile 360x800 | Not captured in baseline | [After](evidence/after-360.png) |
| Bank detail | Prior detail not recaptured | [390px](evidence/bank-detail-mobile.png), [360px](evidence/bank-detail-360.png), [file action](evidence/bank-file-360.png) |
| Guide and split form | Generic description and duplicated initial guide note observed in first Preview | [Gift guide](evidence/gift-guide-pc.png), [split form detail](evidence/split-detail-pc.png) |

### Default ordering and review scheduling

The 12 priority IDs are existing entry points, not new cards: P0-01/SVC-ACCOUNTS/P0-06 start estate and relationship discovery; P0-08 supports debt-related acceptance review; P3-05/BP-G-01 start cash/property gift preparation; REG-I-01 starts inheritance registration; NTS-CG-01/NTS-IG-11 expose transfer/gift filing; NTS-IG-01/P2-02 expose business succession; P6-01 starts bank payout preparation. Search relevance is not overridden by this unfiltered order.

Manual command: `node scripts/forms-recheck.mjs --date=2026-09-25 --output=docs/forms-final-review-20260925/evidence/recheck-queue.json`. Network mode adds `--network`; comparison mode accepts `--previous=<observations.json>`. The monthly workflow reuses the checked source observation baseline, uploads a queue/observation artifact and has read-only contents permission. A baseline change is a review candidate, not automatic replacement. Only 14 observed endpoints have initial hash baselines; others need first-baseline review. Dynamic HTML changes can generate false-positive candidates. Missing source dates require checking original acquisition evidence; they do not block customers automatically.

## Remaining verification boundaries

No live HomeTax calculation, bank issuance/login, legal submission, contract acceptance or personal-data transaction was performed. Provider link reachability and binary identity are separate from institution-original confirmation and current legal validity. Generic routes require provider navigation; no nonexistent files or exact submenus are invented. All 198 applicability records remain individually unverified unless pre-existing evidence states a narrower fact.

Customer impact/follow-up at the initial delivery is preserved above. The 2026-09-25 continuation supersedes that pending list: see [current-source comparison and route follow-up](source-followup/REVIEW.md). It includes four current official editions, dated service-source recovery, all 33 per-record route decisions, and explicitly unresolved external restrictions. Individual legal applicability remains unverified.
