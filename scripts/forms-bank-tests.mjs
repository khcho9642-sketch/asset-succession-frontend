import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { bankDocuments, bankCatalog, publicDocuments, publicCatalog, banks, catalog, editorial, individual, guides } from './load-current-forms.mjs';
const byId = bankCatalog.documents;
const ids = patch => catalog.filterCatalog(bankCatalog, { ...catalog.emptyFilters(), ...patch }).map(card => card.id);
const serviceIds = ['BANK-ADD-02', 'BANK-ADD-03', 'BANK-ADD-04', 'BANK-ADD-05'];

test('seven unique additions: original six plus verified KB form, 198 public cards', () => {
  assert.equal(banks.BANK_DOCUMENTS.length, 7);
  for (let n = 1; n <= 6; n++) assert.ok(byId.has(`BANK-ADD-0${n}`));
  assert.equal(publicCatalog.cards.length, 191);
  assert.equal(bankCatalog.cards.length, 198);
  assert.equal(bankDocuments.length, publicDocuments.length + 7);
  assert.equal(new Set(bankDocuments.map(d => d.id)).size, bankDocuments.length);
  for (const visibility of ['archived', 'excluded']) assert.equal(bankDocuments.filter(d => d.resource.presentation.visibility === visibility).length, visibility === 'archived' ? 9 : 13);
});
test('all existing file bytes, preview metadata, IDs and source dates remain unchanged', () => {
  for (const old of publicDocuments) {
    const current = byId.get(old.id);
    for (const key of ['files', 'thumbnail', 'preview', 'documentSection', 'license', 'revised_at', 'form_no']) assert.deepEqual(current[key], old[key], `${old.id}/${key}`);
    if (old.id !== 'P6-01') assert.equal(current.checkedOn, old.checkedOn);
    else { assert.equal(current.checkedOn, banks.BANK_CHECKED_ON); assert.ok(current.supplementalSources.some(s => s.url === old.sourceUrl && s.checkedOn === old.checkedOn)); }
    if (old.id !== 'P6-01') assert.equal(current.sourceUrl, old.sourceUrl);
    else assert.ok(current.supplementalSources.some(s => s.url === old.sourceUrl && s.title.includes('이력')));
  }
});
test('original six additions keep two external PDF originals without fabricated examples', () => {
  const originalSix = banks.BANK_DOCUMENTS.filter(d => d.id !== 'BANK-ADD-07');
  assert.equal(originalSix.length, 6);
  assert.equal(originalSix.flatMap(d => d.files).length, 2);
  for (const item of originalSix) {
    assert.equal(item.thumbnail, null); assert.equal(item.example, null);
    for (const file of item.files) { assert.equal(file.format, 'PDF'); assert.equal(file.delivery, 'official_link'); assert.ok(file.path.startsWith('https://image.kebhana.com/')); }
  }
});
test('verified KB retirement agreement links the real DOC, not a fabricated PDF or deposit proxy', () => {
  const d = byId.get('BANK-ADD-07');
  assert.equal(d.institution, 'KB국민은행');
  assert.equal(d.format, 'DOC'); assert.equal(d.files.length, 1);
  assert.equal(d.files[0].format, 'DOC'); assert.equal(d.files[0].bytes, 105984);
  assert.equal(d.files[0].delivery, 'official_link');
  const url = new URL(d.files[0].path);
  assert.equal(url.hostname, 'okbfex.kbstar.com');
  assert.equal(url.searchParams.get('formDocNo'), '68007');
  assert.equal(url.searchParams.get('_FILE_NAME'), '공통대표상속인지정.doc');
  assert.equal(d.revised_at, '2022-03'); assert.equal(d.publishedOn, undefined);
  assert.equal(d.form_no, '06206033'); assert.equal(d.checkedOn, '2026-09-24');
  assert.deepEqual(d.resource.facets.assets, ['insurance_pension']);
  assert.deepEqual(d.resource.facets.timing, ['after_death']);
  assert.match(d.usage.note, /일반 상속예금.*다른 은행.*대체하지/);
  assert.equal(d.preview, undefined); assert.equal(d.thumbnail, null); assert.equal(d.example, null);
  assert.ok(individual.relatedDocuments(bankCatalog, 'P6-06').some(r => r.id === d.id));
  assert.ok(ids({q: 'KB 대표상속인'}).includes(d.id));
  const ui = readFileSync('app/forms/FormsLibrary.tsx', 'utf8');
  assert.ok(ui.includes('공식 ${files[0].format}'));
  assert.ok(!ui.includes('${item.institution} 공식 PDF 열기'));
});
test('KB follow-up preserves hosted originals and keeps conflicting trust attachment unpublished', () => {
  assert.equal(new Set(bankCatalog.cards.flatMap(c => c.document.files.filter(f => f.delivery === 'hosted').map(f => f.path))).size, 166);
  assert.equal(new Set(bankCatalog.cards.flatMap(c => c.document.files.filter(f => f.delivery === 'official_link').map(f => f.path))).size, 4);
  assert.ok(!banks.BANK_DOCUMENTS.some(d => d.id === 'BANK-CAND-02' || d.files.some(f => f.path.includes('beneficiary_designation') || /formDocNo=6838[67]/.test(f.path))));
});
test('Hana deposit current original, posting date and revision month are separate', () => {
  const d = byId.get('BANK-ADD-01');
  assert.equal(d.files[0].path, banks.BANK_SOURCES.hanaDepositPdf);
  assert.equal(d.publishedOn, '2026-09-08'); assert.equal(d.revised_at, '2026-09');
  assert.match(d.catalogTitle, /상속예금 지급 위임장 겸용/);
  assert.match(d.usage.note, /별도 위임/); assert.match(d.usage.note, /P0-03.*대체하지/);
});
test('Hana retirement original limits DC and enterprise IRP, has no invented death attachment', () => {
  const d = byId.get('BANK-ADD-06');
  assert.equal(d.files[0].path, banks.BANK_SOURCES.hanaPensionPdf);
  assert.equal(d.publishedOn, '2026-09-18'); assert.equal(d.revised_at, '2026-09');
  assert.match(d.usage.note, /DB·개인형IRP 공통 서식이 아닙니다/);
  assert.match(d.usage.prepare.join(' '), /사업장.*대표수익자/);
  assert.equal(d.files.length, 1);
});
test('certificate guides have distinct owner and heir routes with explicit provider limits', () => {
  for (const id of serviceIds) {
    const d = byId.get(id); assert.equal(d.useCategory, 'service'); assert.equal(d.files.length, 0);
    assert.equal(d.providerScope, '발급 경로: 우리은행');
    const [owner, heir] = d.providerRoutes;
    assert.equal(owner.applicantContext, 'owner'); assert.equal(heir.applicantContext, 'heir');
    assert.notEqual(owner.url, heir.url); assert.equal(heir.url, banks.BANK_SOURCES.wooriContact);
    assert.match(owner.customerType, /개인/); assert.match(owner.note, /기업.*별도/);
    assert.match(heir.note, /고인의 인증정보를 사용하지 말고/);
    assert.equal(heir.label, '은행에 발급 방법 문의');
  }
});
test('all four certificate guides remain available for each of the four purposes and both timings', () => {
  for (const purpose of Object.keys(catalog.FACETS.purpose.values)) for (const timing of Object.keys(catalog.TIMINGS)) {
    const found = ids({ purpose: [purpose], timing: [timing], use: 'service' });
    for (const id of serviceIds) assert.ok(found.includes(id), `${id}/${purpose}/${timing}`);
  }
});
test('new classifications use existing enums and explicit task stages', () => {
  for (const d of banks.BANK_DOCUMENTS) {
    assert.ok(d.resource.facets.assets.every(v => Object.hasOwn(catalog.FACETS.asset.values, v)));
    assert.ok(d.resource.stage_ids.every(v => catalog.STAGES.some(([id]) => v === id)));
  }
  assert.deepEqual(byId.get('BANK-ADD-03').resource.facets.assets, ['other']);
  assert.deepEqual(byId.get('BANK-ADD-04').resource.facets.assets, ['other']);
  for (const id of ['BANK-ADD-01', 'BANK-ADD-05', 'BANK-ADD-06']) assert.equal(byId.get(id).resource.primary_stage_id, 'S4');
});
test('payout enrichment separates KB, Hana and cooperatives without common bank thresholds', () => {
  const d = byId.get('P6-01'); assert.equal(d.providerRoutes.length, 3);
  assert.deepEqual(d.providerRoutes.map(r => r.provider), ['KB국민은행', '하나은행', '농·축협(상호금융)']);
  assert.match(d.providerRoutes[2].note, /NH농협은행 안내와 구분/);
  assert.match(d.usage.note, /한 은행의 조건을 다른 은행에 적용하지/);
  assert.doesNotMatch(d.usage.steps.join(' '), /\d+만원|\d+개월/);
});
test('retirement general guidance keeps ministry source and links the actual bank form', () => {
  const d = byId.get('P6-06');
  assert.equal(d.sourceUrl, publicCatalog.documents.get(d.id).sourceUrl);
  assert.match(d.description, /DB·DC·개인형IRP·기업형IRP/);
  assert.match(d.usage.note, /고용노동부.*참고.*통합연금조회.*생전.*국민연금/);
  assert.ok(individual.relatedDocuments(bankCatalog, d.id).some(r => r.id === 'BANK-ADD-06'));
});
test('P0-02 preserves all application contexts and adds the next task, not another inquiry card', () => {
  assert.deepEqual(editorial.serviceContexts('P0-02').map(c => c.service.id), ['heirs-finance']);
  const d = byId.get('P0-02'); assert.match(d.afterLookup.text, /발급이나 예금 지급 신청이 아닙니다/);
  assert.ok(d.afterLookup.resourceIds.includes('P6-01'));
});
test('each new explicit relation resolves to a public record and is navigable in reverse', () => {
  for (const d of banks.BANK_DOCUMENTS) for (const relation of d.resource.relations) {
    const target = byId.get(relation.target_resource_id);
    assert.ok(target && catalog.isPublicResource(target), `${d.id}/${relation.target_resource_id}`);
    assert.ok(individual.relatedDocuments(bankCatalog, target.id).some(r => r.id === d.id), `${target.id} -> ${d.id}`);
  }
});
test('regression A10: incompatible list timing cannot blank selected service details', () => {
  const filters = catalog.parseCatalogFilters('?timing=before_death&resource=P0-01&use=service');
  const result = editorial.detailServiceContexts(filters.resource, filters.timing);
  assert.equal(result.contexts.length, 1); assert.equal(result.contexts[0].timing, 'after-death');
  assert.match(result.notice, /상속 발생 후 이용하는 서비스/);
  assert.ok(result.contexts[0].service.url.startsWith('https://'));
  assert.deepEqual(filters.timing, ['before_death']);
});
test('matching single or both service contexts preserve authentic applicant guidance', () => {
  for (const timing of [[], ['before_death', 'after_death']]) assert.equal(editorial.detailServiceContexts('P6-02', timing).contexts.length, 2);
  const before = editorial.detailServiceContexts('P6-02', ['before_death']);
  assert.equal(before.contexts[0].timing, 'before-death'); assert.equal(before.notice, '');
  assert.ok(individual.relatedDocuments(bankCatalog, 'P6-02').some(r => r.id === 'P0-01'));
});
test('after-death guide entry opens heir bank guidance without requiring list timing parameters', () => {
  assert.equal(editorial.preferredProviderContext([], 'after-death'), 'heir');
  assert.equal(editorial.preferredProviderContext([], 'before-death'), 'owner');
  assert.equal(editorial.preferredProviderContext(['after_death']), 'heir');
  assert.equal(editorial.preferredProviderContext(['before_death', 'after_death']), 'owner');
  assert.equal(editorial.preferredProviderContext(['before_death'], 'after-death'), 'owner');
});
test('bank search phrases find their actual documents and exact titles rank first', () => {
  for (const [q, expected] of [['상속예금', 'P6-01'], ['상속예금', 'BANK-ADD-01'], ['하나 위임장', 'BANK-ADD-01'], ['잔액증명', 'BANK-ADD-02'], ['부채증명', 'BANK-ADD-03'], ['송금확인증', 'BANK-ADD-05'], ['DC 사망', 'BANK-ADD-06']]) assert.ok(ids({ q }).includes(expected), q);
  assert.equal(ids({ q: '부채증명서 발급 안내' })[0], 'BANK-ADD-03');
  const d = byId.get('BANK-ADD-01');
  assert.equal(catalog.resourceSearchRank(d, d.title), 4);
  assert.equal(catalog.resourceSearchRank(d, '하나 상속예금'), 3);
  assert.equal(catalog.resourceSearchRank(d, '고인 통장 지급'), 2);
});
test('OR within each facet and AND across axes survive URL roundtrip', () => {
  const filters = { ...catalog.emptyFilters(), purpose: ['gift', 'inheritance'], timing: ['before_death', 'after_death'], asset: ['cash_deposit'], use: 'service' };
  assert.deepEqual(catalog.parseCatalogFilters(new URL(catalog.catalogUrl(filters), 'https://test').search), filters);
  const expected = new Set(['gift', 'inheritance'].flatMap(p => ids({ ...filters, purpose: [p] })));
  assert.deepEqual(new Set(ids(filters)), expected);
  assert.ok(ids(filters).includes('BANK-ADD-02')); assert.ok(!ids(filters).includes('BANK-ADD-06'));
});
test('all five guides link relevant bank documents and retain return anchors', () => {
  const expected = { 'before-death': 'BANK-ADD-02', 'after-death': 'BANK-ADD-06', gift: 'BANK-ADD-05', transfer: 'BANK-ADD-03', 'business-succession': 'BANK-ADD-04' };
  for (const [timing, id] of Object.entries(expected)) {
    const guide = guides.getGuide(timing); const step = guide.steps.find(s => s.resources.some(r => r.id === id));
    assert.ok(step, timing);
    const f = catalog.parseCatalogFilters(new URL(guides.guideResourceUrl(id, timing, step.id), 'https://test').search);
    assert.equal(f.guide, timing); assert.equal(f.step, step.id);
  }
});
test('unverified candidates, excluded records and removed planning notes never return to public results', () => {
  for (const id of [...editorial.EXCLUDED_IDS, 'BANK-CAND-01', 'BANK-CAND-02', ...Array.from({ length: 6 }, (_, n) => `PLAN-0${n + 1}`)]) assert.ok(!ids({ q: id }).includes(id));
  const entry = readFileSync('app/forms/GuideEntrances.tsx', 'utf8');
  assert.doesNotMatch(entry, /<details|<summary/);
  for (const title of ['상속 전 준비', '상속 발생 후', '증여', '양도', '가업승계']) assert.ok(entry.includes(title));
});
