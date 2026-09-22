/** Shared preview policy for list cards, document details and coverage checks.
 * Never turn a decorative/editorial placeholder into a document preview.
 */
export type PreviewDocument = {
  id: string;
  title: string;
  example?: string | null;
  thumbnail?: string | null;
  sourceUrl?: string;
  institution?: string;
  preview?: {
    method?: string;
    sourceRole?: string;
    sourcePath?: string;
    pdfPath?: string;
    sourceSha256?: string;
    width?: number;
    height?: number;
    lowResolution?: boolean;
    pageCount?: number;
    editorialRedraw?: boolean;
  };
  files: { path: string; format: string; role: string; delivery: string; name?: string }[];
  resource?: {
    facets?: { kind?: string; delivery?: string };
    presentation?: { visibility?: string };
  };
};

export type ResolvedPreview = {
  kind: "image" | "pdf" | "provider" | "pending";
  label: string;
  imagePath?: string;
  thumbnailPath?: string;
  pdfPath?: string;
  originalPath?: string;
  providerUrl?: string;
  width?: number;
  height?: number;
  lowResolution: boolean;
  pageCount?: number;
  role?: string;
  method?: string;
};

const ROOT = "/downloads/official-forms/";
const IMAGE = /\.(?:png|jpe?g|webp)$/i;
const PDF = /\.pdf$/i;
const finiteSize = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

/** Only local catalogue artifacts may be embedded. External providers remain links. */
export function localArtifact(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith(ROOT) || /[?#\\\u0000-\u001f]/.test(value)) return;
  let decoded: string;
  try { decoded = decodeURIComponent(value); } catch { return; }
  if (/[?#\\\u0000-\u001f]/.test(decoded) || decoded.split("/").some(part => part === "." || part === "..")) return;
  return value;
}

export function providerUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value);
    if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password) return url.href;
  } catch { /* An invalid provider address is not an actionable link. */ }
}

export function previewRoleLabel(role?: string): string {
  return ({ original: "원본 서식", example: "작성 예시", combined: "양식·설명 합본", "image-compilation": "기관 사례 변환본", "web-example-image": "기관 사례 이미지" } as Record<string, string>)[role || ""] || "제공 자료";
}

/** A configured preview is not a claim that a remote browser has loaded it. */
export function resolvePreview(item: PreviewDocument): ResolvedPreview {
  const files = item.files.filter(file => file.path && file.delivery !== "pending");
  const local = files.filter(file => file.delivery === "hosted" && localArtifact(file.path));
  const meta = item.preview;
  const source = local.find(file => file.path === localArtifact(meta?.sourcePath));
  // Existing metadata is usable only if it is traceable to an actual catalogue file.
  const traced = !!source && meta?.editorialRedraw !== true;
  const generatedImage = traced && finiteSize(meta?.width) && finiteSize(meta?.height)
    ? [item.example].map(localArtifact).find(path => path && IMAGE.test(path)) : undefined;
  const rawImage = local.find(file => IMAGE.test(file.path));
  const rawPdf = local.find(file => PDF.test(file.path));
  const derivedPdf = traced && localArtifact(meta?.pdfPath) && PDF.test(meta?.pdfPath || "") ? meta?.pdfPath : undefined;
  const sourcePdf = source && PDF.test(source.path) ? source.path : derivedPdf;
  // Do not pair an example image with a different original PDF and call it the same document.
  const pdfPath = generatedImage ? sourcePdf : rawImage ? undefined : rawPdf?.path;
  const imagePath = generatedImage || rawImage?.path;
  const role = generatedImage ? meta?.sourceRole || source?.role : rawImage?.role || (pdfPath === rawPdf?.path ? rawPdf?.role : source?.role);
  const originalPath = generatedImage ? source?.path : rawImage?.path || (derivedPdf ? source?.path : rawPdf?.path) || local[0]?.path;
  const base: ResolvedPreview = {
    kind: "pending", label: "미리보기 준비 중", lowResolution: !!(generatedImage && meta?.lowResolution),
    originalPath, providerUrl: providerUrl(item.sourceUrl) || files.map(file => providerUrl(file.path)).find(Boolean),
  };
  if (imagePath || pdfPath) return {
    ...base, kind: imagePath ? "image" : "pdf", label: "문서 미리보기", imagePath, pdfPath,
    thumbnailPath: generatedImage ? localArtifact(item.thumbnail) || imagePath : imagePath,
    width: generatedImage ? meta?.width : undefined,
    height: generatedImage ? meta?.height : undefined,
    pageCount: traced && finiteSize(meta?.pageCount) ? meta?.pageCount : undefined,
    role, method: generatedImage ? meta?.method : imagePath ? "institution-image" : "original-pdf",
  };
  // Hosted but unsupported/broken files must never disappear into the provider category.
  if (!local.length && !files.some(file => file.delivery === "hosted") && base.providerUrl)
    return { ...base, kind: "provider", label: "제공처 이용 안내" };
  return base;
}

export function previewCoverage(items: readonly PreviewDocument[]) {
  const counts = { total: 0, ready: 0, provider: 0, pending: 0 };
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id) || item.resource?.presentation?.visibility === "archived") continue;
    seen.add(item.id); counts.total++;
    const kind = resolvePreview(item).kind;
    if (kind === "image" || kind === "pdf") counts.ready++;
    else counts[kind]++;
  }
  return counts;
}
