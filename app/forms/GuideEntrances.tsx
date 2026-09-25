import Link from "next/link";
import { ArrowRight } from "lucide-react";
import styles from "./FormsLibrary.module.css";

export function GuideEntrances() {
  return <section className={styles.purposeGuides} aria-label="상황별 자료 안내">
    <h2 className={styles.srOnly}>상황별 가이드</h2>
    <div>{[["before-death", "상속 전 준비", "본인 재산 확인부터"], ["after-death", "상속 발생 후", "신고·재산조회부터"], ["gift", "증여", "현금·부동산·주식"], ["transfer", "양도", "자산별 계약·신고"], ["business-succession", "가업승계", "상속·증여·사업 이전"]].map(([path, label, note]) => <Link key={path} href={`/forms/guides/${path}`}><span>{label}<small className={styles.guideEntryNote}>{note}</small></span><ArrowRight size={15} aria-hidden="true" /></Link>)}</div>
  </section>;
}
