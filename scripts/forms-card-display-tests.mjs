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
const loadTypeScript = (path, dependencies = {}) => {
  const loaded = { exports: {} };
  const output = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', output)(name => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name), loaded, loaded.exports);
  return loaded.exports;
};
const usageApi = loadTypeScript('lib/forms/resource-usage.ts', {
  './resource-usage.json': JSON.parse(readFileSync('lib/forms/resource-usage.json', 'utf8')),
});
const presentation = loadTypeScript('lib/forms/presentation.ts', { './catalog': catalog, './resource-usage': usageApi });
const guideNavigation = loadTypeScript('lib/forms/guide-navigation.ts');
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
    '@/lib/forms/resource-usage': usageApi,
    '@/lib/forms/presentation': presentation,
    '@/lib/forms/guide-navigation': guideNavigation,
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
const directText = node => React.Children.toArray(node.props.children).filter(child => typeof child === 'string').join('');
const renderedCardIds = html => [...html.matchAll(/data-form-id="([^"]+)"/g)].map(match => match[1]);
const interactionTree = (search = '') => {
  librarySearch = search;
  return interactionModule.exports.FormsLibrary({ documents: finalDocuments, groups });
};
const withBrowser = (search, callback) => {
  const originalWindow = globalThis.window;
  const changes = [];
  try {
    globalThis.window = {
      location: { pathname: '/forms', search, replace: href => changes.push({ method: 'location.replace', href }) },
      history: {
        pushState: (_state, _title, href) => changes.push({ method: 'pushState', href }),
        replaceState: (_state, _title, href) => changes.push({ method: 'replaceState', href }),
      },
      dispatchEvent: () => true,
      scrollY: 0,
    };
    callback(changes);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
};

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

test('cards keep a short description while detail preserves the complete explanation without repeating it', () => {
  const source = readFileSync('app/forms/FormsLibrary.tsx', 'utf8');
  assert.match(source, /<\/div>\s*<p className=\{styles.cardDescription\}>/);
  const css = readFileSync('app/forms/FormsLibrary.module.css', 'utf8');
  assert.match(css, /\.cardDescription\s*\{[^}]*-webkit-line-clamp:\s*2/);
  for (const rule of css.matchAll(/\.detailDescription\s*\{([^}]+)\}/g)) {
    assert.doesNotMatch(rule[1], /line-clamp|overflow\s*:\s*hidden/);
  }
  const item = finalDocuments.find(document => document.id === 'BP-G-01');
  const html = renderLibrary('?resource=BP-G-01');
  for (const text of [item.usage.who, item.usage.when]) {
    const paragraph = renderToStaticMarkup(createElement('dd', null, text));
    assert.ok(html.includes(paragraph));
    assert.equal(html.split(paragraph).length - 1, 1);
  }
  const distinct = { ...item, description: `추가 원문 설명: ${item.description}` };
  const distinctHtml = renderLibrary('?resource=BP-G-01', [distinct]);
  assert.ok(distinctHtml.includes(renderToStaticMarkup(createElement('p', { className: 'detailDescription' }, distinct.description))));
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

test('submitting the search form reads its actual input and preserves existing task filters', () => {
  const originalFormData = globalThis.FormData;
  try {
    for (const query of ['', '?view=all&guide=after-death&step=transfer--bank&kind=form&asset=cash_deposit&q=상속']) {
      withBrowser(query, changes => {
        const form = elements(interactionTree(query)).find(node => node.type === 'form' && node.props.action === '/forms');
        assert.ok(form);
        assert.equal(form.props.method, 'get');
        const fields = elements(form);
        assert.ok(fields.some(node => node.type === 'input' && node.props.type === 'hidden' && node.props.name === 'view' && node.props.value === 'all'));
        assert.ok(fields.some(node => node.type === 'input' && node.props.type === 'search' && node.props.name === 'q'));
        assert.ok(fields.some(node => node.type === 'button' && node.props.type === 'submit'));
        const submittedForm = { enteredQuery: '예금상속' };
        globalThis.FormData = class {
          constructor(element) { assert.equal(element, submittedForm); }
          get(name) { assert.equal(name, 'q'); return submittedForm.enteredQuery; }
        };
        let prevented = false;
        // Submit without firing onChange: the DOM may have text entered before hydration.
        form.props.onSubmit({ currentTarget: submittedForm, preventDefault() { prevented = true; } });
        assert.equal(prevented, true);
        assert.equal(changes.length, 1);
        const destination = new URL(changes[0].href, 'https://asset360.intellic.co.kr');
        assert.equal(destination.pathname, '/forms');
        const next = catalog.parseCatalogFilters(destination.search);
        const previous = catalog.parseCatalogFilters(query);
        assert.equal(next.q, submittedForm.enteredQuery);
        assert.equal(next.view, 'all');
        for (const key of ['guide', 'step', 'kind', 'asset']) assert.deepEqual(next[key], previous[key], key);
      });
    }
  } finally {
    if (originalFormData === undefined) delete globalThis.FormData;
    else globalThis.FormData = originalFormData;
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

const taskCases = [
  ['after-death', 'transfer', 'bank', ['BP-I-01', 'P6-01', 'BANK-ADD-01', 'P8-01', 'P1-15']],
  ['after-death', 'acceptance', '', ['P0-07', 'P0-08', 'P0-09', 'P0-10', 'P8-05']],
  ['before-death', 'funding', '', ['P2-09', 'NTS-IG-13', 'P2-07']],
];
for (const [guide, stepId, assetId, expected] of taskCases) {
  test(`${guide}/${stepId}${assetId ? `/${assetId}` : ''}: related catalog contains exactly the task's resources`, () => {
    const destination = new URL(guideNavigation.guideRelatedCatalogUrl(guide, { stepId, assetId }), 'https://asset360.intellic.co.kr');
    const html = renderLibrary(destination.search);
    assert.deepEqual(renderedCardIds(html).sort(), [...expected].sort());
    assert.match(html, new RegExp(`data-result-count="true">개별 자료 ${expected.length}개`));
    assert.ok(html.includes(`href="/forms/guides/${guide}#${guideNavigation.guideSelectionHash(stepId, assetId)}"`));
    assert.match(html, /aria-label="업무 조건 해제"/);
    assert.equal(destination.searchParams.has('timing'), false);
    assert.equal(destination.searchParams.has('purpose'), false);
    assert.equal(destination.searchParams.has('asset'), false);
  });
}

test('clearing a task returns the full 195-resource catalog and removes the task context', () => {
  const query = '?view=all&guide=after-death&step=transfer--bank';
  withBrowser(query, changes => {
    const clear = elements(interactionTree(query)).find(node => node.type === 'button' && node.props['aria-label'] === '업무 조건 해제');
    assert.ok(clear);
    clear.props.onClick();
    assert.equal(changes.length, 1);
    const destination = new URL(changes[0].href, 'https://asset360.intellic.co.kr');
    assert.equal(destination.searchParams.get('view'), 'all');
    assert.equal(destination.searchParams.has('guide'), false);
    assert.equal(destination.searchParams.has('step'), false);
    const html = renderLibrary(destination.search);
    assert.match(html, /data-result-count="true">개별 자료 195개 표시/);
    assert.doesNotMatch(html, /class="taskContext"|aria-label="업무 조건 해제"/);
  });
});

test('an empty task search can search the entire catalog without losing the entered words', () => {
  const query = '?view=all&guide=after-death&step=acceptance&q=증여계약서';
  assert.deepEqual(renderedCardIds(renderLibrary(query)), []);
  withBrowser(query, changes => {
    const action = elements(interactionTree(query)).find(node => node.type === 'button' && directText(node).includes('전체 자료에서 “'));
    assert.ok(action);
    action.props.onClick();
    const destination = new URL(changes[0].href, 'https://asset360.intellic.co.kr');
    assert.equal(destination.searchParams.get('q'), '증여계약서');
    assert.equal(destination.searchParams.get('view'), 'all');
    assert.equal(destination.searchParams.has('guide'), false);
    assert.equal(destination.searchParams.has('step'), false);
    assert.ok(renderedCardIds(renderLibrary(destination.search)).includes('BP-G-01'));
  });
  const missing = elements(interactionTree('?view=all&guide=after-death&step=acceptance&q=블루베리서식'));
  assert.ok(!missing.some(node => node.type === 'button' && directText(node).includes('전체 자료에서 “')));
});

test('opening and closing a task-list detail preserves the task list and asset selection', () => {
  const query = '?view=all&guide=after-death&step=transfer--bank';
  withBrowser(query, changes => {
    const card = elements(interactionTree(query)).find(node => node.type === 'article' && node.props['data-form-id'] === 'BP-I-01');
    const action = elements(card).find(node => node.type === 'a' && node.props.className === 'serviceAction');
    assert.ok(action);
    action.props.onClick({ button: 0, preventDefault() {}, currentTarget: {} });
    assert.equal(changes[0].method, 'pushState');
    const detail = new URL(changes[0].href, 'https://asset360.intellic.co.kr');
    assert.equal(detail.searchParams.get('resource'), 'BP-I-01');
    assert.equal(detail.searchParams.get('guide'), 'after-death');
    assert.equal(detail.searchParams.get('step'), 'transfer--bank');
    assert.equal(detail.searchParams.get('view'), 'all');
    window.location.search = detail.search;
    const tree = interactionTree(detail.search);
    const close = elements(tree).find(node => node.type === 'button' && node.props['aria-label'] === '자료 상세 닫기');
    close.props.onClick();
    assert.equal(changes[1].method, 'replaceState');
    const returned = new URL(changes[1].href, 'https://asset360.intellic.co.kr');
    assert.equal(returned.searchParams.has('resource'), false);
    assert.equal(returned.searchParams.get('guide'), 'after-death');
    assert.equal(returned.searchParams.get('step'), 'transfer--bank');
    assert.deepEqual(renderedCardIds(renderLibrary(returned.search)).sort(), [...taskCases[0][3]].sort());
  });
});

test('closing a direct-guide detail replaces the entry with the selected guide anchor', () => {
  const detail = new URL(guides.guideResourceUrl('BANK-ADD-01', 'after-death', 'transfer--bank'), 'https://asset360.intellic.co.kr');
  withBrowser(detail.search, changes => {
    const close = elements(interactionTree(detail.search)).find(node => node.type === 'button' && node.props['aria-label'] === '자료 상세 닫기');
    close.props.onClick();
    assert.deepEqual(changes, [{ method: 'location.replace', href: '/forms/guides/after-death#transfer--bank' }]);
  });
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
  for (const [id, label] of [['BP-I-01', '서식·파일 보기'], ['SVC-ACCOUNTS', '조회 방법 보기'], ['BANK-ADD-02', '발급 방법 보기'], ['P1-14', '이용 안내 보기']]) {
    const item = finalDocuments.find(document => document.id === id);
    assert.ok(item, id);
    const html = renderLibrary('?view=all', [item]);
    const card = html.match(/<article[^>]*data-form-id="[^"]+"[\s\S]*?<\/article>/)?.[0];
    assert.ok(card, id);
    const actions = card.match(/<div class="cardActions">([\s\S]*?)<\/div>/)?.[1];
    assert.ok(actions, id);
    assert.equal([...actions.matchAll(/<a\s/g)].length, 1, id);
    const href = actions.match(/<a[^>]*href="([^"]+)"/)?.[1]?.replaceAll('&amp;', '&');
    assert.ok(href, id);
    const destination = new URL(href, 'https://asset360.intellic.co.kr');
    assert.equal(destination.pathname, '/forms', id);
    assert.equal(destination.searchParams.get('resource'), id);
    assert.equal(destination.searchParams.get('view'), 'all');
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

for (const id of ['BP-G-01', 'BANK-ADD-01']) {
  test(`${id}: single-file footer opens the actual file with the correct delivery behavior`, () => {
    const item = finalDocuments.find(document => document.id === id);
    const files = catalog.availableFiles(item);
    assert.equal(files.length, 1);
    const footer = elements(interactionTree(`?resource=${id}`)).find(node => node.props.className === 'dialogFooter');
    const action = elements(footer).find(node => node.props['data-primary-download']);
    assert.equal(action?.type, 'a');
    assert.equal(action.props.href, files[0].path);
    assert.equal(action.props.download, files[0].delivery === 'hosted');
    assert.equal(action.props.target, files[0].delivery === 'hosted' ? undefined : '_blank');
    const html = renderLibrary(`?resource=${id}`);
    if (files[0].delivery === 'hosted') assert.match(html, /class="dialogPrimary"[^>]*download=""[^>]*data-primary-download="true"/);
    else assert.match(html, /class="dialogPrimary"[^>]*target="_blank"[^>]*data-primary-download="true"/);
  });
}

const clickFooterTarget = (query, expectedSelector, expectedLabel) => {
  const tree = interactionTree(query);
  const nodes = elements(tree);
  const dialog = nodes.find(node => node.type === 'dialog');
  const footer = nodes.find(node => node.props.className === 'dialogFooter');
  const action = elements(footer).find(node => node.props.className === 'dialogPrimary');
  assert.equal(action?.type, 'button');
  assert.ok(action.props.children.includes(expectedLabel));
  const calls = [];
  const picker = { open: false };
  dialog.props.ref.current = { querySelector: selector => {
    calls.push(['section', selector]);
    return {
      scrollIntoView: options => calls.push(['scroll', options]),
      querySelector: selector => {
        if (selector === 'details') return expectedSelector === '#detail-downloads' ? picker : null;
        calls.push(['focus-target', selector]); return { focus: () => calls.push(['focus']) };
      },
    };
  } };
  action.props.onClick();
  assert.deepEqual(calls, [['section', expectedSelector], ['scroll', { block: 'start' }], ['focus-target', 'summary, a[href]'], ['focus']]);
  if (expectedSelector === '#detail-downloads') assert.equal(picker.open, true);
};

test('multi-file footer focuses the file selector and keeps every available format', () => {
  const item = finalDocuments.find(document => document.id === 'SC-01');
  const files = catalog.availableFiles(item);
  assert.ok(files.length > 1);
  clickFooterTarget('?resource=SC-01', '#detail-downloads', '파일 형식 선택');
  const html = renderLibrary('?resource=SC-01');
  const section = html.match(/<section[^>]*id="detail-downloads"[\s\S]*?<\/section>/)?.[0];
  assert.ok(section);
  for (const file of files) assert.ok(section.includes(`href="${file.path.replaceAll('&', '&amp;')}"`), file.path);
  assert.doesNotMatch(html, /data-primary-download/);
});

for (const id of ['P6-01', 'BANK-ADD-02']) {
  test(`${id}: bank footer focuses institution routes and preserves their real destinations`, () => {
    const query = `?resource=${id}&guide=after-death&step=transfer--bank`;
    clickFooterTarget(query, '#detail-provider-routes', '은행별 신청 경로 보기');
    const nodes = elements(interactionTree(query));
    const routes = nodes.find(node => node.props.id === 'detail-provider-routes');
    assert.ok(routes);
    const links = elements(routes).filter(node => node.type === 'a');
    const item = finalDocuments.find(document => document.id === id);
    assert.equal(links.length, item.providerRoutes.length);
    for (const route of item.providerRoutes) {
      const link = links.find(node => node.props.href === route.url);
      assert.ok(link, route.url);
      assert.equal(link.props.target, '_blank');
      assert.equal(link.props.rel, 'noopener noreferrer');
      assert.ok(link.props['aria-label'].includes(route.provider));
    }
  });
}

test('stand-alone contracts show relevant usage instructions without changing source records', () => {
  for (const id of ['BP-I-01', 'BP-G-01']) {
    const item = finalDocuments.find(document => document.id === id);
    const before = JSON.stringify(item);
    assert.ok(item.usage.steps.some(step => step.includes('본 신고서와 해당 부표')));
    const html = renderLibrary(`?resource=${id}`);
    const guidance = html.match(/<section[^>]*class="usageGuide"[\s\S]*?<\/section>/)?.[0];
    assert.ok(guidance, id);
    assert.doesNotMatch(guidance, /본 신고서와 해당 부표|본 신고·신청 내역/, id);
    assert.match(guidance, /원본 서식과 작성 예시를 구분해 확인합니다/);
    assert.equal(JSON.stringify(item), before, id);
  }
});

test('card visual stays square, and the full description precedes an aligned footer', () => {
  const css = readFileSync('app/forms/FormsLibrary.module.css', 'utf8');
  assert.match(css, /\.visual\s*\{[^}]*width: 80px; height: 80px;/);
  assert.match(css, /\.cardFooter\[data-single-action\][^}]*grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.doesNotMatch(css, /\.cardCopy h3\s*\{[^}]*min-height/);
  const source = readFileSync('app/forms/FormsLibrary.tsx', 'utf8');
  assert.ok(source.indexOf('styles.cardDescription') < source.indexOf('styles.cardFooter'));
});
