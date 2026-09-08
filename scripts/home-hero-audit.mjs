import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';

const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const output = process.env.HERO_AUDIT_DIR ?? '.tmp/home-hero-final';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const observations = [];
const errors = [];
const widths = [375, 390, 430, 768, 1440];
const titles = ['우리 가족 자산승계 진단서', '맞춤 자산승계 전략 비교', '자산승계 실행 로드맵'];
const baseline = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 900 : 844 }, reducedMotion: 'no-preference', hasTouch: width < 1024 });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    const response = await page.goto(baseURL, { waitUntil: 'networkidle' });
    assert(response.ok(), 'Home HTTP failure');
    const carousel = page.getByTestId('hero-carousel');
    await carousel.evaluate((element) => element.focus({ preventScroll: true }));
    const cta = page.getByRole('link', { name: '무료 AI 진단 시작하기', exact: true });
    assert.equal(await cta.count(), 1, 'Main CTA must occur exactly once');
    assert.equal(await cta.getAttribute('href'), '/precheck');
    const ctaBox = await cta.boundingBox();
    assert(ctaBox.height >= 44 && ctaBox.y + ctaBox.height < 844, 'CTA must be large enough and visible immediately');
    const heroText = await page.locator('#home-content').innerText();
    assert(heroText.includes('회원가입 없이 · 약 5분 · 결과 즉시 확인'));
    for (const removed of ['서비스 소개', '진단 서비스', '실제 사례', '전문가 소개', '고객센터']) {
      assert(!(await page.locator('header').innerText()).includes(removed), 'Removed navigation still present: ' + removed);
    }
    const layout = await page.evaluate(() => {
      const hero = document.querySelector('#home-title');
      const lines = [...hero.children].map((line) => {
        const range = document.createRange(); range.selectNodeContents(line);
        const rect = range.getBoundingClientRect();
        return { left: rect.left, right: rect.right, height: rect.height, top: rect.top };
      });
      return { scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth, lines, reportTop: document.querySelector('[data-testid="hero-report"]').getBoundingClientRect().top };
    });
    assert(layout.scrollWidth <= width, 'Horizontal overflow: ' + JSON.stringify(layout));
    assert.equal(layout.lines.length, 2);
    for (const line of layout.lines) assert(line.left >= 0 && line.right <= width, 'Headline cropped at ' + width);
    assert(layout.reportTop < 844, 'First report must begin within the first viewport');
    await page.screenshot({ path: path.join(output, width + '-viewport.png'), animations: 'disabled' });
    for (let index = 0; index < 3; index++) {
      await page.getByRole('button', { name: (index + 1) + '번째 보고서 보기' }).click();
      assert.equal(await carousel.getAttribute('data-active-page'), String(index + 1));
      await page.getByTestId('turning-paper').waitFor({ state: 'detached' });
      const active = page.getByTestId('hero-report').filter({ has: page.getByRole('heading', { name: titles[index], exact: true }) });
      const text = (await active.innerText()).replace(/\s+/g, ' ').trim();
      if (width === widths[0]) baseline.push(text);
      else assert.equal(text, baseline[index], 'PC/mobile report content differs');
      if (index === 0) for (const member of ['장남 (사업 승계)', '장녀 (자산 분산)', '차남 (생활 안정)', '분할 증여']) assert(text.includes(member), member + ' missing');
      const image = active.locator('img');
      assert.equal(await image.getAttribute('src'), '/media/hero-report-0' + (index + 1) + '.webp');
      if (width === 1440) assert(await image.evaluate((img) => img.complete && img.naturalWidth > 0), 'Report image not loaded');
      await carousel.screenshot({ path: path.join(output, width + '-report-' + (index + 1) + '.png'), animations: 'disabled' });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Report causes overflow');
    }
    await carousel.press('Home');
    await page.getByTestId('turning-paper').waitFor({ state: 'detached' });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, width + '-full.png'), fullPage: true, animations: 'disabled' });
    await carousel.press('ArrowRight');
    assert.equal(await carousel.getAttribute('data-active-page'), '2');
    await carousel.press('End');
    assert.equal(await carousel.getAttribute('data-active-page'), '3');
    await carousel.press('ArrowRight');
    assert.equal(await carousel.getAttribute('data-active-page'), '1');
    if (width < 1024) {
      await carousel.dispatchEvent('touchstart', { touches: [{ identifier: 1, clientX: 270, clientY: 400 }] });
      await carousel.dispatchEvent('touchend', { changedTouches: [{ identifier: 1, clientX: 140, clientY: 405 }] });
      assert.equal(await carousel.getAttribute('data-active-page'), '2', 'Horizontal swipe failed');
      await carousel.dispatchEvent('touchstart', { touches: [{ identifier: 2, clientX: 270, clientY: 400 }] });
      await carousel.dispatchEvent('touchend', { changedTouches: [{ identifier: 2, clientX: 260, clientY: 180 }] });
      assert.equal(await carousel.getAttribute('data-active-page'), '2', 'Vertical scroll must not turn a page');
      await page.getByRole('button', { name: '메뉴 열기' }).click();
      assert.equal(await page.getByRole('navigation', { name: '모바일 진단 유형' }).getByRole('link').count(), 5);
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('button', { name: '메뉴 열기' }).getAttribute('aria-expanded'), 'false');
    }
    await cta.click();
    await page.waitForURL('**/precheck');
    await page.getByRole('textbox', { name: '직접 입력' }).fill('상속 준비, 배우자 있음, 자녀 2명, 금융자산 30억원');
    await page.getByRole('button', { name: '직접 입력 이해하기' }).click();
    await page.getByText('제가 이렇게 이해했습니다.', { exact: true }).waitFor();
    observations.push({ width, layout, reports: 3, chat: 'confirmed', horizontalOverflow: false });
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  const carousel = page.getByTestId('hero-carousel');
  await page.waitForFunction(() => document.querySelector('[data-testid="hero-carousel"]').dataset.activePage === '2', { timeout: 6000 });
  await carousel.hover();
  const hoveredPage = await carousel.getAttribute('data-active-page');
  await sleep(4250);
  assert.equal(await carousel.getAttribute('data-active-page'), hoveredPage, 'Hover must pause autoplay');
  await carousel.focus();
  await page.mouse.move(5, 5);
  await sleep(4250);
  assert.equal(await carousel.getAttribute('data-active-page'), hoveredPage, 'Focus must pause autoplay');
  await page.getByRole('button', { name: '보고서 자동 넘김 정지' }).click();
  await page.getByRole('link', { name: '자산승계 360 홈' }).focus();
  await page.mouse.move(5, 5);
  await sleep(4250);
  assert.equal(await carousel.getAttribute('data-active-page'), hoveredPage, 'Manual pause must persist after leaving carousel');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await sleep(4250);
  assert.equal(await carousel.getAttribute('data-active-page'), hoveredPage);
  assert.equal(await page.getByTestId('hero-report').first().evaluate((el) => getComputedStyle(el).transform), 'none');
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.getByTestId('hero-report').filter({ has: page.getByRole('heading', { name: titles[Number(hoveredPage) - 1], exact: true }) }).evaluate((el) => getComputedStyle(el).animationName), 'none');
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('link', { name: '샘플 보고서 보기', exact: true }).click();
  await page.waitForURL('**/precheck/result?demo=1');
  await page.getByText('AI 추천 시나리오', { exact: true }).waitFor();
  await page.goto(baseURL);
  await page.getByRole('link', { name: '전문가 상담', exact: true }).first().click();
  await page.waitForURL('**/consultation');
  for (const [label, purpose, choice] of [['양도', 'capital-gains', '양도'], ['상속', 'inheritance', '상속'], ['증여', 'gift', '증여'], ['가업승계', 'business', '가업·회사 승계']]) {
    await page.goto(baseURL);
    await page.evaluate(() => sessionStorage.clear());
    await page.getByRole('navigation', { name: '진단 유형', exact: true }).getByRole('link', { name: label, exact: true }).click();
    await page.waitForURL('**/precheck?purpose=' + purpose);
    await page.getByRole('radio', { name: choice, exact: true }).waitFor();
    assert.equal(await page.getByRole('radio', { name: choice, exact: true }).getAttribute('aria-checked'), 'true', 'Diagnosis purpose not selected');
  }
  await context.close();
  assert.deepEqual(errors, [], 'Browser errors');
  await writeFile(path.join(output, 'audit.json'), JSON.stringify({ observations, errors, autoplay: 'pass', hoverAndFocusPause: 'pass', manualPause: 'pass', reducedMotion: 'pass', keyboard: 'pass', swipe: 'pass', linksAndChat: 'pass' }, null, 2));
  console.log('Home hero audit passed: 375/390/430/768/1440, all 3 reports, chat/routes, autoplay, pause, keyboard, swipe, reduced motion and print.');
} finally { await browser.close(); }
