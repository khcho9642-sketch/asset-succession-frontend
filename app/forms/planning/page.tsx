import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, ArrowLeft, FileText } from "lucide-react";
import { PublicNav } from "@/components/PublicNav";
import content from "@/lib/forms/planning-content.json";
import styles from "./PlanningWorkspace.module.css";

export const metadata: Metadata = { title: "생전 준비자료 | 자산승계 360", description: "가족과 재산의 현황부터 이전 방법과 상담 질문까지, 여섯 가지 준비자료로 정리하세요." };
const topics = ["가족", "이력", "방법", "재원", "질문", "모으기"];

export default function PlanningIndex() {
  return <><PublicNav /><div className={styles.canvas}><main className={styles.page}>
    <Link className={styles.back} href="/forms"><ArrowLeft size={16} aria-hidden="true" /> 서류양식으로</Link>
    <header className={`${styles.heading} ${styles.indexHeading}`}>
      <div><p className={styles.eyebrow}>내 상황 정리 · 상담 준비</p><h1>생전 준비자료</h1><p>필요한 주제부터 골라 보세요. 아는 내용만 적으면 상담 준비 요약으로 정리됩니다.</p></div>
      <span className={styles.origin}>자산승계 360 자체 제작<br /> 기관 제출용 서식과 별도 제공</span>
    </header>
    <p className={styles.indexGuide}><FileText size={17} aria-hidden="true" /><span>각 자료는 <strong>선택 질문 10개 · 3개 구역</strong>으로 구성됩니다. 결과 요약은 복사·저장·인쇄할 수 있습니다.</span></p>
    <div className={styles.indexGrid}>{content.resources.map((resource, index) => <Link href={`/forms/planning/${resource.id}`} key={resource.id} className={styles.indexCard}>
      <div className={styles.cardHeading}><span className={styles.number}>{String(index + 1).padStart(2, "0")}</span><h2>{topics[index]}</h2><ArrowRight size={19} aria-hidden="true" /></div>
      <h3>{resource.title}</h3><p>{resource.description}</p>
      <ol className={styles.cardSections}>{resource.sections.map(section => <li key={section.id}>{section.title}</li>)}</ol>
      <span className={styles.cardAction}><span>{resource.sections.flatMap(section => section.questions).length}개 선택 질문 · {resource.sections.length}개 구역</span><span>정리하기 <ArrowRight size={15} aria-hidden="true" /></span></span>
    </Link>)}</div>
    <p className={styles.bottomNote}>작성 내용은 현재 탭에서만 이어집니다. 새로고침하거나 탭을 닫으면 지워지므로 필요한 요약은 저장해 주세요. 상담 신청 시 자동 전송되지 않습니다.</p>
  </main></div></>;
}
