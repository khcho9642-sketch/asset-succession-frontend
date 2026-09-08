"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Building2, CalendarDays, CircleCheck, Coins, FileCheck2, FileSearch, Home, Landmark, Scale, Sprout, Users, Wallet, type LucideIcon } from "lucide-react";
import { PrintButton } from "@/components/PrintButton";
import { PaperReportBook, PaperReportCard, PaperReportPage } from "./PaperReportLayout";
import styles from "./PersonalReport.module.css";
import { buildAssessmentMetrics, formatAnswer, readAssessmentFromSession } from "@/lib/assessment";
import type { AssessmentLoadResult, AssessmentSnapshot } from "@/lib/assessment";
import { buildScenarioPlan, normalizeAssessmentSnapshot, SUPPORTED_TAX_LAW_REFERENCES } from "@/lib/phase2b";
import type { ClientFacts, MoneyResult, Scenario } from "@/lib/phase2b";
import { TaxComparisonReport } from "./TaxComparisonReport";
import { calculateTaxComparison, validateTaxComparisonInput } from "@/lib/tax-comparison";

const trackLabels = {
  inheritance: "상속",
  gift: "증여",
  business_succession: "가업·회사 승계",
  capital_gains: "양도"
} as const;

const assetLabels = {
  real_estate: "부동산",
  financial: "금융자산",
  business_interest: "법인지분",
  insurance: "보험",
  other: "기타"
} as const;

const eligibilityLabels: Record<Scenario["eligibility"]["status"], string> = {
  eligible: "기본 조건 해당",
  conditional: "조건부 검토",
  needs_info: "추가 확인 필요",
  excluded: "검토 제외"
};

