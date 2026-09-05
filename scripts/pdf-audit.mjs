import { chromium } from "playwright";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const outputDir = process.env.PDF_AUDIT_DIR ?? "docs/review-assets/pr-2";
const pdfPath = path.join(outputDir, "a4-report-v2-seven-pages.pdf");
const assessmentStorageKey = "as360.precheck.assessment.v1";
const seededAssessment = {
  assessment_id: "AS360-20260906-PDFAUD",
  created_at: "2026-09-06T00:00:00.000Z",
  review_focus: ["세금·비용"],
  answers: {
    purpose: {
      label: "준비 목적",
      choices: ["상속"],
      detail: "상속과 납부재원 준비"
    },
    family: {
      label: "가족",
      choices: ["부모 2명 기준"],
      detail: "",
      facts: { "배우자 유무": "있음", "성년 자녀 수": "2명", "미성년 자녀 수": "0명" }
    },
    assets: {
      label: "자산",
      choices: ["부동산", "금융자산"],
      detail: "",
      assetAmounts: { "부동산": "42", "금융자산": "8" }
    },
    debt: {
      label: "채무·과거 증여",
      choices: ["담보대출 있음", "최근 10년 증여 있음"],
      detail: "",
      debtAmounts: { "담보대출 있음": "2" }
    },
    goal: {
      label: "승계 목표",
      choices: ["상속세 납부재원 준비"],
      detail: ""
    },
    review: {
      label: "결과 준비",
      choices: ["세금·비용"],
      detail: ""
    }
  },
  conversation: {
    messages: [
      { role: "user", text: "상속 준비, 배우자 있음, 자녀 2명, 부동산 42억, 금융자산 8억", created_at: "2026-09-06T00:00:00.000Z" },
      { role: "assistant", text: "제가 이렇게 이해했습니다.", created_at: "2026-09-06T00:00:01.000Z" }
    ],
    confirmed_facts: [
      { id: "fixture-purpose", label: "준비 목적", value: "상속", raw_text: "상속 준비", confidence: "high" }
    ],
    raw_inputs: ["상속 준비, 배우자 있음, 자녀 2명, 부동산 42억, 금융자산 8억"]
  }
};

const requiredText = [
  seededAssessment.assessment_id,
  "Report V2 1/7",
  "Report V2 2/7",
  "Report V2 3/7",
  "Report V2 4/7",
  "Report V2 5/7",
  "Report V2 6/7",
  "Report V2 7/7",
  "입력 총자산",
  "50억",
  "담보대출",
  "2억",
  "상속세 및 증여세법 제26조",
  "상속세 및 증여세법 제56조",
  "과세표준 미확인 세액",
  "숫자가 없는 칸은 누락이 아니라 의도적인 계산 차단입니다."
];

const forbiddenPrintText = [
  "사전진단 입력값 없음",
  "먼저 무료 사전진단을 완료해 주세요",
  "사전진단 시작하기",
  "55억",
  "9.5~12억",
  "6.3~8.6억",
  "채무·보증금\n8억",
  "입력 순자산\n42억"
];

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1 });
  await page.addInitScript(({ key, snapshot }) => {
    window.sessionStorage.setItem(key, JSON.stringify(snapshot));
  }, { key: assessmentStorageKey, snapshot: seededAssessment });

  const response = await page.goto(`${baseURL}/report-preview?assessment_id=${encodeURIComponent(seededAssessment.assessment_id)}`, { waitUntil: "networkidle", timeout: 30_000 });
  if (!response || !response.ok()) {
    throw new Error(`Report preview did not load: ${response?.status() ?? "no response"}`);
  }

  await page.emulateMedia({ media: "print" });
  const pageCountInDom = await page.locator("[data-report-page]").count();
  if (pageCountInDom !== 7) {
    throw new Error(`Report DOM should contain exactly seven report pages, found ${pageCountInDom}.`);
  }

  const printText = await page.locator("body").innerText();
  const missingDomText = requiredText.filter((text) => !printText.includes(text));
  if (missingDomText.length > 0) {
    throw new Error(`Print DOM is missing required text: ${missingDomText.join(", ")}`);
  }
  const leakedEmptyState = forbiddenPrintText.filter((text) => printText.includes(text));
  if (leakedEmptyState.length > 0) {
    throw new Error(`Print DOM leaked empty/stale text: ${leakedEmptyState.join(", ")}`);
  }

  const pdf = await page.pdf({
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true
  });
  await writeFile(pdfPath, pdf);
} finally {
  await browser.close();
}

const pageCounter = spawnSync("python", ["-c", "import sys; from pypdf import PdfReader; print(len(PdfReader(sys.argv[1]).pages))", pdfPath], { encoding: "utf8" });
if (pageCounter.status !== 0) {
  throw new Error(`PDF page-count validation failed: ${pageCounter.stderr || pageCounter.stdout}`);
}

const extractor = `
import sys
from pypdf import PdfReader
reader = PdfReader(sys.argv[1])
text = "\\n".join(page.extract_text() or "" for page in reader.pages)
print(text)
`;
const extracted = spawnSync("python", ["-c", extractor, pdfPath], { encoding: "utf8" });

const fileInfo = await stat(pdfPath);
const pageCount = Number(pageCounter.stdout.trim());
if (pageCount !== 7 || fileInfo.size < 20_000) {
  throw new Error(`Generated A4 PDF is invalid: pages=${pageCounter.stdout.trim()}, bytes=${fileInfo.size}`);
}

console.log(JSON.stringify({
  status: "passed",
  pdf: pdfPath,
  format: "A4",
  expectedPages: 7,
  actualPages: pageCount,
  assessmentId: seededAssessment.assessment_id,
  bytes: fileInfo.size,
  verifiedPrintDomText: requiredText,
  pdfTextExtraction: extracted.status === 0 && requiredText.every((text) => extracted.stdout.includes(text))
    ? "pypdf extracted every required Korean label"
    : "pypdf did not extract every Korean glyph; DOM text and exact PDF page count were verified around page.pdf()"
}, null, 2));
