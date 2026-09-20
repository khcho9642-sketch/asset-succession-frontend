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
  const selectedPreview = selected ? documentPreview(selected) : null;
  const selectedGroup = index.cards.find(card => card.id === filters.resource && card.group);
  const isDetailOpen = Boolean(filters.resource);
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const priorFocus = useRef<HTMLElement | null>(null);
  const active = hasFilters(filters);
  const archived = documents.filter(item => item.resource?.presentation.visibility === "archived");
  const originalsCount = new Set(filtered.flatMap(card => card.matchedIds)).size;
  const legacyFileCount = documents.filter(item => !item.task_id && item.delivery === "hosted").reduce((sum, item) => sum + item.files.length, 0);
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

  function resourceLink(item: LibraryDocument) {
    return <a href={resourceUrl(item.id)} onClick={event => openDetail(event, item.id)}>{item.title}<ChevronRight size={14} aria-hidden="true" /></a>;
  }
  function members(card: CatalogCard, expanded = false) {
    const children = card.resources.filter(item => item.id !== card.document?.id);
    if (!children.length) return null;
    const matched = new Set(card.matchedIds);
    const sorted = [...children].sort((a, b) => Number(matched.has(b.id)) - Number(matched.has(a.id)));
    const sections = [...new Set(sorted.map(relationLabel))];
    return <details className={styles.members} open={expanded || undefined} key={`${card.id}-${active ? listKey : "closed"}`}>
      <summary>{card.group ? `선택할 자료 ${children.length}개` : `부표·사례·참고 ${children.length}개`}<ChevronDown size={15} aria-hidden="true" /></summary>
      {sections.map(section => <div className={styles.memberSection} key={section}><p>{section}</p><ul>{sorted.filter(item => relationLabel(item) === section).map(item => <li key={item.id} data-matched={active && matched.has(item.id) ? "true" : undefined}>
        {active && matched.has(item.id) && <span className={styles.matchTag}><Check size={11} aria-hidden="true" />조건 일치</span>}{resourceLink(item)}<FileAction item={item} />
      </li>)}</ul></div>)}
    </details>;
  }
  function cardView(card: CatalogCard) {
    const representative = card.document || card.resources.find(item => card.matchedIds.includes(item.id) && documentPreview(item)) || card.resources.find(item => documentPreview(item)) || card.resources[0];
    const imagePreview = documentPreview(representative);
    const formats = [...new Set(card.resources.flatMap(item => availableFiles(item).map(file => file.format)))];
    const childHit = active && card.matchedIds.some(id => id !== card.document?.id);
    return <article className={styles.card} key={card.id} data-form-id={card.id}>
      <div className={styles.cardTop}><span>{card.stage} · {stageLabel(card.stage)}</span><span>{card.group ? `${card.group.member_resource_ids.length}개 자료 묶음` : kindLabel(representative)}</span></div>
      <a className={styles.visual} href={resourceUrl(card.id)} onClick={event => openDetail(event, card.id)} aria-label={`${card.title} 자료 상세`} data-form-preview>
        {representative.thumbnail && imagePreview ? <><Image className={styles.thumbnail} src={representative.thumbnail} width={imagePreview.width} height={imagePreview.height} style={{ maxWidth: imagePreview.width }} unoptimized alt={`${representative.title} · ${previewLabel(representative)} 미리보기`} /><span className={styles.previewTag}>{previewLabel(representative)}</span></> : <span className={styles.providerVisual}>{card.group ? <FolderOpen size={33} strokeWidth={1.15} aria-hidden="true" /> : <FileText size={33} strokeWidth={1.15} aria-hidden="true" />}<span>{card.group ? "상황에 맞는 자료를 선택하세요" : representative.institution}</span></span>}
        <span className={styles.previewOpen}>자료 살펴보기<ArrowRight size={13} aria-hidden="true" /></span>
      </a>
      <div className={styles.cardCopy}><h3><a href={resourceUrl(card.id)} onClick={event => openDetail(event, card.id)}>{card.title}</a></h3><p>{card.group ? "기관·상황별 자료를 한곳에 모았습니다. 필요한 자료를 골라 확인하세요." : representative.description}</p>
        <div className={styles.cardMeta}><span>{card.group ? "각 자료의 적용 조건 확인" : deliveryLabel(representative)}</span><span>{formats.length ? formats.join(" · ") : "기관 안내"}</span></div>
      </div>
      <div className={styles.cardActions}><a className={styles.detailAction} href={resourceUrl(card.id)} onClick={event => openDetail(event, card.id)}>자료 상세<ArrowRight size={14} aria-hidden="true" /></a>{!card.group && <FileAction item={representative} />}</div>
      {members(card, childHit)}
    </article>;
  }
  const facetControls = (key: FacetKey) => <fieldset className={styles.facet} key={key}><legend>{FACETS[key].label}</legend><div>{Object.entries(FACETS[key].values).map(([value, label]) => <button type="button" key={value} aria-pressed={filters[key].includes(value)} onClick={() => toggle(key, value)}>{label}{filters[key].includes(value) && <Check size={12} aria-hidden="true" />}</button>)}</div></fieldset>;

  return <main className={styles.library} id="forms-library" data-forms-library="stages-v2">
    <nav className={styles.breadcrumb} aria-label="현재 위치"><Link href="/">홈</Link><ChevronRight size={12} aria-hidden="true" /><span aria-current="page">서류양식</span></nav>
    <header className={styles.hero}><div><p className={styles.eyebrow}>자산승계 360 · 서류 자료실</p><h1>준비는 가볍게,<br />결정은 차근차근.</h1><p className={styles.description}>재산을 정리하는 첫걸음부터, 필요한 서류까지.<br />지금 하려는 일에 맞춰 살펴보세요.</p><p className={styles.catalogSummary} data-catalog-summary><strong>{index.cards.length}개 대표 자료</strong><span>원자료 {documents.length}개 · 생전 준비자료 6개 별도</span></p></div>
      <aside className={styles.bundle} data-forms-bundle><p className={styles.bundleOverline}>기존 기관 원본 묶음</p><p className={styles.bundleCount}><strong>74</strong>개 자료</p><p className={styles.bundleDescription}>원본·예시·형식별 파일 {legacyFileCount}개</p><a href="/downloads/official-forms/official-forms.zip" download className={styles.bundleButton} data-bundle-download>기존 자료 한번에 받기<Download size={16} aria-hidden="true" /></a><p className={styles.bundleExclusions}>추가 자료는 아래 목록에서 개별 확인할 수 있습니다.</p></aside>
    </header>
    {!active && <section className={styles.planning} aria-label="생전 준비자료"><div className={styles.planningHeading}><div><span className={styles.eyebrow}>미리 준비하는 승계</span><h2>서류를 쓰기 전, 먼저 정리해 보세요.</h2></div><Link href="/forms/planning">준비자료 6개 모두 보기<ArrowRight size={14} aria-hidden="true" /></Link></div><div className={styles.planningLinks}>
      {[['PLAN-01', '01', '가족·재산 정리', '누구에게, 무엇을 남길지'], ['PLAN-03', '02', '이전 방법 비교', '상속·증여·매각의 차이'], ['PLAN-04', '03', '생활비·납부재원', '남겨 둘 돈과 필요한 돈']].map(([id, number, title, note]) => <Link key={id} href={`/forms/planning/${id}`}><span>{number}</span><div><strong>{title}</strong><small>{note}</small></div><ArrowRight size={16} aria-hidden="true" /></Link>)}
    </div><div className={styles.afterDeath}><span>상속이 이미 발생했나요?</span><a href="/forms?purpose=inheritance&timing=after_death" onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigate({ ...emptyFilters(), purpose: ["inheritance"], timing: ["after_death"] }); document.getElementById("documents-title")?.scrollIntoView({ block: "start" }); }}>필요한 서류 바로 찾기<ArrowRight size={14} aria-hidden="true" /></a></div></section>}
    <section className={styles.section} aria-labelledby="documents-title"><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>지금 필요한 자료</p><h2 id="documents-title">어떤 일을 준비하시나요?</h2></div><label className={styles.search}><Search size={19} aria-hidden="true" /><span className={styles.srOnly}>서류명·용도로 찾기</span><input ref={search} type="search" value={filters.q} onChange={event => update({ q: event.target.value }, true)} placeholder="서류명·용도·기관으로 검색" maxLength={100} autoComplete="off" /></label></div>
      <nav className={styles.stages} aria-label="지금 할 일"><button type="button" aria-pressed={!filters.stage} onClick={() => update({ stage: "" })}><span>ALL</span>전체 단계</button>{STAGES.map(([id, label]) => <button type="button" key={id} aria-pressed={filters.stage === id} onClick={() => update({ stage: filters.stage === id ? "" : id })}><span>{id}</span>{label}</button>)}</nav>
      <div className={styles.filters}>{facetControls("purpose")}<details className={styles.moreFilters}><summary><SlidersHorizontal size={15} aria-hidden="true" />자산·자료 유형·이용 방식{filters.asset.length + filters.kind.length + filters.delivery.length + filters.timing.length > 0 ? <b>{filters.asset.length + filters.kind.length + filters.delivery.length + filters.timing.length}</b> : null}<ChevronDown size={14} aria-hidden="true" /></summary><div>{(["asset", "kind", "delivery"] as FacetKey[]).map(facetControls)}<fieldset className={styles.facet}><legend>시점</legend><div>{Object.entries(TIMINGS).map(([value, label]) => <button type="button" key={value} aria-pressed={filters.timing.includes(value)} onClick={() => toggle("timing", value)}>{label}</button>)}</div></fieldset><p className={styles.filterNote}>같은 항목에서 여러 개를 고르면 하나만 맞아도, 다른 항목끼리는 모두 맞는 자료를 보여줍니다.</p></div></details></div>
      {filters.from === "precheck" && <p className={styles.contextNote}><Info size={15} aria-hidden="true" />상담에서 선택한 상황을 반영했습니다. 조건은 언제든 바꿀 수 있어요.</p>}
      {active && <div className={styles.appliedFilters} aria-label="적용한 조건">{filters.stage && <button onClick={() => update({ stage: "" })} aria-label="단계 조건 해제">{stageLabel(filters.stage)}<X size={12} aria-hidden="true" /></button>}{([...Object.keys(FACETS), "timing"] as (FacetKey | "timing")[]).flatMap(key => filters[key].map(value => <button key={`${key}-${value}`} onClick={() => toggle(key, value)} aria-label={`${key === "timing" ? TIMINGS[value] : (FACETS[key].values as Record<string, string>)[value]} 조건 해제`}>{key === "timing" ? TIMINGS[value] : (FACETS[key].values as Record<string, string>)[value]}<X size={12} aria-hidden="true" /></button>))}{filters.q && <button onClick={() => update({ q: "" })}>“{filters.q}”<X size={12} aria-hidden="true" /></button>}</div>}
      <div className={styles.resultsToolbar}><p role="status" aria-live="polite" data-result-count><strong>{filtered.length}개 대표 자료</strong><span>원자료 {originalsCount}개{active ? " 일치" : " 포함"}{active ? ` · 자체 준비자료 ${matchingPlanning.length}개 별도` : ""}</span></p><button type="button" onClick={reset}>전체 자료 보기{active && <X size={13} aria-hidden="true" />}</button></div>
      {active && matchingPlanning.length > 0 && <section className={styles.planningResults} aria-label="조건에 맞는 자체 준비자료"><div><h3>자체 준비자료 <span>{matchingPlanning.length}개</span></h3><p>자산승계 360이 만든 상담 준비자료입니다. 원자료 목록과 별도로 제공합니다.</p></div><div className={styles.planningResultGrid}>{matchingPlanning.map(item => <Link href={`/forms/planning/${item.id}`} key={item.id}><span>{stageLabel(item.primary_stage_id)} · {(FACETS.kind.values as Record<string, string>)[item.facets.kind]}</span><strong>{item.title}</strong><p>{item.description}</p><small>화면에서 정리하기<ArrowRight size={14} aria-hidden="true" /></small></Link>)}</div></section>}
      {filtered.length ? <><div className={styles.grid}>{visible.map(cardView)}</div>{visible.length < filtered.length && <button type="button" className={styles.loadMore} onClick={() => setPageLimit({ key: listKey, count: visibleCount + 18 })}>자료 더 보기 <span>{visible.length} / {filtered.length}</span><ArrowDown size={16} aria-hidden="true" /></button>}</> : matchingPlanning.length > 0 ? <p className={styles.planningOnly}>현재 조건에 맞는 공공·민간 원자료는 없습니다. 위의 자체 준비자료 {matchingPlanning.length}개를 살펴보세요.</p> : <div className={styles.empty}><Search size={27} aria-hidden="true" /><h3>일치하는 자료가 없어요.</h3><p>검색어를 줄이거나 적용한 조건을 해제해 보세요.</p>{filters.stage === "S2" && <Link href="/forms/planning">방법·재원을 정리하는 준비자료 보기<ArrowRight size={15} aria-hidden="true" /></Link>}<button type="button" onClick={reset}>전체 자료 보기</button></div>}
    </section>
    <section className={styles.help}><div><h2>정리한 내용을 바탕으로,<br />다음 선택을 함께 살펴보세요.</h2><p>가족·재산·준비 상황부터 차근차근 확인합니다.</p></div><Link href="/precheck">내 상황으로 상담 시작<ArrowRight size={18} aria-hidden="true" /></Link></section>
    {archived.length > 0 && <details className={styles.archivedResources}><summary>보관 자료 {archived.length}개<ChevronDown size={14} aria-hidden="true" /></summary><p>기본 목록에서 보관한 자료입니다. 기존 원본과 출처를 확인할 수 있습니다.</p><ul>{archived.map(item => <li key={item.id}><a href={resourceUrl(item.id)} onClick={event => openDetail(event, item.id)}>{item.title}<ChevronRight size={13} aria-hidden="true" /></a></li>)}</ul></details>}
    <footer className={styles.footer} id="forms-usage"><p>공공·민간 제공자료의 출처·확인일은 자료 상세에 표시합니다.<br />자체 준비자료는 상담을 위한 점검표입니다. 제출 전 기관의 최신 안내를 확인하세요.</p><a href="/downloads/official-forms/manifest.json" target="_blank" rel="noopener noreferrer">출처·검증 기록<ExternalLink size={12} aria-hidden="true" /></a></footer>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="form-preview-title" onCancel={event => { event.preventDefault(); closeDetail(); }} onClick={event => { if (event.target !== event.currentTarget) return; const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDetail(); }}>
      <div className={styles.dialogHead}><div><p className={styles.eyebrow}>{selectedGroup ? "자료 묶음" : selected ? `${kindLabel(selected)} · ${selected.id}` : "자료 확인"}</p><h2 id="form-preview-title">{selected?.title || selectedGroup?.title || "자료를 찾을 수 없어요"}</h2></div><button type="button" onClick={closeDetail} aria-label="자료 상세 닫기"><X size={22} aria-hidden="true" /></button></div>
      <div className={styles.dialogBody}>{selected ? <>
        {selected.resource?.presentation.visibility === "archived" && <p className={styles.contextNote}>기본 목록에서 보관한 자료입니다. 기존 원본과 출처를 확인할 수 있습니다.</p>}
        {selected.resource?.presentation.visibility === "within_parent" && <div className={styles.parentLinks}><span>함께 볼 자료</span>{(index.rootsByResource.get(selected.id) || []).map(id => <a key={id} href={resourceUrl(id)} onClick={event => openDetail(event, id)}>{index.groups.get(id)?.title || index.documents.get(id)?.title}<ChevronRight size={13} aria-hidden="true" /></a>)}</div>}
        <div className={styles.originBadges}><span data-origin={selected.resource?.facets.origin}>{originLabel(selected)}</span><span>{authorityLabel(selected)}</span></div><p className={styles.detailDescription}>{selected.description}</p>{selectedPreview?.lowResolution && <p className={styles.previewNote} data-preview-resolution-note>문서에 포함된 작은 미리보기 이미지입니다. 자세한 내용은 원본 파일에서 확인해 주세요.</p>}<div className={styles.detailLayout}>{selected.thumbnail && selectedPreview && <div className={styles.detailPreview}><Image src={selected.thumbnail} width={selectedPreview.width} height={selectedPreview.height} style={{ width: Math.min(640, selectedPreview.width), maxWidth: "100%", height: "auto" }} unoptimized alt={`${selected.title} · ${previewLabel(selected)} 미리보기`} /><p>{previewLabel(selected)}</p><a className={styles.previewImageLink} href={selected.thumbnail} target="_blank" rel="noopener noreferrer">미리보기 이미지 열기<ExternalLink size={12} aria-hidden="true" /></a></div>}<div className={styles.detailInfo}><h3>받을 수 있는 파일</h3><Files item={selected} /><dl className={styles.metadata}><dt>제공처</dt><dd>{selected.institution}</dd><dt>이용 방식</dt><dd>{deliveryLabel(selected)}</dd><dt>서식번호</dt><dd>{selected.form_no || "기관 안내 확인"}</dd><dt>확인일</dt><dd>{selected.checkedOn || selected.checked_at?.slice(0, 10) || "확인 필요"}</dd><dt>이용 조건</dt><dd>{selected.license || "제공처 안내 확인"}</dd></dl>{selected.sourceUrl && <a className={styles.providerLink} href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">출처 게시물 확인<ExternalLink size={14} aria-hidden="true" /></a>}{selected.licenseUrl && selected.licenseUrl !== selected.sourceUrl && <a className={styles.providerLink} href={selected.licenseUrl} target="_blank" rel="noopener noreferrer">이용 조건 확인<ExternalLink size={14} aria-hidden="true" /></a>}</div></div>
        {selected.supplementalSources?.length ? <section className={styles.supplementalSources} aria-label="함께 확인할 첨부자료"><h3>함께 확인할 첨부자료</h3><p>아래 자료는 제공처의 안내에서 확인할 수 있습니다.</p><ul>{selected.supplementalSources.map(source => <li key={`${source.title}-${source.url}`}><div><span>{source.origin === "private_institution" ? "민간 제공 자료" : source.origin === "official_institution" ? "공공기관 자료" : "제공자료"}</span><small>{source.institution}</small></div><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}<ExternalLink size={14} aria-hidden="true" /></a><p>{source.note}</p><small>출처 확인일 {source.checkedOn}</small></li>)}</ul></section> : null}
        <details className={styles.verification}><summary>자료 확인 내용<ChevronDown size={14} aria-hidden="true" /></summary><p>{selected.verification}</p>{selected.exampleVerification && <p>{selected.exampleVerification}</p>}{selected.primaryArtifactType === "derived-image-compilation" && <p>기관 웹 사례의 이미지·본문을 묶은 사이트 변환본입니다.</p>}{selected.resource?.classification?.status !== "verified" && selected.resource?.classification?.note && <p>분류 검토: {selected.resource.classification.note}</p>}</details>
        {selected.resource?.planning_windows?.map((window, position) => <section className={styles.planningWindow} key={position}><h3>{window.label}</h3><p>{window.verification.status === "verified" ? "준비 시 고려할 조건" : "조건 확인 필요"}</p><ul>{window.availability_conditions.map(value => <li key={value}>{value}</li>)}</ul>{window.closing_events.length > 0 && <p>준비 가능성·효과가 달라지는 계기: {window.closing_events.join(" · ")}</p>}<small>개인별 마감일을 의미하지 않습니다.</small></section>)}
        {(() => { const card = index.cards.find(item => item.id === selected.id); return card ? members(card, true) : null; })()}
      </> : selectedGroup ? <><p className={styles.detailDescription}>제공처와 상황별로 자료를 비교해 선택하세요. 각 자료의 신청 대상과 제출 절차는 개별로 확인합니다.</p>{members({ ...selectedGroup, matchedIds: [] }, true)}</> : <div className={styles.empty}><p>주소의 자료 ID를 확인하거나 전체 목록에서 다시 찾아보세요.</p><button onClick={reset}>전체 자료 보기</button></div>}</div>
      <div className={styles.dialogFooter}><span>{selected ? selected.institution : "제공처별 원본과 안내"}</span><button onClick={closeDetail}>목록으로 돌아가기<ArrowRight size={14} aria-hidden="true" /></button></div>
    </dialog>
  </main>;
}
