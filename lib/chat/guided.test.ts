import assert from "node:assert/strict";
import test from "node:test";
import { getGuidedChatTurn } from "./guided";
import { applyChatPatches, createChatState, type ChatState } from "./intake";

function advance(state: ChatState, text: string) {
  const turn = getGuidedChatTurn(state, text);
  assert.ok(turn);
  const id = `user-${state.messages.length}`;
  let next: ChatState = {
    ...state,
    messages: [...state.messages, { id, role: "user", text, created_at: "2026-09-09T00:00:00.000Z" }],
  };
  next = applyChatPatches(next, turn.patches, id);
  next = {
    ...next,
    messages: [...next.messages, { id: `assistant-${state.messages.length}`, role: "assistant", text: JSON.stringify(turn.reply), created_at: "2026-09-09T00:00:01.000Z" }],
  };
  return { state: next, reply: turn.reply };
}

test("inheritance button path answers three common choices without an AI request", () => {
  const first = advance(createChatState(), "상속");
  assert.deepEqual(first.reply, {
    message: "상속은 현재 어느 단계인가요?",
    choices: ["미리 준비 중이에요", "이미 상속이 발생했어요", "아직 잘 모르겠어요"],
  });
  const second = advance(first.state, "미리 준비 중이에요");
  assert.equal(second.reply.message, "누구의 재산을 준비하고 계세요?");
  const third = advance(second.state, "아버지");
  assert.equal(third.reply.message, "어떤 재산이 있나요?");
  assert.equal(third.reply.selectionMode, "multiple");
  assert.equal(third.reply.inputMode, "assetAmounts");
  const fourth = advance(third.state, "재산 전체:\n부동산: 25억 원\n예금·현금: 10억 원\n주식: 금액 모름");
  assert.equal(fourth.reply.message, "재산 소유자의 배우자가 계신가요?");
  assert.equal(fourth.state.facts.realEstate?.value, "부동산: 25억 원");
  assert.equal(fourth.state.facts.financialAssets?.value, "예금·현금: 10억 원\n주식: 금액 모름");
  assert.equal(third.state.facts.topic?.value, "상속");
  assert.equal(third.state.facts.timing?.value, "미리 준비 중이에요");
  assert.equal(third.state.facts.owner?.value, "아버지");
});

test("already occurred inheritance uses a direct plain-language owner question", () => {
  const first = advance(createChatState(), "상속");
  const second = advance(first.state, "이미 상속이 발생했어요");
  assert.equal(second.reply.message, "누구의 상속인가요?");
});

test("gift, sale and business openings are concise and contextual", () => {
  assert.equal(advance(createChatState(), "증여").reply.message, "누구에게 주려고 하세요?");
  assert.equal(advance(createChatState(), "양도").reply.message, "어떤 재산을 팔려고 하세요?");
  assert.equal(advance(createChatState(), "가업상속").reply.message, "승계는 어떻게 준비하고 계세요?");

  const gift = advance(advance(createChatState(), "증여").state, "아들");
  assert.equal(gift.reply.message, "어떤 재산을 주려고 하세요?");
  assert.equal(gift.reply.selectionMode, "multiple");
  assert.equal(gift.reply.inputMode, "assetAmounts");
  const giftAssets = advance(gift.state, "재산 전체:\n예금·현금: 3.5억 원\n회사 지분: 금액 모름");
  assert.equal(giftAssets.reply.message, "증여는 언제쯤 하실 예정인가요?");
  assert.equal(giftAssets.state.facts.financialAssets?.value, "예금·현금: 3.5억 원");
  assert.equal(giftAssets.state.facts.businessAssets?.value, "회사 지분: 금액 모름");
  const sale = advance(advance(createChatState(), "양도").state, "아파트·주택");
  assert.equal(sale.reply.message, "매각은 어느 단계인가요?");
  assert.equal(sale.state.facts.realEstate?.value, "아파트·주택");
  const business = advance(advance(createChatState(), "가업상속").state, "상속을 미리 준비 중이에요");
  assert.equal(business.reply.message, "현재 회사 지분은 누가 보유하고 있나요?");
});

test("an older choice-only asset draft is upgraded to one amount form", () => {
  const first = advance(createChatState(), "증여");
  const second = advance(first.state, "아들");
  const legacySelection = advance(second.state, "예금·현금, 주식");
  assert.equal(legacySelection.reply.message, "선택한 재산의 금액을 함께 적어주세요.");
  assert.deepEqual(legacySelection.reply.choices, ["예금·현금", "주식"]);
  assert.equal(legacySelection.reply.inputMode, "assetAmounts");
  const amount = advance(legacySelection.state, "재산 전체:\n예금·현금: 2억 원\n주식: 4억 원");
  assert.equal(amount.reply.message, "증여는 언제쯤 하실 예정인가요?");
  assert.equal(amount.state.facts.financialAssets?.value, "예금·현금: 2억 원\n주식: 4억 원");
});

test("free text and unrecognized choices still go to the AI", () => {
  assert.equal(getGuidedChatTurn(createChatState(), "아버지 아파트 상속세가 궁금해요"), null);
  const first = advance(createChatState(), "상속");
  assert.equal(getGuidedChatTurn(first.state, "10년 뒤쯤 생각해요"), null);
});
