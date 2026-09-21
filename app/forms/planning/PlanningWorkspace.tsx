"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Copy, Download, ExternalLink, FileText, Printer } from "lucide-react";
import { clearPlanningDraft, collectPlanningSummaries, getPlanningDraft, planningNumberError, planningSummary, savePlanningDraft, type PlanningAnswers, type PlanningResource } from "@/lib/forms/planning";
import styles from "./PlanningWorkspace.module.css";
import { PLANNING_GUIDANCE } from "@/lib/forms/planning-guidance";
import { resourceUrl } from "@/lib/forms/catalog";
import { guidesForResource, type GuideTiming } from "@/lib/forms/guides";
import { LOOKUP_SERVICES, type LookupService } from "@/lib/forms/lookup-services";
import { POST_DEATH_LOOKUP_SERVICES, type PostDeathLookupService } from "@/lib/forms/post-death-lookup-services";

const lookupGroups: readonly { timing: GuideTiming; title: string; services: readonly (LookupService | PostDeathLookupService)[] }[] = [
  { timing: "before-death", title: "생전 조회사이트와 기록 예시", services: LOOKUP_SERVICES },
  { timing: "after-death", title: "상속 후 조회사이트와 기록 예시", services: POST_DEATH_LOOKUP_SERVICES },
];

function LookupFieldHelp({ resourceId, questionId }: { resourceId: string; questionId: string }) {
  return <>{lookupGroups.map(group => {
    const entries = group.services.flatMap(service => service.targets
      .filter(target => target.resourceId === resourceId && target.questionId === questionId)
      .map(target => ({ service, target })));
    if (!entries.length) return null;
    return <details key={group.timing} className={styles.lookupHelp} data-lookup-field={questionId} data-lookup-timing={group.timing}>
      <summary>{group.title} <span>{entries.length}개</span></summary>
      <ul>{entries.map(({ service, target }) => <li key={service.id}>
        <strong>{service.title}</strong><p>{target.record}</p>
        <p className={styles.lookupExample}>기록 예시: {target.example}</p>
        <p className={styles.lookupAuth}>{service.authentication.text}</p>
        {"application" in service && <p className={styles.lookupAuth}>신청 대상: {service.application.eligibility}<br />이용 방법: {service.application.channel}</p>}
        <div className={styles.lookupActions}>
          <a href={service.url} target="_blank" rel="noopener noreferrer">{service.provider} 열기 <ExternalLink size={14} aria-hidden="true" /><span> (새 창)</span></a>
          <Link href={`/forms/guides/${group.timing}#lookup-${service.id}`}>{group.timing === "after-death" ? "신청 자격·준비서류·확인 항목 보기" : "확인할 항목·조회 범위 보기"} <ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
      </li>)}</ul>
    </details>;
  })}</>;
}

function ReadableSummary({ resource, answers, imported }: { resource: PlanningResource; answers: PlanningAnswers; imported: string }) {
  // Use the existing formatter and the exact authored placeholders. User text,
  // including blank lines or brackets, never determines headings or row labels.
  const values = new Map([...resource.summary_template.matchAll(/\{\{\s*([A-Za-z0-9_-]+)\s*\}\}( 만원)?/g)].map(([placeholder, id]) =>
    [id, planningSummary({ ...resource, summary_template: placeholder }, answers)] as const));
  return <div className={styles.summaryReading}>
    {resource.sections.map(section => <div className={styles.summaryBlock} key={section.id}>
      <h3>{section.title}</h3>
      {section.questions.map(question => <dl key={question.id}><dt>{question.label}</dt><dd className={values.get(question.id) === "미입력" ? styles.unanswered : undefined}>{values.get(question.id) ?? "미입력"}</dd></dl>)}
    </div>)}
    {imported && <div className={`${styles.summaryBlock} ${styles.importedSummary}`}><h3>선택해 모은 준비자료</h3><pre>{imported}</pre></div>}
  </div>;
}