export function ReportV2Preview() {
  const [loadResult, setLoadResult] = useState<AssessmentLoadResult>({ status: "missing" });

  useEffect(() => {
    setLoadResult(readAssessmentFromSession());
  }, []);

  const viewModel = useMemo(() => {
    if (loadResult.status !== "ready") return null;
    const facts = normalizeAssessmentSnapshot(loadResult.snapshot);
    return {
      snapshot: loadResult.snapshot,
      facts,
      metrics: buildAssessmentMetrics(loadResult.snapshot),
      plan: buildScenarioPlan(facts)
    };
  }, [loadResult]);

  if (loadResult.status === "loading") {
    return <section className="border border-[#d2c8b5] bg-[#f8f4ea] p-8 text-sm text-[#6b6152]">보고서를 구성하는 중입니다.</section>;
  }

  if (loadResult.status !== "ready" || !viewModel) {
    return (
      <section className="border border-[#d2c8b5] bg-[#f8f4ea] p-8 empty-assessment-card">
        <p className="text-sm font-semibold text-[#7a6139]">사전진단 입력값 없음</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.05em] text-[#26221b]">먼저 무료 사전진단을 완료해 주세요.</h1>
        <p className="mt-3 text-sm leading-7 text-[#6b6152]">대화에서 확인한 가족과 자산 정보를 바탕으로 보고서를 준비합니다.</p>
        <Link href="/precheck" className="mt-6 inline-flex bg-[#b23a2a] px-6 py-4 text-sm font-semibold text-white print:hidden">
          사전진단 시작하기
        </Link>
      </section>
    );
  }

  const { snapshot, facts, metrics, plan } = viewModel;
  if (snapshot.taxComparisonInput) {
    const validatedInput = validateTaxComparisonInput(snapshot.taxComparisonInput);
    const comparison = calculateTaxComparison(snapshot.taxComparisonInput);
    if (!validatedInput?.confirmed) {
      comparison.status = "needs_info";
      comparison.baseline = null;
      comparison.alternatives = [];
      comparison.missing = ["계산 조건의 최종 확인이 필요합니다. 대화로 돌아가 확인해 주세요."];
    }
    return <TaxComparisonReport snapshot={{ ...snapshot, taxComparisonInput: validatedInput ?? undefined }} comparison={comparison} />;
  }
  const { recommended, liquidity_support: liquiditySupport } = plan.display_scenarios;
  const first = recommended[0];
  const second = recommended[1];
  const remaining = recommended.slice(2);
  const isChatReport = snapshot.conversation?.mode === "chat";
  const goal = snapshot.conversation?.confirmed_facts.find((fact) => fact.id === "goal")?.value ?? metrics.goalSummary;
  const availableCash = facts.available_tax_payment_cash_eok;
  const financialAssets = facts.assets.filter((asset) => asset.type === "financial");
  const financialAmount = financialAssets.length > 0 && financialAssets.every((asset) => asset.current_value_eok !== null)
    ? financialAssets.reduce((sum, asset) => sum + (asset.current_value_eok ?? 0), 0) : null;
  const hasTax = [plan.baseline, ...recommended].some((item) => item.calculation_result.total_tax.value_eok !== null);
  const unknowns = [...new Set(plan.unknown_items.map(customerReason))];

  return (
    <PaperReportBook
      mode={isChatReport ? "chat" : "form"}
      title="우리 가족 자산승계 사전진단 보고서"
      subtitle="확인한 가족·자산 정보로 선택의 기준을 정리했습니다."
      className={styles.personalReport}
      actions={<>{isChatReport && <Link href="/precheck">대화 내용 수정</Link>}<PrintButton /></>}
    >
      <PaperReportPage number={1} label="CORE SUMMARY · 핵심 요약" title="우리 가족의 자산승계, 먼저 비교할 방향을 찾았습니다." subtitle="세금과 생활재원, 가족의 희망을 함께 살펴봅니다.">
        <div className={styles.goalStrip}>
          <Sprout aria-hidden="true" />
          <div><span>직접 말씀하신 목표</span><strong>{goal === "미입력" ? "가족의 우선순위를 함께 정합니다." : goal}</strong></div>
        </div>
        <div className={styles.threeColumns}>
          <Metric icon={Building2} label="확인된 자산 합계" value={metrics.totalAssets} note="직접 확정한 자산 금액" />
          <Metric icon={Coins} label="확인된 채무" value={metrics.estimatedDebt} note={facts.debt_status === "none" ? "채무 없음으로 확인" : "금액이 확인된 채무 기준"} />
          <Metric icon={Scale} label="자산에서 채무를 뺀 금액" value={metrics.netAssets} note="개인별 과세표준과는 다릅니다" />
        </div>
        <SectionTitle>이번 진단에서 먼저 살펴볼 것</SectionTitle>
        <div className={styles.twoColumns}>
          <IconNote icon={Wallet} title="자산과 쓸 수 있는 현금을 구분합니다">금융자산 {financialAmount === null ? "금액 확인 필요" : amount(financialAmount)}. 생활비로 남겨둘 돈과 실제 납부에 쓸 수 있는 돈을 따로 확인합니다.</IconNote>
          <IconNote icon={Users} title="가족의 목표를 배분 기준으로 만듭니다">누구에게 어떤 자산을 이전할지, 계속 보유할 자산과 소유권·관리권을 함께 정합니다.</IconNote>
        </div>
        <PaperReportCard title="비교할 방향 · 추천 순위 아님" className={styles.directionGroup}>
          <div className={styles.threeColumns}>
            <DirectionSummary letter="A" scenario={first} />
            <DirectionSummary letter="B" scenario={second} />
            <div className={styles.directionSummary}><span>C</span><h4>{plan.baseline.name}</h4><p>현재 보유 구조를 기준으로 비교합니다.</p></div>
          </div>
          {remaining.length > 0 && <p className={styles.smallNote}>함께 검토할 후보: {remaining.map((item) => item.name).join(" · ")}</p>}
        </PaperReportCard>
        <div className={styles.actionStrip}><FileCheck2 aria-hidden="true" /><p><strong>우선 확인</strong> 자산별 소유자·지분, 과거 증여 이력, 필요한 생활재원</p></div>
        <p className={styles.meta}>검토 분야: {facts.planning_tracks.map((track) => trackLabels[track]).join(" · ")} · 기준일: {plan.context.valuation_date}<br />진단 ID: {snapshot.assessment_id}</p>
      </PaperReportPage>

      <PaperReportPage number={2} label="FAMILY & ASSETS · 분석의 출발점" title="우리 가족의 현재 상황" subtitle="확인된 사실과 아직 필요한 정보를 나누어 봅니다.">
        <ConfirmedFacts snapshot={snapshot} />
        <PaperReportCard title="자산·채무 현황">
          <AssetRows facts={facts} snapshot={snapshot} />
          <div className={styles.totalLine}><span>총자산 {metrics.totalAssets}</span><strong>순자산 {metrics.netAssets}</strong></div>
        </PaperReportCard>
        <PaperReportCard title="추가 확인 정보" className={styles.denseCard}>
          <p className={styles.smallNote}>미확인 항목을 임의로 채우지 않았습니다. 자녀 수가 확인되어도 성년·미성년 구분은 별도로 확인합니다.</p>
          <ul className={styles.checkGrid}>{unknowns.map((item) => <li key={item}><CircleCheck aria-hidden="true" />{item}</li>)}</ul>
        </PaperReportCard>
        <p className={styles.smallNote}>가족 합산 자산을 한 사람의 과세대상 재산으로 보지 않습니다. 자산별 소유자와 지분은 증빙으로 확인합니다.</p>
      </PaperReportPage>

      <PaperReportPage number={3} label="COMPARISON · 선택지 비교" title="선택지마다 무엇이 다를까요?" subtitle="한 가지 답을 단정하지 않고, 같은 조건에서 선택의 기준을 비교합니다.">
        <div className={styles.threeColumns}>
          <ComparisonDirection letter="A" scenario={first} />
          <ComparisonDirection letter="B" scenario={second} />
          <section className={styles.comparisonDirection}>
            <span className={styles.letter}>C</span><p className={styles.badge}>현재 구조 기준안</p><h3>{plan.baseline.name}</h3>
            <Home className={styles.heroIcon} aria-hidden="true" />
            <IconNote icon={FileSearch} title="검토 초점">{plan.baseline.description}</IconNote>
            <IconNote icon={Users} title="함께 생각할 점">재산 배분, 보유 중 관리 부담과 납부재원</IconNote>
            <IconNote icon={FileCheck2} title="준비할 정보">자산별 소유관계 · 가족 협의 · 평가 기준일</IconNote>
            <KnownMoney result={plan.baseline.calculation_result.total_tax} label="기준안 산출세액" />
          </section>
        </div>
        <div className={styles.notice}>
          <h3>{hasTax ? "계산된 금액의 적용 범위" : "예상 세금은 조건 확인 후 비교합니다"}</h3>
          <p>{hasTax ? "별도로 확인한 과세표준에 세율을 적용한 산출세액입니다. 과세표준 산정과 공제·가산·신고세액공제, 지방세·취득세·양도세는 이 계산에 포함되지 않았습니다." : "현재 확인한 자산 합계만으로 세액을 확정하지 않습니다. 소유자·과거 증여·공제 조건과 이전 방식을 확인한 뒤 세금과 비용을 비교합니다."}</p>
          <p className={styles.smallNote}>비교 기준일·대상 자산·가족구성이 같아야 금액 차이를 비교할 수 있습니다.</p>
        </div>
        <SectionTitle>우리 가족에게 중요한 질문</SectionTitle>
        <div className={styles.threeColumns}>
          <Question number="1">생활비를 얼마나 남겨둘까요?</Question><Question number="2">어떤 자산을 계속 보유할까요?</Question><Question number="3">가족이 동의할 배분은 무엇일까요?</Question>
        </div>
        <p className={styles.smallNote}>36개 전략 후보 중 입력 조건에 맞는 검토 방향을 정리했습니다. 세액을 모두 계산하거나 절세 순위를 확정한 결과는 아닙니다.</p>
      </PaperReportPage>

      <PaperReportPage number={4} label="OPTION A · 대안 A 자세히 보기" title="첫 번째 대안을 자세히 살펴봅니다" subtitle={first?.name ?? "현재 정보로 대안을 확정하지 않았습니다."}>
        {first ? <ScenarioDetail scenario={first} expanded /> : <MissingDirection />}
        <PaperReportCard title="대상 자산과 가족의 생활재원">
          <div className={styles.twoColumns}>
            <IconNote icon={Building2} title="확인한 자산">{metrics.assetSummary}</IconNote>
            <IconNote icon={Wallet} title="남겨둘 생활비">가족의 생활비·예비자금과 이전 금액은 별도로 합의합니다. 확인하지 않은 배분액은 제시하지 않았습니다.</IconNote>
          </div>
        </PaperReportCard>
        <div className={styles.actionStrip}><CircleCheck aria-hidden="true" /><p><strong>지금 할 일</strong> {first?.required_information[0] ?? "가족의 목표와 자산별 소유관계를 확인해 주세요."}</p></div>
      </PaperReportPage>

      <PaperReportPage number={5} label="OTHER OPTIONS · 다른 선택지 살펴보기" title="다른 선택지도 함께 비교합니다" subtitle="대안 B와 현재 구조 기준안의 차이를 살펴봅니다.">
        {second ? <ScenarioDetail scenario={second} letter="B" /> : <MissingDirection />}
        <section className={styles.baselineCard}>
          <span className={styles.letter}>C</span><div><p className={styles.badge}>현재 구조 기준안</p><h3>{plan.baseline.name}</h3><p>{plan.baseline.description}</p><KnownMoney result={plan.baseline.calculation_result.total_tax} label="기준안 산출세액" /><p className={styles.smallNote}>먼저 확인: 자산별 소유관계 · 재산 배분 · 납부재원 · 가족의 합의</p></div>
        </section>
        {remaining.map((scenario) => <ScenarioDetail key={scenario.scenario_id} scenario={scenario} compact />)}
        <div className={styles.actionStrip}><Sprout aria-hidden="true" /><p>계속 보유할 자산과 이전할 자산을 먼저 구분해 보세요.</p></div>
      </PaperReportPage>

      <PaperReportPage number={6} label="LIVING FUNDS · 남겨둘 자산과 필요한 현금" title="재산이 많아도, 쓸 수 있는 돈은 따로 봅니다" subtitle="생활재원과 실행자금을 구분해 준비합니다.">
        <div className={styles.fundingIntro}><Home aria-hidden="true" /><p>지켜야 할 오늘의 생활과 준비해야 할 내일의 계획을 함께 생각합니다.<br /><strong>총자산이 곧 납부 가능한 현금은 아닙니다.</strong></p></div>
        <div className={styles.threeColumns}>
          <Metric icon={Coins} label="확인된 금융자산" value={financialAmount === null ? "확인 필요" : amount(financialAmount)} note="예금·투자자산 등의 입력 합계" />
          <Metric icon={Home} label="남겨둘 생활재원" value="목표 확인" note="생활비·예비자금 별도 합의" />
          <Metric icon={Wallet} label="납부에 쓸 수 있는 현금" value={availableCash == null ? "확인 필요" : amount(availableCash)} note="직접 확인한 사용 가능 금액" />
        </div>
        <PaperReportCard title="자금 계획에서 따로 볼 항목">
          <div className={styles.twoColumns}>
            <IconNote icon={Coins} title="필요한 현금">세금 · 거래·실행 비용 · 채무 상환<KnownMoney result={plan.baseline.calculation_result.immediate_cash_required} label="기준안 계산 금액" /></IconNote>
            <IconNote icon={FileCheck2} title="사용 가능한 현금">소유자 · 인출 가능 여부 · 생활비·예비자금<br />금융자산 전체를 사용 가능 현금으로 가정하지 않습니다.</IconNote>
          </div>
          {plan.baseline.calculation_result.liquidity_gap.value_eok !== null && <p className={styles.smallNote}>금융자산 합계와의 단순 비교: {plan.baseline.calculation_result.liquidity_gap.label}. 실제 사용 가능한 현금 기준 부족액과는 다릅니다.</p>}
        </PaperReportCard>
        <div className={styles.notice}><h3>자금 부족액은 필요한 현금과 함께 판단합니다.</h3><p>세액 외 비용과 생활재원, 인출 가능 금액까지 확인한 뒤 자금 마련 순서를 정합니다.</p></div>
        {liquiditySupport && <ScenarioDetail scenario={liquiditySupport} compact funding />}
        <div className={styles.threeColumns}>
          <IconNote icon={Users} title="부모 생활재원">목표 확인</IconNote><IconNote icon={Scale} title="가족별 이전 금액">배분 미정</IconNote><IconNote icon={FileCheck2} title="소유권·관리권">별도 합의</IconNote>
        </div>
      </PaperReportPage>

      <PaperReportPage number={7} label="NEXT STEPS · 다음 행동" title="이제, 가족의 계획으로 구체화합니다" subtitle="확인할 자료와 결정할 일을 작게 나누어 시작하세요.">
        <ol className={styles.executionSteps}>
          <ExecutionStep number="01" icon={Users} title="가족과 우선순위 맞추기">생활비 · 형평 · 자산 보유 의사를 정리합니다.</ExecutionStep>
          <ExecutionStep number="02" icon={FileSearch} title="자산과 과거 내역 확인하기">소유자·지분, 과거 증여와 채무를 확인합니다.</ExecutionStep>
          <ExecutionStep number="03" icon={Scale} title="같은 조건으로 대안 비교하기">같은 기준일로 세금 · 비용 · 필요한 현금을 산정합니다.</ExecutionStep>
          <ExecutionStep number="04" icon={FileCheck2} title="전문가 검토 후 실행 결정하기">적용 조건과 위험을 확인하고 실행 순서를 정합니다.</ExecutionStep>
        </ol>
        <div className={styles.twoColumns}>
          <PaperReportCard title="상담 전에 준비할 것"><List items={["자산별 현재가액 근거와 소유관계", "취득가액·보유기간·필요경비", "채무·임대차·보험계약 정보", "과거 증여 금액과 일자"]} /></PaperReportCard>
          <PaperReportCard title="가족과 결정할 것"><List items={["생활비·통제권·자녀별 형평의 우선순위", "매각 가능한 자산과 계속 보유할 자산", "가족별 희망사항과 자료 확인 담당자", "비교할 기준일과 실행 가능 시기"]} /></PaperReportCard>
        </div>
        <PaperReportCard title="공식 근거와 적용 범위" className={styles.references}>
          <ul>{SUPPORTED_TAX_LAW_REFERENCES.map((reference) => <li key={reference.label}><a href={reference.url}>{reference.label}</a> · {reference.note}</li>)}</ul>
          <p>위 근거는 확인 과세표준에 적용하는 상속·증여 산출세액 세율입니다. 개인별 공제와 적용 요건은 별도로 검토합니다.</p>
          <p>기준일: {plan.context.valuation_date} · 법령 기준: {plan.context.law_version}</p>
        </PaperReportCard>
        <div className={styles.closing}>
          <h3>충분히 이해하고, 가족에게 맞는 방향을 선택하세요.</h3>
          <Link href={`/consultation?assessment_id=${encodeURIComponent(snapshot.assessment_id)}`}>이 보고서로 전문가 상담하기</Link>
          <p>상담 연결 ID: {snapshot.assessment_id}</p>
        </div>
      </PaperReportPage>
    </PaperReportBook>
  );
}

