# Personal report format aligned with the approved sample

The public `/sample-report` now uses the requested seven-page infographic redesign
in `public/media/sample-report-v2/`. Its manifest is the single source for preview
image paths, accessible summaries and the downloadable PDF. The earlier approved
images in `public/media/sample-report/` remain unchanged and recoverable.
Personal `/report-preview` reports continue using confirmed customer facts and
`TaxComparisonReport` / `PaperReportLayout`; their tax calculations are unchanged.

## One document layout for generated reports

`PaperReportLayout.tsx` owns the page header, large red section number, serif title,
paper background, framed cards, footer and A4 geometry. Both the facts-only report
and the calculated tax report use it, on screen and in print. The document uses
`data-report-template="paper-seven-v1"` so an export test can detect regressions to
an unrelated template.

The public sample imports `public/media/sample-report-v2/manifest.json` through
`lib/sampleReport.ts`. It is a fictional first-inheritance comparison: one decedent
owns 50억원 of assets with 5억원 of debt, and a spouse and three adult children
inherit. Three spouse-allocation cases share the same asset base and confirmed
sample assumptions. Page 1 shows the A/C estimated taxes and their difference;
page 3 compares all three cases. The comparison does not claim a reduction in
combined taxes across later inheritances or transfers.

Every page centers on a diagram or large numbers with concise explanation:

| Page | Main visual |
| --- | --- |
| 01 세금효과 요약 | Three large estimated-tax/effect amounts |
| 02 가족과 자산 | Family structure and asset composition |
| 03 세 가지 배분안 | Estimated-tax comparison of three allocations |
| 04 배우자 배분안 | Flow of estate assets to spouse and children |
| 05 세금 계산 근거 | Estate, deductions, tax base and estimated tax |
| 06 생활비와 납부재원 | Cash allocation for tax and living funds |
| 07 실행 준비 | Preparation, review and execution timeline |

The static audit pins the earlier image hashes to prevent silent deletion or
replacement, and verifies the new images against their generated manifest hashes.
Every new page has an accessible title, summary and sample/review status.

The image viewer retains one fixed 1050 × 1485 A4-shaped frame for all seven pages.
Each 1400 × 1980 image uses `object-fit: contain`; turning pages preserves the
frame width, height and position. Fitting changes only when the viewport changes.
There is no continuous or nested document scrolling.

A collapsed contents menu, large previous/next SVG buttons outside the sheet,
arrow/Home/End keys and mobile swipes change the page. Expanded view recovers
header space. Screen audits compare all seven pages, including a return to page 1,
in normal, expanded and resized viewports; they also check loading, containment,
minimum arrow/touch dimensions and preservation of customer session data.

`PDF 저장` directly downloads the matching authored seven-page PDF, which preserves
selectable text and vector diagrams. The download gate verifies exact file bytes,
seven A4 pages, selectable Korean text and the first-page estimated-tax amounts.
Browser printing also remains supported: it reveals all seven 210 × 297 mm image
sheets even when page 3 is selected. Its separate print gate checks image bounds
and seven physical A4 pages with the expected image dimensions. Personal reports
remain selectable HTML with their existing calculation and text/PDF gates.

Korean serif glyphs are self-hosted through the pinned
`@fontsource-variable/noto-serif-kr` package. A CSS fallback name alone previously
allowed Korean headings to print in a sans-serif system fallback; the new audit
requires the actual webfont to load before PDF export.

The tax renderer keeps the complete baseline calculation on page 04 and alternative
calculations on page 05. Each comparison labels its actual baseline explicitly;
option letters are not a recommendation ranking.

## Data and print constraints

- The tax engines and customer confirmation requirements are unchanged by the sample redesign.
- A facts-only report remains a facts-only report. Unknown tax values, child ages,
  past gifts and usable cash are not turned into assumed values to fill the design.
- Every personal page remains editable HTML with selectable PDF text.
- Paper background is retained in print; no overflow is hidden to force seven pages.
- Existing exact-tax checks remain. New visual checks assert all seven numbered
  sections, paper background, seal color, serif heading and A4 content bounds.
- The 52억원 regression preserves the uploaded PDF's actual wording and unknowns:
  building 25억원, apartment 15억원, deposits 12억원, no debt, father ownership,
  spouse present, three children of unspecified ages, and past gifts unknown.

The repository still does not contain a standalone subscription-CLI report runner.
An external runner must load the same personal report route after creating the
confirmed assessment. This change does not prove which code a separate local CLI
used for an earlier export.

## Estimated tax reports are required for new chat handoffs

New chat reports call `buildConfirmedTaxAssessmentSnapshot(state, taxInput, confirmation)`.
It rejects missing, incomplete or unconfirmed tax input. `buildConfirmedAssessmentSnapshot`
is only the lower-level facts adapter; calling it alone does not produce an estimated-tax report.
An external CLI export should use the combined function, then wait for
`[data-report-mode="tax-comparison"][data-tax-report-status="ready"]` before printing.
It must not fall back to a facts-only export when calculation prerequisites are missing.

Saved facts-only reports remain available as an explicitly labelled input summary.
`ReportTaxSetup` can add confirmed calculation conditions without replacing the original
conversation, asset facts or assessment identity. The regular PDF button is offered
for a confirmed, ready tax report. New field values require fresh confirmation.

Each report compares alternatives within the selected tax track. It does not place
taxes on unrelated asset bases into one cross-tax ranking. Supported calculator scopes
remain documented in `tax-comparison-implementation.md`; this update changes the handoff,
not the tax law or engine rules.

