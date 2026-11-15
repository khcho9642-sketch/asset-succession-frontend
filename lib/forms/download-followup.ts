import type { LibraryDocument } from "./catalog";
import followup from "./download-followup.json";
import { getResourceUsage } from "./resource-usage";

type Followup = { document: Partial<LibraryDocument>; delivery: string | null; authority: string | null; origin?: string; exclusionReason?: string };

/** Enrich only reviewed records; keep identifiers, facets, relations and older originals intact. */
export function applyDownloadFollowup(item: LibraryDocument): LibraryDocument {
  const update = (followup as Record<string, Followup>)[item.id];
  if (!update) return item;
  const usage = item.usage || getResourceUsage(item.id);
  return {
    ...item,
    ...update.document,
    usage: usage && update.document.files ? {
      ...usage,
      note: update.document.reviewSummary!.limitation,
      sourceUrls: [...new Set([update.document.sourceUrl!, ...usage.sourceUrls])],
    } : item.usage,
    resource: item.resource ? {
      ...item.resource,
      ...(update.exclusionReason ? { presentation: {
        ...item.resource.presentation,
        visibility: "excluded",
        reason: update.exclusionReason,
      } } : {}),
      facets: {
        ...item.resource.facets,
        ...(update.delivery ? { delivery: update.delivery } : {}),
        ...(update.authority ? { authority: update.authority } : {}),
        ...(update.origin ? { origin: update.origin } : {}),
      },
    } : undefined,
  };
}
