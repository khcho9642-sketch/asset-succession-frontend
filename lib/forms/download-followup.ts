import type { LibraryDocument } from "./catalog";
import followup from "./download-followup.json";

type Followup = { document: Partial<LibraryDocument>; delivery: string | null; authority: string | null };

/** Enrich only reviewed records; keep identifiers, facets, relations and older originals intact. */
export function applyDownloadFollowup(item: LibraryDocument): LibraryDocument {
  const update = (followup as Record<string, Followup>)[item.id];
  if (!update) return item;
  return {
    ...item,
    ...update.document,
    resource: item.resource ? {
      ...item.resource,
      facets: {
        ...item.resource.facets,
        ...(update.delivery ? { delivery: update.delivery } : {}),
        ...(update.authority ? { authority: update.authority } : {}),
      },
    } : undefined,
  };
}
