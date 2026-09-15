import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import { groundingFailure, taxSourceSchema, type TaxDocument, type TaxQuery, type TaxResearch } from "./tax-grounding";
import { researchTaxQuestionDirect } from "./tax-direct";

type Environment = Record<string, string | undefined>;
type Connection = { type: "http"; url: string; token: string } | { type: "stdio"; command: string; script: string; lawApiOc?: string };
export function taxMcpConnection(env: Environment = process.env): Connection | null {
  if (env.TAX_MCP_URL) {
    try {
      const url = new URL(env.TAX_MCP_URL);
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !env.TAX_MCP_BEARER_TOKEN?.trim()) return null;
      if (/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[)/.test(url.hostname)) return null;
      return { type: "http", url: url.href, token: env.TAX_MCP_BEARER_TOKEN.trim() };
    } catch { return null; }
  }
  if (!env.VERCEL && env.TAX_MCP_STDIO_SCRIPT && env.TAX_MCP_STDIO_COMMAND) {
    return { type: "stdio", command: env.TAX_MCP_STDIO_COMMAND, script: env.TAX_MCP_STDIO_SCRIPT, lawApiOc: env.LAW_API_OC };
  }
  return null;
}

async function connect(signal: AbortSignal): Promise<MCPClient> {
  const config = taxMcpConnection();
  if (!config) throw new Error("MCP_NOT_CONFIGURED");
  const transport = config.type === "http"
    ? { type: "http" as const, url: config.url, headers: { Authorization: `Bearer ${config.token}` }, redirect: "error" as const }
    : new Experimental_StdioMCPTransport({ command: config.command, args: [config.script], stderr: "ignore",
      env: { PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1", ...(config.lawApiOc ? { LAW_API_OC: config.lawApiOc } : {}) } });
  return createMCPClient({ transport, protocolVersionDiscovery: false, initializationOptions: { signal, timeout: 5_000 }, maxRetries: 0,
    clientName: "asset-succession-tax-chat", onUncaughtError: () => undefined });
}

const defaultOpen = connect;

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function str(value: unknown): string { return typeof value === "string" ? value : ""; }
function clean(value: unknown): string { return str(value).replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ").trim(); }
function unpack(raw: unknown): Record<string, unknown> {
  const result = record(raw);
  if (result.isError) return { status: "UPSTREAM_ERROR" };
  if (result.structuredContent) return record(result.structuredContent);
  const blocks = Array.isArray(result.content) ? result.content : [];
  const text = blocks.map(block => record(block)).filter(block => block.type === "text").map(block => str(block.text)).join("");
  if (text.length > 256_000) return { status: "PARSE_ERROR" };
  try { return record(JSON.parse(text)); } catch { return { status: "PARSE_ERROR" }; }
}

export function normalizeTaxDocuments(raw: unknown, tool: string, retrievedAt: string): { documents: TaxDocument[]; status: string } {
  const data = unpack(raw);
  const documents: TaxDocument[] = [];
  let unsupportedDocument = false;
  if (data.status !== "OK") return { documents, status: str(data.status) || "PARSE_ERROR" };
  const add = (input: unknown, body: string) => {
    const parsed = taxSourceSchema.safeParse(input);
    if (parsed.success && body) documents.push({ ...parsed.data, body: body.slice(0, 5_000) });
  };
  if (tool === "law_article_as_of") {
    const version = record(data["적용시행본"]);
    const mst = str(version.MST);
    const body = clean(data["원문"]);
    if (/^\d+$/.test(mst) && !data["잘림"]) add({ id: `law-${mst}-${str(data["조문"])}`, title: `${str(version["법령명"])} ${str(data["조문"])} ${str(data["조문제목"])}`,
      agency: "법제처 국가법령정보센터", url: `https://www.law.go.kr/lsInfoP.do?lsiSeq=${mst}`, quote: body.slice(0, 480), retrievedAt,
      article: str(data["조문"]), ...(data["조문시행일자"] ? { effectiveDate: str(data["조문시행일자"]) } : {}) }, body);
  } else if (tool === "nts_ruling_search") {
    for (const collection of Object.values(data)) {
      const items = record(collection).items;
      if (!Array.isArray(items)) continue;
      for (const value of items.slice(0, 2)) {
        const item = record(value), id = str(item.doc_id), body = clean(item.content || item.detail_content || item.summary);
        // Verified on actual inquiry and advance-answer detail pages; other kinds remain excluded.
        const supported = (item.doc_type === "질의" && /^01\d{16}$/.test(id))
          || (item.doc_type === "사전" && /^20\d{16}$/.test(id));
        if (!supported) { unsupportedDocument = true; continue; }
        add({ id: `nts-${id}`, title: clean(item.title), agency: clean(item.source_org), url: `https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=${id}`,
          quote: clean(item.summary || body).slice(0, 480), retrievedAt, ...(item.date ? { publishedDate: str(item.date) } : {}) }, body);
      }
    }
  }
  return { documents: documents.slice(0, 2), status: documents.length ? "OK" : unsupportedDocument ? "UNSUPPORTED_DOCUMENT" : "PARSE_ERROR" };
}

type Client = Pick<MCPClient, "listTools" | "callTool" | "close">;
/** Only these two read-only tools are callable, regardless of what a server advertises. */
export async function researchTaxQuestion(query: TaxQuery, signal?: AbortSignal, open: (signal: AbortSignal) => Promise<Client> = defaultOpen): Promise<TaxResearch> {
  if (open === defaultOpen && !taxMcpConnection()) return researchTaxQuestionDirect(query, signal);
  const deadline = AbortSignal.timeout(18_000);
  const cancelled = signal ? AbortSignal.any([signal, deadline]) : deadline;
  let client: Client | undefined;
  const documents: TaxDocument[] = [], toolStatuses: TaxResearch["toolStatuses"] = [];
  try {
    client = await open(cancelled);
    const available = await client.listTools({ options: { signal: cancelled, timeout: 3_000 } });
    const names = new Set(available.tools.map(tool => tool.name));
    const calls = [
      { name: "law_article_as_of", arguments: { law_name: query.lawName, law_id: query.lawId, article_no: query.article, as_of_date: query.asOfDate, max_chars: 12_000 } },
      { name: "nts_ruling_search", arguments: { keyword: query.keyword, collections: ["ruling"], view_count: 2, include_full_text: true, sort: "date_desc", date_to: query.asOfDate } },
    ];
    for (const call of calls) {
      if (!names.has(call.name)) { toolStatuses.push({ tool: call.name, status: "TOOL_UNAVAILABLE" }); continue; }
      const raw = await client.callTool({ ...call, options: { signal: cancelled, timeout: 6_000 } });
      const result = normalizeTaxDocuments(raw, call.name, new Date().toISOString());
      documents.push(...result.documents);
      toolStatuses.push({ tool: call.name, status: result.status });
    }
    const sources = documents.slice(0, 3).map(document => { const source = { ...document }; delete (source as Partial<TaxDocument>).body; return taxSourceSchema.parse(source); });
    const status = sources.length ? toolStatuses.every(item => item.status === "OK") ? "ready" : "partial"
      : toolStatuses.some(item => item.status === "AUTH_ERROR") ? "authentication_required"
      : toolStatuses.every(item => item.status === "NOT_FOUND") ? "not_found" : "invalid_response";
    return { status, sources, documents: documents.slice(0, 3), toolStatuses,
      notice: sources.length ? `${query.dateKnown ? "요청하신 날짜" : "조회일"} 기준으로 ${sources.some(source => source.id.startsWith("law-")) ? "법령" : "관련 회신"}을 조회했습니다. 발췌 자료이며 회신일은 시행일이 아닙니다. 고객의 거래에 적용되는 요건·적용례는 별도 확인이 필요합니다.${status === "partial" ? " 일부 근거는 조회하지 못했습니다." : ""}`
        : "세법 근거를 확인하지 못했습니다. 자료 없음과 인증·조회 실패는 다를 수 있으며, 세무 결론은 보류합니다." };
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    const statusCode = record(error).statusCode;
    const status = statusCode === 401 || statusCode === 403 ? "authentication_required" : "unavailable";
    return { ...groundingFailure(status), toolStatuses };
  } finally {
    if (client) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([client.close().catch(() => undefined), new Promise<void>(resolve => { timer = setTimeout(resolve, 1_000); })]);
      clearTimeout(timer);
    }
  }
}
