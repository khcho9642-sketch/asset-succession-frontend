import { getAssistantReply, type DiagnosisReply } from "./choices";
import type { ChatPatch, ChatState } from "./intake";

export type GuidedChatTurn = { reply: DiagnosisReply; patches: ChatPatch[] };

const inheritanceStage: DiagnosisReply = {
  message: "상속은 현재 어느 단계인가요?",
  choices: ["미리 준비 중이에요", "이미 상속이 발생했어요", "아직 잘 모르겠어요"],
};
const inheritanceOwnerChoices = ["아버지", "어머니", "부모님 두 분", "배우자"];
const assetChoices = ["부동산", "예금·현금", "주식", "회사 지분", "기타 자산"];
const saleAssetChoices = ["아파트·주택", "상가·건물", "토지", "주식", "그 밖의 재산"];

const openingTurns: Record<string, DiagnosisReply> = {
  상속: inheritanceStage,
  증여: { message: "누구에게 주려고 하세요?", choices: ["아들", "딸", "배우자", "손자녀", "다른 가족"] },
  양도: { message: "어떤 재산을 팔려고 하세요?", choices: saleAssetChoices },
  가업상속: {
    message: "승계는 어떻게 준비하고 계세요?",
    choices: ["생전에 지분을 넘길 예정이에요", "상속을 미리 준비 중이에요", "이미 상속이 발생했어요", "아직 정하지 않았어요"],
  },
};

function patch(key: ChatPatch["key"], value: string): ChatPatch {
  return { key, value, evidence: value };
}

function latestAssistantQuestion(state: ChatState) {
  const message = [...state.messages].reverse().find((entry) => entry.role === "assistant");
  return message ? getAssistantReply(message.text)?.message ?? "" : "";
}

function selectedChoices(text: string, choices: string[]): string[] | null {
  const submitted = [...new Set(text.split(/\s*,\s*/).map(value => value.trim()).filter(Boolean))];
  if (submitted.length === 0 || submitted.some(value => !choices.includes(value))) return null;
  // Preserve the visible button order even if the buttons were clicked out of order.
  return choices.filter(choice => submitted.includes(choice));
}

function assetPatches(text: string, selected: string[]): ChatPatch[] {
  const groups: Array<[ChatPatch["key"], string[]]> = [
    ["realEstate", selected.filter(value => ["부동산", "아파트·주택", "상가·건물", "토지"].includes(value))],
    ["financialAssets", selected.filter(value => ["예금·현금", "주식"].includes(value))],
    ["businessAssets", selected.filter(value => value === "회사 지분")],
    ["otherAssets", selected.filter(value => ["기타 자산", "그 밖의 재산"].includes(value))],
  ];
  return groups.flatMap(([key, values]) => {
    if (values.length === 0) return [];
    const value = values.join(", ");
    // Button submissions use the same visible order, so this remains a direct
    // excerpt of the user message and passes the evidence validator.
    return text.includes(value) ? [patch(key, value)] : [];
  });
}

/**
 * Common button paths are deterministic and need no provider round trip.
 * Free text and any unrecognized branch continue through the AI route.
 */
export function getGuidedChatTurn(state: ChatState, rawText: string): GuidedChatTurn | null {
  const text = rawText.trim();
  const hasUserMessage = state.messages.some((message) => message.role === "user");
  if (!hasUserMessage && openingTurns[text]) {
    return { reply: openingTurns[text], patches: [patch("topic", text)] };
  }

  const previousQuestion = latestAssistantQuestion(state);
  if (previousQuestion === inheritanceStage.message) {
    const valid = new Set(["미리 준비 중이에요", "미리 준비하고 있어요", "이미 상속이 발생했어요", "아직 잘 모르겠어요"]);
    if (!valid.has(text)) return null;
    const occurred = text === "이미 상속이 발생했어요";
    return {
      reply: {
        message: occurred ? "누구의 상속인가요?" : "누구의 재산을 준비하고 계세요?",
        choices: inheritanceOwnerChoices,
      },
      patches: [patch("timing", text)],
    };
  }

  if (previousQuestion === "누구의 재산을 준비하고 계세요?" || previousQuestion === "누구의 상속인가요?") {
    if (!inheritanceOwnerChoices.includes(text)) return null;
    return {
      reply: { message: "어떤 재산이 있나요?", choices: assetChoices, selectionMode: "multiple" },
      patches: [patch("owner", text)],
    };
  }

  if (previousQuestion === "누구에게 주려고 하세요?") {
    if (!openingTurns.증여.choices.includes(text)) return null;
    return {
      reply: { message: "어떤 재산을 주려고 하세요?", choices: assetChoices, selectionMode: "multiple" },
      patches: [],
    };
  }

  if (previousQuestion === "어떤 재산이 있나요?") {
    const selected = selectedChoices(text, assetChoices);
    if (!selected) return null;
    return {
      reply: { message: "재산 소유자의 배우자가 계신가요?", choices: ["배우자가 있어요", "배우자가 없어요", "잘 모르겠어요"] },
      patches: assetPatches(text, selected),
    };
  }

  if (previousQuestion === "어떤 재산을 주려고 하세요?") {
    const selected = selectedChoices(text, assetChoices);
    if (!selected) return null;
    return {
      reply: { message: "증여할 재산의 대략적인 금액을 알고 계세요?", choices: ["금액을 알고 있어요", "일부만 알고 있어요", "확인이 필요해요"] },
      patches: assetPatches(text, selected),
    };
  }

  if (previousQuestion === "어떤 재산을 팔려고 하세요?") {
    const selected = selectedChoices(text, saleAssetChoices);
    if (!selected) return null;
    return {
      reply: { message: "매각은 어느 단계인가요?", choices: ["팔 예정이에요", "이미 팔았어요", "아직 정하지 않았어요"] },
      patches: assetPatches(text, selected),
    };
  }

  if (previousQuestion === "승계는 어떻게 준비하고 계세요?") {
    if (!openingTurns.가업상속.choices.includes(text)) return null;
    return {
      reply: { message: "현재 회사 지분은 누가 보유하고 있나요?", choices: ["아버지", "어머니", "부모님 두 분", "본인", "배우자"] },
      patches: [patch("timing", text)],
    };
  }

  return null;
}
