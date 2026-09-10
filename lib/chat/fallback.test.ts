import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { Chat } from "@ai-sdk/react";
import type { UIMessage, UIMessageChunk } from "ai";
import { getAssistantReply, type DiagnosisReply } from "./choices";
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
  message: "아드님은 성인이신가요?",
  choices: ["성인", "미성년자", "잘 모르겠어요"],
  selectionMode: "single",
};

type GoogleRequestBody = {
  generationConfig: {
    maxOutputTokens: number;
    thinkingConfig: { thinkingLevel: string };
    responseMimeType?: string;
    responseSchema?: { required?: string[]; properties: Record<string, unknown> };
    responseJsonSchema?: unknown;
  };
  toolConfig?: unknown;
  tools?: Array<{ functionDeclarations?: Array<{ name: string }> }>;
  systemInstruction?: { parts: Array<{ text: string }> };
  contents: Array<{ role: string; parts: Array<{ text?: string }> }>;
};

type RequestLog = { model: string; body: GoogleRequestBody; signal: AbortSignal };
type Step = {
  model: string;
  respond: (request: Request) => Response | Promise<Response>;
};
type ResponseOptions = Partial<Pick<Parameters<typeof createDiagnosisResponse>[0], "abortSignal" | "attemptTimeoutMs" | "headers" | "messages" | "facts">>;

function googleResponse(text: string, finishReason = "STOP"): Response {
  return Response.json({
    candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason }],
    usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 15, totalTokenCount: 35 },
  });
}

function turn(model: string, proposals = backupProposals, expected = reply): Step {
  return {
    model,
    respond: () => googleResponse(JSON.stringify({ facts: proposals, ...expected })),
  };
}

function raw(model: string, text: string, finishReason = "STOP"): Step {
  return { model, respond: () => googleResponse(text, finishReason) };
}

function failure(model: string, status: number): Step {
  return {
    model,
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
    assert.equal(request.url, `https://generativelanguage.googleapis.com/v1beta/models/${step.model}:generateContent`);
    assert.equal(request.method, "POST");
    assert.equal(request.headers.get("x-goog-api-key"), SYNTHETIC_KEY);
    assert.equal(body.generationConfig.maxOutputTokens, 3_000);
    assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, "low");
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.deepEqual(body.generationConfig.responseSchema?.required, ["facts", "message", "choices", "selectionMode"]);
    assert.ok(body.generationConfig.responseSchema?.properties.facts);
    assert.ok(body.generationConfig.responseSchema?.properties.message);
    assert.ok(body.generationConfig.responseSchema?.properties.choices);
    assert.ok(body.generationConfig.responseSchema?.properties.selectionMode);
    assert.equal(body.generationConfig.responseJsonSchema, undefined);
    assert.ok(!body.tools?.length, "Unified structured request must not expose tools to the model");
    assert.equal(body.toolConfig, undefined);
    return step.respond(request);
  });
  return requests;
}

function response(options: ResponseOptions = {}) {
  return createDiagnosisResponse({ apiKey: SYNTHETIC_KEY, model: PRIMARY, messages, facts: {}, ...options });
}

async function readChunks(result: Response): Promise<UIMessageChunk[]> {
  const body = await result.text();
  assert.equal(body.match(/data: \[DONE\]/g)?.length, 1);
  return body.split("\n").flatMap((line) => {
    if (!line.startsWith("data: ") || line === "data: [DONE]") return [];
    return [JSON.parse(line.slice(6)) as UIMessageChunk];
  });
}

function assertWinningReply(chunks: UIMessageChunk[], proposals: ChatPatch[], expected = reply) {
  assert.deepEqual(chunks.map((chunk) => chunk.type), [
    "start", "start-step", "tool-input-available", "tool-output-available",
    "text-start", "text-delta", "text-end", "finish-step", "finish",
  ]);
  const start = chunks[0];
  const input = chunks[2];
  const output = chunks[3];
  const textStart = chunks[4];
  const textDelta = chunks[5];
  const textEnd = chunks[6];
  const finish = chunks[8];
  assert.ok(start.type === "start" && start.messageId?.startsWith("diagnosis-"));
  assert.ok(input.type === "tool-input-available");
  assert.equal(input.toolName, "proposeFacts");
  assert.deepEqual(input.input, { facts: proposals });
  assert.ok(output.type === "tool-output-available");
  assert.equal(output.toolCallId, input.toolCallId);
  assert.deepEqual(output.output, { proposals });
  assert.ok(textStart.type === "text-start");
  assert.ok(textDelta.type === "text-delta");
  assert.ok(textEnd.type === "text-end");
  assert.equal(textDelta.id, textStart.id);
  assert.equal(textEnd.id, textStart.id);
  assert.equal(textDelta.delta, JSON.stringify(expected));
  assert.deepEqual(getAssistantReply(textDelta.delta), expected);
  assert.ok(finish.type === "finish" && finish.finishReason === "stop");
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

test("fallback returns immediate SSE and one structured primary call with canonical UI chunks", async (t) => {
  const requests = installGoogleMock(t, [turn(PRIMARY, primaryProposals)]);
  const result = response({ headers: { "x-synthetic-header": "preserved" } });
  assert.ok(result instanceof Response);
  assert.match(result.headers.get("content-type") ?? "", /text\/event-stream/);
  assert.equal(result.headers.get("x-vercel-ai-ui-message-stream"), "v1");
  assert.equal(result.headers.get("x-synthetic-header"), "preserved");
  const chunks = await readChunks(result);
  assert.deepEqual(requests.map((request) => request.model), [PRIMARY]);
  assertWinningReply(chunks, primaryProposals);
});

test("canonical chunks become the typed fact part and visible reply consumed by the real Chat client", async (t) => {
  installGoogleMock(t, [turn(PRIMARY, primaryProposals)]);
  const chunks = await readChunks(response());
  const chat = new Chat<UIMessage>({
    transport: {
      sendMessages: async () => new ReadableStream<UIMessageChunk>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(chunk);
          controller.close();
        },
      }),
      reconnectToStream: async () => null,
    },
  });
  await chat.sendMessage({ text: messages[0].parts[0].text });
  const assistant = chat.messages.at(-1);
  assert.equal(assistant?.role, "assistant");
  const toolPart = assistant?.parts.find((part) => part.type === "tool-proposeFacts");
  assert.ok(toolPart?.type === "tool-proposeFacts" && toolPart.state === "output-available");
  assert.deepEqual(toolPart.input, { facts: primaryProposals });
  assert.deepEqual(toolPart.output, { proposals: primaryProposals });
  const visible = assistant?.parts.filter((part) => part.type === "text").map((part) => part.text).join("") ?? "";
  assert.deepEqual(getAssistantReply(visible), reply);
  assert.equal(chat.status, "ready");
  assert.equal(chat.error, undefined);
});