function ConfirmedFacts({ snapshot }: { snapshot: AssessmentSnapshot }) {
  const confirmed = snapshot.conversation?.confirmed_facts;
  const rows = snapshot.conversation?.mode === "chat" && confirmed
    ? confirmed.map((fact) => ({ id: fact.id, label: fact.label, value: fact.value }))
    : Object.entries(snapshot.answers).map(([id, answer]) => ({ id, label: answer.label, value: formatAnswer(answer) }));
  const present = new Set(rows.map((row) => row.id));
  return <PaperReportCard title="직접 확인한 내용" className={`report-confirmed-facts ${styles.confirmedFacts}`}>
    <dl>{rows.map((row) => <FactRow key={row.id} label={row.label} value={row.value} />)}
      {!present.has("debt") && <FactRow label="채무" value="미확인" />}
      {snapshot.conversation?.mode === "chat" && !present.has("pastGifts") && <FactRow label="과거 증여" value="미확인" />}
    </dl>
  </PaperReportCard>;
}

function AssetRows({ facts, snapshot }: { facts: ClientFacts; snapshot: AssessmentSnapshot }) {
  const labels = snapshot.answers.assets?.choices.filter((choice) => choice !== "해당 없음" && choice !== "잘 모르겠음") ?? [];
  return <div className={styles.assetRows}>
    {facts.assets.map((asset, index) => {
      const Icon = asset.type === "financial" ? Coins : asset.type === "business_interest" ? Landmark : asset.type === "real_estate" ? Building2 : FileCheck2;
      return <div key={asset.asset_id}><Icon aria-hidden="true" /><span>{labels[index] ?? assetLabels[asset.type]}</span><strong>{asset.current_value_eok === null ? snapshot.answers.assets?.assetAmountRanges?.[labels[index]]?.label ?? "금액 확인 필요" : amount(asset.current_value_eok)}</strong></div>;
    })}
    <div><FileCheck2 aria-hidden="true" /><span>채무</span><strong>{facts.debt_status === "none" ? "없음" : facts.debts.length > 0 && facts.debts.every((debt) => debt.amount_eok !== null) ? amount(facts.debts.reduce((sum, debt) => sum + (debt.amount_eok ?? 0), 0)) : "확인 필요"}</strong></div>
  </div>;
}

