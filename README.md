# Asset Succession Frontend Prototype

UI prototype only. This Next.js app uses synthetic mock data and does not connect to Streamlit, SQLite, FastAPI, tax engines, MCP servers, or real customer records.

## Deployment boundary

- Deploy only this directory to Vercel.
- Vercel Root Directory must be `frontend-prototype`.
- Use Preview deployment first.
- Do not add production databases, secret keys, LAW_API_OC, MCP configuration, or real personal information.
- Public result/report pages must show only user-entered asset/debt amounts. Strategy tax, funding-gap, and family-transfer numbers remain hidden as “calculation engine required” until a real calculation engine is connected.
- Wizard amount fields use positive numeric KRW hundred-million units only; free-text amounts such as `5000만원` or negative/zero values are invalid.

## Phase 2B engine foundation

- Engine contract: `docs/product/PHASE_2B_ENGINE_CONTRACT.md`
- Report V2 contract: `docs/product/REPORT_V2_PHASE_2B_CONTRACT.md`
- Conversational Precheck V2 contract: `docs/product/CONVERSATIONAL_PRECHECK_PHASE_2B_CONTRACT.md`
- Story/test page: `/phase-2b`
- Unit tests: `npm run test:phase2b`

Phase 2B introduces the normalized `ClientFacts → Baseline → Scenario → CalculationResult → Recommendation` pipeline. It does not connect AI APIs or produce fabricated tax/savings numbers.
