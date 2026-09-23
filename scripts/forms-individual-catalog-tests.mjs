import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require(process.env.FORMS_TYPESCRIPT_PATH || 'typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'forms-individual-'));
let count = 0;
const test = (name, run) => { run(); count++; console.log(`PASS ${name}`); };
try {
  for (const name of ['catalog', 'individual-catalog']) {
    const code = ts.transpileModule(fs.readFileSync(path.join(root, `lib/forms/${name}.ts`), 'utf8'), {
      fileName: `${name}.ts`, reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    });
    assert.equal((code.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
    fs.writeFileSync(path.join(temp, `${name}.js`), code.outputText);
  }
  const { emptyFilters, filterCatalog, matchesResource, parseCatalogFilters, catalogUrl, availableFiles } = require(path.join(temp, 'catalog.js'));
  const { buildIndividualCatalog, legacyGroupDocuments } = require(path.join(temp, 'individual-catalog.js'));
  const document = (id, overrides = {}) => ({
    id, title: id, category: '', description: '', tags: '', format: 'PDF', editable: '', example: null, thumbnail: null,
    sizeLabel: '', institution: '테스트 기관', sourceUrl: 'https://example.org', checkedOn: '', license: '', verification: '',
    delivery: 'hosted', originalCategory: '', catalogTitle: id, exampleVerification: '', licenseUrl: '',
    files: [{ name: `${id}.pdf`, path: `/downloads/official-forms/${id}.pdf`, format: 'PDF', role: 'original', bytes: 10, delivery: 'hosted' }],
    resource: {
      resource_id: id, stage_ids: ['S5'], primary_stage_id: 'S5',
      facets: { purposes: ['gift'], timing: ['before_death', 'after_death'], assets: ['cash_deposit'], kind: 'form', delivery: 'hosted' },
      presentation: { visibility: 'standalone' }, relations: [],
    }, ...overrides,
  });
  const a = document('A', { title: '상속세 신고서' });
  a.resource.facets.purposes = ['inheritance'];
  a.resource.facets.timing = ['after_death'];
  const b = document('B', { title: '증여세 신고서' });
  b.resource.presentation.visibility = 'within_parent';
  b.resource.relations = [{ type: 'ui_member_of', target_resource_id: 'G' }];
  const c = document('C', { title: '증여세 작성사례', example: '/downloads/official-forms/C.png' });
  c.resource.facets.kind = 'example';
  c.resource.presentation.visibility = 'within_parent';
  c.resource.relations = [{ type: 'example_for', target_resource_id: 'B' }];
  const archived = document('OLD'); archived.resource.presentation.visibility = 'archived';
  const docs = [a, b, c, archived];
  const groups = [{ id: 'G', title: '신고자료 합본 전용검색어', primary_stage_id: 'S1', member_resource_ids: ['A', 'B'] }];
  const index = buildIndividualCatalog(docs, groups);
  const ids = cards => cards.map(card => card.id).sort();
  const filter = patch => filterCatalog(index, { ...emptyFilters(), ...patch });

  test('One standalone card per active document, including prior children', () => assert.deepEqual(ids(index.cards), ['A', 'B', 'C']));
  test('No group card or sibling resources are carried by a document card', () => {
    for (const card of index.cards) { assert.equal(card.group, undefined); assert.deepEqual(card.resources, [card.document]); assert.equal(card.id, card.document.id); }
  });
  test('Parent membership does not replace the child title, stage or preview', () => {
    const card = index.cards.find(card => card.id === 'C');
    assert.equal(card.title, c.title); assert.equal(card.stage, 'S5'); assert.equal(card.document.example, c.example);
  });
  test('A document appearing in several legacy groups remains a single card', () => {
    const extra = { ...groups[0], id: 'G2' };
    assert.deepEqual(ids(buildIndividualCatalog(docs, [...groups, extra]).cards), ['A', 'B', 'C']);
  });
  test('Archived records stay out of results but keep their direct lookup', () => {
    assert.equal(index.documents.get('OLD'), archived); assert.deepEqual(filter({ q: 'OLD' }), []);
  });
  test('Unclassified documents are visible in the unfiltered list', () => assert.equal(buildIndividualCatalog([document('X', { resource: undefined })], []).cards.length, 1));
  test('Orphaned within-parent documents are no longer hidden', () => {
    const orphan = document('X'); orphan.resource.presentation.visibility = 'within_parent';
    orphan.resource.relations = [{ type: 'subform_of', target_resource_id: 'missing' }];
    assert.equal(buildIndividualCatalog([orphan], []).cards[0].id, 'X');
  });
  test('Cyclic parent references neither hide documents nor hang the catalogue', () => {
    const x = document('X'), y = document('Y');
    for (const [from, to] of [[x, y], [y, x]]) { from.resource.presentation.visibility = 'within_parent'; from.resource.relations = [{ type: 'subform_of', target_resource_id: to.id }]; }
    assert.deepEqual(ids(buildIndividualCatalog([x, y], []).cards), ['X', 'Y']);
  });
  test('Gift search at S5 returns the matching documents, not the parent or siblings', () => {
    const f = parseCatalogFilters('?timing=before_death%2Cafter_death&stage=S5&q=%EC%A6%9D%EC%97%AC');
    assert.deepEqual(ids(filterCatalog(index, f)), ['B', 'C']);
    assert.ok(filterCatalog(index, f).every(card => card.matchedIds.length === 1));
  });
  test('Kind filtering exposes a formerly hidden example directly', () => assert.deepEqual(ids(filter({ kind: ['example'] })), ['C']));
  test('Facets keep OR within a category and AND across categories', () => {
    assert.deepEqual(ids(filter({ purpose: ['gift', 'inheritance'], kind: ['form'] })), ['A', 'B']);
    assert.deepEqual(ids(filter({ purpose: ['inheritance'], kind: ['example'] })), []);
  });
  test('Legacy group titles do not cause unrelated documents to match', () => assert.deepEqual(filter({ q: '전용검색어' }), []));
  test('Original records, relation metadata and files are not rewritten', () => {
    const before = JSON.stringify(docs); const next = buildIndividualCatalog(docs, groups);
    assert.equal(JSON.stringify(docs), before); assert.equal(next.documents.get('B'), b); assert.equal(next.cards.find(card => card.id === 'B').resources[0].files, b.files);
  });
  test('PDF and HWP formats of the same record remain on one card', () => {
    const x = document('X'); x.files.push({ ...x.files[0], name: 'X.hwp', path: '/downloads/official-forms/X.hwp', format: 'HWP' });
    const cards = buildIndividualCatalog([x], []).cards;
    assert.equal(cards.length, 1); assert.equal(availableFiles(cards[0].document).length, 2);
  });
  test('An old group URL resolves to named document links including nested examples', () => assert.deepEqual(legacyGroupDocuments(index, 'G').map(item => item.id).sort(), ['A', 'B', 'C']));
  test('Missing or stale group members do not create fictitious documents', () => {
    const g = { ...groups[0], member_resource_ids: ['OLD', 'MISSING'] };
    assert.deepEqual(legacyGroupDocuments(buildIndividualCatalog(docs, [g]), 'unknown'), []);
    const result = legacyGroupDocuments(buildIndividualCatalog([a, archived], [g]), 'G');
    assert.deepEqual(result, []);
  });
  test('Duplicate IDs fail visibly rather than silently discarding documents', () => assert.throws(() => buildIndividualCatalog([a, a], groups), /Duplicate library resource/));
  test('Sorting uses each document stage, not its former group stage', () => {
    const x = document('X'); x.resource.primary_stage_id = 'S1';
    assert.equal(buildIndividualCatalog([b, x], groups).cards[0].id, 'X');
  });
  test('Existing aliases and filters survive detail open/close URL round trips', () => {
    const f = parseCatalogFilters('?purpose=gift&timing=before_death,after_death&stage=S5&q=증여&resource=P1-05');
    assert.equal(f.resource, 'REG-G-01');
    const closed = parseCatalogFilters(catalogUrl({ ...f, resource: '' }).split('?')[1]);
    assert.equal(closed.q, '증여'); assert.equal(closed.stage, 'S5'); assert.deepEqual(closed.timing, ['before_death', 'after_death']);
  });
  test('Synthetic 177-record catalogue keeps every active record once', () => {
    const rows = Array.from({ length: 177 }, (_, i) => document(`D${i}`));
    rows.forEach(row => { row.resource.presentation.visibility = 'within_parent'; });
    const cards = buildIndividualCatalog(rows, []).cards;
    assert.equal(cards.length, 177); assert.equal(new Set(cards.map(card => card.id)).size, 177);
  });
  test('UI source uses the individual catalogue and removes nested-card controls', () => {
    const source = fs.readFileSync(path.join(root, 'app/forms/FormsLibrary.tsx'), 'utf8');
    assert.match(source, /buildIndividualCatalog\(documents, groups\)/);
    assert.match(source, /data-card-kind="document"/);
    assert.doesNotMatch(source, /GroupDocumentPreview|data-members|card\.group|대표 자료/);
    assert.match(source, /PreviewThumbnail item=\{item\}/);
    assert.match(source, /FileAction item=\{item\}/);
    const parsed = ts.transpileModule(source, { fileName: 'FormsLibrary.tsx', reportDiagnostics: true, compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } });
    assert.equal((parsed.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  });
  // Optional real-manifest integration. Do not count it as run in a fixture-only environment.
  const manifestPath = path.join(root, 'public/downloads/official-forms/manifest.json');
  if (fs.existsSync(manifestPath)) {
    test('Real manifest: every active document is independently searchable without changing any source', () => {
      const read = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
      const real = read(manifestPath).documents;
      const realGroups = read(path.join(root, 'public/downloads/official-forms/presentation-groups.json'));
      const result = buildIndividualCatalog(real, realGroups);
      const active = real.filter(row => row.resource?.presentation.visibility !== 'archived');
      assert.deepEqual(ids(result.cards), active.map(row => row.id).sort());
      const f = parseCatalogFilters('?timing=before_death,after_death&stage=S5&q=증여');
      assert.deepEqual(ids(filterCatalog(result, f)), active.filter(row => matchesResource(row, f)).map(row => row.id).sort());
    });
  } else console.log('NOT RUN real-manifest integration: repository dataset is not present in this isolated test directory.');
  console.log(`${count} individual-catalogue tests passed. Browser and production-build tests were not run by this script.`);
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
