"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { TaxComparisonReport } from "@/components/TaxComparisonReport";
import { createSampleTaxReport, sampleTaxReportSections } from "@/lib/sampleTaxReport";
import styles from "./SampleReport.module.css";

const PAGE_COUNT = sampleTaxReportSections.length;

export function SampleReportViewer() {
  const [{ snapshot, comparison }] = useState(createSampleTaxReport);
  const [currentPage, setCurrentPage] = useState(1);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [fit, setFit] = useState({ height: 0, scale: 1 });
  const viewerRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const contentsButtonRef = useRef<HTMLButtonElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const report = documentRef.current;
    const sheets = report?.querySelectorAll<HTMLElement>("[data-report-page]");
    if (!stage || !report || !sheets?.length) return;
    let disposed = false;
    let sheetWidth = 0;
    let sheetHeight = 0;
    function fitBook() {
      if (disposed || !stage || !sheetWidth || !sheetHeight || !stage.clientWidth || !stage.clientHeight || matchMedia("print").matches) return;
      const scale = Math.min(stage.clientWidth / sheetWidth, stage.clientHeight / sheetHeight);
      if (!Number.isFinite(scale) || scale <= 0) return;
      setFit(previous => previous.height === sheetHeight && Math.abs(previous.scale - scale) < .0001
        ? previous : { height: sheetHeight, scale });
    }

    function measureBook() {
      if (disposed || !report || !sheets?.length || matchMedia("print").matches) return;
      // Measure every sheet at its natural height before fixing one common canvas.
      // Restore the screen state synchronously, before the browser can paint it.
      report.setAttribute("data-sample-measuring", "true");
      try {
        sheetWidth = Math.max(...Array.from(sheets, sheet => sheet.offsetWidth));
        sheetHeight = Math.max(...Array.from(sheets, sheet => sheet.offsetHeight));
      } finally {
        report.removeAttribute("data-sample-measuring");
      }
      fitBook();
    }

    measureBook();
    const observer = new ResizeObserver(fitBook);
    observer.observe(stage);
    void document.fonts.ready.then(measureBook);
    document.fonts.addEventListener("loadingdone", measureBook);
    return () => { disposed = true; observer.disconnect(); document.fonts.removeEventListener("loadingdone", measureBook); };
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
            <ol>{sampleTaxReportSections.map((title, index) => <li key={title}>
              <button type="button" aria-current={currentPage === index + 1 ? "page" : undefined} onClick={() => goToPage(index + 1, true)}>
                <span>{String(index + 1).padStart(2, "0")}</span> {title}
              </button>
            </li>)}</ol>
          </nav>
        </div>
        <p className={styles.pageIndicator} aria-live="polite" aria-atomic="true"><span>{currentPage} / {PAGE_COUNT}</span><strong>{sampleTaxReportSections[currentPage - 1]}</strong></p>
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
          <div ref={documentRef} className={styles.document} data-sample-document data-fitted={fit.height > 0 ? "true" : "false"}
            style={{ "--sample-sheet-height": `${fit.height}px`, transform: `translate(-50%, -50%) scale(${fit.scale})` } as CSSProperties}>
            <TaxComparisonReport snapshot={snapshot} comparison={comparison} sample />
          </div>
        </div>
        <button type="button" className={styles.next} aria-label="다음 페이지" disabled={currentPage === PAGE_COUNT} onClick={() => goToPage(currentPage + 1)}>
          <svg data-page-arrow width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m9 5 7 7-7 7" /></svg>
        </button>
      </div>
    </section>
  );
}
