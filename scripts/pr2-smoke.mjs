import { chromium } from "playwright";

const baseURL = process.env.PR2_BASE_URL ?? "http://127.0.0.1:4173";
const routes = ["/", "/precheck", "/precheck/result", "/consultation", "/expert/overview", "/expert/workspace", "/report-preview"];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function completeWizard(page) {
  await page.goto(`${baseURL}/precheck`, { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: "부모 2명 기준" }).click();
  await page.getByLabel("배우자 유무", { exact: true }).selectOption("있음");
  await page.getByLabel("성년 자녀 수", { exact: true }).selectOption("2명");
  await page.getByLabel("미성년 자녀 수", { exact: true }).selectOption("0명");
  await page.getByRole("button", { name: "다음" }).click();

  await page.getByRole("checkbox", { name: "부동산" }).click();
  await page.getByRole("checkbox", { name: "금융자산" }).click();
  await page.getByPlaceholder("부동산 예: 20억").fill("42억");
  await page.getByPlaceholder("금융자산 예: 20억").fill("8억");
  await page.getByRole("button", { name: "다음" }).click();

  await page.getByRole("checkbox", { name: "담보대출 있음" }).click();
  await page.getByRole("checkbox", { name: "최근 10년 증여 있음" }).click();
  await page.getByRole("button", { name: "다음" }).click();

  await page.getByRole("radio", { name: "상속세 납부재원 준비" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("radio", { name: "세금·비용" }).click();
  await page.getByRole("button", { name: "결과 보기" }).click();
  await page.waitForURL("**/precheck/result**");
}

const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1200 },
    { name: "mobile", width: 390, height: 1200 }
  ]) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    for (const route of routes) {
      const response = await page.goto(`${baseURL}${route}`, { waitUntil: "networkidle" });
      assert(response?.ok(), `${viewport.name} route failed: ${route}`);
      const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, width: window.innerWidth, textLength: document.body.innerText.length }));
      assert(layout.textLength > 200, `${viewport.name} route did not render enough content: ${route}`);
      assert(layout.scrollWidth <= layout.width + 2, `${viewport.name} horizontal overflow on ${route}: ${layout.scrollWidth} > ${layout.width}`);
    }
    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await page.goto(`${baseURL}/precheck?step=5`, { waitUntil: "networkidle" });
  assert(await page.getByText("승계 의사결정에 참여할 가족 구성을 알려주세요.").isVisible(), "Query step bypass was not blocked.");

  await completeWizard(page);
  await page.getByText(/AS360-\d{8}-[A-Z0-9]+/).waitFor({ timeout: 10_000 });
  const resultText = await page.locator("body").innerText();
  const assessmentId = resultText.match(/AS360-\d{8}-[A-Z0-9]+/)?.[0];
  assert(assessmentId, "Assessment ID missing from result page.");
  assert(resultText.includes("부동산: 42억") && resultText.includes("금융자산: 8억"), "Assessment answers missing from result page.");

  await page.goto(`${baseURL}/report-preview`, { waitUntil: "networkidle" });
  assert((await page.locator("body").innerText()).includes(assessmentId), "Assessment ID missing from report preview.");

  await page.goto(`${baseURL}/consultation`, { waitUntil: "networkidle" });
  assert((await page.locator("body").innerText()).includes(assessmentId), "Assessment ID missing from consultation page.");
  await page.getByRole("button", { name: "상담 신청하기" }).click();
  assert(await page.getByText("상담 대표자를 입력해 주세요.").isVisible(), "Consultation validation alert missing.");
  await page.getByLabel("상담 대표자").fill("가족 대표");
  await page.getByLabel("전화번호").fill("010-0000-0000");
  await page.getByLabel("상담 희망내용").fill("납부재원과 증여 전략을 검토하고 싶습니다.");
  await page.getByLabel(/개인정보 수집·이용/).check();
  await page.getByRole("button", { name: "상담 신청하기" }).click();
  const successText = await page.locator("body").innerText();
  assert(successText.includes("상담 신청이 접수되었습니다.") && successText.includes("RCV-") && successText.includes(assessmentId), "Consultation success state missing IDs.");
  await page.close();

  console.log(JSON.stringify({
    status: "passed",
    baseUrl: baseURL,
    routes,
    desktop: "1440px checked",
    mobile: "390px checked",
    assertions: [
      "all routes rendered",
      "mobile horizontal overflow absent",
      "query step bypass blocked",
      "assessment snapshot handed to result, report, and consultation",
      "consultation required validation and local success state work"
    ]
  }, null, 2));
} finally {
  await browser.close();
}
