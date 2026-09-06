"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { readAssessmentFromSession } from "@/lib/assessment";
import type { AssessmentLoadResult } from "@/lib/assessment";
import { buildScenarioPlan, normalizeAssessmentSnapshot } from "@/lib/phase2b";
import type { Baseline, MoneyResult, Scenario, ScenarioPlan } from "@/lib/phase2b";
import { ScenarioVisualGrid } from "@/components/ScenarioVisuals";

const trackLabels = {
  inheritance: "상속",
  gift: "증여",
  business_succession: "가업·회사 승계",
  capital_gains: "양도"
} as const;

const statusLabels = {
  calculable: "계산 가능",
  needs_info: "추가정보 필요",
  needs_engine: "정밀계산 필요",
  needs_expert_review: "전문가 검토",
  incomparable: "비교 불가",
  not_applicable: "해당 없음"
} as const;

export function ScenarioPlanPanel({ compact = false }: Readonly<{ compact?: boolean }>) {
  const [loadResult, setLoadResult] = useState<AssessmentLoadResult>({ status: "loading" });

  useEffect(() => {
    setLoadResult(readAssessmentFromSession());
  }, []);

  const plan = useMemo<ScenarioPlan | null>(() => {
    if (loadResult.status !== "ready") return null;
    return buildScenarioPlan(normalizeAssessmentSnapshot(loadResult.snapshot));
  }, [loadResult]);

  if (loadResult.status === "loading") {
    return <section className="border border-[var(--border)] bg-white p-6 text-sm text-[var(--muted)]">시나리오 플랜을 구성하는 중입니다.</section>;
  }

  if (loadResult.status !== "ready" || !plan) {
    return (
      <section className="border border-[var(--border)] bg-white p-6">
        <p className="text-sm font-semibold text-[var(--gold)]">개인화 시나리오 없음</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[var(--navy-950)]">사전진단 완료 후 우선 검토 시나리오가 구성됩니다.</h2>
        <p className="mt-3 text-sm leading-7 text-[var(--muted)]">확인된 가족·자산·목표 없이는 추천 순위나 계산 상태를 만들지 않습니다.</p>
        <Link href="/precheck" className="mt-5 inline-flex bg-[var(--navy-950)] px-5 py-3 text-sm font-semibold text-white print:hidden">
          사전진단 시작하기
        </Link>
      </section>
    );
  }

  const { recommended, additional_reviews: additionalReviews, liquidity_support: liquiditySupport, comparison_scenarios: comparisonScenarios } = plan.display_scenarios;

  return (
    <section className="border border-[var(--border)] bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--gold)]">개인화 시나리오 플랜</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[var(--navy-950)]">
            {plan.facts.planning_tracks.map((track) => trackLabels[track]).join(" · ")} 트랙 기준
          </h2>
        </div>
        <div className="grid gap-2 text-xs font-semibold text-[var(--navy-900)] sm:text-right">
          <span className="border border-[var(--border)] bg-[var(--ivory)] px-3 py-2">
            {plan.internal_analysis.disclosure_label}
          </span>
          <span className="border border-[var(--border)] bg-white px-3 py-2">
            기준안: {statusLabels[plan.baseline.calculation_result.status]}
          </span>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <BaselineCard baseline={plan.baseline} />
        <article className="border border-[var(--border)] bg-[var(--ivory)] p-5">
          <p className="text-xs font-semibold text-[var(--gold)]">노출 정책</p>
          <h3 className="mt-3 text-xl font-semibold tracking-[-0.04em] text-[var(--navy-950)]">추천된 결과만 보여드립니다.</h3>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            {plan.internal_analysis.disclosure_label}. 이 화면은 기준안, 추천안, 추가 검토안, 납세재원 보완안만 간결하게 표시합니다.
          </p>
        </article>
      </div>

      <ScenarioVisualGrid plan={plan} />

      <div className={`mt-6 grid gap-4 ${compact ? "" : "lg:grid-cols-3"}`}>
        {recommended.map((scenario, index) => (
          <article key={scenario.scenario_id} className="border border-[var(--border)] bg-[var(--ivory)] p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-[var(--gold)]">AI 추천 {index + 1}</span>
              <span className="text-xs text-[var(--muted)]">{statusLabels[scenario.calculation_result.status]}</span>
            </div>
            <h3 className="mt-3 text-xl font-semibold tracking-[-0.04em] text-[var(--navy-950)]">{scenario.name}</h3>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{scenario.rationale[0]}</p>
            <div className="mt-4 border-t border-[var(--border)] pt-3">
              <p className="text-xs font-semibold text-[var(--gold)]">적용 조건·위험</p>
              <ul className="mt-2 grid gap-1 text-xs leading-5 text-[var(--muted)]">
                {scenario.required_information.slice(0, 5).map((item) => (
                  <li key={item}>· {item}</li>
                ))}
              </ul>
            </div>
            <dl className="mt-4 grid gap-2 text-sm">
              <div className="grid grid-cols-[7.5rem_1fr] gap-3">
                <dt className="text-[var(--muted)]">기준안 세액</dt>
                <dd className="font-semibold">{moneyDisplay(plan.baseline.calculation_result.total_tax)}</dd>
              </div>
              <div className="grid grid-cols-[7.5rem_1fr] gap-3">
                <dt className="text-[var(--muted)]">대안 세액</dt>
                <dd className="font-semibold">{moneyDisplay(scenario.calculation_result.total_tax)}</dd>
              </div>
              <div className="grid grid-cols-[7.5rem_1fr] gap-3">
                <dt className="text-[var(--muted)]">절세액</dt>
                <dd className="font-semibold">{moneyDisplay(scenario.comparison.expected_tax_savings)}</dd>
              </div>
              <div className="grid grid-cols-[7.5rem_1fr] gap-3">
                <dt className="text-[var(--muted)]">비교 상태</dt>
                <dd className="font-semibold">{statusLabels[scenario.comparison.comparison_status]}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead className="bg-[var(--ivory)]">
            <tr>
              <th className="border border-[var(--border)] px-4 py-3">구분</th>
              <th className="border border-[var(--border)] px-4 py-3">세금</th>
              <th className="border border-[var(--border)] px-4 py-3">현금</th>
              <th className="border border-[var(--border)] px-4 py-3">기간</th>
              <th className="border border-[var(--border)] px-4 py-3">위험</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-[var(--border)] px-4 py-3 font-semibold">{plan.baseline.name}</td>
              <td className="border border-[var(--border)] px-4 py-3">{moneyDisplay(plan.baseline.calculation_result.total_tax)}</td>
              <td className="border border-[var(--border)] px-4 py-3">{moneyDisplay(plan.baseline.calculation_result.liquidity_gap)}</td>
              <td className="border border-[var(--border)] px-4 py-3">상속 발생시점</td>
              <td className="border border-[var(--border)] px-4 py-3">{baselineRiskLabel(plan.baseline)}</td>
            </tr>
            {comparisonScenarios.map((scenario) => (
              <tr key={scenario.scenario_id}>
                <td className="border border-[var(--border)] px-4 py-3 font-semibold">{scenario.name}</td>
                <td className="border border-[var(--border)] px-4 py-3">{moneyDisplay(scenario.calculation_result.total_tax)}</td>
                <td className="border border-[var(--border)] px-4 py-3">{moneyDisplay(scenario.calculation_result.liquidity_gap)}</td>
                <td className="border border-[var(--border)] px-4 py-3">{periodLabel(scenario)}</td>
                <td className="border border-[var(--border)] px-4 py-3">{riskLabel(scenario)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {additionalReviews.length > 0 ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {additionalReviews.map((scenario) => (
            <article key={scenario.scenario_id} className="border border-[var(--border)] bg-white p-5">
              <p className="text-xs font-semibold text-[var(--gold)]">추가 확인 시 검토</p>
              <h3 className="mt-3 text-lg font-semibold tracking-[-0.04em] text-[var(--navy-950)]">{scenario.name}</h3>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{scenario.required_information.slice(0, 3).join(" · ")}</p>
            </article>
          ))}
        </div>
      ) : null}

      {liquiditySupport ? (
        <article className="mt-6 border border-[var(--border)] bg-[var(--navy-950)] p-5 text-white">
          <p className="text-xs font-semibold text-[var(--gold)]">납세재원 보완안</p>
          <h3 className="mt-3 text-xl font-semibold tracking-[-0.04em]">{liquiditySupport.name}</h3>
          <p className="mt-3 text-sm leading-6 text-white/68">
            보험·연부연납·가용 현금흐름은 세금 절감안이 아니라 납부재원 부족을 줄이기 위한 보완안으로 분리 표시합니다.
            {` ${liquiditySupport.rationale[0]}`}
          </p>
        </article>
      ) : null}

      <div className="mt-6 border-l-2 border-[var(--gold)] bg-[var(--ivory)] p-4 text-xs leading-6 text-[var(--muted)]">
        지원 범위: 확인 과세표준이 있는 상속세·증여세 산출세액만 세율표로 계산합니다. 공제·가산·양도·취득세와 과세표준 산정은 정밀 계산 단계까지 숫자로 만들지 않습니다.
      </div>
    </section>
  );
}

function BaselineCard({ baseline }: Readonly<{ baseline: Baseline }>) {
  return (
    <article className="border border-[var(--border)] bg-white p-5">
      <p className="text-xs font-semibold text-[var(--gold)]">현재 상태 기준안</p>
      <h3 className="mt-3 text-xl font-semibold tracking-[-0.04em] text-[var(--navy-950)]">{baseline.name}</h3>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{baseline.description}</p>
      <dl className="mt-4 grid gap-2 text-sm">
        <div className="grid grid-cols-[7.5rem_1fr] gap-3">
          <dt className="text-[var(--muted)]">현재 자산</dt>
          <dd className="font-semibold">{moneyDisplay(baseline.calculation_result.asset_value)}</dd>
        </div>
        <div className="grid grid-cols-[7.5rem_1fr] gap-3">
          <dt className="text-[var(--muted)]">기준 세액</dt>
          <dd className="font-semibold">{moneyDisplay(baseline.calculation_result.total_tax)}</dd>
        </div>
      </dl>
    </article>
  );
}

function periodLabel(scenario: Scenario) {
  if (scenario.timeline.length === 0) return "시점 확인 필요";
  return `${scenario.timeline.length}단계 검토`;
}

function baselineRiskLabel(baseline: Baseline) {
  return baseline.calculation_result.status === "calculable" ? "과세표준 확인" : "기준안 정보 확인 필요";
}

function riskLabel(scenario: Scenario) {
  if (scenario.calculation_result.status === "needs_expert_review") return "전문가 검토 필요";
  if (scenario.eligibility.status === "excluded") return "현재 제외";
  if (scenario.required_information.length >= 3) return `확인사항 ${scenario.required_information.length}개`;
  if (scenario.eligibility.status === "needs_info") return "추가정보 필요";
  return "조건 확인 필요";
}

function moneyDisplay(result: MoneyResult) {
  if (result.value_eok !== null) return result.label;
  if (result.status === "incomparable") return "비교 불가";
  if (result.status === "needs_info") return "추가 확인 필요";
  if (result.status === "not_applicable") return "해당 없음";
  if (result.status === "needs_expert_review") return "전문가 검토";
  return "지원 범위 밖";
}
