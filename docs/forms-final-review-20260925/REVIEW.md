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
- `evidence/recheck-queue.json`: manual scan of all 198 current ledger entries. Zero overdue/missing source-check dates at this run; content applicability still pending.
- `before-pc.png`, `before-mobile.png` in `evidence/`: actual baseline Preview, 1440 and 390 pixels.
- New library tests: 16. Calculator: 140 existing + 6 added date boundaries, all 146 passed.
- Existing integration guard initially rejected the requested date-only change. It now reverses only the exact approved constant/import/message edits and compares all calculator code to the original byte-for-byte projection. No formula/file exemption or removed assertion.
- Full library suite, final build, final Preview and T01-T20 browser results are recorded in the final validation section after execution.

## Remaining verification boundaries

No live HomeTax calculation, bank issuance/login, legal submission, contract acceptance or personal-data transaction was performed. Provider link reachability and binary identity are separate from institution-original confirmation and current legal validity. Generic routes require provider navigation; no nonexistent files or exact submenus are invented. All 198 applicability records remain individually unverified unless pre-existing evidence states a narrower fact.
