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
  assert.deepEqual(counts, { hosted: 74, direct: 0, pending: 0 });
  assert.deepEqual(manifest.deliveryCounts, counts);
  assert.equal(manifest.hostedOriginalCount, 74);
  assert.equal(manifest.hostedInstitutionalExampleCount, 39);
  assert.equal(manifest.hostedFileCount, 148);
  assert.equal(manifest.hostedOriginalFileCount, 147);
  assert.equal(manifest.hostedDerivedFileCount, 1);
  assert.equal(manifest.directDownloadCount, 74);
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

test('all 148 hosted binaries match recorded sizes, hashes and formats', () => {
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
        || bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
        || bytes.subarray(0, Buffer.byteLength('HWP Document File V3.00')).equals(Buffer.from('HWP Document File V3.00'))
        || bytes.toString('ascii', 0, 6) === '{\\rtf1', file.path);
      assert.equal(file.delivery, 'hosted');
      assert.ok(file.sourceUrl.startsWith('https:') && file.sourcePage.startsWith('https:'));
      assert.ok(file.inspection.kind && file.licenseUrl && file.checkedOn);
      paths.push(file.path);
    }
  }
  assert.equal(paths.length, 148);
  assert.equal(new Set(paths).size, 148);
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

test('all 74 records now have local downloads and are present in the complete bundle', () => {
  assert.equal(manifest.bundle.recordCount, 74);
  assert.equal(manifest.bundle.fileCount, 148);
  assert.deepEqual(manifest.bundle.excludedIds, []);
  for (const item of documents) {
    assert.equal(item.delivery, 'hosted');
    assert.ok(item.editable.startsWith('/downloads/official-forms/'));
    assert.ok(item.files.some(file => file.path === item.editable));
  }
});

test('each hosted binary has a reviewable redistribution basis, distinct from hash verification', () => {
  for (const item of documents.filter(item => item.delivery === 'hosted')) {
    for (const file of item.files) {
      assert.ok(['kogl-type-1','agency-policy','statutory-form','public-work-article-24-2'].includes(file.licenseBasis));
      assert.equal(file.licenseUrl, item.licenseUrl);
      assert.notEqual(file.licenseBasis, file.sha256);
    }
  }
});

test('remaining NTS examples preserve their eight source binary hashes', () => {
  const expected = {
    'NTS-IE-01': ['b13fd46afe7a926bcba6a04bb710c84dc7da3308ea50565f103d6990505300e5'],
    'NTS-IE-02': ['3d22bb44878ff950e3a522261296e0e8450617462dff4568ae4bccc7e602d233'],
    'NTS-IE-03': ['5d58bb0213b4ee96e68ab5b133c639b243531a25ffa49477b07f4488268f4c8b'],
    'NTS-CE-01': ['c1cca58280526c12090f9d093d7dd80d323478d6c0a602939d096074522ad45b', 'd4fbba5b752e50f16b768d0d7ea00544bbee449295fa78abf8e5bac5025ed27c', 'e6c2840f51793094d48508c5d96cf7c3ed9bd18fba2e9d73738605d7530af7a6', '1f8df0114394d65f9750e3c68157362ac64dc06af5d3a0bb2d93f21f90d490e7', '24e9644221ebfdb69535233845a9291ee8bfe244c7f6d13deafd6a25f65670f9'],
  };
  for (const [id, hashes] of Object.entries(expected)) {
    const item = documents.find(item => item.id === id);
    assert.deepEqual(item.files.filter(file => file.artifactType === 'institution-original').map(file => file.sha256), hashes);
    if (id.startsWith('NTS-IE')) assert.match(item.files[0].sourcePage, /nttSn=80304[123]/);
  }
});

