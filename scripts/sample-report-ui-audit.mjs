import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { chromium } from "playwright";
import { assertPaperTemplate, seededAssessment } from "./paper-report-audit.mjs";
import { assertReportPrintBounds } from "./report-print-bounds.mjs";

// CI browser gate for the same tax report customers receive, using a fictional case.
const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const outputDir = path.resolve(process.env.UI_AUDIT_DIR ?? ".tmp/sample-report-audit");
const assessmentKey = "as360.precheck.assessment.v1";
const runFile = promisify(execFile);
const expected = { baseline: "1,491,375,000원", alternative: "916,326,660원", difference: "575,048,340원" };
const observations = [];
const errors = [];
const apiRequests = [];
await mkdir(outputDir, { recursive: true });

const storage = page => page.evaluate(() => Object.fromEntries(Object.entries(sessionStorage).sort(([a], [b]) => a.localeCompare(b))));

async function ready(page) {
  await page.locator('[data-report-mode="tax-comparison"][data-tax-report-status="ready"]').waitFor();
  await page.locator('[data-report-page="7"]').waitFor({ state: "attached" });
  await page.evaluate(() => document.fonts.ready);
}

async function assertSampleContent(page, label) {
  assert.equal((await page.locator("[data-tax-report-baseline]").textContent()).trim(), expected.baseline, `${label}: baseline amount changed`);
  assert.equal((await page.locator("[data-tax-report-alternative]").textContent()).trim(), expected.alternative, `${label}: alternative amount changed`);
  assert((await page.locator("[data-tax-report-difference]").textContent()).includes(expected.difference), `${label}: tax difference changed`);
  assert.equal(await page.locator('[data-tax-cash-status="unknown"]').count(), 1, `${label}: unknown payment cash became a confirmed amount`);
  assert.equal(await page.locator('img[src*="/media/sample-report/"], img[srcset*="/media/sample-report/"]').count(), 0, `${label}: obsolete raster viewer is still displayed`);
  for (let number = 1; number <= 7; number++) {
    const sheet = page.locator(`[data-report-page="${number}"]`);
    const text = await sheet.textContent();
    assert(text.includes("샘플") && text.includes("전문가 검토 전"), `${label}: page ${number} must identify its fictional sample and review status`);
    assert((await sheet.locator("[data-report-content]").textContent()).length > 100, `${label}: page ${number} is missing actual report text`);
    assert.equal(await sheet.getAttribute("id"), `report-page-${number}`, `${label}: page ${number} has no anchor target`);
  }
}

