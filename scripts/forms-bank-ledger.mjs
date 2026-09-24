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
  pending: [
    { id: 'BANK-CAND-01', title: 'KB 대표상속인 지정합의서', source: 'https://okbfex.kbstar.com/quics?page=C112649', public: false, reason: '공식 목록의 대표상속인 지정합의서[공통] 제목 확인. 현재 실제 다운로드 파일·적용 범위는 미확정.' },
    { id: 'BANK-CAND-02', title: 'KB 특정금전신탁 상속인 지정 계약', source: 'https://img2.kbstar.com/obj/ocommon/beneficiary_designation.pdf', public: false, reason: '공식 PDF 2쪽의 존재 확인. 현재 약관 목록과 대조한 현행성은 미확인.' },
  ],
  inspectedOriginals: [
    { id: 'BANK-ADD-01', bytes: 155821, pages: 2, sha256: '23156d45245bddf13d651d7c32d4a8cebbcefb05b1ff4658f9a6b170eed7a57e', checkedOn: banks.BANK_CHECKED_ON, rehosted: false },
    { id: 'BANK-ADD-06', bytes: 176443, pages: 2, sha256: '7bfc16f79ec8152fe334bedf47937c54da6c448fbd3396da3ec09c12747d2110', checkedOn: banks.BANK_CHECKED_ON, rehosted: false },
  ],
};
writeFileSync(`${path}/change-ledger.json`, JSON.stringify(data, null, 2) + '\n');
console.log(JSON.stringify({ before: data.before, after: data.after, new: 6, enriched: 3, pending: 2 }, null, 2));