test('web PDF is identified as a six-page conversion, not an agency-provided PDF', () => {
  const item = documents.find(item => item.id === 'NTS-CE-01');
  const pdf = item.files[0];
  assert.equal(item.primaryArtifactType, 'derived-image-compilation');
  assert.match(item.description, /기관 제공 PDF가 아닌 사이트 변환본/);
  assert.equal(item.files.length, 6);
  assert.equal(pdf.role, 'image-compilation');
  assert.equal(pdf.inspection.institutionProvidedPdf, false);
  assert.equal(pdf.inspection.pages, 6);
  assert.equal(pdf.includesOriginalCaseContext, true);
  assert.equal(pdf.inspection.embeddedSourcePixelsMatch, true);
  assert.deepEqual(pdf.derivedFrom, item.files.slice(1).map(file => ({ path:file.path, sha256:file.sha256 })));
  assert.equal(pdf.inspection.sourcePages.length, 5);
  assert.equal(documents.flatMap(item => item.files).filter(file => file.artifactType === 'derived-image-compilation').length, 1);
});

test('public-work assessment never claims a verified KOGL mark or agency permission', () => {
  const assessed = documents.filter(item => item.licenseBasis === 'public-work-article-24-2');
  assert.deepEqual(assessed.map(item => item.id).sort(), ['NTS-CE-01','NTS-IE-01','NTS-IE-02','NTS-IE-03']);
  for (const item of assessed) {
    assert.equal(item.rightsReview.status, 'public-work-assessment');
    assert.equal(item.rightsReview.koglMarkVerified, false);
    assert.equal(item.rightsReview.separatePermissionObtained, false);
    assert.ok(item.rightsReview.publicationEvidence && item.rightsReview.limitation);
    assert.match(item.licenseUrl, /law.go.kr/);
  }
});

test('unconfirmed NTS examples are not fabricated and withdrawn drafts never reappear', () => {
  for (const item of documents.filter(item => ['NTS-IG', 'NTS-CG'].includes(item.sourceId))) {
    assert.equal(item.example, null, item.id);
    assert.equal(item.exampleSha256, null, item.id);
  }
  assert.ok(!JSON.stringify(manifest).includes('/downloads/asset-succession-forms-v1/'));
});

test('all 74 previews are real PNGs with native dimensions and audited hashes', () => {
  const paths = new Set();
  for (const item of documents) {
    assert.equal(item.thumbnail, `/downloads/official-forms/previews/${item.id}.png`);
    paths.add(item.thumbnail);
    const data = readFileSync(new URL('../public' + item.thumbnail, import.meta.url));
    assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(data.length, item.preview.bytes, item.id);
    assert.equal(createHash('sha256').update(data).digest('hex'), item.preview.sha256, item.id);
    assert.equal(data.readUInt32BE(16), item.preview.width, item.id);
    assert.equal(data.readUInt32BE(20), item.preview.height, item.id);
    assert.equal(item.preview.lowResolution, Math.min(item.preview.width, item.preview.height) < 400);
  }
  assert.equal(paths.size, 74);
});

test('preview provenance is tied to each record, not a generic or fictional document', () => {
  const methods = {};
  for (const item of documents) {
    const preview = item.preview;
    const source = item.files.find(file => file.path === preview.sourcePath);
    assert.ok(source, item.id);
    assert.equal(source.sha256, preview.sourceSha256, item.id);
    assert.equal(source.role, preview.sourceRole, item.id);
    methods[preview.method] = (methods[preview.method] ?? 0) + 1;
    if (preview.method === 'pdf-first-page') {
      assert.equal(source.format, 'PDF');
      assert.equal(preview.page, 1);
      assert.ok(preview.sourcePages >= 1);
      assert.notEqual(source.role, 'image-compilation');
    } else if (preview.method === 'hwp-embedded-image') {
      assert.equal(source.format, 'HWP');
      assert.equal(preview.sourceStream, 'PrvImage');
      assert.match(preview.sourceStreamSha256, /^[a-f0-9]{64}$/);
    } else {
      assert.equal(preview.method, 'institution-image');
      assert.equal(source.format, 'PNG');
      assert.equal(preview.sha256, source.sha256);
    }
    if (!item.example) assert.equal(preview.sourceRole, 'original');
  }
  assert.deepEqual(methods, { 'hwp-embedded-image': 40, 'pdf-first-page': 33, 'institution-image': 1 });
});
