import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

const read = name => JSON.parse(readFileSync(name, 'utf8'));
const documents = read('public/downloads/official-forms/manifest.json').documents;
const groups = read('public/downloads/official-forms/presentation-groups.json');
const planning = read('lib/forms/planning-content.json').resources;
const usage = read('lib/forms/resource-usage.json').documents;
const output = path.resolve('.tmp/forms-life-guides-tests');
mkdirSync(output, { recursive: true });
writeFileSync(path.join(output, 'package.json'), '{"type":"commonjs"}');
for (const name of ['catalog', 'guides', 'planning-guidance', 'lookup-services']) {
  writeFileSync(path.join(output, name + '.js'), ts.transpileModule(readFileSync(`lib/forms/${name}.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText);
}
const require = createRequire(import.meta.url);
const { buildCatalog, filterCatalog, emptyFilters, matchesResource, parseCatalogFilters } = require(path.join(output, 'catalog.js'));
const { GUIDES, guidesForResource, guideResourceUrl, guideCatalogUrl, getGuide } = require(path.join(output, 'guides.js'));
const { PLANNING_GUIDANCE } = require(path.join(output, 'planning-guidance.js'));
const { LOOKUP_SERVICES } = require(path.join(output, 'lookup-services.js'));
const ids = new Set([...documents, ...planning].map(item => item.id));
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

test('every guide link reaches a real canonical document or worksheet and has a working reverse anchor', () => {
  assert.deepEqual(GUIDES.map(guide => guide.timing), ['before-death', 'after-death']);
  assert.equal(getGuide('unknown'), undefined);
  for (const guide of GUIDES) {
    assert.equal(new Set(guide.steps.map(step => step.id)).size, guide.steps.length);
    const filters = parseCatalogFilters(new URL(guideCatalogUrl(guide.timing), 'https://example.test').search);
    assert.deepEqual(filters.timing, [guide.timing.replace('-', '_')]);
    assert.deepEqual(filters.purpose, [], 'guide catalog includes gift and shared-purpose materials');
    if (guide.timing === 'before-death') for (const id of ['BP-G-01', 'P3-05', 'P3-06', 'REG-G-01', 'NTS-IG-11', 'P1-10', 'P3-04']) {
      assert.ok(matchesResource(byId.get(id), filters), `before-death catalog retains ${id}`);
    }
    for (const step of guide.steps) for (const resource of step.resources) {
      assert.ok(ids.has(resource.id), `${guide.timing}/${step.id}: ${resource.id}`);
      const target = new URL(guideResourceUrl(resource.id), 'https://example.test');
      assert.ok(resource.id.startsWith('PLAN-') ? target.pathname.endsWith(resource.id) : target.searchParams.get('resource') === resource.id, resource.id);
      const links = guidesForResource(resource.id, byId.get(resource.id)?.resource);
      assert.ok(links.some(link => link.timing === guide.timing && link.stepId === step.id && link.href.endsWith('#' + step.id)), resource.id);
    }
  }
});

test('shared worksheets have context-appropriate guides; will preparation never routes to post-death execution', () => {
  for (const id of ['PLAN-01', 'PLAN-02', 'PLAN-04', 'PLAN-06']) {
    assert.deepEqual([...new Set(guidesForResource(id).map(item => item.timing))].sort(), ['after-death', 'before-death'], id);
  }
  for (const id of ['PLAN-03', 'PLAN-05', 'P1-14', 'P1-17']) {
    assert.ok(guidesForResource(id, byId.get(id)?.resource).every(item => item.timing === 'before-death'), id);
  }
  for (const resource of planning) for (const link of PLANNING_GUIDANCE[resource.id].resources) assert.ok(byId.has(link.id), `${resource.id}/${link.id}`);
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

test('nine lookup services link to real note fields and official providers without inflating original counts', () => {
  const expected = ['accounts', 'insurance', 'debts', 'pension', 'registry', 'property-prices', 'family', 'dormant-deposits', 'unclaimed-shares'];
  assert.deepEqual(LOOKUP_SERVICES.map(service => service.id).sort(), expected.sort());
  const officialDomains = ['payinfo.or.kr', 'accountinfo.or.kr', 'credit4u.or.kr', 'insure.or.kr', 'fss.or.kr', 'scourt.go.kr', 'iros.go.kr', 'realtyprice.kr', 'kinfa.or.kr', 'ksd.or.kr'];
  for (const service of LOOKUP_SERVICES) {
    const url = new URL(service.url);
    assert.equal(url.protocol, 'https:', service.id);
    assert.ok(officialDomains.some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain)), service.id);
    assert.ok(service.menu.trim() && service.authentication.text.trim() && service.limitation.trim(), service.id);
    assert.ok(service.checks.length > 0 && service.targets.length > 0 && service.evidenceUrls.length > 0, service.id);
    for (const target of service.targets) {
      const resource = planning.find(item => item.id === target.resourceId);
      const question = resource?.sections.flatMap(section => section.questions).find(item => item.id === target.questionId);
      assert.ok(question, `${service.id}: real worksheet field ${target.resourceId}/${target.questionId}`);
      assert.ok(['text', 'textarea'].includes(question.type), `${service.id}: narrative examples must not target amount inputs`);
      assert.equal(target.label, question.label, service.id);
      assert.ok(target.record.trim() && target.example.trim(), service.id);
    }
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
  assert.ok(pension.targets.some(target => target.resourceId === 'PLAN-04' && target.questionId === 'income_notes'));
  assert.ok(pension.targets.every(target => target.questionId !== 'estimated_assets'));
});