test("server grounding removes invented and duplicate facts without a second model call", async (t) => {
  const modelFacts: ChatPatch[] = [
    ...primaryProposals,
    { key: "topic", value: "아파트", evidence: "아파트" },
    { key: "debt", value: "대출 2억", evidence: "대출 2억" },
  ];
  const requests = installGoogleMock(t, [turn(PRIMARY, modelFacts)]);
  const chunks = await readChunks(response());
  assert.equal(requests.length, 1);
  assertWinningReply(chunks, primaryProposals);
  assert.equal(JSON.stringify(chunks).includes("대출 2억"), false);
});

test("retryable primary HTTP failures switch once to the free Google backup", async (t) => {
  for (const status of [503, 429]) {
    await t.test(`HTTP ${status} recovers in two calls`, async (subtest) => {
      const requests = installGoogleMock(subtest, [failure(PRIMARY, status), turn(BACKUP)]);
      const chunks = await readChunks(response());
      assert.deepEqual(requests.map((request) => request.model), [PRIMARY, BACKUP]);
      assert.deepEqual(requests[1].body, requests[0].body);
      assertWinningReply(chunks, backupProposals);
    });
  }
});

test("backup preserves prior questions, short user answers and existing facts across turns", async (t) => {
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
  const expected = { message: "언제쯤 진행하실 계획인가요?", choices: ["올해 안", "내년 이후", "아직 미정"], selectionMode: "single" as const };
  const requests = installGoogleMock(t, [failure(PRIMARY, 503), turn(BACKUP, proposals, expected)]);
  const chunks = await readChunks(response({ messages: history, facts: existingFacts }));
  assert.deepEqual(requests.map((request) => request.model), [PRIMARY, BACKUP]);
  assert.deepEqual(requests[1].body, requests[0].body);
  assert.deepEqual(requests[1].body.contents.map((content) => ({ role: content.role, text: content.parts.map((part) => part.text).join("") })),
    history.map((message) => ({ role: message.role === "assistant" ? "model" : "user", text: message.parts[0].text })));
  const instructions = requests[1].body.systemInstruction?.parts.map((part) => part.text).join("") ?? "";
  assert.ok(instructions.includes('"key":"topic"'));
  assert.ok(instructions.includes('"value":"제 부산 아파트"'));
  assertWinningReply(chunks, proposals, expected);
});

test("malformed and strict-schema-invalid primary output never leaks before a clean backup", async (t) => {
  const discarded = "synthetic-discarded-primary-text";
  const invalid = [
    `{"facts":[],"message":"${discarded}`,
    JSON.stringify({ message: discarded, choices: [] }),
    JSON.stringify({ facts: [], message: discarded, choices: 12 }),
    JSON.stringify({ facts: [], message: discarded, choices: [], hidden: "not-allowed" }),
    discarded,
  ];
  for (const text of invalid) {
    await t.test(text.slice(0, 30), async (subtest) => {
      const requests = installGoogleMock(subtest, [raw(PRIMARY, text), turn(BACKUP)]);
      const chunks = await readChunks(response());
      assert.deepEqual(requests.map((request) => request.model), [PRIMARY, BACKUP]);
      assert.equal(JSON.stringify(chunks).includes(discarded), false);
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
  const requests = installGoogleMock(t, [pendingRequest(started, aborted), turn(BACKUP)]);
  const chunks = await readChunks(response({ attemptTimeoutMs: 40 }));
  await aborted.promise;
  assert.deepEqual(requests.map((request) => request.model), [PRIMARY, BACKUP]);
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
