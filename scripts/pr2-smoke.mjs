import { chromium } from "playwright";

const baseURL = process.env.PR2_BASE_URL ?? "http://127.0.0.1:4173";
const routes = ["/", "/precheck", "/precheck/result", "/consultation", "/expert/overview", "/expert/workspace", "/report-preview", "/phase-2b"];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function completeHybridPrecheck(page) {
  await page.goto(`${baseURL}/precheck`, { waitUntil: "networkidle" });
  await page.evaluate(() => window.sessionStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "직접 입력" }).fill("증여 준비, 배우자 있음, 자녀 2명, 부동산 42억, 금융자산 8억, 담보대출 2억, 최근 10년 증여 있음, 일부를 미리 이전하고 납부재원이 궁금합니다. 기준안 과세표준 3억, 대안 과세표준 1.5억");
  await page.getByRole("button", { name: "직접 입력 이해하기" }).click();
  await page.getByText("제가 이렇게 이해했습니다.", { exact: true }).waitFor({ timeout: 10_000 });
  await confirmAllCandidateFacts(page);
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  if (await page.getByRole("checkbox", { name: "상속세 납부재원 준비" }).getAttribute("aria-checked") !== "true") {
    await page.getByRole("checkbox", { name: "상속세 납부재원 준비" }).click();
  }
  await page.getByRole("button", { name: "다음" }).click();
  if (await page.getByRole("checkbox", { name: "세금·비용" }).getAttribute("aria-checked") !== "true") {
    await page.getByRole("checkbox", { name: "세금·비용" }).click();
  }
  await page.getByLabel("기준안 확인 과세표준(억원)").fill("3");
  await page.getByLabel("우선 대안 확인 과세표준(억원)").fill("1.5");
  await page.getByRole("button", { name: "결과 보기" }).click();
  await page.waitForURL("**/precheck/result**");
  await page.getByText("개인화 시나리오 플랜").waitFor({ timeout: 10_000 });
}

async function confirmAllCandidateFacts(page) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const button = page.getByRole("button", { name: "이 사실만 확정" }).first();
    if (await button.count() === 0) return;
    await button.click();
  }
  throw new Error("Candidate confirmation loop exceeded expected fact count.");
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
      const minimumTextLength = route === "/report-preview" ? 100 : 200;
      assert(layout.textLength > minimumTextLength, `${viewport.name} route did not render enough content: ${route}`);
      assert(layout.scrollWidth <= layout.width + 2, `${viewport.name} horizontal overflow on ${route}: ${layout.scrollWidth} > ${layout.width}`);
    }
    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await page.goto(`${baseURL}/precheck?step=5`, { waitUntil: "networkidle" });
  assert(await page.getByText("어떤 준비를 고민하고 계신가요?").first().isVisible(), "Query step bypass was not blocked.");

  await completeHybridPrecheck(page);
  await page.getByText("개인화 시나리오 플랜").waitFor({ timeout: 10_000 });
  await page.getByText(/AS360-\d{8}-[A-Z0-9]+/).waitFor({ timeout: 10_000 });
  const resultText = await page.locator("body").innerText();
  const assessmentId = resultText.match(/AS360-\d{8}-[A-Z0-9]+/)?.[0];
  assert(assessmentId, "Assessment ID missing from result page.");
  assert(resultText.includes("개인화 시나리오 플랜"), "ScenarioPlan panel missing from result page.");
  assert(resultText.includes("부동산: 42억") && resultText.includes("금융자산: 8억"), "Assessment answers missing from result page.");
  assert(resultText.includes("50억") && resultText.includes("0.5억 산출세액") && resultText.includes("0.3억 절세 예상") && !resultText.includes("9.5~12억") && !resultText.includes("부모 잔여재산\n55억"), "Result page still exposes fixed sample strategy numbers or misses confirmed-tax-base calculation.");

  await page.goto(`${baseURL}/report-preview?assessment_id=${encodeURIComponent(assessmentId)}`, { waitUntil: "networkidle" });
  await page.getByText("Report V2 7/7").waitFor({ timeout: 10_000 });
  const reportText = await page.locator("body").innerText();
  assert(reportText.includes(assessmentId), "Assessment ID missing from report preview.");
  assert(await page.locator("[data-report-page]").count() === 7, "Report V2 should render exactly seven pages.");
  assert(reportText.includes("Report V2 7/7") && reportText.includes("우리 가족 자산승계 사전진단 보고서") && reportText.includes("50억") && reportText.includes("0.5억 산출세액") && reportText.includes("0.2억 산출세액"), "Seven-page report content missing confirmed calculation flow.");
  assert(!reportText.includes("55억") && !reportText.includes("9.5~12억") && !reportText.includes("6.3~8.6억"), "Report preview still exposes fixed sample strategy numbers.");

  await page.goto(`${baseURL}/consultation`, { waitUntil: "networkidle" });
  await page.getByText(assessmentId).first().waitFor({ timeout: 10_000 });
  assert((await page.locator("body").innerText()).includes(assessmentId), "Assessment ID missing from consultation page.");
  await page.getByRole("button", { name: "상담 신청하기" }).click();
  assert(await page.getByText("상담 대표자를 입력해 주세요.").isVisible(), "Consultation validation alert missing.");
  await page.getByLabel("상담 대표자").fill("가족 대표");
  await page.getByLabel("전화번호").fill("000-0000-0000");
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
      "hybrid direct input individual confirmation works",
      "confirmed taxable-base input reaches result, seven-page report, and consultation",
      "consultation required validation and local success state work"
    ]
  }, null, 2));
} finally {
  await browser.close();
}
