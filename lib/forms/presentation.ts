import { availableFiles, useCategory, type LibraryDocument } from "./catalog";
import { getResourceUsage } from "./resource-usage";

/** Labels describe the next screen; downloading is offered only on a file link. */
export function getResourceActionLabel(item: LibraryDocument): string {
  if (item.resource?.facets.kind === "example") return "작성 예시 보기";
  if (useCategory(item) === "form") return "서식·파일 보기";
  if (useCategory(item) === "guide") return "이용 안내 보기";
  if (/발급|증명서/.test(item.title)) return "발급 방법 보기";
  if (/신청|청구/.test(item.title)) return "신청 방법 보기";
  return "조회 방법 보기";
}

export function getDisplayedUsage(item: LibraryDocument) {
  const usage = item.usage || getResourceUsage(item.id);
  if (!usage) return undefined;
  const isSupplement = item.resource?.relations.some(relation => relation.type === "subform_of");
  // Older generic guidance mentions a tax return even on stand-alone contracts.
  // Keep the source record intact and use neutral file-use instructions here.
  if (!isSupplement && usage.steps.some(step => step.includes("본 신고서와 해당 부표"))) {
    return { ...usage, prepare: ["해당 서식의 기재 항목과 함께 제공된 작성 예시"], steps: ["원본 서식과 작성 예시를 구분해 확인합니다.", "제공기관 안내에서 필요한 증빙과 제출 경로를 확인합니다."], note: "다운로드한 파일은 기기에서 열어 작성하세요. 작성·제출 방법은 제공기관 안내를 확인하세요." };
  }
  return usage;
}

export function getPrimaryFile(item: LibraryDocument) {
  const files = availableFiles(item);
  return files.length === 1 ? files[0] : undefined;
}
