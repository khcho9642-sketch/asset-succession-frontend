# Asset Succession Frontend Prototype

UI prototype only. This Next.js app uses synthetic mock data and does not connect to Streamlit, SQLite, FastAPI, tax engines, MCP servers, or real customer records.

## Deployment boundary

- Deploy only this directory to Vercel.
- Vercel Root Directory must be `frontend-prototype`.
- Use Preview deployment first.
- Do not add production databases, secret keys, LAW_API_OC, MCP configuration, or real personal information.
- Public result/report pages must show only user-entered asset/debt amounts. Strategy tax, funding-gap, and family-transfer numbers remain hidden as “calculation engine required” until a real calculation engine is connected.
- Wizard amount fields use positive numeric KRW hundred-million units only; free-text amounts such as `5000만원` or negative/zero values are invalid.
