import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function reviewFlags(record, today) {
  return { missingDate: !record.reviewPolicy.lastReviewedOn, due: Boolean(record.reviewPolicy.nextReviewDue && record.reviewPolicy.nextReviewDue <= today) };
}
export function compareObservation(previous, current) {
  if (!current.ok) return 'access_failure';
  if (!previous?.sha256) return 'baseline_needed';
  return previous.sha256 === current.sha256 ? 'unchanged_bytes_not_legal_review' : 'source_change_needs_review';
}
export async function observe(url, fetcher = fetch) {
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'asset-succession-source-check/1.0' } });
    if (!response.ok) return { ok: false, status: response.status, reason: [401, 403].includes(response.status) ? 'authentication_or_blocking' : 'http_error' };
    const bytes = Buffer.from(await response.arrayBuffer());
    return { ok: true, status: response.status, sha256: sha256(bytes), bytes: bytes.length, contentType: response.headers.get('content-type'), finalUrl: response.url };
  } catch (error) { return { ok: false, reason: 'network_or_timeout', detail: error.message }; }
}
export async function run(args) {
  const ledger = JSON.parse(readFileSync('public/downloads/official-forms/review-ledger.json', 'utf8'));
  const get = key => args.find(x => x.startsWith(key + '='))?.slice(key.length + 1);
  const today = get('--date') || new Date().toISOString().slice(0, 10);
  const ids = get('--ids')?.split(',');
  const previous = get('--previous') && existsSync(get('--previous')) ? JSON.parse(readFileSync(get('--previous'), 'utf8')) : { observations: [] };
  const records = ledger.records.filter(row => !ids || ids.includes(row.id));
  const urls = new Set(records.flatMap(row => [row.sourceUrl, row.currentness?.sourceUrl, row.providerInstructions?.url, ...row.files.map(f => f.sourceUrl || (f.delivery !== 'hosted' ? f.path : null))]).filter(url => /^https:\/\//.test(url || '')));
  const observations = [];
  if (args.includes('--network')) for (const url of urls) {
    const result = await observe(url);
    const status = compareObservation(previous.observations.find(x => x.url === url), result);
    observations.push({ url, checkedAt: new Date().toISOString(), ...result, comparison: status });
    console.log(`${status}: ${url}`);
  }
  const report = { checkedOn: today, scope: 'Technical access/hash check only. Review dates and original files are never changed.',
    queue: records.map(row => ({ id: row.id, ...reviewFlags(row, today) })).filter(row => row.missingDate || row.due), observations };
  writeFileSync(get('--output') || 'forms-recheck-results.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ records: records.length, queue: report.queue.length, observations: observations.length }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await run(process.argv.slice(2));
