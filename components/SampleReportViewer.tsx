"use client";

import { useEffect, useRef, useState } from "react";
import { TaxComparisonReport } from "@/components/TaxComparisonReport";
import { createSampleTaxReport, sampleTaxReportSections } from "@/lib/sampleTaxReport";
import styles from "./SampleReport.module.css";

export function SampleReportViewer() {
  const [{ snapshot, comparison }] = useState(createSampleTaxReport);
  const [currentPage, setCurrentPage] = useState(1);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    let observer: IntersectionObserver | undefined;
    const observePages = () => {
      observer?.disconnect();
      // Use height-based pixels so wide, short viewports retain an observation band.
      const height = window.innerHeight;
      observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) setCurrentPage(Number((entry.target as HTMLElement).dataset.reportPage));
        }
      }, { rootMargin: `-${Math.round(height * .12)}px 0px -${Math.round(height * .72)}px 0px`, threshold: 0 });
      reportRef.current?.querySelectorAll("[data-report-page]").forEach(page => observer?.observe(page));
    };
    observePages();
    window.addEventListener("resize", observePages);
    return () => { observer?.disconnect(); window.removeEventListener("resize", observePages); };
  }, []);

  function selectPage(number: number) {
    const page = document.getElementById(`report-page-${number}`);
    if (!page) return;
    setCurrentPage(number);
    page.focus({ preventScroll: true });
    page.scrollIntoView({ block: "start", behavior: "instant" });
  }

  return (
    <section className={styles.viewer} aria-label="7장 샘플 보고서">
      <nav className={styles.pageList} aria-label="보고서 목차">
        <p>보고서 목차 <span>7페이지</span></p>
        <ol>{sampleTaxReportSections.map((title, index) => (
          <li key={title}><a href={`#report-page-${index + 1}`} onClick={() => setCurrentPage(index + 1)} aria-current={currentPage === index + 1 ? "location" : undefined}>
            <span>{String(index + 1).padStart(2, "0")}</span>{title}
          </a></li>
        ))}</ol>
        <p className={styles.manualNote}>추정 세액부터 계산 근거까지,<br />아래로 내려 읽어보세요.</p>
      </nav>
      <div ref={reportRef} className={styles.document}>
        <div className={styles.mobileSelect}>
          <label htmlFor="sample-report-page">페이지 선택</label>
          <select id="sample-report-page" value={currentPage} onChange={event => selectPage(Number(event.target.value))}>
            {sampleTaxReportSections.map((title, index) => <option key={title} value={index + 1}>{index + 1} / 7 · {title}</option>)}
          </select>
        </div>
        <TaxComparisonReport snapshot={snapshot} comparison={comparison} sample />
      </div>
    </section>
  );
}
