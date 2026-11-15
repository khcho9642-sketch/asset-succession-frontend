import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catalog, finalCatalog, finalDocuments } from './load-current-forms.mjs';

const search = q => catalog.filterCatalog(finalCatalog, { ...catalog.emptyFilters(), q });
const ids = q => search(q).map(card => card.id);
const sortedIds = q => ids(q).sort();

test('inheritance-deposit wording, spacing and document suffixes find the same existing resources', () => {
  const expected = sortedIds('상속 예금');
  assert.ok(expected.includes('P6-01'));
  assert.ok(expected.includes('BANK-ADD-01'));
  assert.ok(!expected.includes('P6-03'), 'Insurance instructions are not deposit synonyms');
  for (const query of ['상속예금', '예금상속', '예금 상속', '예금상속 서류', '상속예금자료']) {
    assert.deepEqual(sortedIds(query), expected, query);
  }
});

test('cash-gift wording keeps the agreement and transfer evidence without unrelated property forms', () => {
  const expected = sortedIds('현금 증여');
  assert.deepEqual(expected, ['BANK-ADD-05', 'P3-05']);
  for (const query of ['현금증여', '증여현금', '증여 현금', '현금증여 서류', '증여현금자료']) {
    assert.deepEqual(sortedIds(query), expected, query);
  }
});

test('bank queries use only the providers actually named on each resource', () => {
  for (const query of ['국민은행 상속예금', 'KB 상속 예금', '국민은행상속예금서류']) {
    assert.deepEqual(ids(query), ['P6-01'], query);
  }
  for (const query of ['우리은행 잔액증명서', '우리은행 잔고증명서', '우리은행잔고증명서자료']) {
    assert.deepEqual(ids(query), ['BANK-ADD-02'], query);
  }
  assert.ok(ids('하나은행 상속 서류').includes('BANK-ADD-01'));
  assert.ok(ids('하나은행상속예금').includes('BANK-ADD-01'));
  for (const query of ['국민은행 잔액증명서', '신한은행 잔액증명서']) {
    assert.deepEqual(ids(query), [], 'Do not infer a bank route the resource does not provide: ' + query);
  }
});

test('generic document words do not block a meaningful query or turn unknown searches into all resources', () => {
  assert.deepEqual(sortedIds('가족관계증명서 자료'), sortedIds('가족관계증명서'));
  assert.deepEqual(sortedIds('상속 서류'), sortedIds('상속'));
  for (const query of ['블루베리자료', '현금 증여 블루베리 서류', '서류 자료 블루베리']) assert.deepEqual(ids(query), [], query);
  assert.ok(ids('서류 자료').length < finalCatalog.cards.length, 'No empty-terms match-all');
});

test('exact document titles, IDs and form numbers remain the first result', () => {
  assert.equal(ids('NTS-IG-11')[0], 'NTS-IG-11');
  assert.equal(ids('06206033')[0], 'BANK-ADD-07');
  assert.equal(ids('상속재산분할협의서')[0], 'BP-I-01');
  assert.deepEqual(ids('가족관계증명서'), ['P0-06']);
});

test('search overlays preserve source records and the 195 public resource boundary', () => {
  const before = JSON.stringify(finalDocuments);
  for (const query of ['예금상속', '상속 서류', '현금증여', '국민은행 상속예금', 'P8-02', 'SC-16']) {
    for (const card of search(query)) assert.ok(catalog.isPublicResource(card.document), card.id);
  }
  assert.equal(JSON.stringify(finalDocuments), before);
  assert.equal(finalDocuments.length, 220);
  assert.equal(finalCatalog.cards.length, 195);
  assert.ok(!ids('P8-02').includes('P8-02'));
  assert.ok(!ids('SC-16').includes('SC-16'));
});
