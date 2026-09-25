/** Navigation is resolved only after individual resources match every active facet. */
export type ResourceMetadata = {
  resource_id: string;
  title?: string;
  stage_ids: string[];
  primary_stage_id: string | null;
  facets: { purposes: string[]; timing: string[]; assets: string[]; kind: string; delivery: string; origin?: string; authority?: string };
  presentation: { visibility: string; canonical_resource_id?: string; reason?: string };
  relations: { type: string; target_resource_id: string }[];
  classification?: { status: string; note?: string };
  planning_windows?: { label: string; availability_conditions: string[]; closing_events: string[]; impact: string; verification: { status: string; note?: string } }[];
};
export type LibraryFile = { name: string; path: string; format: string; role: string; bytes: number; delivery: string };
export type ProviderRoute = {
  provider: string; customerType: string; applicantContext: "owner" | "heir";
  label: string; url: string; sourceUrl: string; checkedOn: string;
  channel: string; authentication: string; note: string;
};
export type LibraryDocument = {
  currentEdition?: Pick<LibraryDocument, "files" | "example" | "thumbnail" | "preview"> & { revision: string };
  sourceReview?: { checkedOn: string; scope: string; evidence: string };
  currentVersionReview?: { reviewedOn: string; status: string; decision: string; finding: string; limitation: string; sourceUrl: string };
  authorityEvidence?: string;
  reviewSummary?: { reviewedOn: string; status: string; scope: string; finding: string; limitation: string };
  providerInstructions?: { documentName: string; menu: string; limitation: string; keywords?: string; checkedOn?: string; status?: string; url?: string };
  providerRoutes?: ProviderRoute[];
  providerScope?: string;
  institutionKind?: string;
  publishedOn?: string;
  afterLookup?: { title: string; text: string; resourceIds: string[] };
  useCategory?: "service" | "guide" | "form";
  primaryAction?: { label: string; url: string };
  searchAliases?: string[];
  assetCommon?: boolean;
  usage?: { who: string; when: string; prepare: string[]; steps: string[]; note: string; timingRationale: string; sourceUrls: string[] };
  editorialReview?: { date: string; status: string; note: string };
  id: string; title: string; category: string; description: string; tags: string;
  format: string; editable: string; example: string | null; thumbnail: string | null;
  sizeLabel: string; institution: string; sourceUrl: string; checkedOn: string;
  license: string; verification: string; delivery: string;
  originalCategory: string; catalogTitle: string; exampleVerification: string; licenseUrl: string;
  primaryArtifactType?: string;
  sourceRecordId?: string;
  documentSection?: { sourcePath: string; pages: number[]; match: string };
  preview?: { method: string; sourceRole: string; width: number; height: number; lowResolution: boolean;
    sourcePath?: string; sourceSha256?: string; pdfPath?: string; pageCount?: number; editorialRedraw?: boolean };
  form_no?: string | null; revised_at?: string | null; deadline?: string | null; deadline_basis?: string | null;
  source_type?: string | null; checked_at?: string | null; status?: string; task_id?: string;
  files: LibraryFile[];
  resource?: ResourceMetadata;
  supplementalSources?: { title: string; url: string; institution: string; origin: string; note: string; checkedOn: string }[];
};
export type PresentationGroup = { id: string; title: string; primary_stage_id: string; member_resource_ids: string[]; reason?: string };
export const STAGES = [
  ["S1", "현황 정리"], ["S2", "방법·재원 설계"], ["S3", "의사·계약 확정"],
  ["S4", "권리 이전·수령"], ["S5", "신고·납부"], ["S6", "유지·사후관리"], ["S7", "정정·분쟁 대응"],
] as const;
export const FACETS = {
  purpose: { label: "목적", values: { inheritance: "상속", gift: "증여", capital_transfer: "양도", business_succession: "가업승계" } },
  asset: { label: "자산", values: { real_estate: "부동산", cash_deposit: "현금·예금", securities: "주식·증권", business: "사업·경영권", insurance_pension: "보험·연금", debt: "채무·대출", other: "기타 자산" } },
  kind: { label: "자료 유형", values: { form: "서식", guide: "안내", example: "작성사례", service_link: "기관 서비스" } },
  delivery: { label: "이용 방식", values: { hosted: "파일 받기", official_link: "제공처에서 확인", unavailable: "준비 중" } },
} as const;
export const TIMINGS: Record<string, string> = { before_death: "생전 준비·실행", after_death: "상속 발생 후" };
export type FacetKey = keyof typeof FACETS;
export const USE_CATEGORIES = { service: "조회·발급", guide: "절차 안내", form: "서식 다운로드" } as const;
export const GUIDE_IDS = ["before-death", "after-death", "gift", "transfer", "business-succession"] as const;
export type CatalogFilters = { purpose: string[]; asset: string[]; kind: string[]; delivery: string[]; timing: string[]; stage: string; q: string; resource: string; from: string; use?: string; guide?: string; step?: string };
export const emptyFilters = (): CatalogFilters => ({ purpose: [], asset: [], kind: [], delivery: [], timing: [], stage: "", q: "", resource: "", from: "", use: "", guide: "", step: "" });
const split = (params: URLSearchParams, key: string, allowed: readonly string[]) => [...new Set(params.getAll(key).flatMap(value => value.split(",")))].filter(value => allowed.includes(value));
export function parseCatalogFilters(search: string): CatalogFilters {
  const params = new URLSearchParams(search);
  const result = emptyFilters();
  for (const key of Object.keys(FACETS) as FacetKey[]) result[key] = split(params, key, Object.keys(FACETS[key].values));
  result.timing = split(params, "timing", Object.keys(TIMINGS));
  result.stage = STAGES.some(([id]) => id === params.get("stage")) ? params.get("stage")! : "";
  result.q = (params.get("q") || "").slice(0, 100);
  result.resource = canonicalResourceId((params.get("resource") || "").slice(0, 120));
  result.from = params.get("from") === "precheck" ? "precheck" : "";
  result.use = Object.hasOwn(USE_CATEGORIES, params.get("use") || "") ? params.get("use")! : "";
  result.guide = GUIDE_IDS.find(id => id === params.get("guide")) || "";
  result.step = result.guide && /^[a-z][a-z0-9-]{0,60}$/.test(params.get("step") || "") ? params.get("step")! : "";
  return result;
}
export function catalogUrl(filters: CatalogFilters): string {
  const params = new URLSearchParams();
  for (const key of ["purpose", "asset", "kind", "delivery", "timing"] as const) if (filters[key].length) params.set(key, filters[key].join(","));
  for (const key of ["stage", "q", "resource", "from", "use", "guide", "step"] as const) if (filters[key]) params.set(key, filters[key]);
  return `/forms${params.size ? `?${params}` : ""}`;
}
export const RESOURCE_ALIASES: Record<string, string> = { "P4-03": "P3-02", "P7-07": "P3-03", "P8-07": "P1-22", "P1-03": "REG-I-01", "P1-04": "REG-I-03", "P1-05": "REG-G-01" };
export const canonicalResourceId = (id: string) => RESOURCE_ALIASES[id] || id;
export const resourceUrl = (id: string) => catalogUrl({ ...emptyFilters(), resource: canonicalResourceId(id) });
export const hasFilters = (f: CatalogFilters) => Boolean(f.use || f.q || f.stage || f.purpose.length || f.asset.length || f.kind.length || f.delivery.length || f.timing.length);
export const isPublicResource = (item: LibraryDocument) => !["archived", "excluded"].includes(item.resource?.presentation.visibility || "");
export const useCategory = (item: LibraryDocument) => item.useCategory || (item.resource?.facets.kind === "service_link" ? "service" : item.resource?.facets.kind === "guide" ? "guide" : "form");
const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g, "");
/** Rank facts from this document, never text borrowed from related documents. */
export function resourceSearchRank(item: LibraryDocument, query: string, groupTitles: string[] = []): number {
  if (!query.trim()) return 1;
  const q = normalize(query);
  const tokens = query.trim().split(/\s+/).map(normalize);
  if ([item.title, item.catalogTitle].some(title => normalize(title || "") === q)) return 4;
  const titleAndProvider = normalize([item.title, item.catalogTitle, item.institution].join(" "));
  if (tokens.every(token => titleAndProvider.includes(token))) return 3;
  if ((item.searchAliases || []).some(alias => normalize(alias).includes(q))) return 2;
  const body = normalize([item.id, item.title, item.catalogTitle, item.description, item.tags, item.institution, item.originalCategory, item.category, ...(item.searchAliases || []), item.usage?.when || "", ...groupTitles].join(" "));
  return tokens.every(token => body.includes(token)) ? 1 : 0;
}
const overlaps = (selected: string[], actual: string[]) => selected.length === 0 || selected.some(value => actual.includes(value));
function matchesFacets(meta: Pick<ResourceMetadata, "facets" | "stage_ids"> | undefined, filters: CatalogFilters): boolean {
  return overlaps(filters.purpose, meta?.facets.purposes || [])
    && overlaps(filters.asset, meta?.facets.assets || [])
    && overlaps(filters.timing, meta?.facets.timing || [])
    && overlaps(filters.kind, meta ? [meta.facets.kind] : [])
    && overlaps(filters.delivery, meta ? [meta.facets.delivery] : [])
    && (!filters.stage || Boolean(meta?.stage_ids.includes(filters.stage)));
}
export function matchesResource(item: LibraryDocument, filters: CatalogFilters, groupTitles: string[] = []): boolean {
  return (!filters.use || useCategory(item) === filters.use)
    && matchesFacets(item.resource, item.assetCommon ? { ...filters, asset: [] } : filters)
    && resourceSearchRank(item, filters.q, groupTitles) > 0;
}
export function providerLabel(item: LibraryDocument): string {
  const origin = item.resource?.facets.origin;
  return origin === "private_institution" ? "민간 제공처" : origin === "official_institution" ? "공식 제공처" : "제공처";
}
export function originLabel(item: LibraryDocument): string {
  return ({ official_institution: "공공기관 제공", private_institution: "민간 제공 참고서식", editorial: "자체 제작", unknown: "제공 주체 확인 필요" } as Record<string, string>)[item.resource?.facets.origin || "unknown"] || "제공 주체 확인 필요";
}
export function authorityLabel(item: LibraryDocument): string {
  return ({ statutory: "법정 서식", official_reference: "기관 참고자료", private_terms: "민간 제공 자료", editorial: "자체 제작 자료", unknown: "자료 성격 확인 필요" } as Record<string, string>)[item.resource?.facets.authority || "unknown"] || "자료 성격 확인 필요";
}
export type CatalogCard = { id: string; title: string; stage: string | null; group?: PresentationGroup; document?: LibraryDocument; resources: LibraryDocument[]; matchedIds: string[] };
export type CatalogIndex = { cards: CatalogCard[]; documents: Map<string, LibraryDocument>; groups: Map<string, PresentationGroup>; rootsByResource: Map<string, string[]> };
const parentTypes = new Set(["ui_member_of", "subform_of", "example_for", "attachment_of"]);
export function buildCatalog(documents: LibraryDocument[], groups: PresentationGroup[]): CatalogIndex {
  const docs = new Map(documents.map(item => [item.id, item]));
  const groupMap = new Map(groups.map(group => [group.id, group]));
  const parents = new Map<string, Set<string>>();
  const addParent = (id: string, parent: string) => { if (!parents.has(id)) parents.set(id, new Set()); parents.get(id)!.add(parent); };
  for (const group of groups) for (const id of group.member_resource_ids) addParent(id, group.id);
  for (const item of documents) {
    if (item.resource?.presentation.visibility !== "within_parent") continue;
    for (const relation of item.resource.relations) if (parentTypes.has(relation.type)) addParent(item.id, relation.target_resource_id);
    const canonical = item.resource.presentation.canonical_resource_id;
    if (canonical && canonical !== item.id) addParent(item.id, canonical);
  }
  function resolve(id: string, seen = new Set<string>()): string[] {
    if (seen.has(id)) return []; // Broken cycles must not hang the catalog.
    if (groupMap.has(id)) return [id];
    const doc = docs.get(id);
    if (!doc || doc.resource?.presentation.visibility === "archived") return [];
    const links = parents.get(id);
    if (!links?.size) return doc.resource?.presentation.visibility === "within_parent" ? [] : [id];
    const next = new Set(seen).add(id);
    return [...new Set([...links].flatMap(parent => resolve(parent, next)))];
  }
  const rootsByResource = new Map(documents.map(doc => [doc.id, resolve(doc.id)]));
  const cardMap = new Map<string, CatalogCard>();
  for (const doc of documents) for (const id of rootsByResource.get(doc.id) || []) {
    if (!cardMap.has(id)) {
      const group = groupMap.get(id);
      const document = docs.get(id);
      cardMap.set(id, { id, title: group?.title || document!.title, stage: group?.primary_stage_id || document?.resource?.primary_stage_id || null, group, document, resources: [], matchedIds: [] });
    }
    cardMap.get(id)!.resources.push(doc);
  }
  const cards = [...cardMap.values()].sort((a, b) => (a.stage || "S9").localeCompare(b.stage || "S9") || a.title.localeCompare(b.title, "ko"));
  return { cards, documents: docs, groups: groupMap, rootsByResource };
}
export function filterCatalog(index: CatalogIndex, filters: CatalogFilters): CatalogCard[] {
  const matching = new Set<string>();
  for (const item of index.documents.values()) {
    if (!isPublicResource(item)) continue;
    const groupTitles = (index.rootsByResource.get(item.id) || []).map(id => index.groups.get(id)?.title || "");
    if (matchesResource(item, filters, groupTitles)) matching.add(item.id);
  }
  return index.cards.flatMap(card => {
    const matchedIds = card.resources.filter(item => matching.has(item.id)).map(item => item.id);
    return matchedIds.length ? [{ ...card, matchedIds }] : [];
  }).sort((a, b) => Math.max(...b.resources.filter(item => b.matchedIds.includes(item.id)).map(item => resourceSearchRank(item, filters.q))) - Math.max(...a.resources.filter(item => a.matchedIds.includes(item.id)).map(item => resourceSearchRank(item, filters.q))));
}
/** Preserve examples/attachments as named files; never invent alternative formats. */
export function availableFiles(item: LibraryDocument): LibraryFile[] {
  const seen = new Set<string>();
  return (item.currentEdition?.files || item.files).filter(file => {
    if (!file.path || file.delivery === "pending" || seen.has(file.path)) return false;
    seen.add(file.path); return true;
  });
}
export function relationLabel(item: LibraryDocument): string {
  const types = item.resource?.relations.map(relation => relation.type) || [];
  if (types.includes("subform_of")) return "부표·합본 첨부";
  if (types.includes("example_for") || item.resource?.facets.kind === "example") return "작성사례";
  if (types.includes("attachment_of")) return "참고자료";
  return "선택 자료";
}

/** Only render previews whose intrinsic size was measured from the actual image. */
export function documentPreview(item: LibraryDocument) {
  const preview = item.preview;
  return item.thumbnail && preview && Number.isFinite(preview.width) && Number.isFinite(preview.height)
    && preview.width > 0 && preview.height > 0 ? preview : null;
}
export function previewLabel(item: LibraryDocument): string {
  const preview = documentPreview(item);
  if (!preview) return "자료 정보";
  if (preview.method === "institution-image") return "웹 사례 원본 이미지";
  const prefix = item.resource?.facets.origin === "private_institution" ? "민간 제공처" : item.resource?.facets.origin === "official_institution" ? "기관" : "제공처";
  if (preview.sourceRole === "example") return `${prefix} 작성 예시`;
  if (preview.sourceRole === "combined") return `${prefix} 합본 첫 페이지`;
  if (preview.sourceRole === "original") return `${prefix} 원본 양식`;
  return `${prefix} 제공 이미지`;
}
