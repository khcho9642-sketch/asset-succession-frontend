# Customer Tax MCP Connection

This is a server-side connection for `/api/diagnosis`, not a Codex connector registration.
The current Google provider, model allowlist, free-trial gate and one-backup limit are unchanged.

## Local Connection

The inspected existing server is `C:\Users\khcho\Documents\nts-tax-mcp\server_ext_stdio.py`.
It is a local wrapper around the existing extended FastMCP server. Configure the application process
with `TAX_MCP_STDIO_COMMAND=python` and `TAX_MCP_STDIO_SCRIPT` pointing to that actual script.
Supply the existing `LAW_API_OC` through the process environment if the law.go.kr tools require it.
Do not put its value in code, logs, screenshots, chat or Git. The app never reads Codex settings.

For local verification, pass the **actual edited repository** to:

```text
node scripts/tax-mcp-live-audit.mjs <absolute-repository-path>
```

This recompiles the application adapter from that directory, calls four synthetic public-law queries,
and records the source SHA256 hashes, Git HEAD, source documents and tool statuses in
`artifacts/phase2-tax-chat/live-mcp.json`. It does not call Google or prove a deployed connection.

## Existing HTTPS Endpoint

For an existing authenticated Streamable HTTP server, configure server-only `TAX_MCP_URL`
and `TAX_MCP_BEARER_TOKEN` in the approved Preview environment. The client sends the bearer
token in the Authorization header, refuses redirects, and never sends customer text or financial
amounts as search keywords. No endpoint is provided or invented by this repository.

An OAuth-only endpoint needs its actual issuer, audience and approved server credential flow verified
before an adapter is added. Merely supplying a URL is not authentication. The current adapter supports
an existing server bearer credential, not interactive OAuth or a new hosting service.

The existing local HTTP entrypoint binds to 0.0.0.0 without built-in authentication. Do not expose it
or create a PC tunnel. Vercel cannot use the local stdio path. An authenticated reachable host and,
where applicable, law.go.kr IP authorization are deployment prerequisites.

The Google project must still be the approved Free Tier project. The existing default activation is
limited to `codex/chat-opening-topics`; other Preview branches need their existing approved explicit
`AI_DIAGNOSIS_FREE_TRIAL_ENABLED` and `GOOGLE_DIAGNOSIS_MODEL` settings. This implementation does
not register remote secrets, broaden the existing activation default, or change billing/model settings.

## Runtime Contract

- Simple factual inputs do not query MCP. Tax questions use bounded, deidentified topic vocabulary.
- The server calls only `law_article_as_of` and `nts_ruling_search`, after inspecting tools/list.
- The statutory lookup is a topic starting point, not exhaustive legal research; unrelated or unsupported
  questions must not be presented as a comprehensive assessment. Related NTS responses are sorted by date.
- MCP is queried before the existing Google call. A retry reuses the same documents, not another search.
- Two read-only tool calls, 18-second lookup deadline, 6-second tool deadlines, no MCP retries.
  Grounded Google attempts are bounded to 18 seconds each and at most the existing two attempts.
- Lookup errors, auth errors, no results and unusable sources remain distinct; no-source responses do not call AI.
- Source titles, agencies, URLs, quotes, retrieval timestamps and available dates are server-owned.
  NTS inquiry (`질의`, ID prefix `01`) and advance-answer (`사전`, ID prefix `20`) documents map
  to their verified detail route. Other document types are explicitly unsupported, not invented links.
  Law MST maps to the verified version URL.
  A ruling date is not an effective date. Application provisions and transaction eligibility remain unconfirmed.
- AI can cite only retrieved IDs. Unsupported links, numeric claims and personal tax estimates are blocked.
  These guards do not prove every qualitative sentence correct; live-model review is still required.
- Source documents are prompt data, never tool instructions or customer facts. Source bodies are bounded excerpts.
  Only explicit assertion clauses from mixed questions can update intake, retaining quoted evidence and replay protection.
- A personal tax calculation request uses the existing confirmation/calculator/report flow, not model arithmetic.
- Public source metadata survives chat refresh. It is not copied into confirmed customer facts or calculation inputs.

No production deployment, merge, paid fallback, signup, CRM, contact submission or tax formula change is included.
