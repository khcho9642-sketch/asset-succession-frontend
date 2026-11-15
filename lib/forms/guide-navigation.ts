import type { GuideTiming } from "./guides";

export type GuideSelection = { stepId: string; assetId: string };
export type GuideAssetChoice = { id: string; label: string; catalogAsset?: string; resourceIds: readonly string[] };

// Navigation only. These groups do not change a resource's classification or ID.
export const DISTRIBUTION_ASSETS: readonly GuideAssetChoice[] = [
  { id: "all", label: "전체 자산", resourceIds: [] },
  { id: "real-estate", label: "부동산", catalogAsset: "real_estate", resourceIds: ["BP-I-01", "REG-I-03", "REG-I-01"] },
  { id: "bank", label: "은행·예금", catalogAsset: "cash_deposit", resourceIds: ["BP-I-01", "P6-01", "BANK-ADD-01"] },
  { id: "shares", label: "주식", catalogAsset: "securities", resourceIds: ["BP-I-01", "P6-04"] },
  { id: "insurance", label: "보험·연금", catalogAsset: "insurance_pension", resourceIds: ["P6-06", "BANK-ADD-06", "P6-03", "P0-16"] },
];
export const DISTRIBUTION_CONTEXT_IDS = ["P8-01", "P1-15"] as const;
const GIFT_CATALOG_ASSETS: Record<string, { label: string; catalogAsset: string }> = {
  cash: { label: "현금", catalogAsset: "cash_deposit" },
  "real-estate": { label: "부동산", catalogAsset: "real_estate" },
  shares: { label: "주식", catalogAsset: "securities" },
};

export function guideAssetChoices(guideId: GuideTiming, stepId: string): readonly GuideAssetChoice[] {
  return guideId === "after-death" && stepId === "transfer" ? DISTRIBUTION_ASSETS : [];
}

export function guideSelectionHash(stepId: string, assetId = ""): string {
  return `${stepId}${assetId && assetId !== "all" ? `--${assetId}` : ""}`;
}

/** Old step/service anchors stay valid; unknown filters never hide all resources. */
export function resolveGuideSelection(
  guideId: GuideTiming,
  stepIds: readonly string[],
  hash: string,
  anchorStepIds: Record<string, string> = {},
): GuideSelection | null {
  let value: string;
  try { value = decodeURIComponent(hash.replace(/^#/, "")); } catch { return null; }
  const [requestedStep, requestedAsset = ""] = value.split("--");
  const stepId = anchorStepIds[requestedStep] || requestedStep;
  if (!stepIds.includes(stepId)) return null;
  const choices = guideAssetChoices(guideId, stepId);
  const assetId = choices.some(choice => choice.id === requestedAsset) ? requestedAsset : "";
  return { stepId, assetId };
}

export function visibleGuideResourceIds(guideId: GuideTiming, stepId: string, resourceIds: readonly string[], assetId: string): string[] {
  const choices = guideAssetChoices(guideId, stepId);
  const selected = choices.find(choice => choice.id === assetId);
  if (!selected || selected.id === "all") return [...resourceIds];
  const assigned = new Set(choices.flatMap(choice => choice.resourceIds));
  // Unassigned resources remain visible as context, including future additions.
  return resourceIds.filter(id => selected.resourceIds.includes(id) || !assigned.has(id));
}

export function guideCatalogAsset(guideId: GuideTiming, selection: GuideSelection): { label: string; catalogAsset: string } | null {
  const choice = guideAssetChoices(guideId, selection.stepId).find(choice => choice.id === selection.assetId);
  if (choice?.catalogAsset) return { label: choice.label, catalogAsset: choice.catalogAsset };
  return guideId === "gift" ? GIFT_CATALOG_ASSETS[selection.stepId] || null : null;
}

export function guideRelatedCatalogUrl(baseUrl: string, guideId: GuideTiming, selection: GuideSelection): string {
  const params = new URLSearchParams(baseUrl.split("?")[1] || "");
  params.set("view", "all");
  const asset = guideCatalogAsset(guideId, selection)?.catalogAsset;
  if (asset) params.set("asset", asset);
  return `/forms?${params.toString()}`;
}
