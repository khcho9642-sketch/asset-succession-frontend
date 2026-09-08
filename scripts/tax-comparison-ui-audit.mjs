import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { assertReportPrintBounds } from "./report-print-bounds.mjs";
import { assertPaperTemplate } from "./paper-report-audit.mjs";

// Synthetic customer examples only. Real model requests are disabled; this audit
// verifies the deterministic calculator and the actual chat-to-report handoff.
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

// Expected figures were independently worked from the rule schedule, not
// imported from the implementation under test. All amounts here are 원.
const fixtures = [
  {
    track: "gift", label: "현금 증여", narrative: "제 명의 예금 3억이 있어요. 성년 자녀 세 명에게 증여를 준비해요. 채무 없음, 과거 증여 없음.",
    values: { giftAmount: "3", recipientType: "adult_child", recipientCount: "3" },
    baseline: 38_800_000, alternative: 14_550_000, difference: 24_250_000,
    requiredKey: "giftAmount", changedValue: "4", baselineId: "gift-1-recipients", alternativeId: "gift-3-recipients",
  },
  {
    track: "inheritance", label: "상속 배분", narrative: "아버지 재산이에요. 건물 25억, 아파트 15억, 예금 10억, 배우자 있음, 성년 자녀 세 명, 채무 없음, 과거 증여 없음.",
    values: { estate: "50", debt: "0", financial: "10", financialDebt: "0", funeral: "0.05", spouse: "yes", children: "3", spouseAllocation: "15" },
    baseline: 1_394_375_000, alternative: 864_593_330, difference: 529_781_670,
    requiredKey: "estate", changedValue: "51", baselineId: "inheritance-minimum", alternativeId: "inheritance-statutory-spouse",
    additionalAmounts: [929_260_000],
  },
  {
    track: "capital_gains", label: "상가 양도", narrative: "제 명의 상가 10억을 양도하려고 해요. 채무 없음, 과거 증여 없음.",
    values: { salePrice: "10", purchasePrice: "5", expenses: "0.2", heldYears: "5" },
    baseline: 160_446_000, alternative: 156_222_000, difference: 4_224_000,
    requiredKey: "salePrice", changedValue: "11", baselineId: "capital-now", alternativeId: "capital-plus-one-year",
    additionalAmounts: [145_860_000, 14_586_000],
  },
  {
    track: "business_succession", label: "가업주식 증여", narrative: "제 명의 비상장 주식 60억이 있어요. 성년 자녀 한 명에게 가업승계를 준비해요. 채무 없음, 과거 증여 없음.",
    values: { businessValue: "60", businessYears: "10" },
    baseline: 2_439_550_000, alternative: 500_000_000, difference: 1_939_550_000,
    requiredKey: "businessValue", changedValue: "61", baselineId: "business-ordinary-gift", alternativeId: "business-special-gift",
  },
];

const won = value => `${value.toLocaleString("ko-KR")}원`;
const field = (page, key) => page.locator(`[data-tax-field="${key}"]`);
const finalConfirmation = page => page.getByRole("checkbox", { name: confirmation, exact: true });

async function assertNoOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, root: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert(dimensions.root <= dimensions.viewport + 2 && dimensions.body <= dimensions.viewport + 2, `${label}: horizontal overflow ${JSON.stringify(dimensions)}`);
}

async function getSnapshot(page) {
  return page.evaluate(key => JSON.parse(sessionStorage.getItem(key) ?? "null"), assessmentKey);
}

async function setField(page, key, value) {
  const control = field(page, key);
  await control.waitFor();
  const tagName = await control.evaluate(element => element.tagName);
  if (tagName === "SELECT") await control.selectOption(value);
  else if (await control.getAttribute("type") === "checkbox") await control.setChecked(value === "yes");
  else await control.fill(value);
}

async function openReview(page) {
  const heading = page.getByRole("heading", { name: "제가 전한 상황과 맞나요?", exact: true });
  if (await heading.isVisible()) return;
  const button = page.getByRole("button", { name: "정리 내용 확인하기", exact: true });
  if (!await button.isVisible()) await page.getByRole("button", { name: /현재 정리된 내용/ }).click();
  await button.click();
  await heading.waitFor();
}

