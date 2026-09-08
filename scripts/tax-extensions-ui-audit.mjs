import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { assertReportPrintBounds } from "./report-print-bounds.mjs";

// Synthetic families only. No provider is enabled: these journeys exercise the
// actual chat, conditional inputs, confirmation snapshot, calculator and PDF.
const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const outputDir = process.env.UI_AUDIT_DIR ?? "artifacts/ui-audit";
const assessmentKey = "as360.precheck.assessment.v1";
const draftKey = "as360.chat.draft.v1";
const confirmation = "정리된 내용이 제가 전달한 상황과 맞는지 확인했습니다.";
const finalButton = "확인한 내용으로 보고서 보기";
const runFile = promisify(execFile);
const observations = [];
const errors = [];
let providerRequests = 0;

// Independent tax-schedule arithmetic, in won, rather than importing expected
// results from the code under test. The transition example deliberately costs
// more in the future because the temporary exclusion has expired by then.
const housing = {
  id: "housing", track: "capital_gains", subtype: "capitalAsset", opposite: "commercial",
  narrative: "제 명의 아파트 20억을 양도하려고 해요. 채무 없음, 과거 증여 없음.",
  values: {
    capitalAsset: "home", salePrice: "20", purchasePrice: "8", expenses: "0",
    acquisitionDate: "2021-09-08", saleDate: "2026-09-08", residenceYears: "3",
    houseCount: "1", regulatedAtSale: "no", additionalResidence: "yes", regulatedAtAcquisition: "no",
  },
  baseline: 113_982_000, alternative: 97_405_000,
  baselineId: "housing-now", alternativeId: "housing-plus-one-year",
  required: "purchasePrice", obsolete: "acquisitionDate", preserved: "salePrice",
};
const business = {
  id: "business-inheritance", track: "business_succession", subtype: "businessMethod", opposite: "gift",
  narrative: "아버지 재산이에요. 비상장 주식 80억과 건물 20억을 가업상속으로 준비해요. 성년 자녀 두 명, 배우자 없음, 채무 없음, 과거 증여 없음.",
  values: {
    businessMethod: "inheritance", estate: "100", debt: "0", financial: "0", financialDebt: "0",
    funeral: "0.05", spouse: "no", children: "2", businessPropertyType: "corporate",
    inheritedBusinessValue: "80", businessEligiblePercent: "100", businessYears: "15",
    companySize: "small", eligibilityConfirmed: "yes",
  },
  baseline: 4_158_875_000, alternative: 424_860_000,
  baselineId: "business-inheritance-ordinary", alternativeId: "business-inheritance-deduction",
  required: "inheritedBusinessValue", obsolete: "estate", preserved: "businessYears",
};
const denseFixtures = [
  {
    ...housing, id: "housing-permit-transition",
    values: {
      capitalAsset: "home", salePrice: "20", purchasePrice: "8", expenses: "0",
      acquisitionDate: "2021-09-08", saleDate: "2026-09-08", residenceYears: "0",
      houseCount: "2", regulatedAtSale: "yes", additionalResidence: "no", singleHomeSpecial: "no",
      transitionCase: "yes", transitionWindow: "four", permitRequired: "yes", contractDate: "2026-05-10",
      depositPaid: "yes", permitApplicationDate: "2026-05-08", permitApproved: "yes",
    },
    baseline: 460_828_500, alternative: 783_678_500,
    conditionKey: "permitApproved",
  },
  {
    ...business, id: "business-inheritance-medium-spouse",
    values: {
      businessMethod: "inheritance", estate: "100", debt: "0", financial: "0", financialDebt: "0",
      funeral: "0.05", spouse: "yes", children: "2", spouseInheritance: "20",
      businessPropertyType: "corporate", inheritedBusinessValue: "80", businessEligiblePercent: "100",
      businessYears: "15", companySize: "medium", successorOtherNetAssets: "0",
      // Ordinary gross estate tax 32.875억원 × successor's actual 80% share.
      successorTaxWithoutDeduction: "26.3", eligibilityConfirmed: "yes",
    },
    baseline: 3_188_875_000, alternative: 0,
    conditionKey: "successorTaxWithoutDeduction",
  },
];

const won = value => `${value.toLocaleString("ko-KR")}원`;
const field = (page, key) => page.locator(`[data-tax-field="${key}"]`);
const finalConfirmation = page => page.getByRole("checkbox", { name: confirmation, exact: true });
const snapshot = page => page.evaluate(key => JSON.parse(sessionStorage.getItem(key) ?? "null"), assessmentKey);

