import type { CatalogIndex, LibraryDocument, PresentationGroup } from "./catalog";
import { isPublicResource } from "./catalog";

/** One record, one card. Group membership never hides a document or supplies its preview. */
export function buildIndividualCatalog(documents: LibraryDocument[], groups: PresentationGroup[]): CatalogIndex {
  const docs = new Map<string, LibraryDocument>();
  for (const item of documents) {
    if (docs.has(item.id)) throw new Error(`Duplicate library resource: ${item.id}`);
    docs.set(item.id, item);
  }
  const visible = documents.filter(isPublicResource);
  const cards = visible.map(document => ({
    id: document.id, title: document.title, stage: document.resource?.primary_stage_id || null,
    document, resources: [document], matchedIds: [document.id],
  })).sort((a, b) => (a.stage || "S9").localeCompare(b.stage || "S9")
    || a.title.localeCompare(b.title, "ko") || a.id.localeCompare(b.id));
  return {
    cards, documents: docs,
    // Keep old group bookmarks resolvable; groups are not list cards or search aliases.
    groups: new Map(groups.map(group => [group.id, group])),
    rootsByResource: new Map(documents.map(item => [item.id,
      isPublicResource(item) ? [item.id] : []])),
  };
}

/** Only for old group URLs. Resolve their documents without bringing back nested cards. */
export function legacyGroupDocuments(index: CatalogIndex, groupId: string): LibraryDocument[] {
  const group = index.groups.get(groupId);
  if (!group) return [];
  const ids = new Set(group.member_resource_ids);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of index.documents.values()) {
      if (ids.has(item.id) || item.resource?.presentation.visibility === "archived") continue;
      const meta = item.resource;
      const parentTypes = new Set(["ui_member_of", "subform_of", "example_for", "attachment_of"]);
      const linked = meta?.relations.some(relation => parentTypes.has(relation.type)
        && (relation.target_resource_id === groupId || ids.has(relation.target_resource_id)));
      if (linked || (meta?.presentation.visibility === "within_parent"
        && ids.has(meta.presentation.canonical_resource_id || ""))) {
        ids.add(item.id); changed = true;
      }
    }
  }
  return index.cards.flatMap(card => card.document && ids.has(card.id) ? [card.document] : []);
}

/** Relations are navigation, never a reason to hide or merge a document card. */
export function relatedDocuments(index: CatalogIndex, id: string): LibraryDocument[] {
  const item = index.documents.get(id);
  if (!item) return [];
  const links = new Set(item.resource?.relations.map(relation => relation.target_resource_id));
  for (const group of index.groups.values()) {
    if (group.member_resource_ids.includes(id) || links.has(group.id))
      for (const member of group.member_resource_ids) links.add(member);
  }
  return [...index.documents.values()].filter(other => isPublicResource(other) && other.id !== id && (
    links.has(other.id) || other.resource?.relations.some(relation => relation.target_resource_id === id)
    || (item.sourceRecordId && other.sourceRecordId === item.sourceRecordId)
  ));
}
