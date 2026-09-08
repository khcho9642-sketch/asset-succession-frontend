# Personal report format aligned with the approved sample

The public `/sample-report` viewer contains seven approved reference images. The
personal `/report-preview` route previously rendered a separate navy-and-gold
`Report V2` layout. Passing the old PDF checks proved pagination and some content,
but did not prove that the output matched the sample's design.

## One document layout for generated reports

`PaperReportLayout.tsx` owns the page header, large red section number, serif title,
paper background, framed cards, footer and A4 geometry. Both the facts-only report
and the calculated tax report use it, on screen and in print. The document uses
`data-report-template="paper-seven-v1"` so an export test can detect regressions to
an unrelated template.

The approved sample images remain the visual reference. Their example family,
50억원 asset values and illustrations are not substituted for customer data.
Dynamic diagrams, cards and text must use the confirmed assessment instead.

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
