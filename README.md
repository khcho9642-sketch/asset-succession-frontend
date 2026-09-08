# Asset Succession Frontend Prototype

Next.js prototype with conversational intake, customer-confirmed facts, and a seven-page family report. `/precheck` uses a streaming AI adapter when server credentials are configured; otherwise it clearly offers rule-based input organization. Existing step-by-step intake remains at `/precheck/form`.

## Chat and report

- Run `npm ci`, then `npm run dev`. Production uses `npm run build` and `npm start`; the app now needs a Next.js server for `/api/diagnosis` rather than an `out/` static export.
- Copy `.env.example` to `.env.local` and set `AI_GATEWAY_API_KEY` and `AI_DIAGNOSIS_MODEL` on the server to enable real AI. Never commit credentials. Without them, guided input, editing, confirmation and report generation still work.
- A single message can contain family, several assets, debt and goals. Extracted information remains a draft until the customer explicitly confirms the review.
- Customer-confirmed facts feed the existing deterministic scenario/report pipeline. The model does not invent tax bases, taxes or savings. An entered market value is not a taxable base.
- Drafts and reports use the current browser tab's session storage, with a memory-only handoff when storage is blocked. There is no server-side customer database or shareable family link.
- See `docs/chat-report-implementation.md` for validation and remaining activation steps.

## Deployment boundary

- Use the existing Vercel project and select the directory containing this `package.json` (the root of this repository).
- Use the Next.js framework preset and Node.js 22. Remove any legacy `out` output-directory override; this version needs the API route's server runtime.
- Use Preview deployment first.
- Do not commit secret keys or real personal information. Provider credentials belong only in the existing project's server environment.
- Public result/report pages must show only user-entered asset/debt amounts. Strategy tax, funding-gap, and family-transfer numbers remain hidden as “calculation engine required” until a real calculation engine is connected.
- Wizard amount fields use positive numeric KRW hundred-million units only; free-text amounts such as `5000만원` or negative/zero values are invalid.

## Phase 2B engine foundation

- Engine contract: `docs/product/PHASE_2B_ENGINE_CONTRACT.md`
- Report V2 contract: `docs/product/REPORT_V2_PHASE_2B_CONTRACT.md`
- Conversational Precheck V2 contract: `docs/product/CONVERSATIONAL_PRECHECK_PHASE_2B_CONTRACT.md`
- Story/test page: `/phase-2b`
- Unit tests: `npm run test:phase2b`

Phase 2B introduces the normalized `ClientFacts → Baseline → Scenario → CalculationResult → Recommendation` pipeline. The chat adapter prepares inputs for this pipeline; the model never replaces its calculation rules.
