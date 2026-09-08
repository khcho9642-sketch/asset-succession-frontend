# Personal report format aligned with the approved sample

The public `/sample-report` uses seven illustrated report pages in
`public/media/sample-report-v3/`. Warm paper, sepia gift/building/house illustrations,
fine rules and the original A/B/C strategy comparison restore the approved visual
direction. Tax numbers, Korean text and page geometry are typeset deterministically
over the illustrations. Its manifest is the single source for preview image paths,
accessible summaries and the downloadable PDF. The earlier approved images in
`public/media/sample-report/` remain unchanged and recoverable.
Personal `/report-preview` reports continue using confirmed customer facts and
`TaxComparisonReport` / `PaperReportLayout`; their tax calculations are unchanged.

## One document layout for generated reports

`PaperReportLayout.tsx` owns the page header, large red section number, serif title,
paper background, framed cards, footer and A4 geometry. Both the facts-only report
and the calculated tax report use it, on screen and in print. The document uses
`data-report-template="paper-seven-v1"` so an export test can detect regressions to
an unrelated template.

The public sample imports `public/media/sample-report-v3/manifest.json` through
`lib/sampleReport.ts`. The fictional family has combined assets of 50억원 and debt
of 5억원, giving net assets of 45억원. This is a family overview, not a claim that
one parent owns every asset or that all 50억원 have been compared for tax purposes.

Page 1 isolates a cash-gift example: out of the family's 10억원 of cash, a parent
gives 3억원 to one adult resident child or 1억원 each to three adult resident
children. Estimated gift tax is 38,800,000원 versus 14,550,000원 in total, a
24,250,000원 difference. Each child has no gifts from lineal ascendants during the
previous ten years, uses a 50,000,000원 deduction, files on time for the 3% credit,
and pays their own tax. Marriage/childbirth deductions do not apply. Family debt
does not reduce this cash gift. The comparison covers this gift tax only, not total
tax on the family's assets or a later inheritance, and distributing ownership among
three recipients is not automatically preferable to transferring it to one.

Page 3 restores A: staged gifts, B: sale followed by cash transfer, and C: holding
assets for inheritance. It compares their goals, tradeoffs and required facts.
The page-1 cash-gift numbers are not reused as tax estimates for those three
different strategies. The prior spouse-allocation sample is not the active report.

Every page centers on a diagram or large numbers with concise explanation:

| Page | Main visual |
| --- | --- |
| 01 세금효과 요약 | Cash-gift comparison and three large estimated-tax/effect amounts |
| 02 가족과 자산 | Family structure and asset composition |
| 03 세 가지 방향 비교 | Gift, building and house illustrations in three strategy columns |
| 04 단계적 증여 | Transfer planning with recipients, timing and conditions |
| 05 매각과 상속 | Sale/cash transfer and holding/inheritance paths |
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

`PDF 저장` directly downloads the matching authored seven-page illustrated PDF,
which preserves selectable text. The download gate verifies exact file bytes,
seven A4 pages, selectable Korean text, the first-page estimated-tax amounts and
their cash-gift-only scope.
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
