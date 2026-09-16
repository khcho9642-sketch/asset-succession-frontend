"use client";

import { RotateCcw, Calculator, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  calculateCapitalGainsTax,
  calculateGiftTax,
  calculateInheritanceTax,
  formatWon,
  parseWonInput,
} from "@/lib/simple-calculator";
import type {
  CapitalGainsInput,
  GiftInput,
  InheritanceInput,
  SimpleCalculationResult,
  SimpleTaxKind,
} from "@/lib/simple-calculator";
import styles from "./calculator.module.css";

type FormValues = Record<string, string | boolean>;

const tabs: Array<{ kind: SimpleTaxKind; label: string; caption: string }> = [
  { kind: "inheritance", label: "상속세", caption: "상속개시일·재산·공제" },
  { kind: "gift", label: "증여세", caption: "증여일·관계·10년 공제" },
  { kind: "capitalGains", label: "양도소득세", caption: "양도일·취득가·경비" },
];

const initialForms: Record<SimpleTaxKind, FormValues> = {
  inheritance: {
    deathDate: "2026-09-16",
    spouse: "yes",
    spouseSoleHeir: false,
    childrenCount: "2",
    minorDeductionWon: "0",
    seniorCount: "0",
    disabledDeductionWon: "0",
    realEstateWon: "1200000000",
    financialAssetsWon: "200000000",
    otherAssetsWon: "100000000",
    deemedAssetsWon: "0",
    nonTaxableWon: "0",
    priorGiftSpouseWon: "0",
    priorGiftHeirsWon: "0",
    priorGiftOthersWon: "0",
    debtWon: "100000000",
    publicChargesWon: "0",
    funeralWon: "8000000",
    burialWon: "0",
    spouseActualInheritanceWon: "500000000",
    statutoryShareNumerator: "3",
    statutoryShareDenominator: "7",
    spousePriorGiftTaxableWon: "0",
  },
  gift: {
    giftDate: "2026-09-16",
    resident: "yes",
    relationship: "linealAscendantAdult",
    amountWon: "100000000",
    debtAssumedWon: "0",
    priorGiftWon: "0",
    usedDeductionWon: "0",
    appraisalFeeWon: "0",
    marriageBirthDeductionWon: "0",
    previousTaxPaidWon: "0",
    generationSkip: false,
    minorOverTwoBillion: false,
  },
  capitalGains: {
    transferDate: "2026-09-16",
    acquisitionDate: "2016-09-15",
    assetType: "generalBuilding",
    salePriceWon: "900000000",
    purchasePriceWon: "600000000",
    necessaryExpenseWon: "30000000",
    otherCapitalGainWon: "0",
    basicDeductionUsedWon: "0",
    residenceYears: "0",
    homeCount: "0",
    regulatedArea: false,
  },
};

function money(values: FormValues, key: string): number | null {
  return parseWonInput(String(values[key] ?? ""));
}

