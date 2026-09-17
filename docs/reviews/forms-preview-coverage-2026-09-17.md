# Actual document previews for the 74-record library

Baseline: `dfa9ddcf62e433e8c99c5793a5f17af4d302785a`.

## Scope and provenance

- Before: 3 document thumbnails and 71 institutional placeholders.
- After: 74 document thumbnails: 33 PDF first pages, 40 HWP embedded
  `PrvImage` streams and 1 unchanged institutional PNG.
- No generated illustration, reconstructed form, invented example, logo or
  document-body edit is involved.
- `manifest.json` records each preview's source path, source role, source SHA-256,
  extraction method, native dimensions, resolution flag and output SHA-256.
- Blank originals, combined-document first pages, examples and institutional web
  images have distinct labels. A combined PDF's first page is not described as a
  filled-out example.
- 28 embedded HWP images are low resolution. Their dialogs display an explicit
  limitation and do not upscale the bitmap. HWP preview extraction does not
  establish that the entire HWP renders correctly in every office application.
- Institutional attribution is preserved per record, including the two Bupyeong
  records. The whole collection is not attributed to Bupyeong.

## Download preservation

All 148 download binaries retain their sizes and SHA-256 values, including the
previously identified site-converted web-case PDF. Preview PNGs are separate UI
assets, not additional downloadable forms or institutional originals.

The complete bundle still contains 74 records / 148 document files plus README
and manifest (150 archive entries). Its embedded manifest now includes preview
metadata; website-only previews are not included in the document bundle.

No calculator, chat, MCP, main, report, consultation or official-registration-guide
implementation is changed. No environment-variable or production-deployment
change is part of this update.

## Verification

- Existing 308 unit tests retained; 2 preview integrity/provenance tests added.
- Lint, typecheck and production build pass.
- The browser audit verifies all 74 preview hashes, all 148 document hashes and
  all bundle entries, plus representative actual file downloads.
- Every thumbnail is decoded at widths 320, 360, 390, 768, 1024, 1280 and 1440.
- Dialog checks at 360, 390 and 1440 cover PDF, landscape HWP, example HWP and
  institutional PNG, including aspect ratio, resolution notice and focus return.
- Four contact sheets inspect every extracted preview. Official-registration
  cards (4) and links (8), legacy redirects and withdrawn-download checks remain.
- Browser artifacts are generated in `.tmp/forms-library-proof/`; they are not
  uploaded as application assets. Deployment URL and exact commit are recorded
  on existing Draft PR #5 after Preview verification.

Reproduction: `python scripts/forms-generate-official-previews.py`, then
`python scripts/build-official-forms-bundle.py`. Generation requires PyMuPDF,
Pillow and olefile; serving/testing the committed preview PNGs does not.
