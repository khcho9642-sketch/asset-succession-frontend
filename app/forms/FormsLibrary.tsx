"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowDown, ArrowRight, Check, ChevronDown, ChevronRight, Download, ExternalLink, FileText, FolderOpen, Info, Search, SlidersHorizontal, X } from "lucide-react";
import {
  availableFiles, authorityLabel, buildCatalog, catalogUrl, documentPreview, emptyFilters, FACETS, filterCatalog, filterPlanningResources, hasFilters, originLabel, previewLabel, providerLabel,
  parseCatalogFilters, relationLabel, resourceUrl, STAGES, TIMINGS,
  type CatalogCard, type CatalogFilters, type FacetKey, type LibraryDocument, type PresentationGroup, type PlanningCatalogResource,
} from "@/lib/forms/catalog";
import styles from "./FormsLibrary.module.css";
import { guideUrl, guidesForResource } from "@/lib/forms/guides";
import { getResourceUsage } from "@/lib/forms/resource-usage";
export type { LibraryDocument } from "@/lib/forms/catalog";

type Props = { documents: LibraryDocument[]; groups: PresentationGroup[]; planning: PlanningCatalogResource[] };
const URL_EVENT = "forms-navigation";
function subscribeUrl(callback: () => void) {
  window.addEventListener("popstate", callback);
  window.addEventListener(URL_EVENT, callback);
  return () => { window.removeEventListener("popstate", callback); window.removeEventListener(URL_EVENT, callback); };
}
const snapshot = () => window.location.search;
const serverSnapshot = () => "";
const kindLabel = (item: LibraryDocument) => (FACETS.kind.values as Record<string, string>)[item.resource?.facets.kind || ""] || "분류 확인 필요";
const deliveryLabel = (item: LibraryDocument) => item.resource?.facets.delivery === "official_link" ? `${providerLabel(item)}에서 확인` : (FACETS.delivery.values as Record<string, string>)[item.resource?.facets.delivery || ""] || "이용 방식 확인 필요";
const stageLabel = (stage: string | null) => STAGES.find(([id]) => id === stage)?.[1] || "단계 확인 필요";
const fileRole = (role: string) => ({ original: "원본", example: "작성 예시", combined: "양식·설명 합본", "image-compilation": "웹 사례 변환본", "web-example-image": "기관 사례 이미지" }[role] || "제공 파일");

function Files({ item }: { item: LibraryDocument }) {
  const files = availableFiles(item);
  if (!files.length) return item.sourceUrl ? <a className={styles.providerLink} href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{providerLabel(item)}에서 확인<ExternalLink size={14} aria-hidden="true" /></a> : <p className={styles.muted}>제공 파일을 확인하고 있습니다.</p>;
  return <ul className={styles.fileList} aria-label={`${item.title} 제공 파일`}>{files.map(file => <li key={file.path}>
    <a href={file.path} download={file.delivery === "hosted"} target={file.delivery === "hosted" ? undefined : "_blank"} rel="noopener noreferrer" data-file-download>
      <span className={styles.fileFormat}>{file.format}</span><span>{file.name}<small>{fileRole(file.role)}{file.bytes > 0 ? ` · ${Math.ceil(file.bytes / 1024).toLocaleString("ko-KR")} KB` : ""}</small></span><Download size={15} aria-hidden="true" />
    </a>
  </li>)}</ul>;
}
function FileAction({ item }: { item: LibraryDocument }) {
  const files = availableFiles(item);
  if (!files.length) return item.sourceUrl ? <a className={styles.fileAction} href={item.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`${item.title} ${providerLabel(item)}`}>{providerLabel(item)}<ExternalLink size={14} aria-hidden="true" /></a> : <span className={styles.unavailable}>파일 확인 중</span>;
  if (files.length === 1) return <a className={styles.fileAction} href={files[0].path} download={files[0].delivery === "hosted"} target={files[0].delivery === "hosted" ? undefined : "_blank"} rel="noopener noreferrer" aria-label={`${item.title} ${files[0].format} ${fileRole(files[0].role)} 받기`} data-form-download>{files[0].format} 받기<Download size={14} aria-hidden="true" /></a>;
  return <details className={styles.filePicker}><summary aria-label={`${item.title} 파일 형식 선택`}>형식·파일 선택<ChevronDown size={14} aria-hidden="true" /></summary><Files item={item} /></details>;
}