async function enableTax(page) {
  const toggle = page.locator("[data-tax-enable]");
  if (await toggle.count() && !await toggle.isChecked()) await toggle.check();
  await page.locator("[data-tax-editor]").waitFor();
}

async function openSyntheticChat(context, fixture) {
  const page = await context.newPage();
  const response = await page.goto(`${baseURL}/precheck?purpose=${fixture.track}`, { waitUntil: "networkidle" });
  assert(response?.ok(), `${fixture.track}: chat route failed`);
  await page.getByText("AI 연결 전 · 입력 정리 모드", { exact: true }).waitFor();
  await page.locator("#diagnosis-message").fill(fixture.narrative);
  await page.getByRole("button", { name: "메시지 보내기", exact: true }).click();
  await page.waitForFunction(key => {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
    const facts = saved?.state?.facts ?? {};
    return Boolean(facts.owner && (facts.financialAssets || facts.realEstate || facts.businessAssets));
  }, draftKey);
  await openReview(page);
  await enableTax(page);
  assert.equal(await getSnapshot(page), null, "Opening tax review prematurely created a confirmed report");
  return page;
}

async function configure(page, fixture) {
  await setField(page, "track", fixture.track);
  for (const [key, value] of Object.entries(fixture.values)) await setField(page, key, value);
  await setField(page, "resident", "yes");
  await setField(page, "standardCase", "yes");
  await setField(page, "availableCash", "");
  await page.locator('[data-tax-comparison-status="ready"]').waitFor();
}

async function assertGoldenEditor(page, fixture) {
  assert.equal((await page.locator("[data-tax-baseline]").innerText()).trim(), won(fixture.baseline), `${fixture.track}: baseline tax`);
  assert.equal((await page.locator("[data-tax-alternative]").innerText()).trim(), won(fixture.alternative), `${fixture.track}: alternative tax`);
  assert.equal((await page.locator("[data-tax-difference]").innerText()).trim(), won(fixture.difference), `${fixture.track}: difference`);
}

async function checkInvalidationAndMissing(page, fixture) {
  await finalConfirmation(page).check();
  await setField(page, fixture.requiredKey, "");
  await page.locator('[data-tax-comparison-status="needs_info"]').waitFor();
  assert.equal(await page.locator("[data-tax-baseline]").count(), 0, "Missing required input was displayed as a calculated zero");
  assert(!await finalConfirmation(page).isChecked(), "A changed tax input kept an obsolete customer confirmation");
  assert(await page.getByRole("button", { name: finalButton, exact: true }).isDisabled(), "Incomplete tax inputs enabled report confirmation");
  await setField(page, fixture.requiredKey, fixture.values[fixture.requiredKey]);
  await page.locator('[data-tax-comparison-status="ready"]').waitFor();
  await finalConfirmation(page).check();
  await setField(page, fixture.requiredKey, fixture.changedValue);
  assert(!await finalConfirmation(page).isChecked(), "A valid changed amount kept an obsolete confirmation");
  await setField(page, fixture.requiredKey, fixture.values[fixture.requiredKey]);
  await setField(page, "resident", "no");
  await page.locator('[data-tax-comparison-status="unsupported"]').waitFor();
  assert.equal(await page.locator("[data-tax-baseline]").count(), 0, "An unsupported nonresident case leaked an ordinary resident tax");
  await setField(page, "resident", "yes");
  await page.locator('[data-tax-comparison-status="ready"]').waitFor();
  await assertGoldenEditor(page, fixture);
}

