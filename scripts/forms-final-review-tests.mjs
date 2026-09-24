import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { finalDocuments, bankDocuments, finalCatalog, finalReview, catalog, guides } from './load-current-forms.mjs';
import { reviewFlags, compareObservation, observe } from './forms-recheck.mjs';
const byId = new Map(finalDocuments.map(x => [x.id, x]));
const ids = patch => catalog.filterCatalog(finalCatalog, { ...catalog.emptyFilters(), ...patch }).map(x => x.id);

test('198 public items retain every ID, original, preview and URL', () => {
  assert.equal(finalCatalog.cards.length, 198);
  for (const previous of bankDocuments) for (const key of ['id', 'files', 'sourceUrl', 'checkedOn', 'thumbnail', 'preview', 'documentSection']) assert.deepEqual(byId.get(previous.id)[key], previous[key], `${previous.id}/${key}`);
});
test('ten asset omissions have explicit individual decisions', () => {
  for (const id of ['NTS-CG-10','NTS-CG-11','NTS-CG-12','P0-13','P0-14','P0-15','P2-11-GIFT-SPECIAL','P9-01','NTS-IG-10-S5','NTS-IG-11-S6']) {
    assert.ok(byId.get(id).assetCommon || byId.get(id).resource.facets.assets.length, id);
    assert.ok(finalReview.CLASSIFICATION_CORRECTIONS[id].note);
  }
});
test('acquisition-tax search retains payment and exemption documents with real estate', () => {
  for (const id of ['P0-13','P0-15']) assert.ok(ids({q:'취득세',asset:['real_estate']}).includes(id));
});
test('accounts include securities, debt documents match debt axis and everyday debt query', () => {
  assert.ok(ids({asset:['securities']}).includes('SVC-ACCOUNTS'));
  for (const id of ['SVC-CREDIT','BANK-ADD-03','BANK-ADD-04']) assert.ok(ids({asset:['debt'],q:'빚'}).includes(id));
});
test('same axis OR, different axes AND still operate on each individual document', () => {
  const a = ids({asset:['real_estate']}); const b = ids({asset:['securities']});
  assert.deepEqual(new Set(ids({asset:['real_estate','securities']})),new Set([...a,...b]));
  for (const id of ids({asset:['securities'],purpose:['gift'],use:'form'})) {
    const item = byId.get(id); assert.ok(item.assetCommon || item.resource.facets.assets.includes('securities')); assert.ok(item.resource.facets.purposes.includes('gift')); assert.equal(catalog.useCategory(item),'form');
  }
});
test('correction claim retains four purposes and common-asset navigation', () => {
  const item=byId.get('P2-10'); assert.equal(item.resource.facets.purposes.length,4); assert.ok(item.assetCommon);
});
test('inventory is a form and filiation is guidance consistently', () => {
  assert.equal(catalog.useCategory(byId.get('P0-09')),'form'); assert.equal(catalog.useCategory(byId.get('P8-03')),'guide');
  assert.ok(byId.get('P0-09').resource.relations.some(x=>x.target_resource_id==='P0-08'));
});
test('everyday bereavement query retrieves resources and a contextual guide', () => {
  assert.ok(ids({q:'부모님이 돌아가셨어요'}).includes('P0-01'));
  assert.equal(finalReview.contextualGuide('부모님이 돌아가셨어요').href,'/forms/guides/after-death');
});
test('default priorities contain no duplicate or missing public IDs', () => {
  assert.equal(new Set(finalReview.FIRST_TASK_IDS).size,finalReview.FIRST_TASK_IDS.length);
  for(const id of finalReview.FIRST_TASK_IDS) assert.ok(finalCatalog.cards.some(x=>x.id===id),id);
});
test('gift guide starts with asset choices and keeps transfer evidence within cash', () => {
  const guide=guides.getGuide('gift'); assert.deepEqual(guide.steps.slice(0,3).map(x=>x.id),['cash','real-estate','shares']);
  assert.ok(guide.steps[0].resources.some(x=>x.id==='BANK-ADD-05'));
  assert.ok(!guides.getGuide('transfer').steps.some(x=>x.note?.body.includes('SC-08')));
});
test('provider-only forms have document names and explicit route limitations', () => {
  for(const item of finalCatalog.cards.map(x=>x.document).filter(x=>catalog.useCategory(x)==='form'&&!catalog.availableFiles(x).length)) {
    assert.ok(item.providerInstructions.documentName); assert.match(item.providerInstructions.limitation,/직접 다운로드가 아닌/);
  }
});
test('archived records each retain specific reason without invalidity claims', () => {
  const rows=finalDocuments.filter(x=>x.resource?.presentation.visibility==='archived'); assert.equal(rows.length,9);
  for(const item of rows) assert.match(item.resource.presentation.reason,/구판·무효 판정이 아니/);
  assert.equal(new Set(rows.map(x=>x.resource.presentation.reason)).size,9);
});
test('priority nine are partial, not silently legally verified', () => {
  for(const id of ['BP-G-01','NTS-IG-12','NTS-CG-10','NTS-CG-11','NTS-CG-12','P2-05','P4-04','P5-02','P5-03']) {
    assert.equal(byId.get(id).reviewSummary.status,'partial'); assert.ok(byId.get(id).reviewSummary.limitation);
  }
  assert.equal(byId.get('BP-G-01').resource.facets.authority,'official_reference');
});
test('ledger maps exactly to final public IDs and preserves original source dates', () => {
  const ledger=JSON.parse(readFileSync('public/downloads/official-forms/review-ledger.json','utf8'));
  assert.deepEqual(new Set(ledger.records.map(x=>x.id)),new Set(finalCatalog.cards.map(x=>x.id)));
  assert.equal(ledger.records.length,198); assert.deepEqual(ledger.after,{public:198,form:151,service:25,guide:22,archived:9,excluded:13,hosted:166,external:4});
  for(const row of ledger.records) { assert.ok(row.sourceUrl); assert.ok(row.editorial && row.currentness && row.applicability); assert.notEqual(row.applicability.status,'verified'); }
});
test('recheck separates overdue, missing date, access failure, source change and unchanged bytes', () => {
  assert.deepEqual(reviewFlags({reviewPolicy:{lastReviewedOn:null,nextReviewDue:null}},'2026-09-25'),{missingDate:true,due:false});
  assert.equal(reviewFlags({reviewPolicy:{lastReviewedOn:'2026-01-01',nextReviewDue:'2026-04-01'}},'2026-09-25').due,true);
  assert.equal(compareObservation({sha256:'a'},{ok:false,status:403}),'access_failure');
  assert.equal(compareObservation({sha256:'a'},{ok:true,sha256:'b'}),'source_change_needs_review');
  assert.equal(compareObservation({sha256:'a'},{ok:true,sha256:'a'}),'unchanged_bytes_not_legal_review');
});
test('network/auth failure is not interpreted as legal repeal', async () => {
  assert.equal((await observe('https://example.test',async()=>({ok:false,status:403}))).reason,'authentication_or_blocking');
  assert.equal((await observe('https://example.test',async()=>{throw new Error('blocked');})).reason,'network_or_timeout');
});
