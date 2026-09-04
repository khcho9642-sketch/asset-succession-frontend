import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const outputDir = process.env.UI_AUDIT_DIR ?? "artifacts/ui-audit";

const routes = [
  { name: "landing", path: "/", area: "public" },
  { name: "precheck", path: "/precheck", area: "public" },
  { name: "result", path: "/precheck/result", area: "public" },
  { name: "consultation", path: "/consultation", area: "public" },
  { name: "expert-overview", path: "/expert/overview", area: "expert" },
  { name: "expert-workspace", path: "/expert/workspace", area: "expert" }
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
          }
        }

        if (!bodyText.includes("부담부증여")) {
          fail(route.path, viewport.name, "The result page does not show or explicitly separate the burdened-gift review strategy.");
        }
      }

      if (route.area === "expert" && viewport.name === "mobile") {
        const mobileMenuCount = await page.getByRole("button", { name: /메뉴|탐색|내비게이션|navigation/i }).count();
        if (mobileMenuCount === 0) {
          fail(route.path, viewport.name, "Expert mobile navigation button/drawer trigger is missing.");
        }
      }

      if (route.area === "expert" && viewport.name === "desktop") {
        const requiredExpertNav = ["프로젝트 개요", "가족·자산", "시나리오", "검토·쟁점", "보고서", "규칙·출처"];
        const missingExpertNav = requiredExpertNav.filter((label) => !bodyText.includes(label));
        if (missingExpertNav.length > 0) {
          fail(route.path, viewport.name, `Expert navigation is missing: ${missingExpertNav.join(", ")}`);
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
