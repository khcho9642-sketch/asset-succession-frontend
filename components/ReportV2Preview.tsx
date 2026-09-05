"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { PrintButton } from "@/components/PrintButton";
import { buildAssessmentMetrics, formatAnswer, readAssessmentFromSession } from "@/lib/assessment";
import type { AssessmentLoadResult, AssessmentMetrics as Metrics, AssessmentSnapshot } from "@/lib/assessment";
import { buildScenarioPlan, normalizeAssessmentSnapshot, SUPPORTED_TAX_LAW_REFERENCES } from "@/lib/phase2b";
import type { MoneyResult, Scenario, ScenarioPlan } from "@/lib/phase2b";

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

const debtLabels = {
  secured_loan: "담보대출",
  lease_deposit: "임대보증금",
  other: "기타 채무"
} as const;

const statusLabels = {
  calculable: "계산 가능",
  needs_info: "추가정보 필요",
  needs_engine: "정밀계산 필요",
  needs_expert_review: "전문가 검토",
  incomparable: "비교 불가",
  not_applicable: "해당 없음"
} as const;

export function ReportV2Preview() {
  const [loadResult, setLoadResult] = useState<AssessmentLoadResult>({ status: "loading" });

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
  const priorityScenarios = plan.recommendations
    .map((recommendation) => plan.scenarios.find((scenario) => scenario.scenario_id === recommendation.scenario_id))
    .filter((scenario): scenario is Scenario => Boolean(scenario))
    .slice(0, 3);
  const primaryAlternative = priorityScenarios.find((scenario) => scenario.calculation_result.status === "calculable") ?? priorityScenarios[0];

  return (
    <article className="report-book mt-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div>
          <p className="text-sm font-semibold text-[var(--gold)]">무료 보고서 미리보기</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[var(--navy-950)]">우리 가족 자산승계 사전진단 보고서</h1>
        </div>
        <PrintButton />
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
              {priorityScenarios.map((scenario, index) => (
                <li key={scenario.scenario_id}>{index + 1}. {scenario.name} · {statusLabels[scenario.calculation_result.status]} · {scenario.eligibility.status}</li>
              ))}
            </ol>
          </Card>
        </section>
      </ReportPage>

      <ReportPage pageNumber={2} title="가족·자산 지도" eyebrow="Report V2 2/7">
        <TwoColumnFacts metrics={metrics} snapshot={snapshot} />
        <section className="mt-7 grid gap-5 md:grid-cols-2">
          <TableCard title="자산 입력">
            {facts.assets.map((asset) => (
              <Row key={asset.asset_id} label={assetLabels[asset.type]} value={`${asset.current_value_eok === null ? "금액 확인 필요" : `${asset.current_value_eok}억`} · 소유자: ${asset.owner === "unknown" ? "확인 필요" : asset.owner}`} />
            ))}
            {facts.assets.length === 0 ? <Row label="자산" value="선택 자산 없음 또는 미상" /> : null}
          </TableCard>
          <TableCard title="작성자와 소유자 구분">
            <Row label="작성자" value="사전진단 입력자 — 실명 저장 안 함" />
            <Row label="실제 소유자" value={facts.assets.some((asset) => asset.owner === "unknown") ? "자산별 등기·계좌·지분 확인 필요" : "입력 기준 확인"} />
            <Row label="지분" value="공동소유 여부 확인 전까지 가족 이전금액 산정 제외" />
          </TableCard>
        </section>
        <section className="mt-7 grid gap-5 md:grid-cols-2">
          <TableCard title="채무·과거 증여">
            {facts.debts.length === 0 ? <Row label="채무" value="직접 입력 없음" /> : facts.debts.map((debt) => <Row key={debt.debt_id} label={debtLabels[debt.type]} value={debt.amount_eok === null ? "금액 확인 필요" : `${debt.amount_eok}억`} />)}
            {facts.past_gifts.length > 0 ? <Row label="최근 10년 증여" value="금액·일자 확인 필요" /> : <Row label="최근 10년 증여" value="직접 입력 없음" />}
          </TableCard>
          <TableCard title="가족 정보 상태">
            <Row label="배우자" value={facts.family.spouse === "yes" ? "있음" : facts.family.spouse === "no" ? "없음" : "미상"} />
            <Row label="총 자녀 수" value={facts.family.total_children === null ? "미상" : `${facts.family.total_children}명`} />
            <Row label="성년 여부" value={facts.family.children_age_status === "known" ? "일부 확인" : "미상 — 별도 확인 필요"} />
          </TableCard>
        </section>
      </ReportPage>

      <ReportPage pageNumber={3} title="확정 사실과 계산상태" eyebrow="Report V2 3/7">
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
        <TableCard title="추가 확인 필요정보" className="mt-7">
          {plan.unknown_items.slice(0, 10).map((item) => <Row key={item} label="확인 필요" value={item} />)}
        </TableCard>
      </ReportPage>

      <ReportPage pageNumber={4} title="우선 시나리오 2~3개" eyebrow="Report V2 4/7">
        <div className="grid gap-4">
          {priorityScenarios.map((scenario, index) => (
            <article key={scenario.scenario_id} className="border border-[var(--border)] bg-[var(--ivory)] p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[var(--gold)]">우선순위 {index + 1}</p>
                <span className="text-xs text-[var(--muted)]">{statusLabels[scenario.calculation_result.status]}</span>
              </div>
              <h3 className="mt-2 text-xl font-semibold tracking-[-0.04em]">{scenario.name}</h3>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{scenario.rationale.join(" ")}</p>
              <dl className="mt-4 grid gap-2 text-sm">
                <Row label="당사자" value={scenario.track === "business_succession" ? "주주·후계자·회사" : "부모·배우자·자녀"} />
                <Row label="대상자산" value={facts.assets.map((asset) => assetLabels[asset.type]).join(" · ") || "확인 필요"} />
                <Row label="재원" value={moneyDisplay(scenario.calculation_result.liquidity_gap)} />
                <Row label="선행확인" value={scenario.required_information.slice(0, 3).join(" · ")} />
              </dl>
            </article>
          ))}
        </div>
      </ReportPage>

      <ReportPage pageNumber={5} title="기준안·대안 비교" eyebrow="Report V2 5/7">
        <table className="report-table w-full border-collapse text-left">
          <thead>
            <tr>
              <th>구분</th>
              <th>트랙</th>
              <th>예상 세액</th>
              <th>총부담</th>
              <th>절세·순효과</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{plan.baseline.name}</td>
              <td>{trackLabels[plan.baseline.track]}</td>
              <td>{moneyDisplay(plan.baseline.calculation_result.total_tax)}</td>
              <td>{moneyDisplay(plan.baseline.calculation_result.total_burden)}</td>
              <td>기준안</td>
              <td>{statusLabels[plan.baseline.calculation_result.status]}</td>
            </tr>
            {plan.scenarios.slice(0, 6).map((scenario) => (
              <tr key={scenario.scenario_id}>
                <td>{scenario.name}</td>
                <td>{trackLabels[scenario.track]}</td>
                <td>{moneyDisplay(scenario.calculation_result.total_tax)}</td>
                <td>{moneyDisplay(scenario.calculation_result.total_burden)}</td>
                <td>{moneyDisplay(scenario.comparison.expected_net_effect)}</td>
                <td>{statusLabels[scenario.comparison.comparison_status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-5 border-l-2 border-[var(--gold)] bg-[var(--ivory)] p-4 text-sm leading-6 text-[var(--muted)]">
          기준안과 대안의 평가기준일, 입력 스냅샷, 법령/규칙 버전, 비교기간, 포함 세목, 가족 사실이 구조적으로 일치하지 않으면 절세액을 만들지 않습니다.
        </p>
      </ReportPage>

      <ReportPage pageNumber={6} title="실행 타임라인" eyebrow="Report V2 6/7">
        <div className="grid gap-4">
          {priorityScenarios.map((scenario) => (
            <article key={scenario.scenario_id} className="border border-[var(--border)] p-5">
              <h3 className="text-lg font-semibold tracking-[-0.04em]">{scenario.name}</h3>
              <ol className="mt-3 grid gap-2 text-sm leading-6 text-[var(--muted)]">
                {scenario.timeline.map((event, index) => (
                  <li key={event}>{index + 1}. {event}</li>
                ))}
              </ol>
              <p className="mt-3 border-l-2 border-[var(--gold)] pl-3 text-sm leading-6 text-[var(--muted)]">
                생활자금·재원·계약 당사자는 선행 확인 후 실행 여부를 정합니다. 미상 정보가 남으면 실행 단계로 넘기지 않습니다.
              </p>
            </article>
          ))}
        </div>
      </ReportPage>

      <ReportPage pageNumber={7} title="가족회의 안건" eyebrow="Report V2 7/7">
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
        <TableCard title="미상정보와 재검토 시점" className="mt-7">
          {plan.unknown_items.slice(0, 6).map((item) => <Row key={item} label="미상" value={`${item} · 상담 전 확인`} />)}
          <Row label="재검토" value="자산평가액·가족관계·과세표준이 바뀌면 웹과 PDF를 같은 스냅샷으로 다시 생성" />
        </TableCard>
        <section className="mt-7 border border-[var(--border)] bg-[var(--navy-950)] p-6 text-white">
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
      <div className="mt-6 text-sm leading-6 text-[var(--text)]">{children}</div>
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
    <div className="grid gap-1 border-t border-[var(--border)] pt-3 md:grid-cols-[7rem_1fr]">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="font-semibold leading-6 text-[var(--text)]">{value}</dd>
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
