import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Independent commit snapshots protect both sides of this integration. CI must
// fetch history; replacing the historical migration baseline would hide a loss.
const production = 'f5ed67948e6e0e171e853dab3c618d4904f505e5';
const redesign = '28c1912f3a070924e6f61a03197b4dd717e174b4';
const manifestPath = 'public/downloads/official-forms/manifest.json';
const git = (...args) => execFileSync('git', args, { maxBuffer: 40_000_000 });
const read = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
const source = (ref, path) => JSON.parse(git('show', `${ref}:${path}`));
const hash = data => createHash('sha256').update(data).digest('hex');
const manifest = read(manifestPath);
const usage = read('lib/forms/resource-usage.json').documents;
const prior = source(production, manifestPath);
const completed = source(redesign, manifestPath);
const previewRecords = prior.documents.filter(item => item.preview);
const evidenceOverlayIds = ['P0-10', 'P1-02', 'P1-03', 'P1-04', 'P1-05'];
const evidenceOverlayFields = ['source_evidence', 'guide_file', 'integration_evidence'];

function withLatestEvidence(rows, latestRows) {
  const result = structuredClone(rows);
  for (const id of evidenceOverlayIds) {
    const current = result.find(row => row.id === id);
    const latest = latestRows.find(row => row.id === id);
    assert.ok(current && latest, id);
    for (const key of evidenceOverlayFields) {
      assert.ok(Object.hasOwn(latest, key), `${id}.${key}`);
      current[key] = structuredClone(latest[key]);
    }
  }
  return result;
}

test('177 resources retain the completed redesign and the 74 latest production previews', () => {
  const expected = structuredClone(completed);
  for (const item of previewRecords) {
    Object.assign(expected.documents.find(row => row.id === item.id), {
      thumbnail: item.thumbnail, preview: item.preview,
    });
  }
  for (const id of ['P0-10', 'P1-02']) {
    expected.documents.find(row => row.id === id).source_evidence = structuredClone(prior.documents.find(row => row.id === id).source_evidence);
  }
  expected.additionRequests = withLatestEvidence(completed.additionRequests, prior.additionRequests);
  const normalized = structuredClone(manifest);
  for (const current of normalized.documents) {
    const original = expected.documents.find(item => item.id === current.id);
    assert.equal(current.description, usage[current.id].description, `${current.id}: authored usage description`);
    assert.deepEqual(current.resource.facets.timing, usage[current.id].timing, `${current.id}: reviewed timing`);
    current.description = original.description;
    current.resource.facets.timing = original.resource.facets.timing;
  }
  // Only the two requested editorial fields differ; all files, provenance,
  // applicability, deadlines, relations and collection records remain pinned.
  assert.deepEqual(normalized, expected);
  assert.equal(manifest.documents.length, 177);
  assert.equal(new Set(manifest.documents.map(item => item.id)).size, 177);
  assert.equal(manifest.publishedCount, 177);
  assert.deepEqual(manifest.deliveryCounts, { hosted: 107, provider: 70, direct: 0, pending: 0 });
  assert.equal(previewRecords.length, 74);
  for (const item of completed.documents) {
    const current = normalized.documents.find(row => row.id === item.id);
    assert.deepEqual(current.resource, item.resource, `${item.id}: stages, facets, relations and presentation`);
  }
  assert.deepEqual(read('public/downloads/official-forms/presentation-groups.json'), source(redesign, 'public/downloads/official-forms/presentation-groups.json'));
});

