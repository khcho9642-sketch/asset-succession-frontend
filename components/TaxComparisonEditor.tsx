"use client";

import { useId, useMemo } from "react";
import { calculateTaxComparison, formatWon } from "@/lib/tax-comparison";
import { getScopeStatement, getTaxFields, getTrackDescription, TAX_TRACK_LABELS } from "@/lib/tax-comparison/config";
import type { TaxComparisonInput, TaxField, TaxTrack } from "@/lib/tax-comparison/types";
import styles from "./TaxComparisonEditor.module.css";

type Props = {
  value: TaxComparisonInput;
  onChange: (input: TaxComparisonInput) => void;
};

export function TaxComparisonEditor({ value, onChange }: Props) {
  const prefix = useId();
  const comparison = useMemo(() => calculateTaxComparison(value), [value]);
  const configuredFields = getTaxFields(value.track, value.values);
  const subtype = configuredFields.find((field) => ["capitalAsset", "businessMethod"].includes(field.key));
  const fields = configuredFields.filter((field) => !["resident", "standardCase", "availableCash", "capitalAsset", "businessMethod"].includes(field.key));
  const businessInheritance = value.track === "business_succession" && value.values.businessMethod === "inheritance";
  const bestAlternative = comparison.alternatives.reduce<(typeof comparison.alternatives)[number] | null>(
    (best, candidate) => !best || candidate.totalTaxWon < best.totalTaxWon ? candidate : best,
    null
  );
  const difference = comparison.baseline && bestAlternative ? comparison.baseline.totalTaxWon - bestAlternative.totalTaxWon : null;

  function changeField(key: string, nextValue: string) {
    if (key === "capitalAsset" || key === "businessMethod") {
      // Reusing a confirmation from a different legal scope would silently assert eligibility.
      const safeKeys = key === "capitalAsset" ? ["salePrice", "purchasePrice", "expenses", "availableCash"] : ["businessYears", "availableCash"];
      const nextValues = Object.fromEntries(safeKeys.filter((field) => value.values[field] !== undefined).map((field) => [field, value.values[field]]));
      onChange({ ...value, values: { ...nextValues, [key]: nextValue }, confirmed: false, confirmedAt: undefined });
      return;
    }
    const nextValues = { ...value.values, [key]: nextValue };
    const visibleKeys = new Set(["standardCase", ...getTaxFields(value.track, nextValues).map((field) => field.key)]);
    // Clear dependent values as soon as their question disappears.
    const prunedValues = Object.fromEntries(Object.entries(nextValues).filter(([field]) => visibleKeys.has(field)));
    if (["businessPropertyType", "companySize"].includes(key)) {
      delete prunedValues.eligibilityConfirmed;
      delete prunedValues.standardCase;
    }
    onChange({ ...value, values: prunedValues, confirmed: false, confirmedAt: undefined });
  }

  function changeTrack(track: TaxTrack) {
    onChange({ version: 1, track, values: value.values.availableCash ? { availableCash: value.values.availableCash } : {}, confirmed: false });
  }

  function renderField(field: TaxField) {
    const id = `${prefix}-${field.key}`;
    const hintId = `${id}-hint`;
    return (
      <div className={styles.field} key={field.key}>
        <label htmlFor={id}>{field.label}{field.optional && <span className={styles.optional}>선택</span>}</label>
        {field.type === "select" ? (
          <select id={id} data-tax-field={field.key} value={value.values[field.key] ?? (field.key === "capitalAsset" ? "commercial" : field.key === "businessMethod" ? "gift" : "")} onChange={(event) => changeField(field.key, event.target.value)} aria-describedby={field.hint ? hintId : undefined}>
            {!["capitalAsset", "businessMethod"].includes(field.key) && <option value="">선택해 주세요</option>}
            {field.options?.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
          </select>
        ) : (
          <div className={styles.inputWrap}>
            <input id={id} data-tax-field={field.key} type={field.type === "date" ? "date" : "text"} inputMode={field.type === "date" ? undefined : field.type === "money" || field.key === "businessEligiblePercent" ? "decimal" : "numeric"} autoComplete="off" value={value.values[field.key] ?? ""} placeholder="직접 입력" onChange={(event) => changeField(field.key, event.target.value)} aria-describedby={field.hint ? hintId : undefined} />
            {field.type === "money" && <span className={styles.unit}>억원</span>}
          </div>
        )}
        {field.hint && <p id={hintId} className={styles.hint}>{field.hint}</p>}
      </div>
    );
  }

  return (
    <section className={styles.editor} aria-labelledby={`${prefix}-title`} data-tax-editor>
      <div className={styles.heading}>
        <p className={styles.eyebrow}>세액 비교</p>
        <h3 id={`${prefix}-title`}>같은 조건에서, 세금이 얼마나 달라질까요?</h3>
        <p>대화에서 정리한 내용과 아래 계산 조건을 함께 확인해 주세요. 입력한 조건으로 예상 세액을 바로 계산합니다.</p>
      </div>

      <div className={styles.field}>
        <label htmlFor={`${prefix}-track`}>비교할 세금</label>
        <select id={`${prefix}-track`} data-tax-field="track" value={value.track} onChange={(event) => changeTrack(event.target.value as TaxTrack)}>
          {(Object.entries(TAX_TRACK_LABELS) as Array<[TaxTrack, string]>).map(([track, label]) => <option key={track} value={track}>{label}</option>)}
        </select>
        <p className={styles.hint}>{getTrackDescription(value.track, value.values)}</p>
      </div>

      {subtype && <div className={styles.subtype}>{renderField(subtype)}</div>}

      <div className={styles.scope}>
        <label className={styles.scopeCheck} htmlFor={`${prefix}-standardCase`}>
          <input id={`${prefix}-standardCase`} data-tax-field="standardCase" type="checkbox" checked={value.values.standardCase === "yes"} onChange={(event) => changeField("standardCase", event.target.checked ? "yes" : "")} />
          <span><strong>이번 계산의 적용 조건에 해당합니다.</strong><span>{getScopeStatement(value.track, value.values)}</span></span>
        </label>
        <p>해당 여부가 불확실하면 체크하지 않고 적용 조건부터 확인해 주세요.</p>
      </div>

      <div className={styles.fields}>
        {renderField({ key: "resident", label: value.track === "gift" ? "받는 사람의 국내 거주자 여부" : value.track === "business_succession" ? businessInheritance ? "피상속인의 국내 거주자 여부" : "증여자·수증자의 국내 거주자 여부" : value.track === "capital_gains" ? "양도자의 국내 거주자 여부" : "피상속인의 국내 거주자 여부", type: "select", options: [{ value: "yes", label: value.track === "business_succession" && !businessInheritance ? "두 사람 모두 국내 거주자" : "국내 거주자" }, { value: "no", label: value.track === "business_succession" && !businessInheritance ? "비거주자 포함" : "비거주자" }], hint: "세법상 거주자 여부를 확인해 선택해 주세요." })}
        {fields.map(renderField)}
      </div>

      <div className={styles.cash}>
        {renderField({ key: "availableCash", label: "실제 세금 납부에 사용할 수 있는 현금", type: "money", optional: true, hint: "자산 총액과 구분해 입력하세요. 확인한 현금이 없으면 0, 아직 모르면 빈칸으로 둡니다." })}
      </div>

      <div className={styles.result} data-tax-comparison-status={comparison.status} data-tax-summary aria-live="polite" aria-atomic="true">
        <p className={styles.resultLabel}>{comparison.status === "ready" ? "입력 조건에 따른 예상 세액" : comparison.status === "unsupported" ? "적용 조건 확인이 필요합니다" : "계산에 필요한 내용을 확인해 주세요"}</p>
        {comparison.status === "ready" && comparison.baseline ? (
          <>
            <div className={styles.metrics}>
              <div><span>{comparison.baseline.label}</span><strong data-tax-baseline>{formatWon(comparison.baseline.totalTaxWon)}</strong></div>
              <div><span>{bestAlternative?.label ?? "비교 대안"}</span><strong data-tax-alternative>{bestAlternative ? formatWon(bestAlternative.totalTaxWon) : "대안 없음"}</strong></div>
              <div className={styles.delta}><span>{difference === null ? "세액 차이" : difference > 0 ? "세액 감소" : difference < 0 ? "세액 증가" : "세액 차이"}</span><strong data-tax-difference>{difference === null ? "비교 대기" : formatWon(Math.abs(difference))}</strong></div>
            </div>
            {(comparison.baseline.totalTaxWon === 0 || bestAlternative?.totalTaxWon === 0) && <p className={styles.zeroNote}>0원으로 표시된 안도 확인한 조건에 따라 계산한 결과입니다. 적용된 비과세·공제와 과세표준은 보고서 계산 내역에 표시합니다.</p>}
            <p className={styles.scopeNote}>{comparison.scope} 법령 확인일: {comparison.lawCheckedOn}.</p>
            <p className={styles.hint}>위 차이는 비교 대상 세금의 차이입니다. 제외된 비용을 반영한 최종 이익이나 확정 납부세액은 아닙니다.</p>
          </>
        ) : (
          <ul className={styles.missing} data-tax-missing>
            {comparison.missing.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
            {comparison.missing.length === 0 && <li>위 적용 조건과 계산 항목을 확인해 주세요.</li>}
          </ul>
        )}
      </div>
      <p className={styles.footnote}>금액은 억원 단위입니다. 1,000만원은 0.1, 1억원은 1로 입력합니다. 빈칸은 0원으로 처리하지 않습니다.</p>
    </section>
  );
}
