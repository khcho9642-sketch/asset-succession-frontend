import type { LibraryDocument } from "./catalog";

export type DocumentParts = { schemaVersion: number; documents: Record<string, {
  id: string; title: string; fileIndexes: number[]; purposes?: string[];
}[]> };
export type DocumentSections = { schemaVersion: number; bundles: {
  parentId: string; pdfRecordId: string; fileIndex: number;
  sections: { id: string; title: string; pages: number[]; match: string }[];
}[] };

/** Presentation overlay only: stable source records and original bytes are retained. */
export function expandDocumentParts(documents: LibraryDocument[], parts: DocumentParts): LibraryDocument[] {
  if (parts.schemaVersion !== 1) throw new Error("Invalid document parts schema");
  const known = new Set(documents.map(item => item.id));
  for (const id of Object.keys(parts.documents)) if (!known.has(id)) throw new Error(`Unknown document part source: ${id}`);
  const result = documents.flatMap(item => {
    const definitions = parts.documents[item.id];
    if (!definitions) return [item];
    if (!definitions.some(part => part.id === item.id)) throw new Error(`Source bookmark missing: ${item.id}`);
    const indexes = definitions.flatMap(part => part.fileIndexes);
    if (indexes.length !== item.files.length || new Set(indexes).size !== indexes.length
      || indexes.some(index => !Number.isInteger(index) || index < 0 || index >= item.files.length))
      throw new Error(`Document parts must cover each original file exactly once: ${item.id}`);
    return definitions.map(part => {
      const files = part.fileIndexes.map(index => item.files[index]);
      const example = files.every(file => file.role === "example");
      const preview = files.some(file => file.path === item.preview?.sourcePath) ? item.preview : undefined;
      return {
        ...item, id: part.id, title: part.title, catalogTitle: part.title, sourceRecordId: item.id,
        description: `${part.title}. ${item.institution} 제공 자료이며 관련 서류는 상세에서 함께 확인할 수 있습니다.`,
        files, editable: files[0].path, format: [...new Set(files.map(file => file.format))].join(" · "),
        example: preview ? item.example : null, thumbnail: preview ? item.thumbnail : null, preview,
        resource: item.resource ? {
          ...item.resource, resource_id: part.id, title: part.title,
          facets: { ...item.resource.facets, kind: example ? "example" : "form", purposes: part.purposes || item.resource.facets.purposes },
          relations: [...item.resource.relations, ...definitions.filter(other => other.id !== part.id)
            .map(other => ({ type: "related_to", target_resource_id: other.id }))],
        } : undefined,
      };
    });
  });
  if (new Set(result.map(item => item.id)).size !== result.length) throw new Error("Duplicate document part ID");
  return result;
}

export function expandDocumentSections(documents: LibraryDocument[], config: DocumentSections): LibraryDocument[] {
  if (config.schemaVersion !== 1) throw new Error("Invalid section schema");
  const result = new Map(documents.map(item => [item.id, item]));
  const originals = new Map(result);
  const assigned = new Set<string>();
  for (const bundle of config.bundles) {
    const parent = originals.get(bundle.parentId);
    const source = originals.get(bundle.pdfRecordId)?.files[bundle.fileIndex];
    if (!parent?.resource || !source || source.format !== "PDF" || source.delivery !== "hosted") throw new Error("Invalid section source");
    for (const part of bundle.sections) {
      if (assigned.has(part.id) || part.pages.length !== 2 || part.pages[0] < 1 || part.pages[1] < part.pages[0]) throw new Error("Invalid section range/ID");
      assigned.add(part.id);
      const original = originals.get(part.id) || parent;
      const files = [...original.files.filter(file => file.path !== source.path), source];
      result.set(part.id, {
        ...original, id: part.id, title: part.title, catalogTitle: part.title,
        sourceRecordId: originals.has(part.id) ? part.id : bundle.parentId,
        description: `${part.title}. 기관 원본 합본의 ${part.pages[0]}~${part.pages[1]}쪽을 확인하세요.`,
        files: files.map(file => ({ ...file, name: `${file.name} (원본 합본)` })),
        documentSection: { sourcePath: source.path, pages: part.pages, match: part.match },
        preview: undefined, example: null, thumbnail: null,
        resource: { ...original.resource!, resource_id: part.id, title: part.title,
          relations: [...(original.resource?.relations || []), ...bundle.sections.filter(other => other.id !== part.id)
            .map(other => ({ type: "related_to", target_resource_id: other.id }))] },
      });
    }
  }
  return [...result.values()];
}
