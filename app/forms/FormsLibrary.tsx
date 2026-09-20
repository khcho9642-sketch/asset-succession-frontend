"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ChevronRight, Download, FileText, Info, Search, X } from "lucide-react";
import styles from "./FormsLibrary.module.css";
import { AdditionalFormMetadata } from "./AdditionalFormMetadata";
import { OfficialRegistrationGuides } from "./OfficialRegistrationGuides";

export type LibraryDocument = {
  id: string; title: string; category: string; description: string; tags: string;
  format: string; editable: string; example: string | null; thumbnail: string | null;
  sizeLabel: string; institution: string; sourceUrl: string; checkedOn: string;
  license: string; verification: string; delivery: string;
  originalCategory: string; catalogTitle: string; exampleVerification: string;
  licenseUrl: string;
  primaryArtifactType?: string;
  preview?: {
    method: string; sourceRole: string; width: number; height: number; lowResolution: boolean;
  };
  form_no?: string | null; revised_at?: string | null; deadline?: string | null; deadline_basis?: string | null;
  source_type?: string | null; checked_at?: string | null; status?: string; task_id?: string;
  files: { name: string; path: string; format: string; role: string; bytes: number; delivery: string }[];
};
type Props = {
  documents: LibraryDocument[];
};
const categories = ["전체", "재산분배·상속", "증여", "매매·임대차", "차용·상환", "양도", "가업승계", "공제·납부", "등기", "재산조회", "유언", "후견", "불복·정정"];
const deliveryLabels: Record<string, string> = { hosted: "사이트에서 다운로드", direct: "국세청 파일 바로 받기", provider: "공식 제공처", pending: "확인 중" };
const actionLabel = (item: LibraryDocument) => item.delivery === "provider" ? "공식 제공처" : item.primaryArtifactType === "derived-image-compilation" ? "사례 PDF 받기" : item.delivery === "direct" ? "국세청 파일 받기" : "기관 원본 받기";
const previewLabel = (item: LibraryDocument) => !item.preview ? "자료 정보"
  : item.preview.method === "institution-image" ? "웹 사례 원본 이미지"
  : item.preview.sourceRole === "example" ? "기관 작성 예시"
  : item.preview.sourceRole === "combined" ? "기관 합본 첫 페이지" : "기관 원본 양식";
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
  const hostedFileCount = documents.filter(item => item.delivery === "hosted" && !item.task_id).reduce((sum, item) => sum + item.files.length, 0);

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
        <p className={styles.catalogSummary} data-catalog-summary><strong>전체 {documents.length}개 자료</strong><span>개별 다운로드 {counts.hosted} · 공식 제공처 {counts.provider} · 확인 중 {counts.pending}</span></p>
      </div>
      <div className={styles.bundle} data-forms-bundle>
        <p className={styles.bundleOverline}>기관 원본 모아 받기</p>
        <p className={styles.bundleCount}><strong>74</strong>개 기존 자료</p>
        <p className={styles.bundleDescription}>원본·예시·형식별 파일 {hostedFileCount}개</p>
        <a className={styles.bundleButton} href="/downloads/official-forms/official-forms.zip" download data-bundle-download>
          기존 74개 자료 한번에 받기<Download size={18} aria-hidden="true" />
        </a>
        <p className={styles.bundleExclusions}>기존 74개 묶음입니다. 새로 확보한 원본은 각 카드에서 별도로 받습니다. 웹 사례 1개는 사이트 변환 PDF를 포함합니다.</p>
      </div>
    </section>
    <aside className={styles.notice} aria-label="양식 이용 안내">
      <Info size={17} aria-hidden="true" />
      <p><strong>기관 원본과 작성사례를 제공합니다.</strong> 웹 사례 PDF는 기관 원본 이미지·본문을 묶은 사이트 변환본입니다. 예전 양식과 사례의 금액·법령이 현재에도 적용되는지는 제출 전에 확인하세요.</p>
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
          <a href={item.example || item.sourceUrl || "#forms-usage"} target="_blank" rel="noopener noreferrer" className={styles.visual}
            onClick={event => openPreview(event, item)} aria-label={`${item.title} 자료 확인`} data-form-preview>
            <span className={styles.previewTag}>{previewLabel(item)}</span>
            {item.thumbnail && item.preview ? <Image src={item.thumbnail} width={item.preview.width} height={item.preview.height} alt={`${item.title} · ${previewLabel(item)} 미리보기`}
              unoptimized className={styles.thumbnail} /> : <span className={styles.providerVisual}><FileText size={34} aria-hidden="true" />{item.institution}</span>}
            <span className={styles.previewOpen}><Search size={13} aria-hidden="true" />{item.thumbnail ? "미리보기" : "자료 정보"}</span>
          </a>
          <div className={styles.cardCopy}>
            <span className={styles.deliveryBadge} data-verification-status={item.delivery}>{deliveryLabels[item.delivery]}</span>
            <h3>{item.title}</h3><p>{item.description}</p><small>{item.tags}</small>
            <AdditionalFormMetadata item={item} />
            {item.delivery === "pending" ? <p className={styles.pendingNote}>{item.verification}</p> : null}
          </div>
          <div className={styles.cardActions}>
            {item.delivery !== "pending" ? <a className={styles.download} href={item.editable} target={item.delivery === "provider" ? "_blank" : undefined} download={item.delivery === "hosted"} rel="noopener noreferrer" data-form-download
              aria-label={`${item.title} ${actionLabel(item)}`}>
              <Download size={16} aria-hidden="true" />{actionLabel(item)}
            </a> : <span className={styles.download} aria-disabled="true">다운로드 미제공</span>}
            {item.example ? <a className={styles.example} href={item.example} target="_blank" rel="noopener noreferrer"
              onClick={event => openPreview(event, item)} aria-label={`${item.title} 기관 작성 예시 보기`}>
              기관 예시<ArrowRight size={15} aria-hidden="true" />
            </a> : <a className={styles.example} href={item.editable || item.sourceUrl || "#forms-usage"} onClick={event => openPreview(event, item)} aria-label={`${item.title} 파일·정보 보기`}>파일·정보<ArrowRight size={15} aria-hidden="true" /></a>}
          </div>
          <div className={styles.cardFoot}><span>{item.sizeLabel}</span><a href={item.sourceUrl || "#forms-usage"} target="_blank" rel="noopener noreferrer">{item.institution}</a></div>
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
      <p>확인일 2026-09-17 · 각 기관의 이용 근거와 출처는 자료 정보에 표시했습니다.<br />계약 조항과 예시를 재작성하지 않았습니다. HWP·Word 파일은 호환 프로그램이 필요합니다.<br />국세청 웹 사례 PDF는 기관 제공 문서가 아닌 사이트 변환본입니다.</p>
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
          <p id="form-preview-note">{preview.institution} · {previewLabel(preview)}</p></div>
          <button type="button" aria-label="미리보기 닫기" onClick={() => dialog.current?.close()}><X size={22} aria-hidden="true" /></button>
        </div>
        <div className={styles.dialogImage}>
          {preview.preview?.lowResolution && <p className={styles.previewNote} data-preview-resolution-note>문서에 포함된 작은 미리보기 이미지입니다. 자세한 내용은 원본 파일에서 확인해 주세요.</p>}
          {preview.thumbnail && preview.preview ? <Image src={preview.thumbnail} width={preview.preview.width} height={preview.preview.height}
            style={{ width: Math.min(640, preview.preview.width) }} unoptimized alt={`${preview.title} · ${previewLabel(preview)} 미리보기`} /> : null}
          <p><strong>{deliveryLabels[preview.delivery]}</strong> · {preview.verification}</p><p>{preview.exampleVerification}</p><p>{preview.license} · 확인일 {preview.checkedOn}</p>
          {preview.sourceUrl ? <a href={preview.sourceUrl} target="_blank" rel="noopener noreferrer">출처 게시물 확인</a> : <p>확인된 출처가 아직 없습니다.</p>}
          {preview.licenseUrl ? <a href={preview.licenseUrl} target="_blank" rel="noopener noreferrer">이용 조건 확인</a> : null}
          {preview.files.length > 0 && <ul className={styles.fileList} aria-label="받을 수 있는 원본 파일">
            {preview.files.map(file => <li key={file.path}>
              <a href={file.path} download={file.delivery === "hosted"} rel="noopener noreferrer" data-file-download>
                <Download size={16} aria-hidden="true" /><span>{file.name}<small>{file.format} · {Math.ceil(file.bytes / 1024).toLocaleString("ko-KR")} KB{file.role === "image-compilation" ? " · 웹 사례 묶음 · 사이트 변환본" : file.role === "web-example-image" ? " · 기관 원본 이미지" : file.role === "combined" ? " · 양식·설명·예시 합본" : file.role === "example" ? " · 기관 작성 예시" : " · 원본"}</small></span>
              </a>
            </li>)}
          </ul>}
        </div>
        <div className={styles.dialogFooter}>
          {preview.example ? <a href={preview.example} target="_blank" rel="noopener noreferrer">{preview.primaryArtifactType === "derived-image-compilation" ? "웹 사례 PDF 열기" : "기관 예시 원문 열기"}<ArrowRight size={15} aria-hidden="true" /></a> : <span>기관 작성 예시 미확인</span>}
          {preview.delivery !== "pending" && <a className={styles.dialogDownload} href={preview.editable} download={preview.delivery === "hosted"} rel="noopener noreferrer"><Download size={16} aria-hidden="true" />{actionLabel(preview)}</a>}
        </div>
      </>}
    </dialog>
  </main>;
}
