import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { assertReportPrintBounds } from "./report-print-bounds.mjs";

// CI browser regression. All diagnosis requests are intercepted: no provider
// credentials, billable requests, or real customer data are used by this audit.
const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const applicationOrigin = new URL(baseURL).origin;
const outputDir = process.env.UI_AUDIT_DIR ?? "artifacts/ui-audit";
const draftKey = "as360.chat.draft.v1";
const assessmentKey = "as360.precheck.assessment.v1";
const confirmation = "정리된 내용이 제가 전달한 상황과 맞는지 확인했습니다.";
const finalButton = "확인한 내용으로 보고서 보기";
const reportEditLink = "대화 내용 수정";
const scenario = "아버지 재산이에요. 건물 25억, 아파트 15억, 예금 10억, 배우자 있음, 자녀 셋, 채무 없음, 과거 증여 없음, 세금 부담을 줄이고 싶어요.";
const observations = [];
const errors = [];
const runFile = promisify(execFile);
let postCount = 0;
await mkdir(outputDir, { recursive: true });

async function newContext(browser, { width = 1440, configured = false, post, storage } = {}) {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, reducedMotion: "reduce" });
  // addInitScript also runs for the initial opaque about:blank document.
  // Seed storage only after navigation reaches the application origin.
  if (storage === "blocked") await context.addInitScript(origin => {
    if (window.location.origin !== origin) return;
    Object.defineProperty(window, "sessionStorage", { configurable: true, get() { throw new DOMException("Storage is blocked", "SecurityError"); } });
  }, applicationOrigin);
  if (storage === "corrupt") await context.addInitScript(({ key, origin }) => {
    if (window.location.origin !== origin) return;
    if (!sessionStorage.getItem("chat-audit-corrupt-seeded")) {
      sessionStorage.setItem(key, '{"version":1,"state":');
      sessionStorage.setItem("chat-audit-corrupt-seeded", "yes");
    }
  }, { key: draftKey, origin: applicationOrigin });
  await context.route("**/api/diagnosis", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { configured }, headers: { "cache-control": "no-store" } });
    postCount += 1;
    if (post) {
      try { return await post(route); }
      catch (error) {
        errors.push(`Mock AI transport: ${error.message}`);
        return route.fulfill({ status: 502, json: { error: { code: "AUDIT_MOCK_FAILED", message: "Audit mock failed" } } });
      }
    }
    errors.push("Guided mode unexpectedly requested an AI response.");
    await route.fulfill({ status: 503, json: { error: { code: "AI_NOT_CONFIGURED", message: "Audit: provider is disabled" } } });
  });
  context.on("page", page => page.on("pageerror", error => errors.push({
    kind: "pageerror", message: error.message, stack: error.stack ?? "", url: page.url(),
    fixture: { storage: storage ?? "normal", configured, width },
  })));
  return context;
}

async function openChat(page, { purpose = "", configured = false } = {}) {
  const response = await page.goto(`${baseURL}/precheck${purpose ? `?purpose=${purpose}` : ""}`, { waitUntil: "networkidle" });
  assert(response?.ok(), "Chat route did not return HTTP success");
  await page.getByRole("heading", { name: "먼저, 이야기를 들려주세요." }).waitFor();
  await page.getByText(configured ? "AI와 대화 중" : "AI 연결 전 · 입력 정리 모드", { exact: true }).waitFor();
}

