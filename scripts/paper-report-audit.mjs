import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { assertReportPrintBounds } from "./report-print-bounds.mjs";

const runFile = promisify(execFile);
const assessmentKey = "as360.precheck.assessment.v1";
const sections = ["summary", "facts", "comparison", "detail", "detail", "cash", "execution"];

/** Verify the rendered template, not merely a seven-page count or a CSS class. */
export async function assertPaperTemplate(page, label = "Generated report") {
  const book = page.locator('[data-report-template="paper-seven-v1"]');
  assert.equal(await book.count(), 1, `${label}: generated report did not use the approved paper template`);
  const fontFaces = await page.evaluate(async () => {
    const faces = await document.fonts.load('700 30px "Noto Serif KR Variable"', "우리 가족 자산승계");
    await document.fonts.ready;
    return faces.map(face => ({ family: face.family, status: face.status }));
  });
  assert(fontFaces.length > 0 && fontFaces.every(face => face.status === "loaded"), `${label}: Korean serif font did not load; a system sans-serif fallback would change the approved design`);
  const appearance = await book.locator("[data-report-page]").evaluateAll(sheets => sheets.map(sheet => {
    const number = sheet.querySelector("[data-paper-number]");
    const heading = sheet.querySelector("h2");
    const content = sheet.querySelector("[data-report-content]");
    const style = getComputedStyle(sheet);
    const navyBlocks = Array.from(sheet.querySelectorAll("*")).filter(element => {
      const rect = element.getBoundingClientRect();
      const background = getComputedStyle(element).backgroundColor.match(/^rgb\((\d+), (\d+), (\d+)\)$/);
      if (!background || rect.width < 120 || rect.height < 35) return false;
      const [, r, g, b] = background.map(Number);
      return r < 65 && g < 85 && b > r + 15 && b > g;
    }).length;
    return {
      page: sheet.getAttribute("data-report-page"),
      section: sheet.getAttribute("data-report-section"),
      number: number?.textContent?.trim(),
      numberColor: number ? getComputedStyle(number).color : null,
      title: heading?.textContent?.trim(),
      titleFont: heading ? getComputedStyle(heading).fontFamily : null,
      titleColor: heading ? getComputedStyle(heading).color : null,
      background: style.backgroundColor,
      printColorAdjust: style.printColorAdjust || style.webkitPrintColorAdjust,
      hasContent: Boolean(content?.textContent?.trim()),
      navyBlocks,
    };
  }));
  assert.equal(appearance.length, 7, `${label}: expected seven paper sections`);
  if (await page.evaluate(() => matchMedia("print").matches)) {
    const firstTop = await book.locator('[data-report-page="1"]').evaluate(sheet => sheet.getBoundingClientRect().top + scrollY);
    assert(Math.abs(firstTop) <= 2, `${label}: screen navigation pushes the first PDF page down by ${firstTop}px`);
  }
  for (const [index, sheet] of appearance.entries()) {
    assert.equal(sheet.page, String(index + 1), `${label}: page order changed`);
    assert.equal(sheet.section, sections[index], `${label}: page ${index + 1} no longer has the agreed role`);
    assert.equal(sheet.number, String(index + 1).padStart(2, "0"), `${label}: numbered chapter header missing`);
    assert.equal(sheet.numberColor, "rgb(178, 58, 42)", `${label}: chapter number lost the seal accent`);
    assert.equal(sheet.background, "rgb(248, 244, 234)", `${label}: page lost its warm paper background`);
    assert.equal(sheet.titleColor, "rgb(38, 34, 27)", `${label}: heading lost the ink text color`);
    assert(sheet.titleFont?.includes("Noto Serif KR Variable"), `${label}: heading is not using the bundled Korean serif font`);
    assert(sheet.title && sheet.hasContent, `${label}: page ${index + 1} has no heading or customer content`);
    assert.equal(sheet.printColorAdjust, "exact", `${label}: browser printing may discard the paper palette`);
    assert.equal(sheet.navyBlocks, 0, `${label}: old navy report panels leaked into the paper template`);
  }
  const reportText = await book.innerText();
  for (const oldTemplateText of ["Report V2", "정밀 계산 연결 전 미리보기", "같은 계산 결과 객체에서 읽습니다", "36개 시나리오 내부 분석 완료"]) {
    assert(!reportText.includes(oldTemplateText), `${label}: old report copy still visible: ${oldTemplateText}`);
  }
  return { fontFaces, pages: appearance };
}

