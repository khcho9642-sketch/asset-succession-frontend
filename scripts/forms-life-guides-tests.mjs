import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import { bankDocuments as publicDocuments } from './load-current-forms.mjs';

const read = name => JSON.parse(readFileSync(name, 'utf8'));
const documents = read('public/downloads/official-forms/manifest.json').documents;
const groups = read('public/downloads/official-forms/presentation-groups.json');
const usage = read('lib/forms/resource-usage.json').documents;
const output = path.resolve('.tmp/forms-life-guides-tests');
mkdirSync(output, { recursive: true });
writeFileSync(path.join(output, 'package.json'), '{"type":"commonjs"}');
for (const name of ['catalog', 'guides', 'purpose-guides', 'lookup-services', 'post-death-lookup-services']) {
  writeFileSync(path.join(output, name + '.js'), ts.transpileModule(readFileSync(`lib/forms/${name}.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText);
}
const require = createRequire(import.meta.url);
const { buildCatalog, filterCatalog, emptyFilters, matchesResource, parseCatalogFilters } = require(path.join(output, 'catalog.js'));
const { GUIDES, guidesForResource, guideResourceUrl, guideCatalogUrl, getGuide } = require(path.join(output, 'guides.js'));
const { LOOKUP_SERVICES } = require(path.join(output, 'lookup-services.js'));
const { POST_DEATH_LOOKUP_SERVICES } = require(path.join(output, 'post-death-lookup-services.js'));
const ids = new Set(documents.map(item => item.id));
const byId = new Map(documents.map(item => [item.id, item]));
const selected = timing => ({ ...emptyFilters(), timing: [timing] });

test('177 originals have complete usage instructions and reasoned timing without changing legal verification', () => {
  assert.equal(documents.length, 177);
  assert.deepEqual(Object.keys(usage).sort(), documents.map(item => item.id).sort());
  for (const item of documents) {
    const help = usage[item.id];
    assert.ok(help.timing.length > 0 && help.timing.every(value => ['before_death', 'after_death'].includes(value)), item.id);
    assert.deepEqual(item.resource.facets.timing, help.timing, item.id);
    assert.equal(item.description, help.description, item.id);
    for (const key of ['who', 'when', 'timingRationale']) assert.ok(help[key].trim(), `${item.id}: ${key}`);
    for (const key of ['prepare', 'steps', 'sourceUrls']) assert.ok(help[key].length > 0, `${item.id}: ${key}`);
    assert.equal(item.resource.deadline.state, 'unknown', item.id);
    assert.equal(item.resource.classification.status, 'needs_review', item.id);
  }
});

test('post-death search retains the formerly omitted tax forms and family certificates', () => {
  const filters = { ...selected('after_death'), purpose: ['inheritance'] };
  const catalog = buildCatalog(documents, groups);
  const matched = new Set(filterCatalog(catalog, filters).flatMap(card => card.matchedIds));
  for (const id of ['P0-06', 'NTS-IG-06', 'NTS-IG-10', 'NTS-IG-13', 'P2-07']) {
    assert.ok(matchesResource(byId.get(id), filters), id);
    assert.ok(matched.has(id), `${id}: discoverable through its actual parent card`);
  }
});

test('preparation, post-death execution and shared administrative forms stay distinct', () => {
  for (const id of ['P1-14', 'P1-17']) {
    assert.ok(matchesResource(byId.get(id), selected('before_death')), id);
    assert.ok(!matchesResource(byId.get(id), selected('after_death')), id);
  }
  for (const id of ['P0-05', 'P0-07', 'P0-08', 'P1-15', 'NTS-IG-04']) {
    assert.ok(matchesResource(byId.get(id), selected('after_death')), id);
    assert.ok(!matchesResource(byId.get(id), selected('before_death')), id);
  }
  for (const id of ['P0-01', 'P0-06', 'NTS-IG-05', 'NTS-IG-13']) {
    assert.ok(matchesResource(byId.get(id), selected('before_death')), id);
    assert.ok(matchesResource(byId.get(id), selected('after_death')), id);
  }
});

test('every guide link reaches a real canonical document and has a working reverse anchor', () => {
  assert.deepEqual(GUIDES.map(guide => guide.timing), ['before-death', 'after-death', 'gift', 'transfer', 'business-succession']);
  assert.equal(getGuide('unknown'), undefined);
  for (const guide of GUIDES) {
    assert.equal(new Set(guide.steps.map(step => step.id)).size, guide.steps.length);
    const filters = parseCatalogFilters(new URL(guideCatalogUrl(guide.timing), 'https://example.test').search);
    const inheritance = ['before-death', 'after-death'].includes(guide.timing);
    assert.deepEqual(filters.timing, inheritance ? [guide.timing.replace('-', '_')] : []);
    assert.deepEqual(filters.purpose, inheritance ? [] : [guide.timing === 'transfer' ? 'capital_transfer' : guide.timing === 'business-succession' ? 'business_succession' : 'gift']);
    if (guide.timing === 'before-death') for (const id of ['BP-G-01', 'P3-05', 'P3-06', 'REG-G-01', 'NTS-IG-11', 'P1-10']) {
      assert.ok(matchesResource(byId.get(id), filters), `before-death catalog retains ${id}`);
    }
    for (const step of guide.steps) for (const resource of step.resources) {
      assert.ok(publicDocuments.some(item => item.id === resource.id && item.resource.presentation.visibility !== 'excluded'), `${guide.timing}/${step.id}: ${resource.id}`);
      const target = new URL(guideResourceUrl(resource.id), 'https://example.test');
      assert.equal(target.searchParams.get('resource'), resource.id, resource.id);
      const links = guidesForResource(resource.id, byId.get(resource.id)?.resource);
      assert.ok(links.some(link => link.timing === guide.timing && link.stepId === step.id && link.href.endsWith('#' + step.id)), resource.id);
    }
  }
});

test('will preparation never routes to post-death execution', () => {
  for (const id of ['P1-14', 'P1-17']) {
    assert.ok(guidesForResource(id, byId.get(id)?.resource).every(item => item.timing === 'before-death'), id);
  }
});

test('timing filters still keep archived originals out of the public card list', () => {
  const index = buildCatalog(documents, groups);
  assert.equal(index.cards.length, 103);
  const archived = documents.filter(item => item.resource.presentation.visibility === 'archived');
  assert.equal(archived.length, 9);
  for (const timing of ['before_death', 'after_death']) {
    const shown = new Set(filterCatalog(index, selected(timing)).flatMap(item => item.matchedIds));
    for (const item of archived) assert.ok(!shown.has(item.id), item.id);
  }
});

test('nine lookup services link to official providers without inflating original counts', () => {
  const expected = ['accounts', 'insurance', 'debts', 'pension', 'registry', 'property-prices', 'family', 'dormant-deposits', 'unclaimed-shares'];
  assert.deepEqual(LOOKUP_SERVICES.map(service => service.id).sort(), expected.sort());
  const officialDomains = ['payinfo.or.kr', 'accountinfo.or.kr', 'credit4u.or.kr', 'insure.or.kr', 'fss.or.kr', 'scourt.go.kr', 'iros.go.kr', 'realtyprice.kr', 'kinfa.or.kr', 'ksd.or.kr'];
  for (const service of LOOKUP_SERVICES) {
    const url = new URL(service.url);
    assert.equal(url.protocol, 'https:', service.id);
    assert.ok(officialDomains.some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain)), service.id);
    assert.ok(service.menu.trim() && service.authentication.text.trim() && service.limitation.trim(), service.id);
    assert.ok(service.checks.length > 0 && service.evidenceUrls.length > 0, service.id);
    for (const id of service.relatedResourceIds) assert.ok(byId.has(id), `${service.id}: ${id}`);
  }
  assert.equal(documents.length, 177);
  for (const id of ['P6-02', 'P6-05']) assert.ok(guidesForResource(id).some(link => link.timing === 'before-death'), `${id}: accessible before death`);
});

test('financial lookups require owner authentication and pension income stays separate from estate totals', () => {
  for (const id of ['accounts', 'insurance', 'debts', 'pension', 'dormant-deposits', 'unclaimed-shares']) {
    const service = LOOKUP_SERVICES.find(item => item.id === id);
    assert.equal(service.authentication.kind, 'self', id);
    assert.match(service.authentication.text, /본인|인증/, id);
  }
  const pension = LOOKUP_SERVICES.find(item => item.id === 'pension');
  assert.ok(pension.checks.some(check => /예상 월수입/.test(check)), 'pension income is explained');
  assert.ok(pension.checks.some(check => /월 연금수입.*계좌 적립금.*별도/.test(check)), 'periodic income stays separate from account assets');
});

test('nine post-death services use official applicant routes and belong to the correct guide steps', () => {
  const expected = {
    'estate-family': ['first-actions', 'scourt.go.kr'],
    'inheritance-one-stop': ['estate-inquiry', 'gov.kr'],
    'heirs-finance': ['estate-inquiry', 'fss.or.kr'],
    'estate-insurance': ['estate-inquiry', 'insure.or.kr'],
    'estate-registry': ['estate-inquiry', 'iros.go.kr'],
    'estate-prices': ['estate-inquiry', 'realtyprice.kr'],
    'estate-dormant': ['estate-inquiry', 'kinfa.or.kr'],
    'estate-shares': ['estate-inquiry', 'ksd.or.kr'],
    'survivors-pension': ['transfer', 'nps.or.kr'],
  };
  assert.deepEqual(POST_DEATH_LOOKUP_SERVICES.map(service => service.id).sort(), Object.keys(expected).sort());
  const lifetimeIds = new Set(LOOKUP_SERVICES.map(service => service.id));
  const stepIds = new Set(getGuide('after-death').steps.map(step => step.id));
  for (const service of POST_DEATH_LOOKUP_SERVICES) {
    const [stepId, officialDomain] = expected[service.id];
    assert.equal(service.stepId, stepId, service.id);
    assert.ok(stepIds.has(service.stepId), `${service.id}: existing guide step`);
    assert.ok(!lifetimeIds.has(service.id), `${service.id}: separate lifetime and post-death routes`);
    const url = new URL(service.url);
    assert.equal(url.protocol, 'https:', service.id);
    assert.ok(url.hostname === officialDomain || url.hostname.endsWith('.' + officialDomain), service.id);
    assert.ok(['heir', 'public', 'certificate'].includes(service.authentication.kind), `${service.id}: no deceased-owner login`);
    for (const value of [service.menu, service.authentication.text, service.limitation]) assert.ok(value.trim(), service.id);
    for (const key of ['eligibility', 'representative', 'channel']) {
      assert.ok(service.application[key].trim(), `${service.id}: applicant guidance ${key}`);
    }
    assert.ok(service.application.documents.length > 0 && service.application.documents.every(document => document.trim()), `${service.id}: required-document guidance`);
    assert.ok(service.checks.length > 0 && service.evidenceUrls.length > 0, service.id);
    for (const id of service.relatedResourceIds) assert.ok(byId.has(id), `${service.id}: existing related original ${id}`);
  }
  assert.equal(LOOKUP_SERVICES.length, 9, 'lifetime service coverage is preserved');
  assert.equal(documents.length, 177, 'service instructions do not become extra original forms');
});

test('post-death financial services require applicant eligibility and distinguish assets, debts and survivor income', () => {
  for (const id of ['inheritance-one-stop', 'heirs-finance', 'estate-insurance', 'estate-dormant', 'estate-shares', 'survivors-pension']) {
    const service = POST_DEATH_LOOKUP_SERVICES.find(item => item.id === id);
    assert.equal(service.authentication.kind, 'heir', id);
    assert.match(service.application.eligibility, /상속|수급|유족/, `${id}: applicant eligibility is explained`);
  }
  const finance = POST_DEATH_LOOKUP_SERVICES.find(item => item.id === 'heirs-finance');
  assert.ok(finance.checks.some(check => /예금.*채무/.test(check)), 'financial inquiry distinguishes debts as well as assets');
  const pension = POST_DEATH_LOOKUP_SERVICES.find(item => item.id === 'survivors-pension');
  assert.ok(pension.checks.some(check => /월수입.*생활비/.test(check)), 'survivor benefits support living income');
  assert.ok(pension.checks.some(check => /상속재산총액에 더하지/.test(check)), 'periodic benefits are not added to estate totals');
});
