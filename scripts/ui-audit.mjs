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

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1
    });

    for (const route of routes) {
      const page = await context.newPage();
      const url = `${baseURL}${route.path}`;
      const response = await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });

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
        const missingSteps = requiredSteps.filter((step) => !bodyText.includes(step));
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

        await page.getByRole("button", { name: "다음" }).click();
        if (!await page.getByText("현재 단계의 선택지를 하나 골라야 다음 단계로 이동할 수 있습니다.").isVisible()) {
          fail(route.path, viewport.name, "Required-choice validation message did not appear before moving to the next wizard step.");
        }

        await page.getByRole("button", { name: "부모 2명 + 자녀" }).click();
        await page.getByRole("textbox").fill("2명");
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
      }

      if (route.path === "/precheck/result" && viewport.name === "mobile") {
        const detailsCount = await page.locator("details").count();
        const closedDetailsCount = await page.locator("details:not([open])").count();
        if (detailsCount < 7 || closedDetailsCount < 7) {
          fail(route.path, viewport.name, "Mobile result cards should collapse detailed metrics by default.");
        }
      }

      if (route.path === "/report-preview") {
        const requiredReportSections = ["가족·자산 요약", "선택한 승계 목표", "7개 전략 비교", "납부재원 부족 분석", "가족법인 검토 가능성", "보험 검토 가능성", "주요 위험신호", "추가 필요정보", "이 결과로 조경호 회계사에게 상담하기"];
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
