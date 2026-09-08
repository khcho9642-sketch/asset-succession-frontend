import type { ReactNode } from "react";
import "@fontsource-variable/noto-serif-kr/wght.css";
import styles from "./PaperReportLayout.module.css";

type BookProps = {
  children: ReactNode;
  mode: string;
  status?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
};

/** One visual template for the sample's paper style and every generated report. */
export function PaperReportBook({ children, mode, status, title, subtitle, actions, className }: BookProps) {
  return (
    <article
      className={`report-book ${styles.book}${className ? ` ${className}` : ""}`}
      data-report-mode={mode}
      data-tax-report-status={status}
      data-report-template="paper-seven-v1"
    >
      <div className={`print:hidden ${styles.toolbar}`}>
        <div className={styles.toolbarHeading}>
          <p>자산승계 360 · 진단 보고서</p>
          <h1>{title}</h1>
          {subtitle && <p className={styles.toolbarSubtitle}>{subtitle}</p>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      {children}
    </article>
  );
}

type PageProps = {
  number: number;
  label: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
};

export function PaperReportPage({ number, label, title, subtitle, children, className }: PageProps) {
  const pageNumber = String(number).padStart(2, "0");
  const section = ["summary", "facts", "comparison", "detail", "detail", "cash", "execution"][number - 1];
  return (
    <section className={`report-page ${styles.page}${className ? ` ${className}` : ""}`} data-report-page={number} data-report-section={section}>
      <header className={styles.pageHeader}>
        <span className={styles.brand}>자산승계 <span>360</span></span>
        <span className={styles.documentLabel}>자산승계 진단 보고서</span>
      </header>
      <div className={styles.heading}>
        <div className={styles.sectionLabel}>
          <span className={styles.sectionNumber} data-paper-number aria-hidden="true">{pageNumber}</span>
          <p>{label}</p>
        </div>
        <h2>{title}</h2>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      <div className={styles.content} data-report-content>{children}</div>
      <footer className={styles.pageFooter}>
        <span>AI 사전진단 · 전문가 검토 전</span>
        <span className={styles.pageCount}>{pageNumber} / 07</span>
      </footer>
    </section>
  );
}

export function PaperReportCard({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`${styles.card}${className ? ` ${className}` : ""}`}>
      {title && <h3>{title}</h3>}
      {children}
    </section>
  );
}
