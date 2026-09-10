import { isStepCount, Output, ToolLoopAgent, tool, type InferAgentUIMessage } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { diagnosisReplySchema, diagnosisSelectionModeSchema } from "./choices";
import { applyChatPatches, createChatState, type ChatPatch, type ChatState } from "./intake";
import { buildDiagnosisPrompt } from "./prompt";
import { proposeFactsInputSchema, type DiagnosisRequest } from "./server";

export const diagnosisTurnSchema = proposeFactsInputSchema.extend({
  ...diagnosisReplySchema.shape,
  // New model responses must state the interaction mode. The standalone
  // reply parser still accepts older saved conversations without this field.
  selectionMode: diagnosisSelectionModeSchema,
}).strict().superRefine((value, context) => {
  if (value.inputMode === "assetAmounts" && (value.selectionMode !== "multiple" || value.choices.length === 0)) {
    context.addIssue({ code: "custom", path: ["inputMode"], message: "assetAmounts requires multiple non-empty choices" });
  }
});

export function acceptFactProposals(facts: ChatPatch[], latestMessage: { id: string; text: string }): ChatPatch[] {
  const state = createChatState();
  state.messages = [{ ...latestMessage, role: "user", created_at: new Date().toISOString() }];
  const seen = new Set<ChatPatch["key"]>();
  return facts.filter((proposal) => {
    if (seen.has(proposal.key) || !latestMessage.text.includes(proposal.evidence)) return false;
    const result = applyChatPatches(state, [proposal], latestMessage.id);
    if (!result.facts[proposal.key]) return false;
    seen.add(proposal.key);
    return true;
  });
}

export function createDiagnosisAgent({
  apiKey,
  model,
  messages,
  facts,
}: { apiKey: string; model: string; messages: DiagnosisRequest["messages"]; facts: ChatState["facts"] }) {
  const latest = messages[messages.length - 1];
  const latestMessage = { id: latest.id, text: latest.parts[0].text };
  const instructions = `${buildDiagnosisPrompt(facts)}

고객용 응답의 전달 형식:
최종 응답은 제공된 JSON 스키마에 맞춰 facts, message, choices, selectionMode와 필요한 경우 inputMode를 한 번에 작성합니다.
facts에는 최신 사용자 메시지에 명시된 관련 사실을 모두 담습니다.
여러 키의 사실은 facts 배열 하나에 담고, 같은 키를 중복하거나 메시지에 없는 사실을 만들지 않습니다.
value와 evidence는 최신 사용자 메시지의 연속된 원문이어야 합니다. 관련 사실이 전혀 없을 때만 빈 배열을 사용합니다.
message는 고객에게 보여 줄 답변과 다음 질문, choices는 그 질문 아래 표시할 짧은 답변 버튼입니다.
selectionMode는 하나만 답할 수 있으면 single, 재산·채무·목표처럼 여러 답이 동시에 맞을 수 있으면 multiple입니다.
여러 재산의 종류와 금액을 함께 받아야 하는 질문은 choices에 재산 종류를 넣고 inputMode를 assetAmounts로 설정합니다. 이때 별도의 '금액을 알고 있나요?' 질문을 만들지 않습니다.
선택지 문구는 클릭하면 그대로 고객 메시지로 전송됩니다. 질문에 대한 선택지는 CHAT_GUIDE의 기준으로 매번 구성합니다.
직접 입력하기는 화면에서 항상 제공하므로 choices에 중복해서 넣지 않습니다.`;
  // Each attempt uses Google Developer API directly; fallback is orchestrated separately.
  const google = createGoogleGenerativeAI({ apiKey });
  const replyModel = google(model);
  return new ToolLoopAgent({
    model: replyModel,
    instructions,
    output: Output.object({ schema: diagnosisTurnSchema }),
    maxOutputTokens: 3_000,
    // Keep the trial's reasoning and response work within its existing budget.
    providerOptions: { google: { thinkingConfig: { thinkingLevel: "low" } } },
    maxRetries: 0,
    stopWhen: isStepCount(1),
    telemetry: { isEnabled: false, recordInputs: false, recordOutputs: false },
    // Retain the typed UI part consumed by the existing client. The model never
    // sees or calls this tool; fallback.ts emits its server-validated result.
    activeTools: [],
    toolChoice: "none",
    tools: {
      proposeFacts: tool({
        description: "마지막 사용자 메시지에서 직접 인용한 모든 상담 사실을 초안에 제안합니다. 사용자 확인 전 제안이며 계산이나 외부 작업은 하지 않습니다.",
        inputSchema: proposeFactsInputSchema,
        execute: async ({ facts: proposals }) => ({ proposals: acceptFactProposals(proposals, latestMessage) }),
      }),
    },
    // The installed SDK forwards prepareCall's options to generateText. Override
    // its default console.error handler so provider errors never log intake data.
    prepareCall: (options) => ({ ...options, onError: () => undefined }),
  });
}

export type DiagnosisUIMessage = InferAgentUIMessage<ReturnType<typeof createDiagnosisAgent>>;
