import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ExternalLink, FileText } from "lucide-react";
import { PublicNav } from "@/components/PublicNav";
import { GUIDES, getGuide, guideCatalogUrl, guideResourceUrl, guideUrl } from "@/lib/forms/guides";
import { LookupServices } from "../LookupServices";
import shell from "../../FormsHeader.module.css";
import styles from "../Guides.module.css";

export function generateStaticParams() {
  return GUIDES.map(guide => ({ timing: guide.timing }));
}
export const dynamicParams = false;
export async function generateMetadata({ params }: { params: Promise<{ timing: string }> }): Promise<Metadata> {
  const { timing } = await params;
  const guide = getGuide(timing);
  return { title: `${guide?.title ?? "상속"} 가이드 | 자산승계 360`, description: guide?.description };
}

export default async function GuidePage({ params }: { params: Promise<{ timing: string }> }) {
  const { timing } = await params;
  const guide = getGuide(timing);
  if (!guide) notFound();
  const other = GUIDES.find(item => item.timing !== guide.timing)!;
  return <div className={shell.root}><PublicNav /><div className={styles.canvas}><main className={styles.page}>
    <Link className={styles.back} href="/forms/guides"><ArrowLeft size={16} aria-hidden="true" /> 상황 다시 선택</Link>
    <header className={styles.guideHeading}>
      <div><p className={styles.eyebrow}>{guide.title} 가이드</p><h1>{guide.question}</h1><p>{guide.description}</p></div>
      <Link className={styles.libraryButton} href={guideCatalogUrl(guide.timing)}><FileText size={17} aria-hidden="true" /> 관련 자료 모아보기</Link>
    </header>
    <aside className={styles.notice} aria-label="시작 전 확인"><strong>{guide.notice.title}</strong><p>{guide.notice.body}</p>
      {guide.timing === "after-death" && <div className={styles.noticeActions}>
        <a href="#estate-inquiry">재산·채무 조회 <ArrowRight size={15} aria-hidden="true" /></a>
        <a href="#acceptance">받을지·포기할지 검토 <ArrowRight size={15} aria-hidden="true" /></a>
      </div>}
    </aside>
    <div className={styles.guideLayout}>
      <aside className={styles.contents}>
        <p>필요한 일 바로 찾기</p>
        <nav aria-label={`${guide.title} 안내 목차`}>{guide.steps.map((step, index) => <a href={`#${step.id}`} key={step.id}><span>{String(index + 1).padStart(2, "0")}</span>{step.title}</a>)}</nav>
        <Link className={styles.contentsLibrary} href="/forms">자료실 전체 보기 <ArrowRight size={15} aria-hidden="true" /></Link>
      </aside>
      <div className={styles.steps}>{guide.steps.map((step, index) => <section id={step.id} className={styles.step} key={step.id} aria-labelledby={`${step.id}-title`}>
        <div className={styles.stepHeading}><span className={styles.number}>{String(index + 1).padStart(2, "0")}</span><div><p className={styles.question}>{step.question}</p><h2 id={`${step.id}-title`}>{step.title}</h2></div></div>
        <p className={styles.why}>{step.why}</p>
        <ul className={styles.actions}>{step.actions.map(action => <li key={action}>{action}</li>)}</ul>
        {step.note && <div className={styles.stepNote}><strong>{step.note.title}</strong><p>{step.note.body}</p></div>}
        {guide.timing === "before-death" && step.id === "inventory" && <LookupServices />}
        {guide.timing === "after-death" && <LookupServices timing="after-death" stepId={step.id} />}
        {guide.timing === "before-death" && step.id === "funding" && <a className={styles.textLink} href="#lookup-pension">연금 조회 안내 보기 <ArrowRight size={15} aria-hidden="true" /></a>}
        <div className={styles.materials}><h3>필요한 자료 선택</h3><div className={styles.resourceGrid}>{step.resources.map(resource => {
          return <Link href={guideResourceUrl(resource.id)} key={resource.id} className={styles.resource}>
            <FileText size={18} aria-hidden="true" /><span><strong>{resource.label}</strong><small>{resource.use}</small></span><ArrowRight size={15} aria-hidden="true" />
          </Link>;
        })}</div></div>
        {step.sources && <div className={styles.sources}><span>공식 안내 확인</span>{step.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.title}<ExternalLink size={12} aria-hidden="true" /><span className={styles.srOnly}> (새 창)</span></a>)}</div>}
      </section>)}</div>
    </div>
    <footer className={styles.guideFooter}><div><h2>내 상황에 맞는 자료를 더 찾아보세요</h2><p>자산 종류와 필요한 업무로 좁혀서 확인할 수 있습니다.</p></div><Link className={styles.primaryButton} href={guideCatalogUrl(guide.timing)}>관련 자료 찾기 <ArrowRight size={17} aria-hidden="true" /></Link></footer>
    <div className={styles.switchGuide}><Link className={styles.textLink} href={guideUrl(other.timing)}>{other.title} 가이드 보기 <ArrowRight size={15} aria-hidden="true" /></Link><Link className={styles.textLink} href="/consultation">전문가 상담 <ArrowRight size={15} aria-hidden="true" /></Link></div>
  </main></div></div>;
}