// Exact facts in the customer's cli-report-52.pdf. Unknown ages and gifts stay unknown.
const suppliedFacts = [
  ["topic", "상담 주제", "상속"],
  ["timing", "준비 시기", "미리 준비"],
  ["owner", "재산 소유자", "아버지 명의"],
  ["spouse", "소유자의 배우자", "아버지의 배우자는 있고"],
  ["children", "소유자의 자녀 수", "아버지의 자녀는 셋이에요"],
  ["realEstate", "부동산", "건물 25억, 아파트 15억"],
  ["financialAssets", "금융자산", "예금 12억"],
  ["debt", "채무", "채무 없음"],
  ["pastGifts", "과거 증여", "모르겠어요"],
  ["goal", "희망하는 결과", "상속을 미리 준비하고 싶어요."],
];
const confirmedAt = "2026-09-08T06:36:24.000Z";
export const seededAssessment = {
  assessment_id: "AS360-20260908-PAPER52",
  created_at: confirmedAt,
  review_focus: ["전체 요약 먼저 보기"],
  answers: {
    purpose: { label: "준비 목적", choices: ["상속"], detail: "상속", facts: { "준비 시기": "미리 준비" } },
    family: { label: "가족", choices: [], facts: { "배우자 유무": "있음", "자녀 수": "3명" } },
    assets: {
      label: "자산", choices: ["부동산", "금융자산"],
      facts: { "소유자 관계": "아버지 명의", "부동산 원문": "건물 25억, 아파트 15억", "금융자산 원문": "예금 12억" },
      assetAmounts: { "부동산": "40", "금융자산": "12" },
      assetAmountWons: { "부동산": 4_000_000_000, "금융자산": 1_200_000_000 },
      assetAmountStatus: { "부동산": "confirmed", "금융자산": "confirmed" },
    },
    debt: { label: "채무·과거 증여", choices: ["해당 없음"], detail: "채무 없음", facts: { "채무 여부": "없음", "채무 원문": "채무 없음", "과거 증여 상세": "모르겠어요" } },
    goal: { label: "승계 목표", choices: [], detail: "상속을 미리 준비하고 싶어요." },
    review: { label: "결과 준비", choices: ["전체 요약 먼저 보기"], facts: { "고객 확인 일시": confirmedAt } },
  },
  conversation: {
    mode: "chat",
    messages: suppliedFacts.map(([, , value]) => ({ role: "user", text: value, created_at: confirmedAt })),
    confirmed_facts: suppliedFacts.map(([id, label, value], index) => ({ id, label, value, raw_text: `[paper52-${index + 1}] ${value}`, confidence: "customer_confirmed" })),
    pending_candidates: [], raw_inputs: suppliedFacts.map(([, , value]) => value), current_question_key: "review",
  },
};

