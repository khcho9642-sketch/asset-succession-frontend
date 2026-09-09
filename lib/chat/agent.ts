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
  // Without a static key the SDK resolves Vercel OIDC on the server.
  const gateway = createGateway(apiKey ? { apiKey } : {});
  return new ToolLoopAgent({
    model: gateway(model),
    instructions: buildDiagnosisPrompt(facts),
    maxOutputTokens: 3_000,
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
    // response ends without text. The guide requests one facts call; allow
    // automatic selection, then disable tools for the response step.
    prepareStep: ({ stepNumber }) => stepNumber === 0
      ? { toolChoice: "auto" }
      : { toolChoice: "none" },
    // The installed SDK forwards prepareCall's options to streamText. Override
    // its default console.error handler so provider errors never log intake data.
    prepareCall: (options) => ({ ...options, onError: () => undefined }),
  });
}

export type DiagnosisUIMessage = InferAgentUIMessage<ReturnType<typeof createDiagnosisAgent>>;