async function openConfirmedReport(page, fixture) {
  await finalConfirmation(page).check();
  await page.getByRole("button", { name: finalButton, exact: true }).click();
  await page.waitForURL("**/report-preview?assessment_id=**");
  await page.locator('[data-report-page="7"]').waitFor();
  assert.equal(await page.locator("[data-report-page]").count(), 7, `${fixture.track}: seven report sheets required`);
  await assertPaperTemplate(page, `${fixture.track} calculated report`);
  const snapshot = await getSnapshot(page);
  assert(snapshot?.taxComparisonInput?.confirmed, `${fixture.track}: report lacks confirmed tax conditions`);
  assert.equal(snapshot.taxComparisonInput.track, fixture.track);
  for (const [key, value] of Object.entries(fixture.values)) assert.equal(snapshot.taxComparisonInput.values[key], value, `${fixture.track}: confirmed ${key} changed during handoff`);
  assert.equal(snapshot.taxComparisonInput.values.standardCase, "yes");
  assert(Number.isFinite(Date.parse(snapshot.taxComparisonInput.confirmedAt)), "Tax conditions lack a confirmation timestamp");
  const text = await page.locator("body").innerText();
  for (const amount of [fixture.baseline, fixture.alternative, fixture.difference, ...(fixture.additionalAmounts ?? [])]) {
    assert(text.includes(won(amount)), `${fixture.track}: exact calculated ${won(amount)} missing from report`);
  }
  assert(!text.includes("계산엔진 연결 후 산정"), "Calculated report still shows an unimplemented engine placeholder");
  assert.equal(await page.locator('[data-tax-cash-status="unknown"]').count(), 1, "Unknown available cash must not become zero or inferred financial assets");
  await assertNoOverflow(page, `${fixture.track} report`);
  return snapshot;
}

async function auditPdf(page, fixture, snapshot) {
  const pdfPath = path.join(outputDir, `tax-${fixture.track}-report.pdf`);
  await page.emulateMedia({ media: "print" });
  try {
    await page.evaluate(async () => { await document.fonts.ready; });
    await assertPaperTemplate(page, `${fixture.track} calculated print report`);
    await assertReportPrintBounds(page, { outputPath: path.join(outputDir, `tax-${fixture.track}-print-bounds.json`), label: `${fixture.label} seven-page calculated report` });
    const body = await page.locator("body").innerText();
    assert(body.includes(snapshot.assessment_id), "Print report lost the customer confirmation identity");
    assert(!body.includes("대화 내용 수정") && !body.includes("PDF 저장"), "Print report leaked navigation controls");
    const pdf = await page.pdf({ path: pdfPath, format: "A4", printBackground: true, preferCSSPageSize: true });
    assert(pdf.byteLength > 20_000, "Calculated PDF is unexpectedly small");
    const { stdout } = await runFile("python", ["-c", "import json,sys; from pypdf import PdfReader; r=PdfReader(sys.argv[1]); print(json.dumps({'pages':len(r.pages),'sizes':[[float(p.mediabox.width),float(p.mediabox.height)] for p in r.pages]}))", pdfPath], { timeout: 15_000 });
    const physical = JSON.parse(stdout);
    assert.equal(physical.pages, 7, `${fixture.track}: seven physical PDF pages required`);
    assert(physical.sizes.every(([width, height]) => Math.abs(width - 595.28) < 1 && Math.abs(height - 841.89) < 1), "Calculated PDF must be A4 on every page");
    for (let sheet = 1; sheet <= 7; sheet += 1) await page.locator(`[data-report-page="${sheet}"]`).screenshot({ path: path.join(outputDir, `tax-${fixture.track}-page-${sheet}.png`) });
    observations.push({ name: "actual seven-page A4 tax PDF with all-content bounds", track: fixture.track, pages: physical.pages, bytes: pdf.byteLength, pdf: pdfPath });
  } finally { await page.emulateMedia({ media: "screen" }); }
}

async function assertDraftRestoration(page, fixture) {
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("AI 연결 전 · 입력 정리 모드", { exact: true }).waitFor();
  await openReview(page);
  await enableTax(page);
  assert.equal(await field(page, "track").inputValue(), fixture.track, "Matching facts lost the selected tax comparison");
  for (const [key, value] of Object.entries(fixture.values)) assert.equal(await field(page, key).inputValue(), value, `Matching facts lost ${key}`);
  assert(!await finalConfirmation(page).isChecked(), "Reload retained final customer confirmation");
  await assertGoldenEditor(page, fixture);
}

