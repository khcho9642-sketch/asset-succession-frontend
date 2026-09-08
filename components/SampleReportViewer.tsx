"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import Image from "next/image";
import { sampleReportPages } from "@/lib/sampleReport";
import styles from "./SampleReport.module.css";

const PAGE_COUNT = sampleReportPages.length;
// One A4 canvas for every original image; contain preserves each image's proportions.
const SHEET_WIDTH = 1050;
const SHEET_HEIGHT = 1485;

export function SampleReportViewer() {
  const [currentPage, setCurrentPage] = useState(1);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [scale, setScale] = useState<number | null>(null);
  const viewerRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const contentsButtonRef = useRef<HTMLButtonElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    function fitBook() {
      if (!stage?.clientWidth || !stage.clientHeight || matchMedia("print").matches) return;
      const nextScale = Math.min(stage.clientWidth / SHEET_WIDTH, stage.clientHeight / SHEET_HEIGHT);
      if (!Number.isFinite(nextScale) || nextScale <= 0) return;
      setScale(previous => previous !== null && Math.abs(previous - nextScale) < .0001 ? previous : nextScale);
    }

    fitBook();
    const observer = new ResizeObserver(fitBook);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [expanded]);

  function goToPage(number: number, focusViewer = false) {
    setCurrentPage(Math.min(PAGE_COUNT, Math.max(1, number)));
    setContentsOpen(false);
    if (focusViewer) viewerRef.current?.focus({ preventScroll: true });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      if (contentsOpen) { setContentsOpen(false); contentsButtonRef.current?.focus({ preventScroll: true }); }
      else if (expanded) setExpanded(false);
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest("input, select, textarea, [contenteditable=true], [data-sample-contents]")) return;
    const destination = event.key === "ArrowLeft" ? currentPage - 1 : event.key === "ArrowRight" ? currentPage + 1
      : event.key === "Home" ? 1 : event.key === "End" ? PAGE_COUNT : null;
    if (destination === null) return;
    event.preventDefault();
    goToPage(destination);
  }

  return (
    <section ref={viewerRef} tabIndex={-1} className={`${styles.viewer} ${expanded ? styles.expanded : ""}`}
      aria-label="7장 샘플 보고서" data-sample-viewer data-current-page={currentPage}
      data-expanded={expanded ? "true" : "false"} onKeyDown={handleKeyDown}>
      <div className={styles.viewerToolbar}>
        <div className={styles.contentsControl}>
          <button ref={contentsButtonRef} type="button" className={styles.toolButton}
            aria-expanded={contentsOpen} aria-controls="sample-report-contents" onClick={() => setContentsOpen(open => !open)}>목차</button>
          <nav id="sample-report-contents" data-sample-contents className={styles.contentsPanel} aria-label="보고서 목차" hidden={!contentsOpen}>
            <p>보고서 목차 <span>7장</span></p>
            <ol>{sampleReportPages.map(({ title }, index) => <li key={title}>
              <button type="button" aria-current={currentPage === index + 1 ? "page" : undefined} onClick={() => goToPage(index + 1, true)}>
                <span>{String(index + 1).padStart(2, "0")}</span> {title}
              </button>
            </li>)}</ol>
          </nav>
        </div>
        <p className={styles.pageIndicator} aria-live="polite" aria-atomic="true"><span>{currentPage} / {PAGE_COUNT}</span><strong>{sampleReportPages[currentPage - 1].title}</strong></p>
        <div className={styles.viewerActions}>
          <button type="button" className={styles.toolButton} aria-pressed={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "기본 화면" : "크게 보기"}</button>
          <button type="button" className={styles.toolButton} onClick={() => window.print()}>PDF 저장</button>
        </div>
      </div>
      {contentsOpen && <button type="button" className={styles.contentsBackdrop} aria-label="목차 닫기" onClick={() => { setContentsOpen(false); contentsButtonRef.current?.focus({ preventScroll: true }); }} />}
      <div className={styles.readingArea}>
        <button type="button" className={styles.previous} aria-label="이전 페이지" disabled={currentPage === 1} onClick={() => goToPage(currentPage - 1)}>
          <svg data-page-arrow width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m15 5-7 7 7 7" /></svg>
        </button>
        <div ref={stageRef} className={styles.stage} data-sample-stage
          onTouchStart={event => { const touch = event.touches[0]; touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null; }}
          onTouchCancel={() => { touchStart.current = null; }}
          onTouchEnd={event => {
            const touch = event.changedTouches[0];
            const start = touchStart.current;
            touchStart.current = null;
            if (!touch || !start) return;
            const dx = touch.clientX - start.x;
            const dy = touch.clientY - start.y;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) goToPage(currentPage + (dx < 0 ? 1 : -1));
          }}>
          <div className={styles.document} data-sample-document data-sample-image-report data-fitted={scale !== null ? "true" : "false"}
            style={{ "--sample-sheet-width": `${SHEET_WIDTH}px`, "--sample-sheet-height": `${SHEET_HEIGHT}px`, transform: `translate(-50%, -50%) scale(${scale ?? 1})` } as CSSProperties}>
            {sampleReportPages.map((page, index) => (
              <section key={page.image} id={`report-page-${index + 1}`} data-report-page={index + 1}
                className={styles.imageSheet} aria-labelledby={`sample-page-title-${index + 1}`}>
                <Image src={page.image} width={page.width} height={page.height}
                  alt={`${index + 1}장 ${page.title}: ${page.headline}`} className={styles.pageImage}
                  data-sample-page-image unoptimized loading="eager" />
                <div className={styles.srOnly}>
                  <h2 id={`sample-page-title-${index + 1}`}>{page.title}</h2>
                  <p>샘플 · 가상 사례 · AI 사전진단 · 전문가 검토 전</p>
                  <p>{page.headline}</p>
                  <ul>{page.points.map(point => <li key={point}>{point}</li>)}</ul>
                </div>
              </section>
            ))}
          </div>
        </div>
        <button type="button" className={styles.next} aria-label="다음 페이지" disabled={currentPage === PAGE_COUNT} onClick={() => goToPage(currentPage + 1)}>
          <svg data-page-arrow width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m9 5 7 7-7 7" /></svg>
        </button>
      </div>
    </section>
  );
}
