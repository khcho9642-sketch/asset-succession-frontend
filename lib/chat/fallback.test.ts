import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import type { UIMessageChunk } from "ai";
import { diagnosisReplySchema, type DiagnosisReply } from "./choices";
import { createDiagnosisResponse } from "./fallback";
import type { ChatPatch } from "./intake";
import {
  BACKUP_GOOGLE_DIAGNOSIS_MODEL,
  DEFAULT_GOOGLE_DIAGNOSIS_MODEL,
  type DiagnosisRequest,
} from "./server";

const PRIMARY = DEFAULT_GOOGLE_DIAGNOSIS_MODEL;
const BACKUP = BACKUP_GOOGLE_DIAGNOSIS_MODEL;
const SYNTHETIC_KEY = "synthetic-google-key-never-valid";
const messages: DiagnosisRequest["messages"] = [{
  id: "synthetic-fallback-user",
  role: "user",
  parts: [{ type: "text", text: "증여를 준비하고 있어요. 제 아파트를 아들에게 주려고 해요." }],
}];
const primaryProposals: ChatPatch[] = [{ key: "topic", value: "증여", evidence: "증여" }];
const backupProposals: ChatPatch[] = [{ key: "realEstate", value: "제 아파트", evidence: "제 아파트" }];
const reply: DiagnosisReply = {
  message: "아드님께 아파트를 주려고 하시는군요. 아드님은 성인이신가요?",
  choices: ["성인", "미성년자", "잘 모르겠어요"],
};

type GoogleRequestBody = {
  generationConfig: {
    maxOutputTokens: number;
    thinkingConfig: { thinkingLevel: string };
    responseMimeType?: string;
    responseSchema?: { properties: Record<string, unknown> };
    responseJsonSchema?: unknown;
  };
  tools?: Array<{ functionDeclarations?: Array<{ name: string }> }>;
  systemInstruction?: { parts: Array<{ text: string }> };
  contents: Array<{
    role: string;
    parts: Array<{
      text?: string;
      thoughtSignature?: string;
      functionCall?: { id?: string; name: string };
      functionResponse?: { id?: string; name: string; response: unknown };
    }>;
  }>;
};

type RequestLog = { model: string; body: GoogleRequestBody; signal: AbortSignal };
type Step = {
  model: string;
  stage: "facts" | "reply";
  respond: (request: Request) => Response | Promise<Response>;
};
type ResponseOptions = Partial<Pick<Parameters<typeof createDiagnosisResponse>[0], "abortSignal" | "attemptTimeoutMs" | "headers" | "messages" | "facts">>;

function googleSse(chunks: unknown[]): Response {
  return new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join(""), {
    headers: { "Content-Type": "text/event-stream" },
  });
}

function googleText(text: string, finishReason?: string) {
  return { candidates: [{ content: { role: "model", parts: [{ text }] }, ...(finishReason ? { finishReason } : {}) }] };
}

function facts(model: string, proposals = backupProposals, id = "backup-proposal"): Step {
  return {
    model,
    stage: "facts",
    respond: () => googleSse([{
      candidates: [{
        content: { role: "model", parts: [{
          functionCall: { id, name: "proposeFacts", args: { facts: proposals } },
          thoughtSignature: Buffer.from(`synthetic-signature-${id}`).toString("base64"),
        }] },
        finishReason: "STOP",
      }],
      usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 15, totalTokenCount: 35 },
    }]),
  };
}

function answer(model: string, expected = reply): Step {
  const text = JSON.stringify(expected);
  return {
    model,
    stage: "reply",
    respond: () => googleSse([googleText(text.slice(0, 30)), googleText(text.slice(30), "STOP")]),
  };
}

function failure(model: string, status: number, stage: Step["stage"] = "facts"): Step {
  return {
    model,
    stage,
    respond: () => Response.json({ error: {
      code: status,
      status: status === 429 ? "RESOURCE_EXHAUSTED" : "SYNTHETIC_FAILURE",
      message: "synthetic-private-provider-detail",
    } }, { status }),
  };
}