test('109 completed requests retain the latest evidence pointers and original-required acquisitions', () => {
  const rows = read('docs/forms-expansion-109/results.json');
  const summary = read('docs/forms-expansion-109/summary.json');
  const expected = withLatestEvidence(source(redesign, 'docs/forms-expansion-109/results.json'), source(production, 'docs/forms-expansion-109/results.json'));
  assert.deepEqual(rows, expected);
  assert.deepEqual(manifest.additionRequests, rows);
  assert.deepEqual(summary, source(redesign, 'docs/forms-expansion-109/summary.json'));
  assert.equal(rows.length, 109);
  assert.equal(new Set(rows.map(row => row.id)).size, 109);
  assert.ok(rows.every(row => row.status === '확인 완료'));
  assert.equal(summary.completed, 109);
  assert.equal(summary.unchecked, 0);
  assert.deepEqual(summary.failed_original_ids, []);
  assert.deepEqual(summary.original_acquired_ids, summary.original_required_ids);
  for (const id of evidenceOverlayIds) {
    const row = rows.find(row => row.id === id);
    for (const [pathKey, hashKey] of [['evidence_file', 'evidence_sha256'], ['support_evidence_file', 'support_evidence_sha256']]) {
      assert.equal(hash(readFileSync(row.source_evidence[pathKey])), row.source_evidence[hashKey], `${id}.${pathKey}`);
    }
    for (const path of [row.guide_file, row.integration_evidence]) {
      assert.equal(hash(readFileSync(path)), hash(git('show', `${production}:${path}`)), path);
    }
  }
});

test('all 33 hosted expansion records retain real binaries and providers do not acquire fictitious downloads', () => {
  const newRows = manifest.documents.filter(item => item.task_id);
  assert.equal(newRows.length, 103);
  assert.equal(newRows.filter(item => item.delivery === 'hosted').length, 33);
  for (const item of newRows) {
    if (item.delivery !== 'hosted') {
      assert.equal(item.files.length, 0, item.id);
      assert.equal(item.thumbnail, null, item.id);
      continue;
    }
    assert.ok(item.files.length > 0, item.id);
    for (const file of item.files) {
      assert.equal(file.delivery, 'hosted', item.id);
      const bytes = readFileSync(new URL(`../public${file.path}`, import.meta.url));
      const evidence = manifest.additionRequests.flatMap(row => row.files)
        .find(row => row.local_url === file.path || row.path === `public${decodeURIComponent(file.path)}`);
      assert.ok(evidence?.sha256, `${item.id}: recorded file evidence`);
      assert.equal(bytes.length, file.bytes, item.id);
      assert.equal(hash(bytes), evidence.sha256, item.id);
    }
  }
});

test('all 182 unique hosted file paths preserve the redesign original bytes', () => {
  // Read by blob ID so Git for Windows never interprets a long revision:path as
  // a filesystem path. The pinned baseline and byte-level assertions are unchanged.
  const blobs = new Map(git('ls-tree', '-r', '-z', redesign, 'public/downloads').toString('utf8')
    .split('\0').filter(Boolean).map(entry => {
      const [metadata, path] = entry.split('\t');
      return [path, metadata.split(' ')[2]];
    }));
  const originals = new Set(completed.documents.flatMap(item => item.files)
    .filter(file => file.delivery === 'hosted').map(file => `public${decodeURIComponent(file.path)}`));
  assert.equal(originals.size, 182);
  for (const path of originals) {
    assert.ok(blobs.has(path), path);
    assert.equal(hash(readFileSync(path)), hash(git('cat-file', 'blob', blobs.get(path))), path);
  }
});

test('latest production binaries, all 74 real preview PNGs and the 74-member ZIP remain byte-identical', () => {
  const entries = git('ls-tree', '-r', '-z', production, 'public/downloads').toString('utf8').split('\0').filter(Boolean);
  for (const entry of entries) {
    const [metadata, path] = entry.split('\t');
    if (!/\.(hwp|hwpx|docx?|xlsx?|pdf|png|jpe?g|zip)$/i.test(path)) continue;
    const objectId = metadata.split(' ')[2];
    assert.equal(hash(readFileSync(path)), hash(git('cat-file', 'blob', objectId)), path);
  }
  assert.deepEqual(manifest.bundle, prior.bundle);
  assert.equal(manifest.bundle.recordCount, 74);
  assert.equal(manifest.bundle.fileCount, 148);
  for (const item of previewRecords) {
    const current = manifest.documents.find(row => row.id === item.id);
    assert.equal(current.thumbnail, item.thumbnail, item.id);
    assert.deepEqual(current.preview, item.preview, item.id);
  }
});

