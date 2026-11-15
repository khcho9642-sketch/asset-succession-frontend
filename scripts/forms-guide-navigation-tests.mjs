import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { guides, finalDocuments, catalog } from './load-current-forms.mjs';

const compiled = ts.transpileModule(readFileSync('lib/forms/guide-navigation.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const nav = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

test('every existing guide and step bookmark still selects its original task', () => {
  assert.equal(guides.GUIDES.length, 5);
  assert.equal(guides.GUIDES.flatMap(guide => guide.steps).length, 23);
  for (const guide of guides.GUIDES) {
    const ids = guide.steps.map(step => step.id);
    for (const id of ids) assert.deepEqual(nav.resolveGuideSelection(guide.timing, ids, '#' + id), { stepId: id, assetId: '' });
    assert.equal(nav.resolveGuideSelection(guide.timing, ids, ''), null);
    assert.equal(nav.resolveGuideSelection(guide.timing, ids, '#unknown-task'), null);
    assert.equal(nav.resolveGuideSelection(guide.timing, ids, '#%bad'), null);
  }
});

test('asset selection survives the guide → resource → guide URL round trip', () => {
  const step = nav.guideSelectionHash('transfer', 'bank');
  const detail = guides.guideResourceUrl('BANK-ADD-01', 'after-death', step);
  const filter = catalog.parseCatalogFilters(detail.split('?')[1]);
  assert.equal(filter.guide, 'after-death');
  assert.equal(filter.step, 'transfer--bank');
  const returnUrl = guides.guideUrl(filter.guide, filter.step);
  assert.deepEqual(nav.resolveGuideSelection('after-death', ['transfer'], new URL(returnUrl, 'https://example.test').hash), { stepId: 'transfer', assetId: 'bank' });
  assert.deepEqual(nav.resolveGuideSelection('after-death', ['transfer'], '#transfer--unknown'), { stepId: 'transfer', assetId: '' });
});

test('asset navigation preserves every existing distribution resource and its ID', () => {
  const step = guides.getGuide('after-death').steps.find(step => step.id === 'transfer');
  const ids = step.resources.map(resource => resource.id);
  assert.deepEqual(nav.visibleGuideResourceIds('after-death', 'transfer', ids, 'all'), ids);
  const visibleUnion = new Set(nav.DISTRIBUTION_ASSETS.filter(choice => choice.id !== 'all')
    .flatMap(choice => nav.visibleGuideResourceIds('after-death', 'transfer', ids, choice.id)));
  assert.deepEqual([...visibleUnion].sort(), [...ids].sort());
  for (const id of ids) assert.ok(finalDocuments.some(document => document.id === id && catalog.isPublicResource(document)), id);
  const bank = nav.visibleGuideResourceIds('after-death', 'transfer', ids, 'bank');
  assert.ok(bank.includes('BANK-ADD-01'));
  assert.ok(!bank.includes('REG-I-01'));
  assert.ok(bank.includes('P8-01') && bank.includes('P1-15'));
  assert.ok(nav.visibleGuideResourceIds('after-death', 'transfer', [...ids, 'FUTURE-CONTEXT'], 'bank').includes('FUTURE-CONTEXT'));
});

test('legacy nested anchors and complete-catalog links retain their context', () => {
  assert.deepEqual(nav.resolveGuideSelection('before-death', ['inventory', 'funding'], '#lookup-pension', { 'lookup-pension': 'inventory' }), { stepId: 'inventory', assetId: '' });
  assert.deepEqual(nav.resolveGuideSelection('gift', ['cash', 'shares'], '#transfer-evidence', { 'transfer-evidence': 'cash' }), { stepId: 'cash', assetId: '' });
  for (const guide of guides.GUIDES) assert.equal(new URL(guides.guideCatalogUrl(guide.timing), 'https://example.test').searchParams.get('view'), 'all');
  const related = new URL(nav.guideRelatedCatalogUrl(guides.guideCatalogUrl('after-death'), 'after-death', { stepId: 'transfer', assetId: 'insurance' }), 'https://example.test');
  assert.equal(related.searchParams.get('view'), 'all');
  assert.equal(related.searchParams.get('timing'), 'after_death');
  assert.equal(related.searchParams.get('asset'), 'insurance_pension');
  for (const [stepId, asset] of [['cash', 'cash_deposit'], ['real-estate', 'real_estate'], ['shares', 'securities']]) {
    const gift = new URL(nav.guideRelatedCatalogUrl(guides.guideCatalogUrl('gift'), 'gift', { stepId, assetId: '' }), 'https://example.test');
    assert.equal(gift.searchParams.get('purpose'), 'gift');
    assert.equal(gift.searchParams.get('asset'), asset);
    assert.equal(gift.searchParams.get('view'), 'all');
  }
});