async function runAudit() {
  const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:4173";
  const outputDir = process.env.UI_AUDIT_DIR ?? "docs/review-assets/paper-report";
  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const observations = [];
  try {
    for (const viewport of [{ name: "mobile", width: 390, height: 844 }, { name: "desktop", width: 1440, height: 1000 }]) {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
      await page.addInitScript(({ key, snapshot }) => sessionStorage.setItem(key, JSON.stringify(snapshot)), { key: assessmentKey, snapshot: seededAssessment });
      const response = await page.goto(`${baseURL}/report-preview?assessment_id=${seededAssessment.assessment_id}&source=chat`, { waitUntil: "networkidle", timeout: 30_000 });
      assert(response?.ok(), `52억원 report did not load: ${response?.status()}`);
      await page.locator('[data-report-page="7"]').waitFor();
      assert.equal(await page.locator('[data-report-mode="chat"]').count(), 1, "52억원 facts-only chat was routed to a different report mode");
      const screen = await assertPaperTemplate(page, `52억원 ${viewport.name}`);
      const factsText = await page.locator('[data-report-page="2"]').innerText();
      for (const [, , value] of suppliedFacts) assert(factsText.includes(value), `52억원 report lost the confirmed statement: ${value}`);
      assert((await page.locator('[data-report-page="1"]').innerText()).includes("52억"), "52억원 total did not reach the summary");
      assert(factsText.includes("성년") && factsText.includes("미성년"), "Unprovided child ages need an explicit follow-up");
      assert.equal(await page.locator("[data-tax-amount]").count(), 0, "Facts-only 52억원 report invented calculated tax numbers");
      assert.deepEqual(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)), assessmentKey), seededAssessment, "Rendering changed confirmed facts or inserted unprovided tax conditions");
      const overflow = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, sheets: [...document.querySelectorAll("[data-report-page]")].map(sheet => ({ width: sheet.clientWidth, scroll: sheet.scrollWidth })) }));
      assert(overflow.document <= overflow.viewport + 2 && overflow.sheets.every(sheet => sheet.scroll <= sheet.width + 2), `52억원 ${viewport.name}: horizontal overflow ${JSON.stringify(overflow)}`);
      await page.locator('[data-report-page="1"]').screenshot({ path: path.join(outputDir, `paper-report-52-${viewport.name}.png`) });
      observations.push({ viewport: viewport.name, ...screen, overflow });
      if (viewport.name === "desktop") {
        await page.emulateMedia({ media: "print" });
        const print = await assertPaperTemplate(page, "52억원 print");
        const bounds = await assertReportPrintBounds(page, { outputPath: path.join(outputDir, "paper-report-52-print-bounds.json"), label: "52억원 approved paper template" });
        const pdfPath = path.join(outputDir, "paper-report-52.pdf");
        const pdf = await page.pdf({ path: pdfPath, format: "A4", printBackground: true, preferCSSPageSize: true });
        const { stdout } = await runFile("python", ["-c", "import json,sys; from pypdf import PdfReader; r=PdfReader(sys.argv[1]); print(json.dumps({'pages':len(r.pages),'sizes':[[float(p.mediabox.width),float(p.mediabox.height)] for p in r.pages]}))", pdfPath]);
        const physical = JSON.parse(stdout);
        assert.equal(physical.pages, 7, "52억원 report must contain seven physical PDF pages");
        assert(physical.sizes.every(([width, height]) => Math.abs(width - 595.28) < 1 && Math.abs(height - 841.89) < 1), "52억원 report PDF pages must be A4");
        for (let number = 1; number <= 7; number += 1) await page.locator(`[data-report-page="${number}"]`).screenshot({ path: path.join(outputDir, `paper-report-52-page-${number}.png`) });
        observations.push({ media: "print", ...print, physical, boundsStatus: bounds.status, pdf: pdfPath, bytes: pdf.byteLength });
      }
      await page.close();
    }
  } finally { await browser.close(); }
  await writeFile(path.join(outputDir, "paper-report-52-audit.json"), `${JSON.stringify({ status: "passed", assessmentId: seededAssessment.assessment_id, observations }, null, 2)}\n`);
  console.log(JSON.stringify({ status: "passed", assessmentId: seededAssessment.assessment_id, verified: "same paper template, loaded Korean serif, exact 52억원 facts, mobile/desktop, seven unclipped A4 pages" }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await runAudit();
