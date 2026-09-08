import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { assertPaperTemplate, seededAssessment } from "./paper-report-audit.mjs";
import { assertReportPrintBounds } from "./report-print-bounds.mjs";

// CI only. Extend the existing synthetic 52억원 intake with explicitly supplied
// calculation conditions. Nothing here represents an actual customer election.
const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const applicationOrigin = new URL(baseURL).origin;
const outputDir = process.env.UI_AUDIT_DIR ?? "artifacts/ui-audit";
const assessmentKey = "as360.precheck.assessment.v1";
const runFile = promisify(execFile);
const observations = [];
const errors = [];
let providerRequests = 0;

// Independently worked expected 원 amounts, never imported from the engine:
// 52억 - 장례비 500만원 - 일괄 5억 - 배우자 최저 5억 - 금융 2억
// = 과표 3,995,000,000; 50% - 460,000,000 = 1,537,500,000;
// 기한 내 신고 3% 차감 = 1,491,375,000.
// 배우자 법정지분 floor(5,200,000,000 / 3) = 1,733,333,333;
// 과표 2,761,666,667 → 산출 944,666,666 → 공제 28,339,999;
// 10원 미만 끝수 처리 = 916,326,660.
const expected = { baseline: "1,491,375,000원", alternative: "916,326,660원", difference: "575,048,340원" };
const field = (page, key) => page.locator(`[data-tax-field="${key}"]`);
const stored = page => page.evaluate(key => JSON.parse(sessionStorage.getItem(key) ?? "null"), assessmentKey);

async function setField(page, key, value) {
  const control = field(page, key);
  await control.waitFor();
  if (await control.evaluate(element => element.tagName) === "SELECT") await control.selectOption(value);
  else if (await control.getAttribute("type") === "checkbox") await control.setChecked(value === "yes");
  else await control.fill(value);
}

async function assertNoOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, root: document.documentElement.scrollWidth, sheets: [...document.querySelectorAll("[data-report-page]")].map(sheet => ({ client: sheet.clientWidth, scroll: sheet.scrollWidth })) }));
  assert(dimensions.root <= dimensions.viewport + 2 && dimensions.sheets.every(sheet => sheet.scroll <= sheet.client + 2), `${label}: horizontal overflow ${JSON.stringify(dimensions)}`);
}

