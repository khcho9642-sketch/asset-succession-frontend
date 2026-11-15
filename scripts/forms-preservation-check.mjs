import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Read-only acceptance check for the library navigation change. The dated
// register is an independent baseline; never regenerate it during this check.
// node scripts/forms-preservation-check.mjs --baseline=/path/materials-register.json
const BASELINE_COMMIT = 'e7f7adafdf1e8ba6b32450f9adfd42be814b4420';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argument = process.argv.slice(2);
assert.ok(argument.every(value => value.startsWith('--baseline=')), 'Only --baseline=<file> is supported');
assert.ok(argument.length <= 1, 'Specify at most one baseline');
const baselinePath = path.resolve(argument[0]?.slice('--baseline='.length)
  || path.join(repoRoot, '../../outputs/materials-register-20261115/materials-register.json'));
process.chdir(repoRoot);

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8').replace(/^\uFEFF/, ''));
const {
  finalDocuments, finalCatalog, catalog, individual, manifest, parts, sections, groups,
} = await import('./load-current-forms.mjs');
const checks = [];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.parse(JSON.stringify(value));
const sorted = values => [...values].sort();
const git = args => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const splitNames = text => text.split('\0').filter(Boolean);
const expectedDocuments = baseline.sourceSnapshots.finalDocuments;
const expectedById = new Map(expectedDocuments.map(item => [item.id, item]));
const currentById = new Map(finalDocuments.map(item => [item.id, item]));
const siteFiles = baseline.files.filter(file => file.kind === '사이트 파일');

function check(name, run) {
  try {
    const detail = run();
    checks.push({ name, passed: true, ...(detail === undefined ? {} : { detail }) });
  } catch (error) {
    checks.push({ name, passed: false, error: String(error?.message || error).slice(0, 2400) });
  }
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    assert.ok(!entry.isSymbolicLink(), `Unexpected material symlink: ${filename}`);
    return entry.isDirectory() ? walk(filename) : [filename];
  });
}

check('Independent register identifies the approved baseline', () => {
  assert.equal(baseline.schemaVersion, 1);
  assert.equal(baseline.gitCommit, BASELINE_COMMIT);
  for (const [key, count] of Object.entries({ current: 220, public: 195, archived: 9, excluded: 16, siteFiles: 458 })) {
    assert.equal(baseline.counts[key], count, `baseline count ${key}`);
  }
  assert.equal(expectedDocuments.length, 220);
  assert.equal(siteFiles.length, 458);
});

check('All 220 resource IDs and their complete source records survive', () => {
  assert.equal(currentById.size, finalDocuments.length, 'Duplicate current resource ID');
  assert.deepEqual(sorted(currentById.keys()), sorted(expectedById.keys()));
  for (const [id, item] of currentById) assert.deepEqual(json(item), expectedById.get(id), `Source record changed: ${id}`);
  return { records: finalDocuments.length };
});

check('Public, archived and excluded memberships remain exactly 195/9/16', () => {
  const publicIds = sorted(finalCatalog.cards.map(card => card.id));
  assert.deepEqual(publicIds, sorted(baseline.records.filter(record => record.status === '공개').map(record => record.id)));
  assert.equal(publicIds.length, 195);
  for (const [visibility, label, count] of [['archived', '보관', 9], ['excluded', '제외', 16]]) {
    const actual = sorted(finalDocuments.filter(item => item.resource?.presentation.visibility === visibility).map(item => item.id));
    assert.equal(actual.length, count, visibility);
    assert.deepEqual(actual, sorted(baseline.records.filter(record => record.status === label).map(record => record.id)), visibility);
    for (const id of actual) assert.ok(!publicIds.includes(id), `${visibility} resource exposed: ${id}`);
  }
});

check('Legacy resource aliases and direct resource links preserve their targets', () => {
  const aliases = Object.fromEntries(baseline.records.flatMap(record => record.aliases.map(alias => [alias, record.id])));
  assert.equal(Object.keys(aliases).length, 6);
  assert.deepEqual(catalog.RESOURCE_ALIASES, aliases);
  for (const [alias, target] of Object.entries(aliases)) {
    assert.equal(catalog.canonicalResourceId(alias), target, alias);
    assert.equal(catalog.parseCatalogFilters(`?resource=${encodeURIComponent(alias)}`).resource, target, alias);
    assert.ok(currentById.has(target), `Missing alias target: ${target}`);
  }
  for (const id of currentById.keys()) {
    const url = new URL(catalog.resourceUrl(id), 'https://asset360.intellic.co.kr');
    assert.equal(url.pathname, '/forms');
    assert.equal(url.searchParams.get('resource'), catalog.canonicalResourceId(id), id);
  }
});

check('Original bundles, page ranges, split files and historical group links remain intact', () => {
  assert.deepEqual(manifest, baseline.sourceSnapshots.manifest, 'Original manifest');
  assert.deepEqual(parts, baseline.sourceSnapshots.parts, 'Document parts');
  assert.deepEqual(sections, baseline.sourceSnapshots.sections, 'Document sections');
  assert.deepEqual(groups, baseline.sourceSnapshots.groups, 'Presentation groups');
  const oldIndex = individual.buildIndividualCatalog(expectedDocuments, baseline.sourceSnapshots.groups);
  for (const group of groups) {
    assert.deepEqual(sorted(individual.legacyGroupDocuments(finalCatalog, group.id).map(item => item.id)),
      sorted(individual.legacyGroupDocuments(oldIndex, group.id).map(item => item.id)), group.id);
  }
  for (const item of finalDocuments) {
    assert.deepEqual(item.documentSection, expectedById.get(item.id).documentSection, item.id);
    assert.deepEqual(json(item.files), expectedById.get(item.id).files, item.id);
  }
});

