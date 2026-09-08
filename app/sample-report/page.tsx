import type { Metadata } from "next";
import Link from "next/link";
import { SampleReportViewer } from "@/components/SampleReportViewer";
import styles from "@/components/SampleReport.module.css";

export const metadata: Metadata = {
  title: "7장 샘플 보고서 | 자산승계 360",
  description: "상속재산 52억원의 가상 사례로 보는 실제 7페이지 보고서. 추정 상속세, 대안별 차액과 계산 근거를 확인하세요."
};

export default function SampleReportPage() {
  return (
    <div className={styles.page}>
      <a href="#sample-report-content" className={styles.skipLink}>보고서로 건너뛰기</a>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="자산승계 360 홈">자산승계 360</Link>
        <nav className={styles.headerLinks} aria-label="샘플 보고서 메뉴">
          <Link href="/precheck" className={styles.primaryLink}>무료 AI 진단</Link>
          <Link href="/" className={styles.backLink}>홈으로</Link>
        </nav>
      </header>
      <main id="sample-report-content" className={styles.main}>
        <SampleReportViewer />
        <p className={styles.disclaimer}>샘플 · 가상 사례. 상속재산 52억원, 배우자와 성년 자녀 3명, 채무·합산할 사전증여 없음 등을 가정했습니다. 표시된 추정 세액은 이 예시 조건의 계산 결과입니다.</p>
      </main>
    </div>
  );
}
