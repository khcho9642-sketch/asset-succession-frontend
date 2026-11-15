"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { ArrowRight, ExternalLink, FileText } from "lucide-react";
import { guideResourceUrl, guideUrl, type InheritanceGuide } from "@/lib/forms/guides";
import { DISTRIBUTION_CONTEXT_IDS, guideAssetChoices, guideCatalogAsset, guideRelatedCatalogUrl, guideSelectionHash, resolveGuideSelection, visibleGuideResourceIds } from "@/lib/forms/guide-navigation";
import styles from "./Guides.module.css";

export type GuideResourceSummary = {
  id: string; title: string; category: string; provider: string; delivery: string;
  action: "발급 방법 보기" | "작성 안내 보기" | "서식 받기";
};
type Props = {
  guide: InheritanceGuide;
  resources: GuideResourceSummary[];
  catalogHref: string;
  lookupPanels: Record<string, ReactNode>;
  anchorStepIds: Record<string, string>;
};

const subscribeHash = (listener: () => void) => {
  window.addEventListener("hashchange", listener);
  window.addEventListener("popstate", listener);
  return () => {
    window.removeEventListener("hashchange", listener);
    window.removeEventListener("popstate", listener);
  };
};
const readHash = () => window.location.hash;
const serverHash = () => "";

