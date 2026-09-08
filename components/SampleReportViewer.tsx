"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState, type CSSProperties, type KeyboardEvent, type TouchEvent } from "react";
import { sampleReportPages } from "@/lib/sampleReport";
import styles from "./SampleReport.module.css";

export function SampleReportViewer() {
  const [pageIndex, setPageIndex] = useState(0);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const page = sampleReportPages[pageIndex];

  function goTo(index: number) {
    setPageIndex(Math.max(0, Math.min(sampleReportPages.length - 1, index)));
    setFailedImage(null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const destination = {
      ArrowLeft: pageIndex - 1,
      ArrowRight: pageIndex + 1,
      Home: 0,
      End: sampleReportPages.length - 1
    }[event.key];
    if (destination === undefined) return;
    event.preventDefault();
    goTo(destination);
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    // Leave native pinch zoom and the overlaid buttons alone.
    if (event.touches.length !== 1 || (event.target as HTMLElement).closest("button, a")) {
      touchStart.current = null;
      return;
    }
    touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || event.touches.length || !event.changedTouches.length) return;
    const dx = event.changedTouches[0].clientX - start.x;
    const dy = event.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      goTo(pageIndex + (dx < 0 ? 1 : -1));
    }
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
        <p className={styles.manualNote}>종이 양옆의 화살표로<br />편한 속도로 넘겨보세요.</p>
      </nav>
      <div className={styles.document}>
        <div className={styles.documentHeader}>
          <h2 className={styles.pageHeading}>{pageIndex + 1} / 7 <span>{page.title}</span></h2>
          <div className={styles.mobileSelect}>
            <label className={styles.srOnly} htmlFor="sample-report-page">페이지 선택</label>
            <select id="sample-report-page" value={pageIndex} onChange={(event) => goTo(Number(event.target.value))}>
              {sampleReportPages.map((item, index) => <option key={item.image} value={index}>{index + 1} / 7 · {item.title}</option>)}
            </select>
          </div>
          <span className={styles.navigationHint}>화살표로 넘기기</span>
        </div>
        <div className={styles.panel} id="sample-report-panel">
          <div className={styles.imageViewport} tabIndex={0} role="region" aria-label="보고서 페이지"
            aria-describedby="sample-report-instructions" onKeyDown={handleKeyDown}
            onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onTouchCancel={() => { touchStart.current = null; }}>
            <div className={styles.sheet} style={{ "--sheet-ratio": page.width / page.height } as CSSProperties}>
              {failedImage === page.image ? <div className={styles.imageError} role="alert">
                <p>이미지를 불러오지 못했습니다.</p>
                <button type="button" onClick={() => setFailedImage(null)}>다시 불러오기</button>
                <a href={page.image} target="_blank" rel="noopener noreferrer">이미지 직접 열기</a>
              </div> : <Image key={page.image} src={page.image}
                alt={`${pageIndex + 1} / 7 · ${page.title}. ${page.headline}`}
                aria-describedby="sample-report-page-description"
                width={page.width} height={page.height} unoptimized loading="eager" decoding="async"
                onError={() => setFailedImage(page.image)} />}
              <button type="button" className={`${styles.pageArrow} ${styles.previousArrow}`}
                onClick={() => goTo(pageIndex - 1)} disabled={pageIndex === 0}
                aria-label="이전 페이지" aria-controls="sample-report-panel">
                <ChevronLeft aria-hidden="true" size={24} />
              </button>
              <button type="button" className={`${styles.pageArrow} ${styles.nextArrow}`}
                onClick={() => goTo(pageIndex + 1)} disabled={pageIndex === sampleReportPages.length - 1}
                aria-label="다음 페이지" aria-controls="sample-report-panel">
                <ChevronRight aria-hidden="true" size={24} />
              </button>
            </div>
          </div>
        </div>
        <p className={styles.srOnly} id="sample-report-instructions">보고서 위의 좌우 화살표, 키보드 방향키 또는 좌우 스와이프로 페이지를 넘길 수 있습니다.</p>
        <p className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">{pageIndex + 1} / 7 · {page.title}</p>
        <p className={styles.srOnly} id="sample-report-page-description">{page.points.join(" ")}</p>
      </div>
    </section>
  );
}
