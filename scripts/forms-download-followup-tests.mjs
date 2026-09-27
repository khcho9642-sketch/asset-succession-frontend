import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { finalDocuments, catalog, previewApi } from './load-current-forms.mjs';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const baseline = read('docs/forms-download-followup-20260927/baseline.json');
const { records } = read('docs/forms-download-followup-20260927/sources.json');
const byId = new Map(finalDocuments.map(item => [item.id, item]));
const connected = Object.values(records).filter(row => row.status === 'connected');

test('33 previously fileless forms are accounted for: 22 connected, 11 explicitly unresolved', () => {
  assert.equal(baseline.length, 33);
  assert.deepEqual(new Set(Object.keys(records)), new Set(baseline.map(item => item.id)));
  assert.equal(connected.length, 22);
  assert.equal(Object.values(records).filter(row => row.status === 'unresolved').length, 11);
  assert.equal(connected.flatMap(row => row.files).length, 31);
  assert.equal(new Set(connected.flatMap(row => row.files).map(file => file.url)).size, 30);
});

for (const previous of baseline) test(`${previous.id}: preserve identity, classification, relationships and collection date`, () => {
  const item = byId.get(previous.id);
  assert.equal(catalog.availableFiles(previous).length, 0);
  for (const key of ['id', 'title', 'catalogTitle', 'checkedOn', 'useCategory']) assert.deepEqual(item[key], previous[key], key);
  for (const key of ['purposes', 'timing', 'assets', 'kind', 'origin']) assert.deepEqual(item.resource.facets[key], previous.resource.facets[key], key);
  assert.deepEqual(item.resource.relations, previous.resource.relations);
  assert.deepEqual(item.resource.presentation, previous.resource.presentation);
  assert.equal(item.sourceReview.checkedOn, '2026-09-27');
  assert.ok(item.reviewSummary.limitation);
});

for (const [id, row] of Object.entries(records)) test(`${id}: file evidence and preview claims match the actual deliverables`, () => {
  const item = byId.get(id);
  const files = catalog.availableFiles(item);
  assert.deepEqual(files.map(file => file.path), row.files.map(file => file.path));
  for (const [i, file] of files.entries()) {
    const proof = row.files[i];
    assert.equal(file.bytes, proof.bytes);
    assert.equal(file.format, proof.format);
    assert.equal(proof.status, 200);
    assert.match(proof.sha256, /^[a-f0-9]{64}$/);
    assert.match(proof.url, /^https:\/\//);
    if (file.delivery === 'hosted') {
      const raw = readFileSync('public' + file.path);
      assert.equal(raw.length, proof.bytes);
      assert.equal(createHash('sha256').update(raw).digest('hex'), proof.sha256);
      assert.equal(file.format === 'PDF' ? raw.subarray(0,4).toString() : raw.subarray(0,8).toString('hex'), file.format === 'PDF' ? '%PDF' : 'd0cf11e0a1b11ae1');
    } else assert.equal(file.path, proof.url);
  }
  const preview = previewApi.resolvePreview(item);
  if (row.preview === 'onsite-original') {
    assert.equal(preview.kind, 'image');
    assert.ok(existsSync('public' + preview.imagePath));
    assert.equal(item.preview.editorialRedraw, false);
    assert.ok(row.files.some(file => file.path === item.preview.sourcePath && file.sha256 === item.preview.sourceSha256));
  } else {
    assert.equal(preview.kind, 'provider');
    assert.equal(preview.imagePath, undefined);
  }
  if (row.status === 'unresolved') {
    assert.equal(files.length, 0);
    assert.equal(item.providerInstructions.status, 'original_not_acquired');
    assert.ok(item.providerInstructions.keywords);
  }
});

test('12 KLAC resources link to the provider viewer for the very same original, without commercial rehosting', () => {
  const items = baseline.map(item => byId.get(item.id)).filter(item => item.institution === '대한법률구조공단' && item.externalPreviews?.some(link => link.mode === 'viewer'));
  assert.equal(items.length, 12);
  for (const item of items) {
    assert.match(item.license, /제2유형/);
    assert.ok(item.files.every(file => file.delivery !== 'hosted' && file.role === (item.id === 'P0-09' ? 'combined' : 'example')));
    for (const link of item.externalPreviews) {
      const url = new URL(link.url);
      assert.equal(url.origin, 'https://viewer.klac.or.kr');
      assert.equal(url.pathname, '/SynapDocViewServer/job');
      assert.ok(item.files.some(file => file.path === url.searchParams.get('filePath')));
    }
  }
});

test('partial scopes and absent previews are not filled with unrelated or invented forms', () => {
  for (const [id, word] of [['P1-23','실종선고'],['P8-09','계약 등기신청서'],['P7-03','상이'],['P1-08','일부포기']]) assert.ok(byId.get(id).reviewSummary.limitation.includes(word));
  assert.equal(byId.get('P8-08').files.length, 2);
  assert.equal(byId.get('P0-09').files[0].path, byId.get('P0-08').files[0].path);
  assert.match(byId.get('P0-09').reviewSummary.limitation, /3쪽/);
  assert.equal(byId.get('P9-06').files.length, 6);
  assert.equal(byId.get('P7-01').externalPreviews[0].mode, 'provider-page');
  assert.equal(byId.get('P3-05').resource.facets.origin, 'private_institution');
  assert.equal(byId.get('P3-05').files[0].role, 'example');
  for (const id of ['P0-03','P2-14','P3-05']) assert.equal(byId.get(id).externalPreviews, undefined);
});

test('external viewer links reject scripts, credentials and insecure URLs', () => {
  const item = byId.get('P0-07');
  const result = previewApi.resolvePreview({...item, externalPreviews: [
    {title:'bad', url:'javascript:alert(1)', mode:'viewer'},
    {title:'bad', url:'https://user:pass@example.com/', mode:'viewer'},
    {title:'bad', url:'http://example.com/', mode:'viewer'},
    ...item.externalPreviews,
  ]});
  assert.deepEqual(result.externalPreviews, item.externalPreviews);
});
