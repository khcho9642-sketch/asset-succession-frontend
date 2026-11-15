import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, FileText } from "lucide-react";
import { PublicNav } from "@/components/PublicNav";
import { GUIDES, getGuide, guideCatalogUrl } from "@/lib/forms/guides";
import { libraryDocuments } from "@/lib/forms/server-catalog";
import { availableFiles, FACETS, isPublicResource, providerLabel, useCategory, USE_CATEGORIES } from "@/lib/forms/catalog";
import { LOOKUP_SERVICES } from "@/lib/forms/lookup-services";
import { POST_DEATH_LOOKUP_SERVICES } from "@/lib/forms/post-death-lookup-services";
import { LookupServices } from "../LookupServices";
import { GuideNavigator, type GuideResourceSummary } from "../GuideNavigator";
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
  const resourceIds = new Set(guide.steps.flatMap(step => step.resources.map(resource => resource.id)));
  const resources = libraryDocuments.filter(document => resourceIds.has(document.id) && isPublicResource(document))
    .map((document): GuideResourceSummary => {
      const category = useCategory(document);
      const formats = [...new Set(availableFiles(document).map(file => file.format))];
      const delivery = document.resource?.facets.delivery === "official_link" ? `${providerLabel(document)}에서 확인`
        : (FACETS.delivery.values as Record<string, string>)[document.resource?.facets.delivery || ""] || "이용 방식 확인 필요";
      return {
        id: document.id, title: document.title, category: USE_CATEGORIES[category],
        provider: document.providerScope || document.institution || "제공처 확인",
        delivery: `${delivery}${category !== "service" && formats.length ? ` · ${formats.join(" · ")}` : ""}`,
        action: category === "service" ? "발급 방법 보기" : category === "guide" ? "작성 안내 보기" : "서식 받기",
      };
    });
  const lookupPanels = Object.fromEntries(guide.steps.map(step => [step.id,
    guide.timing === "before-death" && step.id === "inventory" ? <LookupServices key={step.id} />
      : guide.timing === "after-death" ? <LookupServices timing="after-death" stepId={step.id} key={step.id} /> : null,
  ]));
  const anchorStepIds = guide.timing === "before-death"
    ? Object.fromEntries(LOOKUP_SERVICES.map(service => [`lookup-${service.id}`, "inventory"]))
    : guide.timing === "after-death"
      ? Object.fromEntries(POST_DEATH_LOOKUP_SERVICES.map(service => [`lookup-${service.id}`, service.stepId]))
      : guide.timing === "gift" ? { "transfer-evidence": "cash" } : {};
  const catalogHref = guideCatalogUrl(guide.timing);

  return <div className={shell.root}><PublicNav /><div className={styles.canvas}><main className={styles.page}>
    <Link className={styles.back} href="/forms/guides"><ArrowLeft size={16} aria-hidden="true" /> 상황 다시 선택</Link>
    <header className={styles.guideHeading}>
      <div><p className={styles.eyebrow}>{guide.title} 가이드</p><h1>{guide.question}</h1><p>{guide.description}</p></div>
      <Link className={styles.libraryButton} href={catalogHref}><FileText size={17} aria-hidden="true" /> 관련 자료 모아보기</Link>
    </header>
    <aside className={styles.notice} aria-label="시작 전 확인"><strong>{guide.notice.title}</strong><p>{guide.notice.body}</p>
      {guide.timing === "after-death" && <div className={styles.noticeActions}>
        <a href="#estate-inquiry">재산·채무 조회<ArrowRight size={15} aria-hidden="true" /></a>
        <a href="#acceptance">받을지·포기할지 검토<ArrowRight size={15} aria-hidden="true" /></a>
      </div>}
    </aside>
    <details className={styles.preparationOverview}><summary>먼저 확인할 사항</summary><ul>{guide.overview.map(item => <li key={item}>{item}</li>)}</ul></details>
    <GuideNavigator guide={guide} resources={resources} catalogHref={catalogHref} lookupPanels={lookupPanels} anchorStepIds={anchorStepIds} />
    <footer className={styles.guideFooter}><div><h2>내 상황에 맞는 자료를 더 찾아보세요</h2><p>자산 종류와 필요한 업무로 좁혀서 확인할 수 있습니다.</p></div><Link className={styles.primaryButton} href={catalogHref}>관련 자료 전체 보기<ArrowRight size={17} aria-hidden="true" /></Link></footer>
    <div className={styles.switchGuide}><Link className={styles.textLink} href="/forms/guides">다른 상황의 안내 보기<ArrowRight size={15} aria-hidden="true" /></Link><Link className={styles.textLink} href="/forms?view=all">전체 자료에서 찾기<ArrowRight size={15} aria-hidden="true" /></Link><Link className={styles.textLink} href="/consultation">전문가 상담<ArrowRight size={15} aria-hidden="true" /></Link></div>
  </main></div></div>;
}
