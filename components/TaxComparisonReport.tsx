"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { PrintButton } from "@/components/PrintButton";
import type { AssessmentSnapshot } from "@/lib/assessment";
import { formatWon } from "@/lib/tax-comparison";
import { getScopeStatement, getTaxFields, TAX_TRACK_LABELS } from "@/lib/tax-comparison/config";
import type { TaxCase, TaxComparison, TaxField } from "@/lib/tax-comparison/types";
import styles from "./TaxComparisonReport.module.css";

type Props = { snapshot: AssessmentSnapshot; comparison: TaxComparison };

function differenceText(baseline: TaxCase, candidate: TaxCase) {
  const difference = baseline.totalTaxWon - candidate.totalTaxWon;
  return difference === 0 ? `${formatWon(0)} · 차이 없음` : `${formatWon(Math.abs(difference))} ${difference > 0 ? "감소" : "증가"}`;
}

function fieldValue(field: TaxField, value: string | undefined) {
  if (value === undefined || value.trim() === "") return "미확인";
  if (field.type === "select") return field.options?.find((option) => option.value === value)?.label ?? "선택값 확인 필요";
  if (field.type === "date") return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : `${value} · 날짜 확인 필요`;
  if (field.type === "integer") return field.key === "businessEligiblePercent" ? `${value}%` : value;
  // Display only: tax arithmetic and rounding live in the shared calculation engine.
  if (/^\d+(?:\.\d{1,8})?$/.test(value.trim())) {
    const [whole, decimal = ""] = value.trim().split(".");
    const won = Number(whole) * 100_000_000 + Number(decimal.padEnd(8, "0"));
    if (Number.isSafeInteger(won)) return formatWon(won);
  }
  return `${value}억원 · 입력 확인 필요`;
}

function Page({ number, title, subtitle, children }: { number: number; title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className={`report-page ${styles.page}`} data-report-page={number}>
      <header className={styles.pageHeader}>
        <span className={styles.brand}>자산승계 360</span>
        <span>예상 세액 비교 보고서 <b>{String(number).padStart(2, "0")} / 07</b></span>
      </header>
      <div data-report-content className={styles.content}>
        <div className={styles.pageTitle}><p>{subtitle}</p><h2>{title}</h2></div>
        {children}
      </div>
      <footer className={styles.pageFooter}><span>확인한 입력 조건에 따른 예상 계산 · 신고 전 적용 요건 확인</span><span>{number}</span></footer>
    </section>
  );
}

function Card({ title, children, accent = false }: { title: string; children: ReactNode; accent?: boolean }) {
  return <section className={`${styles.card} ${accent ? styles.accentCard : ""}`}><h3>{title}</h3>{children}</section>;
}

function CalculationLines({ item, compact = false }: { item: TaxCase; compact?: boolean }) {
  return (
    <dl className={`${styles.calculation} ${compact ? styles.compactCalculation : ""}`}>
      {item.lines.map((line, index) => <div key={`${line.label}-${index}`}><dt>{line.label}{line.note && <small>{line.note}</small>}</dt><dd>{formatWon(line.amountWon)}</dd></div>)}
    </dl>
  );
}

