"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, Check, ChevronDown, ChevronRight, Download, ExternalLink, Info, Search, SlidersHorizontal, X, Landmark, BookOpen } from "lucide-react";
import {
  availableFiles, authorityLabel, catalogUrl, emptyFilters, FACETS, filterCatalog, hasFilters, originLabel, providerLabel,
  parseCatalogFilters, resourceUrl, STAGES, TIMINGS, USE_CATEGORIES, useCategory, isPublicResource,
  type CatalogCard, type CatalogFilters, type FacetKey, type LibraryDocument, type PresentationGroup,
} from "@/lib/forms/catalog";
import { buildIndividualCatalog, legacyGroupDocuments, relatedDocuments } from "@/lib/forms/individual-catalog";
import styles from "./FormsLibrary.module.css";
import { DocumentPreview, PreviewThumbnail } from "./DocumentPreview";
import { resolvePreview } from "@/lib/forms/preview";
import { guidesForResource } from "@/lib/forms/guides";
import { getResourceUsage } from "@/lib/forms/resource-usage";
import { SERVICE_CONTEXTS, serviceContexts, detailServiceContexts, preferredProviderContext } from "@/lib/forms/library-editorial";
import { LookupServices } from "./guides/LookupServices";
import { GuideEntrances } from "./GuideEntrances";
export type { LibraryDocument } from "@/lib/forms/catalog";

type Props = { documents: LibraryDocument[]; groups: PresentationGroup[] };
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
const fileRole = (role: string) => ({ original: "원본", example: "작성 예시", extracted: "원본 페이지 발췌", combined: "양식·설명 합본", "image-compilation": "웹 사례 변환본", "web-example-image": "기관 사례 이미지" }[role] || "제공 파일");
const providerActionLabel = (item: LibraryDocument) => item.primaryAction?.label || (useCategory(item) === "service" ? "제공처 이용 안내" : useCategory(item) === "guide" ? "안내 보기" : item.resource?.facets.origin === "official_institution" ? "공식 서식 목록 열기" : "제공처 서식 열기");

function Files({ item }: { item: LibraryDocument }) {
  const files = availableFiles(item);
  if (!files.length) return item.sourceUrl ? <a className={styles.providerLink} href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{providerLabel(item)}에서 확인<ExternalLink size={14} aria-hidden="true" /></a> : <p className={styles.muted}>제공 파일을 확인하고 있습니다.</p>;
  return <ul className={styles.fileList} aria-label={`${item.title} 제공 파일`}>{files.map(file => <li key={file.path}>
    <a href={file.path} download={file.delivery === "hosted"} target={file.delivery === "hosted" ? undefined : "_blank"} rel="noopener noreferrer" data-file-download>
      <span className={styles.fileFormat}>{file.format}</span><span>{file.name}<small>{fileRole(file.role)}{file.delivery === "hosted" ? "" : " · 공식 파일 (새 창)"}{file.bytes > 0 ? ` · ${Math.ceil(file.bytes / 1024).toLocaleString("ko-KR")} KB` : ""}</small></span>{file.delivery === "hosted" ? <Download size={15} aria-hidden="true" /> : <ExternalLink size={15} aria-hidden="true" />}
    </a>
  </li>)}</ul>;
}
function FileAction({ item, onOpen }: { item: LibraryDocument; onOpen?: (event: MouseEvent<HTMLAnchorElement>, id: string) => void }) {
  const files = availableFiles(item);
  if (SERVICE_CONTEXTS[item.id] || item.providerRoutes?.length) return <a className={styles.fileAction} href={resourceUrl(item.id)} onClick={event => onOpen?.(event, item.id)}>{item.providerRoutes ? useCategory(item) === "service" ? "발급 안내" : "은행별 안내" : "조회·발급 안내"}<ArrowRight size={14} aria-hidden="true" /></a>;
  if (useCategory(item) === "service" || !files.length) return item.sourceUrl ? <a className={styles.fileAction} href={item.primaryAction?.url || item.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`${item.title} ${providerActionLabel(item)} (새 창)`}>{providerActionLabel(item)}<ExternalLink size={14} aria-hidden="true" /></a> : <span className={styles.unavailable}>제공처 확인 필요</span>;
  if (useCategory(item) === "guide") return <a className={styles.fileAction} href={resourceUrl(item.id)} onClick={event => onOpen?.(event, item.id)}>안내 보기<BookOpen size={14} aria-hidden="true" /></a>;
  if (files.length === 1) return <a className={styles.fileAction} href={files[0].path} download={files[0].delivery === "hosted"} target={files[0].delivery === "hosted" ? undefined : "_blank"} rel="noopener noreferrer" aria-label={`${item.title} ${files[0].format} ${fileRole(files[0].role)} ${files[0].delivery === "hosted" ? "받기" : "공식 파일 열기 (새 창)"}`} data-form-download>{item.institutionKind === "은행 지정 서식" ? `${item.institution} 공식 ${files[0].format} ${files[0].format === "PDF" ? "열기" : "받기"}` : `${files[0].format} ${files[0].delivery === "hosted" ? "받기" : "열기"}`}{files[0].delivery === "hosted" ? <Download size={14} aria-hidden="true" /> : <ExternalLink size={14} aria-hidden="true" />}</a>;
  return <details className={styles.filePicker}><summary aria-label={`${item.title} 파일 형식 선택`}>형식·파일 선택<ChevronDown size={14} aria-hidden="true" /></summary><Files item={item} /></details>;
}

