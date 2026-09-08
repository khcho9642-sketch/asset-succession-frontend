# Personal report format aligned with the approved sample

The public `/sample-report` and personal `/report-preview` routes now share the
actual `TaxComparisonReport` and `PaperReportLayout` components. The old public
viewer used seven images with different example values and no calculated tax.
The public viewer keeps one page at a time and gives the paper the available
viewport space without a permanent sidebar or duplicate report titles.

## One document layout for generated reports

`PaperReportLayout.tsx` owns the page header, large red section number, serif title,
paper background, framed cards, footer and A4 geometry. Both the facts-only report
and the calculated tax report use it, on screen and in print. The document uses
`data-report-template="paper-seven-v1"` so an export test can detect regressions to
an unrelated template.

The public sample uses `createSampleTaxReport()` in `lib/sampleTaxReport.ts`: a
standalone fictional inheritance case with 52억원 estate, 12억원 eligible financial
assets, a spouse, three adult children, no debt/prior gifts and a 500만원 funeral
assumption. Usable cash stays unknown. It never reads or writes customer session
data. Every sample page, including print, is labelled 샘플 · 가상 사례.

The sample is selectable HTML displayed one page at a time, fitted to the available
viewport with no continuous or nested document scrolling. A collapsed contents
menu, previous/next buttons outside the sheet, arrow/Home/End keys and mobile
swipes change the page. Expanded view recovers header space without cropping the
report. All seven pages share one canvas size, measured from their complete content
after fonts load. Turning pages preserves the paper's width, height, position and
text scale; the fit is recalculated only when the available viewport or fonts change.
The previous/next controls use visible SVG arrows outside the paper. Screen audits
compare all seven pages and a return to the first page in normal, expanded and
resized viewports, alongside minimum arrow and touch-target dimensions.
Printing always restores all seven full-size A4 pages, even when page 3 is selected.
The old WebP files are no longer the sample route's content; personal reports
continue using confirmed customer data and their own document reading layout.

Korean serif glyphs are self-hosted through the pinned
`@fontsource-variable/noto-serif-kr` package. A CSS fallback name alone previously
allowed Korean headings to print in a sans-serif system fallback; the new audit
requires the actual webfont to load before PDF export.

| Page | Purpose |
| --- | --- |
| 01 | Core summary and comparison directions |
| 02 | Confirmed family, assets and calculation conditions |
| 03 | Options compared on the same basis |
| 04 | Detailed explanation and evidence |
| 05 | Other option details and evidence |
| 06 | Cash, living funds and payment resources |
| 07 | Preparation, next steps and applicable references |

The tax renderer keeps the complete baseline calculation on page 04 and alternative
calculations on page 05. Each comparison labels its actual baseline explicitly;
option letters are not a recommendation ranking.

## Data and print constraints

- The tax engines and confirmation requirements are unchanged by this layout fix.
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
