"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { sampleReportPages } from "@/lib/sampleReport";
import styles from "./SampleReport.module.css";

export function SampleReportViewer() {
  const [pageIndex, setPageIndex] = useState(0);
  const [view, setView] = useState<"image" | "text">("image");
  const [zoomed, setZoomed] = useState(false);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const page = sampleReportPages[pageIndex];

  function goTo(index: number, returnToStart = false) {
    setPageIndex(Math.max(0, Math.min(sampleReportPages.length - 1, index)));
    setZoomed(false);
    setFailedImage(null);
    viewportRef.current?.scrollTo({ top: 0, left: 0, behavior: "instant" });
    if (returnToStart) window.requestAnimationFrame(() => {
      headingRef.current?.focus({ preventScroll: true });
      headingRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
    });
  }

  return (
    <section className={styles.viewer} aria-label="7장 샘플 보고서">
      <nav className={styles.pageList} aria-label="보고서 목차">
        <p>보고서 목차 <span>7장</span></p>
        <ol>{sampleReportPages.map((item, index) => (
          <li key={item.image}><button type="button" onClick={() => goTo(index)}
            aria-current={pageIndex === index ? "page" : undefined} aria-controls="sample-report-panel">
            <span>{String(index + 1).padStart(2, "0")}</span>{item.title}
          </button></li>
        ))}</ol>
        <p className={styles.manualNote}>자동으로 넘어가지 않습니다.<br />편한 속도로 읽어보세요.</p>
      </nav>
      <div className={styles.document}>
        <div className={styles.mobileSelect}>
          <label htmlFor="sample-report-page">페이지 선택</label>
          <select id="sample-report-page" value={pageIndex} onChange={(event) => goTo(Number(event.target.value))}>
            {sampleReportPages.map((item, index) => <option key={item.image} value={index}>{index + 1} / 7 · {item.title}</option>)}
          </select>
        </div>
        <div className={styles.toolbar}>
          <div className={styles.viewOptions} role="group" aria-label="읽기 방식">
            <button type="button" aria-pressed={view === "image"} onClick={() => setView("image")}>보고서 이미지</button>
            <button type="button" aria-pressed={view === "text"} onClick={() => setView("text")}>큰 글씨 요약</button>
          </div>
          {view === "image" ? <button type="button" className={styles.zoomButton} aria-pressed={zoomed}
            onClick={() => { setZoomed(!zoomed); viewportRef.current?.scrollTo({ top: 0, left: 0, behavior: "instant" }); }}>
            {zoomed ? "화면에 맞춤" : "2배 확대"}
          </button> : null}
        </div>
        <div className={styles.panel} id="sample-report-panel">
          <h2 ref={headingRef} tabIndex={-1} className={styles.pageHeading}>{String(pageIndex + 1).padStart(2, "0")} <span>{page.title}</span></h2>
          {view === "image" ? <>
            <p className={styles.hint}>{zoomed ? "보고서 안에서 좌우·위아래로 움직여 읽어보세요." : "작은 글씨는 ‘2배 확대’ 또는 ‘큰 글씨 요약’으로 읽어보세요."}</p>
            <div ref={viewportRef} className={styles.imageViewport} tabIndex={0} role="region" aria-label={`${page.title} 이미지 확대 영역`}>
              {failedImage === page.image ? <div className={styles.imageError} role="alert">
                <p>이미지를 불러오지 못했습니다.</p>
                <button type="button" onClick={() => setFailedImage(null)}>다시 불러오기</button>
                <button type="button" onClick={() => setView("text")}>큰 글씨 요약으로 읽기</button>
                <a href={page.image} target="_blank" rel="noopener noreferrer">이미지 직접 열기</a>
              </div> : <div className={styles.sheet} data-zoomed={zoomed}>
                <Image key={page.image} src={page.image} alt={`${pageIndex + 1} / 7 · ${page.title}. ${page.headline} 핵심 내용은 큰 글씨 요약에서 확인할 수 있습니다.`}
                  width={page.width} height={page.height} unoptimized loading="eager" decoding="async"
                  onError={() => setFailedImage(page.image)} />
              </div>}
            </div>
          </> : <article className={styles.readableSummary}>
            <p className={styles.summaryLabel}>이 페이지의 핵심 내용</p>
            <h3>{page.headline}</h3>
            <ul>{page.points.map((point) => <li key={point}>{point}</li>)}</ul>
            <p className={styles.summaryNote}>이미지의 핵심을 큰 글씨로 정리한 요약입니다. 세부 구성은 보고서 이미지에서 확인하세요.</p>
          </article>}
        </div>
        <nav className={styles.pagination} aria-label="보고서 페이지 이동">
          <button type="button" onClick={() => goTo(pageIndex - 1, true)} disabled={pageIndex === 0} aria-label="이전 페이지">← 이전</button>
          <p role="status" aria-live="polite" aria-atomic="true"><strong>{pageIndex + 1}</strong> / 7<span className={styles.srOnly}> · {page.title}</span></p>
          <button type="button" onClick={() => goTo(pageIndex + 1, true)} disabled={pageIndex === sampleReportPages.length - 1} aria-label="다음 페이지">다음 →</button>
        </nav>
      </div>
    </section>
  );
}