async function assertViewerLayout(page, label) {
  const geometry = await page.evaluate(() => {
    const stage = document.querySelector("[data-sample-stage]");
    const frame = stage.getBoundingClientRect();
    const sheets = [...document.querySelectorAll("[data-report-page]")];
    const visible = sheets.filter(sheet => sheet.getBoundingClientRect().height > 0);
    return {
      viewport: { width: innerWidth, height: innerHeight },
      rootWidth: document.documentElement.scrollWidth,
      rootHeight: document.documentElement.scrollHeight,
      scrollY,
      stage: { left: frame.left, right: frame.right, top: frame.top, bottom: frame.bottom, width: frame.width, height: frame.height },
      totalPages: sheets.length,
      nestedScrollers: [...document.querySelectorAll("main, main *")].filter(element => {
        const style = getComputedStyle(element);
        return /^(auto|scroll)$/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 2;
      }).map(element => element.tagName.toLowerCase()),
      visible: visible.map(sheet => {
        const box = sheet.getBoundingClientRect();
        const clippedText = [];
        const walker = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (!node.textContent.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const textBox of range.getClientRects()) {
            if (!textBox.width || !textBox.height) continue;
            if (textBox.left < box.left - 2 || textBox.right > box.right + 2 || textBox.top < box.top - 2 || textBox.bottom > box.bottom + 2) clippedText.push(node.textContent.trim().slice(0, 80));
          }
        }
        return {
          page: sheet.getAttribute("data-report-page"), left: box.left, right: box.right,
          top: box.top, bottom: box.bottom, width: box.width, height: box.height,
          clientWidth: sheet.clientWidth, scrollWidth: sheet.scrollWidth,
          clientHeight: sheet.clientHeight, scrollHeight: sheet.scrollHeight,
          clippedText,
        };
      }),
      overlappingControls: [...document.querySelectorAll("button")].filter(button => {
        const box = button.getBoundingClientRect();
        if (!box.width || !box.height) return false;
        return visible.some(sheet => {
          const paper = sheet.getBoundingClientRect();
          return box.left < paper.right - 2 && box.right > paper.left + 2 && box.top < paper.bottom - 2 && box.bottom > paper.top + 2;
        });
      }).map(button => button.textContent.trim()),
    };
  });
  assert(geometry.rootWidth <= geometry.viewport.width + 2, `${label}: root horizontal overflow`);
  assert(geometry.rootHeight <= geometry.viewport.height + 2 && geometry.scrollY <= 2, `${label}: sample requires document scrolling`);
  assert.deepEqual(geometry.nestedScrollers, [], `${label}: report requires nested vertical scrolling`);
  assert.equal(geometry.totalPages, 7, `${label}: seven pages must remain available for export`);
  assert.equal(geometry.visible.length, 1, `${label}: exactly one report page must be visible`);
  const sheet = geometry.visible[0];
  const stage = geometry.stage;
  assert(stage.left >= -2 && stage.right <= geometry.viewport.width + 2 && stage.top >= -2 && stage.bottom <= geometry.viewport.height + 2, `${label}: stage extends beyond viewport`);
  assert(sheet.left >= stage.left - 2 && sheet.right <= stage.right + 2 && sheet.top >= stage.top - 2 && sheet.bottom <= stage.bottom + 2, `${label}: selected page is clipped by its stage`);
  assert(sheet.scrollWidth <= sheet.clientWidth + 2 && sheet.scrollHeight <= sheet.clientHeight + 2, `${label}: selected page hides overflowing report content`);
  assert.deepEqual(sheet.clippedText, [], `${label}: report text extends outside the selected sheet`);
  assert(Math.max(sheet.width / stage.width, sheet.height / stage.height) >= .90, `${label}: selected page leaves unnecessary space instead of fitting its available area`);
  assert.deepEqual(geometry.overlappingControls, [], `${label}: a navigation button covers report content`);
  return { label, ...geometry };
}

async function waitForPage(page, number) {
  await page.waitForFunction(number => {
    const viewer = document.querySelector("[data-sample-viewer]");
    const sheets = [...document.querySelectorAll("[data-report-page]")].filter(sheet => sheet.getBoundingClientRect().height > 0);
    const stage = document.querySelector("[data-sample-stage]")?.getBoundingClientRect();
    const selected = sheets[0]?.getBoundingClientRect();
    return viewer?.getAttribute("data-current-page") === String(number) && sheets.length === 1
      && sheets[0]?.getAttribute("data-report-page") === String(number)
      && stage && selected && selected.width > 0 && selected.height > 0
      && selected.left >= stage.left - 2 && selected.right <= stage.right + 2
      && selected.top >= stage.top - 2 && selected.bottom <= stage.bottom + 2
      && Math.max(selected.width / stage.width, selected.height / stage.height) >= .90;
  }, number);
}

async function selectChapter(page, number) {
  await page.getByRole("button", { name: "목차", exact: true }).click();
  const contents = page.getByRole("navigation", { name: "보고서 목차", exact: true });
  await contents.getByRole("button", { name: new RegExp(`^0?${number}\\s`) }).click();
  await waitForPage(page, number);
  assert(!await contents.isVisible(), "Selecting a chapter must close the contents overlay");
}