function installGoogleMock(t: TestContext, steps: Step[]): RequestLog[] {
  const requests: RequestLog[] = [];
  // Replace fetch entirely: unexpected calls also cannot reach a real provider.
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const body = JSON.parse(await request.text()) as GoogleRequestBody;
    const model = new URL(request.url).pathname.split("/").at(-1)?.split(":")[0] ?? "";
    const step = steps[requests.length];
    requests.push({ model, body, signal: request.signal });
    assert.ok(step, "Unexpected retry or extra inference call");
    assert.equal(request.url, `https://generativelanguage.googleapis.com/v1beta/models/${step.model}:streamGenerateContent?alt=sse`);
    assert.equal(request.method, "POST");
    assert.equal(request.headers.get("x-goog-api-key"), SYNTHETIC_KEY);
    assert.equal(body.generationConfig.maxOutputTokens, 3_000);
    assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, "low");
    if (step.stage === "facts") {
      assert.equal(body.generationConfig.responseMimeType, undefined);
      assert.equal(body.generationConfig.responseSchema, undefined);
      assert.equal(body.generationConfig.responseJsonSchema, undefined);
      assert.ok(body.tools?.some((tool) => tool.functionDeclarations?.some((fn) => fn.name === "proposeFacts")));
    } else {
      assert.equal(body.generationConfig.responseMimeType, "application/json");
      assert.ok(body.generationConfig.responseSchema?.properties.message);
      assert.ok(body.generationConfig.responseSchema?.properties.choices);
      assert.ok(!body.tools?.length, "Final JSON request must not include tools");
    }
    return step.respond(request);
  });
  return requests;
}

function response(options: ResponseOptions = {}) {
  return createDiagnosisResponse({ apiKey: SYNTHETIC_KEY, model: PRIMARY, messages, facts: {}, ...options });
}

async function readChunks(result: Response): Promise<UIMessageChunk[]> {
  const body = await result.text();
  return body.split("\n").flatMap((line) => {
    if (!line.startsWith("data: ") || line === "data: [DONE]") return [];
    return [JSON.parse(line.slice(6)) as UIMessageChunk];
  });
}

function assertWinningReply(chunks: UIMessageChunk[], proposals: ChatPatch[], expected = reply) {
  assert.equal(chunks.some((chunk) => chunk.type === "error"), false);
  const raw = chunks.flatMap((chunk) => chunk.type === "text-delta" ? [chunk.delta] : []).join("");
  // Legacy plain text is intentionally not accepted as a successful AI reply.
  assert.deepEqual(diagnosisReplySchema.parse(JSON.parse(raw)), expected);
  const outputs = chunks.filter((chunk) => chunk.type === "tool-output-available");
  assert.equal(outputs.length, 1);
  assert.deepEqual(outputs[0].output, { proposals });
  assert.equal(chunks.filter((chunk) => chunk.type === "finish").length, 1);
  assert.ok(chunks.some((chunk) => chunk.type === "finish" && chunk.finishReason === "stop"));
  assert.equal(JSON.stringify(chunks).includes("synthetic-private-provider-detail"), false);
}

