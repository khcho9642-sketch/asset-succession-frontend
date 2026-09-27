import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { finalDocuments, catalog, previewApi } from './load-current-forms.mjs';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const earlier = read('docs/forms-download-followup-20260927/sources.json').records;
const { records } = read('docs/forms-remaining11-20260927/sources.json');
const byId = new Map(finalDocuments.map(item => [item.id, item]));

test('follow-up covers exactly the previously unresolved eleven, not already completed items', () => {
  assert.deepEqual(new Set(Object.keys(records)), new Set(Object.keys(earlier).filter(id => earlier[id].status === 'unresolved')));
  assert.equal(Object.values(records).filter(row => row.status === 'connected').length, 8);
  assert.deepEqual(Object.keys(records).filter(id => records[id].status === 'unresolved').sort(), ['P1-19','P8-02','P8-10']);
  assert.equal(Object.values(records).flatMap(row => row.files).length, 16);
});

for (const [id, row] of Object.entries(records)) test(`${id}: browser evidence, limitations and authentic originals remain linked`, () => {
  const item = byId.get(id);
  assert.ok(row.attempts.length);
  for (const attempt of row.attempts) {
    assert.equal(attempt.method, 'normal-browser');
    assert.match(attempt.url, /^https:\/\//);
    assert.ok(attempt.route && attempt.result);
  }
  assert.equal(item.sourceReview.evidence, 'docs/forms-remaining11-20260927/sources.json');
  assert.equal(item.reviewSummary.status, 'partial');
  assert.equal(item.reviewSummary.limitation, row.note);
  assert.deepEqual(catalog.availableFiles(item).map(file => file.path), row.files.map(file => file.path));
  for (const file of row.files.filter(file => file.path.startsWith('/'))) {
    const bytes = readFileSync('public' + file.path);
    assert.equal(bytes.length, file.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
  }
  if (row.status === 'unresolved') {
    assert.ok(row.attempts.length >= 2);
    assert.match(row.note, /미확보/);
    assert.equal(previewApi.resolvePreview(item).kind, 'provider');
    assert.equal(item.providerInstructions.status, 'original_not_acquired');
  }
});

test('special limited acceptance points to the actual combined original with the special section', () => {
  const item = byId.get('P0-10');
  assert.match(item.files[0].name, /특별한정승인 기재란 포함/);
  assert.match(item.reviewSummary.limitation, /2쪽/);
  assert.equal(item.preview.pageCount, 10);
});

test('registration variants and court attachment mismatch are disclosed, not silently substituted', () => {
  for (const [id, word] of [['P1-02','구분건물'],['P1-10','06-2'],['P1-11','07-2'],['P1-18','특별연고']])
    assert.ok(byId.get(id).reviewSummary.limitation.includes(word));
  const bankruptcy = byId.get('P8-04');
  assert.equal(bankruptcy.files.length, 4);
  assert.equal(bankruptcy.files.filter(file => file.name.includes('(상속인)')).length, 2);
  assert.equal(bankruptcy.files.filter(file => file.name.includes('(상속인외)')).length, 2);
});

test('workers compensation uses the working official alternative, not a permission-error download', () => {
  const item = byId.get('P7-04');
  assert.equal(item.files.length, 1);
  assert.equal(item.files[0].format, 'HWP');
  assert.equal(item.files[0].bytes, 80384);
  assert.match(item.files[0].path, /^https:\/\/www.law.go.kr\/LSW\/flDownload.do/);
  assert.equal(item.externalPreviews[0].url, 'https://www.comwel.or.kr/_custom/kcom/_common/board/docView.jsp?attach_no=2559931');
  assert.match(item.reviewSummary.limitation, /권한 오류/);
});

test('teachers pension PDF is not advertised as an acquired HWP or a different pension scheme', () => {
  const item = byId.get('P7-02');
  assert.deepEqual(item.files.map(file => file.format), ['PDF']);
  assert.equal(item.files[0].bytes, 142293);
  assert.match(item.license, /제1유형/);
  assert.match(item.reviewSummary.limitation, /재직 중 사망/);
});
