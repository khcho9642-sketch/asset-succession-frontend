import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { finalDocuments, groups, previewApi, catalog, individual, guides, editorial, finalReview } from './load-current-forms.mjs';

const require = createRequire(import.meta.url);
const module = { exports: {} };
const compiled = ts.transpileModule(readFileSync('app/forms/DocumentPreview.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const classNames = new Proxy({}, { get: (_, key) => key === '__esModule' ? false : String(key) });
const componentRequire = name => name === '@/lib/forms/preview' ? previewApi
  : name.endsWith('.module.css') ? classNames : require(name);
new Function('require', 'module', 'exports', compiled)(componentRequire, module, module.exports);
const render = item => renderToStaticMarkup(createElement(module.exports.PreviewThumbnail, { item }));
const iconModule = { exports: {} };
const iconCompiled = ts.transpileModule(readFileSync('app/forms/ResourceIcon.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
new Function('require', 'module', 'exports', iconCompiled)(componentRequire, iconModule, iconModule.exports);

// Render the real parent component at a URL snapshot. Child previews and guide
// content have separate suites; markers keep these tests focused on navigation,
// card actions and the order of the parent's detail sections.
let librarySearch = '';
const usage = JSON.parse(readFileSync('lib/forms/resource-usage.json', 'utf8'));
const archiveModule = { exports: {} };
new Function('require', 'module', 'exports', ts.transpileModule(readFileSync('lib/forms/archive.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(require, archiveModule, archiveModule.exports);
const libraryModule = { exports: {} };
const libraryRequire = name => {
  const modules = {
    react: { ...React, useSyncExternalStore: () => librarySearch },
    'next/link': ({ children, ...props }) => createElement('a', props, children),
    '@/lib/forms/catalog': catalog,
    '@/lib/forms/individual-catalog': individual,
    '@/lib/forms/preview': previewApi,
    '@/lib/forms/guides': guides,
    '@/lib/forms/resource-usage': { getResourceUsage: id => usage.documents[id] },
    '@/lib/forms/library-editorial': editorial,
    '@/lib/forms/final-review': finalReview,
    '@/lib/forms/archive': archiveModule.exports,
    './DocumentPreview': { ...module.exports, DocumentPreview: ({ item }) => createElement('section', { 'data-detail-preview': item.id }) },
    './ResourceIcon': iconModule.exports,
    './guides/LookupServices': { LookupServices: ({ timing }) => createElement('section', { 'data-lookup-timing': timing }) },
    './GuideEntrances': { GuideEntrances: () => createElement('section', { 'data-situation-entrances': true }) },
  };
  return Object.hasOwn(modules, name) ? modules[name] : name.endsWith('.module.css') ? classNames : require(name);
};
new Function('require', 'module', 'exports', ts.transpileModule(readFileSync('app/forms/FormsLibrary.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText)(libraryRequire, libraryModule, libraryModule.exports);
const renderLibrary = (search = '', documents = finalDocuments) => {
  librarySearch = search;
  return renderToStaticMarkup(createElement(libraryModule.exports.FormsLibrary, { documents, groups }));
};
const interactionModule = { exports: {} };
const interactionReact = {
  ...React,
  useMemo: factory => factory(),
  useRef: value => ({ current: value }),
  useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useSyncExternalStore: () => librarySearch,
};
new Function('require', 'module', 'exports', ts.transpileModule(readFileSync('app/forms/FormsLibrary.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText)(name => name === 'react' ? interactionReact : libraryRequire(name), interactionModule, interactionModule.exports);
const elements = node => Array.isArray(node) ? node.flatMap(elements)
  : node && typeof node === 'object' && node.props ? [node, ...elements(node.props.children)] : [];

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

test('cards keep a short description while detail preserves the complete explanation', () => {
  const source = readFileSync('app/forms/FormsLibrary.tsx', 'utf8');
  assert.match(source, /<\/div>\s*<p className=\{styles.cardDescription\}>/);
  const css = readFileSync('app/forms/FormsLibrary.module.css', 'utf8');
  assert.match(css, /\.cardDescription\s*\{[^}]*-webkit-line-clamp:\s*2/);
  for (const rule of css.matchAll(/\.detailDescription\s*\{([^}]+)\}/g)) {
    assert.doesNotMatch(rule[1], /line-clamp|overflow\s*:\s*hidden/);
  }
  const item = finalDocuments.find(document => document.id === 'BP-G-01');
  const html = renderLibrary('?resource=BP-G-01');
  assert.ok(html.includes(`<p class="detailDescription">${item.description}</p>`));
});

test('situation home hides the long catalog while complete and legacy filtered URLs expose it', () => {
  const home = renderLibrary();
  assert.match(home, /data-situation-entrances="true"/);
  assert.doesNotMatch(home, /data-card-kind="document"/);
  assert.match(home, /href="\/forms\?view=all"/);
  for (const query of ['?view=all', '?q=상속', '?purpose=gift', '?resource=BP-I-01']) {
    const html = renderLibrary(query);
    assert.doesNotMatch(html, /data-situation-entrances="true"/, query);
    assert.match(html, /data-card-kind="document"/, query);
  }
});

test('removing the last condition from a legacy bookmark keeps the complete catalog open', () => {
  const originalWindow = globalThis.window;
  try {
    for (const [query, label] of [['?purpose=gift', '증여 조건 해제'], ['?stage=S3', '단계 조건 해제']]) {
      librarySearch = query;
      let navigated = null;
      globalThis.window = {
        location: { pathname: '/forms', search: query },
        history: { pushState: (_state, _title, href) => { navigated = href; }, replaceState: (_state, _title, href) => { navigated = href; } },
        dispatchEvent: () => true,
      };
      const tree = interactionModule.exports.FormsLibrary({ documents: finalDocuments, groups });
      const remove = elements(tree).find(node => node.type === 'button' && node.props['aria-label'] === label);
      assert.ok(remove, label);
      remove.props.onClick();
      assert.ok(navigated, query);
      const next = catalog.parseCatalogFilters(new URL(navigated, 'https://asset360.intellic.co.kr').search);
      assert.equal(catalog.hasFilters(next), false, query);
      assert.equal(catalog.showsCatalog(next), true, query);
      assert.equal(next.view, 'all', query);
    }
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

const iconCases = [
  ['LIB-ADD-04', 'building'],
  ['SVC-REGISTRY', 'building'],
  ['BANK-ADD-04', 'transaction'],
  ['BANK-ADD-02', 'balance'],
  ['BANK-ADD-03', 'debt'],
  ['BANK-ADD-05', 'transfer'],
  ['P0-06', 'family'],
  ['P2-09', 'tax'],
];
for (const [id, kind] of iconCases) {
  test(`${id}: content icon is ${kind}, without modifying the resource`, () => {
    const item = finalDocuments.find(doc => doc.id === id);
    assert.ok(item);
    const before = JSON.stringify(item);
    assert.equal(iconModule.exports.resourceIconKind(item.title), kind);
    const html = renderToStaticMarkup(createElement(iconModule.exports.ResourceIcon, { title: item.title }));
    assert.match(html, new RegExp(`data-resource-icon="${kind}"`));
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, /width="36" height="36"/);
    assert.ok([...html.matchAll(/stroke-width="([^"]+)"/g)].every(match => match[1] === '1.8'));
    assert.doesNotMatch(html, /<img/);
    assert.equal(JSON.stringify(item), before);
  });
}

test('icons cover tax guidance, preserve family guardianship and use a neutral fallback', () => {
  assert.equal(iconModule.exports.resourceIconKind('세금 신고·납부 안내'), 'tax');
  assert.equal(iconModule.exports.resourceIconKind('후견등기사항증명서 발급 안내'), 'family');
  assert.equal(iconModule.exports.resourceIconKind('새로운 절차 안내'), 'guide');
});

test('each resource category has one card CTA leading to its internal detail', () => {
  for (const [id, label] of [['BP-I-01', '서식 받기'], ['SVC-ACCOUNTS', '발급 방법 보기'], ['P1-14', '작성 안내 보기']]) {
    const item = finalDocuments.find(document => document.id === id);
    assert.ok(item, id);
    const html = renderLibrary('?view=all', [item]);
    const card = html.match(/<article[^>]*data-form-id="[^"]+"[\s\S]*?<\/article>/)?.[0];
    assert.ok(card, id);
    const actions = card.match(/<div class="cardActions">([\s\S]*?)<\/div>/)?.[1];
    assert.ok(actions, id);
    assert.equal([...actions.matchAll(/<a\s/g)].length, 1, id);
    assert.ok(actions.includes(`href="/forms?resource=${id}"`), id);
    assert.ok(actions.includes(`<span>${label}</span>`), id);
    assert.ok(actions.includes(`aria-label="${item.title} ${label}"`), id);
    assert.doesNotMatch(actions, /target="_blank"|download=|data-form-download|data-file-download/, id);
  }
});

test('detail puts user guidance before original downloads, preview and source metadata', () => {
  const html = renderLibrary('?resource=BP-G-01');
  const detail = html.slice(html.indexOf('<dialog'));
  const positions = ['자료 사용 안내', 'id="detail-downloads"', 'data-detail-preview="BP-G-01"', '출처와 확인일', '상세 검토기록']
    .map(marker => {
      const index = detail.indexOf(marker);
      assert.ok(index >= 0, marker);
      return index;
    });
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  const selected = finalDocuments.find(item => item.id === 'BP-G-01');
  for (const file of catalog.availableFiles(selected)) assert.ok(detail.includes(`href="${file.path}"`), file.path);
  assert.match(detail, /data-file-download="true"/);
  assert.match(detail, /target="_blank"[^>]*rel="noopener noreferrer"[^>]*>출처 게시물 확인/);
});

test('provider-only detail preserves its external action without fabricating a file download', () => {
  const item = finalDocuments.find(document => document.id === 'P1-14');
  assert.equal(catalog.availableFiles(item).length, 0, 'Fixture has a provider page, not an attachment');
  const html = renderLibrary('?resource=P1-14');
  const downloads = html.match(/<section[^>]*id="detail-downloads"[\s\S]*?<\/section>/)?.[0];
  assert.ok(downloads);
  assert.match(downloads, /target="_blank"/);
  assert.match(downloads, /aria-label="[^"]+\(새 창\)"/);
  assert.doesNotMatch(downloads, /data-file-download|data-form-download|download="/);
});

test('card visual stays square, and the full description precedes an aligned footer', () => {
  const css = readFileSync('app/forms/FormsLibrary.module.css', 'utf8');
  assert.match(css, /\.visual\s*\{[^}]*width: 80px; height: 80px;/);
  assert.match(css, /\.cardFooter\[data-single-action\][^}]*grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.doesNotMatch(css, /\.cardCopy h3\s*\{[^}]*min-height/);
  const source = readFileSync('app/forms/FormsLibrary.tsx', 'utf8');
  assert.ok(source.indexOf('styles.cardDescription') < source.indexOf('styles.cardFooter'));
});
