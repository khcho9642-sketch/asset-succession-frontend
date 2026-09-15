import { taxSourceSchema, type TaxDocument, type TaxQuery, type TaxResearch } from "./tax-grounding";
import { normalizeTaxDocuments } from "./tax-mcp";

const NTS_BASE_URL = "https://taxlaw.nts.go.kr";
const NTS_SEARCH_ENTRY_URL = `${NTS_BASE_URL}/qt/USEQTA001M.do?ntstDcmClCd=01`;
const NTS_ACTION_URL = `${NTS_BASE_URL}/action.do`;
const LAW_BASE_URL = "https://www.law.go.kr/DRF";
const USER_AGENT = "asset-succession-frontend/1.0";

type ToolStatus = TaxResearch["toolStatuses"][number];

function clean(value: string): string {
  return value.replace(/<!HS>|<!HE>/g, "").replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ").trim();
}

function stripCdata(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim();
}

function stripTags(value: string): string {
  return clean(stripCdata(value));
}

function tagValue(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`));
  return match ? stripCdata(match[1]) : "";
}

async function fetchText(url: string, init: RequestInit, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, { ...init, signal, headers: { "User-Agent": USER_AGENT, ...(init.headers ?? {}) } });
  if (!response.ok) throw Object.assign(new Error(`FETCH_${response.status}`), { statusCode: response.status });
  return response.text();
}

async function searchNtsRulings(query: TaxQuery, signal: AbortSignal): Promise<unknown> {
  const cookieResponse = await fetch(NTS_SEARCH_ENTRY_URL, { signal, headers: { "User-Agent": USER_AGENT } });
  if (!cookieResponse.ok) throw Object.assign(new Error(`NTS_BOOTSTRAP_${cookieResponse.status}`), { statusCode: cookieResponse.status });
  const cookie = cookieResponse.headers.getSetCookie?.().join("; ") ?? cookieResponse.headers.get("set-cookie") ?? "";
  const paramData = {
    schVcb: query.keyword,
    startCount: 1,
    collection: "question",
    wnKey: "",
    searchType: "",
    sortField: "DCM_RGT_DTM/DESC",
    ntstTlawClCdList: [],
    icldVcbCtl: [],
    exclVcbCtl: [],
    rltnStttCtl: [],
    schDtBase: "DCM_RGT_DTM",
    viewCount: "10",
    prtsSprcChiefJdgmYn: "",
    prtsAttrYrCtl: [],
    prtsPrgrStatCtl: [],
    mainIdCtl: [],
    useSynonymYn: "N",
  };
  const body = new URLSearchParams({ actionId: "ASEISA001MR01", paramData: JSON.stringify(paramData) });
  const text = await fetchText(NTS_ACTION_URL, {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: NTS_SEARCH_ENTRY_URL,
      ...(cookie ? { Cookie: cookie } : {}),
    },
  }, signal);
  const raw = JSON.parse(text) as { data?: { ASEISA001MR01?: { searchResultVO?: { collectionList?: Array<Record<string, unknown>> } } } };
  const collections = raw.data?.ASEISA001MR01?.searchResultVO?.collectionList;
  if (!Array.isArray(collections)) return { status: "PARSE_ERROR" };
  const question = collections.find(collection => collection.nameEn === "question");
  const items = Array.isArray(question?.resultList) ? question.resultList : [];
  const orgCodes: Record<string, string> = { "01": "국세청", "02": "기획재정부", "03": "법제처", "04": "조세심판원" };
  return {
    status: items.length ? "OK" : "NOT_FOUND",
    question: {
      name_kr: question?.nameKr ?? "질의회신",
      total_count: question?.totalCount ?? items.length,
      items: items.map(item => {
        const record = item as Record<string, string | undefined>;
        const sourceOrgCode = record.NTST_DCM_SRCS_ORGN_CL_CD ?? "";
        return {
          title: clean(record.TTL ?? ""),
          doc_type: record.NTST_DCM_CL_NM ?? "",
          doc_no: clean(record.NTST_DCM_DSCM_CNTN ?? ""),
          source_org: orgCodes[sourceOrgCode] ?? sourceOrgCode,
          date: record.DCM_RGT_DTM_S ?? record.DATE ?? "",
          tax_type: record.NTST_TLAW_CL_NM ?? "",
          summary: clean(record.GIST_CNTN ?? ""),
          doc_id: record.DOC_ID ?? "",
          related_doc_ids: record.RFRN_QUT_NTST_DCM_ID ?? "",
          content: clean(record.CNTN ?? ""),
          detail_content: clean(record.FILE_CN ?? ""),
        };
      }),
    },
  };
}

function parseLawItems(xml: string): Array<Record<string, string>> {
  const items: Array<Record<string, string>> = [];
  for (const match of xml.matchAll(/<law(?:\s[^>]*)?>([\s\S]*?)<\/law>/g)) {
    const block = match[1];
    const item: Record<string, string> = {};
    for (const tag of block.matchAll(/<([^/>\s]+)>\s*([\s\S]*?)\s*<\/\1>/g)) item[tag[1]] = stripCdata(tag[2]);
    if (Object.keys(item).length) items.push(item);
  }
  return items;
}

function findArticleBlock(xml: string, articleNo: string): { label: string; block: string | null } {
  const cut = xml.indexOf("<부칙>");
  const source = cut === -1 ? xml : xml.slice(0, cut);
  const branch = articleNo.match(/^(\d+)의(\d+)$/);
  const baseNo = branch ? branch[1] : articleNo.trim();
  const branchNo = branch?.[2];
  const label = `제${baseNo}조${branchNo ? `의${branchNo}` : ""}`;
  const positions = [...source.matchAll(/<조문번호>(\d+)<\/조문번호>/g)].map(match => ({ index: match.index ?? 0, no: match[1] }));
  for (let index = 0; index < positions.length; index += 1) {
    const position = positions[index];
    if (position.no !== baseNo) continue;
    const end = positions[index + 1]?.index ?? source.length;
    const block = source.slice(position.index, end);
    const branchMatch = block.slice(0, 300).match(/<조문가지번호>(\d+)<\/조문가지번호>/);
    if ((branchMatch?.[1]) !== branchNo) continue;
    if (!stripTags(block).includes(label)) continue;
    return { label, block };
  }
  return { label, block: null };
}

async function lawGet(endpoint: string, params: Record<string, string | number>, signal: AbortSignal): Promise<string> {
  const oc = process.env.LAW_API_OC?.trim();
  if (!oc) throw Object.assign(new Error("LAW_API_OC_MISSING"), { statusCode: 401 });
  const url = new URL(`${LAW_BASE_URL}/${endpoint}`);
  url.searchParams.set("OC", oc);
  url.searchParams.set("type", "XML");
  for (const [key, value] of Object.entries(params)) {
    if (value !== "" && value !== 0) url.searchParams.set(key, String(value));
  }
  const text = await fetchText(url.href, {}, signal);
  if (text.slice(0, 500).includes("인증") && text.slice(0, 500).includes("실패")) {
    throw Object.assign(new Error("LAW_AUTH_FAILED"), { statusCode: 401 });
  }
  return text;
}

async function lawArticleAsOf(query: TaxQuery, signal: AbortSignal): Promise<unknown> {
  if (!/^\d{8}$/.test(query.asOfDate)) return { status: "INVALID_INPUT" };
  const rows: Array<Record<string, string>> = [];
  for (let page = 1; page <= 5; page += 1) {
    const xml = await lawGet("lawSearch.do", { target: "eflaw", query: query.lawName, display: 100, page }, signal);
    const items = parseLawItems(xml);
    if (!items.length) break;
    rows.push(...items.filter(item => !query.lawId || item["법령ID"] === query.lawId));
  }
  const history = rows.map(item => ({
    법령명: item["법령명한글"] ?? "",
    법령ID: item["법령ID"] ?? "",
    MST: item["법령일련번호"] ?? "",
    시행일자: item["시행일자"] ?? "",
    공포일자: item["공포일자"] ?? "",
    공포번호: item["공포번호"] ?? "",
    제개정구분: item["제개정구분명"] ?? "",
  })).filter(item => item.MST && item.시행일자 && item.시행일자 <= query.asOfDate)
    .sort((a, b) => `${a.시행일자}${a.공포일자}${a.공포번호.padStart(10, "0")}`.localeCompare(`${b.시행일자}${b.공포일자}${b.공포번호.padStart(10, "0")}`));
  const chosen = history.at(-1);
  if (!chosen) return { status: "NOT_FOUND" };
  const xml = await lawGet("lawService.do", { target: "law", MST: chosen.MST }, signal);
  const { label, block } = findArticleBlock(xml, query.article);
  if (!block) return { status: "NOT_FOUND" };
  const title = tagValue(block, "조문제목");
  const effectiveDate = tagValue(block, "조문시행일자");
  const body = stripTags(block);
  return {
    status: "OK",
    조문: label,
    조문제목: title,
    조문시행일자: effectiveDate,
    원문: body.slice(0, 12_000),
    ...(body.length > 12_000 ? { 잘림: `전체 ${body.length}자 중 앞 12000자만 표시됨` } : {}),
    적용시행본: chosen,
  };
}

export async function researchTaxQuestionDirect(query: TaxQuery, signal?: AbortSignal): Promise<TaxResearch> {
  const deadline = AbortSignal.timeout(18_000);
  const cancelled = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const toolStatuses: ToolStatus[] = [];
  const documents: TaxDocument[] = [];
  const retrievedAt = new Date().toISOString();

  for (const call of [
    { tool: "law_article_as_of", fn: () => lawArticleAsOf(query, cancelled) },
    { tool: "nts_ruling_search", fn: () => searchNtsRulings(query, cancelled) },
  ]) {
    try {
      const raw = await call.fn();
      const result = normalizeTaxDocuments(raw, call.tool, retrievedAt);
      documents.push(...result.documents);
      toolStatuses.push({ tool: call.tool, status: result.status });
    } catch (error) {
      const statusCode = typeof error === "object" && error ? (error as { statusCode?: unknown }).statusCode : undefined;
      toolStatuses.push({ tool: call.tool, status: statusCode === 401 || statusCode === 403 ? "AUTH_ERROR" : "UPSTREAM_ERROR" });
    }
  }

  const sources = documents.slice(0, 3).map(document => {
    const source = { ...document };
    delete (source as Partial<TaxDocument>).body;
    return taxSourceSchema.parse(source);
  });
  const status = sources.length ? toolStatuses.every(item => item.status === "OK") ? "ready" : "partial"
    : toolStatuses.every(item => item.status === "AUTH_ERROR") ? "authentication_required"
    : toolStatuses.every(item => item.status === "NOT_FOUND" || item.status === "AUTH_ERROR") ? "not_found" : "unavailable";
  return {
    status,
    sources,
    documents: documents.slice(0, 3),
    toolStatuses,
    notice: sources.length
      ? `${query.dateKnown ? "요청하신 날짜" : "조회일"} 기준으로 ${sources.some(source => source.id.startsWith("law-")) ? "법령" : "관련 회신"}을 직접 조회했습니다. 발췌 자료이며 회신일은 시행일이 아닙니다. 고객의 거래에 적용되는 요건·적용례는 별도 확인이 필요합니다.${status === "partial" ? " 일부 근거는 조회하지 못했습니다." : ""}`
      : "세법 근거를 확인하지 못했습니다. 자료 없음과 인증·조회 실패는 다를 수 있으며, 세무 결론은 보류합니다.",
  };
}