export function FormsLibrary({ documents, groups, planning }: Props) {
  const urlSearch = useSyncExternalStore(subscribeUrl, snapshot, serverSnapshot);
  const filters = useMemo(() => parseCatalogFilters(urlSearch), [urlSearch]);
  const index = useMemo(() => buildCatalog(documents, groups), [documents, groups]);
  const filtered = useMemo(() => filterCatalog(index, filters), [index, filters]);
  const matchingPlanning = useMemo(() => filterPlanningResources(planning, filters), [planning, filters]);
  const [pageLimit, setPageLimit] = useState({ key: "", count: 18 });
  const listKey = catalogUrl({ ...filters, resource: "" });
  const visibleCount = pageLimit.key === listKey ? pageLimit.count : 18;
  const visible = filtered.slice(0, visibleCount);
  const selected = index.documents.get(filters.resource);
  const selectedUsage = selected ? getResourceUsage(selected.id) : undefined;
  const guideContexts = selected ? guidesForResource(selected.id, selected.resource?.presentation.visibility === "archived" ? undefined : selected.resource) : [];
  const selectedPreview = selected ? documentPreview(selected) : null;
  const selectedGroup = index.cards.find(card => card.id === filters.resource && card.group);
  const isDetailOpen = Boolean(filters.resource);
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const facetElements = useRef<Partial<Record<FacetKey, HTMLDetailsElement | null>>>({});
  const priorFocus = useRef<HTMLElement | null>(null);
  const active = hasFilters(filters);
  const archived = documents.filter(item => item.resource?.presentation.visibility === "archived");
  const originalsCount = new Set(filtered.flatMap(card => card.matchedIds)).size;
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const selectedFacetCount = filters.purpose.length + filters.asset.length + filters.kind.length + filters.delivery.length;
  const selectedFacetKeys = (Object.keys(FACETS) as FacetKey[]).filter(key => filters[key].length > 0).join(",");
  const planningFirst = filters.stage === "S2" || filters.kind.includes("worksheet") || filters.kind.includes("toolkit") || filters.delivery.includes("inline") || filtered.length === 0;
  function navigate(next: CatalogFilters, replace = false) {
    const href = catalogUrl(next);
    if (`${window.location.pathname}${window.location.search}` !== href) window.history[replace ? "replaceState" : "pushState"](null, "", href);
    window.dispatchEvent(new Event(URL_EVENT));
  }
  function update(patch: Partial<CatalogFilters>, replace = false) { navigate({ ...filters, resource: "", ...patch }, replace); }
  function openDetail(event: MouseEvent<HTMLAnchorElement>, id: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); if (!filters.resource) priorFocus.current = event.currentTarget;
    navigate({ ...filters, resource: id });
  }
  function closeDetail() { navigate({ ...filters, resource: "" }); }
  function reset() { navigate(emptyFilters()); search.current?.focus(); }
  function toggle(key: FacetKey | "timing", value: string) {
    update({ [key]: filters[key].includes(value) ? filters[key].filter(item => item !== value) : [...filters[key], value] });
  }
  useEffect(() => {
    const element = dialog.current;
    if (!element || !isDetailOpen) return;
    const oldOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    if (!element.open) element.showModal();
    element.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { if (element.open) element.close(); document.documentElement.style.overflow = oldOverflow; priorFocus.current?.focus(); };
  }, [isDetailOpen]);
  useEffect(() => {
    if (!filters.resource) return;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const body = dialog.current?.querySelector<HTMLElement>(`.${styles.dialogBody}`);
    if (body) body.scrollTop = 0;
  }, [filters.resource]);

  // Native details keeps its own open state. Selecting a facet opens it, but clearing
  // a selection never remounts or closes the panel containing the focused button.
  useEffect(() => {
    for (const key of selectedFacetKeys.split(",").filter(Boolean) as FacetKey[]) {
      const element = facetElements.current[key];
      if (element) element.open = true;
    }
  }, [selectedFacetKeys]);

  function resourceLink(item: LibraryDocument) {
    return <a href={resourceUrl(item.id)} onClick={event => openDetail(event, item.id)}>{item.title}<ChevronRight size={14} aria-hidden="true" /></a>;
  }
  function members(card: CatalogCard, expanded = false, context: "card" | "detail" = "card") {
    const children = card.resources.filter(item => item.id !== card.document?.id);
    if (!children.length) return null;
    const matched = new Set(card.matchedIds);
    const sorted = [...children].sort((a, b) => Number(matched.has(b.id)) - Number(matched.has(a.id)));
    const sections = [...new Set(sorted.map(relationLabel))];
    return <details className={styles.members} data-members id={`${context}-members-${card.id}`} open={expanded || undefined} key={`${card.id}-${active ? listKey : "closed"}`}>
      <summary><span>{card.group ? `자료 ${children.length}개` : `부표·사례·참고 ${children.length}개`}</span><span className={styles.closedLabel}>펼치기</span><span className={styles.openedLabel}>접기</span><ChevronDown size={16} aria-hidden="true" /></summary>
      {sections.map(section => <div className={styles.memberSection} key={section}><p>{section}</p><ul>{sorted.filter(item => relationLabel(item) === section).map(item => <li key={item.id} data-matched={active && matched.has(item.id) ? "true" : undefined}>
        {active && matched.has(item.id) && <span className={styles.matchTag}><Check size={11} aria-hidden="true" />조건 일치</span>}{resourceLink(item)}<FileAction item={item} />
      </li>)}</ul></div>)}
    </details>;
  }
  function cardView(card: CatalogCard) {
    const representative = card.document
      || card.resources.find(item => card.matchedIds.includes(item.id) && documentPreview(item))
      || card.resources.find(item => documentPreview(item)) || card.resources[0];
    const imagePreview = documentPreview(representative);
    const formats = [...new Set(card.resources.flatMap(item => availableFiles(item).map(file => file.format)))];
    const providers = [...new Set(card.resources.map(item => item.institution).filter(Boolean))];
    const childHit = active && card.matchedIds.some(id => id !== card.document?.id)
      && (!card.group || Boolean(filters.q) || card.matchedIds.length < card.resources.length);
    return <article className={styles.card} key={card.id} data-form-id={card.id}>
      <div className={styles.cardBody}>
        <a className={styles.visual} href={resourceUrl(card.id)} onClick={event => openDetail(event, card.id)}
          aria-label={`${card.title} 자료 상세`} data-form-preview>
          {representative.thumbnail && imagePreview
            ? <Image className={styles.thumbnail} src={representative.thumbnail} width={imagePreview.width}
              height={imagePreview.height} style={{ maxWidth: imagePreview.width }} unoptimized
              alt={`${representative.title} · ${previewLabel(representative)} 미리보기`} />
            : <span className={styles.providerVisual}>{card.group
              ? <FolderOpen size={30} strokeWidth={1.25} aria-hidden="true" />
              : <FileText size={30} strokeWidth={1.25} aria-hidden="true" />}<span>{card.group ? "자료 묶음" : kindLabel(representative)}</span></span>}
        </a>
        <div className={styles.cardCopy}>
          <p className={styles.cardCategory}>{card.group ? "자료 묶음" : kindLabel(representative)}<span>·</span>{stageLabel(card.stage)}</p>
          <h3><a href={resourceUrl(card.id)} onClick={event => openDetail(event, card.id)}>{card.title}</a></h3>
          <p className={styles.cardDescription}>{card.group ? "기관·상황별 자료를 비교하고 필요한 서식을 선택하세요." : representative.description}</p>
        </div>
      </div>
      <div className={styles.cardMeta}>
        <span title={providers.join(" · ")}>{providers.length > 1 ? `${providers[0]} 외 ${providers.length - 1}곳` : providers[0] || "제공처 확인"}</span>
        <span>{formats.length ? formats.join(" · ") : "제공처 안내"}</span>
      </div>
      <div className={styles.cardActions}>
        <a className={styles.detailAction} href={resourceUrl(card.id)} onClick={event => openDetail(event, card.id)}>자료 상세<ArrowRight size={16} aria-hidden="true" /></a>
        {card.group ? <button type="button" className={styles.groupAction} aria-controls={`card-members-${card.id}`}
          onClick={event => {
            const details = event.currentTarget.closest("article")?.querySelector<HTMLDetailsElement>("details[data-members]");
            if (details) { details.open = true; details.querySelector("summary")?.focus(); }
          }}>자료 {card.resources.length}개 선택<FolderOpen size={16} aria-hidden="true" /></button> : <FileAction item={representative} />}
      </div>
      {members(card, childHit)}
    </article>;
  }

  function facetControls(key: FacetKey) {
    return <details className={styles.facet} key={key} ref={element => { facetElements.current[key] = element; }} open={key === "purpose" || undefined}>
      <summary>{FACETS[key].label}{filters[key].length > 0 && <span className={styles.facetCount}>{filters[key].length}</span>}<ChevronDown size={16} aria-hidden="true" /></summary>
      <div className={styles.facetOptions} role="group" aria-label={FACETS[key].label}>
        {Object.entries(FACETS[key].values).map(([value, label]) => <button type="button" key={value}
          aria-pressed={filters[key].includes(value)} onClick={() => toggle(key, value)}>
          <span className={styles.checkbox} aria-hidden="true">{filters[key].includes(value) && <Check size={13} strokeWidth={2.5} />}</span>{label}
        </button>)}
      </div>
    </details>;
  }

  const planningResults = active && matchingPlanning.length > 0 ? <section className={styles.planningResults} aria-label="조건에 맞는 자체 준비자료">
    <div className={styles.planningResultHeading}><h3>자체 준비자료 <span>{matchingPlanning.length}개</span></h3><span>자산승계 360 제작 · 상담 준비용</span></div>
    <div className={styles.planningResultGrid}>{matchingPlanning.map(item => <Link href={`/forms/planning/${item.id}`} key={item.id}>
      <FileText size={21} strokeWidth={1.5} aria-hidden="true" /><div><strong>{item.title}</strong>
        <span>{stageLabel(item.primary_stage_id)} · {(FACETS.kind.values as Record<string, string>)[item.facets.kind]}</span></div>
      <ArrowRight size={17} aria-hidden="true" />
    </Link>)}</div>
  </section> : null;

  return <main className={styles.library} id="forms-library" data-forms-library="stages-v2">
    <nav className={styles.breadcrumb} aria-label="현재 위치"><Link href="/">홈</Link><ChevronRight size={13} aria-hidden="true" /><span aria-current="page">서류양식</span></nav>
    <header className={styles.header}>
      <div><h1>서류 자료실</h1><p>상속·증여·양도·가업승계에 필요한 자료를 찾으세요.</p></div>
      <a href="/downloads/official-forms/official-forms.zip" download className={styles.bundleLink} data-bundle-download
        title="기존 74개 자료의 원본·예시 묶음입니다. 추가 자료는 목록에서 개별 확인하세요." aria-label="기존 74개 자료 묶음 받기"><Download size={17} aria-hidden="true" /><span>기존 74개 자료 묶음 받기</span></a>
    </header>

    <section className={styles.guideEntrances} aria-label="상속 상황별 가이드">
      <div><strong>무엇부터 해야 할지 궁금하다면</strong><span>할 일과 필요한 자료를 함께 확인하세요.</span></div>
      <Link href={guideUrl("before-death")}><span>미리 준비하고 있어요<small>재산 정리 · 방법 비교 · 실행 준비</small></span><ArrowRight size={19} aria-hidden="true" /></Link>
      <Link href={guideUrl("after-death")}><span>상속이 발생했어요<small>재산·채무 확인 · 선택 · 신고와 수령</small></span><ArrowRight size={19} aria-hidden="true" /></Link>
    </section>

    <section className={styles.searchWorkspace} aria-label="자료 검색과 단계 선택">
      <div className={styles.searchRow}>
        <label className={styles.search}><Search size={23} strokeWidth={1.8} aria-hidden="true" />
          <span className={styles.srOnly}>서류명·용도로 찾기</span><input ref={search} type="search" value={filters.q}
            onChange={event => update({ q: event.target.value }, true)} placeholder="어떤 서류를 찾으세요? 서류명·용도·기관 검색" maxLength={100} autoComplete="off" />
        </label>
        <p className={styles.catalogSummary} data-catalog-summary><strong>{index.cards.length}개 대표 자료</strong><span>원자료 {documents.length}개</span></p>
      </div>
      <div className={styles.timingRow}>
        <span className={styles.controlLabel}>준비 상황</span>
        <div className={styles.timing} role="group" aria-label="준비 시점">
          <button type="button" aria-pressed={filters.timing.length === 0} onClick={() => update({ timing: [] })}>전체</button>
          <button type="button" aria-pressed={filters.timing.includes("before_death")} onClick={() => toggle("timing", "before_death")}>생전 준비</button>
          <button type="button" aria-pressed={filters.timing.includes("after_death")} onClick={() => toggle("timing", "after_death")}>상속 발생 후</button>
        </div>
        <span className={styles.timingHint}>함께 쓰는 자료는 두 시점에서 찾을 수 있어요.</span>
      </div>
      <nav className={styles.stages} aria-label="지금 할 일">
        <button type="button" aria-pressed={!filters.stage} onClick={() => update({ stage: "" })}><span>전체</span><strong>모든 단계</strong></button>
        {STAGES.map(([id, label]) => <button type="button" key={id} aria-pressed={filters.stage === id}
          onClick={() => update({ stage: filters.stage === id ? "" : id })}><span>{id}</span><strong>{label}</strong></button>)}
      </nav>
    </section>

    <div className={styles.workspace}>
      <aside className={styles.filterRail} aria-label="자료 필터" data-open={mobileFiltersOpen}>
        <button className={styles.mobileFilterToggle} type="button" aria-expanded={mobileFiltersOpen} aria-controls="forms-filter-controls"
          onClick={() => setMobileFiltersOpen(value => !value)}><SlidersHorizontal size={18} aria-hidden="true" />조건으로 찾기
          {selectedFacetCount > 0 && <span>{selectedFacetCount}</span>}<ChevronDown size={17} aria-hidden="true" /></button>
        <div className={styles.filterPanel} id="forms-filter-controls">
          <div className={styles.filterHeading}><h2>조건으로 찾기</h2><button type="button" onClick={reset}>초기화</button></div>
          {(Object.keys(FACETS) as FacetKey[]).map(facetControls)}
          <p className={styles.filterNote}>각 항목은 여러 개 선택할 수 있어요.</p>
          <button type="button" className={styles.mobileApplyFilters} onClick={() => {
            setMobileFiltersOpen(false);
            requestAnimationFrame(() => {
              const heading = document.getElementById("documents-title");
              heading?.focus({ preventScroll: true }); heading?.scrollIntoView({ block: "start" });
            });
          }}>{filtered.length}개 자료{active && matchingPlanning.length > 0 ? ` · 준비자료 ${matchingPlanning.length}개` : ""} 보기<ArrowRight size={17} aria-hidden="true" /></button>
        </div>
      </aside>

      <section className={styles.results} aria-labelledby="documents-title">
        {filters.from === "precheck" && <p className={styles.contextNote}><Info size={16} aria-hidden="true" />상담에서 선택한 상황을 반영했습니다. 조건은 자유롭게 바꿀 수 있어요.</p>}
        <div className={styles.resultsToolbar}>
          <div><h2 id="documents-title" tabIndex={-1}>{active ? "검색 결과" : "전체 자료"}<span>{filtered.length === 0 && matchingPlanning.length > 0 ? `준비자료 ${matchingPlanning.length}개` : filtered.length}</span></h2>
            <p role="status" aria-live="polite" data-result-count>대표 자료 {filtered.length}개 · 원자료 {originalsCount}개{active ? " 일치" : " 포함"}
              {active && matchingPlanning.length > 0 ? ` · 자체 준비자료 ${matchingPlanning.length}개 별도` : ""}</p></div>
          {active && <button type="button" onClick={reset}>전체 자료 보기<X size={14} aria-hidden="true" /></button>}
        </div>
        {active && <div className={styles.appliedFilters} aria-label="적용한 조건">
          {filters.stage && <button onClick={() => update({ stage: "" })} aria-label="단계 조건 해제">{stageLabel(filters.stage)}<X size={13} aria-hidden="true" /></button>}
          {([...Object.keys(FACETS), "timing"] as (FacetKey | "timing")[]).flatMap(key => filters[key].map(value => <button key={`${key}-${value}`}
            onClick={() => toggle(key, value)} aria-label={`${key === "timing" ? TIMINGS[value] : (FACETS[key].values as Record<string, string>)[value]} 조건 해제`}>
            {key === "timing" ? TIMINGS[value] : (FACETS[key].values as Record<string, string>)[value]}<X size={13} aria-hidden="true" /></button>))}
          {filters.q && <button onClick={() => update({ q: "" })}>“{filters.q}”<X size={13} aria-hidden="true" /></button>}
        </div>}
        {planningFirst && planningResults}
        {filtered.length ? <><div className={styles.grid}>{visible.map(cardView)}</div>
          {visible.length < filtered.length && <button type="button" className={styles.loadMore}
            onClick={() => setPageLimit({ key: listKey, count: visibleCount + 18 })}>자료 더 보기<span>{visible.length} / {filtered.length}</span><ArrowDown size={18} aria-hidden="true" /></button>}
        </> : matchingPlanning.length > 0
          ? <p className={styles.planningOnly}>현재 조건에 맞는 제공처 원자료는 없습니다. 자체 준비자료 {matchingPlanning.length}개를 확인해 보세요.</p>
          : <div className={styles.empty}><Search size={29} strokeWidth={1.5} aria-hidden="true" /><h3>일치하는 자료가 없어요.</h3>
            <p>검색어를 줄이거나 선택한 조건을 해제해 보세요.</p><button type="button" onClick={reset}>전체 자료 보기</button></div>}
        {!planningFirst && planningResults}
      </section>
    </div>

    <section className={styles.planningBanner} aria-label="자체 준비자료 안내">
      <div><p>서류 작성 전, 내 상황부터 정리하고 싶다면</p><h2>가족·재산 정리부터 상담 준비까지</h2></div>
      <Link href="/forms/planning">자체 준비자료 6개 보기<ArrowRight size={18} aria-hidden="true" /></Link>
    </section>
    <div className={styles.help}><p>어떤 자료가 필요한지 아직 고민되시나요?</p><Link href="/precheck">내 상황으로 상담 시작<ArrowRight size={16} aria-hidden="true" /></Link></div>
    {archived.length > 0 && <details className={styles.archivedResources}><summary>보관 자료 {archived.length}개<ChevronDown size={15} aria-hidden="true" /></summary>
      <p>기본 목록에서 보관한 자료입니다. 기존 원본과 출처를 확인할 수 있습니다.</p>
      <ul>{archived.map(item => <li key={item.id}><a href={resourceUrl(item.id)} onClick={event => openDetail(event, item.id)}>{item.title}<ChevronRight size={14} aria-hidden="true" /></a></li>)}</ul>
    </details>}
    <footer className={styles.footer} id="forms-usage"><p>공공·민간 제공자료의 출처와 확인일은 자료 상세에서 확인하세요.<br />자체 준비자료는 상담용 점검표입니다. 제출 전 제공처의 최신 안내를 확인하세요.</p>
      <a href="/downloads/official-forms/manifest.json" target="_blank" rel="noopener noreferrer">출처·검증 기록<ExternalLink size={14} aria-hidden="true" /></a>
    </footer>

    <dialog ref={dialog} className={styles.dialog} aria-labelledby="form-preview-title"
      onCancel={event => { event.preventDefault(); closeDetail(); }} onClick={event => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDetail();
      }}>
      <div className={styles.dialogHead}><div><p>{selectedGroup ? "자료 묶음" : selected ? `${kindLabel(selected)} · ${selected.id}` : "자료 확인"}</p>
        <h2 id="form-preview-title">{selected?.title || selectedGroup?.title || "자료를 찾을 수 없어요"}</h2></div>
        <button type="button" onClick={closeDetail} aria-label="자료 상세 닫기"><X size={23} aria-hidden="true" /></button>
      </div>
      <div className={styles.dialogBody}>{selected ? <>
        {selected.resource?.presentation.visibility === "archived" && <p className={styles.contextNote}>기본 목록에서 보관한 자료입니다. 기존 원본과 출처를 확인할 수 있습니다.</p>}
        {selected.resource?.presentation.visibility === "within_parent" && <div className={styles.parentLinks}><span>함께 볼 자료</span>
          {(index.rootsByResource.get(selected.id) || []).map(id => <a key={id} href={resourceUrl(id)} onClick={event => openDetail(event, id)}>
            {index.groups.get(id)?.title || index.documents.get(id)?.title}<ChevronRight size={14} aria-hidden="true" /></a>)}
        </div>}
        <section className={styles.downloadSection} id="detail-downloads" aria-label="제공 파일과 이용 방법">
          <div className={styles.downloadHeading}><h3>{availableFiles(selected).length ? "파일 선택·다운로드" : "자료 확인하기"}</h3>
            <span>{availableFiles(selected).length ? `${availableFiles(selected).length}개 파일` : deliveryLabel(selected)}</span></div>
          <Files item={selected} />
        </section>
        <div className={styles.originBadges}><span data-origin={selected.resource?.facets.origin}>{originLabel(selected)}</span><span>{authorityLabel(selected)}</span></div>
        <p className={styles.detailDescription}>{selected.description}</p>
        {selectedUsage && <section className={styles.usageGuide} aria-label="자료 사용 안내">
          <h3>이 자료는 이렇게 사용하세요</h3>
          <dl><dt>누가 사용하나요?</dt><dd>{selectedUsage.who}</dd><dt>언제 필요한가요?</dt><dd>{selectedUsage.when}</dd></dl>
          <div className={styles.usageColumns}><div><h4>먼저 준비할 것</h4><ul>{selectedUsage.prepare.map(item => <li key={item}>{item}</li>)}</ul></div>
            <div><h4>사용 순서</h4><ol>{selectedUsage.steps.map(item => <li key={item}>{item}</li>)}</ol></div></div>
          {selectedUsage.note && <p className={styles.usageNote}>{selectedUsage.note}</p>}
          {selected.resource?.facets.timing.length === 2 && <p className={styles.timingExplanation}>생전·사후 모두 연결되는 이유: {selectedUsage.timingRationale}</p>}
        </section>}
        {guideContexts.length > 0 && <nav className={styles.relatedGuides} aria-label="이 자료를 사용하는 가이드"><h3>전체 진행 과정에서 보기</h3>
          {guideContexts.map(context => <Link key={context.href} href={context.href}><span>{context.guideTitle}<small>{context.stepTitle}</small></span><ArrowRight size={16} aria-hidden="true" /></Link>)}
        </nav>}
        {selectedPreview?.lowResolution && <p className={styles.previewNote} data-preview-resolution-note>문서에 포함된 작은 미리보기 이미지입니다. 자세한 내용은 원본 파일에서 확인해 주세요.</p>}
        <div className={styles.detailLayout}>
          {selected.thumbnail && selectedPreview && <div className={styles.detailPreview}>
            <Image src={selected.thumbnail} width={selectedPreview.width} height={selectedPreview.height}
              style={{ width: Math.min(640, selectedPreview.width), maxWidth: "100%", height: "auto" }} unoptimized
              alt={`${selected.title} · ${previewLabel(selected)} 미리보기`} />
            <p>{previewLabel(selected)}</p><a className={styles.previewImageLink} href={selected.thumbnail} target="_blank" rel="noopener noreferrer">미리보기 이미지 열기<ExternalLink size={14} aria-hidden="true" /></a>
          </div>}
          <div className={styles.detailInfo}><h3>자료 정보</h3><dl className={styles.metadata}>
            <dt>제공처</dt><dd>{selected.institution}</dd><dt>이용 방식</dt><dd>{deliveryLabel(selected)}</dd>
            <dt>서식번호</dt><dd>{selected.form_no || "기관 안내 확인"}</dd><dt>확인일</dt><dd>{selected.checkedOn || selected.checked_at?.slice(0, 10) || "확인 필요"}</dd>
            <dt>이용 조건</dt><dd>{selected.license || "제공처 안내 확인"}</dd>
          </dl>{selected.sourceUrl && <a className={styles.providerLink} href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">출처 게시물 확인<ExternalLink size={15} aria-hidden="true" /></a>}
            {selected.licenseUrl && selected.licenseUrl !== selected.sourceUrl && <a className={styles.providerLink} href={selected.licenseUrl} target="_blank" rel="noopener noreferrer">이용 조건 확인<ExternalLink size={15} aria-hidden="true" /></a>}
          </div>
        </div>
        {selected.supplementalSources?.length ? <section className={styles.supplementalSources} aria-label="함께 확인할 첨부자료"><h3>함께 확인할 첨부자료</h3>
          <p>아래 자료는 제공처의 안내에서 확인할 수 있습니다.</p><ul>{selected.supplementalSources.map(source => <li key={`${source.title}-${source.url}`}>
            <div><span>{source.origin === "private_institution" ? "민간 제공 자료" : source.origin === "official_institution" ? "공공기관 자료" : "제공자료"}</span><small>{source.institution}</small></div>
            <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}<ExternalLink size={15} aria-hidden="true" /></a><p>{source.note}</p><small>출처 확인일 {source.checkedOn}</small>
          </li>)}</ul>
        </section> : null}
        <details className={styles.verification}><summary>자료 확인 내용<ChevronDown size={16} aria-hidden="true" /></summary>
          <p>{selected.verification}</p>{selected.exampleVerification && <p>{selected.exampleVerification}</p>}
          {selected.primaryArtifactType === "derived-image-compilation" && <p>기관 웹 사례의 이미지·본문을 묶은 사이트 변환본입니다.</p>}
          {selected.resource?.classification?.status !== "verified" && selected.resource?.classification?.note && <p>분류 검토: {selected.resource.classification.note}</p>}
        </details>
        {selected.resource?.planning_windows?.map((window, position) => <section className={styles.planningWindow} key={position}>
          <h3>{window.label}</h3><p>{window.verification.status === "verified" ? "준비 시 고려할 조건" : "조건 확인 필요"}</p>
          <ul>{window.availability_conditions.map(value => <li key={value}>{value}</li>)}</ul>
          {window.closing_events.length > 0 && <p>준비 가능성·효과가 달라지는 계기: {window.closing_events.join(" · ")}</p>}<small>개인별 마감일을 의미하지 않습니다.</small>
        </section>)}
        {(() => { const card = index.cards.find(item => item.id === selected.id); return card ? members(card, true, "detail") : null; })()}
      </> : selectedGroup ? <><p className={styles.detailDescription}>제공처와 상황별로 자료를 비교해 선택하세요. 각 자료의 신청 대상과 제출 절차는 개별로 확인합니다.</p>
        {members({ ...selectedGroup, matchedIds: [] }, true, "detail")}</> : <div className={styles.empty}><p>주소의 자료 ID를 확인하거나 전체 목록에서 다시 찾아보세요.</p><button onClick={reset}>전체 자료 보기</button></div>}</div>
      <div className={styles.dialogFooter}>
        <button className={styles.dialogBack} type="button" onClick={closeDetail}>목록으로</button>
        {selected ? <button className={styles.dialogPrimary} type="button" onClick={() => {
          const target = dialog.current?.querySelector<HTMLElement>("#detail-downloads");
          target?.scrollIntoView({ block: "start" }); target?.querySelector<HTMLAnchorElement>("a[href]")?.focus();
        }}>{availableFiles(selected).length ? "파일 선택·다운로드" : "제공처 확인"}<Download size={17} aria-hidden="true" /></button>
          : <button className={styles.dialogPrimary} type="button" onClick={closeDetail}>목록으로 돌아가기<ArrowRight size={17} aria-hidden="true" /></button>}
      </div>
    </dialog>
  </main>;
}
