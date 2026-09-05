import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const outputDir = process.env.UI_AUDIT_DIR ?? "artifacts/ui-audit";

const routes = [
  { name: "landing", path: "/", area: "public" },
  { name: "precheck", path: "/precheck", area: "public" },
  { name: "precheck-query-bypass", path: "/precheck?step=3", area: "public" },
  { name: "result-empty", path: "/precheck/result", area: "public" },
  { name: "expert-overview", path: "/expert/overview", area: "expert" },
  { name: "expert-workspace", path: "/expert/workspace", area: "expert" },
  { name: "report-empty", path: "/report-preview", area: "public" },
  { name: "phase-2b-engine", path: "/phase-2b", area: "internal" }
];

const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 }
];

const failures = [];
const observations = [];

function fail(route, viewport, message) {
  failures.push({ route, viewport, message });
}

function normalizePath(value) {
  if (!value) return "";
  try {
    const url = new URL(value, baseURL);
    return url.pathname.replace(/\/$/, "") || "/";
  } catch {
    return value;
  }
}

async function completeHybridPrecheck(page) {
  await page.goto(`${baseURL}/precheck`, { waitUntil: "networkidle", timeout: 30_000 });
  await page.getByRole("textbox", { name: "직접 입력" }).fill("상속 준비, 배우자 있음, 자녀 2명, 부동산 42억, 금융자산 8억, 담보대출 2억, 최근 10년 증여 있음, 납부재원 부족액이 궁금합니다.");
  await page.getByRole("button", { name: "직접 입력 이해하기" }).click();
  await page.getByText("제가 이렇게 이해했습니다.", { exact: true }).waitFor({ timeout: 10_000 });
  await page.getByRole("button", { name: "맞아요" }).click();

  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("radio", { name: "상속세 납부재원 준비" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("radio", { name: "세금·비용" }).click();
  await page.getByRole("button", { name: "결과 보기" }).click();
  await page.waitForURL("**/precheck/result**", { timeout: 10_000 });
  await page.getByText("개인화 시나리오 플랜").waitFor({ timeout: 10_000 });
}

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1
    });

    const emptyConsultationPage = await context.newPage();
    await emptyConsultationPage.goto(`${baseURL}/consultation`, { waitUntil: "networkidle", timeout: 30_000 });
    const emptyConsultationText = await emptyConsultationPage.locator("body").innerText();
    if (!emptyConsultationText.includes("상담 신청 전 사전진단이 필요합니다.") || emptyConsultationText.includes("입력한 내용을 다시 작성할 필요가 없습니다.")) {
      fail("/consultation", viewport.name, "Consultation without stored assessment does not clearly lock the form and remove the handoff-copy.");
    }
    if (await emptyConsultationPage.getByRole("button", { name: "상담 신청하기" }).count() > 0) {
      fail("/consultation", viewport.name, "Consultation without stored assessment still exposes the submit button.");
    }
    await emptyConsultationPage.screenshot({
      path: path.join(outputDir, `${viewport.name}-consultation-empty-locked.png`),
      fullPage: true
    });
    await emptyConsultationPage.close();

    for (const route of routes) {
      const page = await context.newPage();
      const response = await page.goto(`${baseURL}${route.path}`, { waitUntil: "networkidle", timeout: 30_000 });

      if (!response || !response.ok()) {
        fail(route.path, viewport.name, `Route did not return a successful response: ${response?.status() ?? "no response"}`);
        await page.close();
        continue;
      }

      await page.screenshot({
        path: path.join(outputDir, `${viewport.name}-${route.name}.png`),
        fullPage: true
      });

      const layout = await page.evaluate(() => {
        const root = document.documentElement;
        const body = document.body;
        return {
          documentScrollWidth: root.scrollWidth,
          documentClientWidth: root.clientWidth,
          bodyScrollWidth: body.scrollWidth
        };
      });

      if (
        layout.documentScrollWidth > layout.documentClientWidth + 2 ||
        layout.bodyScrollWidth > layout.documentClientWidth + 2
      ) {
        fail(route.path, viewport.name, `Page-level horizontal overflow detected (${layout.documentScrollWidth}px > ${layout.documentClientWidth}px).`);
      }

      const bodyText = await page.locator("body").innerText();

      if (route.area === "public") {
        const expertLinks = await page.locator('a[href^="/expert"]').count();
        if (expertLinks > 0) {
          fail(route.path, viewport.name, `Public page exposes ${expertLinks} expert-route link(s).`);
        }
      }

      if (route.path === "/precheck" || route.path.startsWith("/precheck?")) {
        if (!bodyText.includes("어떤 준비를 고민하고 계신가요?")) {
          fail(route.path, viewport.name, "Precheck should start from the #9 planning-purpose question.");
        }
        if (route.name === "precheck-query-bypass" && bodyText.includes("채무나 과거 증여처럼 결과에 영향을 주는 항목이 있나요?")) {
          fail(route.path, viewport.name, "Query parameter step bypass opened a future step directly.");
        }
        const labels = ["준비 목적", "가족", "자산", "채무·과거 증여", "승계 목표", "결과 준비"];
        const missingLabels = labels.filter((label) => !bodyText.includes(label));
        if (viewport.name === "desktop" && missingLabels.length > 0) {
          fail(route.path, viewport.name, `Precheck sidebar is missing labels: ${missingLabels.join(", ")}`);
        }
        const questionBox = await page.getByText("어떤 준비를 고민하고 계신가요?").first().boundingBox();
        const firstChoiceBox = await page.getByRole("radio", { name: "상속" }).first().boundingBox();
        if (viewport.name === "mobile" && (!questionBox || questionBox.y > viewport.height * 0.54 || !firstChoiceBox || firstChoiceBox.y > viewport.height * 0.78)) {
          fail(route.path, viewport.name, "Mobile first viewport does not surface the planning-purpose question and first choice quickly enough.");
        }
        await page.getByRole("button", { name: "다음" }).click();
        if (!await page.getByText(/현재 단계의 필수 항목을 입력해야/).isVisible()) {
          fail(route.path, viewport.name, "Required-choice validation did not block an empty planning-purpose step.");
        }
        await page.getByRole("textbox", { name: "직접 입력" }).fill("상속 준비, 배우자 있음, 자녀 2명, 부동산 42억, 금융자산 8억");
        await page.getByRole("button", { name: "직접 입력 이해하기" }).click();
        if (!await page.getByText("제가 이렇게 이해했습니다.", { exact: true }).isVisible()) {
          fail(route.path, viewport.name, "Direct input did not produce a confirmation candidate.");
        }
        await page.getByRole("button", { name: "맞아요" }).click();
        if (!await page.getByText("확정된 사실").isVisible()) {
          fail(route.path, viewport.name, "Confirmed conversational facts were not displayed after user confirmation.");
        }
      }

      if (route.path === "/precheck/result") {
        if (!bodyText.includes("사전진단 입력값 없음") || !bodyText.includes("사전진단 시작하기")) {
          fail(route.path, viewport.name, "Result page without stored assessment does not show the required empty state CTA.");
        }
        const priorityMetrics = ["총 부담", "즉시 필요현금", "납부재원 부족액"];
        const firstCountIndex = bodyText.indexOf("비교 전략");
        const missingPriorityMetrics = priorityMetrics.filter((metric) => bodyText.indexOf(metric) < 0 || (firstCountIndex >= 0 && bodyText.indexOf(metric) > firstCountIndex));
        if (missingPriorityMetrics.length > 0) {
          fail(route.path, viewport.name, `Result page does not prioritize decision metrics above counts: ${missingPriorityMetrics.join(", ")}`);
        }
      }

      if (route.area === "expert" && viewport.name === "mobile") {
        const mobileMenu = page.getByRole("button", { name: /메뉴|탐색|내비게이션|navigation/i }).first();
        if (await mobileMenu.count() === 0) {
          fail(route.path, viewport.name, "Expert mobile navigation button/drawer trigger is missing.");
        } else {
          await mobileMenu.click();
          const drawerText = await page.locator("[role='dialog']").innerText().catch(() => "");
          const requiredExpertNav = ["프로젝트 개요", "가족·자산", "시나리오", "검토·쟁점", "보고서", "규칙·출처"];
          const missingDrawerNav = requiredExpertNav.filter((label) => !drawerText.includes(label));
          if (missingDrawerNav.length > 0) {
            fail(route.path, viewport.name, `Expert mobile drawer is missing: ${missingDrawerNav.join(", ")}`);
          }
          await page.getByRole("button", { name: "전문가 메뉴 닫기" }).click();
        }
      }

      if (route.path === "/expert/workspace") {
        await page.getByRole("button", { name: "부담부증여 검토" }).click();
        const burdenedGiftSelected = await page.locator("[aria-selected='true']").innerText().catch(() => "");
        const burdenedGiftHeading = await page.getByText("부담부증여 검토 시나리오").count();
        if (!burdenedGiftSelected.includes("부담부증여 검토") || burdenedGiftHeading === 0) {
          fail(route.path, viewport.name, "Scenario tab click did not update the active tab and body heading for burdened gift.");
        }
        await page.getByRole("button", { name: "가족법인 활용" }).click();
        await page.getByRole("button", { name: "이벤트 수정" }).click();
        const editorDialog = page.getByRole("dialog", { name: "이벤트 편집" });
        if (!await editorDialog.isVisible()) {
          fail(route.path, viewport.name, "Event edit button did not open the event editor dialog.");
        } else {
          const savedMemo = `자동검증 저장 메모 ${viewport.name}`;
          await editorDialog.getByLabel("검토 메모").fill(savedMemo);
          await editorDialog.getByRole("button", { name: "합성 변경사항 저장" }).click();
          if (!await page.getByText("화면에만 임시 반영됨").first().isVisible()) {
            fail(route.path, viewport.name, "Event editor save did not show the temporary-on-screen confirmation.");
          }
          await page.getByRole("button", { name: "이벤트 편집 닫기" }).click();
        }
      }

      if (route.path === "/report-preview") {
        if (!bodyText.includes("사전진단 입력값 없음")) {
          fail(route.path, viewport.name, "Report preview without stored assessment should not render a personal report.");
        }
      }

      if (route.path === "/phase-2b") {
        const requiredEngineLabels = [
          "PHASE 2B ENGINE FOUNDATION",
          "상속",
          "증여",
          "가업상속·가업승계",
          "양도",
          "0.5억 산출세액",
          "0.3억 절세 예상",
          "Report V2 #5",
          "Conversational Precheck V2 #6"
        ];
        const missingEngineLabels = requiredEngineLabels.filter((label) => !bodyText.includes(label));
        if (missingEngineLabels.length > 0) {
          fail(route.path, viewport.name, `Phase 2B engine story is missing contract labels: ${missingEngineLabels.join(", ")}`);
        }
      }

      observations.push({
        route: route.path,
        viewport: viewport.name,
        screenshot: `${viewport.name}-${route.name}.png`,
        documentWidth: layout.documentScrollWidth,
        viewportWidth: layout.documentClientWidth
      });

      await page.close();
    }

    const flowPage = await context.newPage();
    await completeHybridPrecheck(flowPage);
    await flowPage.getByText("개인화 시나리오 플랜").waitFor({ timeout: 10_000 });
    const resultText = await flowPage.locator("body").innerText();
    const assessmentMatch = resultText.match(/AS360-\d{8}-[A-Z0-9]+/);
    if (!assessmentMatch || !resultText.includes("개인화 시나리오 플랜") || !resultText.includes("입력 총자산") || !resultText.includes("50억")) {
      fail("/precheck/result", viewport.name, "Hybrid precheck did not hand confirmed facts to the result page.");
    } else {
      const leakedResultNumbers = ["총자산 55억", "순자산 47억", "가용 현금\n5억", "부모 잔여재산\n55억", "9.5~12억", "6.3~8.6억"].filter((text) => resultText.includes(text));
      if (leakedResultNumbers.length > 0) {
        fail("/precheck/result", viewport.name, `Result page leaked stale sample numbers: ${leakedResultNumbers.join(", ")}`);
      }
      await flowPage.screenshot({
        path: path.join(outputDir, `${viewport.name}-result-with-hybrid-assessment.png`),
        fullPage: true
      });

      await flowPage.goto(`${baseURL}/report-preview?assessment_id=${encodeURIComponent(assessmentMatch[0])}`, { waitUntil: "networkidle", timeout: 30_000 });
      await flowPage.getByText("Report V2 7/7").waitFor({ timeout: 10_000 });
      const reportText = await flowPage.locator("body").innerText();
      const pageCount = await flowPage.locator("[data-report-page]").count();
      if (!reportText.includes(assessmentMatch[0]) || !reportText.includes("Report V2 7/7") || pageCount !== 7) {
        fail("/report-preview", viewport.name, `Report V2 did not render exactly seven personal pages. pages=${pageCount}`);
      }
      const leakedReportNumbers = ["55억", "9.5~12억", "6.3~8.6억", "채무·보증금\n8억", "입력 순자산\n42억"].filter((text) => reportText.includes(text));
      if (leakedReportNumbers.length > 0) {
        fail("/report-preview", viewport.name, `Report preview leaked stale sample numbers: ${leakedReportNumbers.join(", ")}`);
      }
      await flowPage.screenshot({
        path: path.join(outputDir, `${viewport.name}-report-v2-seven-pages.png`),
        fullPage: true
      });

      if (viewport.name === "desktop") {
        await flowPage.emulateMedia({ media: "print" });
        await flowPage.screenshot({
          path: path.join(outputDir, "desktop-report-v2-print.png"),
          fullPage: true
        });
        const printText = await flowPage.locator("body").innerText();
        if (printText.includes("서비스 소개") || printText.includes("결과 비교로 돌아가기") || printText.includes("PDF 저장")) {
          fail("/report-preview", viewport.name, "Print preview exposes navigation or browser-instruction controls.");
        }
        await flowPage.emulateMedia({ media: "screen" });
      }

      await flowPage.goto(`${baseURL}/consultation`, { waitUntil: "networkidle", timeout: 30_000 });
      await flowPage.getByText(assessmentMatch[0]).first().waitFor({ timeout: 10_000 });
      const consultationText = await flowPage.locator("body").innerText();
      if (!consultationText.includes(assessmentMatch[0])) {
        fail("/consultation", viewport.name, "Assessment snapshot was not handed off to consultation.");
      }
      await flowPage.getByRole("button", { name: "상담 신청하기" }).click();
      if (!await flowPage.getByRole("alert").getByText("상담 대표자를 입력해 주세요.").isVisible()) {
        fail("/consultation", viewport.name, "Consultation required-field validation did not run.");
      }
      await flowPage.getByLabel("상담 대표자").fill("가족 대표");
      await flowPage.getByLabel("전화번호").fill("010-0000-0000");
      await flowPage.getByLabel("상담 희망내용").fill("상속세 납부재원과 일부 증여를 함께 보고 싶습니다.");
      await flowPage.getByLabel(/개인정보 수집·이용/).check();
      await flowPage.getByRole("button", { name: "상담 신청하기" }).click();
      const successText = await flowPage.locator("body").innerText();
      if (!successText.includes("상담 신청이 접수되었습니다.") || !successText.includes("RCV-") || !successText.includes(assessmentMatch[0])) {
        fail("/consultation", viewport.name, "Consultation local success state did not preserve receipt and assessment IDs.");
      }
      await flowPage.screenshot({
        path: path.join(outputDir, `${viewport.name}-consultation-success.png`),
        fullPage: true
      });
    }
    await flowPage.close();

    await context.close();
  }
} finally {
  await browser.close();
}

const report = {
  generatedAt: new Date().toISOString(),
  baseURL,
  failures,
  observations
};

await writeFile(path.join(outputDir, "ui-audit-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (failures.length > 0) {
  console.error(`UI audit failed with ${failures.length} issue(s):`);
  for (const item of failures) {
    console.error(`- [${item.viewport}] ${item.route}: ${item.message}`);
  }
  process.exit(1);
}

console.log(`UI audit passed for ${routes.length} routes plus hybrid flow across ${viewports.length} viewports.`);
