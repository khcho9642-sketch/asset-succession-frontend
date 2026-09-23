import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { catalog, individual, partsApi, previewApi, manifest, parts, sections, documents, current, read } from './load-current-forms.mjs';
const index = read('public/downloads/official-forms/preview-index.json').documents;
const sha = path => createHash('sha256').update(readFileSync(`public${decodeURIComponent(path)}`)).digest('hex');

test('177 source records become 200 independently addressable documents, without deleting original IDs', () => {
  assert.equal(manifest.documents.length, 177);
  assert.equal(documents.length, 200);
  assert.equal(current.cards.length, 191);
  assert.equal(documents.filter(item => item.resource?.presentation.visibility === 'archived').length, 9);
  for (const item of manifest.documents) assert.ok(current.documents.has(item.id), item.id);
  for (const card of current.cards) assert.deepEqual(card.resources.map(item => item.id), [card.id]);
});
test('all 40 legacy HWP images retain source/stream/image hashes; two parent previews upgrade to section PDFs', () => {
  const legacy = manifest.documents.filter(item => item.preview?.method === 'hwp-embedded-image');
  assert.equal(legacy.length, 40);
  for (const item of legacy) {
    assert.equal(sha(item.preview.sourcePath), item.preview.sourceSha256);
    assert.equal(sha(item.thumbnail), item.preview.sha256);
    const candidates = Object.values(index).filter(entry => entry.preview.sourcePath === item.preview.sourcePath);
    if (['NTS-IG-10','NTS-IG-11'].includes(item.id)) {
      assert.equal(index[item.id].preview.method, 'original-pdf-section');
    } else {
      assert.ok(candidates.some(entry => entry.preview.legacyRestored && entry.example === item.thumbnail), item.id);
    }
  }
});
test('all active hosted documents have actual traceable previews, provider services stay distinct', () => {
  assert.deepEqual(previewApi.previewCoverage(documents), { total: 191, ready: 123, provider: 68, pending: 0 });
  for (const item of documents.filter(item => item.resource?.presentation.visibility !== 'archived')) {
    const preview = previewApi.resolvePreview(item);
    if (item.files.some(file => file.delivery === 'hosted')) {
      assert.equal(preview.kind, 'image', item.id);
      assert.ok(preview.width > 0 && preview.height > 0, item.id);
      assert.equal(sha(preview.imagePath), index[item.id].preview.imageSha256);
    } else assert.equal(preview.kind, 'provider', item.id);
  }
});
test('distinct original/example files split exactly once, but PDF/HWP/DOC formats remain one document', () => {
  for (const [id, definitions] of Object.entries(parts.documents)) {
    const original = manifest.documents.find(item => item.id === id);
    assert.deepEqual(definitions.flatMap(part => current.documents.get(part.id).files.map(file => file.path)).sort(), original.files.map(file => file.path).sort());
    for (const part of definitions) assert.equal(current.documents.get(part.id).files.length, 1);
  }
  assert.deepEqual(current.documents.get('SC-22').files.map(file => file.format), ['HWP','DOC','PDF']);
  assert.equal(current.documents.get('NTS-CE-01').files.length, 6, 'five pages of one example remain one document');
});
test('all 21 PDF sections point at the selected original pages, not the bundle cover', () => {
  assert.equal(sections.bundles.flatMap(bundle => bundle.sections).length, 21);
  for (const bundle of sections.bundles) for (const part of bundle.sections) {
    const item = current.documents.get(part.id), preview = index[part.id].preview;
    assert.deepEqual(preview.sourcePages, part.pages, part.id);
    assert.equal(preview.method, 'original-pdf-section', part.id);
    assert.equal(preview.pageCount, part.pages[1] - part.pages[0] + 1, part.id);
    assert.equal(item.files[0].role, 'extracted');
    assert.equal(sha(item.files[0].path), preview.pdfSha256);
    assert.equal(item.files[0].bytes, readFileSync(`public${item.files[0].path}`).length);
  }
});
test('related original/example/section links are symmetric, distinct, and do not group result cards', () => {
  for (const definitions of Object.values(parts.documents)) for (const part of definitions) {
    const related = individual.relatedDocuments(current, part.id).map(item => item.id);
    for (const other of definitions) if (other.id !== part.id) assert.ok(related.includes(other.id));
    assert.ok(!related.includes(part.id));
  }
  assert.ok(individual.relatedDocuments(current, 'P5-04').some(item => item.id === 'NTS-IG-11'));
  assert.ok(current.cards.some(card => card.id === 'P5-04'));
});
test('split tax documents match their own purpose, with OR within a facet and AND between facets', () => {
  const filter = patch => catalog.filterCatalog(current, { ...catalog.emptyFilters(), ...patch }).map(card => card.id);
  assert.ok(!filter({purpose:['inheritance'],q:'P2-11-GIFT'}).includes('P2-11-GIFT'));
  assert.ok(filter({purpose:['inheritance','gift'],q:'P2-11-GIFT'}).includes('P2-11-GIFT'));
  const example = filter({kind:['example'],q:'상속재산분할협의서'});
  assert.ok(example.includes('BP-I-01-EXAMPLE'));
  assert.ok(!example.includes('BP-I-01'));
});
test('unsafe or incomplete split definitions are rejected rather than hiding originals', () => {
  const broken = structuredClone(parts);
  broken.documents['BP-I-01'][1].fileIndexes = [0];
  assert.throws(() => partsApi.expandDocumentParts(manifest.documents, broken), /each original file/);
  const duplicate = structuredClone(parts);
  duplicate.documents['BP-I-01'][1].id = 'SC-22';
  assert.throws(() => partsApi.expandDocumentParts(manifest.documents, duplicate), /Duplicate/);
});