function DirectionSummary({ letter, scenario }: { letter: string; scenario?: Scenario }) {
  return <div className={styles.directionSummary}><span>{letter}</span><h4>{scenario?.name ?? "조건 확인 후 검토"}</h4><p>{scenario?.description ?? "정보가 더 모이면 가족에게 맞는 방향을 살펴봅니다."}</p></div>;
}

function ComparisonDirection({ letter, scenario }: { letter: string; scenario?: Scenario }) {
  if (!scenario) return <section className={styles.comparisonDirection}><span className={styles.letter}>{letter}</span><h3>조건 확인 후 검토</h3><MissingDirection /></section>;
  return <section className={styles.comparisonDirection}>
    <span className={styles.letter}>{letter}</span><p className={styles.badge}>{eligibilityLabels[scenario.eligibility.status]}</p><h3>{scenario.name}</h3>
    {letter === "A" ? <Sprout className={styles.heroIcon} aria-hidden="true" /> : <Building2 className={styles.heroIcon} aria-hidden="true" />}
    <IconNote icon={FileSearch} title="검토 초점">{scenario.description}</IconNote>
    <IconNote icon={Users} title="함께 생각할 점">{scenario.rationale[0] ?? "가족의 목표와 실행 조건을 확인합니다."}</IconNote>
    <IconNote icon={FileCheck2} title="준비할 정보">{scenario.required_information.slice(0, 2).join(" · ") || "자산과 소유관계 확인"}</IconNote>
    <KnownMoney result={scenario.calculation_result.total_tax} label="산출세액" />
    <KnownMoney result={scenario.comparison.expected_tax_savings} label="기준안과 세액 차이" />
  </section>;
}

