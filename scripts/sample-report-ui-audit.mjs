import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { chromium } from "playwright";
import { seededAssessment } from "./paper-report-audit.mjs";

// CI browser gate for the original approved seven-image sample and its page viewer.
const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const outputDir = path.resolve(process.env.UI_AUDIT_DIR ?? ".tmp/sample-report-audit");
const assessmentKey = "as360.precheck.assessment.v1";
const runFile = promisify(execFile);
const expected = [
  ["핵심 요약", 1052, 1494], ["가족·자산 현황", 1052, 1494],
  ["세 가지 방향 비교", 1052, 1495], ["단계적 증여안", 1052, 1495],
  ["매각·상속안", 1054, 1492], ["현금·생활재원", 1053, 1493],
  ["실행 준비", 1052, 1495],
].map(([title, width, height], index) => ({ title, width, height, src: `/media/sample-report/page-${String(index + 1).padStart(2, "0")}.webp` }));
const observations = [];
const errors = [];
const apiRequests = [];
await mkdir(outputDir, { recursive: true });

const storage = page => page.evaluate(() => Object.fromEntries(Object.entries(sessionStorage).sort(([a], [b]) => a.localeCompare(b))));

async function ready(page) {
  await page.locator("[data-sample-image-report]").waitFor({ state: "attached" });
  await page.locator('[data-report-page="7"]').waitFor({ state: "attached" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.querySelectorAll("img[data-sample-page-image]")].map(image => image.decode()));
  });
}

