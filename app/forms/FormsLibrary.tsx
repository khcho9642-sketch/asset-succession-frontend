"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ChevronRight, Download, FileText, Info, Search, X } from "lucide-react";
import styles from "./FormsLibrary.module.css";
import { OfficialRegistrationGuides } from "./OfficialRegistrationGuides";

export type LibraryDocument = {
  id: string; title: string; category: string; description: string; tags: string;
  format: "Word" | "Excel"; editable: string; example: string; thumbnail: string;
  sizeLabel: string; version: string;
};
type Props = {
  documents: LibraryDocument[]; bundleUrl: string; bundleSize: string;
  guideUrl: string; allExamplesUrl: string;
};
const categories = ["전체", "재산분배·상속", "증여", "차용·상환", "양도", "가업승계"];
const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g, "");

export function FormsLibrary({ documents, bundleUrl, bundleSize, guideUrl, allExamplesUrl }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("전체");
  const [preview, setPreview] = useState<LibraryDocument | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLAnchorElement | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const filtered = documents.filter(item => (category === "전체" || item.category === category)
    && normalize(`${item.title} ${item.category} ${item.description} ${item.tags} ${item.format}`).includes(normalize(query)));

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
    setQuery(""); setCategory("전체"); search.current?.focus();
  }

  return <main className={styles.library} id="forms-library" data-forms-library="approved-v2">
    <nav className={styles.breadcrumb} aria-label="현재 위치">
      <Link href="/">홈</Link><ChevronRight size={13} aria-hidden="true" /><span aria-current="page">서류양식</span>
    </nav>
    <section className={styles.hero} aria-labelledby="library-title">
      <div>
        <p className={styles.eyebrow}>자산승계 360 · 서류 자료실</p>
        <h1 id="library-title">생각을 정리하고,<br />필요한 서류를 준비하세요.</h1>
        <p className={styles.description}>재산을 나누고, 증여를 약속하고, 상담을 준비할 때.<br />빈 양식과 작성 예시를 함께 살펴보세요.</p>
      </div>
      <div className={styles.bundle}>
        <p className={styles.bundleOverline}>편집 가능한 작성 양식</p>
        <p className={styles.bundleCount}><strong>{documents.length}</strong>종</p>
        <p className={styles.bundleDescription}>Word · Excel · 가상 작성 예시 PDF</p>
        <a className={styles.bundleButton} href={bundleUrl} download data-bundle-download>
          전체 양식 받기<Download size={18} aria-hidden="true" />
        </a>
        <p className={styles.bundleMeta}><span>ZIP · {bundleSize}</span><span>이용안내 포함</span></p>
      </div>
    </section>
    <aside className={styles.notice} aria-label="양식 이용 안내">
      <Info size={17} aria-hidden="true" />
      <p><strong>자체 참고 초안입니다.</strong> 공식 신고서식이 아니며, 실제 사용 전 개별 법률·세무 검토가 필요합니다.</p>
      <a href={guideUrl} target="_blank" rel="noopener noreferrer">이용안내<span className={styles.srOnly}> PDF, 새 창</span></a>
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
      <p className={styles.resultCount} role="status" aria-live="polite" data-result-count>
        {query.trim() ? "검색 결과" : category} <strong>{filtered.length}종</strong> · 편집 양식과 작성 예시
      </p>
      <div className={styles.grid}>
        {filtered.map(item => <article className={styles.card} key={item.id} data-form-id={item.id}>
          <div className={styles.cardTop}><span>{item.category}</span><span className={styles.format}><FileText size={13} aria-hidden="true" />{item.format}</span></div>
          <a href={item.example} target="_blank" rel="noopener noreferrer" className={styles.visual}
            onClick={event => openPreview(event, item)} aria-label={`${item.title} 작성 예시 미리보기`} data-form-preview>
            <span className={styles.previewTag}>가상 작성 예시</span>
            <Image src={item.thumbnail} width={720} height={1019} alt={`${item.title} 가상 작성 예시의 첫 페이지`}
              unoptimized className={styles.thumbnail} />
            <span className={styles.previewOpen}><Search size={13} aria-hidden="true" />미리보기</span>
          </a>
          <div className={styles.cardCopy}>
            <h3>{item.title}</h3><p>{item.description}</p><small>{item.tags}</small>
          </div>
          <div className={styles.cardActions}>
            <a className={styles.download} href={item.editable} download data-form-download
              aria-label={`${item.title} ${item.format} 양식 받기`}>
              <Download size={16} aria-hidden="true" />{item.format === "Excel" ? "엑셀 양식 받기" : "빈 양식 받기"}
            </a>
            <a className={styles.example} href={item.example} target="_blank" rel="noopener noreferrer"
              onClick={event => openPreview(event, item)} aria-label={`${item.title} 작성 예시 보기`}>
              작성 예시<ArrowRight size={15} aria-hidden="true" />
            </a>
          </div>
          <div className={styles.cardFoot}><span>{item.sizeLabel} · v{item.version}</span><span>자체 참고 초안</span></div>
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
    <footer className={styles.footer}>
      <p>자산승계 360 · 자체 참고 양식 v1.0<br />작성 예시의 인물과 재산은 모두 가상입니다.</p>
      <div><a href={allExamplesUrl} target="_blank" rel="noopener noreferrer">예시 모아보기</a><a href={guideUrl} target="_blank" rel="noopener noreferrer">이용안내</a></div>
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
          <p id="form-preview-note">가상 작성 예시 · 첫 페이지 미리보기</p></div>
          <button type="button" aria-label="미리보기 닫기" onClick={() => dialog.current?.close()}><X size={22} aria-hidden="true" /></button>
        </div>
        <div className={styles.dialogImage}><Image src={preview.thumbnail} width={720} height={1019} unoptimized
          alt={`${preview.title} 가상 작성 예시 첫 페이지`} /></div>
        <div className={styles.dialogFooter}>
          <a href={preview.example} target="_blank" rel="noopener noreferrer">전체 예시 PDF 열기<ArrowRight size={15} aria-hidden="true" /></a>
          <a className={styles.dialogDownload} href={preview.editable} download><Download size={16} aria-hidden="true" />편집 양식 받기</a>
        </div>
      </>}
    </dialog>
  </main>;
}