export function PlanningWorkspace({ resource, resources }: { resource: PlanningResource; resources: PlanningResource[] }) {
  const guidance = PLANNING_GUIDANCE[resource.id];
  const guideContexts = guidesForResource(resource.id);
  const [answers, setAnswers] = useState<PlanningAnswers>({});
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [imported, setImported] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const summaryRef = useRef<HTMLTextAreaElement>(null);
  const summaryHeadingRef = useRef<HTMLHeadingElement>(null);
  const rawSummaryRef = useRef<HTMLDetailsElement>(null);
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
  useEffect(() => { if (showSummary) summaryHeadingRef.current?.focus(); }, [showSummary]);

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
  function viewSummary() {
    if (validateAndShowSummary() && showSummary) summaryHeadingRef.current?.focus();
  }
  function importPrepared() {
    if (!validateAndShowSummary()) return;
    if (showSummary) summaryHeadingRef.current?.focus();
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
    catch { if (rawSummaryRef.current) rawSummaryRef.current.open = true; summaryRef.current?.focus(); summaryRef.current?.select(); setNotice("요약을 선택했습니다. 복사 단축키를 눌러 주세요."); }
  }
  function downloadSummary() {
    if (!validateAndShowSummary()) return;
    const url = URL.createObjectURL(new Blob(["\ufeff", summary], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `${resource.id}_상담준비요약.txt`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className={styles.canvas}><main className={styles.page}>
    <Link className={styles.back} href="/forms/planning"><ArrowLeft size={16} aria-hidden="true" /> 승계 준비자료 전체</Link>
    <header className={styles.heading}><p className={styles.eyebrow}>자산승계 360 자체 제작 · 상담 준비용</p><h1>{resource.title}</h1><p>{resource.description}</p></header>
    {guidance && <section className={styles.readFirst} aria-label="작성 전 사용 안내">
      <h2>이렇게 활용하세요</h2><p>{guidance.start}</p><p className={styles.outcome}>{guidance.outcome}</p>
      {guidance.table && <div className={styles.comparisonScroll} tabIndex={0} role="region" aria-label="방법별 비교 안내"><table>
        <thead><tr>{guidance.table.headings.map(heading => <th scope="col" key={heading}>{heading}</th>)}</tr></thead>
        <tbody>{guidance.table.rows.map(row => <tr key={row[0]}>{row.map((cell, index) => index === 0 ? <th scope="row" key={index}>{cell}</th> : <td key={index}>{cell}</td>)}</tr>)}</tbody>
      </table></div>}
      <a className={styles.textLink} href="#planning-questions">필요한 질문부터 정리하기 <ArrowRight size={15} aria-hidden="true" /></a>
    </section>}
    <div className={styles.privacy}>
      <p>모든 질문은 선택 입력입니다. 작성 내용은 이 탭에서만 이어지며, <strong>새로고침하거나 탭을 닫으면 지워집니다.</strong></p>
      <details><summary>민감정보 입력 금지 · 보관 안내</summary><p>주민등록번호·계좌번호·연락처·상세 주소는 적지 마세요. 다른 준비자료로 이동해도 작성 내용은 이어집니다. 필요한 요약은 저장해 주세요. 상담 신청 시 자동 전송되지 않습니다.</p></details>
    </div>
    {lookupGroups.some(group => group.services.some(service => service.targets.some(target => target.resourceId === resource.id))) && <aside className={styles.lookupIntro} aria-label="조회 결과 기록 안내">
      <strong>조회 결과로 채우고 싶다면</strong><p>아래 질문 옆에서 ‘생전’ 또는 ‘상속 후’ 조회 안내를 펼쳐 보세요. 공식 사이트는 새 창으로 열리며, 조회 결과는 직접 필요한 내용만 적습니다. 본인인증 정보나 원본 증명서를 이 화면에 입력하지 마세요.</p>
      <p>상속 후에는 신청인 본인의 인증과 상속관계 증빙 등 기관별 절차를 따릅니다. 사망자의 로그인·인증수단을 대신 사용하지 마세요. <Link href="/forms/guides/after-death#estate-inquiry">상속인의 재산·채무 조회 안내</Link></p>
    </aside>}
    <div className={styles.workspaceTools} id="planning-questions">
      <div className={styles.progress} aria-live="polite"><strong>{completed}</strong><span> / {questions.length}문항 작성</span><small>빈칸은 ‘미입력’으로 남습니다.</small></div>
      <button className={styles.summaryButton} disabled={!ready} onClick={viewSummary}><FileText size={17} aria-hidden="true" /> 요약 보기</button>
    </div>
    <nav className={styles.sectionNav} aria-label="준비자료 구역 이동">{resource.sections.map((section, index) => <a href={`#section-${section.id}`} key={section.id}><span>{index + 1}</span>{section.title}</a>)}</nav>
    <div className={styles.layout}>
      <form ref={formRef} className={styles.form} onSubmit={event => { event.preventDefault(); viewSummary(); }}>
        {resource.sections.map((section, index) => <section className={styles.section} key={section.id} aria-labelledby={`section-${section.id}`}>
          <div className={styles.sectionHeading}><span className={styles.sectionNumber}>{String(index + 1).padStart(2, "0")}</span><h2 id={`section-${section.id}`}>{section.title}</h2><span className={styles.sectionCount}>{section.questions.length}문항</span></div><p className={styles.sectionDescription}>{section.description}</p>
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
            <LookupFieldHelp resourceId={resource.id} questionId={question.id} />
            {resource.id === "PLAN-06" && question.id === "available_summaries" && <div className={styles.importHint}><p>선택한 자료 중 이 탭에서 작성한 내용만 요약에 더합니다.</p><button className={styles.secondary} type="button" disabled={!ready} onClick={importPrepared}>선택한 준비자료 모으기</button></div>}
          </div>)}
        </section>)}
        <button className={styles.primary} disabled={!ready} type="submit"><FileText size={18} aria-hidden="true" /> 상담 준비 요약 만들기</button>
      </form>
      <aside className={styles.side}>
        <h2>상담에 가져갈 요약</h2><p>아는 내용만 정리해도 됩니다. 요약을 확인한 뒤 복사·저장·인쇄하세요.</p>
        <button className={styles.secondary} disabled={!ready} onClick={viewSummary}><FileText size={17} aria-hidden="true" /> 요약 미리보기</button>
        {resource.id === "PLAN-06" && <button className={styles.secondary} disabled={!ready} onClick={importPrepared}>선택한 준비자료 모으기</button>}
        {resource.id !== "PLAN-06" && <Link className={styles.textLink} href="/forms/planning/PLAN-06">상담 준비 묶음으로 <ArrowRight size={15} aria-hidden="true" /></Link>}
        <div className={styles.sideNote}><Check size={18} aria-hidden="true" /><p>요약을 확인하고, 필요한 내용만 상담할 때 전달하세요.</p></div>
        <button className={styles.clearButton} disabled={!ready || completed === 0 && !imported} onClick={clearAnswers}>이 준비자료의 작성 내용 지우기</button>
        {resource.planning_windows?.map(window => <details className={styles.preparation} key={window.label}><summary>{window.label}</summary><ul>{window.availability_conditions.map(condition => <li key={condition}>{condition}</li>)}{window.closing_events.map(condition => <li key={condition}>{condition}</li>)}</ul></details>)}
        {guidance && <nav className={styles.referenceLinks} aria-label="함께 확인할 서류"><h3>함께 확인할 서류</h3>
          {guidance.resources.map(item => <Link key={item.id} href={resourceUrl(item.id)}>{item.title}<ArrowRight size={14} aria-hidden="true" /></Link>)}
        </nav>}
        {guideContexts.length > 0 && <nav className={styles.referenceLinks} aria-label="관련 진행 가이드"><h3>전체 과정에서 보기</h3>
          {guideContexts.map(context => <Link key={context.href} href={context.href}>{context.guideTitle} · {context.stepTitle}<ArrowRight size={14} aria-hidden="true" /></Link>)}
        </nav>}
      </aside>
    </div>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {showSummary && <section className={styles.summary} aria-labelledby="planning-summary-title">
      <p className={styles.eyebrow}>작성한 내용 확인</p><h2 ref={summaryHeadingRef} tabIndex={-1} id="planning-summary-title">상담 준비 요약</h2>
      <ReadableSummary resource={resource} answers={answers} imported={imported} />
      <details ref={rawSummaryRef} className={styles.rawSummary}><summary>복사·저장용 전체 텍스트</summary><textarea ref={summaryRef} aria-label="상담 준비 요약" value={summary} readOnly rows={18} /></details><pre className={styles.printSummary}>{summary}</pre>
      <div className={styles.actions}><button onClick={() => void copySummary()}><Copy size={17} aria-hidden="true" /> 복사</button><button onClick={downloadSummary}><Download size={17} aria-hidden="true" /> 텍스트 받기</button><button onClick={() => { if (validateAndShowSummary()) window.print(); }}><Printer size={17} aria-hidden="true" /> 인쇄</button><Link href="/consultation">전문가 상담 안내 <ArrowRight size={17} aria-hidden="true" /></Link></div>
    </section>}
    <p className={styles.bottomNote}>이 준비자료는 기관 제출용 서식이 아닙니다. 법적 효력·세액·적용 요건에 대한 판단은 포함하지 않습니다.</p>
  </main></div>;
}
