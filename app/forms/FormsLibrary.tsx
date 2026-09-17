"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ChevronRight, Download, ExternalLink, FileText, Info, Search, X } from "lucide-react";
import styles from "./FormsLibrary.module.css";
import { OfficialRegistrationGuides } from "./OfficialRegistrationGuides";

export type LibraryDocument = {
  id: string; title: string; category: string; description: string; tags: string;
  format: string; editable: string; example: string | null; thumbnail: string | null;
  sizeLabel: string; institution: string; sourceUrl: string; checkedOn: string;
  license: string; verification: string; delivery: string;
  originalCategory: string; catalogTitle: string; exampleVerification: string;
};
type Props = {
  documents: LibraryDocument[];
};
const categories = ["전체", "재산분배·상속", "증여", "매매·임대차", "차용·상환", "양도", "가업승계", "공제·납부", "등기"];
const deliveryLabels: Record<string, string> = { hosted: "원본 다운로드", provider: "공식 제공처", pending: "확인 중" };
const actionLabel = (item: LibraryDocument) => item.delivery === "hosted" ? "기관 원본 받기" : item.delivery === "pending" ? "후보 제공처" : "공식 제공처";
const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g, "");

export function FormsLibrary({ documents }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("전체");
  const [delivery, setDelivery] = useState("all");
  const [preview, setPreview] = useState<LibraryDocument | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLAnchorElement | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const filtered = documents.filter(item => (category === "전체" || item.category === category)
    && (delivery === "all" || item.delivery === delivery)
    && normalize(`${item.title} ${item.catalogTitle} ${item.originalCategory} ${item.category} ${item.description} ${item.tags} ${item.format} ${item.institution}`).includes(normalize(query)));
  const counts = Object.fromEntries(Object.keys(deliveryLabels).map(key => [key, documents.filter(item => item.delivery === key).length]));

  useEffect(() => {
    const element = dialog.current;
    if (!element || !preview) return;
    const root = document.documentElement;
    const priorOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    if (!element.open) element.showModal();
    element.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      if (element.open) element.close();
      root.style.overflow = priorOverflow;
      previousFocus.current?.focus();
    };
  }, [preview]);

  function openPreview(event: MouseEvent<HTMLAnchorElement>, item: LibraryDocument) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
      || typeof dialog.current?.showModal !== "function") return;
    event.preventDefault();
    previousFocus.current = event.currentTarget;
    setPreview(item);
  }
  function resetSearch() {
    setQuery(""); setCategory("전체"); setDelivery("all"); search.current?.focus();
  }

  return <main className={styles.library} id="forms-library" data-forms-library="institutional-v1">
    <nav className={styles.breadcrumb} aria-label="현재 위치">
      <Link href="/">홈</Link><ChevronRight size={13} aria-hidden="true" /><span aria-current="page">서류양식</span>
    </nav>
    <section className={styles.hero} aria-labelledby="library-title">
      <div>
        <p className={styles.eyebrow}>자산승계 360 · 서류 자료실</p>
        <h1 id="library-title">생각을 정리하고,<br />필요한 서류를 준비하세요.</h1>
        <p className={styles.description}>재산을 나누고, 증여를 약속하고, 상담을 준비할 때.<br />빈 양식과 작성 예시를 함께 살펴보세요.</p>
        <p className={styles.catalogSummary} data-catalog-summary><strong>전체 {documents.length}개 자료</strong><span>원본 다운로드 {counts.hosted} · 공식 제공처 {counts.provider} · 확인 중 {counts.pending}</span></p>
      </div>
      <div className={styles.bundle} data-forms-bundle>
        <p className={styles.bundleOverline}>기관 양식과 제공처</p>
        <p className={styles.bundleCount}><strong>{documents.length}</strong>개 자료</p>
        <p className={styles.bundleDescription}>기관 원본 2종 · 기관 예시 2개</p>
        <a className={styles.bundleButton} href="/downloads/official-forms/official-forms.zip" download data-bundle-download>
          확보한 4개 파일 받기<Download size={18} aria-hidden="true" />
        </a>
      </div>
    </section>
    <aside className={styles.notice} aria-label="양식 이용 안내">
      <Info size={17} aria-hidden="true" />
      <p><strong>기관 양식·작성사례 모음입니다.</strong> {documents.length}개는 자료 항목 수이며 확보한 파일 수가 아닙니다. 기관 예시도 개별 사정과 최신 제출 요건을 확인하세요.</p>
      <a href="#forms-usage">이용안내</a>
    </aside>
    <OfficialRegistrationGuides />
    <section className={styles.section} aria-labelledby="documents-title">
      <div className={styles.sectionHeading}>
        <h2 id="documents-title">어떤 서류가 필요하신가요?</h2>
        <label className={styles.search}>
          <Search size={18} aria-hidden="true" />
          <span className={styles.srOnly}>서류명·용도로 찾기</span>
          <input ref={search} type="search" value={query} onChange={event => setQuery(event.target.value)}
            placeholder="서류명·용도로 찾기" autoComplete="off" maxLength={100} />
        </label>
      </div>
      <div className={styles.filters} role="group" aria-label="서류 분야">
        {categories.map(label => <button key={label} type="button" aria-pressed={category === label}
          onClick={() => setCategory(label)} data-category={label}>
          {label}<span>{label === "전체" ? documents.length : documents.filter(item => item.category === label).length}</span>
        </button>)}
      </div>
      <div className={styles.resultsToolbar}>
        <p className={styles.resultCount} role="status" aria-live="polite" data-result-count>
          {query.trim() ? "검색 결과" : category} <strong>{filtered.length}개</strong> / 전체 {documents.length}개
        </p>
        <label className={styles.deliveryFilter}>제공 상태<select value={delivery} onChange={event => setDelivery(event.target.value)} aria-label="자료 제공 상태">
          <option value="all">전체 ({documents.length})</option>
          {Object.entries(deliveryLabels).map(([key, label]) => <option key={key} value={key}>{label} ({counts[key]})</option>)}
        </select></label>
      </div>
      <div className={styles.grid}>
        {filtered.map(item => <article className={styles.card} key={item.id} data-form-id={item.id} data-delivery={item.delivery}>
          <div className={styles.cardTop}><span>{item.originalCategory}</span><span className={styles.format}><FileText size={13} aria-hidden="true" />{item.format}</span></div>
          <a href={item.example ?? item.sourceUrl} target="_blank" rel="noopener noreferrer" className={styles.visual}
            onClick={event => openPreview(event, item)} aria-label={`${item.title} 자료 확인`} data-form-preview>
            <span className={styles.previewTag}>{item.delivery === "hosted" ? "기관 작성 예시" : deliveryLabels[item.delivery]}</span>
            {item.thumbnail ? <Image src={item.thumbnail} width={724} height={1024} alt={`${item.title} 기관 예시의 내장 미리보기`}
              unoptimized className={styles.thumbnail} /> : <span className={styles.providerVisual}><FileText size={34} aria-hidden="true" />{item.institution}</span>}
            <span className={styles.previewOpen}><Search size={13} aria-hidden="true" />{item.thumbnail ? "미리보기" : "자료 정보"}</span>
          </a>
          <div className={styles.cardCopy}>
            <span className={styles.deliveryBadge} data-verification-status={item.delivery}>{deliveryLabels[item.delivery]}</span>
            <h3>{item.title}</h3><p>{item.description}</p><small>{item.tags}</small>
            {item.delivery === "pending" ? <p className={styles.pendingNote}>{item.verification}</p> : null}
          </div>
          <div className={styles.cardActions}>
            <a className={styles.download} href={item.editable} download={item.delivery === "hosted"} target={item.delivery === "hosted" ? undefined : "_blank"} rel="noopener noreferrer" data-form-download
              aria-label={`${item.title} ${actionLabel(item)}`}>
              {item.delivery === "hosted" ? <Download size={16} aria-hidden="true" /> : <ExternalLink size={16} aria-hidden="true" />}{actionLabel(item)}
            </a>
            {item.example ? <a className={styles.example} href={item.example} target="_blank" rel="noopener noreferrer"
              onClick={event => openPreview(event, item)} aria-label={`${item.title} 기관 작성 예시 ${item.delivery === "hosted" ? "보기" : "안내"}`}>
              {item.delivery === "hosted" ? "기관 예시" : "예시 안내"}<ArrowRight size={15} aria-hidden="true" />
            </a> : <span className={styles.example}>기관 예시 미확인</span>}
          </div>
          <div className={styles.cardFoot}><span>{item.sizeLabel}</span><a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{item.institution}</a></div>
        </article>)}
      </div>
      {filtered.length === 0 && <div className={styles.empty}>
        <Search size={25} aria-hidden="true" /><h3>일치하는 서류가 없어요.</h3>
        <p>다른 검색어나 분야를 선택해 보세요.</p><button type="button" onClick={resetSearch}>전체 서류 보기</button>
      </div>}
    </section>
    <section className={styles.help}>
      <div><h2>어떤 서류부터 준비할지 고민되시나요?</h2><p>상황을 먼저 이야기해 주세요. 모든 서류를 한 번에 준비하지 않아도 괜찮아요.</p></div>
      <Link href="/precheck">AI 상담으로 돌아가기<ArrowRight size={18} aria-hidden="true" /></Link>
    </section>
    <footer className={styles.footer} id="forms-usage">
      <p>확인일 2026-09-17 · 부평구청 원본은 공공누리 제1유형(출처표시)으로 이용합니다.<br />계약 조항과 예시를 재작성하지 않았습니다. HWP는 한글 호환 프로그램에서 열어 주세요.<br />기타 자료는 기관 제공처에서 최신 양식과 예시 유무를 확인하세요.</p>
      <div><a href="/downloads/official-forms/manifest.json" target="_blank" rel="noopener noreferrer">출처·검증 기록</a></div>
    </footer>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="form-preview-title" aria-describedby="form-preview-note"
      onKeyDown={event => {
        if (event.key !== "Tab") return;
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), [tabindex='0']"))
          .filter(element => element.getClientRects().length > 0);
        const first = items[0];
        const last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
      onClose={() => setPreview(null)} onClick={event => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) event.currentTarget.close();
      }}>
      {preview && <>
        <div className={styles.dialogHead}><div><h2 id="form-preview-title">{preview.title}</h2>
          <p id="form-preview-note">{preview.institution} · {preview.thumbnail ? "기관 예시 내장 미리보기" : "공식 제공처 안내"}</p></div>
          <button type="button" aria-label="미리보기 닫기" onClick={() => dialog.current?.close()}><X size={22} aria-hidden="true" /></button>
        </div>
        <div className={styles.dialogImage}>
          {preview.thumbnail ? <Image src={preview.thumbnail} width={724} height={1024} unoptimized alt={`${preview.title} 기관 예시 내장 미리보기`} /> : null}
          <p><strong>{deliveryLabels[preview.delivery]}</strong> · {preview.verification}</p><p>{preview.exampleVerification}</p><p>{preview.license} · 확인일 {preview.checkedOn}</p>
          <a href={preview.sourceUrl} target="_blank" rel="noopener noreferrer">출처 게시물 확인</a>
        </div>
        <div className={styles.dialogFooter}>
          {preview.example ? <a href={preview.example} target="_blank" rel="noopener noreferrer">{preview.delivery === "hosted" ? "기관 예시 원문 열기" : "기관 예시 안내 열기"}<ArrowRight size={15} aria-hidden="true" /></a> : <span>기관 작성 예시 미확인</span>}
          <a className={styles.dialogDownload} href={preview.editable} download={preview.delivery === "hosted"} target={preview.delivery === "hosted" ? undefined : "_blank"} rel="noopener noreferrer">{preview.delivery === "hosted" ? <Download size={16} aria-hidden="true" /> : <ExternalLink size={16} aria-hidden="true" />}{actionLabel(preview)}</a>
        </div>
      </>}
    </dialog>
  </main>;
}