function integer(values: FormValues, key: string): number | null {
  const raw = String(values[key] ?? "").trim();
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

function buildInput(kind: SimpleTaxKind, values: FormValues): InheritanceInput | GiftInput | CapitalGainsInput {
  if (kind === "inheritance") {
    return {
      deathDate: String(values.deathDate ?? ""),
      spouse: values.spouse === "no" ? "no" : "yes",
      spouseSoleHeir: values.spouseSoleHeir === true,
      childrenCount: integer(values, "childrenCount"),
      minorDeductionWon: money(values, "minorDeductionWon"),
      seniorCount: integer(values, "seniorCount"),
      disabledDeductionWon: money(values, "disabledDeductionWon"),
      realEstateWon: money(values, "realEstateWon"),
      financialAssetsWon: money(values, "financialAssetsWon"),
      otherAssetsWon: money(values, "otherAssetsWon"),
      deemedAssetsWon: money(values, "deemedAssetsWon"),
      nonTaxableWon: money(values, "nonTaxableWon"),
      priorGiftSpouseWon: money(values, "priorGiftSpouseWon"),
      priorGiftHeirsWon: money(values, "priorGiftHeirsWon"),
      priorGiftOthersWon: money(values, "priorGiftOthersWon"),
      debtWon: money(values, "debtWon"),
      publicChargesWon: money(values, "publicChargesWon"),
      funeralWon: money(values, "funeralWon"),
      burialWon: money(values, "burialWon"),
      spouseActualInheritanceWon: money(values, "spouseActualInheritanceWon"),
      statutoryShareNumerator: integer(values, "statutoryShareNumerator"),
      statutoryShareDenominator: integer(values, "statutoryShareDenominator"),
      spousePriorGiftTaxableWon: money(values, "spousePriorGiftTaxableWon"),
    };
  }
  if (kind === "gift") {
    return {
      giftDate: String(values.giftDate ?? ""),
      resident: values.resident === "no" ? "no" : "yes",
      relationship: String(values.relationship ?? "linealAscendantAdult") as GiftInput["relationship"],
      amountWon: money(values, "amountWon"),
      debtAssumedWon: money(values, "debtAssumedWon"),
      priorGiftWon: money(values, "priorGiftWon"),
      usedDeductionWon: money(values, "usedDeductionWon"),
      appraisalFeeWon: money(values, "appraisalFeeWon"),
      marriageBirthDeductionWon: money(values, "marriageBirthDeductionWon"),
      previousTaxPaidWon: money(values, "previousTaxPaidWon"),
      generationSkip: values.generationSkip === true,
      minorOverTwoBillion: values.minorOverTwoBillion === true,
    };
  }
  return {
    transferDate: String(values.transferDate ?? ""),
    acquisitionDate: String(values.acquisitionDate ?? ""),
    assetType: String(values.assetType ?? "generalBuilding") as CapitalGainsInput["assetType"],
    salePriceWon: money(values, "salePriceWon"),
    purchasePriceWon: money(values, "purchasePriceWon"),
    necessaryExpenseWon: money(values, "necessaryExpenseWon"),
    otherCapitalGainWon: money(values, "otherCapitalGainWon"),
    basicDeductionUsedWon: money(values, "basicDeductionUsedWon"),
    residenceYears: integer(values, "residenceYears"),
    homeCount: integer(values, "homeCount"),
    regulatedArea: values.regulatedArea === true,
  };
}

function calculate(kind: SimpleTaxKind, values: FormValues): SimpleCalculationResult {
  const input = buildInput(kind, values);
  if (kind === "inheritance") return calculateInheritanceTax(input as InheritanceInput);
  if (kind === "gift") return calculateGiftTax(input as GiftInput);
  return calculateCapitalGainsTax(input as CapitalGainsInput);
}

function Field({
  values,
  name,
  label,
  type = "text",
  hint,
  onChange,
}: {
  values: FormValues;
  name: string;
  label: string;
  type?: string;
  hint?: string;
  onChange: (name: string, value: string) => void;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input
        name={name}
        type={type}
        inputMode={type === "text" ? "numeric" : undefined}
        value={String(values[name] ?? "")}
        onChange={(event) => onChange(name, event.target.value)}
        aria-describedby={hint ? `${name}-hint` : undefined}
      />
      {hint ? <small id={`${name}-hint`}>{hint}</small> : null}
    </label>
  );
}

function SelectField({
  values,
  name,
  label,
  options,
  onChange,
}: {
  values: FormValues;
  name: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  onChange: (name: string, value: string) => void;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <select value={String(values[name] ?? "")} onChange={(event) => onChange(name, event.target.value)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function CheckField({
  values,
  name,
  label,
  onChange,
}: {
  values: FormValues;
  name: string;
  label: string;
  onChange: (name: string, value: boolean) => void;
}) {
  return (
    <label className={styles.checkField}>
      <input type="checkbox" checked={values[name] === true} onChange={(event) => onChange(name, event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function FormFields({
  kind,
  values,
  setValue,
}: {
  kind: SimpleTaxKind;
  values: FormValues;
  setValue: (name: string, value: string | boolean) => void;
}) {
  if (kind === "inheritance") {
    return (
      <>
        <section className={styles.group}>
          <h2>기본정보</h2>
          <div className={styles.grid}>
            <Field values={values} name="deathDate" label="상속개시일" type="date" onChange={setValue} />
            <SelectField values={values} name="spouse" label="배우자" onChange={setValue}
              options={[{ value: "yes", label: "있음" }, { value: "no", label: "없음" }]} />
            <Field values={values} name="childrenCount" label="자녀 수" onChange={setValue} />
            <Field values={values} name="seniorCount" label="연로자 수" onChange={setValue} />
          </div>
          <CheckField values={values} name="spouseSoleHeir" label="배우자 단독상속으로 일괄공제를 적용하지 않음" onChange={setValue} />
        </section>
        <section className={styles.group}>
          <h2>재산과 차감 항목</h2>
          <div className={styles.grid}>
            <Field values={values} name="realEstateWon" label="부동산가액" hint="원 단위" onChange={setValue} />
            <Field values={values} name="financialAssetsWon" label="금융재산가액" hint="현금·예금·주식 등" onChange={setValue} />
            <Field values={values} name="otherAssetsWon" label="기타재산가액" onChange={setValue} />
            <Field values={values} name="deemedAssetsWon" label="퇴직금·보험금·신탁재산 등" onChange={setValue} />
            <Field values={values} name="nonTaxableWon" label="비과세·과세가액 불산입액" onChange={setValue} />
            <Field values={values} name="debtWon" label="채무" onChange={setValue} />
            <Field values={values} name="publicChargesWon" label="공과금" onChange={setValue} />
            <Field values={values} name="funeralWon" label="일반 장례비용" onChange={setValue} />
            <Field values={values} name="burialWon" label="봉안시설·자연장지 비용" onChange={setValue} />
          </div>
        </section>
        <section className={styles.group}>
          <h2>공제·사전증여</h2>
          <div className={styles.grid}>
            <Field values={values} name="minorDeductionWon" label="미성년자 공제액" hint="나이별 계산액을 직접 입력" onChange={setValue} />
            <Field values={values} name="disabledDeductionWon" label="장애인 공제액" onChange={setValue} />
            <Field values={values} name="priorGiftSpouseWon" label="10년 이내 배우자 사전증여" onChange={setValue} />
            <Field values={values} name="priorGiftHeirsWon" label="10년 이내 배우자 외 상속인 사전증여" onChange={setValue} />
            <Field values={values} name="priorGiftOthersWon" label="5년 이내 상속인 외 사전증여" onChange={setValue} />
            <Field values={values} name="spouseActualInheritanceWon" label="배우자 실제 상속액" onChange={setValue} />
            <Field values={values} name="statutoryShareNumerator" label="배우자 법정지분 분자" onChange={setValue} />
            <Field values={values} name="statutoryShareDenominator" label="배우자 법정지분 분모" onChange={setValue} />
            <Field values={values} name="spousePriorGiftTaxableWon" label="배우자 사전증여 과세표준" onChange={setValue} />
          </div>
        </section>
      </>
    );
  }
  if (kind === "gift") {
    return (
      <>
        <section className={styles.group}>
          <h2>기본정보</h2>
          <div className={styles.grid}>
            <Field values={values} name="giftDate" label="증여일" type="date" onChange={setValue} />
            <SelectField values={values} name="resident" label="수증자 거주자 여부" onChange={setValue}
              options={[{ value: "yes", label: "거주자" }, { value: "no", label: "비거주자" }]} />
            <SelectField values={values} name="relationship" label="증여자와의 관계" onChange={setValue}
              options={[
                { value: "spouse", label: "배우자" },
                { value: "linealAscendantAdult", label: "직계존속 → 성년" },
                { value: "linealAscendantMinor", label: "직계존속 → 미성년" },
                { value: "linealDescendant", label: "직계비속" },
                { value: "otherRelative", label: "기타 친족" },
                { value: "unrelated", label: "친족 외" },
              ]} />
          </div>
        </section>
        <section className={styles.group}>
          <h2>금액과 공제</h2>
          <div className={styles.grid}>
            <Field values={values} name="amountWon" label="증여재산가액" onChange={setValue} />
            <Field values={values} name="debtAssumedWon" label="수증자 인수 채무" onChange={setValue} />
            <Field values={values} name="priorGiftWon" label="최근 10년 동일인 관련 증여" onChange={setValue} />
            <Field values={values} name="usedDeductionWon" label="최근 10년 사용한 일반 공제액" onChange={setValue} />
            <Field values={values} name="appraisalFeeWon" label="감정평가수수료" onChange={setValue} />
            <Field values={values} name="marriageBirthDeductionWon" label="혼인·출산 추가 공제" onChange={setValue} />
            <Field values={values} name="previousTaxPaidWon" label="종전 증여재산 산출세액" onChange={setValue} />
          </div>
          <CheckField values={values} name="generationSkip" label="세대생략 할증 적용" onChange={setValue} />
          <CheckField values={values} name="minorOverTwoBillion" label="미성년 수증자 20억원 초과 증여" onChange={setValue} />
        </section>
      </>
    );
  }
  return (
    <>
      <section className={styles.group}>
        <h2>기본정보</h2>
        <div className={styles.grid}>
          <Field values={values} name="acquisitionDate" label="취득일" type="date" onChange={setValue} />
          <Field values={values} name="transferDate" label="양도일" type="date" onChange={setValue} />
          <SelectField values={values} name="assetType" label="자산 종류" onChange={setValue}
            options={[
              { value: "generalBuilding", label: "일반 건물" },
              { value: "land", label: "일반 토지" },
              { value: "oneHome", label: "1세대 1주택" },
              { value: "otherUnsupported", label: "분양권·입주권 등 미지원" },
            ]} />
          <Field values={values} name="homeCount" label="보유 주택 수" onChange={setValue} />
        </div>
        <CheckField values={values} name="regulatedArea" label="조정대상지역 주택" onChange={setValue} />
      </section>
      <section className={styles.group}>
        <h2>양도 금액</h2>
        <div className={styles.grid}>
          <Field values={values} name="salePriceWon" label="양도가액" onChange={setValue} />
          <Field values={values} name="purchasePriceWon" label="취득가액" onChange={setValue} />
          <Field values={values} name="necessaryExpenseWon" label="필요경비" hint="취득세·자본적 지출·양도비 등" onChange={setValue} />
          <Field values={values} name="otherCapitalGainWon" label="같은 해 다른 양도소득금액" onChange={setValue} />
          <Field values={values} name="basicDeductionUsedWon" label="이미 사용한 기본공제" onChange={setValue} />
          <Field values={values} name="residenceYears" label="거주 연수" hint="1세대1주택 장특공제용" onChange={setValue} />
        </div>
      </section>
    </>
  );
}

function ResultPanel({ result, stale }: { result: SimpleCalculationResult | null; stale: boolean }) {
  if (!result) {
    return (
      <aside className={styles.resultEmpty}>
        <Calculator aria-hidden="true" size={28} />
        <h2>입력 후 계산하기를 누르세요.</h2>
        <p>결과는 이 브라우저 안에서 결정론적 코드로 계산되며 외부 AI나 국세청으로 자동 전송되지 않습니다.</p>
      </aside>
    );
  }
  return (
    <aside className={styles.result} aria-live="polite">
      <div className={styles.resultHeader}>
        <span className={result.status === "ready" ? styles.ready : styles.warn}>
          {result.status === "ready" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          {stale ? "다시 계산 필요" : result.status === "ready" ? "계산 완료" : "확인 필요"}
        </span>
        <p>기준 확인일 {result.checkedOn}</p>
      </div>
      <h2>{result.title}</h2>
      <strong className={styles.total}>{formatWon(result.totalTaxWon)}</strong>
      <p className={styles.totalLabel}>예상 납부세액 합계</p>
      {stale ? <p className={styles.stale}>입력값이 바뀌었습니다. 현재 결과는 이전 입력 기준입니다.</p> : null}
      {result.missing.length ? <div className={styles.notice}><b>필요한 입력</b>{result.missing.map((item) => <p key={item}>{item}</p>)}</div> : null}
      {result.unsupported.length ? <div className={styles.notice}><b>미지원·미검증 조건</b>{result.unsupported.map((item) => <p key={item.label}>{item.label}: {item.reason}</p>)}</div> : null}
      <dl className={styles.summary}>
        <div><dt>과세표준</dt><dd>{formatWon(result.taxableBaseWon)}</dd></div>
        <div><dt>산출세액</dt><dd>{formatWon(result.grossTaxWon)}</dd></div>
        <div><dt>세액공제</dt><dd>{formatWon(result.creditWon)}</dd></div>
        <div><dt>국세</dt><dd>{formatWon(result.nationalTaxWon)}</dd></div>
        <div><dt>지방소득세</dt><dd>{formatWon(result.localTaxWon)}</dd></div>
      </dl>
      <section className={styles.lines}>
        <h3>계산내역</h3>
        {result.lines.map((line) => (
          <div key={`${line.label}-${line.amountWon}`}>
            <span>{line.label}{line.note ? <small>{line.note}</small> : null}</span>
            <strong>{formatWon(line.amountWon)}</strong>
          </div>
        ))}
      </section>
      <section className={styles.assumptions}>
        <h3>가정과 출처</h3>
        {result.assumptions.map((item) => <p key={item}>{item}</p>)}
        {result.references.map((ref) => <a key={ref.url} href={ref.url} target="_blank" rel="noreferrer">{ref.label}</a>)}
      </section>
    </aside>
  );
}

export function SimpleTaxCalculator() {
  const [kind, setKind] = useState<SimpleTaxKind>("inheritance");
  const [forms, setForms] = useState(initialForms);
  const [results, setResults] = useState<Partial<Record<SimpleTaxKind, SimpleCalculationResult>>>({});
  const [stale, setStale] = useState<Partial<Record<SimpleTaxKind, boolean>>>({});
  const activeValues = forms[kind];
  const currentTab = useMemo(() => tabs.find((tab) => tab.kind === kind)!, [kind]);

  const setValue = (name: string, value: string | boolean) => {
    setForms((current) => ({ ...current, [kind]: { ...current[kind], [name]: value } }));
    if (results[kind]) setStale((current) => ({ ...current, [kind]: true }));
  };

  const runCalculation = () => {
    setResults((current) => ({ ...current, [kind]: calculate(kind, activeValues) }));
    setStale((current) => ({ ...current, [kind]: false }));
  };

  const reset = () => {
    setForms((current) => ({ ...current, [kind]: initialForms[kind] }));
    setResults((current) => ({ ...current, [kind]: undefined }));
    setStale((current) => ({ ...current, [kind]: false }));
  };

  return (
    <>
      <section className={styles.hero}>
        <p>자산승계 360 · 자체 간편계산기</p>
        <h1>상속·증여·양도소득세를 사이트 안에서 바로 계산합니다.</h1>
        <span>국세청 입력 흐름과 공식 계산 근거를 참고한 자체 초안이며, 확정 신고세액이 아닙니다.</span>
      </section>
      <div className={styles.layout}>
        <section className={styles.formPanel}>
          <div className={styles.tabs} role="tablist" aria-label="세목 선택">
            {tabs.map((tab) => (
              <button
                key={tab.kind}
                type="button"
                role="tab"
                aria-selected={kind === tab.kind}
                onClick={() => setKind(tab.kind)}
              >
                <strong>{tab.label}</strong>
                <span>{tab.caption}</span>
              </button>
            ))}
          </div>
          <div className={styles.formIntro}>
            <h2>{currentTab.label} 직접 입력</h2>
            <p>빈 값은 0원이 아닙니다. 해당 금액이 없으면 0을 입력하고, 모르면 비워두세요.</p>
          </div>
          <FormFields kind={kind} values={activeValues} setValue={setValue} />
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={runCalculation}>
              <Calculator size={18} aria-hidden="true" /> 계산하기
            </button>
            <button type="button" className={styles.secondary} onClick={reset}>
              <RotateCcw size={17} aria-hidden="true" /> 초기화
            </button>
          </div>
        </section>
        <ResultPanel result={results[kind] ?? null} stale={stale[kind] === true} />
      </div>
    </>
  );
}
