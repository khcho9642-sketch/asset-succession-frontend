import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseUrl = process.env.PR2_BASE_URL ?? "http://127.0.0.1:3000";
const chromePath = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = Number(process.env.PR2_CDP_PORT ?? 9333);
const captureDir = process.env.PR2_CAPTURE_DIR;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  }
  return response.json();
}

async function waitForChrome() {
  for (let i = 0; i < 60; i += 1) {
    try {
      return await fetchJson(`http://127.0.0.1:${port}/json/version`);
    } catch {
      await sleep(250);
    }
  }
  throw new Error("Chrome DevTools endpoint did not become ready.");
}

function createClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const events = [];

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      return;
    }
    if (message.method) events.push(message);
  });

  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  function send(method, params = {}) {
    const messageId = (id += 1);
    ws.send(JSON.stringify({ id: messageId, method, params }));
    return new Promise((resolve, reject) => pending.set(messageId, { resolve, reject }));
  }

  async function waitForEvent(method, timeoutMs = 25000) {
    const existingIndex = events.findIndex((event) => event.method === method);
    if (existingIndex >= 0) return events.splice(existingIndex, 1)[0];
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const timer = setInterval(() => {
        const index = events.findIndex((event) => event.method === method);
        if (index >= 0) {
          clearInterval(timer);
          resolve(events.splice(index, 1)[0]);
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(timer);
          reject(new Error(`Timed out waiting for ${method}`));
        }
      }, 50);
    });
  }

  return { ready, send, waitForEvent, close: () => ws.close() };
}

async function openPage(browserWsUrl, viewport) {
  const target = await fetchJson(`http://127.0.0.1:${port}/json/new`, { method: "PUT" });
  const client = createClient(target.webSocketDebuggerUrl ?? browserWsUrl);
  await client.ready;
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.width <= 430
  });
  return client;
}

async function navigate(client, path) {
  const load = client.waitForEvent("Page.loadEventFired");
  await client.send("Page.navigate", { url: `${baseUrl}${path}` });
  await load.catch(() => undefined);
  for (let i = 0; i < 40; i += 1) {
    const state = await evaluate(client, "document.readyState").catch(() => "loading");
    if (state === "complete" || state === "interactive") break;
    await sleep(250);
  }
  await sleep(500);
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "Runtime evaluation failed");
  }
  return result.result.value;
}