function ScenarioDetail({ scenario, letter, expanded = false, compact = false, funding = false }: { scenario: Scenario; letter?: string; expanded?: boolean; compact?: boolean; funding?: boolean }) {
  const reasons = [...new Set([...scenario.rationale, ...scenario.eligibility.reasons].map(customerReason))];
  return <section className={`${styles.scenarioDetail}${compact ? ` ${styles.compactDetail}` : ""}`}>
    <div className={styles.scenarioHeading}>{letter && <span className={styles.letter}>{letter}</span>}<div><p className={styles.badge}>{funding ? "납세재원 보완안" : eligibilityLabels[scenario.eligibility.status]}</p><h3>{scenario.name}</h3><p>{scenario.description}</p></div></div>
    <div className={expanded ? styles.twoColumns : styles.detailColumns}>
      <div><h4>왜 비교하나요?</h4><List items={reasons} /></div>
      <div><h4>결정 전에 확인할 항목</h4><List items={scenario.required_information} /></div>
    </div>
    <div className={styles.timeline}><CalendarDays aria-hidden="true" /><p><strong>검토 순서</strong> {scenario.timeline.join(" → ")}</p></div>
    <div className={styles.knownMoneyGroup}>
      <KnownMoney result={scenario.calculation_result.total_tax} label="산출세액" />
      <KnownMoney result={scenario.calculation_result.immediate_cash_required} label="계산된 필요 현금" />
      <KnownMoney result={scenario.comparison.expected_tax_savings} label="기준안과 세액 차이" />
    </div>
    {scenario.comparison.comparison_status === "incomparable" && <p className={styles.smallNote}>{scenario.comparison.comparison_reasons.map(customerReason).join(" ")}</p>}
    {funding && <p className={styles.smallNote}>보험·연부연납·현금흐름은 세액 절감과 별개로 납부 가능성을 검토하는 방법입니다. 가입·적용 가능 여부와 비용을 먼저 확인합니다.</p>}
  </section>;
}

