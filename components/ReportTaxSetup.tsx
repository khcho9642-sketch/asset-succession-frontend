"use client";

import { useId, useMemo, useState } from "react";
import { formatAnswer, saveAssessmentForSession, type AssessmentSnapshot } from "@/lib/assessment";
import { attachConfirmedTaxComparison } from "@/lib/chat/tax";
import { createTaxInputFromSnapshot } from "@/lib/chat/tax-snapshot";
import { calculateTaxComparison } from "@/lib/tax-comparison";
import type { TaxComparisonInput } from "@/lib/tax-comparison/types";
import { TaxComparisonEditor } from "./TaxComparisonEditor";
import styles from "./ReportTaxSetup.module.css";

type Props = {
  snapshot: AssessmentSnapshot;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onConfirmed: (snapshot: AssessmentSnapshot, persisted: boolean) => void;
  storageNotice?: string;
};

/** Add calculation conditions to the same assessment, without replacing its confirmed intake. */
export function ReportTaxSetup({ snapshot, expanded, onExpandedChange, onConfirmed, storageNotice }: Props) {
  const id = useId();
  const [input, setInput] = useState<TaxComparisonInput>(() => createTaxInputFromSnapshot(snapshot));
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const comparison = useMemo(() => calculateTaxComparison(input), [input]);
  const existingComparison = useMemo(() => snapshot.taxComparisonInput ? calculateTaxComparison(snapshot.taxComparisonInput) : null, [snapshot]);
  const alreadyCalculated = snapshot.taxComparisonInput?.confirmed === true && existingComparison?.status === "ready";
  const facts = snapshot.conversation?.confirmed_facts?.length
    ? snapshot.conversation.confirmed_facts.map((fact) => ({ id: fact.id, label: fact.label, value: fact.value }))
    : Object.entries(snapshot.answers).map(([key, answer]) => ({ id: key, label: answer.label, value: formatAnswer(answer) }));

  function changeInput(next: TaxComparisonInput) {
    setInput(next.track !== input.track ? createTaxInputFromSnapshot(snapshot, next.track) : { ...next, confirmed: false, confirmedAt: undefined });
    setConfirmed(false);
    setError("");
  }

  function confirmCalculation() {
    if (!confirmed || comparison.status !== "ready") return;
    try {
      const next = attachConfirmedTaxComparison(snapshot, { ...input, confirmed: true, confirmedAt: new Date().toISOString() });
      const persisted = saveAssessmentForSession(next);
      onConfirmed(next, persisted);
      onExpandedChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "계산 조건을 다시 확인해 주세요.");
    }
  }

  if (alreadyCalculated && !expanded) {
    return storageNotice ? <div className={styles.setup} role="status">{storageNotice}</div> : null;
  }

  return (
    <section className={styles.setup} data-report-tax-setup data-report-calculation-state={alreadyCalculated ? "ready" : "pending"} aria-labelledby={`${id}-title`}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>{alreadyCalculated ? "추정 세액 계산 완료" : "추정 세액 계산 전"}</p>
          <h2 id={`${id}-title`}>{alreadyCalculated ? "계산 조건을 바꾸면 추정 세액도 다시 계산합니다." : "상속·증여·양도·가업상속의 추정 세액을 계산하세요."}</h2>
          <p>{alreadyCalculated ? "아래 보고서는 최종 확인한 조건으로 계산했습니다." : "확인한 가족·자산 정보는 이어서 사용합니다. 공제·배분 등 필요한 조건을 확인하면 금액이 포함된 7페이지 보고서가 완성됩니다."}</p>
        </div>
        <button type="button" data-report-tax-setup-toggle aria-expanded={expanded} aria-controls={`${id}-editor`} onClick={() => onExpandedChange(!expanded)}>
          {expanded ? "계산 조건 접기" : alreadyCalculated ? "계산 조건 수정" : "추정 세액 계산하기"}
        </button>
      </div>
      {storageNotice && <p className={styles.notice} role="status">{storageNotice}</p>}
      {expanded && <div id={`${id}-editor`}>
        {facts.length > 0 && <details className={styles.confirmedFacts}>
          <summary>이 진단에서 확인한 가족·자산 정보</summary>
          <dl>{facts.map((fact) => <div key={fact.id}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>
          <p>기존 입력 내용과 진단 ID를 유지합니다. 미확인 항목은 아래에서 직접 확인해 주세요.</p>
        </details>}
        <TaxComparisonEditor value={input} onChange={changeInput} />
        <div className={styles.confirmation}>
          <label htmlFor={`${id}-confirmed`}>
            <input id={`${id}-confirmed`} data-report-tax-confirm type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            <span>재산·가족·공제와 적용 조건을 확인했으며, 이 조건으로 추정 세액을 계산합니다.</span>
          </label>
          <p>{comparison.status === "ready" ? "조건을 최종 확인하면 위 계산 결과가 보고서와 PDF에 동일하게 반영됩니다." : "계산에 필요한 항목을 모두 확인하면 보고서를 완성할 수 있습니다. 빈칸은 0원으로 계산하지 않습니다."}</p>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button type="button" data-report-tax-submit disabled={!confirmed || comparison.status !== "ready"} onClick={confirmCalculation}>추정 세액 보고서 완성하기</button>
        </div>
      </div>}
    </section>
  );
}
