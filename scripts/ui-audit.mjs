import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const outputDir = process.env.UI_AUDIT_DIR ?? "artifacts/ui-audit";

const routes = [
  { name: "landing", path: "/", area: "public" },
  { name: "wizard-step1", path: "/precheck", area: "public" },
  { name: "wizard-step3", path: "/precheck?step=3", area: "public" },
  { name: "result", path: "/precheck/result", area: "public" },
  { name: "expert-overview", path: "/expert/overview", area: "expert" },
  { name: "expert-workspace", path: "/expert/workspace", area: "expert" },
  { name: "report-preview", path: "/report-preview", area: "public" }
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

async function completeWizard(page) {
  await page.goto(`${baseURL}/precheck`, { waitUntil: "networkidle", timeout: 30_000 });
  await page.getByRole("radio", { name: "부모 2명 기준" }).click();
  await page.getByLabel("배우자 유무", { exact: true }).selectOption("있음");
  await page.getByLabel("성년 자녀 수", { exact: true }).selectOption("2명");
  await page.getByLabel("미성년 자녀 수", { exact: true }).selectOption("0명");
  await page.getByRole("button", { name: "다음" }).click();

  await page.getByRole("checkbox", { name: "부동산" }).click();
  await page.getByRole("checkbox", { name: "금융자산" }).click();
  await page.getByLabel("부동산 금액(억원)").fill("42");
  await page.getByLabel("금융자산 금액(억원)").fill("8");
  await page.getByRole("button", { name: "다음" }).click();

  await page.getByRole("checkbox", { name: "담보대출 있음" }).click();
  await page.getByLabel("담보대출 있음 금액(억원)").fill("2");
  await page.getByRole("checkbox", { name: "최근 10년 증여 있음" }).click();
  await page.getByRole("button", { name: "다음" }).click();

  await page.getByRole("radio", { name: "상속세 납부재원 준비" }).click();
  await page.getByRole("button", { name: "다음" }).click();

  await page.getByRole("radio", { name: "세금·비용" }).click();
  await page.getByRole("button", { name: "결과 보기" }).click();
  await page.waitForURL("**/precheck/result**", { timeout: 10_000 });
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
      const url = `${baseURL}${route.path}`;
      const response = await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });

      if (!response || !response.ok()) {
        fail(route.path, viewport.name, `Route did not return a successful response: ${response?.status() ?? "no response"}`);
        await page.close();
        continue;
      }

      if (route.name === "wizard-step3") {
        if (!await page.getByText("승계 의사결정에 참여할 가족 구성을 알려주세요.").isVisible()) {
          fail(route.path, viewport.name, "Query parameter step bypass should not open Step 3 directly.");
        }
        await page.getByRole("radio", { name: "부모 2명 기준" }).click();
        await page.getByLabel("배우자 유무", { exact: true }).selectOption("있음");
        await page.getByLabel("성년 자녀 수", { exact: true }).selectOption("2명");
        await page.getByLabel("미성년 자녀 수", { exact: true }).selectOption("0명");
        await page.getByRole("button", { name: "다음" }).click();
        await page.getByRole("checkbox", { name: "부동산" }).click();
        await page.getByLabel("부동산 금액(억원)").fill("42");
        await page.getByRole("button", { name: "다음" }).click();
      }

      await page.screenshot({
        path: path.join(outputDir, `${viewport.name}-${route.name}.png`),
        fullPage: true
      });

      const layout = await page.evaluate(() => {
        const root = document.documentElement;
        const body = document.body;
        const wideTables = Array.from(document.querySelectorAll("table")).map((table) => ({
          width: Math.ceil(table.getBoundingClientRect().width),
          scrollWidth: table.scrollWidth,
          clientWidth: table.clientWidth
        }));

        return {
          documentScrollWidth: root.scrollWidth,
          documentClientWidth: root.clientWidth,
          bodyScrollWidth: body.scrollWidth,
          wideTables
        };
      });

      if (
        layout.documentScrollWidth > layout.documentClientWidth + 2 ||
        layout.bodyScrollWidth > layout.documentClientWidth + 2
      ) {
        fail(route.path, viewport.name, `Page-level horizontal overflow detected (${layout.documentScrollWidth}px > ${layout.documentClientWidth}px).`);
      }

      if (viewport.name === "mobile" && route.path === "/precheck/result") {
        const oversizedTable = layout.wideTables.find((table) => table.width > viewport.width + 2 || table.scrollWidth > viewport.width + 2);
        if (oversizedTable) {
          fail(route.path, viewport.name, "Mobile result view still contains a desktop-width comparison table. Use cards, accordion, or tabs instead.");
        }
      }

      const bodyText = await page.locator("body").innerText();

      if (route.area === "public") {
        const expertLinks = await page.locator('a[href^="/expert"]').count();
        if (expertLinks > 0) {
          fail(route.path, viewport.name, `Public page exposes ${expertLinks} expert-route link(s).`);
        }

        const developerLanguage = [
          "Prototype notice",
          "연결된 상태처럼 구성",
          "실제 운영 전에는",
          "Loading",
          "Empty",
          "Warning",
          "Blocked"
        ].filter((phrase) => bodyText.includes(phrase));

        if (developerLanguage.length > 0) {
          fail(route.path, viewport.name, `Customer-facing copy contains developer language: ${developerLanguage.join(", ")}`);
        }
      }

      if (route.path === "/precheck") {
        const requiredSteps = ["가족", "자산", "채무·과거 증여", "승계 목표", "결과 준비"];
        const expectedStepLabels = viewport.name === "mobile" ? ["가족"] : requiredSteps;
        const missingSteps = expectedStepLabels.filter((step) => !bodyText.includes(step));
        if (missingSteps.length > 0) {
          fail(route.path, viewport.name, `Wizard is missing step labels: ${missingSteps.join(", ")}`);
        }

        const nextControlCount = await page.getByRole("button", { name: /다음|계속/ }).count()
          + await page.getByRole("link", { name: /다음|계속/ }).count();
        const previousControlCount = await page.getByRole("button", { name: /이전/ }).count()
          + await page.getByRole("link", { name: /이전/ }).count();

        if (nextControlCount === 0) {
          fail(route.path, viewport.name, "No next-step control was found; the page appears to be a static wizard mockup.");
        }
        if (previousControlCount === 0) {
          fail(route.path, viewport.name, "No previous-step control was found; the page does not expose reversible wizard navigation.");
        }

        if (viewport.name === "mobile") {
          const firstQuestionBox = await page.getByText("승계 의사결정에 참여할 가족 구성을 알려주세요.").boundingBox();
          const firstChoiceBox = await page.getByRole("radio", { name: "부모 2명 기준" }).boundingBox();
          if (!firstQuestionBox || firstQuestionBox.y > viewport.height * 0.56 || !firstChoiceBox || firstChoiceBox.y > viewport.height * 0.72) {
            fail(route.path, viewport.name, "Mobile first viewport does not surface the first precheck question and primary choice quickly enough.");
          }
        }

        const futureStepButton = page.getByRole("button", { name: "결과 준비" });
        if (await futureStepButton.count() > 0 && !await futureStepButton.isDisabled()) {
          fail(route.path, viewport.name, "Wizard allows direct jumping to Step 5 before prior required steps are complete.");
        }

        await page.getByRole("button", { name: "다음" }).click();
        if (!await page.getByText(/현재 단계의 필수 항목을 입력해야/).isVisible()) {
          fail(route.path, viewport.name, "Required-choice validation message did not appear before moving to the next wizard step.");
        }

        await page.getByRole("radio", { name: "부모 2명 기준" }).click();
        await page.getByLabel("배우자 유무", { exact: true }).selectOption("있음");
        await page.getByLabel("성년 자녀 수", { exact: true }).selectOption("2명");
        await page.getByLabel("미성년 자녀 수", { exact: true }).selectOption("0명");
        await page.getByRole("button", { name: "다음" }).click();
        if (!await page.getByText("승계 대상 자산의 큰 구성을 선택해 주세요.").isVisible()) {
          fail(route.path, viewport.name, "Wizard did not advance from Step 1 to Step 2 after a valid choice.");
        }

        await page.getByRole("button", { name: "이전" }).click();
        if (!await page.getByText("승계 의사결정에 참여할 가족 구성을 알려주세요.").isVisible()) {
          fail(route.path, viewport.name, "Wizard previous button did not return to Step 1.");
        }

        await page.getByRole("button", { name: "다음" }).click();
        if (!await page.getByText("승계 대상 자산의 큰 구성을 선택해 주세요.").isVisible()) {
          fail(route.path, viewport.name, "Wizard did not preserve Step 1 state after using previous/next navigation.");
        }

        await page.getByRole("checkbox", { name: "부동산" }).click();
        await page.getByRole("checkbox", { name: "금융자산" }).click();
        await page.getByLabel("부동산 금액(억원)").fill("-5");
        await page.getByLabel("금융자산 금액(억원)").fill("8");
        await page.getByRole("button", { name: "다음" }).click();
        if (!await page.getByText(/현재 단계의 필수 항목.*금액은 0보다 큰 숫자/).isVisible()) {
          fail(route.path, viewport.name, "Negative asset amount was not blocked before moving to Step 3.");
        }
        await page.getByLabel("부동산 금액(억원)").fill("0");
        await page.getByRole("button", { name: "다음" }).click();
        if (!await page.getByText(/현재 단계의 필수 항목.*금액은 0보다 큰 숫자/).isVisible()) {
          fail(route.path, viewport.name, "Zero asset amount was not blocked before moving to Step 3.");
        }
        await page.getByLabel("부동산 금액(억원)").evaluate((input) => {
          const element = input;
          const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
          valueSetter?.call(element, "5000만원");
          element.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await page.getByRole("button", { name: "다음" }).click();
        if (!await page.getByText(/현재 단계의 필수 항목.*금액은 0보다 큰 숫자/).isVisible()) {
          fail(route.path, viewport.name, "Non-standard unit asset amount was not blocked before moving to Step 3.");
        }
        await page.getByLabel("부동산 금액(억원)").fill("42");
        await page.getByLabel("금융자산 금액(억원)").fill("8");
        await page.getByRole("button", { name: "다음" }).click();
        if (!await page.getByText("채무나 과거 증여처럼 결과에 영향을 주는 항목이 있나요?").isVisible()) {
          fail(route.path, viewport.name, "Wizard did not advance to Step 3.");
        }

        await page.getByRole("checkbox", { name: "담보대출 있음" }).click();
        await page.getByRole("checkbox", { name: "최근 10년 증여 있음" }).click();
        const mortgageChecked = await page.getByRole("checkbox", { name: "담보대출 있음" }).getAttribute("aria-checked");
        const giftChecked = await page.getByRole("checkbox", { name: "최근 10년 증여 있음" }).getAttribute("aria-checked");
        if (mortgageChecked !== "true" || giftChecked !== "true") {
          fail(route.path, viewport.name, "Debt/past-gift Step 3 does not support accessible multi-select.");
        }

        await page.getByRole("checkbox", { name: "해당 없음" }).click();
        const noneChecked = await page.getByRole("checkbox", { name: "해당 없음" }).getAttribute("aria-checked");
        const mortgageAfterNone = await page.getByRole("checkbox", { name: "담보대출 있음" }).getAttribute("aria-checked");
        const giftAfterNone = await page.getByRole("checkbox", { name: "최근 10년 증여 있음" }).getAttribute("aria-checked");
        if (noneChecked !== "true" || mortgageAfterNone === "true" || giftAfterNone === "true") {
          fail(route.path, viewport.name, "Step 3 '해당 없음' is not mutually exclusive with other debt/past-gift choices.");
        }

        await page.getByRole("checkbox", { name: "잘 모르겠음" }).click();
        const unsureChecked = await page.getByRole("checkbox", { name: "잘 모르겠음" }).getAttribute("aria-checked");
        const noneAfterUnsure = await page.getByRole("checkbox", { name: "해당 없음" }).getAttribute("aria-checked");
        if (unsureChecked !== "true" || noneAfterUnsure === "true") {
          fail(route.path, viewport.name, "Step 3 '잘 모르겠음' is not mutually exclusive with '해당 없음'.");
        }

        await page.getByRole("checkbox", { name: "담보대출 있음" }).click();
        await page.getByRole("checkbox", { name: "최근 10년 증여 있음" }).click();
        await page.getByRole("button", { name: "다음" }).click();
        if (!await page.getByText(/현재 단계의 필수 항목.*금액은 0보다 큰 숫자/).isVisible()) {
          fail(route.path, viewport.name, "Debt choice without a debt amount was not blocked before moving to Step 4.");
        }
        const debtWithoutAmountText = await page.locator("body").innerText();
        if (debtWithoutAmountText.includes("채무·보증금\n8억") || debtWithoutAmountText.includes("입력 순자산\n42억")) {
          fail(route.path, viewport.name, "Debt choice without amount generated an arbitrary debt or net-asset number.");
        }
        await page.getByLabel("담보대출 있음 금액(억원)").fill("2");

        await page.getByRole("button", { name: "다음" }).click();
        await page.getByRole("radio", { name: "상속세 납부재원 준비" }).click();
        await page.getByRole("button", { name: "다음" }).click();
        const step5Text = await page.locator("body").innerText();
        const missingStep5Summary = ["배우자 유무: 있음", "성년 자녀 수: 2명", "미성년 자녀 수: 0명", "부동산: 42억", "금융자산: 8억", "담보대출 있음: 2억"].filter((text) => !step5Text.includes(text));
        if (missingStep5Summary.length > 0) {
          fail(route.path, viewport.name, `Step 5 review summary is missing detailed answer values: ${missingStep5Summary.join(", ")}`);
        }
        await page.screenshot({
          path: path.join(outputDir, `${viewport.name}-wizard-step5-review.png`),
          fullPage: true
        });
        await page.getByRole("button", { name: "결과 보기" }).click();
        if (!await page.getByText(/현재 단계의 필수 항목을 입력해야/).isVisible()) {
          fail(route.path, viewport.name, "Step 5 result navigation is not blocked when the review perspective is unselected.");
        }
        if (normalizePath(page.url()) === "/precheck/result") {
          fail(route.path, viewport.name, "Step 5 unvalidated result button routed to the result page.");
        }

        await page.getByRole("radio", { name: "세금·비용" }).click();
        await page.getByRole("button", { name: "결과 보기" }).click();
        await page.waitForURL("**/precheck/result", { timeout: 10_000 }).catch(() => undefined);
        if (normalizePath(page.url()) !== "/precheck/result") {
          fail(route.path, viewport.name, "Step 5 did not route to results after selecting a review perspective.");
        }

        const resultText = await page.locator("body").innerText();
        const assessmentMatch = resultText.match(/AS360-\d{8}-[A-Z0-9]+/);
        if (!assessmentMatch || !resultText.includes("부동산: 42억") || !resultText.includes("금융자산: 8억")) {
          fail(route.path, viewport.name, "Assessment snapshot was not handed off to the result page.");
        } else {
          const forbiddenResultNumbers = ["총자산 55억", "순자산 47억", "가용 현금\n5억", "부모 잔여재산\n55억", "9.5~12억", "6.3~8.6억"];
          const leakedResultNumbers = forbiddenResultNumbers.filter((text) => resultText.includes(text));
          if (!resultText.includes("50억") || leakedResultNumbers.length > 0) {
            fail(route.path, viewport.name, `Result page still mixes assessment inputs with fixed sample numbers: ${leakedResultNumbers.join(", ") || "missing 50억"}.`);
          }
          await page.screenshot({
            path: path.join(outputDir, `${viewport.name}-result-with-assessment.png`),
            fullPage: true
          });

          await page.goto(`${baseURL}/precheck/result?assessment_id=AS360-19990101-STALE`, { waitUntil: "networkidle", timeout: 30_000 });
          const mismatchText = await page.locator("body").innerText();
          if (!mismatchText.includes("사전진단 ID 불일치")) {
            fail(route.path, viewport.name, "Result page does not reject mismatched assessment_id query parameters.");
          }
          await page.screenshot({
            path: path.join(outputDir, `${viewport.name}-result-assessment-mismatch.png`),
            fullPage: true
          });

          await page.goto(`${baseURL}/report-preview?assessment_id=${encodeURIComponent(assessmentMatch[0])}`, { waitUntil: "networkidle", timeout: 30_000 });
          const reportHandoffText = await page.locator("body").innerText();
          const forbiddenReportNumbers = ["55억", "9.5~12억", "6.3~8.6억", "채무·보증금\n8억", "입력 순자산\n42억"];
          const leakedReportNumbers = forbiddenReportNumbers.filter((text) => reportHandoffText.includes(text));
          if (!reportHandoffText.includes(assessmentMatch[0]) || !reportHandoffText.includes("우선 관점: 세금·비용") || !reportHandoffText.includes("입력 총자산") || !reportHandoffText.includes("50억") || leakedReportNumbers.length > 0) {
            fail(route.path, viewport.name, "Assessment snapshot was not handed off to report preview.");
          }
          await page.screenshot({
            path: path.join(outputDir, `${viewport.name}-report-with-assessment.png`),
            fullPage: true
          });

          await page.goto(`${baseURL}/consultation`, { waitUntil: "networkidle", timeout: 30_000 });
          const consultationHandoffText = await page.locator("body").innerText();
          if (!consultationHandoffText.includes(assessmentMatch[0])) {
            fail(route.path, viewport.name, "Assessment snapshot was not handed off to consultation.");
          }
          await page.screenshot({
            path: path.join(outputDir, `${viewport.name}-consultation-with-assessment.png`),
            fullPage: true
          });

          await page.getByRole("button", { name: "상담 신청하기" }).click();
          if (!await page.getByRole("alert").getByText("상담 대표자를 입력해 주세요.").isVisible()) {
            fail(route.path, viewport.name, "Consultation required-field validation did not run.");
          }
          await page.getByLabel("상담 대표자").fill("가족 대표");
          await page.getByLabel("전화번호").fill("010-0000-0000");
          await page.getByLabel("상담 희망내용").fill("상속세 납부재원과 일부 증여를 함께 보고 싶습니다.");
          await page.getByLabel(/개인정보 수집·이용/).check();
          await page.getByRole("button", { name: "상담 신청하기" }).click();
          const successText = await page.locator("body").innerText();
          if (!successText.includes("상담 신청이 접수되었습니다.") || !successText.includes("RCV-") || !successText.includes(assessmentMatch[0])) {
            fail(route.path, viewport.name, "Consultation local success state did not preserve receipt and assessment IDs.");
          }
          await page.screenshot({
            path: path.join(outputDir, `${viewport.name}-consultation-success.png`),
            fullPage: true
          });
        }
      }

      if (route.path === "/precheck/result") {
        const reportCandidates = page.getByRole("link", { name: /무료.*보고서|보고서.*다운로드/ });
        const reportButtons = page.getByRole("button", { name: /무료.*보고서|보고서.*다운로드/ });
        const reportLinkCount = await reportCandidates.count();
        const reportButtonCount = await reportButtons.count();

        if (reportLinkCount + reportButtonCount === 0) {
          fail(route.path, viewport.name, "No report download or report preview CTA was found.");
        } else if (reportLinkCount > 0) {
          const href = await reportCandidates.first().getAttribute("href");
          const target = normalizePath(href);
          const current = normalizePath(route.path);
          if (!href || href === "#" || target === current) {
            fail(route.path, viewport.name, `Report CTA points to an invalid or self-referencing target: ${href ?? "missing href"}`);
          } else {
            const reportResponse = await page.goto(new URL(href, baseURL).toString(), { waitUntil: "networkidle", timeout: 30_000 });
            if (!reportResponse || !reportResponse.ok()) {
              fail(route.path, viewport.name, `Report CTA target did not load successfully: ${href}`);
            }
          }
        }

        if (!bodyText.includes("부담부증여")) {
          fail(route.path, viewport.name, "The result page does not show or explicitly separate the burdened-gift review strategy.");
        }

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
        const mobileMenuCount = await mobileMenu.count();
        if (mobileMenuCount === 0) {
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

      if (route.area === "expert" && viewport.name === "desktop") {
        const requiredExpertNav = ["프로젝트 개요", "가족·자산", "시나리오", "검토·쟁점", "보고서", "규칙·출처"];
        const missingExpertNav = requiredExpertNav.filter((label) => !bodyText.includes(label));
        if (missingExpertNav.length > 0) {
          fail(route.path, viewport.name, `Expert navigation is missing: ${missingExpertNav.join(", ")}`);
        }
      }

      if (route.path === "/expert/workspace") {
        const selectedTab = await page.locator("[aria-selected='true']").innerText().catch(() => "");
        const scenarioHeading = await page.getByText("가족법인 활용 시나리오").count();
        if (!selectedTab.includes("가족법인 활용") || scenarioHeading === 0) {
          fail(route.path, viewport.name, `Selected scenario tab and body heading do not match: ${selectedTab || "no selected tab"}`);
        }

        await page.getByRole("button", { name: "부담부증여 검토" }).click();
        const burdenedGiftSelected = await page.locator("[aria-selected='true']").innerText().catch(() => "");
        const burdenedGiftHeading = await page.getByText("부담부증여 검토 시나리오").count();
        if (!burdenedGiftSelected.includes("부담부증여 검토") || burdenedGiftHeading === 0) {
          fail(route.path, viewport.name, "Scenario tab click did not update the active tab and body heading for burdened gift.");
        }
        if (await page.getByText("가족법인 설립").count() > 0) {
          fail(route.path, viewport.name, "Burdened-gift strategy is still reusing family corporation timeline events.");
        }
        if (await page.getByText("이 전략의 상세 이벤트는 정밀검토 단계에서 구성합니다.").count() === 0) {
          fail(route.path, viewport.name, "Burdened-gift strategy does not show the required detailed-event empty state.");
        }

        await page.getByRole("button", { name: "가족법인 활용" }).click();
        const familyCorpSelected = await page.locator("[aria-selected='true']").innerText().catch(() => "");
        const familyCorpHeading = await page.getByText("가족법인 활용 시나리오").count();
        if (!familyCorpSelected.includes("가족법인 활용") || familyCorpHeading === 0) {
          fail(route.path, viewport.name, "Scenario tab click did not restore the family corporation active tab and body heading.");
        }

        await page.getByRole("button", { name: "이벤트 수정" }).click();
        const editorDialog = page.getByRole("dialog", { name: "이벤트 편집" });
        if (!await editorDialog.isVisible()) {
          fail(route.path, viewport.name, "Event edit button did not open the event editor dialog.");
        } else {
          const editorText = await editorDialog.innerText();
          if (!editorText.includes("가족법인 활용") || !editorText.includes("검토 메모")) {
            fail(route.path, viewport.name, "Event editor dialog does not show the selected scenario and editable review memo.");
          }
          const savedMemo = `자동검증 저장 메모 ${viewport.name}`;
          await editorDialog.getByLabel("검토 메모").fill(savedMemo);
          await editorDialog.getByRole("button", { name: "합성 변경사항 저장" }).click();
          if (!await page.getByText("화면에만 임시 반영됨").first().isVisible()) {
            fail(route.path, viewport.name, "Event editor save did not show the temporary-on-screen confirmation.");
          }
          await page.getByRole("button", { name: "이벤트 편집 닫기" }).click();
          if (await editorDialog.isVisible().catch(() => false)) {
            fail(route.path, viewport.name, "Event editor dialog did not close from the close button.");
          }
          await page.getByRole("button", { name: "이벤트 수정" }).click();
          const persistedMemo = await page.getByLabel("검토 메모").inputValue();
          if (persistedMemo !== savedMemo) {
            fail(route.path, viewport.name, "Event editor did not preserve the saved memo while the page remained open.");
          }
          await page.getByRole("button", { name: "이벤트 편집 닫기" }).click();
        }
      }

      if (route.path === "/precheck/result" && viewport.name === "mobile") {
        const detailsCount = await page.locator("details").count();
        const closedDetailsCount = await page.locator("details:not([open])").count();
        if (detailsCount < 7 || closedDetailsCount < 7) {
          fail(route.path, viewport.name, "Mobile result cards should collapse detailed metrics by default.");
        }
      }

      if (route.path === "/report-preview") {
        const requiredReportSections = ["가족·자산 요약", "선택한 승계 목표", "7개 전략 검토틀", "납부재원 검토 방식", "가족법인 검토 가능성", "보험 검토 가능성", "일반 위험신호 예시", "추가 필요정보", "이 결과로 조경호 회계사에게 상담하기"];
        const missingReportSections = requiredReportSections.filter((label) => !bodyText.includes(label));
        if (missingReportSections.length > 0) {
          fail(route.path, viewport.name, `Report preview is missing section(s): ${missingReportSections.join(", ")}`);
        }

        if (viewport.name === "desktop") {
          await page.emulateMedia({ media: "print" });
          await page.screenshot({
            path: path.join(outputDir, "desktop-report-preview-print.png"),
            fullPage: true
          });
          const printText = await page.locator("body").innerText();
          if (printText.includes("서비스 소개") || printText.includes("결과 비교로 돌아가기") || printText.includes("PDF 저장")) {
            fail(route.path, viewport.name, "Print preview still exposes navigation or browser-instruction controls.");
          }
          const requiredPrintFields = ["현 상태 유지 후 상속", "부담부증여 검토", "혼합 전략", "현재 세금·비용", "미래 세금·비용", "총 부담", "즉시 필요현금", "부모 잔여재산", "자녀 이전재산", "납부재원 부족액", "통제권", "복잡도", "상태"];
          const missingPrintFields = requiredPrintFields.filter((label) => !printText.includes(label));
          if (missingPrintFields.length > 0) {
            fail(route.path, viewport.name, `Print preview is missing full comparison metric(s): ${missingPrintFields.join(", ")}`);
          }
          await page.emulateMedia({ media: "screen" });
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

console.log(`UI audit passed for ${routes.length} routes across ${viewports.length} viewports.`);