const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
try {
  for (const [width, height] of [[390, 844], [1440, 1000], [1920, 1080]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width === 390, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => {
      const url = new URL(request.url());
      if (url.origin === new URL(baseURL).origin && url.pathname.startsWith("/api/")) apiRequests.push(`${request.method()} ${url.pathname}`);
    });
    // Exercise both an empty session and a previously saved customer intake.
    const initialStorage = width === 390 ? {} : {
      [assessmentKey]: JSON.stringify({ ...seededAssessment, assessment_id: "AS360-EXISTING-CUSTOMER-INTAKE" }),
      "sample-audit-unrelated": "keep existing session data",
    };
    if (width !== 390) await page.addInitScript(values => {
      for (const [key, value] of Object.entries(values)) sessionStorage.setItem(key, value);
    }, initialStorage);
    const response = await page.goto(new URL("/sample-report", baseURL).href, { waitUntil: "networkidle" });
    assert(response?.ok(), `${width}px: direct sample route failed`);
    await ready(page);
    const template = await assertPaperTemplate(page, `${width}px sample report`);
    await assertSampleContent(page, `${width}px direct visit`);
    assert.deepEqual(await storage(page), initialStorage, `${width}px: opening the sample changed assessment storage`);
    await waitForPage(page, 1);
    observations.push({ ...await assertViewerLayout(page, `${width}px screen`), template });
    assert.equal(await page.locator('[data-nextjs-dialog], .vite-error-overlay').count(), 0, "Framework error overlay is visible");

    const contents = page.getByRole("navigation", { name: "보고서 목차", exact: true });
    assert(!await contents.isVisible(), "Contents should start collapsed to leave room for the report");
    const previous = page.getByRole("button", { name: "이전 페이지", exact: true });
    const next = page.getByRole("button", { name: "다음 페이지", exact: true });
    assert(await previous.isDisabled(), "Previous button should be disabled at the first page");
    await page.screenshot({ path: path.join(outputDir, `sample-report-${width}-page-1.png`) });
    for (let number = 2; number <= 7; number++) {
      await next.click();
      await waitForPage(page, number);
      observations.push(await assertViewerLayout(page, `${width}px page ${number}`));
    }
    assert(await next.isDisabled(), "Next button should be disabled at the last page");
    await previous.click();
    await waitForPage(page, 6);
    for (const number of [7, 3, 1]) await selectChapter(page, number);
    const viewer = page.locator("[data-sample-viewer]");
    await viewer.focus();
    for (const [key, number] of [["End", 7], ["ArrowLeft", 6], ["Home", 1], ["ArrowRight", 2]]) {
      await page.keyboard.press(key);
      await waitForPage(page, number);
    }
    if (width === 390) {
      // Dispatch touch input through the actual viewer boundary (no direct state mutation).
      const stage = page.locator("[data-sample-stage]");
      for (const [startX, endX, number] of [[300, 70, 3], [70, 300, 2]]) {
        await stage.evaluate((element, { startX, endX }) => {
          const start = new Touch({ identifier: 1, target: element, clientX: startX, clientY: 400 });
          element.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [start], targetTouches: [start], changedTouches: [start] }));
          const end = new Touch({ identifier: 1, target: element, clientX: endX, clientY: 400 });
          element.dispatchEvent(new TouchEvent("touchend", { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [end] }));
        }, { startX, endX });
        await waitForPage(page, number);
      }
    }
    await selectChapter(page, 3);
    const normal = await assertViewerLayout(page, `${width}px normal page 3`);
    await page.screenshot({ path: path.join(outputDir, `sample-report-${width}-page-3.png`) });
    await page.getByRole("button", { name: "크게 보기", exact: true }).click();
    await waitForPage(page, 3);
    const expanded = await assertViewerLayout(page, `${width}px expanded page 3`);
    assert(expanded.visible[0].width >= normal.visible[0].width - 2 && expanded.visible[0].height >= normal.visible[0].height - 2, "Expanded mode must not shrink the report");
    observations.push(expanded);
    await page.screenshot({ path: path.join(outputDir, `sample-report-${width}-expanded.png`) });
    await page.getByRole("button", { name: "기본 화면", exact: true }).click();
    await waitForPage(page, 3);
    const resized = { width: width === 390 ? 844 : 1024, height: width === 390 ? 390 : 768 };
    await page.setViewportSize(resized);
    await waitForPage(page, 3);
    observations.push(await assertViewerLayout(page, `${width}px resized to ${resized.width}x${resized.height}`));
    await page.setViewportSize({ width, height });
    await waitForPage(page, 3);
    // Wheel input must not turn the document into a scrolling report or change the page.
    await page.mouse.move(width / 2, height / 2);
    await page.mouse.wheel(0, 600);
    await waitForPage(page, 3);
    observations.push(await assertViewerLayout(page, `${width}px after wheel input`));
    assert.deepEqual(await storage(page), initialStorage, `${width}px: sample navigation changed assessment storage`);
    assert.equal(await page.getByRole("link", { name: "무료 AI 진단", exact: true }).getAttribute("href"), "/precheck");
    assert.equal(await page.getByRole("link", { name: "홈으로", exact: true }).getAttribute("href"), "/");

    if (width === 1440) {
      // Exercise the user's print control, then independently inspect its real PDF.
      await page.evaluate(() => { window.__samplePrintCalls = 0; window.print = () => { window.__samplePrintCalls += 1; }; });
      const printButton = page.getByRole("button", { name: "PDF 저장", exact: true });
      await printButton.click();
      await page.waitForFunction(() => window.__samplePrintCalls === 1);
      await page.emulateMedia({ media: "print" });
      assert(!await contents.isVisible(), "Contents navigation leaked into the PDF");
      assert(!await printButton.isVisible(), "Print control leaked into the PDF");
      assert.equal(await page.locator("[data-report-page]:visible").count(), 7, "Printing from page 3 must reveal all seven report pages");
      await assertPaperTemplate(page, "Sample print report");
      await assertSampleContent(page, "Sample print report");
      const bounds = await assertReportPrintBounds(page, { outputPath: path.join(outputDir, "sample-report-print-bounds.json"), label: "Fictional 52억원 sample report" });
      const pdfPath = path.join(outputDir, "sample-report-seven-pages.pdf");
      const pdf = await page.pdf({ path: pdfPath, format: "A4", printBackground: true, preferCSSPageSize: true });
      const { stdout } = await runFile("python", ["-c", "import json,sys; from pypdf import PdfReader; r=PdfReader(sys.argv[1]); print(json.dumps({'pages':len(r.pages),'sizes':[[float(p.mediabox.width),float(p.mediabox.height)] for p in r.pages],'texts':[p.extract_text() or '' for p in r.pages]},ensure_ascii=False))", pdfPath], { timeout: 15_000 });
      const physical = JSON.parse(stdout);
      assert.equal(physical.pages, 7, "Sample PDF must contain exactly seven physical pages");
      assert(physical.sizes.every(([width, height]) => Math.abs(width - 595.28) < 1 && Math.abs(height - 841.89) < 1), "Every sample PDF page must be A4");
      for (const [index, text] of physical.texts.entries()) assert(text.includes("샘플"), `Physical PDF page ${index + 1} lost its sample label or selectable report text`);
      observations.push({ media: "print", pages: physical.pages, sizes: physical.sizes, boundsStatus: bounds.status, pdf: pdfPath, bytes: pdf.byteLength });
      await page.emulateMedia({ media: "screen" });
    }
    await page.reload({ waitUntil: "networkidle" });
    await ready(page);
    await assertSampleContent(page, `${width}px reload`);
    assert.deepEqual(await storage(page), initialStorage, `${width}px: sample reload changed assessment storage`);
    await context.close();
  }
  assert.deepEqual(errors, [], "Sample report produced browser runtime errors");
  assert.deepEqual(apiRequests, [], "Opening a fictional sample unexpectedly invoked an API");
  await writeFile(path.join(outputDir, "sample-report-audit.json"), `${JSON.stringify({ status: "passed", baseURL, expected, observations, errors, apiRequests }, null, 2)}\n`);
  console.log(`Sample report audit passed: shared paper template, seven actual report pages, exact tax totals, one-page fitted viewing at 390/1440/1920px, touch/keyboard/contents navigation, expanded mode and viewport resizing, unchanged customer storage, and seven unclipped A4 PDF pages. Artifacts: ${outputDir}`);
} catch (error) {
  await writeFile(path.join(outputDir, "sample-report-audit.json"), `${JSON.stringify({ status: "failed", baseURL, expected, observations, errors, apiRequests, failure: error.stack || String(error) }, null, 2)}\n`);
  throw error;
} finally {
  await browser.close();
}