async function capture(client, fileName) {
  if (!captureDir) return;
  const screenshot = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false
  });
  await mkdir(captureDir, { recursive: true });
  await writeFile(join(captureDir, fileName), Buffer.from(screenshot.data, "base64"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function driveWizardToStep3(client) {
  await navigate(client, "/precheck");
  await sleep(1500);
  await evaluate(client, `(async () => {
    const byText = (selector, text) => [...document.querySelectorAll(selector)].find((el) => el.textContent.trim() === text);
    const tick = () => new Promise((resolve) => setTimeout(resolve, 400));
    byText("button", "부모 2명 + 자녀").click();
    await tick();
    byText("button", "다음").click();
    await tick();
    byText("button", "부동산").click();
    await tick();
    byText("button", "다음").click();
    await tick();
  })()`);
}

async function main() {
  const userDataDir = await mkdtemp(join(tmpdir(), "asset-pr2-chrome-"));
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank"
  ], { stdio: "ignore" });

  try {
    const { webSocketDebuggerUrl } = await waitForChrome();
    const desktop = await openPage(webSocketDebuggerUrl, { width: 1440, height: 1200 });
    const mobile = await openPage(webSocketDebuggerUrl, { width: 390, height: 1200 });
    const checkedRoutes = ["/", "/precheck", "/precheck/result", "/consultation", "/expert/overview", "/expert/workspace", "/report-preview"];

    for (const path of checkedRoutes) {
      await navigate(desktop, path);
      const desktopState = await evaluate(desktop, "({ ok: document.body.innerText.length > 200, scrollWidth: document.documentElement.scrollWidth, width: window.innerWidth })");
      assert(desktopState.ok, `Desktop route did not render enough content: ${path}`);

      await navigate(mobile, path);
      const mobileState = await evaluate(mobile, "({ ok: document.body.innerText.length > 200, scrollWidth: document.documentElement.scrollWidth, width: window.innerWidth })");
      assert(mobileState.ok, `Mobile route did not render enough content: ${path}`);
      assert(mobileState.scrollWidth <= mobileState.width, `Mobile horizontal overflow on ${path}: ${mobileState.scrollWidth} > ${mobileState.width}`);
    }

    await navigate(desktop, "/");
    await capture(desktop, "desktop-landing.png");
    await navigate(desktop, "/precheck");
    await capture(desktop, "desktop-wizard-step1.png");
    await driveWizardToStep3(desktop);
    await capture(desktop, "desktop-wizard-step3.png");
    await navigate(desktop, "/precheck/result");
    await capture(desktop, "desktop-result.png");
    await navigate(desktop, "/expert/overview");
    await capture(desktop, "desktop-expert-overview.png");
    await navigate(desktop, "/expert/workspace");
    await capture(desktop, "desktop-expert-workspace.png");

    await navigate(mobile, "/");
    await capture(mobile, "mobile-landing.png");
    await navigate(mobile, "/precheck");
    await capture(mobile, "mobile-wizard-step1.png");
    await driveWizardToStep3(mobile);
    await capture(mobile, "mobile-wizard-step3.png");
    await navigate(mobile, "/precheck/result");
    await capture(mobile, "mobile-result.png");
    await navigate(mobile, "/expert/overview");
    await capture(mobile, "mobile-expert-overview.png");
    await navigate(mobile, "/expert/workspace");
    await capture(mobile, "mobile-expert-workspace.png");

    await navigate(desktop, "/precheck");
    await sleep(1500);
    const wizardResult = await evaluate(desktop, `(async () => {
      const byText = (selector, text) => [...document.querySelectorAll(selector)].find((el) => el.textContent.trim() === text);
      const tick = () => new Promise((resolve) => setTimeout(resolve, 400));
      byText("button", "다음").click();
      await tick();
      const validationShown = document.body.innerText.includes("선택지를 골라야");
      const afterValidationText = document.body.innerText.slice(0, 700);
      const exactNextButtonCount = [...document.querySelectorAll("button")].filter((el) => el.textContent.trim() === "다음").length;
      byText("button", "부모 2명 + 자녀").click();
      await tick();
      const input = document.querySelector("input");
      input.value = "2명";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      byText("button", "다음").click();
      await tick();
      const step2 = document.body.innerText.includes("승계 대상 자산");
      byText("button", "이전").click();
      await tick();
      const backToStep1 = document.body.innerText.includes("가족 구성을 알려주세요");
      byText("button", "다음").click();
      await tick();
      const preserved = document.body.innerText.includes("승계 대상 자산");
      return { validationShown, step2, backToStep1, preserved, exactNextButtonCount, afterValidationText };
    })()`);
    assert(wizardResult.validationShown, `Precheck wizard did not show required-choice validation: ${JSON.stringify(wizardResult)}`);
    assert(wizardResult.step2 && wizardResult.backToStep1 && wizardResult.preserved, "Precheck wizard previous/next state flow failed.");

    await navigate(desktop, "/precheck/result");
    const reportCta = await evaluate(desktop, `(() => {
      const link = [...document.querySelectorAll("a")].find((el) => el.textContent.includes("무료 보고서 다운로드"));
      return link?.getAttribute("href");
    })()`);
    assert(reportCta === "/report-preview", `Report CTA href mismatch: ${reportCta}`);

    await navigate(mobile, "/expert/overview");
    await sleep(1500);
    const drawerResult = await evaluate(mobile, `(async () => {
      const tick = () => new Promise((resolve) => setTimeout(resolve, 400));
      document.querySelector('[aria-label="전문가 메뉴 열기"]')?.click();
      await tick();
      const text = document.body.innerText;
      return ["프로젝트 개요", "가족·자산", "시나리오", "검토·쟁점", "보고서", "규칙·출처"].every((item) => text.includes(item));
    })()`);
    assert(drawerResult, "Mobile expert drawer did not expose all 6 menu items.");

    desktop.close();
    mobile.close();
    console.log(JSON.stringify({
      status: "passed",
      baseUrl,
      routes: checkedRoutes,
      desktop: "1440px checked",
      mobile: "390px checked",
      screenshots: captureDir ? `written to ${captureDir}` : "not requested",
      assertions: [
        "all routes rendered",
        "mobile horizontal overflow absent",
        "precheck required-choice validation works",
        "precheck previous/next flow preserves state",
        "report CTA points to /report-preview",
        "expert mobile drawer exposes 6 menu items"
      ]
    }, null, 2));
  } finally {
    chrome.kill();
    await sleep(500);
    await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
