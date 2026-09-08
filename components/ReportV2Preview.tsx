"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { PrintButton } from "@/components/PrintButton";
import { AssetCompositionChart, ExecutionTimelineChart, LiquidityFundingChart, RecommendationComparisonChart } from "@/components/ScenarioVisuals";
import { buildAssessmentMetrics, formatAnswer, readAssessmentFromSession } from "@/lib/assessment";
import type { AssessmentLoadResult, AssessmentMetrics as Metrics, AssessmentSnapshot } from "@/lib/assessment";
import { buildScenarioPlan, normalizeAssessmentSnapshot, SUPPORTED_TAX_LAW_REFERENCES } from "@/lib/phase2b";
import type { ClientFacts, MoneyResult, Scenario, ScenarioPlan } from "@/lib/phase2b";

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

const statusLabels = {
  calculable: "계산 가능",
  needs_info: "추가정보 필요",
  needs_engine: "정밀계산 필요",
  needs_expert_review: "전문가 검토",
  incomparable: "비교 불가",
  not_applicable: "해당 없음"
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
    return <section className="border border-[var(--border)] bg-white p-8 text-sm text-[var(--muted)]">보고서를 구성하는 중입니다.</section>;
  }

  if (loadResult.status !== "ready" || !viewModel) {
    return (
      <section className="border border-[var(--border)] bg-white p-8 empty-assessment-card">
        <p className="text-sm font-semibold text-[var(--gold)]">사전진단 입력값 없음</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.05em] text-[var(--navy-950)]">먼저 무료 사전진단을 완료해 주세요.</h1>
        <p className="mt-3 text-sm leading-7 text-[var(--muted)]">보고서는 같은 브라우저 세션의 확정 스냅샷이 있을 때만 개인화됩니다.</p>
        <Link href="/precheck" className="mt-6 inline-flex bg-[var(--navy-950)] px-6 py-4 text-sm font-semibold text-white print:hidden">
          사전진단 시작하기
        </Link>
      </section>
    );
  }

  const { snapshot, facts, metrics, plan } = viewModel;
  const {
    recommended: recommendedScenarios,
    liquidity_support: liquiditySupport
  } = plan.display_scenarios;
  const primaryAlternative = recommendedScenarios.find((scenario) => scenario.calculation_result.status === "calculable") ?? recommendedScenarios[0];
  const firstTwoRecommendations = recommendedScenarios.slice(0, 2);
  const thirdRecommendation = recommendedScenarios[2] ?? null;
  const isChatReport = snapshot.conversation?.mode === "chat";
  const recommendationLabel = isChatReport ? "검토 후보" : "AI 추천";

  return (
    <article className="report-book mt-8" data-report-mode={isChatReport ? "chat" : "form"}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div>
          <p className="text-sm font-semibold text-[var(--gold)]">무료 보고서 미리보기</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[var(--navy-950)]">우리 가족 자산승계 사전진단 보고서</h1>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {snapshot.conversation?.mode === "chat" && <Link href="/precheck" className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">대화 내용 수정</Link>}
          <PrintButton />
        </div>
      </div>

      <ReportPage pageNumber={1} title="핵심 요약" eyebrow="Report V2 1/7">
        <Header snapshot={snapshot} plan={plan} />
        <div className="mt-7 grid gap-4 md:grid-cols-3">
          <MetricCard label="확인된 현재 자산가액" value={metrics.totalAssets} helper="직접 확정한 자산 금액 합계" highlight />
          <MetricCard label="기준안 산출세액" value={moneyDisplay(plan.baseline.calculation_result.total_tax)} helper="확인 과세표준 기반 세율표 계산" />
          <MetricCard label="납부재원 부족액" value={moneyDisplay(plan.baseline.calculation_result.liquidity_gap)} helper="필요현금과 금융자산 비교" />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <MetricCard label="조건부 미래가액" value="가정 미입력" helper="물가·평가상승률 입력 전에는 현재가액과 분리" />
          <MetricCard label="우선 대안 산출세액" value={primaryAlternative ? moneyDisplay(primaryAlternative.calculation_result.total_tax) : "대안 없음"} helper={primaryAlternative?.name ?? "분기 결과 없음"} />
          <MetricCard label="절세액·비용효과" value={primaryAlternative ? moneyDisplay(primaryAlternative.comparison.expected_tax_savings) : "비교 불가"} helper="동일 과세표준 기준일 때만 산정" />
        </div>
        <section className="mt-7 grid gap-4 md:grid-cols-[0.95fr_1.05fr]">
          <Card title="핵심 발견">
            <ul className="grid gap-2">
              <li>확인된 자산가액과 과세표준은 서로 다른 입력으로 관리됩니다.</li>
              <li>{metrics.confidenceNote}</li>
              <li>작성자와 실제 소유자·지분이 확인되기 전에는 가족별 이전금액을 만들지 않습니다.</li>
            </ul>
          </Card>
          <Card title="우선 검토 방향">
            <ol className="grid gap-2">
              {recommendedScenarios.map((scenario, index) => (
                <li key={scenario.scenario_id}>{index + 1}. {scenario.name} · {statusLabels[scenario.calculation_result.status]} · {eligibilityLabels[scenario.eligibility.status]}</li>
              ))}
            </ol>
            <p className="mt-3 border-l-2 border-[var(--gold)] pl-3 text-xs leading-5">
              {plan.internal_analysis.disclosure_label}. {isChatReport ? "입력 조건에 따라 규칙으로 선별한 검토 후보입니다." : "보고서에는 추천된 결과만 표시합니다."}
            </p>
          </Card>
        </section>
      </ReportPage>

      <ReportPage pageNumber={2} title="확인된 가족·자산 현황" eyebrow="Report V2 2/7">
        {isChatReport ? <ConfirmedChatFacts snapshot={snapshot} /> : <TwoColumnFacts metrics={metrics} snapshot={snapshot} />}
        <p className="mt-5 border-l-2 border-[var(--gold)] bg-[var(--ivory)] p-4 text-sm leading-6 text-[var(--muted)]">
          {!isChatReport && <>채무 상태: {facts.debt_status === "none" ? "채무 없음" : facts.debts.length > 0 ? "채무 금액 직접 입력" : "채무 확인 필요"} · 과거 증여: {facts.past_gifts.length > 0 ? "최근 10년 증여 있음" : "직접 입력 없음"} · </>}
          자산별 소유자와 지분은 상담 전 증빙으로 확인합니다.
        </p>
        <div className="mt-5">
          <AssetCompositionChart facts={facts} compact />
        </div>
      </ReportPage>

      <ReportPage pageNumber={3} title="현 상태 기준 상속세와 납세재원" eyebrow="Report V2 3/7">
        <section className="grid gap-5 md:grid-cols-3">
          <MetricCard label="현재 상태 기준안" value={plan.baseline.name} helper={plan.baseline.description} />
          <MetricCard label="기준안 세액" value={moneyDisplay(plan.baseline.calculation_result.total_tax)} helper="확인 과세표준이 있을 때만 산출세액 표시" highlight />
          <MetricCard label="납부재원" value={moneyDisplay(plan.baseline.calculation_result.liquidity_gap)} helper="확인된 금융자산과 필요현금 비교" />
        </section>
        <div className="mt-5">
          <LiquidityFundingChart plan={plan} compact />
        </div>
        <table className="report-table w-full border-collapse text-left">
          <thead>
            <tr>
              <th>사실</th>
              <th>의미</th>
              <th>필요자료</th>
              <th>계산 포함</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>자산가액</td>
              <td>검토 규모와 재원 후보 파악</td>
              <td>평가액 근거, 지분율</td>
              <td>합계만 포함</td>
            </tr>
            <tr>
              <td>과세표준</td>
              <td>산출세액 계산 가능 여부 결정</td>
              <td>외부 확인 과세표준</td>
              <td>{facts.confirmed_tax_bases?.length ? "세율표 계산 포함" : "미포함"}</td>
            </tr>
            <tr>
              <td>채무·보증금</td>
              <td>부담부증여·순자산 검토</td>
              <td>금융기관·임대차 증빙</td>
              <td>직접 금액만 포함</td>
            </tr>
            <tr>
              <td>가족관계</td>
              <td>공제·의사결정자 구분</td>
              <td>배우자·자녀 성년 여부</td>
              <td>공제 계산 제외</td>
            </tr>
          </tbody>
        </table>
        <TableCard title="추가 확인 필요정보" className="mt-7">
          {plan.unknown_items.slice(0, 3).map((item) => <Row key={item} label="확인 필요" value={item} />)}
          {plan.unknown_items.length > 3 ? <Row label="추가" value={`외 ${plan.unknown_items.length - 3}건은 상담 전 확인`} /> : null}
        </TableCard>
      </ReportPage>

      <ReportPage pageNumber={4} title={isChatReport ? "기준안과 검토 후보 비교" : "기준안과 AI 추천 3개 비교"} eyebrow="Report V2 4/7">
        <RecommendationComparisonChart plan={plan} compact recommendationLabel={recommendationLabel} />
        <table className="report-table w-full border-collapse text-left">
          <thead>
            <tr>
              <th>구분</th>
              <th>세금</th>
              <th>현금</th>
              <th>기간</th>
              <th>위험</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{plan.baseline.name}</td>
              <td>{moneyDisplay(plan.baseline.calculation_result.total_tax)}</td>
              <td>{moneyDisplay(plan.baseline.calculation_result.liquidity_gap)}</td>
              <td>상속 발생시점</td>
              <td>{plan.baseline.calculation_result.status === "calculable" ? "과세표준 확인" : "기준정보 확인 필요"}</td>
            </tr>
            {recommendedScenarios.map((scenario, index) => (
              <tr key={scenario.scenario_id}>
                <td>{recommendationLabel} {index + 1} · {scenario.name}</td>
                <td>{moneyDisplay(scenario.calculation_result.total_tax)}</td>
                <td>{moneyDisplay(scenario.calculation_result.liquidity_gap)}</td>
                <td>{scenario.timeline.length}단계</td>
                <td>{scenario.required_information.slice(0, 2).join(" · ") || statusLabels[scenario.calculation_status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-5 border-l-2 border-[var(--gold)] bg-[var(--ivory)] p-4 text-sm leading-6 text-[var(--muted)]">
          기준안과 {isChatReport ? "검토 후보는" : "추천안은"} 같은 입력 스냅샷과 같은 기준일에서만 비교합니다. {plan.internal_analysis.disclosure_label}.
        </p>
      </ReportPage>

      <ReportPage pageNumber={5} title={isChatReport ? "검토 후보 1·2 상세" : "추천안 1·2 상세"} eyebrow="Report V2 5/7">
        <div className="grid gap-4">
          {firstTwoRecommendations.map((scenario, index) => (
            <ScenarioDetailCard key={scenario.scenario_id} scenario={scenario} title={`${recommendationLabel} ${index + 1}`} facts={facts} />
          ))}
        </div>
      </ReportPage>

      <ReportPage pageNumber={6} title={isChatReport ? "검토 후보 3과 납세재원 보완안" : "추천안 3과 납세재원 보완안"} eyebrow="Report V2 6/7">
        <div className="grid gap-4">
          {thirdRecommendation ? <ScenarioDetailCard scenario={thirdRecommendation} title={`${recommendationLabel} 3`} facts={facts} /> : <Card title={`${recommendationLabel} 3`}><p>현재 입력만으로는 세 번째 {isChatReport ? "검토 후보를" : "추천안을"} 만들기 어렵습니다.</p></Card>}
          {liquiditySupport ? (
            <ScenarioDetailCard scenario={liquiditySupport} title="납세재원 보완안" facts={facts} note="보험·연부연납·현금흐름은 절세안이 아니라 세금 납부 가능성을 높이는 보완안으로 분리합니다." />
          ) : null}
        </div>
      </ReportPage>

      <ReportPage pageNumber={7} title="실행 로드맵·주의사항·공식 근거" eyebrow="Report V2 7/7">
        <div className="report-roadmap"><ExecutionTimelineChart scenarios={recommendedScenarios} liquiditySupport={liquiditySupport} compact candidateMode={isChatReport} /></div>
        <section className="grid gap-5 md:grid-cols-2">
          <Card title="회의에서 정할 것">
            <ol className="grid gap-2">
              <li>1. 세금 최소화, 부모 통제권, 자녀별 형평 중 우선순위</li>
              <li>2. 매각 가능한 자산과 계속 보유할 자산</li>
              <li>3. 최근 10년 증여와 채무승계 증빙 확인 담당자</li>
              <li>4. 정밀 계산에 넣을 기준일과 자료 범위</li>
            </ol>
          </Card>
          <Card title="상담 전 준비자료">
            <ol className="grid gap-2">
              <li>1. 자산별 현재가액 근거</li>
              <li>2. 취득가액·보유기간·필요경비</li>
              <li>3. 채무·임대차·보험계약 정보</li>
              <li>4. 과거 증여 금액과 일자</li>
            </ol>
          </Card>
        </section>
        <section className="mt-7 border border-[var(--border)] p-5">
          <h3 className="text-lg font-semibold tracking-[-0.04em]">공식 근거</h3>
          <ul className="mt-4 grid gap-3 text-sm leading-6 text-[var(--muted)]">
            {SUPPORTED_TAX_LAW_REFERENCES.map((reference) => (
              <li key={reference.label}>
                <span className="font-semibold text-[var(--text)]">{reference.label}</span> · {reference.note}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm leading-6 text-[var(--muted)]">기준일: {plan.context.valuation_date} · 법령/규칙 버전: {plan.context.law_version}</p>
        </section>
        <section className="report-next-step mt-7 border border-[var(--border)] bg-[var(--navy-950)] p-6 text-white">
          <h3 className="text-2xl font-semibold tracking-[-0.04em]">다음 단계</h3>
          <p className="mt-3 text-sm leading-7 text-white/68">
            이 PDF를 가족에게 공유해 같은 전제와 질문을 맞춘 뒤, 실제 세법 계산엔진과 전문가 검토에서 숫자를 확정합니다.
          </p>
          <p className="mt-4 text-xs text-white/48">상담 연결 ID: {snapshot.assessment_id}</p>
        </section>
      </ReportPage>
    </article>
  );
}

function Header({ snapshot, plan }: Readonly<{ snapshot: AssessmentSnapshot; plan: ScenarioPlan }>) {
  return (
    <section className="border border-[var(--border)] bg-[var(--ivory)] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--gold)]">Asset Succession 360</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[var(--navy-950)]">우리 가족 자산승계 사전진단 보고서</h2>
      <dl className="mt-5 grid gap-3 text-sm md:grid-cols-3">
        <Row label="진단 ID" value={snapshot.assessment_id} />
        <Row label="작성일" value={new Date(snapshot.created_at).toLocaleDateString("ko-KR")} />
        <Row label="검토 트랙" value={plan.facts.planning_tracks.map((track) => trackLabels[track]).join(" · ")} />
      </dl>
    </section>
  );
}

function ScenarioDetailCard({ scenario, title, facts, note }: Readonly<{ scenario: Scenario; title: string; facts: ClientFacts; note?: string }>) {
  return (
    <article className="border border-[var(--border)] bg-[var(--ivory)] p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[var(--gold)]">{title}</p>
        <span className="text-xs text-[var(--muted)]">{statusLabels[scenario.calculation_result.status]}</span>
      </div>
      <h3 className="mt-2 text-xl font-semibold tracking-[-0.04em]">{scenario.name}</h3>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{scenario.rationale.join(" ")}</p>
      <dl className="mt-4 grid gap-2 text-sm">
        <Row label="트랙" value={trackLabels[scenario.track]} />
        <Row label="당사자" value={scenario.track === "business_succession" ? "주주·후계자·회사" : "부모·배우자·자녀"} />
        <Row label="대상자산" value={facts.assets.map((asset) => assetLabels[asset.type]).join(" · ") || "확인 필요"} />
        <Row label="예상 세액" value={moneyDisplay(scenario.calculation_result.total_tax)} />
        <Row label="필요 현금" value={moneyDisplay(scenario.calculation_result.liquidity_gap)} />
        <Row label="선행확인" value={scenario.required_information.slice(0, 5).join(" · ")} />
      </dl>
      {note ? <p className="mt-4 border-l-2 border-[var(--gold)] pl-3 text-sm leading-6 text-[var(--muted)]">{note}</p> : null}
    </article>
  );
}

function TwoColumnFacts({ metrics, snapshot }: Readonly<{ metrics: Metrics; snapshot: AssessmentSnapshot }>) {
  return (
    <section className="grid gap-5 md:grid-cols-2">
      <TableCard title="입력 요약">
        <Row label="가족" value={metrics.familySummary} />
        <Row label="자산" value={metrics.assetSummary} />
        <Row label="목표" value={metrics.goalSummary} />
      </TableCard>
      <TableCard title="최종 확인 답변">
        {Object.entries(snapshot.answers).slice(0, 6).map(([key, answer]) => (
          <Row key={key} label={answer.label} value={formatAnswer(answer)} />
        ))}
      </TableCard>
    </section>
  );
}

function ConfirmedChatFacts({ snapshot }: Readonly<{ snapshot: AssessmentSnapshot }>) {
  const confirmed = snapshot.conversation?.confirmed_facts ?? [];
  const present = new Set(confirmed.map(fact => fact.id));
  return (
    <section className="report-confirmed-facts border border-[var(--border)] p-5">
      <h3 className="text-lg font-semibold tracking-[-0.04em]">직접 확인한 내용</h3>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">전달하신 사실을 항목별로 한 번씩 정리했습니다. 모르는 금액과 조건은 그대로 남겨두었습니다.</p>
      <dl className="mt-4 grid gap-3 text-sm">
        {confirmed.map(fact => <Row key={fact.id} label={fact.label} value={fact.value} />)}
        {!present.has("debt") && <Row label="채무" value="미확인" />}
        {!present.has("pastGifts") && <Row label="과거 증여" value="미확인" />}
      </dl>
    </section>
  );
}

function ReportPage({ pageNumber, eyebrow, title, children }: Readonly<{ pageNumber: number; eyebrow: string; title: string; children: ReactNode }>) {
  return (
    <section className="report-page border border-[var(--border)] bg-white p-7 md:p-10 print:border-0" data-report-page={pageNumber}>
      <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <p className="text-sm font-semibold text-[var(--gold)]">{eyebrow}</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[var(--navy-950)]">{title}</h2>
        </div>
        <span className="text-sm font-semibold text-[var(--muted)]">{pageNumber}/7</span>
      </div>
      <div className="report-page-content mt-6 text-sm leading-6 text-[var(--text)]" data-report-content>{children}</div>
    </section>
  );
}

function MetricCard({ label, value, helper, highlight = false }: Readonly<{ label: string; value: string; helper: string; highlight?: boolean }>) {
  return (
    <article className={`border border-[var(--border)] p-5 ${highlight ? "bg-[var(--navy-950)] text-white" : "bg-white"}`}>
      <p className={highlight ? "text-white/58" : "text-[var(--muted)]"}>{label}</p>
      <strong className={`mt-3 block text-3xl tracking-[-0.06em] ${highlight ? "text-white" : "text-[var(--navy-950)]"}`}>{value}</strong>
      <p className={`mt-3 text-xs leading-5 ${highlight ? "text-white/55" : "text-[var(--muted)]"}`}>{helper}</p>
    </article>
  );
}

function Card({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <article className="border border-[var(--border)] p-5">
      <h3 className="text-lg font-semibold tracking-[-0.04em] text-[var(--navy-950)]">{title}</h3>
      <div className="mt-3 text-sm leading-6 text-[var(--muted)]">{children}</div>
    </article>
  );
}

function TableCard({ title, children, className = "" }: Readonly<{ title: string; children: ReactNode; className?: string }>) {
  return (
    <section className={`border border-[var(--border)] p-5 ${className}`}>
      <h3 className="text-lg font-semibold tracking-[-0.04em] text-[var(--navy-950)]">{title}</h3>
      <dl className="mt-4 grid gap-3 text-sm">{children}</dl>
    </section>
  );
}

function Row({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="report-fact-row grid gap-1 border-t border-[var(--border)] pt-3 md:grid-cols-[7rem_1fr]">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="whitespace-pre-line break-words font-semibold leading-6 text-[var(--text)]">{value}</dd>
    </div>
  );
}

function moneyDisplay(result: MoneyResult | undefined) {
  if (!result) return "비교 불가";
  if (result.value_eok !== null) return result.label;
  if (result.status === "incomparable") return "비교 불가";
  if (result.status === "needs_info") return "추가 확인 필요";
  if (result.status === "not_applicable") return "해당 없음";
  if (result.status === "needs_expert_review") return "전문가 검토";
  return "지원 범위 밖";
}
