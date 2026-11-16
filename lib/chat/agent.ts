import { isStepCount, Output, ToolLoopAgent, tool, type InferAgentUIMessage } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { diagnosisReplySchema, diagnosisSelectionModeSchema } from "./choices";
import { applyChatPatches, CHAT_FIELD_KEYS, createChatState, type ChatPatch, type ChatState } from "./intake";
import { buildDiagnosisPrompt } from "./prompt";
import { DEFAULT_GOOGLE_DIAGNOSIS_MODEL, DIAGNOSIS_LIMITS, DiagnosisResponseRejectedError, proposeFactsInputSchema, type DiagnosisRequest } from "./server";
import { buildDiagnosisSources, getDiagnosisSourceHints, type DiagnosisSource } from "./sources";
import { BRIEF_REPORT_REQUEST } from "./brief-report";

const turnReplyShape = {
  ...diagnosisReplySchema.shape,
  // New turns have 2–4 useful options; older saved replies remain compatible.
  choices: diagnosisReplySchema.shape.choices.max(4),
  // New model responses must state the interaction mode. The standalone
  // reply parser still accepts older saved conversations without this field.
  selectionMode: diagnosisSelectionModeSchema,
};

function validateTurnInteraction(value: z.infer<typeof diagnosisReplySchema>, context: z.RefinementCtx) {
  if (value.choices.length === 1 || new Set(value.choices).size !== value.choices.length) {
    context.addIssue({ code: "custom", path: ["choices"], message: "Use 2–4 distinct choices, or none when no question is needed" });
  }
  const questionCount = (value.message.match(/[?？]/g) ?? []).length;
  if (questionCount > 1 || (questionCount > 0 && value.choices.length === 0)) {
    context.addIssue({ code: "custom", path: ["message"], message: "Ask at most one question with answer choices" });
  }
  if (value.inputMode === "assetAmounts" && (value.selectionMode !== "multiple" || value.choices.length === 0)) {
    context.addIssue({ code: "custom", path: ["inputMode"], message: "assetAmounts requires multiple non-empty choices" });
  }
}

/** The client-facing quote contract remains separate from the model protocol. */
export const diagnosisTurnSchema = proposeFactsInputSchema.extend(turnReplyShape).strict().superRefine(validateTurnInteraction);

export type DiagnosisFactSelection = { key: ChatPatch["key"]; sourceId: string };

/** Narrow native constraints for explicit explanation requests, never fact inference. */
export function getDiagnosisTurnConstraints(latestText: string) {
  const explanationOnly = /이유\s*만\s*(?:설명|알려)|설명\s*만\s*(?:해\s*주|해줘|부탁)/.test(latestText);
  const possibleFact = /\d|정정|수정|추가|바꾸|변경|모르|모름|몰라|모른|모릅|기억|미정|미상|미확인|확인(?:이)?\s*필요|(?:있|없)(?:음|어요|습니다|다|고|는데|지만|는)|계세요|계십니다|계셔|성년|성인|미성년|돌아가|사망|별세|발생했|는데|지만|명의|소유|보유|샀|받았|줬|드렸|자녀\s*(?:둘|한|두|세|네|하나)/.test(latestText);
  const clauses = latestText.split(/[.!?。！？;\n]+/).map((clause) => clause.trim()).filter(Boolean);
  const pureQuestion = explanationOnly && !possibleFact && clauses.length > 0 && clauses.every((clause) => /왜|어째서|이유|무슨\s*뜻|의미|설명(?:해|만|을)?|어떻게|무엇|인가요|나요|습니까|알려\s*주|궁금/.test(clause));
  return { explanationOnly, pureQuestion };
}

export function createDiagnosisModelTurnSchema(sources: DiagnosisSource[], latestText = "") {
  const sourceIds = sources.map(({ id }) => id);
  if (!sourceIds.length || new Set(sourceIds).size !== sourceIds.length) {
    throw new DiagnosisResponseRejectedError("Invalid customer quote candidates");
  }
  const constraints = getDiagnosisTurnConstraints(latestText);
  const noFacts = constraints.pureQuestion || latestText === BRIEF_REPORT_REQUEST;
  const noChoices = constraints.explanationOnly || latestText === BRIEF_REPORT_REQUEST;
  return z.object({
    facts: z.array(z.object({
      key: z.enum(CHAT_FIELD_KEYS),
      // A native enum constrains the provider to this latest message's quotes.
      sourceId: z.enum(sourceIds),
    }).strict()).max(DIAGNOSIS_LIMITS.proposals),
    ...turnReplyShape,
    choices: turnReplyShape.choices.max(4),
  }).strict().superRefine((value, context) => {
    // Gemini's native decoder can fail on maxItems: 0. Keep a representable
    // provider schema and enforce the same empty-array policy on the server.
    if (noFacts && value.facts.length) context.addIssue({ code: "custom", path: ["facts"], message: "This control turn cannot add customer facts" });
    if (noChoices && value.choices.length) context.addIssue({ code: "custom", path: ["choices"], message: "This turn cannot ask another question" });
    validateTurnInteraction(value, context);
  });
}

