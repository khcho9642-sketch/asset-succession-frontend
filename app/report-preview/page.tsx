import Link from "next/link";
import { PublicNav } from "@/components/PublicNav";
import { ReportV2Preview } from "@/components/ReportV2Preview";
import styles from "@/components/SampleReport.module.css";

export default function ReportPreviewPage() {
  return (
    <main className={styles.page}>
      <div className="print:hidden">
        <PublicNav />
        <div className="mx-auto flex max-w-5xl items-center px-3 py-3 sm:px-6 lg:px-8">
          <Link href="/precheck" className={styles.backLink}>진단으로 돌아가기</Link>
        </div>
      </div>
      <section className="mx-auto max-w-5xl px-3 pb-12 sm:px-6 lg:px-8 print:max-w-none print:p-0">
        <ReportV2Preview />
      </section>
    </main>
  );
}
