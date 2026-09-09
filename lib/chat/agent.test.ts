import assert from "node:assert/strict";
import test from "node:test";
import { createAgentUIStreamResponse, type UIMessageChunk } from "ai";
import { createDiagnosisAgent } from "./agent";
import { getAssistantReply } from "./choices";
import type { ChatPatch } from "./intake";
import { getDiagnosisPublicErrorCode, type DiagnosisRequest } from "./server";

const MODEL = "gemini-3.8-flash";
const SYNTHETIC_KEY = "synthetic-google-key-never-valid";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse`;
const messages: DiagnosisRequest["messages"] = [{
  id: "synthetic-user",
  role: "user",
  parts: [{ type: "text", text: "증여를 준비하고 있어요. 제 아파트를 아들에게 주려고 해요." }],
}];

type GoogleRequestBody = {
  generationConfig: {
    maxOutputTokens: number;
    thinkingConfig: { thinkingLevel: string };
    responseMimeType: string;
    responseSchema: { properties: Record<string, unknown> };
  };
  toolConfig: { functionCallingConfig: { mode: string } };
  tools: Array<{ functionDeclarations?: Array<{ name: string }> }>;
  contents: Array<{
    role: string;
    parts: Array<{
      thoughtSignature?: string;
      functionCall?: { name: string };
      functionResponse?: { name: string; response: { content: { proposals: ChatPatch[] } } };
    }>;
  }>;
};

function googleSse(chunks: unknown[]): Response {
  const body = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("");
  return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
}

async function runAgent(): Promise<UIMessageChunk[]> {
  const response = await createAgentUIStreamResponse({
    agent: createDiagnosisAgent({ apiKey: SYNTHETIC_KEY, model: MODEL, messages, facts: {} }),
    uiMessages: messages,
    sendReasoning: false,
    onError: (error) => `[${getDiagnosisPublicErrorCode(error)}]`,
  });
  const body = await response.text();
  return body.split("\n").flatMap((line) => {
    if (!line.startsWith("data: ") || line === "data: [DONE]") return [];
    return [JSON.parse(line.slice(6)) as UIMessageChunk];
  });
}

test("Google SDK preserves quoted facts, thinking signature and choice reply across exactly two direct calls", async (t) => {
  const accepted: ChatPatch[] = [
    { key: "topic", value: "증여", evidence: "증여" },
    { key: "realEstate", value: "제 아파트", evidence: "제 아파트" },
  ];
  const rejected: ChatPatch = { key: "debt", value: "2억원", evidence: "대출 2억원" };
  const signature = "c3ludGhldGljLXRoaW5raW5nLXNpZ25hdHVyZQ==";
  const reply = { message: "아드님께 아파트를 주려고 하시는군요. 아드님은 성인이신가요?", choices: ["성인", "미성년자", "잘 모르겠어요"] };
  const replyText = JSON.stringify(reply);
  const requests: GoogleRequestBody[] = [];

  // Replace fetch entirely: even an unexpected URL cannot reach the network.
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    assert.equal(request.url, ENDPOINT);
    assert.equal(request.method, "POST");
    assert.equal(request.headers.get("x-goog-api-key"), SYNTHETIC_KEY);
    requests.push(JSON.parse(await request.text()) as GoogleRequestBody);
    assert.ok(requests.length <= 2, "Unexpected retry or extra inference call");
    if (requests.length === 1) {
      return googleSse([{
        candidates: [{
          content: { role: "model", parts: [{
            functionCall: { name: "proposeFacts", args: { facts: [...accepted, rejected] } },
            thoughtSignature: signature,
          }] },
          finishReason: "STOP",
        }],
        usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 15, totalTokenCount: 35 },
      }]);
    }
    return googleSse([
      { candidates: [{ content: { role: "model", parts: [{ text: replyText.slice(0, 30) }] } }] },
      {
        candidates: [{ content: { role: "model", parts: [{ text: replyText.slice(30) }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 35, candidatesTokenCount: 25, totalTokenCount: 60 },
      },
    ]);
  });

  const chunks = await runAgent();
  assert.equal(requests.length, 2);
  assert.equal(chunks.some((chunk) => chunk.type === "error"), false);
  for (const request of requests) {
    assert.equal(request.generationConfig.maxOutputTokens, 3_000);
    assert.equal(request.generationConfig.thinkingConfig.thinkingLevel, "low");
    assert.equal(request.generationConfig.responseMimeType, "application/json");
    assert.ok(request.generationConfig.responseSchema.properties.message);
    assert.ok(request.generationConfig.responseSchema.properties.choices);
  }
  assert.ok(requests[0].tools.some((tool) => tool.functionDeclarations?.some((declaration) => declaration.name === "proposeFacts")));
  assert.equal(requests[0].toolConfig.functionCallingConfig.mode, "AUTO");
  assert.equal(requests[1].toolConfig.functionCallingConfig.mode, "NONE");
  const replayedParts = requests[1].contents.flatMap((content) => content.parts);
  assert.equal(replayedParts.find((part) => part.functionCall?.name === "proposeFacts")?.thoughtSignature, signature);
  assert.deepEqual(replayedParts.find((part) => part.functionResponse?.name === "proposeFacts")?.functionResponse?.response.content, { proposals: accepted });

  const toolOutput = chunks.find((chunk) => chunk.type === "tool-output-available");
  assert.ok(toolOutput?.type === "tool-output-available");
  assert.deepEqual(toolOutput.output, { proposals: accepted });
  const visibleText = chunks.flatMap((chunk) => chunk.type === "text-delta" ? [chunk.delta] : []).join("");
  assert.deepEqual(getAssistantReply(visibleText), reply);
  assert.ok(chunks.some((chunk) => chunk.type === "finish" && chunk.finishReason === "stop"));
});

test("Google SDK authentication and quota failures never retry or fall back to another provider", async (t) => {
  for (const status of [403, 429]) {
    await t.test(`HTTP ${status} makes one direct request`, async (subtest) => {
      let calls = 0;
      subtest.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
        calls += 1;
        assert.equal(new Request(input, init).url, ENDPOINT);
        return Response.json({ error: {
          code: status,
          status: status === 429 ? "RESOURCE_EXHAUSTED" : "PERMISSION_DENIED",
          message: "synthetic-private-provider-detail",
        } }, { status });
      });
      const chunks = await runAgent();
      assert.equal(calls, 1);
      const error = chunks.find((chunk) => chunk.type === "error");
      assert.ok(error?.type === "error");
      assert.equal(error.errorText, status === 429 ? "[AI_RATE_LIMITED]" : "[AI_AUTHENTICATION_FAILED]");
      assert.equal(JSON.stringify(chunks).includes("synthetic-private-provider-detail"), false);
      assert.equal(chunks.some((chunk) => chunk.type === "text-delta" || chunk.type === "tool-output-available"), false);
    });
  }
});
