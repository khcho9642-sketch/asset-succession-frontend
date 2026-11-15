import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const component = readFileSync(new URL('../app/forms/FormsLibrary.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/forms/FormsLibrary.module.css', import.meta.url), 'utf8');

test('current result count stays visible without repeating internal production totals', () => {
  const summary = component.match(/data-result-count>(.*?)<\/p>/s)?.[1];
  assert.ok(summary);
  assert.ok(summary.includes('{filtered.length}'));
  assert.ok(summary.includes('개별 자료'));
  assert.ok(component.includes('archived.length > 0'));
  assert.doesNotMatch(component, /data-catalog-summary|PreviewCoverage/);
});

test('mobile result toolbar wraps conditions without forcing a single overflowing row', () => {
  const mobile = css.slice(css.indexOf('@media (max-width: 640px)'));
  assert.match(css, /\.resultsToolbar[^}]*display:\s*flex/);
  assert.match(mobile, /\.resultsToolbar/);
  assert.match(css, /\.appliedFilters[^}]*flex-wrap:\s*wrap/);
});