function assertOnlyPublicFailure(chunks: UIMessageChunk[], code: string) {
  const errors = chunks.filter((chunk) => chunk.type === "error");
  assert.equal(errors.length, 1);
  assert.ok(errors[0].errorText.startsWith(`[${code}] `));
  assert.equal(chunks.some((chunk) => chunk.type === "text-delta" || chunk.type === "tool-output-available"), false);
  assert.equal(JSON.stringify(chunks).includes("synthetic-private-provider-detail"), false);
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function pendingRequest(started: ReturnType<typeof deferred>, aborted: ReturnType<typeof deferred>): Step {
  return {
    model: PRIMARY,
    stage: "facts",
    respond: (request) => new Promise<Response>((_resolve, reject) => {
      const abort = () => {
        aborted.resolve();
        reject(request.signal.reason ?? new DOMException("Synthetic cancellation", "AbortError"));
      };
      if (request.signal.aborted) abort();
      else request.signal.addEventListener("abort", abort, { once: true });
      started.resolve();
    }),
  };
}

test("fallback returns immediate SSE and a successful primary uses exactly two direct calls", async (t) => {
  const requests = installGoogleMock(t, [facts(PRIMARY, primaryProposals, "primary-proposal"), answer(PRIMARY)]);
  const result = response({ headers: { "x-synthetic-header": "preserved" } });
  assert.ok(result instanceof Response);
  assert.match(result.headers.get("content-type") ?? "", /text\/event-stream/);
  assert.equal(result.headers.get("x-synthetic-header"), "preserved");
  const chunks = await readChunks(result);
  assert.deepEqual(requests.map((request) => request.model), [PRIMARY, PRIMARY]);
  assertWinningReply(chunks, primaryProposals);
});

test("retryable primary HTTP failures switch once to the free Google backup", async (t) => {
  for (const status of [503, 429]) {
    await t.test(`HTTP ${status} recovers in three calls`, async (subtest) => {
      const requests = installGoogleMock(subtest, [failure(PRIMARY, status), facts(BACKUP), answer(BACKUP)]);
      const chunks = await readChunks(response());
      assert.deepEqual(requests.map((request) => request.model), [PRIMARY, BACKUP, BACKUP]);
      assert.deepEqual(requests[1].body.contents, requests[0].body.contents);
      assertWinningReply(chunks, backupProposals);
    });
  }
});

test("a failed primary after signed tool execution is discarded before a clean four-call backup", async (t) => {
  const requests = installGoogleMock(t, [
    facts(PRIMARY, primaryProposals, "failed-primary-proposal"), failure(PRIMARY, 503, "reply"),
    facts(BACKUP), answer(BACKUP),
  ]);
  const chunks = await readChunks(response());
  assert.deepEqual(requests.map((request) => request.model), [PRIMARY, PRIMARY, BACKUP, BACKUP]);
  const primaryTool = requests[1].body.contents.flatMap((content) => content.parts).find((part) => part.functionCall);
  assert.equal(primaryTool?.thoughtSignature, Buffer.from("synthetic-signature-failed-primary-proposal").toString("base64"));
  assert.deepEqual(requests[2].body.contents, requests[0].body.contents);
  assert.equal(JSON.stringify(requests[2].body.contents).includes("failed-primary-proposal"), false);
  assert.equal(JSON.stringify(chunks).includes("failed-primary-proposal"), false);
  assertWinningReply(chunks, backupProposals);
});

test("backup preserves prior questions, short user answers and existing facts across multiple turns", async (t) => {
  const history: DiagnosisRequest["messages"] = [
    { id: "synthetic-earlier-user", role: "user", parts: [{ type: "text", text: "제 부산 아파트를 증여하려고 해요." }] },
    { id: "synthetic-earlier-assistant", role: "assistant", parts: [{ type: "text", text: "누구에게 증여하시나요?" }] },
    { id: "synthetic-recipient-user", role: "user", parts: [{ type: "text", text: "아들" }] },
    { id: "synthetic-age-assistant", role: "assistant", parts: [{ type: "text", text: "아드님은 성인이신가요?" }] },
    { id: "synthetic-age-user", role: "user", parts: [{ type: "text", text: "성인 아들 1명" }] },
  ];
  const existingFacts: DiagnosisRequest["facts"] = {
    topic: { value: "증여", evidence: "증여", messageId: "synthetic-earlier-user" },
    realEstate: { value: "제 부산 아파트", evidence: "제 부산 아파트", messageId: "synthetic-earlier-user" },
  };
  const proposals: ChatPatch[] = [{ key: "adultChildren", value: "성인 아들 1명", evidence: "성인 아들 1명" }];
  const expected = { message: "성인 아드님께 증여를 준비하고 계시는군요. 언제쯤 진행하실 계획인가요?", choices: ["올해 안", "내년 이후", "아직 미정"] };
  const requests = installGoogleMock(t, [failure(PRIMARY, 503), facts(BACKUP, proposals), answer(BACKUP, expected)]);
  const chunks = await readChunks(response({ messages: history, facts: existingFacts }));
  assert.deepEqual(requests.map((request) => request.model), [PRIMARY, BACKUP, BACKUP]);
  assert.deepEqual(requests[1].body, requests[0].body);
  assert.deepEqual(requests[1].body.contents.map((content) => ({ role: content.role, text: content.parts.map((part) => part.text).join("") })),
    history.map((message) => ({ role: message.role === "assistant" ? "model" : "user", text: message.parts[0].text })));
  const instructions = requests[1].body.systemInstruction?.parts.map((part) => part.text).join("") ?? "";
  assert.ok(instructions.includes('"key":"topic"'));
  assert.ok(instructions.includes('"value":"제 부산 아파트"'));
  assertWinningReply(chunks, proposals, expected);
});

test("a JSON answer without its required fact proposal causes one clean backup", async (t) => {
  const requests = installGoogleMock(t, [
    { model: PRIMARY, stage: "facts", respond: answer(PRIMARY).respond }, facts(BACKUP), answer(BACKUP),
  ]);
  const chunks = await readChunks(response());
  assert.deepEqual(requests.map((request) => request.model), [PRIMARY, BACKUP, BACKUP]);
  assertWinningReply(chunks, backupProposals);
});

test("repeated fact tool calls invalidate the primary even when its final JSON is valid", async (t) => {
  const repeatedFacts: Step = {
    model: PRIMARY,
    stage: "facts",
    respond: () => googleSse([{
      candidates: [{
        content: { role: "model", parts: ["duplicate-primary-one", "duplicate-primary-two"].map((id) => ({
          functionCall: { id, name: "proposeFacts", args: { facts: primaryProposals } },
          thoughtSignature: Buffer.from(`synthetic-signature-${id}`).toString("base64"),
        })) },
        finishReason: "STOP",
      }],
    }]),
  };
  const requests = installGoogleMock(t, [repeatedFacts, answer(PRIMARY), facts(BACKUP), answer(BACKUP)]);
  const chunks = await readChunks(response());
  assert.deepEqual(requests.map((request) => request.model), [PRIMARY, PRIMARY, BACKUP, BACKUP]);
  assert.equal(JSON.stringify(chunks).includes("duplicate-primary"), false);
  assertWinningReply(chunks, backupProposals);
});

test("partial, malformed and invalid-schema primary replies never leak into the winning response", async (t) => {
  const discarded = "synthetic-discarded-primary-text";
  const invalidReplies: Array<{ name: string; respond: Step["respond"] }> = [
    { name: "incomplete JSON", respond: () => googleSse([googleText(`{\"message\":\"${discarded}`, "STOP")]) },
    { name: "schema-invalid JSON", respond: () => googleSse([googleText(JSON.stringify({ message: discarded, choices: 12 }), "STOP")]) },
    { name: "plain text", respond: () => googleSse([googleText(discarded, "STOP")]) },
    {
      name: "partial JSON followed by stream failure",
      respond: () => {
        let sent = false;
        return new Response(new ReadableStream<Uint8Array>({
          pull(controller) {
            if (sent) {
              controller.error(Object.assign(new Error("synthetic-private-provider-detail"), { statusCode: 503 }));
              return;
            }
            sent = true;
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(googleText(`{\"message\":\"${discarded}`))}\n\n`));
          },
        }), { headers: { "Content-Type": "text/event-stream" } });
      },
    },
  ];
  for (const scenario of invalidReplies) {
    await t.test(scenario.name, async (subtest) => {
      const requests = installGoogleMock(subtest, [
        facts(PRIMARY, primaryProposals, "failed-primary-proposal"),
        { model: PRIMARY, stage: "reply", respond: scenario.respond },
        facts(BACKUP), answer(BACKUP),
      ]);
      const chunks = await readChunks(response());
      assert.deepEqual(requests.map((request) => request.model), [PRIMARY, PRIMARY, BACKUP, BACKUP]);
      assert.equal(JSON.stringify(chunks).includes(discarded), false);
      assert.equal(JSON.stringify(chunks).includes("failed-primary-proposal"), false);
      assertWinningReply(chunks, backupProposals);
    });
  }
});

test("authentication, billing and client failures never invoke the backup", async (t) => {
  const cases: Array<[number, string]> = [
    [400, "AI_INVALID_REQUEST"], [401, "AI_AUTHENTICATION_FAILED"], [402, "AI_CREDIT_REQUIRED"],
    [403, "AI_AUTHENTICATION_FAILED"], [404, "AI_MODEL_UNAVAILABLE"], [422, "AI_UNAVAILABLE"],
  ];
  for (const [status, code] of cases) {
    await t.test(`HTTP ${status} makes one direct call`, async (subtest) => {
      const requests = installGoogleMock(subtest, [failure(PRIMARY, status)]);
      const chunks = await readChunks(response());
      assert.equal(requests.length, 1);
      assertOnlyPublicFailure(chunks, code);
    });
  }
});

test("a failed backup ends the request without a third attempt or provider-detail leak", async (t) => {
  const requests = installGoogleMock(t, [failure(PRIMARY, 503), failure(BACKUP, 429)]);
  const chunks = await readChunks(response());
  assert.deepEqual(requests.map((request) => request.model), [PRIMARY, BACKUP]);
  assertOnlyPublicFailure(chunks, "AI_RATE_LIMITED");
});

test("an injected short attempt timeout aborts the primary and permits one backup", { timeout: 3_000 }, async (t) => {
  const started = deferred();
  const aborted = deferred();
  const requests = installGoogleMock(t, [pendingRequest(started, aborted), facts(BACKUP), answer(BACKUP)]);
  const chunks = await readChunks(response({ attemptTimeoutMs: 40 }));
  await aborted.promise;
  assert.deepEqual(requests.map((request) => request.model), [PRIMARY, BACKUP, BACKUP]);
  assert.equal(requests[0].signal.aborted, true);
  assertWinningReply(chunks, backupProposals);
});

test("request abort stops the running attempt and prevents fallback", { timeout: 3_000 }, async (t) => {
  const started = deferred();
  const aborted = deferred();
  const abortController = new AbortController();
  const requests = installGoogleMock(t, [pendingRequest(started, aborted)]);
  const result = response({ abortSignal: abortController.signal });
  const reading = readChunks(result);
  await started.promise;
  abortController.abort();
  await aborted.promise;
  const chunks = await reading;
  assert.equal(requests.length, 1);
  assert.equal(chunks.some((chunk) => chunk.type === "text-delta" || chunk.type === "tool-output-available"), false);
});

test("response cancellation aborts the running provider request and prevents fallback", { timeout: 3_000 }, async (t) => {
  const started = deferred();
  const aborted = deferred();
  const requests = installGoogleMock(t, [pendingRequest(started, aborted)]);
  const result = response();
  assert.ok(result.body);
  await started.promise;
  await result.body.cancel();
  await aborted.promise;
  assert.equal(requests.length, 1);
  assert.equal(requests[0].signal.aborted, true);
});