export function FormsLibrary({ documents, groups }: Props) {
  const urlSearch = useSyncExternalStore(subscribeUrl, snapshot, serverSnapshot);
  const filters = useMemo(() => parseCatalogFilters(urlSearch), [urlSearch]);
  const index = useMemo(() => buildIndividualCatalog(documents, groups), [documents, groups]);
  const filtered = useMemo(() => filterCatalog(index, filters), [index, filters]);
  const [pageLimit, setPageLimit] = useState({ key: "", count: 18 });
  const listKey = catalogUrl({ ...filters, resource: "" });
  const visibleCount = pageLimit.key === listKey ? pageLimit.count : 18;
  const visible = filtered.slice(0, visibleCount);
  const selected = index.documents.get(filters.resource);
  const selectedContexts = detailServiceContexts(selected?.id || "", filters.timing);
  const preferredApplicant = preferredProviderContext(filters.timing, filters.guide);
  const selectedUsage = selected && !SERVICE_CONTEXTS[selected.id] ? selected.usage || getResourceUsage(selected.id) : undefined;
  const related = selected ? relatedDocuments(index, selected.id) : [];
  const guideContexts = selected && isPublicResource(selected) ? guidesForResource(selected.id, selected.resource) : [];
  const legacyGroup = !selected ? index.groups.get(filters.resource) : undefined;
  const legacyItems = legacyGroup ? legacyGroupDocuments(index, legacyGroup.id) : [];
  const isDetailOpen = Boolean(filters.resource);
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const facetElements = useRef<Partial<Record<FacetKey, HTMLDetailsElement | null>>>({});
  const priorFocus = useRef<HTMLElement | null>(null);
  const priorScroll = useRef<number | null>(null);
  const active = hasFilters(filters);
  const archived = documents.filter(item => item.resource?.presentation.visibility === "archived");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const selectedFacetCount = filters.purpose.length + filters.asset.length + filters.kind.length + filters.timing.length + Number(Boolean(filters.stage));
  const selectedFacetKeys = (Object.keys(FACETS) as FacetKey[]).filter(key => filters[key].length > 0).join(",");
  function navigate(next: CatalogFilters, replace = false) {
    const href = catalogUrl(next);
    if (`${window.location.pathname}${window.location.search}` !== href) window.history[replace ? "replaceState" : "pushState"](null, "", href);
    window.dispatchEvent(new Event(URL_EVENT));
  }
  function update(patch: Partial<CatalogFilters>, replace = false) { navigate({ ...filters, resource: "", ...patch }, replace); }
  function openDetail(event: MouseEvent<HTMLAnchorElement>, id: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); if (!filters.resource) { priorFocus.current = event.currentTarget; priorScroll.current = window.scrollY; }
    navigate({ ...filters, resource: id });
  }
  function closeDetail() {
    if (filters.guide) { window.location.assign(`/forms/guides/${filters.guide}${filters.step ? `#${filters.step}` : ""}`); return; }
    navigate({ ...filters, resource: "" });
  }
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
    return () => { if (element.open) element.close(); document.documentElement.style.overflow = oldOverflow; priorFocus.current?.focus({ preventScroll: true }); if (priorScroll.current !== null) window.scrollTo(0, priorScroll.current); };
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

  function cardView(card: CatalogCard) {
    const item = card.document;
    if (!item) return null;
    const formats = [...new Set(availableFiles(item).map(file => file.format))];
    const preview = resolvePreview(item);
    const detailLabel = preview.kind === "provider" ? "이용 안내" : preview.kind === "pending" ? "자료 상세" : "미리보기";
    return <article className={styles.card} key={item.id} data-form-id={item.id} data-card-kind="document">
      <div className={styles.cardBody}>
        <a className={styles.visual} href={resourceUrl(item.id)} onClick={event => openDetail(event, item.id)}
          aria-label={`${item.title} 자료 상세`} data-form-preview>
          {preview.kind === "provider" && (useCategory(item) !== "form" || item.institutionKind === "은행 지정 서식") ? <span className={styles.serviceVisual}>{useCategory(item) === "service" || item.institutionKind === "은행 지정 서식" ? <Landmark size={30} aria-hidden="true" /> : <BookOpen size={30} aria-hidden="true" />}<span>{item.institutionKind === "은행 지정 서식" ? "은행 서식" : USE_CATEGORIES[useCategory(item)]}</span></span> : <PreviewThumbnail item={item} key={item.id} />}
        </a>
        <div className={styles.cardCopy}>
          <p className={styles.cardCategory}>{kindLabel(item)}<span>·</span>{stageLabel(card.stage)}</p>
          <h3><a href={resourceUrl(item.id)} onClick={event => openDetail(event, item.id)}>{item.title}</a></h3>
          <p className={styles.cardDescription}>{describe(item)}</p>
        </div>
      </div>
      <div className={styles.cardMeta}>
        <span>{item.providerScope || item.institution || "제공처 확인"}</span>
        <span>{formats.length ? formats.join(" · ") : "제공처 안내"}</span>
      </div>
      <div className={styles.cardActions}>
        {!SERVICE_CONTEXTS[item.id] && !item.providerRoutes?.length && !(useCategory(item) === "guide" && availableFiles(item).length) && <a className={styles.detailAction} href={resourceUrl(item.id)} onClick={event => openDetail(event, item.id)}>{detailLabel}<ArrowRight size={16} aria-hidden="true" /></a>}
        <FileAction item={item} onOpen={openDetail} />
      </div>
    </article>;
  }

  function describe(item: LibraryDocument) {
    const contexts = serviceContexts(item.id, filters.timing);
    return contexts.length ? contexts.map(context => `${context.timing === "before-death" ? "생전" : "상속 후"}: ${context.service.purpose}`).join(" ") : item.description;
  }

  function facetControls(key: FacetKey) {
    return <details className={styles.facet} key={key} ref={element => { facetElements.current[key] = element; }} open={key === "purpose" || undefined}>
      <summary>{FACETS[key].label}{filters[key].length > 0 && <span className={styles.facetCount}>{filters[key].length}</span>}<ChevronDown size={16} aria-hidden="true" /></summary>
      <div className={styles.facetOptions} role="group" aria-label={FACETS[key].label}>
        {Object.entries(FACETS[key].values).filter(([value]) => (key !== "asset" || index.cards.some(card => card.document?.resource?.facets.assets.includes(value))) && (key !== "kind" || !filters.use || index.cards.some(card => card.document && useCategory(card.document) === filters.use && card.document.resource?.facets.kind === value))).map(([value, label]) => <button type="button" key={value}
          aria-pressed={filters[key].includes(value)} onClick={() => toggle(key, value)}>
          <span className={styles.checkbox} aria-hidden="true">{filters[key].includes(value) && <Check size={13} strokeWidth={2.5} />}</span>{label}
        </button>)}
      </div>
    </details>;
  }

  return <main className={styles.library} id="forms-library" data-forms-library="individual-v3">
    <nav className={styles.breadcrumb} aria-label="현재 위치"><Link href="/">홈</Link><ChevronRight size={13} aria-hidden="true" /><span aria-current="page">서류양식</span></nav>
    <header className={styles.header}>
      <div><h1>서류 자료실</h1><p>필요한 자료를 찾고, 조회·발급·작성 방법을 확인하세요.</p></div>
    </header>
    <GuideEntrances />
    <section className={styles.searchWorkspace} aria-label="자료 검색과 단계 선택">
      <div className={styles.searchRow}>
        <label className={styles.search}><Search size={23} strokeWidth={1.8} aria-hidden="true" />
          <span className={styles.srOnly}>서류명·하고 싶은 일·기관으로 검색</span><input ref={search} type="search" value={filters.q}
            onChange={event => update({ q: event.target.value }, true)} placeholder="서류명·하고 싶은 일·기관으로 검색" maxLength={100} autoComplete="off" />
        </label>
      </div>
    </section>
    <div className={styles.useTabs} role="group" aria-label="이용 구분">
      {Object.entries({ "": "전체", ...USE_CATEGORIES }).map(([value, label]) => <button key={value} type="button" aria-pressed={(filters.use || "") === value} onClick={() => update({ use: value, kind: [], delivery: [] })}>{label}</button>)}
    </div>
    <div className={styles.timingRow}><span>준비 시점</span><div className={styles.timing} role="group" aria-label="준비 시점">
      <button type="button" aria-pressed={!filters.timing.length} onClick={() => update({ timing: [] })}>전체</button>
      <button type="button" aria-pressed={filters.timing.includes("before_death")} onClick={() => toggle("timing", "before_death")}>생전</button>
      <button type="button" aria-pressed={filters.timing.includes("after_death")} onClick={() => toggle("timing", "after_death")}>사후</button>
    </div></div>

    <div className={styles.workspace}>
      <aside className={styles.filterRail} aria-label="자료 필터" data-open={mobileFiltersOpen}>
        <button className={styles.mobileFilterToggle} type="button" aria-expanded={mobileFiltersOpen} aria-controls="forms-filter-controls"
          onClick={() => setMobileFiltersOpen(value => !value)}><SlidersHorizontal size={18} aria-hidden="true" />조건으로 찾기
          {selectedFacetCount > 0 && <span>{selectedFacetCount}</span>}<ChevronDown size={17} aria-hidden="true" /></button>
        <div className={styles.filterPanel} id="forms-filter-controls">
          <div className={styles.filterHeading}><h2>조건으로 찾기</h2><button type="button" onClick={reset}>초기화</button></div>
          {(["purpose", "asset", "kind"] as FacetKey[]).map(facetControls)}
          <details className={styles.facet}><summary>업무로 찾기<ChevronDown size={16} aria-hidden="true" /></summary><div className={styles.facetOptions} role="group" aria-label="업무로 찾기">{STAGES.map(([id, label]) => <button type="button" key={id} aria-pressed={filters.stage === id} onClick={() => update({ stage: filters.stage === id ? "" : id })}>{id} · {label}</button>)}</div></details>
          <p className={styles.filterNote}>각 항목은 여러 개 선택할 수 있어요.</p>
          <button type="button" className={styles.mobileApplyFilters} onClick={() => {
            setMobileFiltersOpen(false);
            requestAnimationFrame(() => {
              const heading = document.getElementById("documents-title");
              heading?.focus({ preventScroll: true }); heading?.scrollIntoView({ block: "start" });
            });
          }}>{filtered.length}개 자료 보기<ArrowRight size={17} aria-hidden="true" /></button>
        </div>
      </aside>

      <section className={styles.results} aria-labelledby="documents-title">
        {filters.from === "precheck" && <p className={styles.contextNote}><Info size={16} aria-hidden="true" />상담에서 선택한 상황을 반영했습니다. 조건은 자유롭게 바꿀 수 있어요.</p>}
        <div className={styles.resultsToolbar}>
          <div><h2 id="documents-title" tabIndex={-1}>{active ? "검색 결과" : "전체 자료"}<span>{filtered.length}</span></h2>
            <p role="status" aria-live="polite" data-result-count>개별 자료 {filtered.length}개{active ? " 일치" : " 표시"}
              {!active && archived.length > 0 ? ` · 보관 ${archived.length}개 별도` : ""}</p></div>
          {active && <button type="button" onClick={reset}>전체 자료 보기<X size={14} aria-hidden="true" /></button>}
        </div>
        {active && <div className={styles.appliedFilters} aria-label="적용한 조건">
          {filters.use && <button type="button" onClick={() => update({ use: "" })}>{USE_CATEGORIES[filters.use as keyof typeof USE_CATEGORIES]}<X size={13} aria-hidden="true" /></button>}
          {filters.stage && <button onClick={() => update({ stage: "" })} aria-label="단계 조건 해제">{stageLabel(filters.stage)}<X size={13} aria-hidden="true" /></button>}
          {([...Object.keys(FACETS), "timing"] as (FacetKey | "timing")[]).flatMap(key => filters[key].map(value => <button key={`${key}-${value}`}
            onClick={() => toggle(key, value)} aria-label={`${key === "timing" ? TIMINGS[value] : (FACETS[key].values as Record<string, string>)[value]} 조건 해제`}>
            {key === "timing" ? TIMINGS[value] : (FACETS[key].values as Record<string, string>)[value]}<X size={13} aria-hidden="true" /></button>))}
          {filters.q && <button onClick={() => update({ q: "" })}>“{filters.q}”<X size={13} aria-hidden="true" /></button>}
        </div>}
        {filtered.length ? <><div className={styles.grid}>{visible.map(cardView)}</div>
          {visible.length < filtered.length && <button type="button" className={styles.loadMore}
            onClick={() => setPageLimit({ key: listKey, count: visibleCount + 18 })}>자료 더 보기<span>{visible.length} / {filtered.length}</span><ArrowDown size={18} aria-hidden="true" /></button>}
        </> : <div className={styles.empty}><Search size={29} strokeWidth={1.5} aria-hidden="true" /><h3>일치하는 자료가 없어요.</h3>
            <p>위의 조건을 하나씩 해제하거나 상황별 안내에서 자료를 골라보세요.</p><Link href="/forms/guides">상황별 안내 보기</Link><button type="button" onClick={reset}>전체 자료 보기</button></div>}
      </section>
    </div>

    <div className={styles.help}><p>어떤 자료가 필요한지 아직 고민되시나요?</p><Link href="/precheck">내 상황으로 상담 시작<ArrowRight size={16} aria-hidden="true" /></Link></div>
    {archived.length > 0 && <details className={styles.archivedResources}><summary>보관 자료 {archived.length}개<ChevronDown size={15} aria-hidden="true" /></summary>
      <p>기본 목록에서 보관한 자료입니다. 기존 원본과 출처를 확인할 수 있습니다.</p>
      <ul>{archived.map(item => <li key={item.id}><a href={resourceUrl(item.id)} onClick={event => openDetail(event, item.id)}>{item.title}<ChevronRight size={14} aria-hidden="true" /></a></li>)}</ul>
    </details>}
    <footer className={styles.footer} id="forms-usage"><p>공공·민간 제공자료의 출처와 확인일은 자료 상세에서 확인하세요.<br />제출 전 제공처의 최신 안내를 확인하세요.</p>
      <a href="/downloads/official-forms/manifest.json" target="_blank" rel="noopener noreferrer">출처·검증 기록<ExternalLink size={14} aria-hidden="true" /></a>
      <details><summary>이전 묶음 보관본</summary><p>현재 자료실의 공개 범위와 다릅니다. 제외 자료가 포함된 기존 74개 묶음을 보존한 파일입니다.</p><a href="/downloads/official-forms/official-forms.zip" download data-bundle-download>과거 ZIP 보관본 받기<Download size={14} aria-hidden="true" /></a></details>
    </footer>

    <dialog ref={dialog} className={styles.dialog} aria-labelledby="form-preview-title"
      onKeyDown={event => {
        if (event.key !== "Tab") return;
        const targets = [...event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex="0"]')].filter(element => element.getClientRects().length > 0);
        const edge = event.shiftKey ? targets[0] : targets.at(-1);
        if (document.activeElement === edge || !event.currentTarget.contains(document.activeElement)) {
          event.preventDefault();
          (event.shiftKey ? targets.at(-1) : targets[0])?.focus();
        }
      }}
      onCancel={event => { event.preventDefault(); closeDetail(); }} onClick={event => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDetail();
      }}>
      <div className={styles.dialogHead}><div><p>{selected ? `${kindLabel(selected)} · ${selected.id}` : legacyGroup ? "이전 주소의 개별 자료" : "자료 확인"}</p>
        <h2 id="form-preview-title">{selected?.title || legacyGroup?.title || "자료를 찾을 수 없어요"}</h2></div>
        <button type="button" onClick={closeDetail} aria-label="자료 상세 닫기"><X size={23} aria-hidden="true" /></button>
      </div>
      <div className={styles.dialogBody}>{selected?.resource?.presentation.visibility === "excluded" ? <section><p className={styles.contextNote}>현재 자료실의 기본 제공 범위에서 제외된 자료입니다</p><p>{selected.title}</p><a className={styles.providerLink} href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">기존 출처 확인 (새 창)<ExternalLink size={15} aria-hidden="true" /></a></section> : selected ? <>
        {selected.resource?.presentation.visibility === "archived" && <p className={styles.contextNote}>기본 목록에서 보관한 자료입니다. 기존 원본과 출처를 확인할 수 있습니다.</p>}
        {filters.guide && <p className={styles.contextNote}>상황별 안내에서 선택한 자료입니다. 닫으면 보던 안내 위치로 돌아갑니다.</p>}
        <div className={styles.originBadges}><span data-origin={selected.resource?.facets.origin}>{selected.institutionKind || (useCategory(selected) === "service" ? "제공기관 서비스" : originLabel(selected))}</span><span>{useCategory(selected) === "service" ? "조회·발급 안내" : selected.providerRoutes ? "제공기관별 조건 확인" : authorityLabel(selected)}</span></div>
        <p className={styles.detailDescription}>{selected.description}</p>
        {selectedUsage && <dl className={styles.metadata}><dt>사용 대상</dt><dd>{selectedUsage.who}</dd><dt>쓰는 경우</dt><dd>{selectedUsage.when}</dd></dl>}
        {!SERVICE_CONTEXTS[selected.id] && !selected.providerRoutes?.length && <section className={styles.downloadSection} id="detail-downloads" aria-label="제공 파일과 이용 방법">
          <div className={styles.downloadHeading}><h3>{USE_CATEGORIES[useCategory(selected)]}</h3></div>
          {!SERVICE_CONTEXTS[selected.id] && (useCategory(selected) === "service" || !availableFiles(selected).length ? <FileAction item={selected} /> : <Files item={selected} />)}
        </section>}
        {SERVICE_CONTEXTS[selected.id] && <section id="detail-service-contexts" aria-label="본인과 상속인 이용 안내">
          {selectedContexts.notice && <p className={styles.contextNote} role="status">{selectedContexts.notice}</p>}
          {[...new Set(selectedContexts.contexts.map(context => context.timing))].sort((a, b) => filters.guide === "after-death" ? b.localeCompare(a) * -1 : 0).map(timing => <LookupServices key={timing} timing={timing} serviceIds={selectedContexts.contexts.filter(context => context.timing === timing).map(context => context.service.id)} />)}
        </section>}
        {selectedUsage && <section className={styles.usageGuide} aria-label="자료 사용 안내">
          <h3>이 자료는 이렇게 사용하세요</h3>
          <div className={styles.usageColumns}><div><h4>먼저 준비할 것</h4><ul>{selectedUsage.prepare.map(item => <li key={item}>{item}</li>)}</ul></div>
            <div><h4>사용 순서</h4><ol>{selectedUsage.steps.map(item => <li key={item}>{item}</li>)}</ol></div></div>
          {selectedUsage.note && <p className={styles.usageNote}>{selectedUsage.note}</p>}
          {selected.resource?.facets.timing.length === 2 && <p className={styles.timingExplanation}>생전·사후 모두 연결되는 이유: {selectedUsage.timingRationale}</p>}
          {selected.usage?.sourceUrls.length ? <div className={styles.usageSources}>{[...new Set(selected.usage.sourceUrls)].map((url, index) => <a href={url} key={url} target="_blank" rel="noopener noreferrer">{url.includes("hometax") ? "홈택스 열기" : `이용 근거 ${index + 1}`} (새 창)<ExternalLink size={13} aria-hidden="true" /></a>)}</div> : null}
        </section>}
        {selected.providerRoutes?.length ? <section className={styles.providerRoutes} id="detail-provider-routes" aria-label="은행별 신청 경로">
          <h3>{useCategory(selected) === "service" ? "누구의 자료를 발급하나요?" : "은행별 신청 안내"}</h3>
          {[...selected.providerRoutes].sort((a, b) => Number(b.applicantContext === preferredApplicant) - Number(a.applicantContext === preferredApplicant)).map(route => <details key={`${route.provider}-${route.applicantContext}`} open={selected.providerRoutes!.length > 2 || route.applicantContext === preferredApplicant || undefined}>
            <summary>{route.provider} · {route.applicantContext === "owner" ? "본인" : "상속인"}<ChevronDown size={16} aria-hidden="true" /></summary>
            <p>{route.customerType}</p><p>{route.channel}</p><p>{route.authentication}</p><p className={styles.usageNote}>{route.note}</p>
            <a className={styles.providerLink} href={route.url} target="_blank" rel="noopener noreferrer" aria-label={`${route.provider} ${route.applicantContext === "owner" ? "본인" : "상속인"} ${route.label} (새 창)`}>{route.label}<ExternalLink size={15} aria-hidden="true" /></a>
            <small>공개 안내 확인 {route.checkedOn}</small>
          </details>)}
        </section> : null}
        {selected.afterLookup && <section className={styles.usageGuide} aria-label="조회 다음 단계"><h3>{selected.afterLookup.title}</h3><p>{selected.afterLookup.text}</p><nav className={styles.relatedGuides}>{selected.afterLookup.resourceIds.map(id => <a key={id} href={resourceUrl(id)} onClick={event => openDetail(event, id)}>{index.documents.get(id)?.title}<ArrowRight size={16} aria-hidden="true" /></a>)}</nav></section>}
        {(availableFiles(selected).length > 0 || selected.thumbnail) && selected.institutionKind !== "은행 지정 서식" && <><DocumentPreview item={selected} key={selected.id} />{useCategory(selected) === "service" && <Files item={selected} />}</>}
        {related.length > 0 && <nav className={styles.relatedGuides} aria-label="관련 서류" data-related-documents><h3>관련 서류</h3>
          {related.map(item => <a key={item.id} href={resourceUrl(item.id)} onClick={event => openDetail(event, item.id)}>
            <span>{item.title}<small>{kindLabel(item)}</small></span><ArrowRight size={16} aria-hidden="true" />
          </a>)}
        </nav>}
        {guideContexts.length > 0 && <nav className={styles.relatedGuides} aria-label="이 자료를 사용하는 가이드"><h3>전체 진행 과정에서 보기</h3>
          {guideContexts.map(context => <Link key={context.href} href={context.href}><span>{context.guideTitle}<small>{context.stepTitle}</small></span><ArrowRight size={16} aria-hidden="true" /></Link>)}
        </nav>}
        <div className={styles.detailLayout} style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
          <div className={styles.detailInfo}><h3>자료 정보</h3><dl className={styles.metadata}>
            <dt>제공처</dt><dd>{selected.providerScope || selected.institution}</dd><dt>이용 방식</dt><dd>{deliveryLabel(selected)}</dd>
            <dt>서식번호</dt><dd>{selected.form_no || "기관 안내 확인"}</dd><dt>출처 확인일</dt><dd>{selected.checkedOn || selected.checked_at?.slice(0, 10) || "기존 안내 보존 · 재확인 필요"}</dd>
            <dt>서식 개정일</dt><dd>{selected.revised_at || "공식 원문 확인"}</dd>
            {selected.publishedOn && <><dt>목록 게시일</dt><dd>{selected.publishedOn}</dd></>}
            <dt>이용 조건</dt><dd>{selected.license || "제공처 안내 확인"}</dd>
          </dl>{selected.sourceUrl && <a className={styles.providerLink} href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">출처 게시물 확인<ExternalLink size={15} aria-hidden="true" /></a>}
            {selected.licenseUrl && selected.licenseUrl !== selected.sourceUrl && <a className={styles.providerLink} href={selected.licenseUrl} target="_blank" rel="noopener noreferrer">이용 조건 확인<ExternalLink size={15} aria-hidden="true" /></a>}
          </div>
        </div>
        {selected.supplementalSources?.length ? <section className={styles.supplementalSources} aria-label="함께 확인할 첨부자료"><h3>함께 확인할 첨부자료</h3>
          <p>아래 자료는 제공처의 안내에서 확인할 수 있습니다.</p><ul>{selected.supplementalSources.map(source => <li key={`${source.title}-${source.url}`}>
            <div><span>{source.origin === "private_institution" ? "민간 제공 자료" : source.origin === "official_institution" ? "공공기관 자료" : "제공자료"}</span><small>{source.institution}</small></div>
            <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}<ExternalLink size={15} aria-hidden="true" /></a><p>{source.note}</p><small>{source.checkedOn ? `출처 확인일 ${source.checkedOn}` : "제공기관의 현재 안내를 확인하세요."}</small>
          </li>)}</ul>
        </section> : null}
        <details className={styles.verification}><summary>자료 확인 내용<ChevronDown size={16} aria-hidden="true" /></summary>
          <p>{selected.verification}</p>{selected.exampleVerification && <p>{selected.exampleVerification}</p>}
          {selected.editorialReview && <p>이용·분류 검토 ({selected.editorialReview.date}): {selected.editorialReview.note}</p>}
          {selected.primaryArtifactType === "derived-image-compilation" && <p>기관 웹 사례의 이미지·본문을 묶은 사이트 변환본입니다.</p>}
          {selected.resource?.classification?.status !== "verified" && selected.resource?.classification?.note && <p>분류 검토: {selected.resource.classification.note}</p>}
        </details>
        {selected.resource?.planning_windows?.map((window, position) => <section className={styles.planningWindow} key={position}>
          <h3>{window.label}</h3><p>{window.verification.status === "verified" ? "준비 시 고려할 조건" : "조건 확인 필요"}</p>
          <ul>{window.availability_conditions.map(value => <li key={value}>{value}</li>)}</ul>
          {window.closing_events.length > 0 && <p>준비 가능성·효과가 달라지는 계기: {window.closing_events.join(" · ")}</p>}<small>개인별 마감일을 의미하지 않습니다.</small>
        </section>)}
      </> : legacyGroup ? <section aria-label="이전 주소에서 연결된 개별 자료" data-legacy-group-list>
        <p className={styles.detailDescription}>이 자료들은 이제 목록에서 서류별로 표시됩니다. 아래 서류명을 누르면 해당 자료로 바로 이동합니다.</p>
        {legacyItems.length ? <ul className={styles.fileList}>{legacyItems.map(item => <li key={item.id}>
          <a href={resourceUrl(item.id)} onClick={event => openDetail(event, item.id)}>{item.title}<ChevronRight size={15} aria-hidden="true" /></a>
        </li>)}</ul> : <p>현재 제공 중인 자료가 없습니다. 전체 목록에서 확인하세요.</p>}
      </section> : <div className={styles.empty}><p>주소의 자료 ID를 확인하거나 전체 목록에서 다시 찾아보세요.</p><button onClick={reset}>전체 자료 보기</button></div>}</div>
      <div className={styles.dialogFooter}>
        <button className={styles.dialogBack} type="button" onClick={closeDetail}>{filters.guide ? "가이드로 돌아가기" : "목록으로"}</button>
        {selected && selected.resource?.presentation.visibility !== "excluded" ? <button className={styles.dialogPrimary} type="button" onClick={() => {
          const target = dialog.current?.querySelector<HTMLElement>(SERVICE_CONTEXTS[selected.id] ? "#detail-service-contexts" : selected.providerRoutes?.length ? "#detail-provider-routes" : "#detail-downloads");
          target?.scrollIntoView({ block: "start" }); target?.querySelector<HTMLElement>("summary, a[href]")?.focus();
        }}>{useCategory(selected) === "form" && availableFiles(selected).length ? selected.institutionKind === "은행 지정 서식" ? "공식 파일 확인" : "파일 선택·다운로드" : "이용 방법 확인"}{useCategory(selected) === "form" && availableFiles(selected).length && selected.institutionKind !== "은행 지정 서식" ? <Download size={17} aria-hidden="true" /> : <ArrowRight size={17} aria-hidden="true" />}</button>
          : <button className={styles.dialogPrimary} type="button" onClick={closeDetail}>목록으로 돌아가기<ArrowRight size={17} aria-hidden="true" /></button>}
      </div>
    </dialog>
  </main>;
}