/** Resolve only server-owned candidates; the model cannot supply fact text. */
export function resolveDiagnosisFactSelections(selections: DiagnosisFactSelection[], sources: DiagnosisSource[]): ChatPatch[] {
  const byId = new Map(sources.map((source) => [source.id, source]));
  return selections.flatMap(({ key, sourceId }) => {
    const source = byId.get(sourceId);
    return source ? [{ key, value: source.value, evidence: source.evidence }] : [];
  });
}

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
  sources,
  policyCorrection,
}: { apiKey: string; model: string; messages: DiagnosisRequest["messages"]; facts: ChatState["facts"]; sources?: DiagnosisSource[]; policyCorrection?: string }) {
  const latest = messages[messages.length - 1];
  const latestMessage = { id: latest.id, text: latest.parts[0].text };
  const sourceTable = sources ?? buildDiagnosisSources(latestMessage.text);
  const instructions = `${buildDiagnosisPrompt(facts, sourceTable, getDiagnosisSourceHints(latestMessage.text, sourceTable))}

고객용 응답의 전달 형식:
최종 응답은 제공된 JSON 스키마에 맞춰 facts, message, choices, selectionMode와 필요한 경우 inputMode를 한 번에 작성합니다.
facts의 각 항목에는 key와 sourceId만 작성합니다. 해당 분류의 정보가 있으면 분류별 추천 ID의 구체적인 후보를 우선 살피고, 그 key에 관련된 사실을 모두 포함하는 가장 구체적인 후보를 선택합니다.
여러 키의 사실은 facts 배열 하나에 담되 같은 key는 한 번만 사용합니다. 후보에 없는 사실을 추정하거나 value와 evidence를 새로 작성하지 않습니다.
직전의 명확한 단일 질문에 대한 “확인이 필요해요” 같은 짧은 모름도 해당 분류와 unconfirmed의 사실 제안 대상입니다. 대상은 대화로 파악하되 sourceId는 최신 고객 답변에서만 선택하며 assistant의 사실·금액을 가져오지 않습니다.
서버가 선택한 후보의 원문을 복원하고 검증합니다. 관련 사실이 전혀 없을 때만 facts를 빈 배열로 둡니다.
message는 고객에게 보여 줄 답변과 다음 질문, choices는 그 질문 아래 표시할 짧은 답변 버튼입니다.
고객의 고민이나 설명·비교 요청에 먼저 직접 답한 뒤, 필요한 경우에만 질문 하나와 선택지 2~4개를 줍니다. 정정·모름은 이미 말한 내용을 보존하며 처리하고, 종료·정리 요청에는 추가 질문 없이 choices를 빈 배열로 둡니다.
selectionMode는 하나만 답할 수 있으면 single, 재산·채무·목표처럼 여러 답이 동시에 맞을 수 있으면 multiple입니다.
여러 재산의 종류와 금액을 함께 받아야 하는 질문은 choices에 재산 종류를 넣고 inputMode를 assetAmounts로 설정합니다. 이때 별도의 '금액을 알고 있나요?' 질문을 만들지 않습니다.
선택지 문구는 클릭하면 그대로 고객 메시지로 전송됩니다. 질문에 대한 선택지는 CHAT_GUIDE의 기준으로 매번 구성합니다.
직접 입력하기는 화면에서 항상 제공하므로 choices에 중복해서 넣지 않습니다.
이전 대화·현재 초안·최신 입력에서 이미 모른다고 답한 항목은 이번 질문을 마친 것으로 취급하며, message와 choices 모두에서 해당 항목의 재확인을 요구하지 않습니다.
choices를 제공할 때는 그 선택지들이 답하는 명확한 질문 문장 하나를 message에 작성합니다.${getDiagnosisTurnConstraints(latestMessage.text).explanationOnly ? "\n이번 요청은 이유나 설명만을 원하므로 추가 질문 없이 설명으로 마칩니다." : ""}${policyCorrection ? `\n\n서버 대화 품질 검사의 수정 지침:\n${policyCorrection}\n이번 재생성에서는 위 수정 지침을 우선 적용하며, 고객의 설명·정리·종료 요청과 기존 원문 ID·응답 형식을 지킵니다.` : ""}${getDiagnosisTurnConstraints(latestMessage.text).pureQuestion ? "\n이번 메시지는 순수한 설명 요청이며 새 고객 사실이 없습니다. facts는 반드시 빈 배열 []로 둡니다. 질문/설명요청 원문을 notes나 다른 facts에 저장하지 않습니다." : ""}`;
  // Each attempt uses Google Developer API directly; fallback is orchestrated separately.
  const google = createGoogleGenerativeAI({ apiKey });
  const replyModel = google(model);
  return new ToolLoopAgent({
    model: replyModel,
    instructions: instructions + (latestMessage.text === BRIEF_REPORT_REQUEST ? "\n고객이 간략 검토보고서 만들기를 선택했습니다. 새 고객 사실이 없는 정리 요청이므로 facts는 반드시 빈 배열 []이며 choices도 빈 배열 []입니다. 기존 대화와 현재 초안으로 고객 고민에 대한 현재 판단, 구체적인 우선할 일, 확인할 사항을 제목이 있는 세 단락으로 작성합니다. 현재 판단의 첫 문장은 고객 질문에 대한 검토 방향과 이유입니다. 자산·가족·희망을 반복하거나 ‘고민하고 계십니다’로 끝내지 않습니다. 현재 정보로 실행 가능성을 확정할 수 없다면 그 이유를 판단으로 제시합니다. 근거 없는 세액과 법적 결론은 만들지 않습니다. 추가 질문 없이 마칩니다." : ""),
    output: Output.object({ schema: createDiagnosisModelTurnSchema(sourceTable, latestMessage.text) }),
    maxOutputTokens: 3_000,
    // Keep the trial's reasoning and response work within its existing budget.
    providerOptions: { google: { thinkingConfig: { thinkingLevel: model === DEFAULT_GOOGLE_DIAGNOSIS_MODEL ? "minimal" : "low" } } },
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