async function assertChangedFactsDiscardOldTax(page, fixture, snapshot) {
  await page.goto(`${baseURL}/precheck?purpose=${fixture.track}`, { waitUntil: "networkidle" });
  await page.getByText("AI 연결 전 · 입력 정리 모드", { exact: true }).waitFor();
  await openReview(page);
  await enableTax(page);
  await assertGoldenEditor(page, fixture);
  await finalConfirmation(page).check();
  await page.getByRole("button", { name: "금융자산 수정", exact: true }).first().click();
  await page.getByRole("textbox", { name: "금융자산 입력", exact: true }).fill("예금 4억");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  // A changed savings balance does not prove that the customer will gift all of it.
  await page.waitForFunction(() => document.querySelector('[data-tax-field="giftAmount"]')?.value === "");
  assert(!await field(page, "standardCase").isChecked(), "Changed chat facts retained an old tax scope confirmation");
  assert.equal(await field(page, "resident").inputValue(), "", "Changed chat facts retained an old tax residency confirmation");
  assert(!await finalConfirmation(page).isChecked(), "Changed chat facts retained the old final confirmation");
  assert.equal(await getSnapshot(page), null, "Changed chat facts retained an obsolete calculated report");
  await page.goto(`${baseURL}/report-preview?assessment_id=${snapshot.assessment_id}`, { waitUntil: "networkidle" });
  assert.equal(await page.locator("[data-report-page]").count(), 0, "A cleared report could still be reopened as a valid calculation");
  observations.push({ name: "changed facts discard old tax assumptions, confirmation and report", assessmentId: snapshot.assessment_id });
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1440]) {
    for (const fixture of fixtures) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, reducedMotion: "reduce" });
      context.on("page", page => page.on("pageerror", error => errors.push({ track: fixture.track, width, error: error.message })));
      await context.route("**/api/diagnosis", route => {
        if (route.request().method() === "GET") return route.fulfill({ json: { configured: false }, headers: { "cache-control": "no-store" } });
        providerRequests += 1;
        return route.fulfill({ status: 503, json: { error: { code: "AUDIT_PROVIDER_DISABLED", message: "Synthetic deterministic tax audit" } } });
      });
      const page = await openSyntheticChat(context, fixture);
      await configure(page, fixture);
      await assertGoldenEditor(page, fixture);
      await checkInvalidationAndMissing(page, fixture);
      if (width === 1440 && fixture.track === "gift") await assertDraftRestoration(page, fixture);
      await assertNoOverflow(page, `${width}px ${fixture.track} tax editor`);
      await page.screenshot({ path: path.join(outputDir, `tax-${fixture.track}-${width}-review.png`), fullPage: true });
      const snapshot = await openConfirmedReport(page, fixture);
      await page.screenshot({ path: path.join(outputDir, `tax-${fixture.track}-${width}-report.png`), fullPage: true });
      if (width === 1440) await auditPdf(page, fixture, snapshot);
      observations.push({ name: "chat → tax conditions → confirmed calculated report", width, track: fixture.track, assessmentId: snapshot.assessment_id, baseline: fixture.baseline, alternative: fixture.alternative, difference: fixture.difference });
      if (width === 1440 && fixture.track === "gift") await assertChangedFactsDiscardOldTax(page, fixture, snapshot);
      await context.close();
    }
  }
  assert.equal(providerRequests, 0, "Deterministic tax comparison attempted an AI provider request");
  assert.deepEqual(errors, [], "Tax UI produced browser errors");
  console.log(`Tax comparison UI audit passed: ${observations.length} flows, four tax tracks at 390px and 1440px, four seven-page PDFs.`);
} catch (error) {
  errors.push({ kind: "audit-failure", message: error.message, stack: error.stack });
  throw error;
} finally {
  await writeFile(path.join(outputDir, "tax-comparison-audit-report.json"), `${JSON.stringify({ status: errors.length ? "failed" : "passed", baseURL, providerInvoked: providerRequests > 0, providerRequests, observations, errors }, null, 2)}\n`);
  await browser.close();
}
