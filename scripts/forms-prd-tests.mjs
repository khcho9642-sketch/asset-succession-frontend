import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { documents, publicDocuments, publicCatalog, editorial, catalog, individual, guides } from './load-current-forms.mjs';
const byId = new Map(publicDocuments.map(item => [item.id, item]));
const ids = filters => catalog.filterCatalog(publicCatalog, { ...catalog.emptyFilters(), ...filters }).map(card => card.id);

test('191 baseline cards - 13 exclusions + 8 acquisitions + 5 service imports = 191 unique public items', () => {
  assert.equal(documents.length, 200);
  assert.equal(publicDocuments.length, 213);
  assert.equal(new Set(publicDocuments.map(d => d.id)).size, 213);
  assert.equal(publicCatalog.cards.length, 191);
  assert.equal(publicDocuments.filter(d => d.resource.presentation.visibility === 'archived').length, 9);
  assert.equal(editorial.NEW_DOCUMENTS.length, 8);
  assert.equal(editorial.IMPORTED_SERVICES.length, 5);
});
test('all original records, binaries, previews and source evidence survive the additive editorial layer', () => {
  for (const original of documents) {
    const item = byId.get(original.id);
    for (const key of ['files', 'thumbnail', 'preview', 'documentSection', 'sourceUrl', 'checkedOn', 'license', 'revised_at', 'form_no']) assert.deepEqual(item[key], original[key], `${item.id}/${key}`);
  }
});
test('13 exclusions resolve by ID but cannot match public searches, filters or related links', () => {
  assert.equal(editorial.EXCLUDED_IDS.length, 13);
  for (const id of editorial.EXCLUDED_IDS) {
    assert.equal(byId.get(id).resource.presentation.visibility, 'excluded');
    assert.ok(byId.get(id).sourceUrl.startsWith('https://'));
    assert.ok(!ids({ q: id }).includes(id));
  }
  for (const item of publicCatalog.cards) for (const related of individual.relatedDocuments(publicCatalog, item.id)) assert.ok(catalog.isPublicResource(related));
});
test('eight new resources have genuine official routes and specific usage, never fictional file formats', () => {
  for (const item of editorial.NEW_DOCUMENTS) {
    assert.ok(/\.gov\.kr$|\.go\.kr$/.test(new URL(item.sourceUrl).hostname));
    assert.ok(item.usage.prepare.length && item.usage.steps.length >= 2 && item.usage.note);
    assert.ok(item.files.every(file => file.delivery === 'official_link'), 'new official files are not silently rehosted');
    assert.equal(item.files.length, item.id === 'LIB-ADD-08' ? 1 : 0);
    assert.ok(ids({ q: item.title }).includes(item.id));
  }
});
test('six enrichments preserve IDs and explain filing vs attachments and bank vs agent procedures', () => {
  for (const id of ['NTS-IG-10', 'NTS-IG-11', 'NTS-CG-01', 'NTS-CG-15', 'P6-01', 'P6-04']) {
    assert.equal(publicDocuments.filter(d => d.id === id).length, 1);
    assert.ok(byId.get(id).usage.sourceUrls.length > 0);
    assert.ok(byId.get(id).usage.steps.length >= 2);
  }
  assert.match(byId.get('NTS-CG-15').usage.note, /납부서는 신고서 전체가 아닙니다/);
  assert.match(byId.get('P6-04').usage.note, /서로 다른 절차/);
});
test('18 distinct contexts map to exactly 12 service records and all original application details survive', () => {
  const entries = Object.entries(editorial.SERVICE_CONTEXTS);
  assert.equal(entries.length, 12);
  assert.equal(new Set(entries.flatMap(([, ids]) => ids)).size, 18);
  for (const [id, contexts] of entries) {
    assert.equal(ids({ q: id }).filter(found => found === id).length, 1);
    const actual = editorial.serviceContexts(id);
    assert.deepEqual(actual.map(c => c.service.id).sort(), contexts.toSorted());
    for (const { timing, service } of actual) {
      assert.ok(service.authentication.text && service.menu && service.limitation);
      if (timing === 'after-death') {
        assert.notEqual(service.authentication.kind, 'self');
        assert.ok(service.application.eligibility && service.application.channel && service.application.representative && service.application.documents.length);
      }
    }
  }
});
test('no timing filter or both timings retains both contexts; single selection never silently chooses the opposite', () => {
  for (const id of ['P0-06', 'SVC-INSURANCE', 'SVC-REGISTRY']) {
    assert.equal(editorial.serviceContexts(id).length, 2);
    assert.equal(editorial.serviceContexts(id, ['before_death', 'after_death']).length, 2);
    assert.deepEqual(editorial.serviceContexts(id, ['before_death']).map(c => c.timing), ['before-death']);
    assert.deepEqual(editorial.serviceContexts(id, ['after_death']).map(c => c.timing), ['after-death']);
  }
});
test('use category follows task, not file presence; guide PDFs and external forms remain distinct', () => {
  assert.equal(catalog.useCategory(byId.get('LIB-ADD-08')), 'form');
  assert.equal(catalog.useCategory(byId.get('P0-16')), 'service');
  assert.ok(byId.get('P0-16').files.length);
  assert.equal(catalog.useCategory(byId.get('P1-14')), 'guide');
  const withGuidePdf = { ...byId.get('P1-14'), files: [{ path: '/guide.pdf', format: 'PDF' }] };
  assert.equal(catalog.useCategory(withGuidePdf), 'guide');
});
test('same-axis OR and cross-axis AND apply to the same individual resource', () => {
  const combined = ids({ purpose: ['inheritance', 'gift'], asset: ['real_estate'], use: 'form' });
  const expected = new Set([...ids({ purpose: ['inheritance'], asset: ['real_estate'], use: 'form' }), ...ids({ purpose: ['gift'], asset: ['real_estate'], use: 'form' })]);
  assert.deepEqual(new Set(combined), expected);
  for (const id of combined) {
    const d = byId.get(id);
    assert.ok(d.resource.facets.purposes.some(v => ['inheritance', 'gift'].includes(v)));
    assert.ok(d.assetCommon || d.resource.facets.assets.includes('real_estate'));
  }
});
test('explicit common evidence matches assets; empty unreviewed facets do not masquerade as common', () => {
  assert.ok(ids({ asset: ['real_estate'] }).includes('P0-06'));
  for (const id of ['DD-G-01', 'DD-G-01-MULTIPLE', 'DD-G-01-EXAMPLE']) {
    assert.ok(ids({ asset: ['real_estate'] }).includes(id));
    assert.ok(!ids({ asset: ['cash_deposit'] }).includes(id));
  }
  const empty = { ...byId.get('P0-06'), assetCommon: false, resource: { ...byId.get('P0-06').resource, facets: { ...byId.get('P0-06').resource.facets, assets: [], purposes: [] } } };
  assert.ok(catalog.matchesResource(empty, catalog.emptyFilters()));
  assert.ok(!catalog.matchesResource(empty, { ...catalog.emptyFilters(), asset: ['real_estate'] }));
  assert.ok(!catalog.matchesResource(empty, { ...catalog.emptyFilters(), purpose: ['inheritance'] }));
});
test('split schedules have document-specific business purpose, assets, usage and stage', () => {
  assert.ok(ids({ purpose: ['business_succession'], stage: 'S6' }).includes('NTS-IG-10-S7'));
  assert.ok(ids({ purpose: ['business_succession'], stage: 'S5' }).includes('NTS-IG-11-S2'));
  assert.match(byId.get('NTS-IG-10-S7').description, /추징/);
  assert.match(byId.get('NTS-IG-11-S2').description, /납부유예/);
  assert.ok(ids({ purpose: ['inheritance'], asset: ['real_estate'] }).includes('REG-I-01'));
});
test('reviewed everyday aliases work and exact titles sort first', () => {
  for (const [q, id] of [['부모님 돌아가심', 'P0-01'], ['자녀에게 돈 주기', 'P3-05'], ['상속 통장', 'P6-01'], ['빚이 더 많음', 'P0-08']]) assert.ok(ids({ q }).includes(id));
  assert.equal(ids({ q: '상속재산분할협의서' })[0], 'BP-I-01');
});
test('five guides link to active individual documents with explanations and safe return anchors', () => {
  assert.equal(guides.GUIDES.length, 5);
  for (const guide of guides.GUIDES) for (const step of guide.steps) for (const resource of step.resources) {
    assert.ok(catalog.isPublicResource(byId.get(resource.id)), resource.id);
    assert.ok(resource.use);
    const url = guides.guideResourceUrl(resource.id, guide.timing, step.id);
    const parsed = catalog.parseCatalogFilters(new URL(url, 'https://test').search);
    assert.equal(parsed.guide, guide.timing);
    assert.equal(parsed.step, step.id);
    assert.equal(parsed.resource, resource.id);
  }
  const unsafe = catalog.parseCatalogFilters('?guide=https://evil.test&step=//evil.test');
  assert.equal(unsafe.guide, ''); assert.equal(unsafe.step, '');
});
test('guide content distinguishes suspended consulting, apartment-only contracts and previous-gift gaps', () => {
  assert.match(JSON.stringify(guides.getGuide('business-succession')), /한시 중단/);
  assert.match(JSON.stringify(guides.getGuide('transfer')), /아파트/);
  assert.match(JSON.stringify(guides.getGuide('gift')), /미신고/);
  assert.match(JSON.stringify(guides.getGuide('after-death')), /조회.*기한|기한.*조회/);
});
test('shareable filter state roundtrips without accepting arbitrary information', () => {
  const filters = { ...catalog.emptyFilters(), q: '예금', use: 'service', purpose: ['inheritance', 'gift'], timing: ['before_death', 'after_death'], resource: 'P0-06', from: 'precheck' };
  assert.deepEqual(catalog.parseCatalogFilters(new URL(catalog.catalogUrl(filters), 'https://test').search), filters);
  assert.ok(!catalog.catalogUrl(catalog.parseCatalogFilters('?name=고객&amount=10000')).includes('10000'));
});
test('current UI keeps removed planning notes absent and excludes misleading production counts', () => {
  const ui = readFileSync('app/forms/FormsLibrary.tsx', 'utf8');
  assert.doesNotMatch(ui, /PLAN-0[1-6]|PreviewCoverage|서류 1개당 카드 1개/);
  assert.match(ui, /현재 자료실의 기본 제공 범위에서 제외된 자료입니다/);
});

