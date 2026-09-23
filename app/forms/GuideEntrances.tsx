import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import styles from "./FormsLibrary.module.css";

export function GuideEntrances() {
  return <section className={styles.purposeGuides} aria-label="상황별 자료 안내">
    <h2>어떤 자료가 필요한지 모르겠다면</h2>
    <div><details><summary>상속 자료가 필요해요<ChevronDown size={15} aria-hidden="true" /></summary>
      <nav aria-label="상속 시점 선택"><Link href="/forms/guides/before-death">미리 준비 중<ArrowRight size={14} aria-hidden="true" /></Link><Link href="/forms/guides/after-death">상속 발생 후<ArrowRight size={14} aria-hidden="true" /></Link></nav>
    </details>{[["gift", "증여"], ["transfer", "양도"], ["business-succession", "가업승계"]].map(([path, label]) => <Link key={path} href={`/forms/guides/${path}`}>{label} 자료가 필요해요<ArrowRight size={15} aria-hidden="true" /></Link>)}</div>
  </section>;
}
