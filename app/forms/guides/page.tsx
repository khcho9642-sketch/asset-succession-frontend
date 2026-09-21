import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, CalendarCheck2, Sprout } from "lucide-react";
import { PublicNav } from "@/components/PublicNav";
import { GUIDES, guideUrl } from "@/lib/forms/guides";
import shell from "../FormsHeader.module.css";
import styles from "./Guides.module.css";

export const metadata: Metadata = {
  title: "생전 준비·상속 발생 후 가이드 | 자산승계 360",
  description: "생전 준비와 상속 발생 후 필요한 일을 살펴보고, 각 단계에 맞는 설명·서류·준비자료로 바로 연결하세요.",
};
export const dynamic = "force-static";

export default function GuidesPage() {
  return <div className={shell.root}><PublicNav /><div className={styles.canvas}><main className={styles.page}>
    <Link className={styles.back} href="/forms"><ArrowLeft size={16} aria-hidden="true" /> 자료실로</Link>
    <header className={styles.indexHeading}>
      <p className={styles.eyebrow}>상황에 맞는 준비 · 필요한 서류</p>
      <h1>지금 어떤 상황이신가요?</h1>
      <p>해야 할 일을 먼저 살펴보고, 필요한 자료를 골라 보세요.</p>
    </header>
    <div className={styles.entryGrid}>{GUIDES.map(guide => {
      const Icon = guide.timing === "before-death" ? Sprout : CalendarCheck2;
      return <Link href={guideUrl(guide.timing)} className={styles.entry} key={guide.timing}>
        <span className={styles.entryIcon}><Icon size={24} aria-hidden="true" /></span>
        <p className={styles.eyebrow}>{guide.title}</p>
        <h2>{guide.timing === "before-death" ? "미리 준비하고 있어요" : "상속이 발생했어요"}</h2>
        <p className={styles.entryDescription}>{guide.description}</p>
        <ul>{guide.overview.map(item => <li key={item}>{item}</li>)}</ul>
        <span className={styles.entryAction}>{guide.startLabel}<ArrowRight size={18} aria-hidden="true" /></span>
      </Link>;
    })}</div>
    <div className={styles.indexFooter}>
      <p>필요한 서류를 이미 알고 계신가요?</p>
      <Link className={styles.textLink} href="/forms">전체 자료에서 찾기 <ArrowRight size={16} aria-hidden="true" /></Link>
    </div>
  </main></div></div>;
}
