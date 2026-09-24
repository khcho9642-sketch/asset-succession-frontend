import { mkdirSync, writeFileSync } from 'node:fs';
import { banks, bankDocuments, bankCatalog, publicCatalog, individual } from './load-current-forms.mjs';
const path = 'docs/forms-bank-additions-20260924';
mkdirSync(path, { recursive: true });
const count = index => ({ cards: index.cards.length, uniqueHostedFiles: new Set(index.cards.flatMap(c => c.document.files.filter(f => f.delivery === 'hosted').map(f => f.path))).size, uniqueExternalFiles: new Set(index.cards.flatMap(c => c.document.files.filter(f => f.delivery === 'official_link').map(f => f.path))).size });
const enrichmentIds = ['P6-01', 'P6-06', 'P0-02'];
const relationIds = [...new Set(banks.BANK_DOCUMENTS.flatMap(d => d.resource.relations.map(r => r.target_resource_id)).concat('P6-02'))];
const ids = [...new Set([...banks.BANK_DOCUMENTS.map(d => d.id), ...enrichmentIds, ...relationIds])];
const data = { baseline: '2586b178efddda936e119bcfe2c6391c3483995a', before: count(publicCatalog), after: count(bankCatalog), sources: banks.BANK_SOURCES,
  items: ids.map(id => { const d = bankDocuments.find(d => d.id === id); return { id, title: d.title, change: id.startsWith('BANK-ADD-') ? 'new' : enrichmentIds.includes(id) ? 'enriched' : 'relation', visibility: d.resource.presentation.visibility, use: d.useCategory, facets: d.resource.facets, stage: d.resource.stage_ids, related: individual.relatedDocuments(bankCatalog, id).map(d => d.id), source: d.sourceUrl, checkedOn: d.checkedOn, publishedOn: d.publishedOn || null, revisedAt: d.revised_at || null, verification: d.verification, providerRoutes: d.providerRoutes || [], files: d.files }; }),
  assetMapping: { 'BANK-ADD-01': 'cash_deposit', 'BANK-ADD-02': 'cash_deposit', 'BANK-ADD-03': 'other (existing enum has no debt; debt task remains explicit in title and aliases)', 'BANK-ADD-04': 'other (existing enum has no debt)', 'BANK-ADD-05': 'cash_deposit', 'BANK-ADD-06': 'insurance_pension' },
  resolvedCandidates: [{ id: 'BANK-CAND-01', publicId: 'BANK-ADD-07', checkedOn: '2026-09-24', result: '현재 KB퇴직연금 목록과 DOC 원본·제목·개정월·퇴직연금 동의/위임 범위 확인. 기관 원본 직접 연결.' }],
  pending: [
    { id: 'BANK-CAND-02', title: 'KB 특정금전신탁 상속인 지정 계약', source: 'https://obank.kbstar.com/quics?page=C019998', public: false, reason: '현행 약관 목록 68386과 설명서 목록 68387의 실제 첨부가 모두 동일한 4쪽 상품설명서였다(GET/POST 대조). 2025-06-27 공지의 2쪽 계약서와 불일치하여 현행 계약서로 공개하지 않음. KB-VERIFICATION.md 참조.' },
  ],
  inspectedOriginals: [
    { id: 'BANK-ADD-01', bytes: 155821, pages: 2, sha256: '23156d45245bddf13d651d7c32d4a8cebbcefb05b1ff4658f9a6b170eed7a57e', checkedOn: banks.BANK_CHECKED_ON, rehosted: false },
    { id: 'BANK-ADD-06', bytes: 176443, pages: 2, sha256: '7bfc16f79ec8152fe334bedf47937c54da6c448fbd3396da3ec09c12747d2110', checkedOn: banks.BANK_CHECKED_ON, rehosted: false },
    { id: 'BANK-ADD-07', bytes: 105984, format: 'DOC', formNo: '06206033', revisedAt: '2022-03', sha256: 'd9fa02f49b950d8d54b7405ab845ea12fec2684b30efe4ebca20dd1adc578833', checkedOn: banks.BANK_CHECKED_ON, rehosted: false },
  ],
};
writeFileSync(`${path}/change-ledger.json`, JSON.stringify(data, null, 2) + '\n');
console.log(JSON.stringify({ before: data.before, after: data.after, new: banks.BANK_DOCUMENTS.length, enriched: 3, pending: data.pending.length }, null, 2));
