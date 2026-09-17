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

test('download, direct attachment and pending counts do not conflate records and files', () => {
  const counts = Object.fromEntries(['hosted', 'direct', 'pending'].map(key => [key, documents.filter(item => item.delivery === key).length]));
  assert.deepEqual(counts, { hosted: 70, direct: 3, pending: 1 });
  assert.deepEqual(manifest.deliveryCounts, counts);
  assert.equal(manifest.hostedOriginalCount, 70);
  assert.equal(manifest.hostedInstitutionalExampleCount, 35);
  assert.equal(manifest.hostedFileCount, 139);
  assert.equal(manifest.directDownloadCount, 73);
});

test('four hosted originals and examples retain their audited binary hashes', () => {
  const hashes = ['704287e3acfb7f3e66ebbdd4f8912c7ab6deab2a9945ddfb47ddcf1fe7fd590a', '86b0484c2377cc49528282c226cc864eb503f9264ab2dadecb729a0d160b52d3', 'a4f31d43173ca4534c2387c29b26f9966a883bb4cc5ba60c9d78551eb998ece7', '8c4d6490f5a97b9f86920fc2bf36fae84b4cc8314c6e6af0658a0af9c01a81c9'];
  const actual = [];
  for (const item of documents.filter(item => item.id.startsWith('BP-'))) {
    for (const [path, hash] of [[item.editable, item.sha256], [item.example, item.exampleSha256]]) {
      const bytes = readFileSync(new URL('../public' + path, import.meta.url));
      assert.equal(bytes.subarray(0, 8).toString('hex'), 'd0cf11e0a1b11ae1');
      assert.equal(createHash('sha256').update(bytes).digest('hex'), hash);
      actual.push(hash);
    }
  }
  assert.deepEqual(actual.sort(), hashes.sort());
});

test('unhosted records retain official sources and never invent rehosting permission', () => {
  const hosts = new Set(['www.icbp.go.kr', 'seoul.scourt.go.kr', 'www.scourt.go.kr', 'www.ddm.go.kr', 'www.nts.go.kr', 'easylaw.go.kr']);
  for (const item of documents) {
    assert.equal(new URL(item.sourceUrl).protocol, 'https:');
    assert.ok(hosts.has(new URL(item.sourceUrl).hostname), item.id);
    if (item.delivery === 'pending') {
      assert.equal(item.editable, '', item.id);
      assert.equal(item.sha256, null, item.id);
      assert.equal(item.thumbnail, null, item.id);
      assert.equal(item.binaryInspected, false, item.id);
      assert.ok(item.license.includes('미확인'), item.id);
    }
    if (item.delivery === 'direct') {
      assert.equal(new URL(item.editable).hostname, 'www.nts.go.kr');
      assert.equal(new URL(item.editable).pathname, '/comm/nttFileDownload.do');
      assert.equal(item.files.length, 1);
      assert.ok(item.license.includes('미확인'), item.id);
      assert.equal(item.licenseBasis, 'unconfirmed');
    }
    assert.ok(item.exampleVerification.length > 10, item.id);
  }
});

test('all 139 hosted binaries match their official attachment size, hash and format', () => {
  const paths = [];
  for (const item of documents.filter(item => item.delivery === 'hosted')) {
    assert.ok(item.files.length > 0, item.id);
    assert.ok(item.files.some(file => file.path === item.editable && file.sha256 === item.sha256));
    assert.notEqual(item.licenseBasis, 'unconfirmed');
    for (const file of item.files) {
      const decoded = decodeURIComponent(file.path);
      assert.ok(decoded.startsWith('/downloads/official-forms/') && !decoded.includes('..'));
      const bytes = readFileSync(new URL('../public' + file.path, import.meta.url));
      assert.equal(bytes.length, file.bytes, file.path);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
      assert.ok(bytes.subarray(0, 8).toString('hex') === 'd0cf11e0a1b11ae1'
        || bytes.toString('ascii', 0, 5) === '%PDF-'
        || bytes.subarray(0, Buffer.byteLength('HWP Document File V3.00')).equals(Buffer.from('HWP Document File V3.00'))
        || bytes.toString('ascii', 0, 6) === '{\\rtf1', file.path);
      assert.equal(file.delivery, 'hosted');
      assert.ok(file.sourceUrl.startsWith('https:') && file.sourcePage.startsWith('https:'));
      assert.ok(file.inspection.kind && file.licenseUrl && file.checkedOn);
      paths.push(file.path);
    }
  }
  assert.equal(paths.length, 139);
  assert.equal(new Set(paths).size, 139);
});

test('court editing formats and combined PDF examples are all reachable', () => {
  for (const item of documents.filter(item => item.id.startsWith('SC-'))) {
    assert.deepEqual(item.files.map(file => file.format).sort(), ['DOC', 'HWP', 'PDF']);
    const pdf = item.files.find(file => file.format === 'PDF');
    assert.equal(item.example, pdf.path);
    assert.equal(item.editable, pdf.path);
    assert.equal(pdf.role, 'combined');
    assert.equal(pdf.inspection.allPagesRendered, true);
    assert.equal(item.files.find(file => file.format === 'HWP').inspection.fullOfficeRenderingVerified, false);
  }
});

test('Korean filenames use the framework canonical path encoding, including parentheses', () => {
  for (const item of documents.filter(item => item.delivery === 'hosted')) {
    for (const file of item.files) {
      assert.equal(file.path, file.path.split('/').map(part => encodeURIComponent(decodeURIComponent(part))).join('/'));
    }
  }
});

test('incorrect NTS form 39-5 attachment is replaced by the actual form 40', () => {
  const item = documents.find(item => item.id === 'NTS-CG-15');
  const file = item.files[0];
  assert.match(file.name, /제40호/);
  assert.match(file.sourcePage, /nttSn=1002309/);
  assert.match(file.sourceUrl, /77e4c3a497d11fca9686a6121d12b638/);
  assert.ok(file.rejectedCatalogDownload && file.sourceCorrection);
});

test('the batch download is restricted to 70 reviewed records, never labeled all 74', () => {
  assert.equal(manifest.bundle.recordCount, 70);
  assert.equal(manifest.bundle.fileCount, 139);
  assert.deepEqual([...manifest.bundle.excludedIds].sort(), ['NTS-CE-01','NTS-IE-01','NTS-IE-02','NTS-IE-03']);
  const blocked = documents.find(item => item.id === 'NTS-CE-01');
  assert.equal(blocked.delivery, 'pending');
  assert.equal(blocked.files.length, 0);
  assert.equal(blocked.example, null);
});

test('each hosted binary has a reviewable redistribution basis, distinct from hash verification', () => {
  for (const item of documents.filter(item => item.delivery === 'hosted')) {
    for (const file of item.files) {
      assert.ok(['kogl-type-1','agency-policy','statutory-form'].includes(file.licenseBasis));
      assert.equal(file.licenseUrl, item.licenseUrl);
      assert.notEqual(file.licenseBasis, file.sha256);
    }
  }
});

test('unconfirmed NTS examples are not fabricated and withdrawn drafts never reappear', () => {
  for (const item of documents.filter(item => ['NTS-IG', 'NTS-CG'].includes(item.sourceId))) {
    assert.equal(item.example, null, item.id);
    assert.equal(item.exampleSha256, null, item.id);
  }
  assert.ok(!JSON.stringify(manifest).includes('/downloads/asset-succession-forms-v1/'));
});