test('latest calculator and service code survive outside the forms pages and precheck link', () => {
  // Approved 2026-09-25 change: separate the fixed support-window constant and
  // clarify its UI/error wording. Exact projection preserves the old byte guard
  // for all remaining calculator logic; no calculator file is excluded wholesale.
  const datePolicyFiles = ['app/calculator/SimpleTaxCalculator.tsx', 'lib/simple-calculator/calculator.ts'];
  const projectDatePolicy = (path, value) => {
    let text = value.toString('utf8').replace(/\r\n/g, '\n');
    if (path === datePolicyFiles[1]) text = text
      .replace('// An explicitly reviewed input window, not a claim that the tax law expires here.\n// Do not derive either value from the build date or current clock.\nexport const SIMPLE_CALCULATOR_SUPPORTED_THROUGH = "2026-09-19";\n', '')
      .replace('value > SIMPLE_CALCULATOR_SUPPORTED_THROUGH', 'value > SIMPLE_CALCULATOR_CHECKED_ON')
      .replace('${SIMPLE_CALCULATOR_SUPPORTED_THROUGH}까지의 입력일을 지원합니다. 그 밖의 날짜는 적용 기준 검토가 완료되지 않았습니다.', '${SIMPLE_CALCULATOR_CHECKED_ON}까지의 적용 기준을 지원합니다.');
    if (path === datePolicyFiles[0]) text = text
      .replace('  SIMPLE_CALCULATOR_SUPPORTED_THROUGH,\n', '')
      .replace('입력일 지원 범위:', '지원일:')
      .replace('~ {SIMPLE_CALCULATOR_SUPPORTED_THROUGH}', '~ {SIMPLE_CALCULATOR_CHECKED_ON}')
      .replace('        <p>검토일은 법령의 만료일이 아닙니다. 지원 범위 밖의 날짜는 기준 검토가 완료되지 않아 계산하지 않습니다.</p>\n', '');
    return text;
  };
  // Approved 2026-09-26 change: the shared public header labels and consultation
  // CTA are site-wide chrome, not calculator or service-domain logic.
  const commonHeaderFiles = ['components/PublicNav.tsx', 'components/PublicNav.module.css', 'app/consultation/page.tsx', 'app/consultation/Consultation.module.css'];
  const changes = git('diff', '--name-only', '-z', production, '--', 'app', 'components', 'lib', 'package-lock.json', 'next.config.ts', 'vercel.json').toString('utf8').split('\0').filter(Boolean);
  const allowed = path => path.startsWith('app/forms/') || path.startsWith('lib/forms/')
    || ['components/DiagnosisChat.tsx', 'components/DiagnosisChat.module.css', ...datePolicyFiles, ...commonHeaderFiles].includes(path);
  assert.deepEqual(changes.filter(path => !allowed(path)), []);
  const calculators = git('ls-tree', '-r', '--name-only', '-z', production, 'app/calculator', 'lib/simple-calculator').toString('utf8').split('\0').filter(Boolean);
  assert.ok(calculators.length > 0);
  for (const path of calculators) assert.equal(hash(projectDatePolicy(path, readFileSync(path))), hash(projectDatePolicy(path, git('show', `${production}:${path}`))), path);
  const currentPackage = read('package.json');
  const priorPackage = source(production, 'package.json');
  const { scripts: currentScripts, ...currentRuntime } = currentPackage;
  const { scripts: priorScripts, ...priorRuntime } = priorPackage;
  assert.deepEqual(currentRuntime, priorRuntime);
  for (const [name, command] of Object.entries(priorScripts)) assert.equal(currentScripts[name], command, name);
  assert.deepEqual(Object.keys(currentScripts).filter(name => !Object.hasOwn(priorScripts, name)).sort(), ['test:forms', 'test:forms-integration', 'test:forms-routes']);
});

test('historical migration evidence remains unchanged when production overlays are recorded', () => {
  for (const path of [
    'docs/forms-library-v2/implementation-baseline.json',
    'docs/forms-library-v2/evidence/pre-migration-manifest.json',
    'docs/forms-library-v2/evidence/pre-migration-files.json',
  ]) assert.equal(hash(readFileSync(path)), hash(git('show', `${redesign}:${path}`)), path);
});
