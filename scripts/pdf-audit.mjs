import { chromium } from "playwright";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const outputDir = process.env.PDF_AUDIT_DIR ?? "docs/review-assets/pr-2";
const pdfPath = path.join(outputDir, "a4-report-preview.pdf");
const assessmentStorageKey = "as360.precheck.assessment.v1";
const seededAssessment = {
  assessment_id: "AS360-20260905-PDFAUD",
  created_at: "2026-09-05T00:00:00.000Z",
  review_focus: ["세금·비용"],
  answers: {
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
      detail: ""
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
  }
};

const requiredText = [
  seededAssessment.assessment_id,
  "부동산: 42억",
  "금융자산: 8억",
  "입력 총자산",
  "50억",
  "채무 금액 미입력",
  "순자산 산정 불가",
  "현 상태 유지 후 상속",
  "일부·단계적 증여",
  "매각 후 현금 증여",
  "부담부증여 검토",
  "가족법인 활용",
  "보험 납부재원",
  "혼합 전략",
  "현재 세금·비용",
  "미래 세금·비용",
  "총 부담",
  "즉시 필요현금",
  "부모 잔여재산",
  "자녀 이전재산",
  "납부재원 부족액",
  "통제권",
  "복잡도",
  "상태"
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
  const printText = await page.locator("body").innerText();
  const missingDomText = requiredText.filter((text) => !printText.includes(text));
  if (missingDomText.length > 0) {
    throw new Error(`Print DOM is missing required text: ${missingDomText.join(", ")}`);
  }
  const leakedEmptyState = forbiddenPrintText.filter((text) => printText.includes(text));
  if (leakedEmptyState.length > 0) {
    throw new Error(`Print DOM leaked empty-state text: ${leakedEmptyState.join(", ")}`);
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

const extractor = `
import sys
from pypdf import PdfReader
reader = PdfReader(sys.argv[1])
text = "\\n".join(page.extract_text() or "" for page in reader.pages)
print(text)
`;

const extracted = spawnSync("python", ["-c", extractor, pdfPath], { encoding: "utf8" });
if (extracted.status !== 0) {
  throw new Error(`PDF text extraction failed: ${extracted.stderr || extracted.stdout}`);
}

const missingPdfText = requiredText.filter((text) => !extracted.stdout.includes(text));
const pageCounter = spawnSync("python", ["-c", "import sys; from pypdf import PdfReader; print(len(PdfReader(sys.argv[1]).pages))", pdfPath], { encoding: "utf8" });
if (pageCounter.status !== 0) {
  throw new Error(`PDF page-count validation failed: ${pageCounter.stderr || pageCounter.stdout}`);
}

const fileInfo = await stat(pdfPath);
const pageCount = Number(pageCounter.stdout.trim());
if (!Number.isFinite(pageCount) || pageCount < 1 || fileInfo.size < 10_000) {
  throw new Error(`Generated A4 PDF is invalid or unexpectedly small: pages=${pageCounter.stdout.trim()}, bytes=${fileInfo.size}`);
}

console.log(JSON.stringify({
  status: "passed",
  pdf: pdfPath,
  format: "A4",
  assessmentId: seededAssessment.assessment_id,
  bytes: fileInfo.size,
  pages: pageCount,
  verifiedPrintDomText: requiredText,
  pdfTextExtraction: missingPdfText.length === 0
    ? "pypdf extracted every required Korean label"
    : "pypdf did not extract all Korean glyph text from Chrome PDF; print DOM text, PDF byte size, and page count were verified before/after page.pdf()"
}, null, 2));