function Pending({ comparison }: { comparison: TaxComparison }) {
  return <div className={styles.pending}><h3>{comparison.status === "unsupported" ? "현재 입력 조건은 계산 범위 확인이 필요합니다" : "계산 조건이 아직 확인되지 않았습니다"}</h3><ul>{comparison.missing.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul><p>위 항목을 확인하면 세액과 대안 간 차이를 계산할 수 있습니다. 미확인 금액을 0원으로 표시하지 않습니다.</p></div>;
}

function Bullets({ items }: { items: string[] }) {
  return <ul className={styles.bullets}>{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>;
}

export function TaxComparisonReport({ snapshot, comparison }: Props) {
  const input = snapshot.taxComparisonInput;
  const baseline = comparison.status === "ready" ? comparison.baseline : null;
  const alternatives = comparison.status === "ready" ? comparison.alternatives.slice(0, 2) : [];
  const best = alternatives.reduce<TaxCase | null>((selected, candidate) => !selected || candidate.totalTaxWon < selected.totalTaxWon ? candidate : selected, null);
  const cases = baseline ? [baseline, ...alternatives] : [];
  const values = input?.values ?? {};
  const fields = getTaxFields(comparison.track, values).filter((field) => !["resident", "standardCase", "availableCash"].includes(field.key));
  const businessInheritance = comparison.track === "business_succession" && values.businessMethod === "inheritance";
  const createdOn = /^\d{4}-\d{2}-\d{2}/.test(snapshot.created_at) ? snapshot.created_at.slice(0, 10) : "작성일 확인 필요";
  const cash = comparison.availableCashWon;
  const residentLabel = comparison.track === "gift" ? "수증자 거주자 여부" : comparison.track === "business_succession" ? businessInheritance ? "피상속인 거주자 여부" : "증여자·수증자 거주자 여부" : comparison.track === "capital_gains" ? "양도자 거주자 여부" : "피상속인 거주자 여부";

  return (
    <article className={`report-book ${styles.book}`} data-report-mode="tax-comparison" data-tax-report-status={comparison.status}>
      <div className={styles.toolbar}>
        <div><p>직접 확인한 조건으로 계산한 결과</p><h1>{TAX_TRACK_LABELS[comparison.track]} 예상 세액 비교</h1></div>
        <div><Link href="/precheck">대화·계산 조건 수정</Link><PrintButton /></div>
      </div>

      <Page number={1} title="우리 가족의 세금, 선택에 따라 얼마나 달라질까요?" subtitle="핵심 결과">
        <div className={styles.reportMeta}><span>{createdOn}</span><span>{snapshot.assessment_id}</span><span>{input?.confirmed ? "계산 조건 확인 완료" : "계산 조건 확인 필요"}</span></div>
        <p className={styles.intro}>{comparison.title}</p>
        <p className={styles.scope}>{comparison.scope}</p>
        {baseline ? <>
          <div className={styles.metrics}>
            <div><span>{baseline.label}</span><strong data-tax-report-baseline>{formatWon(baseline.totalTaxWon)}</strong><small>비교 대상 예상 세금 합계</small></div>
            <div><span>{best?.label ?? "비교 대안"}</span><strong data-tax-report-alternative>{best ? formatWon(best.totalTaxWon) : "대안 없음"}</strong><small>계산한 대안 중 세액이 가장 낮은 안</small></div>
          </div>
          <div className={styles.delta} data-tax-report-difference><span>기준안과의 세액 차이</span><strong>{best ? differenceText(baseline, best) : "비교할 대안이 없습니다"}</strong><p>동일한 비교 대상과 입력 조건에서 산정했습니다. 실행 비용을 차감한 순이익을 뜻하지 않습니다.</p></div>
          <Card title="이 결과를 읽는 방법"><Bullets items={["2페이지에서 계산에 사용한 금액과 조건을 확인합니다.", "3~5페이지에서 기준안과 대안의 과세표준·공제·세액을 나란히 비교합니다.", "6~7페이지에서 필요한 납부재원과 실제 실행 전 확인할 내용을 점검합니다."]} /></Card>
        </> : <Pending comparison={comparison} />}
      </Page>

      <Page number={2} title="이번 비교에 사용한 입력 조건" subtitle="가족·자산·적용 요건">
        <p className={styles.scope}>대화 후 직접 확인한 계산 항목입니다. 알려지지 않은 항목은 미확인으로 남깁니다.</p>
        <dl className={styles.facts}>
          <div><dt>비교 분야</dt><dd>{TAX_TRACK_LABELS[comparison.track]}</dd></div>
          <div><dt>{residentLabel}</dt><dd>{values.resident === "yes" ? comparison.track === "business_succession" && !businessInheritance ? "두 사람 모두 국내 거주자" : "국내 거주자" : values.resident === "no" ? comparison.track === "business_succession" && !businessInheritance ? "비거주자 포함" : "비거주자" : "미확인"}</dd></div>
          {fields.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{fieldValue(field, values[field.key] ?? (field.key === "capitalAsset" ? "commercial" : field.key === "businessMethod" ? "gift" : undefined))}</dd></div>)}
          <div><dt>납부에 사용할 수 있는 현금</dt><dd>{cash === null ? "미확인" : formatWon(cash)}</dd></div>
          <div><dt>계산 적용 조건 확인</dt><dd>{values.standardCase === "yes" ? "해당 조건을 확인했습니다" : "미확인"}</dd></div>
        </dl>
        <Card title="고객이 확인한 계산 범위"><p>{getScopeStatement(comparison.track, values)}</p></Card>
      </Page>

      <Page number={3} title="기준안의 예상 세액 계산" subtitle="계산 과정과 근거">
        {baseline ? <>
          <div className={styles.caseHeading}><h3>{baseline.label}</h3><strong>{formatWon(baseline.totalTaxWon)}</strong></div>
          <p className={styles.formula}>계산에 반영한 재산가액·공제 → 과세표준 → 산출세액 → 세액공제 → 예상 세액</p>
          <CalculationLines item={baseline} />
          <div className={styles.taxTotals}><span>국세 산출세액 <b>{formatWon(baseline.grossTaxWon)}</b></span><span>적용 세액공제 <b>{formatWon(baseline.creditWon)}</b></span><span>국세 납부 예상액 <b>{formatWon(baseline.nationalTaxWon)}</b></span><span>비교에 포함한 지방세 <b>{formatWon(baseline.localTaxWon)}</b></span><span>예상 세금 합계 <b>{formatWon(baseline.totalTaxWon)}</b></span></div>
          <p className={styles.roundingNote}>납부 예상액은 세액공제와 해당 세목의 끝수 처리를 반영한 금액입니다.{comparison.track === "gift" ? " 수증자별로 세율과 공제를 적용한 뒤 합산합니다." : ""}</p>
          <Card title="이 계산에 적용한 가정"><Bullets items={baseline.assumptions.length ? baseline.assumptions : comparison.assumptions} /></Card>
        </> : <Pending comparison={comparison} />}
      </Page>

      <Page number={4} title="같은 조건에서 대안별 세액 비교" subtitle="기준안과 실행 대안">
        <p className={styles.scope}>{comparison.scope}</p>
        {baseline ? <>
          <div className={styles.tableWrap}><table className={styles.comparisonTable}>
            <caption>단위: 원 · 차이는 기준안 대비 세액의 감소 또는 증가입니다.</caption>
            <thead><tr><th scope="col">비교 항목</th>{cases.map((item) => <th scope="col" key={item.id} data-tax-case={item.id} data-tax-amount={item.totalTaxWon}>{item.label}</th>)}</tr></thead>
            <tbody>
              {([ [comparison.track === "gift" ? "수증자별 과세표준 합계" : "과세표준", "taxableWon"], ["산출세액", "grossTaxWon"], ["세액공제", "creditWon"], ["국세", "nationalTaxWon"], ["포함한 지방세", "localTaxWon"], ["예상 세금 합계", "totalTaxWon"] ] as const).map(([label, key]) => <tr key={key} className={key === "totalTaxWon" ? styles.totalRow : ""}><th scope="row">{label}</th>{cases.map((item) => <td key={item.id}>{formatWon(item[key])}</td>)}</tr>)}
              <tr className={styles.differenceRow}><th scope="row">기준안 대비</th>{cases.map((item, index) => <td key={item.id}>{index === 0 ? "비교 기준" : differenceText(baseline, item)}</td>)}</tr>
            </tbody>
          </table></div>
          <Card title="비교를 해석할 때 확인할 점"><Bullets items={["각 대안은 이 페이지 상단에 표시한 동일한 비교 대상 재산을 기준으로 계산합니다. 변경되는 배분·수증자 수·시점·특례 조건은 각 대안의 가정에 표시됩니다.", "세액이 가장 낮은 대안이 가족에게 가장 적합한 선택이라는 뜻은 아닙니다. 소유권·현금흐름·가족별 배분을 함께 검토합니다.", "비교 대상 밖의 세금과 실행 비용은 6페이지에서 별도로 확인합니다."]} /></Card>
          {comparison.assumptions.length > 0 && <Card title="공통 계산 가정"><Bullets items={comparison.assumptions} /></Card>}
        </> : <Pending comparison={comparison} />}
      </Page>

      <Page number={5} title="대안별로 무엇이 달라지나요?" subtitle="변경 조건과 계산 내역">
        {baseline && alternatives.length > 0 ? <div className={styles.alternatives}>{alternatives.map((item, index) => <section className={styles.alternative} key={item.id} data-tax-case={item.id} data-tax-amount={item.totalTaxWon}>
          <div className={styles.caseHeading}><h3><span>0{index + 1}</span> {item.label}</h3><strong>{formatWon(item.totalTaxWon)}</strong></div>
          <p className={styles.caseDifference}>기준안 대비 {differenceText(baseline, item)}</p>
          <CalculationLines item={item} compact />
          <dl className={styles.alternativeSettlement}>
            <div><dt>국세 산출세액</dt><dd>{formatWon(item.grossTaxWon)}</dd></div>
            <div><dt>적용 세액공제</dt><dd>{formatWon(item.creditWon)}</dd></div>
            <div><dt>국세 납부 예상액</dt><dd>{formatWon(item.nationalTaxWon)}</dd></div>
            <div><dt>포함한 지방세</dt><dd>{formatWon(item.localTaxWon)}</dd></div>
          </dl>
          <p className={styles.roundingNote}>산출세액에서 공제를 반영한 뒤 끝수 처리한 국세와 지방세를 합산합니다.</p>
          {item.assumptions.length > 0 && <div className={styles.alternativeAssumptions}><Bullets items={item.assumptions} /></div>}
        </section>)}</div> : baseline ? <Card title="비교 대안 없음"><p>현재 입력 조건에서 계산된 추가 대안이 없습니다. 기준안의 계산 근거를 확인한 뒤 변경 가능한 조건을 검토해 주세요.</p></Card> : <Pending comparison={comparison} />}
      </Page>

      <Page number={6} title="세금을 낼 현금까지 준비되어 있나요?" subtitle="납부재원과 계산 제외 항목">
        <div className={styles.cashHeadline} data-tax-cash-status={cash === null ? "unknown" : "known"}><span>직접 확인한 납부 가능 현금</span><strong>{cash === null ? "아직 확인하지 않았습니다" : formatWon(cash)}</strong></div>
        <p className={styles.scope}>현금 부족액은 예상 세금 합계에서 실제 납부에 사용할 수 있는 현금을 차감해 계산합니다. 보유 자산 전체를 현금으로 간주하지 않습니다.</p>
        {baseline ? <div className={styles.cashRows}>{cases.map((item) => <div key={item.id}><h3>{item.label}</h3><dl><div><dt>예상 세금 합계</dt><dd>{formatWon(item.totalTaxWon)}</dd></div><div><dt>현금 부족액</dt><dd>{cash === null ? "현금 확인 후 계산" : formatWon(Math.max(0, item.totalTaxWon - cash))}</dd></div></dl></div>)}</div> : <Pending comparison={comparison} />}
        <Card title="이번 계산에 포함되지 않은 항목"><Bullets items={comparison.exclusions} /></Card>
        <Card title="납부 계획에서 별도로 확인할 사항"><p>납부 기한, 분납·연부연납 요건, 담보와 이자, 자산 매각 시점 및 비용은 이 현금 부족액에 자동 반영되지 않습니다. 실제 납부 일정과 자금 사용 가능 시점을 함께 확인해야 합니다.</p></Card>
      </Page>

      <Page number={7} title="입력 확인에서 실제 실행까지" subtitle="다음 단계와 법령 근거">
        <ol className={styles.nextSteps}>
          <li><span>01</span><div><h3>재산가액과 권리관계 확인</h3><p>평가액, 소유 지분, 취득가액, 채무·과거 증여 등 이번 계산에 사용한 사실을 증빙과 대조합니다.</p></div></li>
          <li><span>02</span><div><h3>공제와 특례 적용 요건 검토</h3><p>거주자 여부, 가족관계와 공제, 보유·거주 기간, 가업승계 적용 및 사후관리 조건 중 해당 항목을 확인합니다.</p></div></li>
          <li><span>03</span><div><h3>대안을 선택하고 납부·신고 계획 수립</h3><p>세액 차이와 가족별 배분·실행 비용을 함께 검토한 뒤 필요한 계약, 신고와 자금 일정을 정합니다.</p></div></li>
        </ol>
        <div className={styles.referenceHeading}><h3>계산에 사용한 공식 근거</h3><p>법령 확인일: {comparison.lawCheckedOn}</p></div>
        <ul className={styles.references}>{comparison.references.map((reference, index) => <li key={`${reference.url}-${index}`}><a href={reference.url} target="_blank" rel="noreferrer">{reference.label}</a><span>{reference.url}</span></li>)}</ul>
        <div className={styles.endNote}><p>이 보고서는 위 확인일에 검토한 규칙과 고객이 확인한 조건으로 산출한 예상 결과입니다. 실제 과세 사건의 적용 법령, 평가와 증빙 확인 결과에 따라 세액이 달라질 수 있습니다.</p><strong>계산 조건이 달라지면, 대화에서 수정하고 다시 비교하세요.</strong></div>
      </Page>
    </article>
  );
}