async function assertNoOverflow(page, label) {
  const layout = await page.evaluate(() => ({ viewport: innerWidth, root: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert(layout.root <= layout.viewport + 2 && layout.body <= layout.viewport + 2, `${label}: horizontal overflow ${JSON.stringify(layout)}`);
}

async function assertMobileChatFit(page, label) {
  const layout = await page.evaluate(() => {
    const workspace = document.querySelector('[data-chat-layout="mobile-fit-v1"]');
    const composer = document.querySelector("#diagnosis-message")?.closest("form");
    const sendButton = composer?.querySelector('button[aria-label="메시지 보내기"]');
    const rect = element => element ? { top: element.getBoundingClientRect().top, bottom: element.getBoundingClientRect().bottom, height: element.getBoundingClientRect().height } : null;
    return { height: visualViewport?.height ?? innerHeight, workspace: rect(workspace), composer: rect(composer), send: rect(sendButton) };
  });
  assert(layout.composer && layout.send, `${label}: composer controls are missing`);
  assert(layout.composer.top >= 0 && layout.composer.bottom <= layout.height + 2, `${label}: composer is clipped ${JSON.stringify(layout)}`);
  assert(layout.send.height >= 44 && layout.send.bottom <= layout.height + 2, `${label}: send button has an inaccessible tap target`);
  await assertNoOverflow(page, label);
}

async function draft(page) {
  return page.evaluate(key => JSON.parse(sessionStorage.getItem(key) ?? "null"), draftKey);
}

async function waitFact(page, key, expected) {
  await page.waitForFunction(({ storageKey, key, expected }) => {
    try { return JSON.parse(sessionStorage.getItem(storageKey) ?? "null")?.state?.facts?.[key]?.value === expected; }
    catch { return false; }
  }, { storageKey: draftKey, key, expected });
}

async function send(page, text) {
  await page.locator("#diagnosis-message").fill(text);
  await page.getByRole("button", { name: "메시지 보내기", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#diagnosis-message")?.value === "");
}

async function openReview(page) {
  const review = page.getByRole("button", { name: "세액 계산·상세 보고서 준비", exact: true });
  await review.click();
  await page.getByRole("heading", { name: "제가 전한 상황과 맞나요?" }).waitFor();
  await page.locator("[data-tax-editor]").waitFor();
  assert.equal(await page.locator("[data-tax-enable]").count(), 0, "Tax estimates must not have an opt-out control");
  assert(await page.getByRole("button", { name: finalButton, exact: true }).isDisabled(), "Report was enabled before explicit confirmation");
}

async function editField(page, label, text) {
  // Locators use the primary review editor's accessible labels.
  await page.getByRole("button", { name: `${label} 수정`, exact: true }).first().click();
  await page.getByRole("textbox", { name: `${label} 입력`, exact: true }).fill(text);
  await page.getByRole("button", { name: "저장", exact: true }).click();
}

const taxField = (page, key) => page.locator(`[data-tax-field="${key}"]`);

async function setTaxField(page, key, value) {
  const control = taxField(page, key);
  await control.waitFor();
  if (await control.evaluate(element => element.tagName) === "SELECT") await control.selectOption(value);
  else if (await control.getAttribute("type") === "checkbox") await control.setChecked(value === "yes");
  else await control.fill(value);
}

async function configureSyntheticInheritance(page, { estate = "50", financial = "10" } = {}) {
  // The narrative deliberately leaves children's ages unknown. These are
  // separate, explicitly entered calculation assumptions for this synthetic
  // example, not facts extracted from that narrative or inferred defaults.
  await setTaxField(page, "track", "inheritance");
  for (const [key, value] of Object.entries({ estate, financial, debt: "0", financialDebt: "0", funeral: "0.05", spouse: "yes", children: "3", spouseAllocation: "15", resident: "yes", standardCase: "yes", availableCash: "" })) {
    await setTaxField(page, key, value);
  }
  await page.locator('[data-tax-comparison-status="ready"]').waitFor();
  assert(!await page.getByRole("checkbox", { name: confirmation, exact: true }).isChecked(), "Entering tax conditions must still require customer confirmation");
  assert(await page.getByRole("button", { name: finalButton, exact: true }).isDisabled(), "Ready tax conditions bypassed customer confirmation");
}

async function assertIncompleteTaxBlocksReport(page, label) {
  await page.locator('[data-tax-comparison-status="needs_info"]').waitFor();
  assert.equal(await page.locator("[data-tax-baseline]").count(), 0, `${label}: missing conditions produced a tax amount`);
  const checkbox = page.getByRole("checkbox", { name: confirmation, exact: true });
  if (await checkbox.isEnabled()) await checkbox.check();
  assert(await page.getByRole("button", { name: finalButton, exact: true }).isDisabled(), `${label}: customer confirmation bypassed incomplete tax conditions`);
  assert.equal(await snapshot(page), null, `${label}: incomplete tax conditions retained a report snapshot`);
  assert.equal(await page.locator("[data-report-page]").count(), 0, `${label}: an incomplete estimate rendered report pages`);
}

async function confirmReport(page, label, calculation = {}) {
  await configureSyntheticInheritance(page, calculation);
  const expectedBaseline = (await page.locator("[data-tax-baseline]").innerText()).trim();
  const expectedAlternative = (await page.locator("[data-tax-alternative]").innerText()).trim();
  // Independent golden amounts for the original 50억 synthetic estate.
  if ((calculation.estate ?? "50") === "50") {
    assert.equal(expectedBaseline, "1,394,375,000원", `${label}: baseline estimate changed`);
    assert.equal(expectedAlternative, "864,593,330원", `${label}: alternative estimate changed`);
  }
  await page.getByRole("checkbox", { name: confirmation, exact: true }).check();
  await page.getByRole("button", { name: finalButton, exact: true }).click();
  await page.waitForURL("**/report-preview?assessment_id=**");
  await page.locator('[data-report-template="paper-seven-v1"] [data-report-page="7"]').waitFor();
  assert.equal(await page.locator("[data-report-page]").count(), 7, `${label}: report does not have seven pages`);
  assert.equal(await page.locator('[data-report-mode="tax-comparison"][data-tax-report-status="ready"]').count(), 1, `${label}: report omitted the required ready estimate`);
  assert.equal((await page.locator("[data-tax-report-baseline]").innerText()).trim(), expectedBaseline, `${label}: report estimate differs from the confirmed preview`);
  assert.equal((await page.locator("[data-tax-report-alternative]").innerText()).trim(), expectedAlternative, `${label}: report alternative differs from the confirmed preview`);
  assert.equal(await page.locator('[data-tax-cash-status="unknown"]').count(), 1, `${label}: unknown payment cash became an amount`);
  assert.match(new URL(page.url()).searchParams.get("assessment_id") ?? "", /^AS360-\d{8}-[A-Z0-9]+$/);
  const text = await page.locator("body").innerText();
  for (const invented of ["0.5억 산출세액", "0.2억 산출세액", "0.3억 절세 예상", "9.5~12억", "6.3~8.6억", "inheritance-01-current-structure", "900억"]) {
    assert(!text.includes(invented), `${label}: report exposed unsupported output ${invented}`);
  }
  assert(text.includes("과세표준"), `${label}: report must explain the calculation scope`);
  await assertNoOverflow(page, label);
  return new URL(page.url()).searchParams.get("assessment_id");
}

async function snapshot(page) {
  return page.evaluate(key => JSON.parse(sessionStorage.getItem(key) ?? "null"), assessmentKey);
}

async function auditConfirmedPdf(page, assessmentId) {
  const pdfPath = path.join(outputDir, "chat-confirmed-report.pdf");
  await page.emulateMedia({ media: "print" });
  try {
    await page.evaluate(async () => { await document.fonts.ready; });
    assert.equal(await page.locator("[data-report-page]").count(), 7);
    const printText = await page.locator("body").innerText();
    assert(printText.includes(assessmentId), "Print report lost the confirmed assessment ID");
    assert(!printText.includes(reportEditLink) && !printText.includes("PDF 저장"), "Print report leaked navigation controls");
    await assertReportPrintBounds(page, { outputPath: path.join(outputDir, "chat-print-bounds.json"), label: "Confirmed chat report" });
    const pdf = await page.pdf({ path: pdfPath, format: "A4", printBackground: true, preferCSSPageSize: true });
    assert(pdf.byteLength > 20_000, "Confirmed chat PDF is unexpectedly small");
    const { stdout } = await runFile("python", ["-c", "import json,sys; from pypdf import PdfReader; r=PdfReader(sys.argv[1]); print(json.dumps({'pages':len(r.pages),'sizes':[[float(p.mediabox.width),float(p.mediabox.height)] for p in r.pages]}))", pdfPath], { timeout: 15_000 });
    const inspected = JSON.parse(stdout);
    assert.equal(inspected.pages, 7, "Confirmed chat must produce exactly seven physical PDF pages");
    assert(inspected.sizes.every(([width, height]) => Math.abs(width - 595.28) < 1 && Math.abs(height - 841.89) < 1), "Confirmed chat PDF pages must all be A4");
    observations.push({ name: "confirmed chat actual A4 PDF", assessmentId, pdf: pdfPath, pages: inspected.pages, bytes: pdf.byteLength });
  } finally { await page.emulateMedia({ media: "screen" }); }
}

function assertGroundedSnapshot(value, financial = "10") {
  assert(value, "Confirmed report snapshot is missing");
  assert.equal(value.conversation.mode, "chat");
  assert.deepEqual(value.answers.assets.assetAmounts, { "부동산": "40", "금융자산": financial });
  assert.equal(value.answers.family.facts["자녀 수"], "3명");
  assert.equal(value.answers.family.facts["성년 자녀 수"], undefined, "Unprovided child ages were invented");
  assert.equal(value.answers.family.facts["미성년 자녀 수"], undefined, "Unprovided child ages were invented");
  assert.match(value.answers.assets.facts["소유자 관계"], /아버지/);
  assert.equal(value.answers.review.taxBaseAmounts, undefined, "Unprovided taxable base was invented");
  assert(value.conversation.confirmed_facts.every(fact => fact.confidence === "customer_confirmed" && fact.raw_text.length > 0), "Facts must retain explicit confirmation and original evidence");
  assert(value.taxComparisonInput?.confirmed, "A confirmed chat report omitted its required tax conditions");
  assert.equal(value.taxComparisonInput.track, "inheritance");
  assert.equal(value.taxComparisonInput.values.financial, financial);
  assert.equal(value.taxComparisonInput.values.availableCash ?? "", "", "Unknown available payment cash was inferred from financial assets");
  assert(Number.isFinite(Date.parse(value.taxComparisonInput.confirmedAt)), "Tax conditions lack a confirmation timestamp");
}

function sseReply({ messageId = "audit-ai-answer", text, proposals = [], finishReason = "stop" }) {
  const events = [
    { type: "start", messageId }, { type: "start-step" },
    { type: "tool-input-available", toolCallId: `${messageId}-tool`, toolName: "proposeFacts", input: { facts: proposals } },
    { type: "tool-output-available", toolCallId: `${messageId}-tool`, output: { proposals } },
    { type: "text-start", id: `${messageId}-text` },
    { type: "text-delta", id: `${messageId}-text`, delta: text },
    { type: "text-end", id: `${messageId}-text` },
    { type: "finish-step" }, { type: "finish", finishReason },
  ];
  return { contentType: "text/event-stream", headers: { "x-vercel-ai-ui-message-stream": "v1", "cache-control": "no-cache" }, body: `${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n` };
}

const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1440]) {
    let requests = 0;
    const factsText = "고인 명의 주식 10억, 유언 모름";
    const reviewText = "현재 판단\n자녀 배제 가능성을 확정하기 전에 유언과 상속인 관계 확인이 우선입니다.\n\n우선할 일\n주식 잔고 내역과 유언 관련 자료를 준비합니다.\n\n확인할 사항\n주식 평가액과 유언은 확인 전이며 세액은 아직 계산하지 않았습니다.";
    const context = await newContext(browser, { width, configured: true, post: async route => {
      requests++;
      const request = route.request().postDataJSON();
      if (requests === 1) return route.fulfill(sseReply({ messageId: "brief-intake", text: JSON.stringify({ message: "어느 분의 재산인지 확인해 주세요.", choices: ["고인", "본인"], selectionMode: "single" }), proposals: [
        { key: "financialAssets", value: "주식 10억", evidence: factsText },
        { key: "unconfirmed", value: "유언 모름", evidence: factsText },
      ] }));
      assert.equal(requests, 2, "Opening the saved brief report caused another AI request");
      assert(request.messages.at(-1).parts[0].text.includes("간략 검토보고서"));
      assert.equal(request.facts.financialAssets.value, "주식 10억");
      assert.equal(request.facts.owner, undefined, "Missing owner was fabricated to unlock a brief report");
      return route.fulfill(sseReply({ messageId: "brief-conclusion", text: JSON.stringify({ message: reviewText, choices: [], selectionMode: "single" }) }));
    } });
    const page = await context.newPage();
    await openChat(page, { configured: true });
    await send(page, factsText);
    await waitFact(page, "financialAssets", "주식 10억");
    await page.getByRole("button", { name: "간략 검토보고서 만들기", exact: true }).click();
    await page.getByRole("heading", { name: "간략 검토보고서", exact: true }).waitFor();
    const report = page.locator("[data-chat-brief-report]");
    assert((await report.innerText()).includes("자녀 배제 가능성을 확정하기 전에"));
    assert((await report.innerText()).includes("재산 소유자 확인 필요"));
    assert((await report.innerText()).includes("세액 미산정"));
    assert.equal(await snapshot(page), null, "Brief report bypassed the tax report confirmation gate");
    await assertNoOverflow(page, `${width}px brief report`);
    await page.screenshot({ path: path.join(outputDir, `chat-brief-${width}.png`), fullPage: true });
    if (width === 1440) {
      await page.emulateMedia({ media: "print" });
      const pdfPath = path.join(outputDir, "chat-brief-report.pdf");
      await page.pdf({ path: pdfPath, format: "A4", printBackground: true, preferCSSPageSize: true });
      const { stdout } = await runFile("python", ["-c", "import json,sys; from pypdf import PdfReader; r=PdfReader(sys.argv[1]); print(json.dumps({'pages':len(r.pages),'text':''.join(p.extract_text() or '' for p in r.pages)}))", pdfPath], { timeout: 15_000 });
      const pdf = JSON.parse(stdout);
      assert(pdf.pages >= 1 && pdf.pages <= 2, `Brief report produced ${pdf.pages} PDF pages`);
      assert(pdf.text.replace(/\s+/g, "").includes("간략검토보고서"), "PDF lost the brief report heading");
      assert(!pdf.text.includes("브라우저에서 인쇄"), "PDF leaked print controls");
      await page.emulateMedia({ media: "screen" });
    }
    await page.getByRole("button", { name: "세액 계산·상세 보고서 준비", exact: true }).click();
    assert(await page.getByRole("button", { name: finalButton, exact: true }).isDisabled(), "Brief report completed missing calculation conditions");
    await page.getByRole("button", { name: "간략 검토보고서 보기", exact: true }).click();
    await page.getByRole("heading", { name: "간략 검토보고서", exact: true }).waitFor();
    await page.getByRole("button", { name: "대화로 돌아가기", exact: true }).click();
    await openChat(page, { configured: true });
    await page.getByRole("button", { name: "간략 검토보고서 보기", exact: true }).click();
    await page.getByRole("heading", { name: "간략 검토보고서", exact: true }).waitFor();
    assert.equal(requests, 2, "Restoring a brief report repeated the provider call");
    observations.push({ name: `${width}px brief report before tax setup, PDF, return and restore`, requests });
    await context.close();
  }
  for (const width of [390, 1440]) {
    const context = await newContext(browser, { width });
    const page = await context.newPage();
    await openChat(page);
    await assertNoOverflow(page, `${width}px empty chat`);
    assert.equal(await page.getByRole("log", { name: "대화 내용", exact: true }).evaluate(element => element.scrollTop), 0, `${width}px empty transcript must start at the welcome title`);
    await page.screenshot({ path: path.join(outputDir, `chat-${width}-conversation.png`), fullPage: true });
    assert(await page.getByRole("button", { name: "메시지 보내기", exact: true }).isDisabled(), "Empty send must be disabled");
    await page.locator("#diagnosis-message").fill(" \n ");
    assert(await page.getByRole("button", { name: "메시지 보내기", exact: true }).isDisabled(), "Whitespace send must be disabled");

    await page.locator("#diagnosis-message").fill("아버지");
    await page.locator("#diagnosis-message").dispatchEvent("compositionstart");
    await page.locator("#diagnosis-message").press("Enter");
    assert.equal((await draft(page)).state.messages.length, 0, "IME composition Enter sent an incomplete message");
    assert.match(await page.locator("#diagnosis-message").inputValue(), /아버지/);
    await page.locator("#diagnosis-message").dispatchEvent("compositionend");
    await page.locator("#diagnosis-message").fill("줄바꿈 확인");
    await page.locator("#diagnosis-message").press("Shift+Enter");
    assert((await page.locator("#diagnosis-message").inputValue()).includes("\n"), "Shift+Enter did not insert a newline");
    assert.equal((await draft(page)).state.messages.length, 0, "Shift+Enter submitted the message");

    await send(page, scenario);
    await waitFact(page, "financialAssets", "예금 10억");
    const captured = await draft(page);
    assert(captured.state.facts.realEstate.value.includes("건물 25억") && captured.state.facts.realEstate.value.includes("아파트 15억"), "Multiple properties were not retained");
    assert.equal(await snapshot(page), null, "A draft created an assessment without customer confirmation");
    await assertNoOverflow(page, `${width}px populated chat`);
    await page.reload({ waitUntil: "networkidle" });
    await waitFact(page, "financialAssets", "예금 10억");
    assert((await draft(page)).state.messages.some(message => message.text === scenario), "Reload lost the transcript");
    await openReview(page);
    assert.equal(await snapshot(page), null, "Opening review created an assessment without confirmation");
    await assertNoOverflow(page, `${width}px review`);
    await page.screenshot({ path: path.join(outputDir, `chat-${width}-review.png`), fullPage: true });
    const originalId = await confirmReport(page, `${width}px original report`);
    assertGroundedSnapshot(await snapshot(page));
    assert((await page.locator("body").innerText()).includes("5,000,000,000원"), "Report omitted the confirmed 50억 asset sum");
    await page.screenshot({ path: path.join(outputDir, `chat-${width}-report.png`), fullPage: true });
    if (width === 1440) await auditConfirmedPdf(page, originalId);

    await page.getByRole("link", { name: reportEditLink, exact: true }).click();
    await page.waitForURL(url => url.pathname === "/precheck");
    await page.getByRole("heading", { name: "먼저, 이야기를 들려주세요." }).waitFor();
    await page.getByText("AI 연결 전 · 입력 정리 모드", { exact: true }).waitFor();
    await openReview(page);
    const estateBeforeEdit = await taxField(page, "estate").inputValue();
    await page.getByRole("checkbox", { name: confirmation, exact: true }).check();
    await setTaxField(page, "estate", "");
    assert(!await page.getByRole("checkbox", { name: confirmation, exact: true }).isChecked(), "Changing tax conditions retained obsolete confirmation");
    await assertIncompleteTaxBlocksReport(page, `${width}px removed estate value`);
    await setTaxField(page, "estate", estateBeforeEdit);
    await page.locator('[data-tax-comparison-status="ready"]').waitFor();
    await page.getByRole("checkbox", { name: confirmation, exact: true }).check();
    await editField(page, "금융자산", "예금 20억");
    await waitFact(page, "financialAssets", "예금 20억");
    assert(!await page.getByRole("checkbox", { name: confirmation, exact: true }).isChecked(), "Editing facts retained obsolete confirmation");
    assert(await page.getByRole("button", { name: finalButton, exact: true }).isDisabled(), "Editing facts did not require reconfirmation");
    assert.equal(await snapshot(page), null, "Editing facts retained the stale assessment");
    const refreshedId = await confirmReport(page, `${width}px revised report`, { estate: "60", financial: "20" });
    assert.notEqual(refreshedId, originalId, "A revised report reused its old assessment ID");
    assertGroundedSnapshot(await snapshot(page), "20");
    assert((await page.locator("body").innerText()).includes("6,000,000,000원"), "Revised report did not reflect the new 60억 sum");

    await openChat(page);
    await page.getByRole("button", { name: "새 진단", exact: true }).click();
    await page.getByRole("button", { name: "계속 작성", exact: true }).click();
    assert((await draft(page)).state.messages.length > 0, "Cancel reset erased the conversation");
    await page.getByRole("button", { name: "새 진단", exact: true }).click();
    await page.getByRole("button", { name: "새 진단 시작", exact: true }).click();
    await page.waitForFunction(key => JSON.parse(sessionStorage.getItem(key) ?? "null")?.state.messages.length === 0, draftKey);
    assert.deepEqual((await draft(page)).state.facts, {}, "Reset retained personal facts");
    assert.equal(await snapshot(page), null, "Reset retained a linked personal report");
    assert(await page.getByRole("button", { name: "메시지 보내기", exact: true }).isDisabled(), "Reset retained composer input");
    await page.goto(`${baseURL}/report-preview?assessment_id=${refreshedId}`, { waitUntil: "networkidle" });
    assert.equal(await page.locator("[data-report-page]").count(), 0, "Reset report remains available through its old URL");
    observations.push({ name: "guided report, editing, reset, IME, overflow", width, originalId, refreshedId });
    await context.close();
  }

  for (const storage of ["blocked", "corrupt"]) {
    const context = await newContext(browser, { storage, width: 390 });
    const page = await context.newPage();
    await openChat(page);
    await page.getByText(storage === "blocked" ? /이 브라우저에서는 대화를 저장할 수 없어요/ : /저장된 대화를 읽지 못했어요/).waitFor();
    await send(page, scenario);
    await openReview(page);
    await confirmReport(page, `${storage} storage report`);
    assert((await page.locator("body").innerText()).includes("5,000,000,000원"), `${storage} storage prevented report handoff`);
    observations.push({ name: "storage recovery and report handoff", storage });
    await context.close();
  }

  const unknownContext = await newContext(browser);
  const unknownPage = await unknownContext.newPage();
  await openChat(unknownPage);
  await send(unknownPage, "아버지 재산이에요. 아파트 금액 모름, 금융자산 모름, 채무 모름, 상속세가 걱정돼요.");
  await waitFact(unknownPage, "financialAssets", "금융자산 모름");
  await openReview(unknownPage);
  await assertIncompleteTaxBlocksReport(unknownPage, "unknown assets and debt");
  for (const key of ["estate", "financial", "debt"]) assert.equal(await taxField(unknownPage, key).inputValue(), "", `Unknown ${key} acquired a numeric value`);
  const unknownDraft = await draft(unknownPage);
  assert.match(unknownDraft.state.facts.realEstate.value, /모름/);
  assert.equal(unknownDraft.state.facts.financialAssets.value, "금융자산 모름");
  assert.match(unknownDraft.state.facts.debt.value, /모름/);
  assert.match(await unknownPage.locator("[data-tax-missing]").innerText(), /평가액|금융재산|채무/, "Missing calculation conditions were not shown to the customer");
  observations.push({ name: "unknown assets and debt stay unresolved and block report creation" });
  await unknownContext.close();

  const previousDraftContext = await newContext(browser);
  const previousDraftPage = await previousDraftContext.newPage();
  await openChat(previousDraftPage);
  await send(previousDraftPage, scenario);
  await waitFact(previousDraftPage, "financialAssets", "예금 10억");
  await previousDraftPage.evaluate(key => {
    const previous = JSON.parse(sessionStorage.getItem(key));
    previous.taxEnabled = false;
    sessionStorage.setItem(key, JSON.stringify(previous));
  }, draftKey);
  await previousDraftPage.reload({ waitUntil: "networkidle" });
  await openReview(previousDraftPage);
  await assertIncompleteTaxBlocksReport(previousDraftPage, "restored taxEnabled:false draft");
  assert.equal(await previousDraftPage.locator("[data-tax-enable]").count(), 0, "A previous draft restored the removed tax opt-out");
  await confirmReport(previousDraftPage, "restored draft with explicitly confirmed tax conditions");
  assertGroundedSnapshot(await snapshot(previousDraftPage));
  observations.push({ name: "previous taxEnabled:false draft cannot bypass required estimates" });
  await previousDraftContext.close();

  for (const [purpose, label] of [["inheritance", "상속"], ["gift", "증여"], ["capital_gains", "양도"], ["capital-gains", "양도"], ["business_succession", "가업상속"], ["business", "가업상속"]]) {
    const context = await newContext(browser);
    const page = await context.newPage();
    await openChat(page, { purpose });
    assert((await page.locator("body").innerText()).includes(`무료 사전진단 · ${label}`), `Topic entry lost ${label}`);
    await send(page, scenario);
    await page.waitForFunction(({ key, label }) => JSON.parse(sessionStorage.getItem(key) ?? "null")?.state.messages[0]?.text.startsWith(`검토 주제: ${label}\n\n`), { key: draftKey, label });
    assert.equal(await snapshot(page), null, "Topic entry bypassed report confirmation");
    observations.push({ name: "topic entry", purpose });
    await context.close();
  }

  const fastPathContext = await newContext(browser);
  const fastPathPage = await fastPathContext.newPage();
  const requestsBeforeFastPath = postCount;
  await openChat(fastPathPage);
  await fastPathPage.getByRole("button", { name: "상속", exact: true }).click();
  await fastPathPage.getByText("상속은 현재 어느 단계인가요?", { exact: true }).waitFor();
  await fastPathPage.getByRole("button", { name: "미리 준비 중이에요", exact: true }).click();
  await fastPathPage.getByText("누구의 재산을 준비하고 계세요?", { exact: true }).waitFor();
  await fastPathPage.getByRole("button", { name: "아버지", exact: true }).click();
  await fastPathPage.getByText("어떤 재산이 있나요?", { exact: true }).waitFor();
  await waitFact(fastPathPage, "owner", "아버지");
  const userTurnsBeforeAssets = (await draft(fastPathPage)).state.messages.filter(message => message.role === "user").length;
  const realEstateChoice = fastPathPage.getByRole("button", { name: "부동산", exact: true });
  const cashChoice = fastPathPage.getByRole("button", { name: "예금·현금", exact: true });
  await realEstateChoice.click();
  await realEstateChoice.click();
  assert.equal(await realEstateChoice.getAttribute("aria-pressed"), "false", "A selected asset could not be removed");
  await realEstateChoice.click();
  await cashChoice.click();
  assert.equal(await realEstateChoice.getAttribute("aria-pressed"), "true", "First asset was not kept selected");
  assert.equal(await cashChoice.getAttribute("aria-pressed"), "true", "Second asset was not kept selected");
  assert.equal((await draft(fastPathPage)).state.messages.filter(message => message.role === "user").length, userTurnsBeforeAssets,
    "A multi-select choice was submitted before confirmation");
  const amountComplete = fastPathPage.getByRole("button", { name: "입력 완료 (2)", exact: true });
  assert.equal(await amountComplete.isDisabled(), true, "Asset amounts could be skipped after selecting asset types");
  await fastPathPage.getByLabel("부동산 금액, 억 원 단위").fill("25");
  await fastPathPage.getByLabel("예금·현금 금액, 억 원 단위").fill("10");
  await fastPathPage.getByText("2개 · 확인된 금액 합계 35억 원", { exact: true }).waitFor();
  assert.equal((await draft(fastPathPage)).state.messages.filter(message => message.role === "user").length, userTurnsBeforeAssets,
    "Editing the combined amount form submitted a partial answer");
  await amountComplete.click();
  await fastPathPage.getByText("재산 소유자의 배우자가 계신가요?", { exact: true }).waitFor();
  assert.equal(await fastPathPage.getByRole("button", { name: "배우자가 있어요", exact: true }).getAttribute("aria-pressed"), null,
    "Multi-select state leaked into the next single-choice question");
  await waitFact(fastPathPage, "realEstate", "부동산: 25억 원");
  await waitFact(fastPathPage, "financialAssets", "예금·현금: 10억 원");
  await fastPathPage.getByRole("button", { name: "배우자가 있어요", exact: true }).click();
  await fastPathPage.getByText("상속인인 성년 자녀는 몇 명인가요?", { exact: true }).waitFor();
  await fastPathPage.getByRole("button", { name: "2명이에요", exact: true }).click();
  await fastPathPage.getByText("공과금이나 채무가 있나요?", { exact: true }).waitFor();
  await fastPathPage.getByRole("button", { name: "없어요", exact: true }).click();
  await fastPathPage.getByRole("button", { name: "선택 완료 (1)", exact: true }).click();
  await fastPathPage.getByText("최근 10년 안에 미리 증여한 재산이 있나요?", { exact: true }).waitFor();
  await fastPathPage.getByRole("button", { name: "확인이 필요해요", exact: true }).click();
  await fastPathPage.getByText("상속과 관련해 무엇을 먼저 보고 싶으세요?", { exact: true }).waitFor();
  await fastPathPage.getByRole("button", { name: "상속세를 먼저 보고 싶어요", exact: true }).click();
  await fastPathPage.getByRole("button", { name: "생전 증여도 함께 보고 싶어요", exact: true }).click();
  await fastPathPage.getByRole("button", { name: "선택 완료 (2)", exact: true }).click();
  await fastPathPage.getByText("기본 내용을 정리했어요. 7장 샘플 보고서는 바로 볼 수 있고, 내 상황에 맞춘 보고서는 계산 조건을 확인한 뒤 만들 수 있어요.", { exact: true }).waitFor();
  await fastPathPage.getByRole("link", { name: /7장 샘플 보고서 보기/ }).waitFor();
  const fastPathText = await fastPathPage.locator("body").innerText();
  assert(!fastPathText.includes("확인이 완료되었습니다"), "A guided flow exposed an untrusted completion claim");
  assert(!fastPathText.includes("결과 화면으로 연결"), "A guided flow exposed an untrusted result handoff");
  assert.equal(postCount, requestsBeforeFastPath, "Unconfigured guided choices unexpectedly made an AI request");
  assert.equal(await fastPathPage.locator('[data-message-origin="ai"]').count(), 0, "Local fixed replies were labeled as AI output");
  observations.push({ name: "unconfigured inheritance choices retain explicit local guidance and report confirmation" });
  await fastPathContext.close();

  // Every configured topic and follow-up button must use the intercepted AI
  // transport. Choice candidates are never facts until the user submits them.
  for (const [purpose, label] of [["inheritance", "상속"], ["gift", "증여"], ["capital-gains", "양도"], ["business", "가업상속"]]) {
    const requests = [];
    const width = purpose === "inheritance" || purpose === "capital-gains" ? 390 : 1440;
    const question = `${label} 검토를 위해 누구의 재산인지 알려주시겠어요?`;
    const context = await newContext(browser, { configured: true, width, post: async route => {
      const request = route.request().postDataJSON();
      const text = request.messages.at(-1).parts.filter(part => part.type === "text").map(part => part.text).join("");
      requests.push(request);
      const turn = requests.length;
      assert.equal(request.messages.filter(message => message.role === "user").length, turn, `${purpose}: follow-up lost conversation history`);
      const expected = [label, "아버지", "정정: 재산 소유자 — 어머니", "보증금은 모름", "상담 주제를 양도로 바꿀게요"][turn - 1];
      assert.equal(text, expected, `${purpose}: choice or correction was rewritten before reaching the model`);
      if (turn === 1) assert.deepEqual(request.facts, {}, `${purpose}: UI invented facts before AI extraction`);
      if (turn > 1) assert.equal(request.facts.topic.value, label, `${purpose}: model did not receive current case notes`);
      if (turn === 3) assert.equal(request.facts.owner.value, "아버지", `${purpose}: correction lost previous owner context`);
      if (turn === 4) assert.equal(request.facts.owner.value, "어머니", `${purpose}: latest correction was not retained`);
      const replies = [
        { message: question, choices: ["아버지", "본인", "잘 모르겠어요"], proposals: [{ key: "topic", value: label, evidence: label }] },
        { message: "아버지 재산으로 정리했어요. 추가로 확인할 상황이 있나요?", choices: ["채무가 있어요", "채무가 없어요", "모름"], proposals: [{ key: "owner", value: "아버지", evidence: "아버지" }] },
        { message: "어머니 재산으로 고쳤어요. 보증금 금액을 알고 계세요?", choices: ["알고 있어요", "모름"], proposals: [{ key: "owner", value: "어머니", evidence: "어머니" }] },
        { message: "보증금은 확인할 내용으로 남겼어요. 더 알려주실 내용이 있나요?", choices: ["다른 재산이 있어요", "내용을 확인할게요"], proposals: [{ key: "unconfirmed", value: "보증금은 모름", evidence: "보증금은 모름" }] },
        { message: "양도 상담으로 전환했어요. 어떤 재산을 팔려고 하세요?", choices: ["부동산", "주식"], proposals: [{ key: "topic", value: "양도", evidence: "상담 주제를 양도로 바꿀게요" }] },
      ];
      const reply = replies[turn - 1];
      assert(reply, `${purpose}: unexpected extra model request`);
      await route.fulfill(sseReply({ messageId: `${purpose}-turn-${turn}`, text: JSON.stringify({ message: reply.message, choices: reply.choices, selectionMode: "single" }), proposals: reply.proposals }));
    } });
    const page = await context.newPage();
    await openChat(page, { purpose, configured: true });
    await page.getByText("가상 상담 시험 · 실제 개인정보를 입력하지 마세요.", { exact: true }).waitFor();
    assert((await page.locator("body").innerText()).includes(`무료 사전진단 · ${label}`) || width === 390, `${purpose}: URL entry topic was lost`);
    if (width === 390) await assertMobileChatFit(page, `${purpose} opening`);
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.getByText(question, { exact: true }).waitFor();
    await waitFact(page, "topic", label);
    assert.equal((await draft(page)).state.facts.owner, undefined, `${purpose}: an unselected candidate became an owner fact`);
    assert.equal((await draft(page)).state.facts.recipient, undefined, `${purpose}: an unselected candidate became a recipient fact`);
    await page.getByRole("button", { name: "아버지", exact: true }).click();
    await waitFact(page, "owner", "아버지");
    await send(page, "정정: 재산 소유자 — 어머니");
    await waitFact(page, "owner", "어머니");
    await send(page, "보증금은 모름");
    await waitFact(page, "unconfirmed", "보증금은 모름");
    await send(page, "상담 주제를 양도로 바꿀게요");
    await page.getByText("양도 상담으로 전환했어요. 어떤 재산을 팔려고 하세요?", { exact: true }).waitFor();
    await waitFact(page, "topic", "양도");
    assert.equal((await draft(page)).state.facts.owner.value, "어머니", `${purpose}: topic change lost the corrected owner`);
    assert.equal((await draft(page)).state.facts.unconfirmed.value, "보증금은 모름", `${purpose}: topic change cleared uncertainty`);
    assert.equal(await page.locator("[data-chat-layout]").getAttribute("data-chat-topic"), "양도", `${purpose}: header kept the previous topic after a switch`);
    assert.equal(requests.length, 5, `${purpose}: a button response bypassed the AI transport`);
    assert.equal(await page.locator('[data-message-origin="ai"]').count(), 5, `${purpose}: AI answer origin was lost`);
    assert.equal(await snapshot(page), null, `${purpose}: model output opened a report without confirmation`);
    await assertNoOverflow(page, `${purpose} model conversation`);
    if (width === 390) {
      await assertMobileChatFit(page, `${purpose} model choices`);
      await page.locator("#diagnosis-message").focus();
      await page.setViewportSize({ width, height: 440 });
      await page.locator('[data-keyboard-open="true"]').waitFor();
      await assertMobileChatFit(page, `${purpose} keyboard viewport`);
      await page.screenshot({ path: path.join(outputDir, `chat-ai-${purpose}-keyboard.png`) });
    }
    observations.push({ name: "configured topic, button follow-up, correction, unknown memory and app-owned confirmation", purpose, width, mockRequests: requests.length });
    await context.close();
  }

  const failedText = "아버지 상속을 준비하고 있고 대출은 모름";
  const retryRequests = [];
  const retryContext = await newContext(browser, { configured: true, width: 390, post: async route => {
    const request = route.request().postDataJSON();
    retryRequests.push(request);
    assert.equal(request.messages.filter(message => message.role === "user").length, 1, "Retry duplicated the failed user turn");
    assert.deepEqual(request.facts, {}, "An incomplete response applied facts before retry");
    if (retryRequests.length === 1) {
      return route.fulfill(sseReply({ messageId: "incomplete-with-facts", text: JSON.stringify({ message: "대출 금액을 확인하실 수 있나요?", choices: ["확인할게요", "아직 몰라요"], selectionMode: "single" }), proposals: [{ key: "owner", value: "아버지", evidence: "아버지" }], finishReason: "error" }));
    }
    if (retryRequests.length === 2) return route.fulfill({ status: 503, json: { error: { code: "AI_RATE_LIMITED", message: "Mock limit" } } });
    await route.fulfill(sseReply({ messageId: "retry-complete", text: JSON.stringify({ message: "모르는 대출 금액은 확인할 내용으로 남겼어요. 다른 재산이 있나요?", choices: ["부동산이 있어요", "금융자산이 있어요"], selectionMode: "single" }), proposals: [{ key: "owner", value: "아버지", evidence: "아버지" }, { key: "unconfirmed", value: "대출은 모름", evidence: "대출은 모름" }] }));
  } });
  const retryPage = await retryContext.newPage();
  await openChat(retryPage, { configured: true });
  await retryPage.locator("#diagnosis-message").fill(failedText);
  await retryPage.getByRole("button", { name: "메시지 보내기", exact: true }).click();
  await retryPage.getByRole("button", { name: "다시 시도", exact: true }).waitFor();
  assert.equal(await retryPage.locator("#diagnosis-message").inputValue(), failedText, "Incomplete response lost composer input");
  assert.deepEqual((await draft(retryPage)).state.facts, {}, "An incomplete response changed case notes");
  await retryPage.getByRole("button", { name: "다시 시도", exact: true }).click();
  await retryPage.getByText(/AI 시험 요청 한도에 도달했어요/).waitFor();
  assert.equal(await retryPage.locator("#diagnosis-message").inputValue(), failedText, "HTTP failure lost composer input");
  await retryPage.getByRole("button", { name: "메시지 보내기", exact: true }).click();
  await waitFact(retryPage, "unconfirmed", "대출은 모름");
  assert.equal(retryRequests.length, 3, "Resending preserved input did not retry the failed turn");
  assert.equal(new Set(retryRequests.map(request => request.messages.find(message => message.role === "user").id)).size, 1, "Retry changed the user message identity");
  assert.equal((await draft(retryPage)).state.messages.filter(message => message.role === "user").length, 1, "Retry added duplicate user messages to storage");
  assert.equal((await draft(retryPage)).state.facts.owner.sources, undefined, "Retry reapplied old fact evidence");
  assert.equal(await retryPage.locator("#diagnosis-message").inputValue(), "", "Successful retry retained the failed composer text");
  await assertMobileChatFit(retryPage, "AI failure retry mobile");
  observations.push({ name: "incomplete/SSE and HTTP failure preserve input, one user turn and facts through retry", mockRequests: retryRequests.length });
  await retryContext.close();

  const correctionRequests = [];
  const correctionContext = await newContext(browser, { configured: true, post: async route => {
    const request = route.request().postDataJSON();
    correctionRequests.push(request);
    if (correctionRequests.length === 2 || correctionRequests.length === 4) return route.fulfill({ status: 503, json: { error: { code: "AI_RATE_LIMITED", message: "Mock limit" } } });
    if (correctionRequests.length === 3) {
      const users = request.messages.filter(message => message.role === "user");
      assert.equal(users.length, 3, "Retry after a card correction truncated or duplicated user history");
      assert.equal(users.at(-1).parts[0].text, "정정: 재산 소유자 — 어머니", "Retry did not include the latest card correction");
      assert.equal(request.facts.owner.value, "어머니");
      assert.equal(request.facts.owner.messageId, users.at(-1).id, "Corrected fact evidence refers to a discarded turn");
      assert.equal(users.filter(message => message.parts[0].text === "대출 금액은 모름").length, 1, "Retry duplicated the failed narrative");
    }
    await route.fulfill(sseReply({ messageId: `card-correction-${correctionRequests.length}`, text: JSON.stringify({ message: "다른 확인할 내용이 있나요?", choices: ["있어요", "아직 몰라요"], selectionMode: "single" }), proposals: correctionRequests.length === 1 ? [{ key: "owner", value: "아버지", evidence: "아버지" }, { key: "financialAssets", value: "예금 10억", evidence: "예금 10억" }] : [] }));
  } });
  const correctionPage = await correctionContext.newPage();
  await openChat(correctionPage, { configured: true });
  await send(correctionPage, "아버지 예금 10억을 검토하고 싶어요.");
  await waitFact(correctionPage, "owner", "아버지");
  await correctionPage.locator("#diagnosis-message").fill("대출 금액은 모름");
  await correctionPage.getByRole("button", { name: "메시지 보내기", exact: true }).click();
  await correctionPage.getByRole("button", { name: "다시 시도", exact: true }).waitFor();
  await editField(correctionPage, "재산 소유자", "어머니");
  await waitFact(correctionPage, "owner", "어머니");
  assert.equal(await correctionPage.locator("#diagnosis-message").inputValue(), "대출 금액은 모름", "Card correction lost the preserved failed input");
  await correctionPage.getByRole("button", { name: "다시 시도", exact: true }).click();
  await correctionPage.waitForFunction(key => {
    const value = JSON.parse(sessionStorage.getItem(key) ?? "null");
    return value?.state.messages.filter(message => message.role === "user").length === 3 && value.responseFailed === false;
  }, draftKey);
  await waitFact(correctionPage, "owner", "어머니");
  await correctionPage.locator("#diagnosis-message").fill("과거 증여는 확인 필요");
  await correctionPage.getByRole("button", { name: "메시지 보내기", exact: true }).click();
  await correctionPage.getByRole("button", { name: "다시 시도", exact: true }).waitFor();
  await correctionPage.getByRole("button", { name: "재산 소유자 수정", exact: true }).click();
  await correctionPage.getByRole("button", { name: "재산 소유자 삭제", exact: true }).click();
  await correctionPage.waitForFunction(key => {
    const value = JSON.parse(sessionStorage.getItem(key) ?? "null");
    return value && !value.state.facts.owner && value.state.messages.filter(message => message.role === "user").length === 5;
  }, draftKey);
  const correctedUserIds = (await draft(correctionPage)).state.messages.filter(message => message.role === "user").map(message => message.id);
  assert.equal(correctedUserIds.length, 5, "Card deletion was not retained as its own user turn");
  await correctionPage.getByRole("button", { name: "직접 정리 모드로 전환", exact: true }).click();
  await correctionPage.getByRole("button", { name: "메시지 보내기", exact: true }).click();
  await correctionPage.locator('[data-message-origin="local"]').waitFor();
  const directCorrectionDraft = await draft(correctionPage);
  assert.equal(correctionRequests.length, 4, "Direct continuation after card deletion requested the model");
  assert.deepEqual(directCorrectionDraft.state.messages.filter(message => message.role === "user").map(message => message.id), correctedUserIds, "Direct continuation discarded corrections or duplicated the failed input");
  assert.equal(directCorrectionDraft.state.facts.owner, undefined, "Direct continuation restored a deleted owner");
  await correctionPage.reload({ waitUntil: "networkidle" });
  await waitFact(correctionPage, "financialAssets", "예금 10억");
  assert.deepEqual((await draft(correctionPage)).state.messages.filter(message => message.role === "user").map(message => message.id), correctedUserIds, "Corrected evidence became invalid after reload");
  observations.push({ name: "card correction after failure survives AI retry and card deletion survives direct continuation", mockRequests: correctionRequests.length });
  await correctionContext.close();

  let directRequests = 0;
  const directContext = await newContext(browser, { configured: true, width: 390, post: async route => {
    directRequests += 1;
    if (directRequests === 1) return route.fulfill(sseReply({ messageId: "direct-rejected-turn", text: JSON.stringify({ message: "상속 상황을 추가로 말씀해 주시겠어요?", choices: ["준비 중이에요", "아직 몰라요"], selectionMode: "single" }), proposals: [{ key: "topic", value: "상속", evidence: "상속" }], finishReason: "error" }));
    await route.fulfill(sseReply({ messageId: "direct-back-to-ai", text: JSON.stringify({ message: "직접 정리한 내용도 읽었어요. 언제 준비하고 계세요?", choices: ["올해", "내년", "아직 모름"], selectionMode: "single" }) }));
  } });
  const directPage = await directContext.newPage();
  await openChat(directPage, { configured: true });
  await directPage.getByRole("button", { name: "상속", exact: true }).click();
  await directPage.getByRole("button", { name: "직접 정리 모드로 전환", exact: true }).waitFor();
  await directPage.getByRole("button", { name: "직접 정리 모드로 전환", exact: true }).click();
  await directPage.getByText("직접 입력 정리 모드 · AI 응답 없음", { exact: true }).waitFor();
  assert.deepEqual((await draft(directPage)).state.facts, {}, "Switching modes reapplied facts from a failed AI turn");
  await directPage.getByRole("button", { name: "메시지 보내기", exact: true }).click();
  await directPage.getByText("상속은 현재 어느 단계인가요?", { exact: true }).waitFor();
  assert.equal(directRequests, 1, "Explicit direct mode called the model");
  assert.equal((await draft(directPage)).state.messages.filter(message => message.role === "user").length, 1, "Direct fallback duplicated the failed user message");
  assert.equal(await directPage.locator('[data-message-origin="local"]').count(), 1, "Direct answer lacks a local source label");
  await directPage.reload({ waitUntil: "networkidle" });
  await directPage.getByText("직접 입력 정리 모드 · AI 응답 없음", { exact: true }).waitFor();
  assert.equal(await directPage.locator('[data-message-origin="local"]').count(), 1, "Reload lost the direct response source");
  await directPage.getByRole("button", { name: "AI 대화로 전환", exact: true }).click();
  await directPage.getByRole("button", { name: "미리 준비 중이에요", exact: true }).click();
  await directPage.getByText("직접 정리한 내용도 읽었어요. 언제 준비하고 계세요?", { exact: true }).waitFor();
  assert.equal(directRequests, 2, "Returning to AI kept the hidden local fast path");
  assert.equal(await directPage.locator('[data-message-origin="local"]').count(), 1, "A fixed old answer was relabeled as AI output");
  assert.equal(await directPage.locator('[data-message-origin="ai"]').count(), 1, "Model answer lost its AI source");
  await assertMobileChatFit(directPage, "direct and AI mode switch mobile");
  observations.push({ name: "failure to direct mode reuses input; persisted sources survive mode switches", mockRequests: directRequests });
  await directContext.close();

  let releaseStream;
  const streamReady = new Promise(resolve => { releaseStream = resolve; });
  let markRequested;
  const requestStarted = new Promise(resolve => { markRequested = resolve; });
  let mockRequests = 0;
  const aiReplyMessage = "부동산별 취득 시기를 알고 계세요?";
  const aiReply = JSON.stringify({ message: aiReplyMessage, choices: ["알고 있어요", "잘 모르겠어요"], selectionMode: "single" });
  const aiContext = await newContext(browser, { configured: true, post: async route => {
    mockRequests += 1;
    markRequested();
    const request = route.request().postDataJSON();
    assert.equal(request.messages.at(-1).role, "user");
    assert(request.messages.at(-1).parts.some(part => part.type === "text" && part.text.includes(scenario)), "AI transport lost the user's narrative");
    assert.deepEqual(request.facts, {}, "A fresh AI conversation must send its empty draft without pretending local extraction is AI output");
    await streamReady;
    await route.fulfill(sseReply({ text: aiReply, proposals: [
      // Put the unsupported proposal before the supported proposal for the
      // same key, so a duplicate-key guard cannot mask missing evidence checks.
      { key: "financialAssets", value: "900억", evidence: "900억" },
      { key: "owner", value: "아버지 재산", evidence: "아버지 재산" },
      { key: "realEstate", value: "건물 25억, 아파트 15억", evidence: "건물 25억, 아파트 15억" },
      { key: "financialAssets", value: "예금 10억", evidence: "예금 10억" },
      { key: "spouse", value: "배우자 있음", evidence: "배우자 있음" },
      { key: "children", value: "자녀 셋", evidence: "자녀 셋" },
      { key: "debt", value: "채무 없음", evidence: "채무 없음" },
      { key: "pastGifts", value: "과거 증여 없음", evidence: "과거 증여 없음" },
      { key: "goal", value: "세금 부담을 줄이고 싶어요", evidence: "세금 부담을 줄이고 싶어요" },
      { key: "timing", value: "내년 봄", evidence: "내년 봄" },
    ] }));
  } });
  const aiPage = await aiContext.newPage();
  await openChat(aiPage, { configured: true });
  await send(aiPage, `${scenario}\n내년 봄에 준비하고 싶어요.`);
  await aiPage.getByRole("button", { name: "응답 중지", exact: true }).first().waitFor();
  assert.equal(await aiPage.getByRole("button", { name: "메시지 보내기", exact: true }).count(), 0, "Send remained available during an AI response");
  await aiPage.locator("#diagnosis-message").fill("추가 질문");
  await aiPage.locator("#diagnosis-message").press("Enter");
  let requestTimer;
  try {
    await Promise.race([requestStarted, new Promise((_, reject) => {
      requestTimer = setTimeout(() => reject(new Error("AI transport did not issue a request")), 10_000);
    })]);
  } finally { clearTimeout(requestTimer); }
  assert.equal(mockRequests, 1, "Busy composer submitted a duplicate request");
  assert.equal(await snapshot(aiPage), null, "An in-flight AI response created a report");
  releaseStream();
  await aiPage.getByText(aiReplyMessage, { exact: true }).waitFor();
  await aiPage.getByRole("button", { name: "알고 있어요", exact: true }).waitFor();
  await waitFact(aiPage, "timing", "내년 봄");
  await waitFact(aiPage, "financialAssets", "예금 10억");
  assert.equal(mockRequests, 1, "A tool result caused an unnecessary second API request");
  assert(!(await draft(aiPage)).state.facts.financialAssets.value.includes("900"), "Client accepted unsupported AI proposal evidence");
  assert.equal(await snapshot(aiPage), null, "AI tool proposals bypassed customer confirmation");
  await aiPage.locator("#diagnosis-message").fill("");
  await openReview(aiPage);
  await confirmReport(aiPage, "mock AI stream report");
  assertGroundedSnapshot(await snapshot(aiPage));
  observations.push({ name: "SDK text/tool stream, evidence rejection, busy composer, explicit confirmation", mockRequests });
  await aiContext.close();

  await writeFile(path.join(outputDir, "chat-audit-report.json"), `${JSON.stringify({ status: errors.length ? "failed" : "passed", baseURL, providerInvoked: false, postCount, observations, errors }, null, 2)}\n`);
  assert.deepEqual(errors, [], "Browser errors or unintended provider calls were observed");
  console.log(`Chat UI audit passed: ${observations.length} flows; all ${postCount} AI requests mocked.`);
} finally {
  await browser.close();
}
