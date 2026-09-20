import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const production = '13328ef2cb8ecaef01b2820398a66df2a1774d8c';
const expansion = 'ce31385b7c855c413a9360007a42e75c16c425d3';
const path = 'public/downloads/official-forms/manifest.json';
const git = (...args) => execFileSync('git', args, { maxBuffer: 30_000_000 });
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const source = (ref, path) => JSON.parse(git('show', `${ref}:${path}`));
const manifest = read(path);
const prior = source(production, path);
const additions = source(expansion, path);
const hash = data => createHash('sha256').update(data).digest('hex');

test('177 unique cards retain every expansion field and all 74 current production previews', () => {
  const expected = structuredClone(additions);
  for (const item of prior.documents) {
    Object.assign(expected.documents.find(row => row.id === item.id), {
      thumbnail: item.thumbnail, preview: item.preview,
    });
    assert.deepEqual(manifest.documents.find(row => row.id === item.id), item);
  }
  assert.deepEqual(manifest, expected);
  assert.equal(manifest.documents.length, 177);
  assert.equal(new Set(manifest.documents.map(item => item.id)).size, 177);
  assert.equal(manifest.publishedCount, 177);
  assert.deepEqual(manifest.deliveryCounts, { hosted: 105, provider: 61, direct: 0, pending: 11 });
  for (const [status, count] of Object.entries(manifest.deliveryCounts)) {
    assert.equal(manifest.documents.filter(item => item.delivery === status).length, count);
  }
});

test('all 109 task records and the latest five completions survive without claiming the remaining 12', () => {
  const rows = read('docs/forms-expansion-109/results.json');
  const summary = read('docs/forms-expansion-109/summary.json');
  assert.deepEqual(rows, source(expansion, 'docs/forms-expansion-109/results.json'));
  assert.deepEqual(manifest.additionRequests, rows);
  assert.equal(rows.length, 109);
  assert.equal(summary.completed, 97);
  assert.equal(summary.unchecked, 12);
  for (const id of ['P0-10', 'P1-02', 'P1-03', 'P1-04', 'P1-05']) {
    assert.equal(rows.find(row => row.id === id).status, '확인 완료');
  }
});

test('every hosted expansion file has its recorded bytes and SHA-256, no provider links disguised as downloads', () => {
  const newRows = manifest.documents.filter(item => item.task_id);
  assert.equal(newRows.length, 103);
  const hosted = newRows.filter(item => item.delivery === 'hosted');
  assert.equal(hosted.length, 31);
  for (const item of newRows) {
    if (item.delivery !== 'hosted') {
      assert.equal(item.files.length, 0, item.id);
      assert.equal(item.thumbnail, null);
      continue;
    }
    assert.ok(item.files.length > 0, item.id);
    for (const file of item.files) {
      const bytes = readFileSync(new URL(`../public${file.path}`, import.meta.url));
      const evidence = manifest.additionRequests.flatMap(row => row.files)
        .find(row => row.local_url === file.path || row.path === `public${decodeURIComponent(file.path)}`);
      assert.ok(evidence?.sha256, `${item.id}: recorded file evidence`);
      assert.equal(bytes.length, file.bytes, item.id);
      assert.equal(hash(bytes), evidence.sha256, item.id);
    }
  }
});

test('production originals, all real preview PNGs and the 74-member ZIP remain byte-identical', () => {
  const entries = git('ls-tree', '-r', '-z', production, 'public/downloads').toString('utf8').split('\0').filter(Boolean);
  for (const entry of entries) {
    const [metadata, path] = entry.split('\t');
    if (!/\.(hwp|hwpx|docx?|xlsx?|pdf|png|jpe?g|zip)$/i.test(path)) continue;
    const objectId = metadata.split(' ')[2];
    assert.equal(hash(readFileSync(path)), hash(git('cat-file', 'blob', objectId)), path);
  }
});

test('non-forms service code is identical to the latest production calculator release', () => {
  const paths = git('diff', '--name-only', '-z', production, '--', 'app', 'components', 'lib', 'package.json', 'package-lock.json', 'next.config.ts', 'vercel.json').toString('utf8').split('\0').filter(Boolean);
  assert.deepEqual(paths.sort(), ['app/forms/AdditionalFormMetadata.tsx', 'app/forms/FormsLibrary.tsx']);
});
