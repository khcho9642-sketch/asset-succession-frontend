import assert from "node:assert/strict";
import test from "node:test";
import { Chat } from "@ai-sdk/react";
import type { UIMessage, UIMessageChunk } from "ai";
import { diagnosisReplySchema, getAssistantReply, type DiagnosisReply } from "./choices";

test("structured replies require strict complete content and trim labels", () => {
  assert.deepEqual(getAssistantReply('{"message":"  누구에게 주려고 하세요?  ","choices":[" 아들 ","딸"]}'), {
    message: "누구에게 주려고 하세요?", choices: ["아들", "딸"],
  });
  assert.deepEqual(getAssistantReply('{"message":"어떤 재산이 있나요?","choices":["부동산","주식"],"selectionMode":"multiple"}'), {
    message: "어떤 재산이 있나요?", choices: ["부동산", "주식"], selectionMode: "multiple",
  });
  for (const choices of [[], ["아직 미정이에요"]]) {
    assert.equal(diagnosisReplySchema.safeParse({ message: "편하게 말씀해 주세요.", choices }).success, true);
  }
  assert.equal(diagnosisReplySchema.safeParse({ message: "가".repeat(4_000), choices: ["나".repeat(60)] }).success, true);
  for (const invalid of [
    { message: " ", choices: [] },
    { message: "가".repeat(4_001), choices: [] },
    { message: "알려주세요.", choices: [" "] },
    { message: "알려주세요.", choices: ["가".repeat(61)] },
    { message: "알려주세요.", choices: ["1", "2", "3", "4", "5", "6"] },
    { message: "알려주세요.", choices: [{ label: "아들", value: "다른 값" }] },
    { message: "알려주세요.", choices: ["아들"], selectionMode: "many" },
    { message: "알려주세요.", choices: ["아들"], hiddenValue: "다른 값" },
    { message: "알려주세요." },
    { choices: [] },
  ]) {
    assert.equal(getAssistantReply(JSON.stringify(invalid)), null);
  }
});

test("duplicate labels are reduced in order without discarding the answer", () => {
  assert.deepEqual(getAssistantReply(JSON.stringify({ message: "누구에게 주려고 하세요?", choices: ["아들", " 아들 ", "딸", "딸"] })), {
    message: "누구에게 주려고 하세요?", choices: ["아들", "딸"],
  });
});

test("partial malformed fenced and oversized JSON is never treated as legacy text", () => {
  const complete = JSON.stringify({ message: "어떤 재산인가요?", choices: ["현금·예금", "아파트"] });
  for (let length = 1; length < complete.length; length += 1) {
    assert.equal(getAssistantReply(complete.slice(0, length)), null);
  }
  for (const invalid of [
    "", " \n ", "{", '{"message":}', complete + " trailing text",
    "```json\n" + complete + "\n```", "~~~json\n" + complete + "\n~~~",
    "답변입니다.\n```json\n" + complete + "\n```",
    "답변입니다. " + complete,
    "[]", "null", "true", "42", '"plain JSON string"',
    '{"message":"안내","choices":[],"__proto__":{"polluted":true}}',
    " ".repeat(32_000) + complete,
  ]) {
    assert.equal(getAssistantReply(invalid), null);
  }
});

test("ordinary historical assistant text remains available without choices", () => {
  const oldText = "  아드님께 어떤 재산을 주려고 하세요?\n금액을 모르시면 나중에 알려주셔도 돼요.  ";
  assert.deepEqual(getAssistantReply(oldText), { message: oldText, choices: [] });
  assert.deepEqual(getAssistantReply("1. 아파트\n2. 예금"), { message: "1. 아파트\n2. 예금", choices: [] });
  assert.equal(getAssistantReply("가".repeat(4_001)), null);
});

test("the SDK accepts three chunked reply turns with a visible choice and free text as user input", async () => {
  const replies: DiagnosisReply[] = [
    { message: "누구에게 재산을 주려고 하세요?", choices: ["아들", "딸", "배우자"] },
    { message: "아드님께 어떤 재산을 주려고 하세요?", choices: ["현금·예금", "아파트", "회사 지분"] },
    { message: "이번 증여는 언제쯤 생각하고 계세요?", choices: ["올해", "내년", "아직 미정이에요"] },
  ];
  const sentUserTexts: string[] = [];
  const completedReplies: Array<DiagnosisReply | null> = [];
  let requestCount = 0;
  const chat = new Chat<UIMessage>({
    transport: {
      sendMessages: async ({ messages }) => {
        const last = messages[messages.length - 1];
        assert.equal(last.role, "user");
        sentUserTexts.push(last.parts.filter((part) => part.type === "text").map((part) => part.text).join(""));
        const reply = replies[requestCount];
        assert.ok(reply, "No extra inference requests are allowed in this synthetic test");
        requestCount += 1;
        const raw = JSON.stringify(reply);
        return new ReadableStream<UIMessageChunk>({
          start(controller) {
            controller.enqueue({ type: "start", messageId: `reply-${requestCount}` });
            controller.enqueue({ type: "start-step" });
            controller.enqueue({ type: "text-start", id: "reply-json" });
            for (let offset = 0; offset < raw.length; offset += 7) {
              controller.enqueue({ type: "text-delta", id: "reply-json", delta: raw.slice(offset, offset + 7) });
            }
            controller.enqueue({ type: "text-end", id: "reply-json" });
            controller.enqueue({ type: "finish-step" });
            controller.enqueue({ type: "finish", finishReason: "stop" });
            controller.close();
          },
        });
      },
      reconnectToStream: async () => null,
    },
    onFinish: ({ message, isError }) => {
      assert.equal(isError, false);
      const raw = message.parts.filter((part) => part.type === "text").map((part) => part.text).join("");
      completedReplies.push(getAssistantReply(raw));
    },
  });

  await chat.sendMessage({ text: "증여" });
  assert.deepEqual(completedReplies[0], replies[0]);
  const visibleChoice = completedReplies[0]?.choices[0];
  assert.equal(visibleChoice, "아들");
  await chat.sendMessage({ text: visibleChoice! });
  assert.deepEqual(completedReplies[1], replies[1]);
  await chat.sendMessage({ text: "예금 2억 정도를 생각하고 있어요." });
  assert.deepEqual(completedReplies[2], replies[2]);
  assert.deepEqual(sentUserTexts, ["증여", "아들", "예금 2억 정도를 생각하고 있어요."]);
  assert.equal(requestCount, 3);
  assert.equal(chat.status, "ready");
  assert.equal(chat.error, undefined);
});
