"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { PrintButton } from "@/components/PrintButton";
import { buildAssessmentMetrics, formatAnswer, readAssessmentFromSession } from "@/lib/assessment";
import type { AssessmentLoadResult, AssessmentMetrics as Metrics, AssessmentSnapshot } from "@/lib/assessment";
import { buildScenarioPlan, normalizeAssessmentSnapshot, SUPPORTED_TAX_LAW_REFERENCES } from "@/lib/phase2b";
import type { Scenario, ScenarioPlan } from "@/lib/phase2b";

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

  return (
    <article className="report-book mt-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div>
          <p className="text-sm font-semibold text-[var(--gold)]">무료 보고서 미리보기</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[var(--navy-950)]">A4 7장 가족회의용 보고서</h1>
        </div>
        <PrintButton />
      </div>

      <ReportPage pageNumber={1} title="핵심 요약" eyebrow="Report V2 1/7">
        <Header snapshot={snapshot} plan={plan} />
        <div className="mt-7 grid gap-4 md:grid-cols-3">
          <MetricCard label="입력 총자산" value={metrics.totalAssets} helper="직접 입력한 자산 금액 합계" highlight />
          <MetricCard label="즉시 필요현금" value={metrics.immediateCash} helper="금융자산은 납부재원 후보로만 표시" />
          <MetricCard label="납부재원 부족액" value={metrics.fundingGap} helper="공제·세액 확인 후 산정" />
        </div>
        <section className="mt-7 grid gap-4 md:grid-cols-[0.95fr_1.05fr]">
          <Card title="현재 판단">
            <p>{metrics.confidenceNote}</p>
            <p className="mt-3">이번 보고서는 개인정보 없이 가족회의에서 볼 수 있는 시나리오 기준서입니다.</p>
          </Card>
          <Card title="우선 검토 후보">
            <ol className="grid gap-2">
              {priorityScenarios.map((scenario, index) => (
                <li key={scenario.scenario_id}>{index + 1}. {scenario.name} · {statusLabels[scenario.calculation_result.status]}</li>
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
              <Row key={asset.asset_id} label={assetLabels[asset.type]} value={asset.current_value_eok === null ? "금액 확인 필요" : `${asset.current_value_eok}억`} />
            ))}
          </TableCard>
          <TableCard title="채무·과거 증여">
            {facts.debts.length === 0 ? <Row label="채무" value="직접 입력 없음" /> : facts.debts.map((debt) => <Row key={debt.debt_id} label={debtLabels[debt.type]} value={debt.amount_eok === null ? "금액 확인 필요" : `${debt.amount_eok}억`} />)}
            {facts.past_gifts.length > 0 ? <Row label="최근 10년 증여" value="금액·일자 확인 필요" /> : <Row label="최근 10년 증여" value="직접 입력 없음" />}
          </TableCard>
        </section>
      </ReportPage>

      <ReportPage pageNumber={3} title="확정 사실과 계산상태" eyebrow="Report V2 3/7">
        <section className="grid gap-5 md:grid-cols-2">
          <Card title="확정 입력 원천">
            <p>버튼 선택과 사용자가 확인한 직접입력 후보만 스냅샷에 반영됩니다.</p>
            <p className="mt-3">자유문장 후보는 ‘맞아요’ 확인 전까지 계산에 쓰지 않습니다.</p>
          </Card>
          <Card title="지원 계산 범위">
            <p>확인 과세표준이 있는 상속세·증여세 산출세액만 제26조 세율표로 계산합니다.</p>
            <p className="mt-3">과세표준 미확인 세액, 공제, 가산, 양도세, 취득세는 정밀 계산 전까지 숫자로 표시하지 않습니다.</p>
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
        </section>
        <TableCard title="추가 확인 필요정보" className="mt-7">
          {plan.unknown_items.slice(0, 8).map((item) => <Row key={item} label="확인 필요" value={item} />)}
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
              <p className="mt-3 text-sm font-semibold">필요정보: {scenario.required_information.slice(0, 3).join(" · ")}</p>
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
              <td>{plan.baseline.calculation_result.total_tax.label}</td>
              <td>{plan.baseline.calculation_result.total_burden.label}</td>
              <td>기준안</td>
              <td>{statusLabels[plan.baseline.calculation_result.status]}</td>
            </tr>
            {plan.scenarios.slice(0, 6).map((scenario) => (
              <tr key={scenario.scenario_id}>
                <td>{scenario.name}</td>
                <td>{trackLabels[scenario.track]}</td>
                <td>{scenario.calculation_result.total_tax.label}</td>
                <td>{scenario.calculation_result.total_burden.label}</td>
                <td>{scenario.comparison.expected_net_effect.label}</td>
                <td>{statusLabels[scenario.comparison.comparison_status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-5 border-l-2 border-[var(--gold)] bg-[var(--ivory)] p-4 text-sm leading-6 text-[var(--muted)]">
          기준안과 대안의 과세표준·평가기준이 일치하지 않으면 절세액을 만들지 않습니다. 숫자가 없는 칸은 누락이 아니라 의도적인 계산 차단입니다.
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
      <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[var(--navy-950)]">무료 자산승계 사전진단 보고서</h2>
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