mkdirSync('docs/forms-library-prd-20260923', { recursive: true });
const ledger = publicDocuments.map(d => ({ id: d.id, title: d.title, action: editorial.EXCLUDED_IDS.includes(d.id) ? 'excluded' : d.id.startsWith('LIB-ADD-') ? 'new' : d.id.startsWith('SVC-') ? 'service-import' : d.usage && ['NTS-IG-10', 'NTS-IG-11', 'NTS-CG-01', 'NTS-CG-15', 'P6-01', 'P6-04'].includes(d.id) ? 'enriched' : 'retained', visibility: d.resource.presentation.visibility, useCategory: catalog.useCategory(d), purposes: d.resource.facets.purposes, assets: d.resource.facets.assets, assetCommon: Boolean(d.assetCommon), source: d.sourceUrl, sourceCheckedOn: d.checkedOn, editorialReview: d.editorialReview || null }));
writeFileSync('docs/forms-library-prd-20260923/change-ledger.json', JSON.stringify({ baseline: '86d84615bc4d06185f3bea551cba0d4c22504533', counts: { originalRecords: 177, baselineCards: 191, excluded: 13, newOfficialRoutes: 8, serviceImports: 5, publicUniqueItems: publicCatalog.cards.length, archived: 9, uniquePublicHostedFiles: new Set(publicCatalog.cards.flatMap(c => c.document.files.filter(f => f.delivery === 'hosted').map(f => f.path))).size }, items: ledger }, null, 2) + '\n');