export function GuideNavigator({ guide, resources, catalogHref, lookupPanels, anchorStepIds }: Props) {
  const hash = useSyncExternalStore(subscribeHash, readHash, serverHash);
  const selection = resolveGuideSelection(guide.timing, guide.steps.map(step => step.id), hash, anchorStepIds);
  const selectedStep = guide.steps.find(step => step.id === selection?.stepId);
  const selectedId = selectedStep?.id || "";
  const documents = new Map(resources.map(resource => [resource.id, resource]));
  const assetChoices = guideAssetChoices(guide.timing, selectedId);
  const assetId = selection?.assetId || "all";
  const activeAsset = assetChoices.find(choice => choice.id === assetId);
  const relatedAsset = selection ? guideCatalogAsset(guide.timing, selection) : null;
  const returnStep = selectedId ? guideSelectionHash(selectedId, assetId) : "";
  const visibleIds = selectedStep ? visibleGuideResourceIds(guide.timing, selectedStep.id, selectedStep.resources.map(resource => resource.id), assetId) : [];
  const visibleResources = selectedStep?.resources.filter(resource => visibleIds.includes(resource.id) && documents.has(resource.id)) || [];
  const showAssetContext = assetChoices.length > 0 && assetId !== "all";
  const contextResources = showAssetContext ? visibleResources.filter(resource => DISTRIBUTION_CONTEXT_IDS.some(id => id === resource.id)) : [];
  const primaryResources = visibleResources.filter(resource => !contextResources.includes(resource));

  useEffect(() => {
    if (!hash) return;
    const frame = window.requestAnimationFrame(() => {
      let anchor = "";
      try { anchor = decodeURIComponent(hash.slice(1)); } catch { /* Invalid anchors keep the task choices visible. */ }
      const exact = anchor ? document.getElementById(anchor) : null;
      const target = exact || document.getElementById(selectedId ? `${selectedId}-title` : "guide-task-selection");
      target?.scrollIntoView({ block: "start", behavior: "instant" });
      const focusTarget = exact && anchor.startsWith("lookup-") ? exact.querySelector<HTMLElement>("summary")
        : exact?.id === selectedId ? document.getElementById(`${selectedId}-title`) : target;
      focusTarget?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hash, selectedId]);

  const renderResources = (items: typeof visibleResources) => items.map(resource => {
    const document = documents.get(resource.id)!;
    return <Link href={guideResourceUrl(resource.id, guide.timing, returnStep)} key={resource.id} className={styles.resource} data-guide-resource={resource.id} aria-label={`${document.title} ${document.action}`}>
      <FileText size={18} aria-hidden="true" /><span><small>{document.category}</small><strong>{document.title}</strong><small>{resource.use}</small>
        <small className={styles.resourceMeta}>{document.provider}<br />{document.delivery}</small>
        <span className={styles.resourceAction}>{document.action}<ArrowRight size={15} aria-hidden="true" /></span>
      </span>
    </Link>;
  });

  return <div className={styles.navigator} data-guide-navigator={guide.timing}>
    <section className={styles.taskSelection} aria-labelledby="guide-task-selection">
      <div className={styles.taskSelectionHeading}><div><h2 id="guide-task-selection" tabIndex={-1}>{guide.timing === "gift" ? "무엇을 증여하시나요?" : "어떤 일을 확인하고 싶으신가요?"}</h2><p>필요한 항목부터 선택하세요. 순서대로 모두 진행하는 절차는 아닙니다.</p></div>
        <Link href={catalogHref} className={styles.textLink}>이 상황의 전체 자료<ArrowRight size={15} aria-hidden="true" /></Link>
      </div>
      <nav className={styles.taskChoices} aria-label={`${guide.title} 업무 선택`}>
        {guide.steps.map(step => <a href={`#${step.id}`} key={step.id} aria-current={step.id === selectedId ? "true" : undefined} data-guide-step={step.id}>
          <span>{step.title}</span><ArrowRight size={16} aria-hidden="true" />
        </a>)}
      </nav>
    </section>

    {!selectedStep || !selection ? <div className={styles.selectionPrompt}><FileText size={23} aria-hidden="true" /><p>위에서 필요한 일을 고르면 이용 안내와 관련 자료가 여기에 표시됩니다.</p><Link className={styles.textLink} href="/forms?view=all">자료명을 알고 있다면 전체 자료에서 검색<ArrowRight size={15} aria-hidden="true" /></Link></div> : <section id={selectedStep.id} className={styles.step} aria-labelledby={`${selectedStep.id}-title`} data-guide-active-step={selectedStep.id}>
      <div className={styles.stepHeading}><div><p className={styles.question}>{selectedStep.question}</p><h2 id={`${selectedStep.id}-title`} tabIndex={-1}>{selectedStep.title}</h2></div></div>
      {assetChoices.length > 0 && <div className={styles.assetSelection}><p id="guide-asset-label">어떤 재산의 이전·청구를 준비하시나요?</p><nav aria-labelledby="guide-asset-label">
        {assetChoices.map(choice => <a key={choice.id} href={`#${guideSelectionHash(selectedStep.id, choice.id)}`} aria-current={assetId === choice.id ? "true" : undefined} data-guide-asset={choice.id}>{choice.label}</a>)}
      </nav></div>}
      <p className={styles.why}>{selectedStep.why}</p>
      <ul className={styles.actions}>{selectedStep.actions.map(action => <li key={action}>{action}</li>)}</ul>
      {selectedStep.note && <div className={styles.stepNote}><strong>{selectedStep.note.title}</strong><p>{selectedStep.note.body}</p></div>}
      {(!showAssetContext || assetId === "insurance") && lookupPanels[selectedStep.id]}
      {guide.timing === "before-death" && selectedStep.id === "funding" && <a className={styles.textLink} href="#lookup-pension">연금 조회 안내 보기<ArrowRight size={15} aria-hidden="true" /></a>}

      {visibleResources.length > 0 && <div className={styles.materials}>
        <div className={styles.materialsHeading}><h3>{showAssetContext ? `${activeAsset?.label} 관련 자료` : "필요한 자료 선택"}</h3><span role="status">{visibleResources.length}개 자료</span></div>
        <div className={styles.resourceGrid}>{renderResources(primaryResources)}</div>
        {contextResources.length > 0 && <div className={styles.contextMaterials}><h3>가족관계·유언에 따라 함께 확인할 자료</h3><div className={styles.resourceGrid}>{renderResources(contextResources)}</div></div>}
        <Link className={styles.textLink} href={guideRelatedCatalogUrl(catalogHref, guide.timing, selection)}>{relatedAsset ? `${relatedAsset.label} 관련 전체 자료 보기` : "이 상황의 전체 자료 보기"}<ArrowRight size={15} aria-hidden="true" /></Link>
      </div>}

      {guide.timing === "before-death" && selectedStep.id === "options" && <Link className={styles.textLink} href={guideUrl("gift")}>생전 증여를 검토한다면 증여 안내 보기<ArrowRight size={15} aria-hidden="true" /></Link>}
      {selectedStep.sources && <div className={styles.sources}><span>공식 안내 확인</span>{selectedStep.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.title}<ExternalLink size={12} aria-hidden="true" /><span className={styles.srOnly}> (새 창)</span></a>)}</div>}
      <div className={styles.stepBottom}><a className={styles.textLink} href="#guide-task-selection">다른 업무 선택하기<ArrowRight size={15} aria-hidden="true" /></a><Link className={styles.textLink} href="/forms?view=all">전체 자료실 보기<ArrowRight size={15} aria-hidden="true" /></Link></div>
    </section>}
  </div>;
}