check('Four current editions retain eight preferred attachments and all earlier files', () => {
  const currentEditions = finalDocuments.filter(item => item.currentEdition);
  assert.equal(currentEditions.length, 4);
  assert.equal(currentEditions.flatMap(item => item.currentEdition.files).length, 8);
  for (const item of currentEditions) {
    const expected = expectedById.get(item.id);
    assert.deepEqual(json(item.currentEdition), expected.currentEdition, `${item.id}: current edition`);
    assert.deepEqual(json(item.files), expected.files, `${item.id}: historical files`);
    const record = baseline.records.find(record => record.id === item.id);
    assert.deepEqual(catalog.availableFiles(item).map(file => file.path), record.displayAttachmentPaths, `${item.id}: download targets`);
  }
});

check('All 458 stored files retain their paths, sizes and SHA-256 hashes', () => {
  const filesRoot = path.join(repoRoot, 'public/downloads/official-forms');
  const location = filename => '/' + path.relative(path.join(repoRoot, 'public'), filename).split(path.sep).join('/').normalize('NFC');
  const actualFiles = walk(filesRoot);
  assert.equal(actualFiles.length, 458, 'Stored file count');
  assert.deepEqual(sorted(actualFiles.map(location)), sorted(siteFiles.map(file => file.location)), 'Stored paths');
  let bytes = 0;
  for (const file of siteFiles) {
    const filename = path.resolve(repoRoot, 'public', file.location.replace(/^\/+/, ''));
    assert.ok(filename.startsWith(filesRoot + path.sep), `Material outside expected directory: ${file.location}`);
    const content = readFileSync(filename);
    assert.equal(content.length, file.bytes, `Size: ${file.location}`);
    assert.equal(hash(content), file.sha256, `SHA-256: ${file.location}`);
    bytes += content.length;
  }
  assert.equal(bytes, baseline.counts.siteBytes);
  return { files: actualFiles.length, bytes };
});

check('Recorded catalog data source hashes remain unchanged', () => {
  for (const source of baseline.sourceFiles) {
    assert.equal(hash(readFileSync(path.join(repoRoot, source.path))), source.sha256, source.path);
  }
  return { sourceFiles: baseline.sourceFiles.length };
});

const changedPaths = splitNames(git(['diff', '--name-only', '-z', BASELINE_COMMIT, '--']));
const untrackedPaths = splitNames(git(['ls-files', '--others', '--exclude-standard', '-z']));
const changedOrAdded = [...new Set([...changedPaths, ...untrackedPaths])];
check('Git diff preserves public files and source data', () => {
  const sourcePaths = new Set(baseline.sourceFiles.map(source => source.path));
  const forbidden = changedOrAdded.filter(filename => filename.startsWith('public/')
    || /^lib\/forms\/.*\.json$/.test(filename) || sourcePaths.has(filename));
  assert.deepEqual(forbidden, [], `Data changes relative to ${BASELINE_COMMIT}`);
});

check('AI diagnosis and report implementation remain unchanged outside the approved contact flow', () => {
  // User-approved contact reception and the existing public deployment identity.
  // Keep this list exact: no other service/API/calculation path is exempted.
  const approvedServiceFiles = new Set([
    'app/api/deployment/route.ts',
    'app/consultation/page.tsx',
    'app/consultation/Consultation.module.css',
    'app/api/consultation/route.ts',
    'lib/consultation.ts',
  ]);
  const protectedFile = filename =>
    (filename.startsWith('app/') && !filename.startsWith('app/forms/') && !approvedServiceFiles.has(filename))
    || /^lib\/(chat|phase2b|tax-comparison)\//.test(filename)
    || /^lib\/(assessment|contact-links)\./.test(filename)
    || /^components\/(DiagnosisChat|StructuredChat|TaxComparison|Report|PersonalReport|PaperReport|PrintButton)/.test(filename)
    || filename === 'CHAT_GUIDE.md';
  const forbidden = changedOrAdded.filter(protectedFile);
  assert.deepEqual(forbidden, [], `Out-of-scope application changes relative to ${BASELINE_COMMIT}`);
});

check('Every existing application route still exists', () => {
  const routes = splitNames(git(['ls-tree', '-r', '--name-only', '-z', BASELINE_COMMIT, '--', 'app']))
    .filter(filename => /\/(page|route|layout|not-found|error|loading)\.[cm]?[jt]sx?$/.test(filename));
  for (const filename of routes) assert.ok(existsSync(path.join(repoRoot, filename)), `Missing route: ${filename}`);
  return { routes: routes.length };
});

const failures = checks.filter(item => !item.passed);
console.log(JSON.stringify({
  baselineCommit: BASELINE_COMMIT,
  baselinePath,
  passed: failures.length === 0,
  checks,
  changedPaths,
  note: 'Read-only preservation check. It does not validate external availability, legal currency, AI availability or browser usability.',
}, null, 2));
if (failures.length) process.exitCode = 1;
