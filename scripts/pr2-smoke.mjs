import { chromium } from "playwright";

const baseURL = process.env.PR2_BASE_URL ?? "http://127.0.0.1:4173";
const routes = ["/", "/precheck", "/precheck/form", "/precheck/result", "/precheck/result?demo=1", "/consultation", "/expert/overview", "/expert/workspace", "/report-preview", "/phase-2b"];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function completeHybridPrecheck(page) {
  await page.goto(`${baseURL}/precheck/form`, { waitUntil: "networkidle" });
  await page.evaluate(() => window.sessionStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "직접 입력" }).fill(requiredFiftyEokConversation());
  await page.getByRole("button", { name: "직접 입력 이해하기" }).click();
  await page.getByText("제가 이렇게 이해했습니다.", { exact: true }).waitFor({ timeout: 10_000 });
  await confirmAllCandidateFacts(page);
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByText("추가로 말씀하시거나 궁금한 점이 있나요?").waitFor({ timeout: 10_000 });
  assert(!(await page.locator("body").innerText()).includes("분석 시작"), "Final precheck stage exposes forbidden 분석 시작 label.");
  assert(!(await page.locator("body").innerText()).includes("궁금한 점 질문하기"), "Final precheck stage exposes removed question button.");
  assert(!(await page.locator("body").innerText()).includes("맞춤 보고서 만들기"), "Final precheck stage exposes removed custom-report button label.");
  await page.getByRole("button", { name: "내용 추가" }).first().click();
  await page.getByRole("textbox", { name: "직접 입력" }).fill("부모 자녀 대출은 차용증만 있으면 괜찮나요?");
  await page.getByRole("button", { name: "내용 추가" }).last().click();
  await page.getByText("부모의 대여금 채권은 상속재산에서 자동으로 제외되지 않습니다.").waitFor({ timeout: 10_000 });
  await page.getByRole("button", { name: "내용 추가" }).first().click();
  await page.getByRole("textbox", { name: "직접 입력" }).fill("첫째는 상환능력 있음, 둘째는 상환능력 부족");
  await page.getByRole("button", { name: "내용 추가" }).last().click();
  await page.getByText("제가 이렇게 이해했습니다.", { exact: true }).waitFor({ timeout: 10_000 });
  await confirmAllCandidateFacts(page);
  await page.getByRole("button", { name: "없어요, 분석해 주세요" }).click();
  await page.locator(".motion-chat-user").filter({ hasText: "없어요, 분석해 주세요" }).last().waitFor({ timeout: 10_000 });
  await page.getByText("알겠습니다. 확인된 정보를 기준으로 적용 가능한 자산승계 방법을 분석하겠습니다.").waitFor({ timeout: 10_000 });
  await page.getByText("부동산과 금융자산 이전 방법 비교").waitFor({ timeout: 10_000 });
  await page.locator(".motion-chat-ai").filter({ hasText: "분석이 완료되었습니다." }).last().waitFor({ timeout: 10_000 });
  await page.locator(".motion-chat-ai").filter({ hasText: "현재 상황에서는 다음 3개 방법을 우선 비교할 가치가 있습니다." }).last().waitFor({ timeout: 10_000 });
  await page.waitForURL("**/precheck/result**");
  await page.getByText("개인화 시나리오 플랜").waitFor({ timeout: 10_000 });
}

