import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { availableFiles, buildCatalog, catalogUrl, emptyFilters, filterCatalog, originLabel, providerLabel, parseCatalogFilters, type LibraryDocument, type PresentationGroup } from "./catalog";

function doc(id: string, purposes: string[] = [], assets: string[] = [], parent?: string, relation = "ui_member_of"): LibraryDocument {
  return { id, title: id, category: "legacy", description: "", tags: "", format: "HWP", editable: "", example: null, thumbnail: null, sizeLabel: "", institution: "기관", sourceUrl: "", checkedOn: "", license: "", verification: "", delivery: "hosted", originalCategory: "", catalogTitle: id, exampleVerification: "", licenseUrl: "", files: [],
    resource: { resource_id: id, stage_ids: ["S3"], primary_stage_id: "S3", facets: { purposes, assets, timing: ["before_death"], kind: "form", delivery: "hosted" }, presentation: { visibility: parent ? "within_parent" : "standalone" }, relations: parent ? [{ type: relation, target_resource_id: parent }] : [] } };
}
const group = (id: string, ids: string[]): PresentationGroup => ({ id, title: `묶음 ${id}`, primary_stage_id: "S3", member_resource_ids: ids });

test("AND facets must match the same child, while alternatives within one facet are OR", () => {
  const index = buildCatalog([doc("gift-cash", ["gift"], ["cash_deposit"], "group"), doc("inherit-real", ["inheritance"], ["real_estate"], "group")], [group("group", ["gift-cash", "inherit-real"])]);
  assert.equal(filterCatalog(index, { ...emptyFilters(), purpose: ["gift"], asset: ["real_estate"] }).length, 0);
  const result = filterCatalog(index, { ...emptyFilters(), purpose: ["gift", "inheritance"], asset: ["real_estate"] });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].matchedIds, ["inherit-real"]);
});

test("nested children search under deduplicated parents and shared attachment can appear in multiple parents", () => {
  const root = doc("main", ["gift"], ["real_estate"]);
  const sub = doc("subform", ["gift"], [], "main", "subform_of");
  const attachment = doc("공통참고", ["gift"], [], "subform", "attachment_of");
  attachment.resource!.relations.push({ type: "attachment_of", target_resource_id: "group" });
  const index = buildCatalog([root, sub, attachment, doc("member", ["gift"], [], "group")], [group("group", ["member"])]);
  const result = filterCatalog(index, { ...emptyFilters(), q: "공통참고" });
  assert.deepEqual(new Set(result.map(card => card.id)), new Set(["main", "group"]));
  assert.ok(result.every(card => card.matchedIds.length === 1 && card.matchedIds[0] === "공통참고"));
  assert.deepEqual(index.rootsByResource.get("subform"), ["main"]);
});

test("direct entry has no default filters and URL values roundtrip without stale context", () => {
  assert.deepEqual(parseCatalogFilters(""), emptyFilters());
  const input = { ...emptyFilters(), purpose: ["gift", "inheritance"], timing: ["before_death"], stage: "S3", q: "상속 협의", resource: "BP-I-01", from: "precheck" };
  assert.deepEqual(parseCatalogFilters(catalogUrl(input).split("?")[1]), input);
  assert.deepEqual(parseCatalogFilters("purpose=bad&timing=unknown&stage=S9&from=history"), emptyFilters());
  assert.equal(catalogUrl(emptyFilters()), "/forms");
  assert.equal(parseCatalogFilters("resource=P1-03").resource, "REG-I-01");
  assert.equal(parseCatalogFilters("resource=P8-07").resource, "P1-22");
});

test("archived resources preserve direct lookup but never leak into normal search; cycles terminate", () => {
  const archived = doc("old", ["gift"], []); archived.resource!.presentation.visibility = "archived";
  const index = buildCatalog([archived, doc("a", [], [], "b"), doc("b", [], [], "a"), doc("visible")], []);
  assert.deepEqual(filterCatalog(index, emptyFilters()).map(card => card.id), ["visible"]);
  assert.equal(index.documents.get("old"), archived);
});

test("missing classification is never guessed from legacy category", () => {
  const missing = doc("증여부동산"); delete missing.resource; missing.category = "증여";
  assert.equal(filterCatalog(buildCatalog([missing], []), { ...emptyFilters(), purpose: ["gift"] }).length, 0);
});

test("download menu keeps real formats and deduplicates paths without inventing conversions", () => {
  const item = doc("files");
  item.files = [
    { name: "원본.hwp", path: "/original.hwp", format: "HWP", role: "original", bytes: 30, delivery: "hosted" },
    { name: "중복.pdf", path: "/original.hwp", format: "PDF", role: "original", bytes: 30, delivery: "hosted" },
    { name: "예시.hwp", path: "/example.hwp", format: "HWP", role: "example", bytes: 30, delivery: "hosted" },
  ];
  assert.deepEqual(availableFiles(item).map(file => file.format), ["HWP", "HWP"]);
  assert.equal(availableFiles(item).length, 2);
});


test("private provider is not presented as a public official form", () => {
  const item = doc("private"); item.resource!.facets.origin = "private_institution"; item.resource!.facets.authority = "private_terms";
  assert.equal(providerLabel(item), "민간 제공처");
  assert.equal(originLabel(item), "민간 제공 참고서식");
  delete item.resource;
  assert.equal(providerLabel(item), "제공처");
});

test("the migrated real catalog exposes 103 cards and keeps every active original reachable", () => {
  const manifest = JSON.parse(readFileSync("public/downloads/official-forms/manifest.json", "utf8"));
  const groups = JSON.parse(readFileSync("public/downloads/official-forms/presentation-groups.json", "utf8"));
  const documents = manifest.documents as LibraryDocument[];
  const index = buildCatalog(documents, groups);
  const result = filterCatalog(index, emptyFilters());
  assert.equal(result.length, 103);
  assert.equal(new Set(result.map(card => card.id)).size, 103);
  assert.equal(new Set(result.flatMap(card => card.matchedIds)).size, 168);
  for (const item of documents) {
    assert.equal(Boolean(index.rootsByResource.get(item.id)?.length), item.resource?.presentation.visibility !== "archived", item.id);
  }
  assert.equal(index.rootsByResource.get("P1-13")?.length, 3);
  assert.equal(index.rootsByResource.get("P9-03")?.length, 2);
  assert.equal(index.documents.get("P3-05")?.resource?.facets.origin, "private_institution");
  assert.equal(index.documents.get("P8-02")?.resource?.facets.kind, "example");
  assert.equal(index.documents.get("P9-07")?.resource?.facets.kind, "guide");
});
