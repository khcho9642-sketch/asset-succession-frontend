/** Run against the built source, never assume a previous immutable preview is updated.
 * npm exec --package=playwright -- node scripts/forms-preview-completion-audit.mjs
 * Requires Playwright Chromium installed and BASE_URL pointing at this branch build.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.env.BASE_URL || 'http://127.0.0.1:3000';
const output = process.env.PREVIEW_AUDIT_DIR || 'artifacts/forms-preview-completion';
const filter = '/forms?timing=before_death%2Cafter_death&stage=S5&q=%EC%A6%9D%EC%97%AC';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch();
const report = { base, viewports: [], resources: [], failures: [] };
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const jsErrors = [];
  page.on('pageerror', error => jsErrors.push(error.message));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(new URL(filter, base).href, { waitUntil: 'networkidle' });
    await page.locator('[data-form-id]').first().waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${width}: horizontal overflow`);
    await page.screenshot({ path: path.join(output, `gift-S5-${width}.png`), fullPage: true });
    await page.locator('[data-form-preview]').first().click();
    await page.locator('dialog[open] [data-document-preview]').waitFor();
    await page.screenshot({ path: path.join(output, `gift-S5-detail-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: '자료 상세 닫기', exact: true }).click();
    assert.ok(new URL(page.url()).searchParams.get('q') === '증여', 'Close must preserve the gift filter');
    report.viewports.push({ width, filterPreserved: true, overflow: false });
  }
  const manifestResponse = await context.request.get(new URL('/downloads/official-forms/manifest.json', base).href);
  assert.ok(manifestResponse.ok(), 'Cannot read the real served catalogue');
  const manifest = await manifestResponse.json();
  assert.ok(Array.isArray(manifest.documents) && manifest.documents.length > 0);
  for (const item of manifest.documents) {
    if (item.resource?.presentation?.visibility === 'archived') continue;
    await page.goto(new URL(`/forms?resource=${encodeURIComponent(item.id)}`, base).href, { waitUntil: 'domcontentloaded' });
    const preview = page.locator('dialog[open] [data-document-preview]');
    await preview.waitFor();
    const image = preview.locator('img');
    if (await image.count()) await image.evaluate(image => image.complete ? undefined : new Promise(resolve => { image.onload = resolve; image.onerror = resolve; }));
    const state = await preview.getAttribute('data-preview-state');
    report.resources.push({ id: item.id, state });
    if (state === 'pending') report.failures.push(`${item.id}: preview is pending`);
    if (state === 'image') assert.ok(await image.evaluate(image => image.naturalWidth > 0), `${item.id}: broken preview image`);
    if (state === 'pdf') {
      const iframe = preview.locator('iframe');
      await iframe.waitFor({ timeout: 15000 });
      const src = await iframe.getAttribute('src');
      const response = await context.request.get(new URL(src.split('#')[0], base).href);
      assert.ok(response.ok(), `${item.id}: PDF is unavailable`);
      assert.equal((await response.body()).subarray(0, 5).toString(), '%PDF-', `${item.id}: invalid PDF payload`);
    }
    if (state === 'provider') assert.ok(await preview.locator('a[target="_blank"]').count(), `${item.id}: missing provider link`);
  }
  assert.deepEqual(jsErrors, [], 'Unexpected client errors');
  assert.deepEqual(report.failures, [], 'Do not publish a completion claim with pending file previews');
} catch (error) {
  report.failures.push(error.message);
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
