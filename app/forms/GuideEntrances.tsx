import Link from "next/link";
import { ArrowRight } from "lucide-react";
import styles from "./FormsLibrary.module.css";

export function GuideEntrances() {
  return <section className={styles.purposeGuides} aria-label="상황별 자료 안내">
    <h2 className={styles.srOnly}>상황별 가이드</h2>
    <div>{[["before-death", "상속 전 준비"], ["after-death", "상속 발생 후"], ["gift", "증여"], ["transfer", "양도"], ["business-succession", "가업승계"]].map(([path, label]) => <Link key={path} href={`/forms/guides/${path}`}>{label}<ArrowRight size={15} aria-hidden="true" /></Link>)}</div>
  </section>;
}
