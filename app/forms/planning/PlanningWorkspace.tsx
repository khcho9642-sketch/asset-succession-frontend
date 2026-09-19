"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Copy, Download, FileText, Printer } from "lucide-react";
import { clearPlanningDraft, collectPlanningSummaries, getPlanningDraft, planningNumberError, planningSummary, savePlanningDraft, type PlanningAnswers, type PlanningResource } from "@/lib/forms/planning";
import styles from "./PlanningWorkspace.module.css";

export function PlanningWorkspace({ resource, resources }: { resource: PlanningResource; resources: PlanningResource[] }) {
  const [answers, setAnswers] = useState<PlanningAnswers>({});
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [imported, setImported] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const summaryRef = useRef<HTMLTextAreaElement>(null);
  const summary = `${planningSummary(resource, answers)}${imported ? `\n\n이 탭에서 함께 정리한 내용\n${imported}` : ""}`;
  const questions = resource.sections.flatMap(section => section.questions);
  const completed = questions.filter(question => {
    const value = answers[question.id]; return Array.isArray(value) ? value.length > 0 : Boolean(value?.trim());
  }).length;

  useEffect(() => {
    setAnswers(getPlanningDraft(resource));
    setReady(true);
  }, [resource]);
  useEffect(() => {
    if (!ready) return;
    savePlanningDraft(resource, answers);
  }, [answers, ready, resource]);
  useEffect(() => { if (showSummary) summaryRef.current?.focus(); }, [showSummary]);

  function update(id: string, value: string | string[]) {
    setAnswers(previous => ({ ...previous, [id]: value }));
    if (id === "available_summaries") setImported("");
    setNotice("");
  }
  function validateAndShowSummary() {
    if (!ready || !formRef.current?.reportValidity()) return false;
    const invalid = questions.find(question => question.type === "number" && planningNumberError(answers[question.id]));
    if (invalid) { setNotice(`${invalid.label} ${planningNumberError(answers[invalid.id])}`); document.getElementById(invalid.id)?.focus(); return false; }
    setShowSummary(true);
    return true;
  }
  function importPrepared() {
    if (!validateAndShowSummary()) return;
    const selected = Array.isArray(answers.available_summaries) ? answers.available_summaries : [];
    const { summaries, missing } = collectPlanningSummaries(resources, selected);
    setImported(summaries.join("\n\n──────────\n\n"));
    setNotice(summaries.length
      ? `${summaries.length}개 준비자료를 요약에 모았습니다. 전달 전에 아래에서 확인하세요.${missing.length ? ` 작성 내용이 없는 자료: ${missing.join(", ")}.` : ""}`
      : selected.some(id => id !== "none") ? "선택한 자료의 작성 내용이 없습니다. 먼저 해당 자료를 작성해 주세요." : "‘완료했거나 가져갈 점검 자료’에서 모을 자료를 선택해 주세요.");
  }
  function clearAnswers() {
    clearPlanningDraft(resource.id); setAnswers({}); setImported(""); setShowSummary(false);
    setNotice("이 준비자료의 작성 내용과 모은 요약을 지웠습니다. 다른 준비자료의 작성 내용은 유지됩니다.");
  }
  async function copySummary() {
    if (!validateAndShowSummary()) return;
    try { await navigator.clipboard.writeText(summary); setNotice("상담 준비 요약을 복사했습니다."); }
    catch { summaryRef.current?.focus(); summaryRef.current?.select(); setNotice("요약을 선택했습니다. 복사 단축키를 눌러 주세요."); }
  }
  function downloadSummary() {
    if (!validateAndShowSummary()) return;
    const url = URL.createObjectURL(new Blob(["\ufeff", summary], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `${resource.id}_상담준비요약.txt`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <main className={styles.page}>
    <Link className={styles.back} href="/forms/planning"><ArrowLeft size={16} aria-hidden="true" /> 생전 준비자료 전체</Link>
    <header className={styles.heading}><p className={styles.eyebrow}>내 상황 정리 · 상담 준비</p><h1>{resource.title}</h1><p>{resource.description}</p><span className={styles.origin}>자산승계 360 자체 제작 · 상담 준비용</span></header>
    <div className={styles.privacy}>모든 항목은 선택 입력입니다. 주민등록번호·계좌번호·연락처·상세 주소는 적지 마세요. 작성 내용은 현재 페이지에서만 기억하며 다른 준비자료로 이동해도 이어집니다. 새로고침하거나 탭을 닫으면 지워지므로 필요한 요약은 내려받아 주세요. 상담 신청 시 자동 전송되지 않습니다.</div>
    <div className={styles.layout}>
      <form ref={formRef} className={styles.form} onSubmit={event => { event.preventDefault(); validateAndShowSummary(); }}>
        {resource.sections.map((section, index) => <section className={styles.section} key={section.id} aria-labelledby={`section-${section.id}`}>
          <p className={styles.sectionNumber}>{String(index + 1).padStart(2, "0")}</p><h2 id={`section-${section.id}`}>{section.title}</h2><p className={styles.sectionDescription}>{section.description}</p>
          {section.questions.map(question => <div className={styles.field} key={question.id}>
            {question.type === "multiselect" ? <fieldset disabled={!ready} aria-describedby={`help-${question.id}`}><legend>{question.label}</legend><p id={`help-${question.id}`} className={styles.helper}>{question.helper}</p><div className={styles.choices}>{question.options?.map(option => <label key={option.value}>
              <input type="checkbox" checked={Array.isArray(answers[question.id]) && (answers[question.id] as string[]).includes(option.value)} onChange={event => {
                const selected = Array.isArray(answers[question.id]) ? answers[question.id] as string[] : [];
                update(question.id, event.target.checked ? option.exclusive ? [option.value] : [...selected.filter(value => !question.options?.find(entry => entry.value === value)?.exclusive), option.value] : selected.filter(value => value !== option.value));
              }} />{option.label}</label>)}</div></fieldset> : <>
              <label htmlFor={question.id}>{question.label}{question.unit ? <span> ({question.unit})</span> : null}</label><p id={`help-${question.id}`} className={styles.helper}>{question.helper}</p>
              {question.type === "textarea" ? <textarea disabled={!ready} id={question.id} aria-describedby={`help-${question.id}`} value={String(answers[question.id] ?? "")} maxLength={2000} rows={3} onChange={event => update(question.id, event.target.value)} /> : question.type === "select" ?
                <select disabled={!ready} id={question.id} aria-describedby={`help-${question.id}`} value={String(answers[question.id] ?? "")} onChange={event => update(question.id, event.target.value)}><option value="">선택하지 않음</option>{question.options?.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select> :
                <input disabled={!ready} id={question.id} aria-describedby={`help-${question.id}${question.type === "number" && planningNumberError(answers[question.id]) ? ` error-${question.id}` : ""}`} aria-invalid={question.type === "number" && Boolean(planningNumberError(answers[question.id])) || undefined} type={question.type === "number" ? "number" : "text"} min={question.type === "number" ? 0 : undefined} max={question.type === "number" ? 1e12 : undefined} step={question.type === "number" ? "0.01" : undefined} maxLength={2000} value={String(answers[question.id] ?? "")} onChange={event => update(question.id, event.target.value)} />}
              {question.type === "number" && planningNumberError(answers[question.id]) && <p id={`error-${question.id}`} className={styles.fieldError}>{planningNumberError(answers[question.id])}</p>}
            </>}
          </div>)}
        </section>)}
        <button className={styles.primary} disabled={!ready} type="submit"><FileText size={18} aria-hidden="true" /> 상담 준비 요약 만들기</button>
      </form>
      <aside className={styles.side}>
        <p className={styles.eyebrow}>작성한 만큼 준비됩니다</p><strong className={styles.progress}>{completed}<span> / {questions.length} 항목</span></strong><p>빈칸은 ‘미입력’으로 남습니다. 모르는 내용을 채우기 위해 추측하지 않아도 됩니다.</p>
        <button className={styles.secondary} disabled={!ready} onClick={validateAndShowSummary}><FileText size={17} aria-hidden="true" /> 요약 미리보기</button>
        {resource.id === "PLAN-06" && <button className={styles.secondary} disabled={!ready} onClick={importPrepared}>선택한 준비자료 모으기</button>}
        {resource.id !== "PLAN-06" && <Link className={styles.textLink} href="/forms/planning/PLAN-06">상담 준비 묶음으로 <ArrowRight size={15} aria-hidden="true" /></Link>}
        <div className={styles.sideNote}><Check size={18} aria-hidden="true" /><p>요약을 확인하고, 필요한 내용만 상담할 때 전달하세요.</p></div>
        <button className={styles.clearButton} disabled={!ready || completed === 0 && !imported} onClick={clearAnswers}>이 준비자료의 작성 내용 지우기</button>
        {resource.planning_windows?.map(window => <details className={styles.preparation} key={window.label}><summary>{window.label}</summary><ul>{window.availability_conditions.map(condition => <li key={condition}>{condition}</li>)}{window.closing_events.map(condition => <li key={condition}>{condition}</li>)}</ul></details>)}
      </aside>
    </div>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {showSummary && <section className={styles.summary} aria-labelledby="planning-summary-title">
      <p className={styles.eyebrow}>전달 전에 확인하세요</p><h2 id="planning-summary-title">상담 준비 요약</h2><textarea ref={summaryRef} aria-label="상담 준비 요약" value={summary} readOnly rows={18} /><pre className={styles.printSummary}>{summary}</pre>
      <div className={styles.actions}><button onClick={() => void copySummary()}><Copy size={17} aria-hidden="true" /> 복사</button><button onClick={downloadSummary}><Download size={17} aria-hidden="true" /> 텍스트 받기</button><button onClick={() => { if (validateAndShowSummary()) window.print(); }}><Printer size={17} aria-hidden="true" /> 인쇄</button><Link href="/consultation">전문가 상담 안내 <ArrowRight size={17} aria-hidden="true" /></Link></div>
    </section>}
    <p className={styles.bottomNote}>이 준비자료는 기관 제출용 서식이 아닙니다. 법적 효력·세액·적용 요건에 대한 판단은 포함하지 않습니다.</p>
  </main>;
}
