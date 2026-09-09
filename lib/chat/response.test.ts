import assert from "node:assert/strict";
import test from "node:test";
import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { ChatOnFinishCallback, UIMessage, UIMessageChunk } from "ai";
import { getChatErrorNotice, isIncompleteChatResponse } from "./response";

type ChatFinish = Parameters<ChatOnFinishCallback<UIMessage>>[0];

function createSyntheticChat(responses: UIMessageChunk[][]) {
  const completions: ChatFinish[] = [];
  const chat = new Chat<UIMessage>({
    transport: {
      sendMessages: async () => {
        const chunks = responses.shift();
        assert.ok(chunks, "Unexpected additional model request");
        return new ReadableStream<UIMessageChunk>({
          start(controller) {
            for (const chunk of chunks) controller.enqueue(chunk);
            controller.close();
          },
        });
      },
      reconnectToStream: async () => null,
    },
    onFinish: (completion) => { completions.push(completion); },
  });
  return { chat, completions };
}

function answerChunks(text: string, finishReason: "stop" | "error" = "stop"): UIMessageChunk[] {
  return [
    { type: "start", messageId: "answer" },
    { type: "start-step" },
    { type: "text-start", id: "answer-text" },
    { type: "text-delta", id: "answer-text", delta: text },
    { type: "text-end", id: "answer-text" },
    { type: "finish-step" },
    { type: "finish", finishReason },
  ];
}

test("terminal SSE error after repeated tool inputs is surfaced even when SDK error is empty", async () => {
  const chunks: UIMessageChunk[] = [{ type: "start", messageId: "silent-failure" }, { type: "start-step" }];
  for (let index = 0; index < 3; index += 1) {
    const toolCallId = `facts-${index}`;
    chunks.push(
      { type: "tool-input-start", toolCallId, toolName: "proposeFacts" },
      { type: "tool-input-delta", toolCallId, inputTextDelta: '{"facts":[]}' },
      { type: "tool-input-available", toolCallId, toolName: "proposeFacts", input: { facts: [] } },
    );
  }
  chunks.push({ type: "finish-step" }, { type: "finish", finishReason: "error" });
  const { chat, completions } = createSyntheticChat([chunks, answerChunks("이번 증여는 언제쯤 생각하고 계세요?")]);
  await chat.sendMessage({ text: "딸에게 증여하려고 해요." });
  assert.equal(chat.status, "ready");
  assert.equal(chat.error, undefined);
  assert.equal(completions.length, 1);
  assert.equal(completions[0].isError, false);
  assert.equal(completions[0].finishReason, "error");
  assert.equal(isIncompleteChatResponse(completions[0]), true);

  await chat.regenerate();
  assert.equal(completions.length, 2);
  assert.equal(isIncompleteChatResponse(completions[1]), false);
});

test("empty or whitespace-only successful finishes are incomplete", async () => {
  const emptyChunks: UIMessageChunk[] = [
    { type: "start", messageId: "empty-answer" },
    { type: "start-step" },
    { type: "finish-step" },
    { type: "finish", finishReason: "stop" },
  ];
  for (const chunks of [emptyChunks, answerChunks(" \n ")]) {
    const { chat, completions } = createSyntheticChat([chunks]);
    await chat.sendMessage({ text: "상속" });
    assert.equal(chat.error, undefined);
    assert.equal(isIncompleteChatResponse(completions[0]), true);
  }
});

test("unfinished or invalid choice payloads cannot count as completed visible answers", async () => {
  for (const text of ['{"message":"어떤 재산인가요?","choices":["부동산"', '{"message":"어떤 재산인가요?","choices":"부동산"}']) {
    const { chat, completions } = createSyntheticChat([answerChunks(text)]);
    await chat.sendMessage({ text: "아들" });
    assert.equal(isIncompleteChatResponse(completions[0]), true);
  }
  const { chat, completions } = createSyntheticChat([answerChunks(JSON.stringify({ message: "어떤 재산인가요?", choices: ["부동산", "현금"] }))]);
  await chat.sendMessage({ text: "아들" });
  assert.equal(isIncompleteChatResponse(completions[0]), false);
});

