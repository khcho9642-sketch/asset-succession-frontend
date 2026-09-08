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
  await page.locator('[data-report-page="7"]').waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function assertSampleContent(page, label) {
  assert.equal((await page.locator("[data-tax-report-baseline]").innerText()).trim(), expected.baseline, `${label}: baseline amount changed`);
  assert.equal((await page.locator("[data-tax-report-alternative]").innerText()).trim(), expected.alternative, `${label}: alternative amount changed`);
  assert((await page.locator("[data-tax-report-difference]").innerText()).includes(expected.difference), `${label}: tax difference changed`);
  assert.equal(await page.locator('[data-tax-cash-status="unknown"]').count(), 1, `${label}: unknown payment cash became a confirmed amount`);
  assert.equal(await page.locator('img[src*="/media/sample-report/"], img[srcset*="/media/sample-report/"]').count(), 0, `${label}: obsolete raster viewer is still displayed`);
  for (let number = 1; number <= 7; number++) {
    const sheet = page.locator(`[data-report-page="${number}"]`);
    const text = await sheet.innerText();
    assert(text.includes("샘플") && text.includes("전문가 검토 전"), `${label}: page ${number} must identify its fictional sample and review status`);
    assert((await sheet.locator("[data-report-content]").innerText()).length > 100, `${label}: page ${number} is missing actual report text`);
    assert.equal(await sheet.getAttribute("id"), `report-page-${number}`, `${label}: page ${number} has no anchor target`);
  }
}

async function assertDocumentLayout(page, label) {
  const geometry = await page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight },
    rootWidth: document.documentElement.scrollWidth,
    rootHeight: document.documentElement.scrollHeight,
    nestedScrollers: [...document.querySelectorAll("main, main *")].filter(element => {
      const style = getComputedStyle(element);
      return /^(auto|scroll)$/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 2;
    }).map(element => element.tagName.toLowerCase()),
    pages: [...document.querySelectorAll("[data-report-page]")].map(sheet => {
      const box = sheet.getBoundingClientRect();
      const heading = sheet.querySelector("h2");
      return {
        page: sheet.getAttribute("data-report-page"), left: box.left, right: box.right,
        top: box.top + scrollY, bottom: box.bottom + scrollY, height: box.height,
        clientWidth: sheet.clientWidth, scrollWidth: sheet.scrollWidth,
        clientHeight: sheet.clientHeight, scrollHeight: sheet.scrollHeight,
        headingSize: heading ? parseFloat(getComputedStyle(heading).fontSize) : 0,
      };
    }),
  }));
  assert(geometry.rootWidth <= geometry.viewport.width + 2, `${label}: root horizontal overflow`);
  assert(geometry.rootHeight > geometry.viewport.height * 2, `${label}: report is constrained to a fixed viewport`);
  assert.deepEqual(geometry.nestedScrollers, [], `${label}: report requires nested vertical scrolling`);
  assert.equal(geometry.pages.length, 7, `${label}: seven pages must remain in the document`);
  for (const [index, sheet] of geometry.pages.entries()) {
    assert(sheet.left >= -2 && sheet.right <= geometry.viewport.width + 2, `${label}: page ${sheet.page} extends beyond the screen`);
    assert(sheet.scrollWidth <= sheet.clientWidth + 2, `${label}: page ${sheet.page} has horizontal overflow`);
    assert(sheet.scrollHeight <= sheet.clientHeight + 2, `${label}: page ${sheet.page} clips its vertical content`);
    assert(sheet.height > 300 && sheet.headingSize >= 24, `${label}: page ${sheet.page} was collapsed or scaled to fit the viewport`);
    if (index) assert(sheet.top >= geometry.pages[index - 1].bottom - 2, `${label}: pages overlap instead of scrolling naturally`);
  }
  return { label, ...geometry };
}

