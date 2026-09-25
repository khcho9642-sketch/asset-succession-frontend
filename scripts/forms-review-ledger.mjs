import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { finalDocuments, bankDocuments, finalReview, catalog } from './load-current-forms.mjs';

const filePath = path => 'public' + decodeURIComponent(path);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const date = value => /^\d{4}-\d{2}-\d{2}/.test(value || '') ? value.slice(0, 10) : null;
const due = (reviewed, months) => {
  if (!reviewed) return null;
  const value = new Date(reviewed + 'T00:00:00Z');
  value.setUTCMonth(value.getUTCMonth() + months);
  return value.toISOString().slice(0, 10);
};
const counts = documents => {
  const items = documents.filter(catalog.isPublicResource);
  return { public: items.length, form: items.filter(x => catalog.useCategory(x) === 'form').length,
    service: items.filter(x => catalog.useCategory(x) === 'service').length, guide: items.filter(x => catalog.useCategory(x) === 'guide').length,
    archived: documents.filter(x => x.resource?.presentation.visibility === 'archived').length,
    excluded: documents.filter(x => x.resource?.presentation.visibility === 'excluded').length,
    hosted: new Set(items.flatMap(x => catalog.availableFiles(x).filter(f => f.delivery === 'hosted').map(f => f.path))).size,
    external: new Set(items.flatMap(x => catalog.availableFiles(x).filter(f => f.delivery !== 'hosted').map(f => f.path))).size };
};
export const ledger = {
  schemaVersion: 1, scope: 'Final assembled public catalog only. One record per public ID. Not a legal approval register.',
  assembledOn: finalReview.FINAL_REVIEW_DATE,
  baselineCommit: '7ad8f2cd17b7e59faababc8d03bb721ac6f1936b',
  before: counts(bankDocuments), after: counts(finalDocuments),
  records: finalDocuments.filter(catalog.isPublicResource).map(item => {
    const priority = finalReview.PRIORITY_REVIEW[item.id];
    const collected = date(item.checkedOn || item.checked_at);
    const reviewed = item.sourceReview?.checkedOn || collected;
    const editorial = item.editorialReview;
    const basis = item.id.startsWith('BANK-') || item.providerRoutes ? 'docs/forms-bank-additions-20260924/change-ledger.json' : 'public/downloads/official-forms/manifest.json';
    return {
      id: item.id, title: item.title, sourceUrl: item.sourceUrl, sourceRecordId: item.sourceRecordId || item.id,
      authority: { kind: item.resource?.facets.authority, basis: item.authorityEvidence || 'Preserved classification; see individual source evidence. Not proof of currentness.' },
      files: catalog.availableFiles(item).map(file => ({ ...file, observedSha256: file.delivery === 'hosted' && existsSync(filePath(file.path)) ? hash(readFileSync(filePath(file.path))) : null })),
      providerInstructions: item.providerInstructions || null, providerRoutes: item.providerRoutes || [],
      source: { checkedOn: reviewed, collectedOn: collected, status: reviewed ? 'recorded_source_check' : 'check_date_missing', basis: item.sourceReview?.evidence || basis, scope: item.sourceReview?.scope || 'Original collection record' },
      editorial: { reviewedOn: editorial?.date || null, status: editorial?.status || 'unreviewed', basis: editorial?.note || 'No individual editorial record' },
      currentness: item.currentVersionReview || { reviewedOn: priority ? finalReview.FINAL_REVIEW_DATE : null, status: priority ? 'partial_review' : 'not_reverified',
        finding: priority?.finding || 'Existing source evidence preserved; no new current-version claim.',
        limitation: priority?.limitation || 'Currentness and individual legal applicability need separate confirmation.',
        decision: 'retain_pending_current_version_comparison' },
      applicability: { status: 'not_individually_verified', evidence: item.resource?.applicability || [], note: 'Classification and source checks are not individual legal approval.' },
      reviewPolicy: { intervalMonths: ['form', 'service'].includes(catalog.useCategory(item)) ? 3 : 6,
        lastReviewedOn: reviewed, nextReviewDue: due(reviewed, ['form', 'service'].includes(catalog.useCategory(item)) ? 3 : 6),
        scope: 'Source/current-version recheck queue; not expiry or automatic legal approval' },
      classificationCorrection: finalReview.CLASSIFICATION_CORRECTIONS[item.id] || null,
    };
  }),
};
const output = 'public/downloads/official-forms/review-ledger.json';
const serialized = JSON.stringify(ledger, null, 2) + '\n';
if (process.argv.includes('--write')) writeFileSync(output, serialized);
else if (readFileSync(output, 'utf8') !== serialized) throw new Error('Review ledger is stale. Run node scripts/forms-review-ledger.mjs --write');
console.log(JSON.stringify({ before: ledger.before, after: ledger.after, records: ledger.records.length }));