function requiredFiftyEokConversation() {
  return [
    "본인 자산",
    "총자산 50억원",
    "금융자산 30억원",
    "아파트 20억원",
    "채무 없음",
    "배우자 1명",
    "성인 자녀 2명",
    "3년 전 자녀별 1억원 증여 및 신고",
    "목표: 세금 부담 절감과 노후생활비 유지",
    "자녀에게 5억원 대출 검토",
    "첫째는 상환능력 있음",
    "둘째는 상환능력 부족",
    "보험 없음",
    "상속세 납부 가능 현금 3억원"
  ].join(", ");
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
      if (route === "/precheck") {
        assert(await page.getByRole("heading", { name: "먼저, 이야기를 들려주세요." }).isVisible(), `${viewport.name} chat-first diagnosis heading missing.`);
        assert(await page.locator("#diagnosis-message").isVisible(), `${viewport.name} chat composer missing.`);
        assert(await page.getByRole("button", { name: "메시지 보내기", exact: true }).isDisabled(), `${viewport.name} empty chat send is enabled.`);
      }
      if (route === "/") {
        const bodyText = await page.locator("body").innerText();
        assert(bodyText.includes("막막한 자산승계,") && bodyText.includes("우리 가족의 3가지 전략부터."), `${viewport.name} landing hero headline missing.`);
        assert(bodyText.includes("무료 AI 진단 시작하기") && bodyText.includes("샘플 보고서 보기"), `${viewport.name} landing hero CTA missing.`);
        assert(bodyText.includes("우리 가족 자산승계 진단서") && bodyText.includes("분할 증여"), `${viewport.name} landing paper carousel first report missing.`);
        assert(await page.getByRole("button", { name: "2번째 보고서 보기" }).count() === 1, `${viewport.name} landing carousel dot controls missing.`);
      }
    }
    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await page.goto(`${baseURL}/precheck/form?step=5`, { waitUntil: "networkidle" });
  assert(await page.getByText("어떤 준비를 고민하고 계신가요?").first().isVisible(), "Query step bypass was not blocked.");

  await completeHybridPrecheck(page);
  await page.getByText("개인화 시나리오 플랜").waitFor({ timeout: 10_000 });
  await page.getByText(/AS360-\d{8}-[A-Z0-9]+/).waitFor({ timeout: 10_000 });
  const resultText = await page.locator("body").innerText();
  const assessmentId = resultText.match(/AS360-\d{8}-[A-Z0-9]+/)?.[0];
  assert(assessmentId, "Assessment ID missing from result page.");
  assert(resultText.includes("개인화 시나리오 플랜"), "ScenarioPlan panel missing from result page.");
  assert(resultText.includes("36개 후보 라이브러리"), "Result page is missing the candidate-library disclosure.");
  assert(resultText.includes("검토 가능한 전략 후보"), "Result page is missing the input-linked scenario status.");
  assert(resultText.includes("부동산: 20억") && resultText.includes("금융자산: 30억"), "Assessment answers missing from result page.");
  assert(resultText.includes("50억") && resultText.includes("가족 분산·단계적 사전증여") && resultText.includes("첫째 대출·둘째 증여 배분") && resultText.includes("배우자 상속공제 고려 재산배분"), "Result page is missing the required selected recommendations.");
  assert(resultText.includes("자산 구성") && resultText.includes("기준안과 추천안 비교") && resultText.includes("납세재원과 부족액") && resultText.includes("증여·대출·상속 실행 타임라인"), "Result page is missing required visual sections.");
  assert(!resultText.includes("0.5억 산출세액") && !resultText.includes("0.3억 절세 예상") && !resultText.includes("9.5~12억") && !resultText.includes("부모 잔여재산\n55억") && !resultText.includes("inheritance-01-current-structure"), "Result page still exposes fabricated calculations, fixed sample strategy numbers, or internal candidate IDs.");

  await page.goto(`${baseURL}/report-preview?assessment_id=${encodeURIComponent(assessmentId)}`, { waitUntil: "networkidle" });
  await page.locator('[data-report-template="paper-seven-v1"] [data-report-page="7"]').waitFor({ timeout: 10_000 });
  const reportText = await page.locator("body").innerText();
  assert(reportText.includes(assessmentId), "Assessment ID missing from report preview.");
  assert(await page.locator("[data-report-page]").count() === 7, "Paper report should render exactly seven pages.");
  assert(reportText.includes("입력 요약 · 세액 계산 전") && reportText.includes("50억") && reportText.includes("첫째 대출·둘째 증여 배분"), "Seven-page report content missing selected recommendation flow.");
  assert(await page.locator('[data-paper-number]').count() === 7, "Report lost sample-style numbered sections.");
  assert(!reportText.includes("Report V2") && !reportText.includes("36개 시나리오 내부 분석 완료"), "Old report template or analysis overclaim returned.");
  assert(!reportText.includes("0.5억 산출세액") && !reportText.includes("0.2억 산출세액") && !reportText.includes("55억") && !reportText.includes("9.5~12억") && !reportText.includes("6.3~8.6억") && !reportText.includes("inheritance-01-current-structure"), "Report preview still exposes fabricated calculations, fixed sample strategy numbers, or internal candidate IDs.");

  await page.goto(`${baseURL}/consultation`, { waitUntil: "networkidle" });
  await page.locator(`[data-assessment-id="${assessmentId}"]`).waitFor({ timeout: 10_000 });
  assert((await page.getByRole("link", { name: "결과 보기", exact: true }).getAttribute("href")).includes(assessmentId), "Assessment result link missing from consultation page.");
  await page.getByRole("button", { name: "연락처 남기기", exact: true }).click();
  assert(await page.getByText("전화번호를 입력해 주세요.").isVisible(), "Contact validation alert missing.");
  await page.getByLabel("전화번호", { exact: true }).fill("000-0000-0000");
  await page.getByRole("checkbox", { name: /전화번호 이용/ }).check();
  await page.getByRole("button", { name: "연락처 남기기", exact: true }).click();
  const successText = await page.locator("body").innerText();
  assert(successText.includes("연락처 입력을 확인했습니다.") && successText.includes("실제 접수·전송은 되지 않았습니다.") && !successText.includes("RCV-"), "Contact preview must not claim actual receipt.");
  assert(await page.locator(`[data-assessment-id="${assessmentId}"]`).count() === 1, "Optional assessment handoff was lost.");
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
      "final free-question stage and '없어요, 분석해 주세요' auto-transition work",
      "required 50억원 conversation reaches result, seven-page report, and consultation",
      "36 internal scenario candidates stay summarized rather than exposed as a list",
      "phone-only contact validation, optional assessment handoff and honest non-transmission state work"
    ]
  }, null, 2));
} finally {
  await browser.close();
}
