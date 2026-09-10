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

  const fifth = advance(fourth.state, "배우자가 있어요");
  assert.equal(fifth.reply.message, "상속인인 성년 자녀는 몇 명인가요?");
  assert.equal(fifth.state.facts.spouse?.value, "배우자가 있어요");
  const sixth = advance(fifth.state, "2명이에요");
  assert.equal(sixth.reply.message, "공과금이나 채무가 있나요?");
  assert.equal(sixth.reply.selectionMode, "multiple");
  assert.equal(sixth.state.facts.adultChildren?.value, "2명이에요");
  const seventh = advance(sixth.state, "금융 대출이 있어요, 임대보증금이 있어요");
  assert.equal(seventh.reply.message, "최근 10년 안에 미리 증여한 재산이 있나요?");
  assert.equal(seventh.state.facts.debt?.value, "금융 대출이 있어요, 임대보증금이 있어요");
  const eighth = advance(seventh.state, "확인이 필요해요");
  assert.equal(eighth.reply.message, "상속과 관련해 무엇을 먼저 보고 싶으세요?");
  assert.equal(eighth.state.facts.pastGifts?.value, "확인이 필요해요");
  const ninth = advance(eighth.state, "상속세를 먼저 보고 싶어요, 생전 증여도 함께 보고 싶어요");
  assert.equal(ninth.reply.message, "기본 내용을 정리했어요. 7장 샘플 보고서는 바로 볼 수 있고, 내 상황에 맞춘 보고서는 계산 조건을 확인한 뒤 만들 수 있어요.");
  assert.equal(ninth.reply.choices.length, 0);
  assert.equal(ninth.state.facts.goal?.value, "상속세를 먼저 보고 싶어요, 생전 증여도 함께 보고 싶어요");
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
  const giftTiming = advance(giftAssets.state, "올해 안에");
  assert.equal(giftTiming.reply.message, "증여할 재산은 누구 소유인가요?");
  assert.equal(giftTiming.state.facts.timing?.value, "올해 안에");
  const giftOwner = advance(giftTiming.state, "본인");
  assert.equal(giftOwner.reply.message, "최근 10년 안에 같은 분에게 증여한 적이 있나요?");
  assert.equal(giftOwner.state.facts.owner?.value, "본인");
  const giftPast = advance(giftOwner.state, "없어요");
  assert.equal(giftPast.reply.message, "증여와 관련해 무엇을 먼저 보고 싶으세요?");
  assert.equal(giftPast.state.facts.pastGifts?.value, "없어요");
  const giftGoal = advance(giftPast.state, "증여세를 먼저 보고 싶어요, 여러 명에게 나누는 경우");
  assert.equal(giftGoal.reply.message, "기본 내용을 정리했어요. 7장 샘플 보고서는 바로 볼 수 있고, 내 상황에 맞춘 보고서는 계산 조건을 확인한 뒤 만들 수 있어요.");
  assert.equal(giftGoal.state.facts.goal?.value, "증여세를 먼저 보고 싶어요, 여러 명에게 나누는 경우");
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
