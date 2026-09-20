import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

// Scoped integration audit. Requires the recorded base and donor Git objects.
const base = '4c211a9fa669f44fab558ae709706d64c89234c3';
const donor = '28c1912f3a070924e6f61a03197b4dd717e174b4';
const scope = ['P0-10', 'P1-02', 'P1-03', 'P1-04', 'P1-05'];
const doc = 'docs/forms-expansion-109';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const gitBytes = (ref, path) => execFileSync('git', ['show', `${ref}:${path}`], {maxBuffer: 20_000_000});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
// Evidence hashes identify UTF-8 Git blobs; Windows checkouts may use CRLF.
const evidenceBytes = path => Buffer.from(readFileSync(path, 'utf8').replace(/\r\n/g, '\n'));
const rows = read(`${doc}/results.json`);
const before = JSON.parse(gitBytes(base, `${doc}/results.json`));
const manifest = read('public/downloads/official-forms/manifest.json');
const oldManifest = JSON.parse(gitBytes(base, 'public/downloads/official-forms/manifest.json'));
const changed = rows.filter((row, i) => JSON.stringify(row) !== JSON.stringify(before[i]));

test('only the five selected pending tasks may change; all 92 completed records stay intact', () => {
  assert.equal(rows.length, 109);
  assert.ok(changed.length > 0 && changed.length <= 5);
  for (const row of changed) {
    assert.ok(scope.includes(row.id));
    assert.equal(before.find(r => r.id === row.id).status, '확인 중');
  }
  for (const row of before.filter(r => r.status === '확인 완료')) assert.deepEqual(rows.find(r => r.id === row.id), row);
  if (process.env.FINAL_BATCH === '1') assert.deepEqual(changed.map(r => r.id), scope);
});

test('tasks, result data, summary and manifest requests agree after every item', () => {
  const summary = read(`${doc}/summary.json`);
  const tasks = readFileSync('tasks.md', 'utf8');
  const done = rows.filter(r => r.status === '확인 완료').map(r => r.id);
  const pending = rows.filter(r => r.status !== '확인 완료').map(r => r.id);
  assert.deepEqual(summary.completed_ids, done);
  assert.deepEqual(summary.pending_ids, pending);
  assert.equal(summary.completed, done.length);
  assert.equal(summary.unchecked, pending.length);
  assert.equal([...tasks.matchAll(/^- \[x\] P\d-\d\d /gm)].length, done.length);
  assert.equal([...tasks.matchAll(/^- \[ \] P\d-\d\d /gm)].length, pending.length);
  assert.deepEqual(manifest.additionRequests, rows);
});

test('177 cards remain; only two pending cards and three requested source URLs may change', () => {
  assert.equal(manifest.documents.length, 177);
  assert.equal(new Set(manifest.documents.map(d => d.id)).size, 177);
  const changedIds = new Set(changed.map(r => r.id));
  for (const old of oldManifest.documents) {
    const current = manifest.documents.find(d => d.id === old.id);
    const task = changed.find(r => r.target_id === old.id && r.operation === 'source_url_update');
    if (task) {
      assert.equal(current.sourceUrl, task.source_url);
      assert.deepEqual({...current, sourceUrl: old.sourceUrl}, old);
    } else if (!changedIds.has(old.id)) assert.deepEqual(current, old);
    else {
      assert.equal(current.delivery, 'provider');
      assert.deepEqual(current.files, old.files);
      assert.equal(current.example, old.example);
      assert.equal(current.thumbnail, old.thumbnail);
    }
  }
  assert.deepEqual(manifest.bundle, oldManifest.bundle);
  assert.deepEqual(manifest.deliveryCounts, Object.fromEntries(['hosted', 'provider', 'direct', 'pending'].map(k => [k, manifest.documents.filter(d => d.delivery === k).length])));
});

test('inherited evidence bytes and both evidence hashes have verifiable provenance', () => {
  for (const row of changed) {
    const evidence = read(row.integration_evidence);
    assert.equal(evidence.inherited_from_commit, donor);
    for (const retained of evidence.retained_evidence) {
      const bytes = evidenceBytes(retained.path);
      assert.deepEqual(bytes, gitBytes(donor, retained.path));
      assert.equal(hash(bytes), retained.sha256);
    }
    for (const [file, digest] of [['evidence_file', 'evidence_sha256'], ['support_evidence_file', 'support_evidence_sha256']]) {
      assert.equal(hash(evidenceBytes(row.source_evidence[file])), row.source_evidence[digest]);
    }
    assert.ok(existsSync(row.guide_file));
  }
});

test('fresh binary verification is distinguished from provider-list verification and rehosting', () => {
  for (const row of changed) {
    const evidence = read(row.integration_evidence);
    assert.equal(evidence.verification.public_binaries_added, false);
    assert.deepEqual(row.files, []);
    if (row.id === 'P1-02') {
      assert.equal(evidence.verification.files.length, 0);
      assert.equal(read(`${doc}/evidence/round16/P1-02.json`).source_evidence.download_verified, false);
    } else {
      const files = evidence.verification.files;
      assert.equal(files.length, row.id === 'P0-10' ? 1 : 2);
      for (const file of files) {
        assert.equal(file.http_status, 200);
        assert.equal(file.title_verified, true);
        assert.equal(file.matches_previous_hash, true);
        assert.equal(file.matches_previous_bytes, true);
        assert.equal(file.error, undefined);
      }
    }
  }
});

test('no new deadlines, form revisions or duplicate original acquisition claims', () => {
  const priorSummary = JSON.parse(gitBytes(base, `${doc}/summary.json`));
  const summary = read(`${doc}/summary.json`);
  assert.deepEqual(summary.original_acquired_ids, priorSummary.original_acquired_ids);
  assert.deepEqual(summary.failed_original_ids, priorSummary.failed_original_ids);
  for (const row of changed) for (const key of ['deadline', 'deadline_basis', 'form_no', 'revised_at']) {
    assert.equal(row[key], before.find(r => r.id === row.id)[key]);
  }
});

test('existing files, ZIP and application code have zero Git changes', () => {
  const paths = execFileSync('git', ['diff', '--name-only', base], {encoding: 'utf8'}).trim().split(/\r?\n/).filter(Boolean);
  for (const path of paths) assert.ok(path === 'tasks.md' || path.startsWith(`${doc}/`) || path === 'public/downloads/official-forms/manifest.json' || path === 'scripts/forms-expansion-round17-tests.mjs', path);
});
