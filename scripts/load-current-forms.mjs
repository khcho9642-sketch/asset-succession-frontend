import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const out = mkdtempSync(join(tmpdir(), 'forms-current-'));
process.on('exit', () => rmSync(out, { recursive: true, force: true }));
writeFileSync(join(out, 'package.json'), '{"type":"commonjs"}');
for (const name of ['catalog', 'individual-catalog', 'document-parts', 'preview', 'preview-index']) {
  writeFileSync(join(out, `${name}.js`), ts.transpileModule(readFileSync(`lib/forms/${name}.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
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
