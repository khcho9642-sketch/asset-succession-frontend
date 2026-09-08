import type { Metadata } from "next";
import Link from "next/link";
import { SampleReportViewer } from "@/components/SampleReportViewer";
import styles from "@/components/SampleReport.module.css";

export const metadata: Metadata = {
  title: "7장 샘플 보고서 | 자산승계 360",
  description: "가상 가족 사례로 보는 7장 자산승계 사전진단 보고서. 핵심 요약부터 대안 비교, 생활재원과 실행 준비까지 살펴보세요."
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
        <div className={styles.intro}>
          <h1>우리 가족 자산승계 진단서</h1>
          <p>샘플 · 가상 사례 · AI 사전진단 · 전문가 검토 전</p>
        </div>
        <SampleReportViewer />
        <p className={styles.disclaimer}>가상 사례이며, 예시 금액은 실제 세액·절감액이 아닙니다.</p>
      </main>
    </div>
  );
}