async function assertSampleContent(page, label) {
  assert.equal(await page.locator("[data-sample-image-report]").count(), 1, `${label}: missing original image report`);
  assert.equal(await page.locator('[data-report-mode="tax-comparison"]').count(), 0, `${label}: unrelated computed report replaced the sample images`);
  assert.equal(await page.locator("img[data-sample-page-image]").count(), 7, `${label}: expected seven original images`);
  for (let number = 1; number <= 7; number++) {
    const sheet = page.locator(`[data-report-page="${number}"]`);
    const original = expected[number - 1];
    const text = await sheet.textContent();
    assert(text.includes(original.title), `${label}: page ${number} has the wrong accessible title`);
    assert(text.includes("샘플") && text.includes("전문가 검토 전"), `${label}: page ${number} must identify its fictional sample and review status`);
    assert(text.length > 100, `${label}: page ${number} lost its accessible report summary`);
    assert.equal(await sheet.getAttribute("id"), `report-page-${number}`, `${label}: page ${number} has no anchor target`);
    const image = sheet.locator("img[data-sample-page-image]");
    assert.equal(await image.getAttribute("src"), original.src, `${label}: page ${number} shows a different image`);
    assert((await image.getAttribute("alt"))?.length >= 10, `${label}: page ${number} lost descriptive alternative text`);
    const intrinsic = await image.evaluate(image => ({ complete: image.complete, width: image.naturalWidth, height: image.naturalHeight, objectFit: getComputedStyle(image).objectFit }));
    assert.deepEqual(intrinsic, { complete: true, width: original.width, height: original.height, objectFit: "contain" }, `${label}: page ${number} is broken, cropped or distorted`);
  }
  const text = await page.locator("[data-sample-image-report]").textContent();
  for (const amount of ["50억 원", "5억 원", "45억 원"]) assert(text.includes(amount), `${label}: original family example lost ${amount}`);
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
        const image = sheet.querySelector("img[data-sample-page-image]");
        const imageBox = image.getBoundingClientRect();
        const scale = Math.min(imageBox.width / image.naturalWidth, imageBox.height / image.naturalHeight);
        const imageWidth = image.naturalWidth * scale;
        const imageHeight = image.naturalHeight * scale;
        return {
          page: sheet.getAttribute("data-report-page"), left: box.left, right: box.right,
          top: box.top, bottom: box.bottom, width: box.width, height: box.height,
          clientWidth: sheet.clientWidth, scrollWidth: sheet.scrollWidth,
          clientHeight: sheet.clientHeight, scrollHeight: sheet.scrollHeight,
          image: {
            src: image.getAttribute("src"), objectFit: getComputedStyle(image).objectFit,
            left: imageBox.left, right: imageBox.right, top: imageBox.top, bottom: imageBox.bottom,
            width: imageBox.width, height: imageBox.height,
            contentWidth: imageWidth, contentHeight: imageHeight,
          },
        };
      }),
      arrows: [...document.querySelectorAll('button[aria-label="이전 페이지"], button[aria-label="다음 페이지"]')].map(button => {
        const box = button.getBoundingClientRect();
        const icon = button.querySelector("svg")?.getBoundingClientRect();
        return { label: button.getAttribute("aria-label"), width: box.width, height: box.height, iconWidth: icon?.width ?? 0, iconHeight: icon?.height ?? 0 };
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
  assert.equal(sheet.image.objectFit, "contain", `${label}: selected original image is cropped or stretched`);
  assert(sheet.image.left >= sheet.left - 2 && sheet.image.right <= sheet.right + 2 && sheet.image.top >= sheet.top - 2 && sheet.image.bottom <= sheet.bottom + 2, `${label}: image extends outside the sheet`);
  assert(sheet.image.contentWidth / sheet.width >= .98 && sheet.image.contentHeight / sheet.height >= .98, `${label}: original image no longer fills its uniform frame`);
  assert(Math.abs(sheet.width / sheet.height - 210 / 297) < .002, `${label}: uniform sheet is not A4-shaped`);
  assert(Math.max(sheet.width / stage.width, sheet.height / stage.height) >= .90, `${label}: selected page leaves unnecessary space instead of fitting its available area`);
  assert.deepEqual(geometry.overlappingControls, [], `${label}: a navigation button covers report content`);
  assert.equal(geometry.arrows.length, 2, `${label}: both page navigation arrows must remain available`);
  for (const arrow of geometry.arrows) {
    assert(arrow.width >= 52 && arrow.height >= 52, `${label}: ${arrow.label} has a touch target smaller than 52px`);
    assert(arrow.iconWidth >= 28 && arrow.iconHeight >= 28, `${label}: ${arrow.label} arrow is too small to see`);
  }
  return { label, ...geometry };
}

function assertSameSheetGeometry(reference, actual) {
  const first = reference.visible[0];
  const selected = actual.visible[0];
  for (const dimension of ["width", "height", "left", "top"]) {
    assert(Math.abs(selected[dimension] - first[dimension]) <= 1, `${actual.label}: sheet ${dimension} changed from ${first[dimension]} to ${selected[dimension]} when turning pages`);
  }
  assert.equal(selected.clientWidth, first.clientWidth, `${actual.label}: virtual sheet width changed`);
  assert.equal(selected.clientHeight, first.clientHeight, `${actual.label}: virtual sheet height changed`);
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

async function assertUniformPageSequence(page, label) {
  await selectChapter(page, 1);
  const first = await assertViewerLayout(page, `${label} page 1`);
  observations.push(first);
  for (let number = 2; number <= 7; number++) {
    await page.getByRole("button", { name: "다음 페이지", exact: true }).click();
    await waitForPage(page, number);
    const selected = await assertViewerLayout(page, `${label} page ${number}`);
    assertSameSheetGeometry(first, selected);
    observations.push(selected);
  }
  await selectChapter(page, 1);
  const returned = await assertViewerLayout(page, `${label} return to page 1`);
  assertSameSheetGeometry(first, returned);
  observations.push(returned);
}

async function assertSamplePrintBounds(page, outputPath) {
  const pages = await page.locator("[data-report-page]").evaluateAll(sheets => sheets.map(sheet => {
    const box = sheet.getBoundingClientRect();
    const image = sheet.querySelector("img[data-sample-page-image]");
    const imageBox = image.getBoundingClientRect();
    const rect = value => ({ left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height });
    return { page: sheet.getAttribute("data-report-page"), box: rect(box), image: rect(imageBox), objectFit: getComputedStyle(image).objectFit, scrollWidth: sheet.scrollWidth, clientWidth: sheet.clientWidth, scrollHeight: sheet.scrollHeight, clientHeight: sheet.clientHeight };
  }));
  const failures = pages.filter(({ box, image, objectFit, scrollWidth, clientWidth, scrollHeight, clientHeight }) =>
    Math.abs(box.width - 210 / 25.4 * 96) > 2 || Math.abs(box.height - 297 / 25.4 * 96) > 2
    || objectFit !== "contain" || image.left < box.left - 2 || image.right > box.right + 2
    || image.top < box.top - 2 || image.bottom > box.bottom + 2
    || image.width / box.width < .98 || image.height / box.height < .98
    || scrollWidth > clientWidth + 2 || scrollHeight > clientHeight + 2);
  const result = { status: pages.length === 7 && !failures.length ? "passed" : "failed", pages, failures };
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  assert.equal(pages.length, 7, "Print must contain all seven original image sheets");
  assert.deepEqual(failures, [], `Sample print images are clipped, resized or outside A4 bounds; see ${outputPath}`);
  return result;
}

// Inspect image drawing operations, including form wrappers, without decoding raster data.
const pdfImageAudit = `
import json,sys
from pypdf import PdfReader
from pypdf.generic import ContentStream
reader=PdfReader(sys.argv[1])
def images(stream, resources, depth=0):
    found=[]
    if stream is None or depth > 10: return found
    objects=resources.get('/XObject', {})
    if hasattr(objects,'get_object'): objects=objects.get_object()
    for operands,operator in ContentStream(stream,reader).operations:
        if operator != b'Do': continue
        obj=objects[operands[0]].get_object()
        if obj.get('/Subtype') == '/Image':
            found.append({'width':int(obj['/Width']),'height':int(obj['/Height'])})
        elif obj.get('/Subtype') == '/Form':
            found.extend(images(obj,obj.get('/Resources',resources),depth+1))
    return found
print(json.dumps({'pages':len(reader.pages),'sizes':[[float(p.mediabox.width),float(p.mediabox.height)] for p in reader.pages],'images':[images(p.get_contents(),p['/Resources']) for p in reader.pages]}))
`;

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
    await assertSampleContent(page, `${width}px direct visit`);
    assert.deepEqual(await storage(page), initialStorage, `${width}px: opening the sample changed assessment storage`);
    await waitForPage(page, 1);
    const first = await assertViewerLayout(page, `${width}px screen`);
    observations.push(first);
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
      const selected = await assertViewerLayout(page, `${width}px page ${number}`);
      assertSameSheetGeometry(first, selected);
      observations.push(selected);
    }
    assert(await next.isDisabled(), "Next button should be disabled at the last page");
    await previous.click();
    await waitForPage(page, 6);
    for (const number of [7, 3, 1]) await selectChapter(page, number);
    const returned = await assertViewerLayout(page, `${width}px return to page 1`);
    assertSameSheetGeometry(first, returned);
    observations.push(returned);
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
    await assertUniformPageSequence(page, `${width}px expanded`);
    await selectChapter(page, 3);
    await page.getByRole("button", { name: "기본 화면", exact: true }).click();
    await waitForPage(page, 3);
    const resized = { width: width === 390 ? 844 : 1024, height: width === 390 ? 390 : 768 };
    await page.setViewportSize(resized);
    await waitForPage(page, 3);
    observations.push(await assertViewerLayout(page, `${width}px resized to ${resized.width}x${resized.height}`));
    await assertUniformPageSequence(page, `${width}px resized to ${resized.width}x${resized.height}`);
    await selectChapter(page, 3);
    await page.setViewportSize({ width, height });
    await waitForPage(page, 3);
    const restored = await assertViewerLayout(page, `${width}px restored viewport`);
    assertSameSheetGeometry(normal, restored);
    observations.push(restored);
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
      await assertSampleContent(page, "Sample print report");
      const bounds = await assertSamplePrintBounds(page, path.join(outputDir, "sample-report-print-bounds.json"));
      const pdfPath = path.join(outputDir, "sample-report-seven-pages.pdf");
      const pdf = await page.pdf({ path: pdfPath, format: "A4", printBackground: true, preferCSSPageSize: true });
      const { stdout } = await runFile("python", ["-c", pdfImageAudit, pdfPath], { timeout: 15_000 });
      const physical = JSON.parse(stdout);
      assert.equal(physical.pages, 7, "Sample PDF must contain exactly seven physical pages");
      assert(physical.sizes.every(([width, height]) => Math.abs(width - 595.28) < 1 && Math.abs(height - 841.89) < 1), "Every sample PDF page must be A4");
      for (const [index, images] of physical.images.entries()) {
        const original = expected[index];
        assert.equal(images.length, 1, `Physical PDF page ${index + 1} must contain its single original report image`);
        const image = images[0];
        assert.equal(image.width, original.width, `Physical PDF page ${index + 1} changed image resolution`);
        assert.equal(image.height, original.height, `Physical PDF page ${index + 1} changed image resolution`);
      }
      observations.push({ media: "print", pages: physical.pages, sizes: physical.sizes, images: physical.images, boundsStatus: bounds.status, pdf: pdfPath, bytes: pdf.byteLength });
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
  console.log(`Sample report audit passed: seven original report images and accessible summaries, identical sheet geometry across all seven pages at 390/1440/1920px and in expanded/resized viewports, contained images, visible navigation arrows, touch/keyboard/contents navigation, unchanged customer storage, and seven unclipped A4 image PDF pages. Artifacts: ${outputDir}`);
} catch (error) {
  await writeFile(path.join(outputDir, "sample-report-audit.json"), `${JSON.stringify({ status: "failed", baseURL, expected, observations, errors, apiRequests, failure: error.stack || String(error) }, null, 2)}\n`);
  throw error;
} finally {
  await browser.close();
}
