import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { finalDocuments, previewApi } from './load-current-forms.mjs';

const require = createRequire(import.meta.url);
const module = { exports: {} };
const compiled = ts.transpileModule(readFileSync('app/forms/DocumentPreview.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const componentRequire = name => name === '@/lib/forms/preview' ? previewApi
  : name.endsWith('.module.css') ? { cardState: 'cardState', thumbnail: 'thumbnail' } : require(name);
new Function('require', 'module', 'exports', compiled)(componentRequire, module, module.exports);
const render = item => renderToStaticMarkup(createElement(module.exports.PreviewThumbnail, { item }));

for (const id of ['P0-08', 'P3-05']) {
  test(`${id}: provider-only thumbnail uses an icon and one short label`, () => {
    const item = finalDocuments.find(doc => doc.id === id);
    assert.ok(item);
    assert.equal(previewApi.resolvePreview(item).kind, 'provider');
    const html = render(item);
    assert.match(html, /data-preview-state="provider"/);
    assert.match(html, /<svg[^>]*aria-hidden="true"/);
    assert.match(html, /<span>제공처 서식<\/span>/);
    assert.doesNotMatch(html, /<img|이용 방법과 제공처 확인|제공처 이용 안내/);
  });
}

test('BP-G-01: the real original preview remains an image', () => {
  const item = finalDocuments.find(doc => doc.id === 'BP-G-01');
  const preview = previewApi.resolvePreview(item);
  assert.equal(preview.kind, 'image');
  assert.ok(existsSync(`public${decodeURIComponent(preview.originalPath)}`));
  assert.ok(existsSync(`public${decodeURIComponent(preview.thumbnailPath || preview.imagePath)}`));
  const html = render(item);
  assert.ok(html.includes(`src="${preview.thumbnailPath || preview.imagePath}"`));
  assert.match(html, /원본 서식 미리보기/);
  assert.doesNotMatch(html, /data-preview-state="provider"/);
});

test('PDF-only files do not receive a fabricated thumbnail', () => {
  const html = render({ id: 'pdf-only', title: 'PDF', files: [{ path: '/downloads/official-forms/test.pdf', format: 'PDF', role: 'original', delivery: 'hosted' }] });
  assert.match(html, /data-preview-state="pdf"/);
  assert.match(html, /PDF 보기/);
  assert.doesNotMatch(html, /<img/);
});

test('an unavailable local original is not presented as provider-only', () => {
  const html = render({ id: 'unavailable', title: 'HWP', sourceUrl: 'https://example.org/', files: [{ path: '/downloads/official-forms/test.hwp', format: 'HWP', role: 'original', delivery: 'hosted' }] });
  assert.match(html, /data-preview-state="pending"/);
  assert.match(html, /원본 확인/);
  assert.doesNotMatch(html, /<img|제공처 서식/);
});

test('card descriptions are outside the thumbnail row and are not line-clamped', () => {
  const source = readFileSync('app/forms/FormsLibrary.tsx', 'utf8');
  assert.match(source, /<\/div>\s*<p className=\{styles.cardDescription\}>/);
  const css = readFileSync('app/forms/FormsLibrary.module.css', 'utf8');
  for (const rule of css.matchAll(/\.cardDescription\s*\{([^}]+)\}/g)) {
    assert.doesNotMatch(rule[1], /line-clamp|overflow\s*:\s*hidden/);
  }
});

test('internal instructions and external provider actions have distinct accessible names', () => {
  const source = readFileSync('app/forms/FormsLibrary.tsx', 'utf8');
  assert.match(source, /\$\{detailLabel\} \(사이트 내\)/);
  assert.match(source, /제공처 사이트를 새 창에서 엽니다/);
  assert.match(source, /preview\.kind === "provider" \? <Info/);
});