async function setField(page, key, value) {
  const control = field(page, key);
  await control.waitFor();
  if (await control.evaluate(element => element.tagName) === "SELECT") await control.selectOption(value);
  else if (await control.getAttribute("type") === "checkbox") await control.setChecked(value === "yes");
  else await control.fill(value);
}

async function openReview(page) {
  const heading = page.getByRole("heading", { name: "제가 전한 상황과 맞나요?", exact: true });
  if (!await heading.isVisible()) {
    const button = page.getByRole("button", { name: "정리 내용 확인하기", exact: true });
    if (!await button.isVisible()) await page.getByRole("button", { name: /현재 정리된 내용/ }).click();
    await button.click();
    await heading.waitFor();
  }
  const toggle = page.locator("[data-tax-enable]");
  if (await toggle.count() && !await toggle.isChecked()) await toggle.check();
  await page.locator("[data-tax-editor]").waitFor();
}

async function startChat(context, fixture) {
  const page = await context.newPage();
  const response = await page.goto(`${baseURL}/precheck?purpose=${fixture.track}`, { waitUntil: "networkidle" });
  assert(response?.ok(), `${fixture.id}: chat route failed`);
  await page.getByText("AI 연결 전 · 입력 정리 모드", { exact: true }).waitFor();
  await page.locator("#diagnosis-message").fill(fixture.narrative);
  await page.getByRole("button", { name: "메시지 보내기", exact: true }).click();
  await page.waitForFunction(key => {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
    const facts = saved?.state?.facts ?? {};
    return Boolean(facts.owner && (facts.realEstate || facts.businessAssets));
  }, draftKey);
  await openReview(page);
  assert.equal(await snapshot(page), null, "Tax review prematurely created a report");
  return page;
}

async function configure(page, fixture) {
  await setField(page, "track", fixture.track);
  // Ordered fields expose their own dependent questions. Scope and residency
  // are confirmed after selectors, which intentionally invalidate eligibility.
  for (const [key, value] of Object.entries(fixture.values)) await setField(page, key, value);
  await setField(page, "resident", "yes");
  await setField(page, "standardCase", "yes");
  await setField(page, "availableCash", "");
  await page.locator('[data-tax-comparison-status="ready"]').waitFor();
}

async function assertGolden(page, fixture, report = false) {
  const prefix = report ? "data-tax-report" : "data-tax";
  for (const name of ["baseline", "alternative"]) {
    assert.equal((await page.locator(`[${prefix}-${name}]`).innerText()).trim(), won(fixture[name]), `${fixture.id}: ${name} ${report ? "report" : "editor"}`);
  }
  const difference = Math.abs(fixture.baseline - fixture.alternative);
  assert((await page.locator(`[${prefix}-difference]`).innerText()).includes(won(difference)), `${fixture.id}: exact tax difference missing`);
  if (report && fixture.alternative > fixture.baseline) {
    assert((await page.locator("[data-tax-report-difference]").innerText()).includes("증가"), "Expiring relief was incorrectly presented as savings");
  }
}

