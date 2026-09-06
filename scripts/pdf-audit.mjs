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
  review_focus: ["전체 요약 먼저 보기"],
  answers: {
    purpose: {
      label: "준비 목적",
      choices: ["여러 방법 비교"],
      detail: "상속·증여를 함께 비교"
    },
    family: {
      label: "가족",
      choices: ["부모 1명 기준"],
      detail: "",
      facts: { "배우자 유무": "있음", "자녀 수": "2명", "성년 자녀 수": "2명", "미성년 자녀 수": "0명" }
    },
    assets: {
      label: "자산",
      choices: ["금융자산", "부동산"],
      detail: "",
      assetAmounts: { "금융자산": "30", "부동산": "20" },
      assetAmountWons: { "금융자산": 3_000_000_000, "부동산": 2_000_000_000 },
      facts: { "보험": "없음" }
    },
    debt: {
      label: "채무·과거 증여",
      choices: ["최근 10년 증여 있음"],
      detail: "",
      facts: { "채무 여부": "없음", "과거 증여 상세": "3년 전 자녀별 1억 증여 및 신고" }
    },
    goal: {
      label: "승계 목표",
      choices: ["세금 부담 절감", "노후생활비 유지", "상속세 납부재원 준비"],
      detail: ""
    },
    review: {
      label: "결과 준비",
      choices: ["전체 요약 먼저 보기"],
      detail: "",
      facts: {
        "부모·자녀 대출 검토": "5",
        "첫째 자녀 상환능력": "있음",
        "둘째 자녀 상환능력": "부족",
        "상속세 납부 가능 현금": "3"
      }
    }
  },
  conversation: {
    messages: [
      { role: "user", text: "본인 자산, 총자산 50억원, 금융자산 30억원, 아파트 20억원, 채무 없음, 배우자 1명, 성인 자녀 2명, 3년 전 자녀별 1억원 증여 및 신고, 목표: 세금 부담 절감과 노후생활비 유지, 자녀에게 5억원 대출 검토, 첫째는 상환능력 있음, 둘째는 상환능력 부족, 보험 없음, 상속세 납부 가능 현금 3억원", created_at: "2026-09-06T00:00:00.000Z" },
      { role: "user", text: "맞춤 보고서를 만들어 주세요.", created_at: "2026-09-06T00:00:01.000Z" }
    ],
    confirmed_facts: [],
    raw_inputs: ["본인 자산, 총자산 50억원, 금융자산 30억원, 아파트 20억원, 채무 없음, 배우자 1명, 성인 자녀 2명, 3년 전 자녀별 1억원 증여 및 신고, 목표: 세금 부담 절감과 노후생활비 유지, 자녀에게 5억원 대출 검토, 첫째는 상환능력 있음, 둘째는 상환능력 부족, 보험 없음, 상속세 납부 가능 현금 3억원", "맞춤 보고서를 만들어 주세요."]
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
  "우리 가족 자산승계 사전진단 보고서",
  "36개 시나리오 내부 분석 완료",
  "확인된 현재 자산가액",
  "50억",
  "가족 분산·단계적 사전증여",
  "첫째 대출·둘째 증여 배분",
  "배우자 상속공제 고려 재산배분",
  "부모의 대여금 채권은 상속재산에서 자동 제외되지 않음",
  "자산 구성",
  "기준안과 추천안 비교",
  "납세재원과 부족액",
  "증여·대출·상속 실행 타임라인",
  "성년 여부",
  "채무",
  "채무 없음",
  "상속세 및 증여세법 제26조",
  "상속세 및 증여세법 제56조",
  "외부 확인 과세표준",
  "기준안과 AI 추천 3개 비교",
  "실행 로드맵·주의사항·공식 근거"
];

const forbiddenPrintText = [
  "사전진단 입력값 없음",
  "먼저 무료 사전진단을 완료해 주세요",
  "사전진단 시작하기",
  "55억",
  "9.5~12억",
  "6.3~8.6억",
  "채무·보증금\n8억",
  "입력 순자산\n42억",
  "0.5억 산출세액",
  "0.2억 산출세액",
  "0.3억 절세 예상",
  "inheritance-01-current-structure",
  "gift-01-stepwise-transfer"
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
  for (let pageNumber = 1; pageNumber <= 7; pageNumber += 1) {
    const reportPage = page.locator(`[data-report-page="${pageNumber}"]`);
    const pageText = await reportPage.innerText();
    if (pageText.length < 260) {
      throw new Error(`Report page ${pageNumber} does not have enough readable content density: ${pageText.length} chars.`);
    }
    await reportPage.screenshot({
      path: path.join(outputDir, `a4-report-page-${pageNumber}.png`)
    });
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
