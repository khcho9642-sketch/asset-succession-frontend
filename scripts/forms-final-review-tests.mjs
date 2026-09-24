import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { finalDocuments, bankDocuments, finalCatalog, finalReview, catalog, guides, previewApi } from './load-current-forms.mjs';
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

test('split documents describe users and submission context without page-only placeholders', () => {
  for (const item of finalDocuments.filter(x => catalog.isPublicResource(x) && (x.documentSection || finalReview.SPLIT_USAGE[x.id]))) {
    assert.ok(finalReview.SPLIT_USAGE[item.id], item.id);
    assert.match(item.description, /사용 대상:/);
    assert.doesNotMatch(item.usage.when, /기관 원본 합본의|제공 자료이며 관련 서류/);
    assert.ok(item.usage.who.length > 5 && item.usage.when.length > 30, item.id);
    assert.match(item.editorialReview.note, /법적 적용조건 검증과 별개/);
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
  // Four preferred originals are superseded by eight verified current originals; old paths remain intact.
  assert.equal(ledger.records.length,198); assert.deepEqual(ledger.after,{public:198,form:151,service:25,guide:22,archived:9,excluded:13,hosted:170,external:4});
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

test('four current editions contain eight authentic complete binary originals, not rewritten forms', () => {
  const expected = {
    'NTS-CG-10':['4a55f04ab3127a535fc192cddb7afd2500adc824a4d8efd024142c9d474c8dc4','09609179aed8e6827c63d4785e3b61ca29619dc05209e8ca8160a0f7bc710303'],
    'NTS-CG-11':['4543d6710a30470b849b07f64dddebfa5ac252f9b509ff10da7b49019dc33f99','d0ed1773208a4e88c595236eaccb49bd8342ab05f1a45bc949a189dceb3a9eae'],
    'NTS-CG-12':['390de189a5b3b93227fe9ea5eee167bca797e4a7be49cdd1edb304574357c007','0e7e52bc828b2aa0a5aa6e52cf2db2c09dfa88593029dc254961fd9bedae4390'],
    'P4-04':['a64b1f89328d5a0c0fee11cf91c7fa148734e3e932d909ae26e78502d87c6129','5d6c851a02077a80cce3419bee1ff6544d923e1ad4015b10215afbf3d8c58bfe'],
  };
  assert.equal(finalDocuments.filter(x=>x.currentEdition).length,4);
  for (const [id, hashes] of Object.entries(expected)) {
    const item=byId.get(id),files=catalog.availableFiles(item);
    assert.deepEqual(files.map(x=>x.format),['PDF','HWP']);
    files.forEach((file,i)=>{
      const raw=readFileSync('public'+file.path);
      assert.equal(createHash('sha256').update(raw).digest('hex'),hashes[i]);
      assert.equal(raw.length,file.bytes);
      assert.equal(file.sha256,hashes[i]);
      assert.match(file.sourceUrl,/^https:\/\/www\.law\.go\.kr\/LSW\/flDownload\.do/);
      assert.equal(file.licenseBasis,'statutory-form');
    });
  }
});
test('preferred previews trace to current originals, never historical embedded thumbnails',()=>{
  for(const item of finalDocuments.filter(x=>x.currentEdition)) {
    const preview=previewApi.resolvePreview(item);
    assert.equal(preview.kind,'image'); assert.equal(preview.pdfPath,item.currentEdition.files[0].path);
    assert.equal(preview.imagePath,item.currentEdition.example);
    assert.notEqual(preview.imagePath,item.example); assert.equal(preview.pageCount,2);
    assert.ok(item.files.every(x=>!catalog.availableFiles(item).some(y=>y.path===x.path)));
  }
});
test('current-edition usage guidance names the current download separately from historical files',()=>{
  for(const [id,revision] of Object.entries({'NTS-CG-10':'2015-03-13','NTS-CG-11':'2024-03-22','NTS-CG-12':'2026-03-20'})) {
    const item=byId.get(id);
    assert.ok(item.usage.note.includes(revision));
    assert.match(item.usage.note,/현재 다운로드는 현행 시행규칙/);
    assert.doesNotMatch(item.usage.note,/보존 원본은/);
  }
});
test('priority statutory comparison and individual legal eligibility remain separate',()=>{
  for(const id of ['NTS-IG-12','NTS-CG-10','NTS-CG-11','NTS-CG-12','P2-05','P4-04','P5-02','P5-03']) {
    assert.equal(byId.get(id).currentVersionReview.status,'current_attachment_checked');
    assert.match(byId.get(id).currentVersionReview.sourceUrl,/law.go.kr/);
    assert.equal(byId.get(id).reviewSummary.status,'partial');
  }
  assert.equal(byId.get('BP-G-01').currentVersionReview.status,'provider_reference_checked');
});
test('all 33 provider-only forms have specific search/navigation evidence or explicit access failure',()=>{
  const items=finalDocuments.filter(x=>x.providerInstructions); assert.equal(items.length,33);
  for(const item of items) {
    assert.ok(item.providerInstructions.keywords); assert.equal(item.providerInstructions.checkedOn,'2026-09-25');
    assert.ok(item.providerInstructions.status); assert.ok(item.providerInstructions.menu);
    assert.notEqual(item.providerInstructions.status,'fully_verified');
  }
  assert.equal(byId.get('P0-08').providerInstructions.status,'access_blocked');
  assert.match(byId.get('P0-08').providerInstructions.limitation,/403/);
});
test('unrelated title-recovery search is not represented as an inheritance-recovery form',()=>{
  const route=byId.get('P8-02').providerInstructions;
  assert.equal(new URL(route.url).searchParams.get('searchWrd'),'상속회복');
  assert.equal(route.status,'no_matching_result'); assert.match(route.limitation,/0건/);
  assert.match(byId.get('P8-02').description,/일치하는 원문을 확보하지 못/);
  assert.equal(byId.get('P8-02').usage.sourceUrls[0],route.url);
  assert.doesNotMatch(byId.get('P8-02').usage.note,/공식 문서명은 328-1/);
  assert.match(byId.get('P1-16').providerInstructions.keywords,/1068/);
  assert.match(byId.get('P1-20').providerInstructions.keywords,/461/);
});
test('five inherited service dates restore dated evidence without rewriting collection dates',()=>{
  const ledger=JSON.parse(readFileSync('public/downloads/official-forms/review-ledger.json','utf8'));
  for(const id of ['SVC-ACCOUNTS','SVC-INSURANCE','SVC-CREDIT','SVC-PENSION','SVC-REGISTRY']) {
    const item=byId.get(id), row=ledger.records.find(x=>x.id===id);
    assert.equal(item.sourceReview.checkedOn,'2026-09-21'); assert.equal(row.source.collectedOn,null);
    assert.equal(row.source.checkedOn,'2026-09-21'); assert.equal(row.reviewPolicy.nextReviewDue,'2026-12-21');
    assert.match(readFileSync(item.sourceReview.evidence,'utf8'),/확인일: 2026-09-21/);
  }
});
test('PDF text equality is not mislabeled as binary identity',()=>{
  const rows=JSON.parse(readFileSync('docs/forms-final-review-20260925/source-followup/comparison.json','utf8'));
  assert.equal(rows.length,2);
  for(const row of rows) { assert.equal(row.normalizedTextEqual,true);assert.notEqual(row.oldSha256,row.currentSha256); assert.ok(row.pageMatches.every(Boolean)); }
});
