import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const outputDir = process.env.UI_AUDIT_DIR ?? "artifacts/ui-audit";

const routes = [
  { name: "landing", path: "/", area: "public" },
  { name: "precheck", path: "/precheck", area: "public" },
  { name: "precheck-form", path: "/precheck/form", area: "public" },
  { name: "precheck-query-bypass", path: "/precheck/form?step=3", area: "public" },
  { name: "result-empty", path: "/precheck/result", area: "public" },
  { name: "result-demo", path: "/precheck/result?demo=1", area: "public" },
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

async function stableScreenshot(page, options) {
  await page.waitForTimeout(850);
  await page.screenshot({ timeout: 30_000, ...options });
}

async function completeHybridPrecheck(page) {
  await page.goto(`${baseURL}/precheck/form`, { waitUntil: "networkidle", timeout: 30_000 });
  await page.evaluate(() => window.sessionStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "직접 입력" }).fill(requiredFiftyEokConversation());
  await page.getByRole("button", { name: "직접 입력 이해하기" }).click();
  await page.getByTestId("typing-indicator").waitFor({ state: "visible", timeout: 1_000 }).catch(() => {
    fail("/precheck", "flow", "AI reply typing dots did not appear before the interpreted response.");
  });
  await page.getByText("제가 이렇게 이해했습니다.", { exact: true }).waitFor({ timeout: 10_000 });
  await confirmAllCandidateFacts(page);

  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByText("추가로 말씀하시거나 궁금한 점이 있나요?").waitFor({ timeout: 10_000 });
  if ((await page.locator("body").innerText()).includes("분석 시작")) {
    fail("/precheck", "flow", "Final review still exposes the forbidden '분석 시작' label.");
  }
  const finalReviewText = await page.locator("body").innerText();
  if (finalReviewText.includes("궁금한 점 질문하기") || finalReviewText.includes("맞춤 보고서 만들기")) {
    fail("/precheck", "flow", "Final review still exposes removed button labels.");
  }
  await page.getByRole("button", { name: "내용 추가" }).first().click();
  await page.getByRole("textbox", { name: "직접 입력" }).fill("부모 자녀 대출은 차용증만 있으면 괜찮나요?");
  await page.getByRole("button", { name: "내용 추가" }).last().click();
  await page.getByTestId("typing-indicator").waitFor({ state: "visible", timeout: 1_000 }).catch(() => {
    fail("/precheck", "flow", "Final-question answer did not show a short typing indicator.");
  });
  await page.getByText("차용증뿐 아니라 이자와 원금의 실제 지급").waitFor({ timeout: 10_000 });
  await page.getByRole("button", { name: "내용 추가" }).first().click();
  await page.getByRole("textbox", { name: "직접 입력" }).fill("첫째는 상환능력 있음, 둘째는 상환능력 부족");
  await page.getByRole("button", { name: "내용 추가" }).last().click();
  await page.getByText("제가 이렇게 이해했습니다.", { exact: true }).waitFor({ timeout: 10_000 });
  await confirmAllCandidateFacts(page);
  await page.getByRole("button", { name: "없어요, 분석해 주세요" }).click();
  await page.getByText("알겠습니다. 확인된 정보를 기준으로 적용 가능한 자산승계 방법을 분석하겠습니다.").waitFor({ timeout: 10_000 });
  await page.locator(".motion-generation-panel").waitFor({ state: "visible", timeout: 10_000 });
  await page.locator(".motion-generation-step.is-complete").nth(4).waitFor({ state: "visible", timeout: 10_000 });
  await page.getByText("부동산과 금융자산 이전 방법 비교").waitFor({ timeout: 10_000 });
  await page.locator(".motion-chat-ai").filter({ hasText: "분석이 완료되었습니다." }).last().waitFor({ timeout: 10_000 });
  await page.locator(".motion-chat-ai").filter({ hasText: "현재 상황에서는 다음 3개 방법을 우선 비교할 가치가 있습니다." }).last().waitFor({ timeout: 10_000 });
  await page.waitForURL("**/precheck/result**", { timeout: 10_000 });
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
    if (!emptyConsultationText.includes("연락처만 남겨주세요.") || emptyConsultationText.includes("사전진단 결과가 연결되어 있습니다.")) {
      fail("/consultation", viewport.name, "Contact-only page must work without an assessment and must not claim a linked result.");
    }
    if (await emptyConsultationPage.getByRole("button", { name: "연락처 남기기", exact: true }).count() !== 1 || await emptyConsultationPage.getByRole("textbox").count() !== 1) {
      fail("/consultation", viewport.name, "Contact-only page must expose exactly one phone field and submit button.");
    }
    await stableScreenshot(emptyConsultationPage, {
      path: path.join(outputDir, `${viewport.name}-consultation-contact-only.png`),
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

      if (route.path === "/") {
        await page.getByTestId("hero-carousel").evaluate((element) => element.focus({ preventScroll: true }));
        await page.getByTestId("hero-carousel").press("Home");
        await page.evaluate(() => window.scrollTo(0, 0));
      }
      await stableScreenshot(page, {
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

      if (route.path === "/") {
        const requiredHeroCopy = [
          "AI × 세무전문가 자산승계 진단",
          "막막한 자산승계,",
          "우리 가족의 3가지 전략부터.",
          "양도·상속·증여·가업승계까지,",
          "AI가 36개 전략 후보를 비교합니다.",
          "무료 AI 진단 시작하기",
          "샘플 보고서 보기",
          "회원가입 없이 · 약 5분 · 결과 즉시 확인",
          "우리 가족 자산승계 진단서",
          "장남 (사업 승계)",
          "장녀 (자산 분산)",
          "차남 (생활 안정)",
          "분할 증여",
          "전문가의 경험에 AI의 속도를 더했습니다",
          "고객 이익 최우선",
          "AI 기반 정밀 분석",
          "신속한 실행과 합리적인 비용"
        ];
        const normalizedHeroText = bodyText.replace(/\s+/g, " ");
        const missingHeroCopy = requiredHeroCopy.filter((text) => !normalizedHeroText.includes(text));
        if (missingHeroCopy.length > 0) {
          fail(route.path, viewport.name, `Landing hero/differentiation copy missing: ${missingHeroCopy.join(", ")}`);
        }
        const carouselState = await page.getByTestId("hero-carousel").evaluate((element) => {
          const buttons = [...element.querySelectorAll('[aria-label="보고서 페이지 선택"] button')].map((button) => ({
            text: button.textContent?.trim(),
            pressed: button.getAttribute("aria-pressed")
          }));
          const card = element.querySelector('[data-testid="hero-report"]');
          return {
            hasCarousel: Boolean(element),
            hasCard: Boolean(card),
            buttons
          };
        }).catch(() => ({ hasCarousel: false, hasCard: false, buttons: [] }));
        if (!carouselState.hasCarousel || !carouselState.hasCard || carouselState.buttons.length !== 3 || carouselState.buttons[0]?.text !== "●" || carouselState.buttons[1]?.text !== "○") {
          fail(route.path, viewport.name, `Landing paper carousel controls are incorrect: ${JSON.stringify(carouselState)}`);
        }
      }

      if (route.area === "public") {
        const expertLinks = await page.locator('a[href^="/expert"]').count();
        if (expertLinks > 0) {
          fail(route.path, viewport.name, `Public page exposes ${expertLinks} expert-route link(s).`);
        }
      }

      if (route.path === "/precheck") {
        if (!await page.getByRole("heading", { name: "먼저, 이야기를 들려주세요." }).isVisible() || !await page.locator("#diagnosis-message").isVisible()) {
          fail(route.path, viewport.name, "Chat-first diagnosis heading or composer is missing.");
        }
        if (!await page.getByRole("button", { name: "메시지 보내기", exact: true }).isDisabled()) {
          fail(route.path, viewport.name, "Empty chat send is enabled.");
        }
      }

      if (route.path === "/precheck/form" || route.path.startsWith("/precheck/form?")) {
        if (!bodyText.includes("어떤 준비를 고민하고 계신가요?")) {
          fail(route.path, viewport.name, "Precheck should start from the #9 planning-purpose question.");
        }
        if (route.name === "precheck-query-bypass" && bodyText.includes("채무나 과거 증여처럼 결과에 영향을 주는 항목이 있나요?")) {
          fail(route.path, viewport.name, "Query parameter step bypass opened a future step directly.");
        }
        const labels = ["준비 목적"];
        const missingLabels = labels.filter((label) => !bodyText.includes(label));
        if (viewport.name === "desktop" && missingLabels.length > 0) {
          fail(route.path, viewport.name, `Precheck sidebar is missing labels: ${missingLabels.join(", ")}`);
        }
        const questionBox = await page.getByText("어떤 준비를 고민하고 계신가요?").first().boundingBox();
        const firstChoiceBox = await page.getByRole("radio", { name: "상속" }).first().boundingBox();
        const firstChoiceMotion = await page.getByRole("radio", { name: "상속" }).first().evaluate((element) => {
          const styles = window.getComputedStyle(element);
          return {
            hasClass: element.classList.contains("motion-choice-enter"),
            animationDuration: styles.animationDuration
          };
        });
        if (!firstChoiceMotion.hasClass || firstChoiceMotion.animationDuration === "0s") {
          fail(route.path, viewport.name, "Quick choice buttons are missing their normal sequential entrance motion.");
        }
        if (viewport.name === "mobile" && (!questionBox || questionBox.y > viewport.height * 0.54 || !firstChoiceBox || firstChoiceBox.y > viewport.height * 0.78)) {
          fail(route.path, viewport.name, "Mobile first viewport does not surface the planning-purpose question and first choice quickly enough.");
        }
        await page.getByRole("button", { name: "다음" }).click();
        if (!await page.getByText(/현재 질문에 답하거나|필수 항목/).isVisible()) {
          fail(route.path, viewport.name, "Required-choice validation did not block an empty planning-purpose step.");
        }
        await page.getByRole("textbox", { name: "직접 입력" }).fill("상속 준비, 배우자 있음, 자녀 2명, 아버지 재산이에요. 아파트 두 채와 예금 8억");
        await page.getByRole("button", { name: "직접 입력 이해하기" }).click();
        await page.getByTestId("typing-indicator").waitFor({ state: "visible", timeout: 1_000 }).catch(() => {
          fail(route.path, viewport.name, "Direct input did not show the AI typing dots before candidate extraction.");
        });
        await page.getByText("제가 이렇게 이해했습니다.", { exact: true }).waitFor({ timeout: 10_000 }).catch(() => undefined);
        if (!await page.getByText("제가 이렇게 이해했습니다.", { exact: true }).isVisible()) {
          fail(route.path, viewport.name, "Direct input did not produce a confirmation candidate.");
        }
        const candidateText = await page.locator("body").innerText();
        if (candidateText.includes("부모 2명 기준") || candidateText.includes("미성년 자녀 수\n0명") || candidateText.includes("부동산 8억")) {
          fail(route.path, viewport.name, "Conversational parser still makes forbidden family/asset inferences.");
        }
        await page.reload({ waitUntil: "networkidle" });
        if (!await page.getByText("같은 탭의 진행 중 대화를 복원했습니다.").isVisible() || !await page.getByText("제가 이렇게 이해했습니다.", { exact: true }).isVisible()) {
          fail(route.path, viewport.name, "Draft reload did not restore conversation and pending candidate state.");
        }
        await page.getByRole("button", { name: "이 사실만 확정" }).first().click();
        if (await page.getByRole("button", { name: "제외" }).count() === 0) {
          fail(route.path, viewport.name, "Candidate facts cannot be individually excluded after partial confirmation.");
        }
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

      if (route.path === "/precheck/result?demo=1") {
        const requiredDemoText = [
          "AS360-20260906-DEMO1",
          "개인화 시나리오 플랜",
          "50억",
          "가족 분산·단계적 사전증여",
          "첫째 대출·둘째 증여 배분",
          "배우자 상속공제 고려 재산배분"
        ];
        const missingDemoText = requiredDemoText.filter((text) => !bodyText.includes(text));
        if (missingDemoText.length > 0) {
          fail(route.path, viewport.name, `Demo sample result did not render expected synthetic data: ${missingDemoText.join(", ")}`);
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
          "후보 라이브러리",
          "검토 가능한 전략 후보",
          "사용자 노출 결과",
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
        const leakedInternalCandidates = [
          "inheritance-01-current-structure",
          "gift-01-stepwise-transfer",
          "business-01-succession-deduction",
          "capital-01-sell-then-gift"
        ].filter((label) => bodyText.includes(label));
        if (leakedInternalCandidates.length > 0) {
          fail(route.path, viewport.name, `Phase 2B page leaked internal candidate IDs: ${leakedInternalCandidates.join(", ")}`);
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
    const resultMotion = await flowPage.evaluate(() => ({
      stages: document.querySelectorAll(".motion-result-stage").length,
      cards: document.querySelectorAll(".motion-recommendation-card").length,
      bars: document.querySelectorAll(".motion-bar-fill").length,
      donut: document.querySelectorAll(".motion-donut").length,
      timeline: document.querySelectorAll(".motion-timeline-item").length
    }));
    if (resultMotion.stages < 3 || resultMotion.cards < 3 || resultMotion.bars < 4 || resultMotion.donut < 1 || resultMotion.timeline < 3) {
      fail("/precheck/result", viewport.name, `Result motion hooks are incomplete: ${JSON.stringify(resultMotion)}.`);
    }
    const assessmentMatch = resultText.match(/AS360-\d{8}-[A-Z0-9]+/);
    const requiredResultText = [
      "개인화 시나리오 플랜",
      "36개 후보 라이브러리",
      "검토 가능한 전략 후보",
      "입력 총자산",
      "50억",
      "가족 분산·단계적 사전증여",
      "첫째 대출·둘째 증여 배분",
      "배우자 상속공제 고려 재산배분",
      "부모의 대여금 채권은 상속재산에서 자동 제외되지 않음",
      "자산 구성",
      "기준안과 추천안 비교",
      "납세재원과 부족액",
      "증여·대출·상속 실행 타임라인"
    ];
    const missingResultText = requiredResultText.filter((text) => !resultText.includes(text));
    if (!assessmentMatch || missingResultText.length > 0) {
      fail("/precheck/result", viewport.name, `Hybrid precheck did not hand confirmed facts to the result page. Missing: ${missingResultText.join(", ")}`);
    } else if (resultText.includes("0.5억 산출세액") || resultText.includes("0.3억 절세 예상")) {
      fail("/precheck/result", viewport.name, "Result page fabricated calculated tax values without a confirmed taxable base.");
    } else {
      const leakedResultNumbers = ["총자산 55억", "순자산 47억", "가용 현금\n5억", "부모 잔여재산\n55억", "9.5~12억", "6.3~8.6억", "inheritance-01-current-structure", "gift-01-stepwise-transfer"].filter((text) => resultText.includes(text));
      if (leakedResultNumbers.length > 0) {
        fail("/precheck/result", viewport.name, `Result page leaked stale sample numbers: ${leakedResultNumbers.join(", ")}`);
      }
      await stableScreenshot(flowPage, {
        path: path.join(outputDir, `${viewport.name}-result-with-hybrid-assessment.png`),
        fullPage: true
      });

      await flowPage.goto(`${baseURL}/report-preview?assessment_id=${encodeURIComponent(assessmentMatch[0])}`, { waitUntil: "networkidle", timeout: 30_000 });
      await flowPage.locator('[data-report-template="paper-seven-v1"] [data-report-page="7"]').waitFor({ timeout: 10_000 });
      const reportText = await flowPage.locator("body").innerText();
      const pageCount = await flowPage.locator("[data-report-page]").count();
      const requiredReportText = [
        assessmentMatch[0],
        "입력 요약 · 세액 계산 전",
        "가족 분산·단계적 사전증여",
        "첫째 대출·둘째 증여 배분",
        "배우자 상속공제 고려 재산배분"
      ];
      const missingReportText = requiredReportText.filter((text) => !reportText.includes(text));
      if (pageCount !== 7 || missingReportText.length > 0) {
        fail("/report-preview", viewport.name, `Paper report did not render exactly seven personal pages or required content. pages=${pageCount}, missing=${missingReportText.join(", ")}`);
      }
      if (await flowPage.locator('[data-paper-number]').count() !== 7 || reportText.includes("Report V2")) {
        fail("/report-preview", viewport.name, "Report must use the approved paper template on every page.");
      }
      if (reportText.includes("0.5억 산출세액") || reportText.includes("0.2억 산출세액")) {
        fail("/report-preview", viewport.name, "Report preview fabricated calculated tax values without a confirmed taxable base.");
      }
      const leakedReportNumbers = ["55억", "9.5~12억", "6.3~8.6억", "채무·보증금\n8억", "입력 순자산\n42억", "inheritance-01-current-structure", "gift-01-stepwise-transfer"].filter((text) => reportText.includes(text));
      if (leakedReportNumbers.length > 0) {
        fail("/report-preview", viewport.name, `Report preview leaked stale sample numbers: ${leakedReportNumbers.join(", ")}`);
      }
      await stableScreenshot(flowPage, {
        path: path.join(outputDir, `${viewport.name}-report-v2-seven-pages.png`),
        fullPage: true
      });

      if (viewport.name === "desktop") {
        await flowPage.emulateMedia({ media: "print" });
        await stableScreenshot(flowPage, {
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
      await flowPage.locator(`[data-assessment-id="${assessmentMatch[0]}"]`).waitFor({ timeout: 10_000 });
      if (!(await flowPage.getByRole("link", { name: "결과 보기", exact: true }).getAttribute("href")).includes(assessmentMatch[0])) {
        fail("/consultation", viewport.name, "Assessment snapshot was not handed off to consultation.");
      }
      await flowPage.getByRole("button", { name: "연락처 남기기", exact: true }).click();
      if (!await flowPage.getByRole("alert").getByText("전화번호를 입력해 주세요.").isVisible()) {
        fail("/consultation", viewport.name, "Consultation required-field validation did not run.");
      }
      await flowPage.getByLabel("전화번호", { exact: true }).fill("000-0000-0000");
      await flowPage.getByRole("checkbox", { name: /전화번호 이용/ }).check();
      await flowPage.getByRole("button", { name: "연락처 남기기", exact: true }).click();
      const successText = await flowPage.locator("body").innerText();
      if (!successText.includes("연락처 입력을 확인했습니다.") || !successText.includes("실제 접수·전송은 되지 않았습니다.") || successText.includes("RCV-") || await flowPage.locator(`[data-assessment-id="${assessmentMatch[0]}"]`).count() !== 1) {
        fail("/consultation", viewport.name, "Contact preview must preserve optional assessment context without fabricating a receipt.");
      }
      await stableScreenshot(flowPage, {
        path: path.join(outputDir, `${viewport.name}-consultation-success.png`),
        fullPage: true
      });
    }
    await flowPage.close();

    await context.close();
  }

  const reducedContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce"
  });
  const reducedPage = await reducedContext.newPage();
  await reducedPage.goto(`${baseURL}/precheck/form`, { waitUntil: "networkidle", timeout: 30_000 });
  const reducedMotion = await reducedPage.locator(".motion-choice-enter").first().evaluate((element) => {
    const styles = window.getComputedStyle(element);
    return {
      animationDuration: styles.animationDuration,
      transitionDuration: styles.transitionDuration,
      transform: styles.transform,
      opacity: styles.opacity
    };
  });
  if (reducedMotion.animationDuration !== "0s" || reducedMotion.transitionDuration !== "0s" || reducedMotion.transform !== "none" || reducedMotion.opacity === "0") {
    fail("/precheck", "reduced-motion", `Reduced-motion mode did not disable entrance animation cleanly: ${JSON.stringify(reducedMotion)}.`);
  }
  await reducedPage.goto(`${baseURL}/`, { waitUntil: "networkidle", timeout: 30_000 });
  const reducedHeroMedia = await reducedPage.evaluate(() => {
    const carousel = document.querySelector('[data-testid="hero-carousel"]');
    const card = document.querySelector('[data-testid="hero-report"]');
    return {
      carouselPerspective: carousel ? window.getComputedStyle(carousel).perspective : "missing",
      cardTransform: card ? window.getComputedStyle(card).transform : "missing"
    };
  });
  if (reducedHeroMedia.carouselPerspective !== "none" || reducedHeroMedia.cardTransform !== "none") {
    fail("/", "reduced-motion", `Hero carousel did not minimize 3D motion in reduced-motion mode: ${JSON.stringify(reducedHeroMedia)}.`);
  }
  await reducedPage.close();
  await reducedContext.close();
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
