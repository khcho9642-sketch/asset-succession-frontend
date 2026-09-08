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
  assert(await page.getByRole("link", { name: "기존 문답형으로 입력하기" }).isVisible(), "Legacy form entry is missing");
}

async function assertNoOverflow(page, label) {
  const layout = await page.evaluate(() => ({ viewport: innerWidth, root: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert(layout.root <= layout.viewport + 2 && layout.body <= layout.viewport + 2, `${label}: horizontal overflow ${JSON.stringify(layout)}`);
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
  const review = page.getByRole("button", { name: "정리 내용 확인하기", exact: true });
  if (!await review.isVisible()) await page.getByRole("button", { name: /현재 정리된 내용/ }).click();
  await review.click();
  await page.getByRole("heading", { name: "제가 전한 상황과 맞나요?" }).waitFor();
  assert(await page.getByRole("button", { name: finalButton, exact: true }).isDisabled(), "Report was enabled before explicit confirmation");
}

async function editField(page, label, text) {
  // Locators use the primary review editor's accessible labels.
  await page.getByRole("button", { name: `${label} 수정`, exact: true }).first().click();
  await page.getByRole("textbox", { name: `${label} 입력`, exact: true }).fill(text);
  await page.getByRole("button", { name: "저장", exact: true }).click();
}

async function confirmReport(page, label) {
  // These existing cases verify the explicitly chosen facts-only report path.
  // Calculated reports have their own all-track tax-comparison-ui-audit.
  await page.locator("[data-tax-enable]").uncheck();
  await page.getByRole("checkbox", { name: confirmation, exact: true }).check();
  await page.getByRole("button", { name: finalButton, exact: true }).click();
  await page.waitForURL("**/report-preview?assessment_id=**");
  await page.locator('[data-report-template="paper-seven-v1"] [data-report-page="7"]').waitFor();
  assert.equal(await page.locator("[data-report-page]").count(), 7, `${label}: report does not have seven pages`);
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
    assert(!printText.includes("대화 내용 수정") && !printText.includes("PDF 저장"), "Print report leaked navigation controls");
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
}

function sseReply({ messageId = "audit-ai-answer", text, proposals = [] }) {
  const events = [
    { type: "start", messageId }, { type: "start-step" },
    { type: "tool-input-available", toolCallId: `${messageId}-tool`, toolName: "proposeFacts", input: { facts: proposals } },
    { type: "tool-output-available", toolCallId: `${messageId}-tool`, output: { proposals } },
    { type: "finish-step" }, { type: "start-step" },
    { type: "text-start", id: `${messageId}-text` },
    { type: "text-delta", id: `${messageId}-text`, delta: text },
    { type: "text-end", id: `${messageId}-text` },
    { type: "finish-step" }, { type: "finish", finishReason: "stop" },
  ];
  return { contentType: "text/event-stream", headers: { "x-vercel-ai-ui-message-stream": "v1", "cache-control": "no-cache" }, body: `${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n` };
}

const browser = await chromium.launch({ headless: true });
try {
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
    assert((await page.locator("body").innerText()).includes("50억"), "Report omitted the confirmed 50억 asset sum");
    await page.screenshot({ path: path.join(outputDir, `chat-${width}-report.png`), fullPage: true });
    if (width === 1440) await auditConfirmedPdf(page, originalId);

    await page.getByRole("link", { name: "대화 내용 수정", exact: true }).click();
    await page.waitForURL(url => url.pathname === "/precheck");
    await page.getByRole("heading", { name: "먼저, 이야기를 들려주세요." }).waitFor();
    await page.getByText("AI 연결 전 · 입력 정리 모드", { exact: true }).waitFor();
    await openReview(page);
    await page.getByRole("checkbox", { name: confirmation, exact: true }).check();
    await editField(page, "금융자산", "예금 20억");
    await waitFact(page, "financialAssets", "예금 20억");
    assert(!await page.getByRole("checkbox", { name: confirmation, exact: true }).isChecked(), "Editing facts retained obsolete confirmation");
    assert(await page.getByRole("button", { name: finalButton, exact: true }).isDisabled(), "Editing facts did not require reconfirmation");
    assert.equal(await snapshot(page), null, "Editing facts retained the stale assessment");
    const refreshedId = await confirmReport(page, `${width}px revised report`);
    assert.notEqual(refreshedId, originalId, "A revised report reused its old assessment ID");
    assertGroundedSnapshot(await snapshot(page), "20");
    assert((await page.locator("body").innerText()).includes("60억"), "Revised report did not reflect the new 60억 sum");

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
    assert((await page.locator("body").innerText()).includes("50억"), `${storage} storage prevented report handoff`);
    observations.push({ name: "storage recovery and report handoff", storage });
    await context.close();
  }

  const unknownContext = await newContext(browser);
  const unknownPage = await unknownContext.newPage();
  await openChat(unknownPage);
  await send(unknownPage, "아버지 재산이에요. 아파트 금액 모름, 금융자산 모름, 채무 모름, 상속세가 걱정돼요.");
  await waitFact(unknownPage, "financialAssets", "금융자산 모름");
  await openReview(unknownPage);
  await confirmReport(unknownPage, "unknown amounts report");
  const unknownSnapshot = await snapshot(unknownPage);
  assert.deepEqual(unknownSnapshot.answers.assets.assetAmounts, { "부동산": "", "금융자산": "" }, "Unknown amounts were replaced with numbers");
  assert.deepEqual(unknownSnapshot.answers.assets.assetAmountStatus, { "부동산": "unknown", "금융자산": "unknown" });
  assert.deepEqual(unknownSnapshot.answers.assets.assetAmountWons, {}, "Unknown assets acquired won values");
  assert.equal(unknownSnapshot.answers.debt.debtAmounts, undefined, "Unknown debt was replaced with zero");
  assert.match(await unknownPage.locator("body").innerText(), /확인 필요|미입력|미확인|모름/, "Report did not disclose unresolved information");
  observations.push({ name: "unknown assets and debt remain unresolved in confirmed report" });
  await unknownContext.close();

  for (const [purpose, label] of [["inheritance", "상속"], ["gift", "증여"], ["capital_gains", "양도"], ["business_succession", "가업승계"]]) {
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

  let releaseStream;
  const streamReady = new Promise(resolve => { releaseStream = resolve; });
  let markRequested;
  const requestStarted = new Promise(resolve => { markRequested = resolve; });
  let mockRequests = 0;
  const aiReply = "내년 봄 준비 일정도 원문대로 정리했어요. 가족과 자산 내용을 확인해 주세요.";
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
  await aiPage.getByText(aiReply, { exact: true }).waitFor();
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
