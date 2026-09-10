import type { Metadata } from "next";
import { PublicNav } from "@/components/PublicNav";
import { SampleReportViewer } from "@/components/SampleReportViewer";
import styles from "@/components/SampleReport.module.css";

export const metadata: Metadata = {
  title: "7장 샘플 보고서 | 자산승계 360",
  description: "가족 합산 자산 50억원, 채무 5억원의 가상 사례로 보는 7장 일러스트 보고서. 첫 장의 상속재산 52억원 배분별 추정 상속세 차이 5.75억원부터 증여·매각·상속의 방향과 실행 준비까지 살펴보세요."
};

export default function SampleReportPage() {
  return (
    <div className={`${styles.page} ${styles.samplePage}`}>
      <a href="#sample-report-content" className={styles.skipLink}>보고서로 건너뛰기</a>
      <PublicNav />
      <main id="sample-report-content" className={styles.main} aria-labelledby="sample-report-title">
        <h1 id="sample-report-title" className={styles.srOnly}>7장 샘플 보고서</h1>
        <SampleReportViewer />
      </main>
    </div>
  );
}
