"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { readAssessmentFromSession } from "@/lib/assessment";
import type { AssessmentLoadResult } from "@/lib/assessment";
import { buildScenarioPlan, normalizeAssessmentSnapshot } from "@/lib/phase2b";
import type { Recommendation, Scenario, ScenarioPlan } from "@/lib/phase2b";

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

  const priorityScenarios = plan.recommendations
    .map((recommendation) => ({
      recommendation,
      scenario: plan.scenarios.find((scenario) => scenario.scenario_id === recommendation.scenario_id)
    }))
    .filter((item): item is { recommendation: Recommendation; scenario: Scenario } => Boolean(item.scenario));

  return (
    <section className="border border-[var(--border)] bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--gold)]">개인화 시나리오 플랜</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[var(--navy-950)]">
            {plan.facts.planning_tracks.map((track) => trackLabels[track]).join(" · ")} 트랙 기준
          </h2>
        </div>
        <span className="border border-[var(--border)] bg-[var(--ivory)] px-3 py-2 text-xs font-semibold text-[var(--navy-900)]">
          기준안: {statusLabels[plan.baseline.calculation_result.status]}
        </span>
      </div>

      <div className={`mt-6 grid gap-4 ${compact ? "" : "lg:grid-cols-3"}`}>
        {priorityScenarios.map(({ recommendation, scenario }) => (
          <article key={scenario.scenario_id} className="border border-[var(--border)] bg-[var(--ivory)] p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-[var(--gold)]">#{recommendation.priority_rank} {recommendation.label}</span>
              <span className="text-xs text-[var(--muted)]">{statusLabels[scenario.calculation_result.status]}</span>
            </div>
            <h3 className="mt-3 text-xl font-semibold tracking-[-0.04em] text-[var(--navy-950)]">{scenario.name}</h3>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{scenario.rationale[0]}</p>
            <dl className="mt-4 grid gap-2 text-sm">
              <div className="grid grid-cols-[7.5rem_1fr] gap-3">
                <dt className="text-[var(--muted)]">예상 세액</dt>
                <dd className="font-semibold">{scenario.calculation_result.total_tax.label}</dd>
              </div>
              <div className="grid grid-cols-[7.5rem_1fr] gap-3">
                <dt className="text-[var(--muted)]">비교 상태</dt>
                <dd className="font-semibold">{statusLabels[scenario.comparison.comparison_status]}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      <div className="mt-6 border-l-2 border-[var(--gold)] bg-[var(--ivory)] p-4 text-xs leading-6 text-[var(--muted)]">
        지원 범위: 확인 과세표준이 있는 상속세·증여세 산출세액만 세율표로 계산합니다. 공제·가산·양도·취득세와 과세표준 산정은 정밀 계산 단계까지 숫자로 만들지 않습니다.
      </div>
    </section>
  );
}
