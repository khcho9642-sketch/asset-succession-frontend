import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';

const output = process.env.TURN_AUDIT_DIR ?? '.tmp/paper-turn';
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const width of [375, 390, 430, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelector('[data-testid="hero-carousel"]').dataset.paused === 'false');
    const carousel = page.getByTestId('hero-carousel');
    await page.evaluate(() => {
      const carousel = document.querySelector('[data-testid="hero-carousel"]');
      window.turnStarts = [];
      new MutationObserver((records) => {
        for (const record of records) if (record.attributeName === 'data-active-page') window.turnStarts.push({ time: performance.now(), page: carousel.dataset.activePage });
      }).observe(carousel, { attributes: true });
    });
    await page.waitForFunction(() => window.turnStarts.length >= 3);
    const intervals = await page.evaluate(() => window.turnStarts.slice(1).map((item, i) => item.time - window.turnStarts[i].time));
    for (const interval of intervals) assert(interval >= 1850 && interval <= 2250, 'Autoplay must advance every 2 seconds: ' + interval);
    await carousel.evaluate((el) => el.focus({ preventScroll: true }));
    await page.getByTestId('turning-paper').waitFor({ state: 'detached' });
    await carousel.press('Home');
    await page.getByTestId('turning-paper').waitFor({ state: 'detached' });
    await carousel.scrollIntoViewIfNeeded();
    // Freeze fallback timers while inspecting compositor frames individually.
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await carousel.press('ArrowRight');
    const leaf = page.getByTestId('turning-paper');
    await leaf.waitFor();
    assert.equal(await leaf.getAttribute('data-direction'), 'forward');
    assert((await leaf.innerText()).includes('우리 가족 자산승계 진단서'), 'Outgoing text must stay attached to the turning leaf');
    assert.equal(await leaf.getAttribute('aria-hidden'), 'true', 'Visual leaf must not duplicate screen-reader content');
    const frames = [];
    // Sample real compositor keyframes, paused at precise times for reproducible captures.
    for (const milliseconds of [0, 170, 340, 510, 670]) {
      if (milliseconds === 0) await leaf.evaluate((el) => { for (const animation of el.getAnimations({ subtree: true })) animation.pause(); });
      await leaf.evaluate((el, time) => { for (const animation of el.getAnimations({ subtree: true })) animation.currentTime = time; }, milliseconds);
      const frame = await page.evaluate(() => {
        const leaf = document.querySelector('[data-testid="turning-paper"]');
        return { transform: getComputedStyle(leaf).transform, opacity: getComputedStyle(leaf).opacity, width: document.documentElement.scrollWidth, viewport: innerWidth };
      });
      assert(frame.width <= width, 'Mid-turn horizontal overflow at ' + width + ' / ' + milliseconds);
      frames.push({ milliseconds, ...frame });
      if ((width === 390 || width === 1440) && milliseconds < 600) {
        await page.screenshot({ path: path.join(output, width + '-turn-' + milliseconds + '.png') });
      }
    }
    assert(new Set(frames.map((frame) => frame.transform)).size >= 4, 'Paper must physically turn through different transforms');
    await leaf.evaluate((el) => { for (const animation of el.getAnimations({ subtree: true })) animation.finish(); });
    await page.clock.resume();
    await page.getByTestId('turning-paper').waitFor({ state: 'detached' });
    await carousel.press('ArrowLeft');
    assert.equal(await page.getByTestId('turning-paper').getAttribute('data-direction'), 'back');
    await page.getByTestId('turning-paper').waitFor({ state: 'detached' });
    await carousel.press('ArrowRight');
    await carousel.press('ArrowRight');
    await carousel.press('Home');
    await page.getByTestId('turning-paper').waitFor({ state: 'detached' });
    assert.equal(await carousel.getAttribute('data-active-page'), '1', 'Rapid manual changes must settle on the latest request');
    await carousel.press('ArrowRight');
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.getByTestId('turning-paper').isVisible(), false, 'Print must never show a turning leaf');
    await page.emulateMedia({ media: 'screen', reducedMotion: 'reduce' });
    await page.getByRole('link', { name: '자산승계 360 홈' }).focus();
    await page.mouse.move(2, 2);
    const reducedIndex = await carousel.getAttribute('data-active-page');
    await page.waitForTimeout(2300);
    assert.equal(await carousel.getAttribute('data-active-page'), reducedIndex, 'Reduced motion must stop autoplay without manual pause');
    await carousel.press('ArrowRight');
    assert.equal(await page.getByTestId('turning-paper').count(), 0, 'Reduced motion must change pages immediately');
    results.push({ width, intervals, frames, reverse: 'pass', rapidInput: 'pass', reducedMotion: 'pass', print: 'pass' });
    await context.close();
  }
  await writeFile(path.join(output, 'audit.json'), JSON.stringify(results, null, 2));
  console.log('Paper-turn audit passed: 2s cadence, forward/reverse leaf, no mid-turn overflow, rapid input, reduced motion and print at 5 widths.');
} finally { await browser.close(); }