async function assertNoOverflow(page, name) {
  const sizes = await page.evaluate(() => ({ viewport: innerWidth, root: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert(sizes.root <= sizes.viewport + 2 && sizes.body <= sizes.viewport + 2, `${name}: horizontal overflow ${JSON.stringify(sizes)}`);
}

async function assertMissingAndSubtypeInvalidation(page, fixture) {
  await finalConfirmation(page).check();
  await setField(page, fixture.required, "");
  await page.locator('[data-tax-comparison-status="needs_info"]').waitFor();
  assert.equal(await page.locator("[data-tax-baseline]").count(), 0, "A missing condition was turned into a calculated zero");
  assert(!await finalConfirmation(page).isChecked(), "Required input change retained final confirmation");
  assert(await page.getByRole("button", { name: finalButton, exact: true }).isDisabled(), "Incomplete conditions enabled report handoff");
  await setField(page, fixture.required, fixture.values[fixture.required]);
  await page.locator('[data-tax-comparison-status="ready"]').waitFor();
  await finalConfirmation(page).check();
  await setField(page, fixture.subtype, fixture.opposite);
  assert(!await finalConfirmation(page).isChecked(), "Subtype change retained final confirmation");
  assert(!await field(page, "standardCase").isChecked(), "Subtype change reused a different legal scope");
  assert.equal(await field(page, "resident").inputValue(), "", "Subtype change reused residency confirmation");
  assert.equal(await field(page, fixture.obsolete).count(), 0, "Subtype change left obsolete conditions visible");
  assert.equal(await field(page, fixture.preserved).inputValue(), fixture.values[fixture.preserved], "Subtype change lost a shared numeric input");
  await page.waitForFunction(({ key, obsolete }) => {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
    return saved?.taxInput && !Object.hasOwn(saved.taxInput.values, obsolete);
  }, { key: draftKey, obsolete: fixture.obsolete });
  await configure(page, fixture);
  await assertGolden(page, fixture);
  observations.push({ name: "missing condition blocks report; subtype clears obsolete fields and confirmations", fixture: fixture.id });
}

async function assertHousingZero(page) {
  await setField(page, "salePrice", "11");
  await page.locator('[data-tax-comparison-status="ready"]').waitFor();
  await assertGolden(page, { ...housing, baseline: 0, alternative: 0 });
  assert(await page.getByText(/0원으로 표시된 안도 확인한 조건에 따라 계산한 결과/).isVisible(), "A supported exemption did not explain its calculated zero");
  await setField(page, "salePrice", housing.values.salePrice);
  await assertGolden(page, housing);
  observations.push({ name: "eligible 11억원 home produces a real zero, distinct from missing inputs" });
}

async function assertReload(page, fixture) {
  await page.waitForFunction(({ key, expected }) => {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
    return Object.entries(expected).every(([name, value]) => saved?.taxInput?.values[name] === value);
  }, { key: draftKey, expected: fixture.values });
  await finalConfirmation(page).check();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("AI 연결 전 · 입력 정리 모드", { exact: true }).waitFor();
  await openReview(page);
  for (const [key, value] of Object.entries(fixture.values)) assert.equal(await field(page, key).inputValue(), value, `Reload lost ${key}`);
  assert(!await finalConfirmation(page).isChecked(), "Reload retained obsolete final confirmation");
  await assertGolden(page, fixture);
}

async function confirmReport(page, fixture) {
  await finalConfirmation(page).check();
  await page.getByRole("button", { name: finalButton, exact: true }).click();
  await page.waitForURL("**/report-preview?assessment_id=**");
  await page.locator('[data-report-page="7"]').waitFor();
  assert.equal(await page.locator("[data-report-page]").count(), 7, "Exactly seven report sheets required");
  const saved = await snapshot(page);
  const input = saved?.taxComparisonInput;
  assert(input?.confirmed && Number.isFinite(Date.parse(input.confirmedAt)), "Report lacks dated customer confirmation");
  assert.equal(input.track, fixture.track);
  for (const [key, value] of Object.entries(fixture.values)) assert.equal(input.values[key], value, `${fixture.id}: ${key} changed during report handoff`);
  assert.equal(input.values.standardCase, "yes");
  assert.equal(input.values.resident, "yes");
  await assertGolden(page, fixture, true);
  for (const [id, amount] of [[fixture.baselineId, fixture.baseline], [fixture.alternativeId, fixture.alternative]]) {
    const cases = page.locator(`[data-tax-case="${id}"]`);
    assert(await cases.count() >= 1, `${fixture.id}: comparison case missing`);
    for (const item of await cases.all()) assert.equal(await item.getAttribute("data-tax-amount"), String(amount), `${fixture.id}: inconsistent table/calculation total`);
  }
  assert.equal(await page.locator('[data-tax-cash-status="unknown"]').count(), 1, "Unknown cash was replaced with asset value or zero");
  const inputText = await page.locator('[data-report-page="2"]').innerText();
  if (fixture.track === "capital_gains") assert(inputText.includes(fixture.values.acquisitionDate) && inputText.includes(fixture.values.saleDate), "Report lost exact dates");
  else assert(inputText.includes("피상속인") && inputText.includes("100%"), "Inheritance residency or corporate ratio rendered incorrectly");
  await assertNoOverflow(page, `${fixture.id} report`);
  return saved;
}

async function auditPdf(page, fixture, saved) {
  const stem = `tax-${fixture.id}`;
  const pdfPath = path.join(outputDir, `${stem}-report.pdf`);
  await page.emulateMedia({ media: "print" });
  try {
    await page.evaluate(async () => { await document.fonts.ready; });
    await assertReportPrintBounds(page, { outputPath: path.join(outputDir, `${stem}-print-bounds.json`), label: `${fixture.id} calculated report` });
    const fonts = await page.locator('[data-report-page="2"] dt, [data-report-page="2"] dd').evaluateAll(nodes => nodes.map(node => parseFloat(getComputedStyle(node).fontSize)));
    assert(fonts.length > 0 && fonts.every(size => size >= 11), `${fixture.id}: dense inputs shrank below 11px`);
    const text = await page.locator("body").innerText();
    assert(text.includes(saved.assessment_id), "Print report lost its confirmation identity");
    assert(!text.includes("대화 내용 수정") && !text.includes("PDF 저장"), "Print report leaked navigation");
    const pdf = await page.pdf({ path: pdfPath, format: "A4", printBackground: true, preferCSSPageSize: true });
    assert(pdf.byteLength > 20_000, "PDF unexpectedly small");
    const { stdout } = await runFile("python", ["-c", "import json,sys; from pypdf import PdfReader; r=PdfReader(sys.argv[1]); print(json.dumps({'pages':len(r.pages),'sizes':[[float(p.mediabox.width),float(p.mediabox.height)] for p in r.pages]}))", pdfPath], { timeout: 15_000 });
    const physical = JSON.parse(stdout);
    assert.equal(physical.pages, 7, `${fixture.id}: seven physical PDF pages required`);
    assert(physical.sizes.every(([w, h]) => Math.abs(w - 595.28) < 1 && Math.abs(h - 841.89) < 1), "Every PDF page must be A4");
    for (let sheet = 1; sheet <= 7; sheet += 1) await page.locator(`[data-report-page="${sheet}"]`).screenshot({ path: path.join(outputDir, `${stem}-page-${sheet}.png`) });
    observations.push({ name: "seven-page A4 PDF, uncut print geometry and readable conditional fields", fixture: fixture.id, pages: physical.pages, bytes: pdf.byteLength, pdf: pdfPath, inputRows: fonts.length / 2 });
  } finally { await page.emulateMedia({ media: "screen" }); }
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1440]) {
    const fixtures = width === 1440 ? [housing, business, ...denseFixtures] : [housing, business];
    for (const fixture of fixtures) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, reducedMotion: "reduce" });
      context.on("page", page => page.on("pageerror", error => errors.push({ fixture: fixture.id, width, message: error.message })));
      await context.route("**/api/diagnosis", route => {
        if (route.request().method() === "GET") return route.fulfill({ json: { configured: false }, headers: { "cache-control": "no-store" } });
        providerRequests += 1;
        return route.fulfill({ status: 503, json: { error: { code: "AUDIT_PROVIDER_DISABLED", message: "Synthetic deterministic tax audit" } } });
      });
      try {
        const page = await startChat(context, fixture);
        await configure(page, fixture);
        await assertGolden(page, fixture);
        if (!fixture.conditionKey) {
          await assertMissingAndSubtypeInvalidation(page, fixture);
          if (fixture.id === "housing") await assertHousingZero(page);
          if (width === 1440) await assertReload(page, fixture);
        } else {
          await finalConfirmation(page).check();
          await setField(page, fixture.conditionKey, "");
          await page.locator('[data-tax-comparison-status="needs_info"]').waitFor();
          assert.equal(await page.locator("[data-tax-baseline]").count(), 0, "Missing conditional eligibility retained calculated tax");
          assert(!await finalConfirmation(page).isChecked(), "Conditional eligibility change retained confirmation");
          await setField(page, fixture.conditionKey, fixture.values[fixture.conditionKey]);
          await assertGolden(page, fixture);
        }
        await assertNoOverflow(page, `${width}px ${fixture.id} editor`);
        await page.screenshot({ path: path.join(outputDir, `tax-${fixture.id}-${width}-review.png`), fullPage: true });
        const saved = await confirmReport(page, fixture);
        await page.screenshot({ path: path.join(outputDir, `tax-${fixture.id}-${width}-report.png`), fullPage: true });
        if (width === 1440) await auditPdf(page, fixture, saved);
        observations.push({ name: "chat → subtype conditions → confirmed calculated report", fixture: fixture.id, width, assessmentId: saved.assessment_id, baseline: fixture.baseline, alternative: fixture.alternative });
      } finally { await context.close(); }
    }
  }
  assert.equal(providerRequests, 0, "Deterministic calculation attempted a provider request");
  assert.deepEqual(errors, [], "Tax extensions produced browser errors");
  console.log(`Tax extensions UI audit passed: ${observations.length} checks, housing and business inheritance at 390px/1440px, four seven-page PDFs.`);
} catch (error) {
  errors.push({ kind: "audit-failure", message: error.message, stack: error.stack });
  throw error;
} finally {
  await writeFile(path.join(outputDir, "tax-extensions-audit-report.json"), `${JSON.stringify({ status: errors.length ? "failed" : "passed", baseURL, providerInvoked: providerRequests > 0, providerRequests, observations, errors }, null, 2)}\n`);
  await browser.close();
}
