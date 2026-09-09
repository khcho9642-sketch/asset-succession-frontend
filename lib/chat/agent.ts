import { createGateway, isStepCount, ToolLoopAgent, tool, type InferAgentUIMessage } from "ai";
import { applyChatPatches, createChatState, type ChatPatch, type ChatState } from "./intake";
import { buildDiagnosisPrompt } from "./prompt";
import { proposeFactsInputSchema, type DiagnosisRequest } from "./server";

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
}: { apiKey?: string; model: string; messages: DiagnosisRequest["messages"]; facts: ChatState["facts"] }) {
  const latest = messages[messages.length - 1];
  const latestMessage = { id: latest.id, text: latest.parts[0].text };
  const instructions = buildDiagnosisPrompt(facts);
  // Execution protocol only: dialogue policy remains in CHAT_GUIDE.md.
  const factStepInstructions = `${instructions}

현재 실행 단계: 사실 제안 도구 호출.
이 단계에서는 고객에게 보여 줄 답변을 작성하지 않습니다.
최신 사용자 메시지에 명시된 관련 사실을 모두 모아 proposeFacts를 정확히 한 번 호출합니다.
여러 키의 제안을 한 호출의 facts 배열 하나에 담고, 같은 키를 중복 제출하거나 도구를 여러 번 호출하지 않습니다.
메시지에 없는 사실이나 키는 채우지 않습니다. 관련 사실이 전혀 없는 경우에만 빈 facts 배열을 제출합니다.
도구 결과를 받은 뒤 다음 단계에서 고객용 답변을 작성합니다.`;
  // Without a static key the SDK resolves Vercel OIDC on the server.
  const gateway = createGateway(apiKey ? { apiKey } : {});
  return new ToolLoopAgent({
    model: gateway(model),
    instructions,
    maxOutputTokens: 3_000,
    // Keep the trial's reasoning and response work within its existing budget.
    providerOptions: model === "openai/gpt-5.4-mini"
      ? { openai: { reasoningEffort: "low" } }
      : undefined,
    maxRetries: 0,
    stopWhen: isStepCount(2),
    telemetry: { isEnabled: false, recordInputs: false, recordOutputs: false },
    tools: {
      proposeFacts: tool({
        description: "마지막 사용자 메시지에서 직접 인용한 모든 상담 사실을 초안에 제안합니다. 사용자 확인 전 제안이며 계산이나 외부 작업은 하지 않습니다.",
        inputSchema: proposeFactsInputSchema,
        execute: async ({ facts: proposals }) => ({ proposals: acceptFactProposals(proposals, latestMessage) }),
      }),
    },
    // Forced function selection can repeat the same Gemini call until the
    // response ends without text. Use automatic selection with a distinct
    // extraction step, then restore the guide for the tool-free response.
    prepareStep: ({ stepNumber }) => stepNumber === 0
      ? { toolChoice: "auto", instructions: factStepInstructions }
      : { toolChoice: "none", instructions },
    // The installed SDK forwards prepareCall's options to streamText. Override
    // its default console.error handler so provider errors never log intake data.
    prepareCall: (options) => ({ ...options, onError: () => undefined }),
  });
}

export type DiagnosisUIMessage = InferAgentUIMessage<ReturnType<typeof createDiagnosisAgent>>;
