import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { PublicNav } from "@/components/PublicNav";
import content from "@/lib/forms/planning-content.json";
import styles from "./PlanningWorkspace.module.css";

export const metadata: Metadata = { title: "생전 준비자료 | 자산승계 360", description: "가족과 재산의 현황부터 이전 방법과 상담 질문까지, 여섯 가지 준비자료로 정리하세요." };
export default function PlanningIndex() {
  return <><PublicNav /><main className={styles.page}>
    <Link className={styles.back} href="/forms"><ArrowLeft size={16} aria-hidden="true" /> 서류양식으로</Link>
    <header className={styles.heading}><p className={styles.eyebrow}>오늘부터 할 수 있는 준비</p>
      <h1>서류를 찾기 전에,<br />내 상황부터 정리하세요.</h1>
      <p>아는 내용부터 적어도 괜찮습니다. 정리한 내용은 상담 준비용 요약으로 가져갈 수 있습니다.</p>
      <span className={styles.origin}>자산승계 360 자체 제작 · 기관 서식과 별도 제공</span>
    </header>
    <div className={styles.indexGrid}>{content.resources.map((resource, index) => <Link href={`/forms/planning/${resource.id}`} key={resource.id} className={styles.indexCard}>
      <span className={styles.number}>{String(index + 1).padStart(2, "0")}</span><h2>{resource.title}</h2><p>{resource.description}</p><span className={styles.cardAction}>정리 시작하기 <ArrowRight size={17} aria-hidden="true" /></span>
    </Link>)}</div>
  </main></>;
}