test("a fact-only result needs an answer, while the completed two-step response succeeds", async () => {
  const factStep: UIMessageChunk[] = [
    { type: "start", messageId: "facts-answer" },
    { type: "start-step" },
    { type: "tool-input-available", toolCallId: "facts", toolName: "proposeFacts", input: { facts: [] } },
    { type: "tool-output-available", toolCallId: "facts", output: { proposals: [] } },
    { type: "finish-step" },
  ];
  const responses: UIMessageChunk[][] = [
    [...factStep, { type: "finish", finishReason: "stop" }],
    [...factStep, ...answerChunks("어떤 재산을 물려주려고 하세요?").slice(1)],
  ];
  const { chat, completions } = createSyntheticChat(responses);
  await chat.sendMessage({ text: "증여" });
  assert.equal(isIncompleteChatResponse(completions[0]), true);
  await chat.regenerate();
  assert.equal(isIncompleteChatResponse(completions[1]), false);
});

test("partial text cannot hide an error finish and explicit cancellation retains its own notice", async () => {
  const { chat, completions } = createSyntheticChat([answerChunks("알려주신 내용을", "error")]);
  await chat.sendMessage({ text: "양도" });
  assert.equal(isIncompleteChatResponse(completions[0]), true);
  assert.equal(isIncompleteChatResponse({ ...completions[0], isAbort: true }), false);
});

test("SSE rate-limit errors show a fixed notice without provider text", async () => {
  const { chat, completions } = createSyntheticChat([[
    { type: "start", messageId: "rate-limited" },
    { type: "error", errorText: "[AI_RATE_LIMITED] private-provider-token-and-input" },
  ]]);
  await chat.sendMessage({ text: "아들" });
  assert.equal(chat.status, "error");
  assert.equal(isIncompleteChatResponse(completions[0]), true);
  assert.equal(getChatErrorNotice(chat.error), "AI 요청 한도에 도달했어요. 잠시 후 다시 시도해 주세요. 입력한 내용은 그대로 남아 있어요.");
});

test("HTTP JSON error codes are recognized through the real transport with a local response", async () => {
  let localResponses = 0;
  const chat = new Chat<UIMessage>({
    transport: new DefaultChatTransport({
      api: "https://example.test/api/diagnosis",
      fetch: async () => {
        localResponses += 1;
        return Response.json({ error: { code: "AI_RATE_LIMITED", message: "private-provider-token-and-input" } }, { status: 429 });
      },
    }),
  });
  await chat.sendMessage({ text: "아들" });
  assert.equal(localResponses, 1);
  assert.equal(chat.status, "error");
  assert.equal(getChatErrorNotice(chat.error), "AI 요청 한도에 도달했어요. 잠시 후 다시 시도해 주세요. 입력한 내용은 그대로 남아 있어요.");
});

test("unknown or embedded codes and raw provider content never become notices", () => {
  const generic = getChatErrorNotice(undefined);
  for (const message of [
    "private-provider-token-and-input 429",
    "private-provider-token-and-input [AI_RATE_LIMITED]",
    "[AI_RATE_LIMITED_EXTRA] private-provider-token-and-input",
    "[AI_RATE_LIMITED]suffix-without-boundary",
    "[AI_CREDIT_REQUIRED] private-provider-token-and-input",
    JSON.stringify({ error: { message: "[AI_RATE_LIMITED] private-provider-token-and-input" } }),
    JSON.stringify({ code: "AI_RATE_LIMITED", message: "private-provider-token-and-input" }),
    JSON.stringify({ error: { code: "UNRECOGNIZED", message: "private-provider-token-and-input" } }),
    "[AI_RATE_LIMITED] " + "x".repeat(8_192),
  ]) {
    assert.equal(getChatErrorNotice(new Error(message)), generic);
  }
  assert.equal(generic.includes("private-provider-token-and-input"), false);
});
