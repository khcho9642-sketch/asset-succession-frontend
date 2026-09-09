import assert from "node:assert/strict";
import test from "node:test";
import { Chat } from "@ai-sdk/react";
import type { ChatOnFinishCallback, UIMessage, UIMessageChunk } from "ai";
import { isIncompleteChatResponse } from "./response";

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