function assertIntakeUnchanged(snapshot, label) {
  assert.equal(snapshot.assessment_id, seededAssessment.assessment_id, `${label}: adding an estimate changed the assessment identity`);
  assert.equal(snapshot.created_at, seededAssessment.created_at, `${label}: original intake time was overwritten`);
  assert.deepEqual(snapshot.answers, seededAssessment.answers, `${label}: confirmed intake answers were overwritten by assumptions`);
  assert.deepEqual(snapshot.conversation, seededAssessment.conversation, `${label}: original facts, evidence, or unknown values were rewritten`);
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, reducedMotion: "reduce" });
    await context.addInitScript(({ origin, key, snapshot }) => {
      if (location.origin !== origin || sessionStorage.getItem("estimate52-audit-seeded")) return;
      sessionStorage.setItem(key, JSON.stringify(snapshot));
      sessionStorage.setItem("estimate52-audit-seeded", "yes");
    }, { origin: applicationOrigin, key: assessmentKey, snapshot: seededAssessment });
    await context.route("**/api/diagnosis", async route => {
      if (route.request().method() !== "GET") providerRequests += 1;
      await route.fulfill({ status: route.request().method() === "GET" ? 200 : 503, json: { configured: false } });
    });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push({ width, message: error.message, stack: error.stack ?? "" }));
    const response = await page.goto(`${baseURL}/report-preview?assessment_id=${seededAssessment.assessment_id}&source=chat`, { waitUntil: "networkidle" });
    assert(response?.ok(), `${width}px: saved report did not load`);
    await page.locator('[data-report-tax-setup][data-report-calculation-state="pending"]').waitFor();
    await page.locator('[data-report-page="7"]').waitFor();
    assert.equal(await page.locator("[data-tax-report-baseline]").count(), 0, "A legacy report manufactured tax before its missing conditions were confirmed");
    assert.deepEqual(await stored(page), seededAssessment, "Opening a legacy report mutated its snapshot");
    const toggle = page.locator("[data-report-tax-setup-toggle]");
    if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
    await page.locator("[data-tax-editor]").waitFor();

    assert.equal(await field(page, "estate").inputValue(), "52", "Confirmed estate total was not carried into the editor");
    assert.equal(await field(page, "financial").inputValue(), "12", "Confirmed financial assets were not carried forward");
    assert.equal(await field(page, "debt").inputValue(), "0", "Explicit no-debt answer was lost");
    assert.equal(await field(page, "spouse").inputValue(), "yes", "Confirmed spouse presence was lost");
    for (const key of ["children", "resident", "funeral", "availableCash"]) assert.equal(await field(page, key).inputValue(), "", `Unconfirmed ${key} was silently inferred`);
    assert(!await field(page, "standardCase").isChecked(), "Unknown earlier gifts or scope eligibility were silently confirmed");
    assert(!await page.locator("[data-report-tax-confirm]").isChecked(), "Restoring a report auto-confirmed new tax conditions");
    assert(await page.locator("[data-report-tax-submit]").isDisabled(), "A pending estimate enabled report completion");
    await page.locator("[data-report-tax-confirm]").check();
    assert(await page.locator("[data-report-tax-submit]").isDisabled(), "Confirmation bypassed missing estimate fields");
    assert.deepEqual(await stored(page), seededAssessment, "An incomplete calculation mutated the saved intake");

    // Each condition below is a customer action in this synthetic scenario.
    // The original transcript's unknown age/past-gift answers stay untouched.
    for (const [key, value] of Object.entries({ estate: "52", financial: "12", debt: "0", financialDebt: "0", spouse: "yes", children: "3", funeral: "0.05", resident: "yes", standardCase: "yes", availableCash: "" })) await setField(page, key, value);
    await page.locator('[data-tax-comparison-status="ready"]').waitFor();
    assert(!await page.locator("[data-report-tax-confirm]").isChecked(), "Changed calculation conditions retained old confirmation");
    assert(await page.locator("[data-report-tax-submit]").isDisabled(), "A complete estimate bypassed final confirmation");
    for (const [key, value] of Object.entries(expected)) assert.equal((await page.locator(`[data-tax-${key}]`).innerText()).trim(), value, `${width}px: independently calculated ${key} differs`);
    assert.deepEqual(await stored(page), seededAssessment, "Previewing a valid calculation changed the confirmed snapshot");

    await page.locator("[data-report-tax-confirm]").check();
    await setField(page, "estate", "");
    await page.locator('[data-tax-comparison-status="needs_info"]').waitFor();
    assert(!await page.locator("[data-report-tax-confirm]").isChecked(), "Removing a required field retained confirmation");
    assert(await page.locator("[data-report-tax-submit]").isDisabled(), "Removing an estate amount still allowed completion");
    assert.equal(await page.locator("[data-tax-baseline]").count(), 0, "An incomplete calculation was presented as zero tax");
    await setField(page, "estate", "52");
    await page.locator('[data-tax-comparison-status="ready"]').waitFor();
    await page.locator("[data-report-tax-confirm]").check();
    await setField(page, "estate", "53");
    assert(!await page.locator("[data-report-tax-confirm]").isChecked(), "A different valid estate kept obsolete confirmation");
    assert.deepEqual(await stored(page), seededAssessment, "An unconfirmed valid change mutated the report");
    await setField(page, "estate", "52");
    await page.locator('[data-tax-comparison-status="ready"]').waitFor();
    await assertNoOverflow(page, `${width}px expanded estimate editor`);
    await page.screenshot({ path: path.join(outputDir, `estimate52-${width}-conditions.png`), fullPage: true });
    await page.locator("[data-report-tax-confirm]").check();
    await page.locator("[data-report-tax-submit]").click();
    await page.locator('[data-report-mode="tax-comparison"][data-tax-report-status="ready"]').waitFor();
    assert.equal(await page.locator("[data-report-tax-setup]").count(), 0, "Completed conditions remained above the report");
    assert(await page.locator("[data-report-edit-conditions]").isVisible(), "The completed report lost its condition editor entry");
    await assertPaperTemplate(page, `${width}px estimated 52억원 report`);
    const snapshot = await stored(page);
    assertIntakeUnchanged(snapshot, `${width}px estimate handoff`);
    assert(snapshot.taxComparisonInput?.confirmed, "Estimate conditions were not saved as customer-confirmed");
    assert.equal(snapshot.taxComparisonInput.track, "inheritance");
    assert(Number.isFinite(Date.parse(snapshot.taxComparisonInput.confirmedAt)), "Tax conditions lack their own confirmation time");
    for (const [key, value] of Object.entries({ estate: "52", financial: "12", debt: "0", financialDebt: "0", spouse: "yes", children: "3", funeral: "0.05", resident: "yes", standardCase: "yes", availableCash: "" })) assert.equal(snapshot.taxComparisonInput.values[key], value, `Confirmed condition ${key} changed during handoff`);
    assert.equal((await page.locator("[data-tax-report-baseline]").innerText()).trim(), expected.baseline);
    assert.equal((await page.locator("[data-tax-report-alternative]").innerText()).trim(), expected.alternative);
    assert((await page.locator("[data-tax-report-difference]").innerText()).includes(expected.difference));
    assert.equal(await page.locator('[data-tax-cash-status="unknown"]').count(), 1, "Unknown available cash was turned into zero or all financial assets");
    await assertNoOverflow(page, `${width}px completed estimate report`);
    await page.locator('[data-report-page="1"]').screenshot({ path: path.join(outputDir, `estimate52-${width}-report.png`) });

    if (width === 1440) {
      await page.emulateMedia({ media: "print" });
      await assertPaperTemplate(page, "Estimated 52억원 print report");
      assert(!await page.locator("[data-report-tax-setup]").isVisible(), "Estimate setup leaked into the PDF");
      await assertReportPrintBounds(page, { outputPath: path.join(outputDir, "estimate52-print-bounds.json"), label: "52억원 confirmed estimate" });
      const pdfPath = path.join(outputDir, "estimate52-report.pdf");
      const pdf = await page.pdf({ path: pdfPath, format: "A4", printBackground: true, preferCSSPageSize: true });
      const { stdout } = await runFile("python", ["-c", "import json,sys; from pypdf import PdfReader; r=PdfReader(sys.argv[1]); print(json.dumps({'pages':len(r.pages),'sizes':[[float(p.mediabox.width),float(p.mediabox.height)] for p in r.pages]}))", pdfPath], { timeout: 15_000 });
      const physical = JSON.parse(stdout);
      assert.equal(physical.pages, 7, "Estimated report must contain exactly seven physical PDF pages");
      assert(physical.sizes.every(([width, height]) => Math.abs(width - 595.28) < 1 && Math.abs(height - 841.89) < 1), "Estimated report PDF pages must be A4");
      observations.push({ name: "52억원 synthetic confirmed estimate PDF", pdf: pdfPath, pages: physical.pages, bytes: pdf.byteLength });
      await page.emulateMedia({ media: "screen" });
    }

    await page.reload({ waitUntil: "networkidle" });
    await page.locator('[data-report-mode="tax-comparison"][data-tax-report-status="ready"]').waitFor();
    assertIntakeUnchanged(await stored(page), `${width}px persisted estimate reload`);
    assert.equal((await page.locator("[data-tax-report-baseline]").innerText()).trim(), expected.baseline, "Reload lost the confirmed estimate");
    observations.push({ name: "legacy 52억원 intake → explicit conditions → estimated report", width, assessmentId: snapshot.assessment_id, expected, originalIntakeUnchanged: true });
    await context.close();
  }
  assert.equal(providerRequests, 0, "Deterministic estimate completion invoked an AI provider");
  assert.deepEqual(errors, [], "Estimate conversion produced browser errors");
  await writeFile(path.join(outputDir, "estimate52-audit.json"), `${JSON.stringify({ status: "passed", providerRequests, observations, errors }, null, 2)}\n`);
  console.log(`Legacy estimate report audit passed: ${observations.length} observations; no AI provider requests.`);
} finally {
  await browser.close();
}