function FactRow({ label, value }: { label: string; value: string }) {
  return <div className={`report-fact-row ${styles.factRow}`}><dt>{label}</dt><dd>{value}</dd></div>;
}

function Metric({ icon: Icon, label, value, note }: { icon: LucideIcon; label: string; value: string; note: string }) {
  return <div className={styles.metric}><Icon aria-hidden="true" /><div><p>{label}</p><strong>{value}</strong></div><small>{note}</small></div>;
}

function IconNote({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return <div className={styles.iconNote}><Icon aria-hidden="true" /><div><h4>{title}</h4><div>{children}</div></div></div>;
}

function KnownMoney({ result, label }: { result: MoneyResult; label: string }) {
  if (result.value_eok === null) return null;
  return <p className={styles.knownMoney}><span>{label}</span><strong>{result.label}</strong></p>;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className={styles.sectionTitle}>{children}</h3>;
}

function Question({ number, children }: { number: string; children: ReactNode }) {
  return <div className={styles.question}><span>{number}</span><p>{children}</p></div>;
}

function List({ items }: { items: string[] }) {
  return <ul className={styles.list}>{items.map((item, index) => <li key={`${index}-${item}`}>{customerReason(item)}</li>)}</ul>;
}

function ExecutionStep({ number, icon: Icon, title, children }: { number: string; icon: LucideIcon; title: string; children: ReactNode }) {
  return <li><span>{number}</span><div><h3>{title}</h3><p>{children}</p></div><Icon aria-hidden="true" /></li>;
}

function MissingDirection() {
  return <p className={styles.smallNote}>현재 확인한 정보로는 이 대안을 정하지 않았습니다. 자산별 소유관계와 가족의 목표를 더 확인합니다.</p>;
}

function customerReason(reason: string) {
  return reason.replaceAll("계산엔진 결과", "세액 계산 결과").replaceAll("외부 확인 과세표준", "공제와 과거 증여를 반영한 과세표준 확인");
}

function amount(value: number) {
  return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 8 })}억원`;
}
