# Approved seven-page sample report

## Scope

- Branch: `codex/home-hero-paper-carousel`; base: `54b88bbd27fe2e3128f90218f6f22c0cac6df856`.
- `/sample-report` is an input-free, static sample viewer using the seven approved images.
- Homepage and shared public navigation sample links point to this route.
- Existing `/precheck/result?demo=1`, personalized results, `/report-preview`, assessment/session handling, and homepage carousel behavior are unchanged.
- Approved PNG designs are optimized to WebP at quality 94 without resizing or changing their content (about 668 KiB combined). Each page retains its actual dimensions.
- No additional dependency, main merge, authentication change or production promotion.

## Mobile reading

- Desktop contents list becomes a labeled native page selector on mobile.
- Manual previous/next controls, no autoplay. Pagination returns focus and scroll to the new page heading.
- Two-times enlargement scrolls inside the image region, not the whole document.
- A separate 18px core-summary view avoids relying only on text inside scaled images. It is explicitly a summary, not a full transcript.
- Controls use at least 44px height; notices and labels start at 14px. Keyboard focus is visible.
- Images have error, retry and text-summary alternatives.
- All amounts are fictional. Owner/share uncertainty, C as baseline, and unconfirmed available cash remain explicit.

## Verification

- `npm run build`: passed with static `/sample-report` export and TypeScript validation.
- `npm run lint`: passed.
- `npm run test:phase2b`: 28 existing engine tests passed.
- `node scripts/sample-report-static-audit.mjs`: checks seven exported WebP assets, selector, controls, disclaimers and homepage entry link. It is not a browser test.
- Read-only review of homepage source and committed 390px mobile screenshots at the base SHA: single-row header, one hero primary CTA, two-line H1 and visible report top. Small 11–12px report text and 2-second autoplay remain recommended follow-up improvements, not changed in this task.
- New viewer source reviewed for 320px wrapping, internal zoom overflow, focus/pagination, sample framing and retry handling.

## Evidence limits

New mobile browser interaction and screenshots could not be verified here. The supervised preview passes Vite-specific arguments which this Next.js development command does not accept. The project architecture and dev command were preserved; no alternate browser control or access bypass was attempted. The existing Vercel preview is login-protected. Saved homepage screenshots are earlier repository evidence, not a fresh deployed-site review. Check the new deployment on a real mobile device or an accessible preview before merging to production.