async function waitForChapter(page, number) {
  // Read bounds without locator scrolling, so the navigation itself must work.
  await page.waitForFunction(number => {
    const sheet = document.getElementById(`report-page-${number}`);
    const heading = sheet?.querySelector("h2");
    if (!heading) return false;
    const box = heading.getBoundingClientRect();
    return scrollY > 0 && box.top >= -2 && box.bottom <= innerHeight;
  }, number);
}

const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
try {
  for (const [width, height] of [[390, 844], [1440, 1000]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
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
    if (width === 1440) await page.addInitScript(values => {
      for (const [key, value] of Object.entries(values)) sessionStorage.setItem(key, value);
    }, initialStorage);
    const response = await page.goto(new URL("/sample-report", baseURL).href, { waitUntil: "networkidle" });
    assert(response?.ok(), `${width}px: direct sample route failed`);
    await ready(page);
    const template = await assertPaperTemplate(page, `${width}px sample report`);
    await assertSampleContent(page, `${width}px direct visit`);
    assert.deepEqual(await storage(page), initialStorage, `${width}px: opening the sample changed assessment storage`);
    observations.push({ ...await assertDocumentLayout(page, `${width}px screen`), template });
    assert.equal(await page.locator('[data-nextjs-dialog], .vite-error-overlay').count(), 0, "Framework error overlay is visible");

    const contents = page.getByRole("navigation", { name: "보고서 목차", exact: true });
    const selector = page.getByLabel("페이지 선택", { exact: true });
    for (const number of [7, 3, 1]) {
      if (width === 390) {
        assert(await selector.isVisible(), "Mobile page selector is not visible");
        await selector.selectOption(String(number));
      } else {
        const link = contents.locator(`a[href="#report-page-${number}"]`);
        assert.equal(await link.count(), 1, `Desktop contents lost chapter ${number}`);
        await link.click();
      }
      await waitForChapter(page, number);
      if (width === 1440) await page.waitForFunction(number => document.querySelector(`nav[aria-label="보고서 목차"] a[href="#report-page-${number}"]`)?.hasAttribute("aria-current"), number);
    }
    // Wheel scrolling must move the document without requiring a viewer gesture.
    const beforeWheel = await page.evaluate(() => scrollY);
    await page.mouse.move(width / 2, height * .7);
    await page.mouse.wheel(0, 600);
    await page.waitForFunction(before => scrollY > before + 100, beforeWheel);
    await page.locator('[data-report-page="1"]').screenshot({ path: path.join(outputDir, `sample-report-${width}-page-1.png`) });
    await page.locator('[data-report-page="3"]').screenshot({ path: path.join(outputDir, `sample-report-${width}-page-3.png`) });
    assert.deepEqual(await storage(page), initialStorage, `${width}px: sample navigation changed assessment storage`);
    assert.equal(await page.getByRole("link", { name: "무료 AI 진단", exact: true }).getAttribute("href"), "/precheck");
    assert.equal(await page.getByRole("link", { name: "홈으로", exact: true }).getAttribute("href"), "/");

    if (width === 1440) {
      // Exercise the user's print control, then independently inspect its real PDF.
      await page.evaluate(() => { window.__samplePrintCalls = 0; window.print = () => { window.__samplePrintCalls += 1; }; });
      const printButton = page.getByRole("button", { name: "브라우저에서 인쇄/PDF 저장", exact: true });
      await printButton.click();
      await page.waitForFunction(() => window.__samplePrintCalls === 1);
      await page.emulateMedia({ media: "print" });
      assert(!await contents.isVisible(), "Contents navigation leaked into the PDF");
      assert(!await printButton.isVisible(), "Print control leaked into the PDF");
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
  console.log(`Sample report audit passed: shared paper template, seven actual report pages, exact tax totals, document scrolling at 390/1440px, contents navigation, unchanged customer storage, and seven unclipped A4 PDF pages. Artifacts: ${outputDir}`);
} finally {
  await browser.close();
}
