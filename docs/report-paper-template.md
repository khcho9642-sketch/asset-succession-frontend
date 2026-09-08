# Personal report format aligned with the approved sample

The public `/sample-report` preserves the approved seven original report images in
`public/media/sample-report/page-01.webp` through `page-07.webp`. The sample viewer
shows one page at a time, at one uniform size, with large arrows outside the paper.
It must not silently replace the approved images with a different calculated case.
Personal `/report-preview` reports continue using confirmed customer facts and
`TaxComparisonReport` / `PaperReportLayout`; their tax calculations are unchanged.

## One document layout for generated reports

`PaperReportLayout.tsx` owns the page header, large red section number, serif title,
paper background, framed cards, footer and A4 geometry. Both the facts-only report
and the calculated tax report use it, on screen and in print. The document uses
`data-report-template="paper-seven-v1"` so an export test can detect regressions to
an unrelated template.

The public sample uses `sampleReportPages` in `lib/sampleReport.ts`, with the
original fictional family example: 50억원 assets, 5억원 debt and 45억원 net assets.
Those are illustrative family totals, not a calculated estate or tax base.
The seven original image files are unchanged; the static audit pins their SHA256
hashes. Every page has an accessible title, summary and sample/review status.

The image viewer uses one fixed 1050 × 1485 A4-shaped frame for all seven pages.
Each image retains its intrinsic dimensions and uses `object-fit: contain`, so
the small differences in source dimensions do not change the outer frame or crop
content. Turning pages preserves the frame width, height and position. Fitting
changes only when the available viewport changes. There is no continuous or
nested document scrolling, and the PDF contains the same seven original images.

A collapsed contents menu, previous/next SVG buttons outside the sheet,
arrow/Home/End keys and mobile swipes change the page. Expanded view recovers
header space. Screen audits compare all seven pages, including a return to page 1,
in normal, expanded and resized viewports; they also check image loading, containment,
minimum arrow/touch dimensions and preservation of customer session data.
Printing reveals all seven 210 × 297 mm image sheets, even when page 3 is selected.
The print gate checks image bounds and seven physical A4 PDF pages with their
original image dimensions. Personal reports remain selectable HTML, and their
existing calculation and text/PDF gates stay separate.

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
