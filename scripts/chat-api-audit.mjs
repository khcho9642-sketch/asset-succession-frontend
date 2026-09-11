import assert from "node:assert/strict";

// Run against a production server started without AI credentials. This audit
// never calls a provider: valid requests run only after configured=false.
const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const endpoint = new URL("/api/diagnosis", baseURL);
const origin = endpoint.origin;
const user = (id, text = "아버지 재산, 아파트 20억") => ({ id, role: "user", parts: [{ type: "text", text }] });
const valid = { messages: [user("audit-user")], facts: {} };
const capability = await fetch(endpoint, { signal: AbortSignal.timeout(10_000) });
assert.equal(capability.status, 200);
assert.match(capability.headers.get("cache-control") ?? "", /no-store/);
const readiness = await capability.json();
assert.equal(readiness.configured, false, "Run the API audit on a server without AI configuration; no provider requests are allowed.");
assert(readiness.issues?.some((issue) => ["FREE_TRIAL_NOT_ENABLED", "MODEL_MISSING", "MODEL_INVALID", "AUTHENTICATION_MISSING"].includes(issue)), "A missing guide alone is not a safe no-provider audit setup.");

const observations = [];
async function check(name, { body = valid, headers = {}, raw = false } = {}, status = 400, code = "INVALID_REQUEST") {
  const requestHeaders = { "content-type": "application/json", origin, ...headers };
  for (const [key, value] of Object.entries(requestHeaders)) if (value === null) delete requestHeaders[key];
  const response = await fetch(endpoint, {
    method: "POST", headers: requestHeaders, body: raw ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(response.status, status, `${name}: unexpected HTTP status`);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  const result = await response.json();
  assert.equal(result.error?.code, code, `${name}: unexpected error code`);
  assert.equal(typeof result.error?.message, "string");
  assert(result.error.message.length > 0, `${name}: missing customer-facing error`);
  assert(!JSON.stringify(result).includes(valid.messages[0].parts[0].text), `${name}: error echoed private intake text`);
  observations.push({ name, status, code });
}

await check("missing origin", { headers: { origin: null } }, 403, "ORIGIN_NOT_ALLOWED");
await check("foreign origin", { headers: { origin: "https://unrelated.invalid" } }, 403, "ORIGIN_NOT_ALLOWED");
await check("cross-site fetch", { headers: { "sec-fetch-site": "cross-site" } }, 403, "ORIGIN_NOT_ALLOWED");
await check("wrong content type", { headers: { "content-type": "text/plain" } }, 415, "JSON_REQUIRED");
await check("malformed JSON", { body: "{", raw: true });
await check("invalid UTF-8", { body: new Uint8Array([0xff, 0xfe]), raw: true });
await check("empty body", { body: "", raw: true });
await check("null body", { body: null });
await check("missing messages", { body: {} });
await check("empty messages", { body: { messages: [] } });
await check("empty user text", { body: { messages: [user("empty", "  ")] } });
for (const role of ["system", "developer", "tool"]) {
  await check(`untrusted ${role} role`, { body: { messages: [{ ...user(role), role }] } });
}
await check("assistant cannot be latest turn", { body: { messages: [user("first"), { ...user("last"), role: "assistant" }] } });
await check("duplicate message IDs", { body: { messages: [user("same"), user("same")] } });
await check("wrong part type", { body: { messages: [{ ...user("bad-part"), parts: [{ type: "text", text: 123 }] }] } });
await check("untrusted fact key", { body: { ...valid, facts: { taxDue: { value: "9억", evidence: "9억", messageId: "audit-user" } } } });
await check("oversize individual turn", { body: { messages: [user("long", "가".repeat(6001))] } });
await check("too many turns", { body: { messages: Array.from({ length: 81 }, (_, index) => user(`many-${index}`)) } });
await check("oversize conversation text", { body: { messages: Array.from({ length: 7 }, (_, index) => user(`total-${index}`, "a".repeat(5000))) } });
await check("oversize body bytes", { body: " ".repeat(128 * 1024 + 1), raw: true }, 413, "REQUEST_TOO_LARGE");
await check("valid request without configured provider", {}, 503, "AI_NOT_CONFIGURED");
const pendingSource = { value: "국민은행 대출 1억원으로 정정", evidence: "국민은행 대출 1억원으로 정정", messageId: "pending-user", status: "needs_confirmation" };
const pendingBody = { messages: [user("pending-user", pendingSource.value), user("next-user", "대기 요청을 확인하고 싶어요")],
  facts: { debt: { value: "", evidence: pendingSource.evidence, messageId: pendingSource.messageId, sources: [pendingSource] } } };
await check("pending-only facts permit the next conversation turn", { body: pendingBody }, 503, "AI_NOT_CONFIGURED");
await check("pending request cannot masquerade as a current fact", { body: { ...pendingBody, facts: { debt: { ...pendingBody.facts.debt, value: pendingSource.value } } } });

console.log(JSON.stringify({ status: "passed", baseURL, providerInvoked: false, observations }, null, 2));

