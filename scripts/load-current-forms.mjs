import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const out = mkdtempSync(join(tmpdir(), 'forms-current-'));
process.on('exit', () => rmSync(out, { recursive: true, force: true }));
writeFileSync(join(out, 'package.json'), '{"type":"commonjs"}');
writeFileSync(join(out, 'current-editions.json'), readFileSync('lib/forms/current-editions.json'));
for (const name of ['catalog', 'individual-catalog', 'document-parts', 'preview', 'preview-index', 'library-editorial', 'bank-additions', 'final-review', 'source-followup', 'lookup-services', 'post-death-lookup-services', 'guides', 'purpose-guides']) {
  writeFileSync(join(out, `${name}.js`), ts.transpileModule(readFileSync(`lib/forms/${name}.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText);
}
const require = createRequire(import.meta.url);
export const catalog = require(join(out, 'catalog.js'));
export const individual = require(join(out, 'individual-catalog.js'));
export const partsApi = require(join(out, 'document-parts.js'));
export const previewApi = require(join(out, 'preview.js'));
export const indexApi = require(join(out, 'preview-index.js'));
export const read = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
export const manifest = read('public/downloads/official-forms/manifest.json');
export const parts = read('public/downloads/official-forms/document-parts.json');
export const sections = read('public/downloads/official-forms/document-sections.json');
export const documents = indexApi.mergeGeneratedPreviews(partsApi.expandDocumentParts(partsApi.expandDocumentSections(manifest.documents, sections), parts));
export const groups = read('public/downloads/official-forms/presentation-groups.json');
export const current = individual.buildIndividualCatalog(documents, groups);
export const editorial = require(join(out, 'library-editorial.js'));
export const guides = require(join(out, 'guides.js'));
export const publicDocuments = editorial.applyLibraryEditorial(documents);
export const publicCatalog = individual.buildIndividualCatalog(publicDocuments, groups);
export const banks = require(join(out, 'bank-additions.js'));
export const bankDocuments = banks.applyBankAdditions(publicDocuments);
export const bankCatalog = individual.buildIndividualCatalog(bankDocuments, groups);
export const finalReview = require(join(out, 'final-review.js'));
export const finalDocuments = finalReview.applyFinalReview(bankDocuments);
export const finalCatalog = individual.buildIndividualCatalog(finalDocuments, groups);
