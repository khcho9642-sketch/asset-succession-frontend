# Preview integration, 2026-09-20

## Scope and source commits

- Latest service / current Production: `13328ef2cb8ecaef01b2820398a66df2a1774d8c`.
- Latest remote `assistant/forms-additions-109`: `ce31385b7c855c413a9360007a42e75c16c425d3`.
- Includes the five-item batch ending at `fd1595876acf9f3be0e986175032b9d88aba6a2b` and the subsequent bot evidence refresh.
- Isolated integration branch: `codex/forms-additions-preview-20260920`.
- Existing Vercel project: `frontend-prototype`, project ID `prj_AZ2dFiOrlhob0B9QeciuvAJPHupf`. Preview only; no Production alias, environment-variable edits or PR merge.
- PR #6's separate library redesign is not included in this additions-branch deployment.

## Preservation and conflict resolution

- All non-forms application code, including the latest calculator, main, chat, MCP and reports, is unchanged from the service commit.
- Preserved all 74 current service records, actual PNG preview metadata and bytes, original files and the existing ZIP.
- Preserved all 103 added card records and 109 collection task records from the latest expansion commit. The only manifest overlay is the current service's preview/thumbnail fields for the original 74 records.
- The expanded catalog has 177 cards: 105 hosted, 61 provider links and 11 pending cards. These card counts are not completion counts or file counts.
- Collection completion remains 97/109 tasks, with 12 tasks pending. The last five tasks remain complete; no new collection completion is claimed here.
- Optional preview metadata is handled explicitly so new provider/pending records can open their information dialog without a runtime error or an invented thumbnail.
- Existing source, institution and delivery labels are preserved. An official provider link is not a newly hosted original.

## Validation

- `test:simple-calculator`: 140 passed, including all 16 final numeric acceptance cases.
- `test:tax`: 105 passed.
- `test:chat`: 112 passed (existing automated regression only; no live AI/MCP calls).
- `test:phase2b`: 28 passed.
- Forms catalog: 19 existing regression tests passed.
- New preview integration audit: 5 passed. It compares both source commits, all expansion records, recorded file hashes, unchanged production binary bytes and the non-forms source diff.
- Total: 409 passed. Lint and TypeScript check passed.
- Existing 74-record catalog regression tests now select the exact legacy IDs rather than mistakenly treating new records as members of the old ZIP. No legacy file/hash/format assertion was removed; the new suite checks the complete 177-record catalog independently.
- The prior `forms-expansion-round17-tests.mjs` remains unchanged as a historical five-item-only source-branch audit. It intentionally is not an audit for a service merge containing calculator and preview updates.
- Local build initially encountered Turbopack's prohibition on a node_modules junction outside the worktree. An independent install using the unchanged lockfile replaces that local-only junction; no production config change is used to bypass it.
- `scripts/forms-additions-preview-ui.py` checks the deployed manifest, all hosted downloads, preserved ZIP, retired URLs, existing navigation, four registration cards/eight links, filtering, old/new dialogs, Korean download names and 1440/360/390px layouts. Deployment/browser output is retained under ignored `.tmp/forms-additions-preview-proof/`.
