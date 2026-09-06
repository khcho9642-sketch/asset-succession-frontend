import { buildScenarioPlan, phase2bFixtures } from "@/lib/phase2b";
import type { CalculationStatus, PlanningTrack } from "@/lib/phase2b";

const trackLabels: Record<PlanningTrack, string> = {
  inheritance: "상속",
  gift: "증여",
  business_succession: "가업상속·가업승계",
  capital_gains: "양도"
};

const statusLabels: Record<CalculationStatus, string> = {
  calculable: "계산 가능",
  needs_info: "추가정보 필요",
  needs_engine: "계산엔진 연결 필요",
  needs_expert_review: "전문가 검토 필요",
  incomparable: "현재 조건에서는 비교 불가",
  not_applicable: "현재 조건에서는 제외"
};

const fixtureNames: Record<keyof typeof phase2bFixtures, string> = {
  caseAInheritance: "Case A — 상속",
  caseBGift: "Case B — 증여",
  caseCBusinessSuccession: "Case C — 가업승계",
  caseDCapitalGains: "Case D — 양도"
};

export default function Phase2BPage() {
  const plans = Object.entries(phase2bFixtures).map(([key, facts]) => ({
    key,
    title: fixtureNames[key as keyof typeof phase2bFixtures],
    plan: buildScenarioPlan(facts)
  }));

  return (
    <main className="min-h-screen bg-[var(--ivory)] px-5 py-8 text-[var(--navy-950)] lg:px-10">
      <section className="mx-auto max-w-7xl border border-[var(--border)] bg-white p-6 lg:p-10">
        <p className="text-sm font-semibold tracking-[0.12em] text-[var(--gold)]">PHASE 2B ENGINE FOUNDATION</p>
        <div className="mt-5 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <h1 className="text-4xl font-semibold tracking-[-0.06em] lg:text-6xl">계산·시나리오 엔진 계약 검수 화면</h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-[var(--muted)]">
              이 화면은 Report V2(#5)와 Conversational Precheck V2(#6)가 함께 사용할 공통 데이터 구조를 검증합니다.
              실제 세법 계산엔진과 AI API는 아직 연결하지 않으며, 입력되지 않은 세액·절세액·납부재원 부족액은 숫자로 만들지 않습니다.
            </p>
          </div>
          <aside className="border border-[var(--border)] bg-[var(--ivory)] p-5">
            <h2 className="text-lg font-semibold">4대 진단 트랙</h2>
            <div className="mt-4 grid gap-2 text-sm font-semibold">
              {Object.entries(trackLabels).map(([track, label]) => (
                <span key={track} className="border border-[var(--border)] bg-white px-4 py-3">{label}</span>
              ))}
            </div>
            <p className="mt-4 text-sm leading-6 text-[var(--muted)]">보험·가족법인·부담부증여·혼합안은 최상위 상품이 아니라 트랙별 실행수단입니다.</p>
          </aside>
        </div>
      </section>

      <section className="mx-auto mt-6 grid max-w-7xl gap-5 lg:grid-cols-4">
        {plans.map(({ key, title, plan }) => (
          <article key={key} className="border border-[var(--border)] bg-white p-5">
            <p className="text-xs font-semibold tracking-[0.08em] text-[var(--gold)]">{title}</p>
            <h2 className="mt-3 text-xl font-semibold">{plan.facts.client_facts_id}</h2>
            <p className="mt-3 text-sm text-[var(--muted)]">
              {plan.facts.planning_tracks.map((track) => trackLabels[track]).join(" · ")}
            </p>
            <dl className="mt-5 grid gap-3 text-sm">
              <div className="flex justify-between gap-3 border-b border-[var(--border)] pb-2">
                <dt className="text-[var(--muted)]">현재 입력 자산가액</dt>
                <dd className="font-semibold">{plan.baseline.calculation_result.asset_value.label}</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-[var(--border)] pb-2">
                <dt className="text-[var(--muted)]">기준안 예상세액</dt>
                <dd className="font-semibold">{plan.baseline.calculation_result.total_tax.label}</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-[var(--border)] pb-2">
                <dt className="text-[var(--muted)]">unknown</dt>
                <dd className="font-semibold">{plan.unknown_items.length}건</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-[var(--border)] pb-2">
                <dt className="text-[var(--muted)]">AI 내부 분석</dt>
                <dd className="font-semibold">{plan.internal_analysis.candidate_library_count}개 완료</dd>
              </div>
            </dl>
          </article>
        ))}
      </section>

      <section className="mx-auto mt-6 grid max-w-7xl gap-6">
        {plans.map(({ key, title, plan }) => (
          <article key={key} className="border border-[var(--border)] bg-white p-6">
            <div className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-5 lg:flex-row lg:items-end">
              <div>
                <p className="text-sm font-semibold tracking-[0.08em] text-[var(--gold)]">{title}</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">사용자 노출 결과</h2>
              </div>
              <p className="text-sm text-[var(--muted)]">{plan.internal_analysis.disclosure_label} · 전체 후보 목록은 노출하지 않습니다.</p>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                <thead className="bg-[var(--ivory)]">
                  <tr>
                    <th className="border border-[var(--border)] px-4 py-3">구분</th>
                    <th className="border border-[var(--border)] px-4 py-3">트랙</th>
                    <th className="border border-[var(--border)] px-4 py-3">표시 시나리오</th>
                    <th className="border border-[var(--border)] px-4 py-3">계산상태</th>
                    <th className="border border-[var(--border)] px-4 py-3">예상 절세액</th>
                    <th className="border border-[var(--border)] px-4 py-3">제시 이유</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-[var(--border)] px-4 py-3 font-semibold">현재 상태 기준안</td>
                    <td className="border border-[var(--border)] px-4 py-3 font-semibold">{trackLabels[plan.baseline.track]}</td>
                    <td className="border border-[var(--border)] px-4 py-3">{plan.baseline.name}</td>
                    <td className="border border-[var(--border)] px-4 py-3">{statusLabels[plan.baseline.calculation_result.status]}</td>
                    <td className="border border-[var(--border)] px-4 py-3 font-semibold">기준안</td>
                    <td className="border border-[var(--border)] px-4 py-3 text-[var(--muted)]">{plan.baseline.description}</td>
                  </tr>
                  {plan.display_scenarios.comparison_scenarios.map((scenario) => {
                    const recommendedIndex = plan.display_scenarios.recommended.findIndex((item) => item.scenario_id === scenario.scenario_id);
                    const exposureLabel = recommendedIndex >= 0
                      ? `AI 추천 ${recommendedIndex + 1}`
                      : scenario.scenario_id === plan.display_scenarios.liquidity_support?.scenario_id
                        ? "납세재원 보완안"
                        : "추가 검토안";
                    return (
                      <tr key={scenario.scenario_id}>
                        <td className="border border-[var(--border)] px-4 py-3 font-semibold">{exposureLabel}</td>
                        <td className="border border-[var(--border)] px-4 py-3 font-semibold">{trackLabels[scenario.track]}</td>
                        <td className="border border-[var(--border)] px-4 py-3">{scenario.name}</td>
                        <td className="border border-[var(--border)] px-4 py-3">{statusLabels[scenario.calculation_status]}</td>
                        <td className="border border-[var(--border)] px-4 py-3 font-semibold">{scenario.comparison.expected_tax_savings.label}</td>
                        <td className="border border-[var(--border)] px-4 py-3 text-[var(--muted)]">{scenario.rationale[0]}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              {plan.display_scenarios.recommended.map((scenario, index) => (
                <article key={scenario.scenario_id} className="border border-[var(--border)] bg-[var(--ivory)] p-4">
                  <p className="text-sm font-semibold text-[var(--gold)]">AI 추천 {index + 1}</p>
                  <h3 className="mt-2 text-lg font-semibold">{scenario.name}</h3>
                  <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{scenario.rationale[0]}</p>
                </article>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="mx-auto mt-6 max-w-7xl border border-[var(--border)] bg-[var(--navy-950)] p-6 text-white">
        <p className="text-sm font-semibold tracking-[0.08em] text-[var(--gold)]">CONTRACT STATUS</p>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <article>
            <h2 className="text-2xl font-semibold">Report V2 #5</h2>
            <p className="mt-3 text-sm leading-7 text-white/70">
              페이지 1·4·5·6은 이 ScenarioPlan을 읽되, 계산엔진 연결 전에는 기준안 예상세액·우선 시나리오 예상세액·예상 절세액·절세율·순효과를 표시하지 않습니다.
            </p>
          </article>
          <article>
            <h2 className="text-2xl font-semibold">Conversational Precheck V2 #6</h2>
            <p className="mt-3 text-sm leading-7 text-white/70">
              버튼 답변과 사용자가 확인한 자유입력만 ClientFacts로 normalize합니다. 확인 전 candidate/free text는 계산 입력으로 쓰지 않습니다.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
