import type { Metadata } from "next";
import Link from "next/link";
import { SampleReportViewer } from "@/components/SampleReportViewer";
import styles from "@/components/SampleReport.module.css";

export const metadata: Metadata = {
  title: "7장 샘플 보고서 | 자산승계 360",
  description: "가족 자산 50억원, 채무 5억원의 가상 사례로 보는 7장 샘플 보고서. 가족·자산 현황과 세 가지 자산승계 방향을 살펴보세요."
};

export default function SampleReportPage() {
  return (
    <div className={`${styles.page} ${styles.samplePage}`}>
      <a href="#sample-report-content" className={styles.skipLink}>보고서로 건너뛰기</a>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="자산승계 360 홈">자산승계 360</Link>
        <h1 className={styles.sampleTitle}>7장 샘플 보고서</h1>
        <nav className={styles.headerLinks} aria-label="샘플 보고서 메뉴">
          <Link href="/precheck" className={styles.primaryLink}>무료 AI 진단</Link>
          <Link href="/" className={styles.backLink}>홈으로</Link>
        </nav>
      </header>
      <main id="sample-report-content" className={styles.main}>
        <SampleReportViewer />
      </main>
    </div>
  );
}
