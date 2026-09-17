import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
const catalog = readJson('../docs/reviews/official_forms_catalog_candidates.json');
const manifest = readJson('../public/downloads/official-forms/manifest.json');
const documents = manifest.documents;
const expectedCategories = { '재산분배·상속': 10, '증여': 3, '매매·임대차': 21, '차용·상환': 10, '양도': 16, '가업승계': 3, '공제·납부': 5, '등기': 6 };

test('all 74 candidate IDs are published exactly once, without substitute aggregates', () => {
  assert.equal(documents.length, 74);
  assert.equal(new Set(documents.map(item => item.id)).size, 74);
  assert.deepEqual(documents.map(item => item.id).sort(), catalog.records.map(item => item.id).sort());
  assert.equal(manifest.publishedCount, 74);
});

test('catalog titles, original categories and source groups remain traceable', () => {
  for (const record of catalog.records) {
    const item = documents.find(document => document.id === record.id);
    assert.equal(item.catalogTitle, record.title, record.id);
    assert.equal(item.originalCategory, record.category, record.id);
    assert.equal(item.sourceId, record.source_id, record.id);
    assert.equal(item.sourceUrl, record.source_url, record.id);
    assert.ok(item.institution && item.checkedOn && item.verification && item.format, record.id);
  }
});

test('all 74 titles have a dated official-page evidence record, separate from binary inspection', () => {
  const evidence = readJson('../docs/reviews/forms-catalog-source-evidence.json');
  assert.equal(evidence.recordCount, 74);
  assert.equal(evidence.matchedCount, 74);
  assert.equal(evidence.sources.length, 14);
  assert.deepEqual(evidence.records.map(item => item.id).sort(), catalog.records.map(item => item.id).sort());
  for (const item of evidence.records) {
    assert.equal(item.titleFoundInOfficialPage, true, item.id);
    assert.equal(item.binaryVerifiedByThisAudit, false, item.id);
    assert.match(item.pageTextSha256, /^[a-f0-9]{64}$/);
    assert.equal(item.url, documents.find(document => document.id === item.id).sourceUrl);
  }
});

test('every category is reachable and all original category counts are preserved', () => {
  const countBy = key => Object.fromEntries([...new Set(documents.map(item => item[key]))].map(category => [category, documents.filter(item => item[key] === category).length]));
  assert.deepEqual(countBy('category'), expectedCategories);
  assert.deepEqual(countBy('originalCategory'), catalog.category_counts);
});

test('download, provider and pending counts do not conflate records and files', () => {
  const counts = Object.fromEntries(['hosted', 'provider', 'pending'].map(key => [key, documents.filter(item => item.delivery === key).length]));
  assert.deepEqual(counts, { hosted: 2, provider: 72, pending: 0 });
  assert.deepEqual(manifest.deliveryCounts, counts);
  assert.equal(manifest.hostedOriginalCount, 2);
  assert.equal(manifest.hostedInstitutionalExampleCount, 2);
});

test('four hosted originals and examples retain their audited binary hashes', () => {
  const hashes = ['704287e3acfb7f3e66ebbdd4f8912c7ab6deab2a9945ddfb47ddcf1fe7fd590a', '86b0484c2377cc49528282c226cc864eb503f9264ab2dadecb729a0d160b52d3', 'a4f31d43173ca4534c2387c29b26f9966a883bb4cc5ba60c9d78551eb998ece7', '8c4d6490f5a97b9f86920fc2bf36fae84b4cc8314c6e6af0658a0af9c01a81c9'];
  const actual = [];
  for (const item of documents.filter(item => item.delivery === 'hosted')) {
    for (const [path, hash] of [[item.editable, item.sha256], [item.example, item.exampleSha256]]) {
      const bytes = readFileSync(new URL('../public' + path, import.meta.url));
      assert.equal(bytes.subarray(0, 8).toString('hex'), 'd0cf11e0a1b11ae1');
      assert.equal(createHash('sha256').update(bytes).digest('hex'), hash);
      actual.push(hash);
    }
  }
  assert.deepEqual(actual.sort(), hashes.sort());
});

test('provider records have official HTTPS URLs and no invented local files or hashes', () => {
  const hosts = new Set(['www.icbp.go.kr', 'seoul.scourt.go.kr', 'www.scourt.go.kr', 'www.ddm.go.kr', 'www.nts.go.kr', 'easylaw.go.kr']);
  for (const item of documents) {
    assert.equal(new URL(item.sourceUrl).protocol, 'https:');
    assert.ok(hosts.has(new URL(item.sourceUrl).hostname), item.id);
    if (item.delivery !== 'hosted') {
      assert.equal(item.editable, item.sourceUrl, item.id);
      assert.equal(item.sha256, null, item.id);
      assert.equal(item.thumbnail, null, item.id);
      assert.equal(item.binaryInspected, false, item.id);
      assert.ok(item.license.includes('미확인'), item.id);
    }
    assert.ok(item.exampleVerification.length > 10, item.id);
  }
});

test('unconfirmed NTS examples are not fabricated and withdrawn drafts never reappear', () => {
  for (const item of documents.filter(item => ['NTS-IG', 'NTS-CG'].includes(item.sourceId))) {
    assert.equal(item.example, null, item.id);
    assert.equal(item.exampleSha256, null, item.id);
  }
  assert.ok(!JSON.stringify(manifest).includes('/downloads/asset-succession-forms-v1/'));
});
