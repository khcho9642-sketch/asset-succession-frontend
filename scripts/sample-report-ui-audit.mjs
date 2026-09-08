import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const outputDir = path.resolve(process.env.UI_AUDIT_DIR ?? ".tmp/sample-report-audit");
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
const observations = [];
const errors = [];

async function ready(page, number) {
  await page.waitForFunction(number => {
    const img = document.querySelector('[aria-label="보고서 페이지"] img');
    return img?.getAttribute("src")?.includes(`page-0${number}.webp`) && img.complete && img.naturalWidth > 0;
  }, number);
}

async function bounds(page, label) {
  const result = await page.evaluate(() => {
    const viewport = document.querySelector('[aria-label="보고서 페이지"]');
    const img = viewport.querySelector("img");
    const rect = img.getBoundingClientRect();
    const documentRect = viewport.getBoundingClientRect();
    const buttons = [...viewport.querySelectorAll("button")].map(button => {
      const box = button.getBoundingClientRect();
      return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    });
    const scrollable = [...document.querySelectorAll("main, section, main div, nav")].filter(el => {
      const style = getComputedStyle(el);
      return ["auto", "scroll"].includes(style.overflowY) && el.scrollHeight > el.clientHeight + 1;
    }).length;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      rootWidth: document.documentElement.scrollWidth, rootHeight: document.documentElement.scrollHeight,
      x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height,
      intrinsicRatio: img.naturalWidth / img.naturalHeight, buttons, scrollable,
      documentBottom: documentRect.bottom, documentLeft: documentRect.left, documentRight: documentRect.right, scrollY
    };
  });
  assert(result.rootWidth <= result.viewport.width + 1, `${label}: horizontal overflow`);
  assert(result.rootHeight <= result.viewport.height + 1, `${label}: vertical overflow`);
  assert.equal(result.scrollable, 0, `${label}: nested scrolling`);
  assert(result.width > 70 && result.height > 100, `${label}: missing or collapsed image`);
  assert(result.x >= 0 && result.y >= 0 && result.right <= result.viewport.width + 1
    && result.bottom <= result.viewport.height + 1 && result.bottom <= result.documentBottom + 1, `${label}: clipped report`);
  assert(Math.abs(result.width / result.height - result.intrinsicRatio) < .002, `${label}: distorted image`);
  for (const button of result.buttons) {
    assert(button.width >= 44 && button.height >= 44, `${label}: undersized navigation`);
    assert(button.x >= result.documentLeft - 1 && button.right <= result.documentRight + 1
      && button.y >= result.y - 1 && button.bottom <= result.bottom + 1, `${label}: controls outside report viewer`);
  }
  assert.equal(result.scrollY, 0, `${label}: scrolled after navigation`);
  return { label, ...result };
}

try {
  for (const [width, height] of [[1440, 900], [390, 844], [375, 667], [430, 932], [768, 1024], [844, 390], [640, 360]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 1000, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(new URL("/sample-report", baseURL).href);
    await ready(page, 1);
    assert.equal(await page.getByRole("button", { name: /큰 글씨 요약|2배 확대|보고서 이미지/ }).count(), 0);
    assert.equal(await page.getByRole("navigation", { name: "보고서 페이지 이동" }).count(), 0);
    assert.equal(await page.locator('[data-nextjs-dialog], .vite-error-overlay').count(), 0);
    assert(await page.getByRole("button", { name: "이전 페이지", exact: true }).isDisabled());
    for (let number = 1; number <= 7; number++) {
      if (number > 1) {
        await page.getByRole("button", { name: "다음 페이지", exact: true }).click();
        await ready(page, number);
      }
      observations.push(await bounds(page, `${width}x${height}-page-${number}`));
      if ([1440, 390].includes(width) || number === 1) {
        await page.screenshot({ path: path.join(outputDir, `sample-${width}x${height}-page-${number}.png`) });
      }
    }
    assert(await page.getByRole("button", { name: "다음 페이지", exact: true }).isDisabled());
    const report = page.getByRole("region", { name: "보고서 페이지", exact: true });
    await report.focus();
    await page.keyboard.press("ArrowRight");
    await ready(page, 7);
    await page.keyboard.press("Home");
    await ready(page, 1);
    await page.keyboard.press("ArrowLeft");
    await ready(page, 1);
    await page.keyboard.press("ArrowRight");
    await ready(page, 2);
    await page.keyboard.press("End");
    await ready(page, 7);
    if (await page.getByLabel("페이지 선택", { exact: true }).isVisible()) {
      await page.getByLabel("페이지 선택", { exact: true }).selectOption("2");
    } else {
      await page.getByRole("button", { name: "03 세 가지 방향 비교" }).click();
    }
    await ready(page, 3);
    if (width === 390) {
      const session = await context.newCDPSession(page);
      const box = await report.boundingBox();
      const y = box.y + box.height * .3;
      for (const direction of [-1, 1]) {
        const startX = box.x + box.width * (direction === -1 ? .8 : .2);
        await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: startX, y }] });
        await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: startX + direction * 70, y }] });
        await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: startX + direction * 140, y }] });
        await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await ready(page, direction === -1 ? 4 : 3);
      }
      await session.detach();
      observations.push(await bounds(page, "mobile-after-real-touch-swipes"));
    }
    await page.reload();
    await ready(page, 1);
    await page.emulateMedia({ media: "print" });
    assert(!await page.getByRole("button", { name: "다음 페이지", exact: true }).isVisible(), "Print must hide overlays");
    await page.emulateMedia({ media: "screen" });
    assert.equal(await page.getByRole("link", { name: "무료 AI 진단", exact: true }).getAttribute("href"), "/precheck");
    assert.equal(await page.getByRole("link", { name: "홈으로", exact: true }).getAttribute("href"), "/");
    await context.close();
  }
  // Error/retry is a real failed asset request, not a replacement report.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.route("**/media/sample-report/page-01.webp", route => route.abort());
  await page.goto(new URL("/sample-report", baseURL).href);
  await page.getByText("이미지를 불러오지 못했습니다.", { exact: true }).waitFor();
  await page.unroute("**/media/sample-report/page-01.webp");
  await page.getByRole("button", { name: "다시 불러오기" }).click();
  await ready(page, 1);
  observations.push(await bounds(page, "mobile-image-retry"));
  await context.close();
  assert.deepEqual(errors, [], "Browser runtime errors");
  await writeFile(path.join(outputDir, "sample-report-fit-audit.json"), JSON.stringify({ baseURL, passed: true, observations, errors }, null, 2));
  console.log(`Sample reader passed: ${observations.length} bounds checks; all seven pages at seven viewports; overlay arrows, keyboard, selector, real mobile swipes, reduced motion, refresh, retry and print checks. Screenshots: ${outputDir}`);
} finally {
  await browser.close();
}
