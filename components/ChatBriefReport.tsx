"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ChatBriefReport as BriefReport } from "@/lib/chat/brief-report";
import { PrintButton } from "./PrintButton";
import styles from "./ChatBriefReport.module.css";

export function ChatBriefReport({ report, onBack, onCalculate }: { report: BriefReport; onBack: () => void; onCalculate: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, []);
  return <article className={styles.report} data-chat-brief-report aria-label="간략 검토보고서">
    <div className={styles.actions}>
      <button onClick={onBack}><ArrowLeft size={16} aria-hidden="true" /> 대화로 돌아가기</button>
      <PrintButton />
    </div>
    <header className={styles.heading}>
      <p className={styles.brand}>자산승계 360</p>
      <h2 ref={headingRef} tabIndex={-1}>간략 검토보고서</h2>
      <p>대화 기반 검토 초안 · 고객 확인 전 · 세액 미산정</p>
      <small>작성일 {new Date(report.createdAt).toLocaleDateString("ko-KR")}</small>
    </header>
    <section className={styles.conclusion} aria-label="현재 판단과 다음 행동">
      {report.sections.map(section => <section key={section.title}><h3>{section.title}</h3><p>{section.body}</p></section>)}
    </section>
    <section className={styles.facts}>
      <h3>말씀하신 상황</h3>
      <p className={styles.note}>고객 원문을 바탕으로 정리한 내용입니다. 다른 부분은 대화로 돌아가 수정해 주세요.</p>
      <dl>{report.facts.map(fact => <div key={fact.key}><dt>{fact.label}</dt><dd>{fact.value}<details><summary>원문 근거</summary>{fact.evidence.map((evidence, index) => <p key={index}>{evidence}</p>)}</details></dd></div>)}</dl>
    </section>
    <section className={styles.pending}>
      <h3>추가로 확인할 내용</h3>
      {report.pending.length ? <ul>{report.pending.map(item => <li key={item}>{item}</li>)}</ul> : <p>대화에서 별도로 표시된 미확인 항목은 없습니다. 재산 평가와 적용 요건은 증빙으로 확인해야 합니다.</p>}
    </section>
    <aside className={styles.limits}><strong>세액과 실행 가능성은 확인 전입니다.</strong><p>이 보고서는 상담 준비를 위한 AI 검토 초안입니다. 고객 원문과 AI 의견을 구분해 표시했으며, 법률·세무 검토나 신고·접수가 완료된 결과가 아닙니다. 세액은 계산 조건을 확인한 뒤 기존 계산기로 산정합니다.</p></aside>
    <div className={styles.next}>
      <button onClick={onCalculate}>세액 계산·상세 보고서 준비 <ArrowRight size={17} aria-hidden="true" /></button>
      <p>계산 조건이 아직 부족해도 이 간략 보고서는 인쇄하거나 PDF로 저장할 수 있습니다.</p>
    </div>
  </article>;
}
