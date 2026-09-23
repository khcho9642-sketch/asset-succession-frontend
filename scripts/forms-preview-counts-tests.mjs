import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const component = readFileSync(new URL('../app/forms/FormsLibrary.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/forms/FormsLibrary.module.css', import.meta.url), 'utf8');

test('catalog totals show individual resources and separate archived records', () => {
  const summary = component.match(/data-catalog-summary>(.*?)<\/p>/s)?.[1];
  assert.ok(summary);
  assert.ok(summary.includes('{index.cards.length}'));
  // Source record totals are checked separately from independent document cards.
  assert.ok(summary.includes('개별 자료'));
  assert.ok(component.includes('archived.length > 0'));
});

test('mobile catalog totals stay visible without forcing a single overflowing row', () => {
  const mobile = css.slice(css.indexOf('@media (max-width: 640px)'));
  const summary = mobile.match(/\.catalogSummary\s*\{([^}]*)\}/)?.[1];
  assert.match(summary, /display:\s*flex/);
  assert.match(summary, /flex-wrap:\s*wrap/);
});
