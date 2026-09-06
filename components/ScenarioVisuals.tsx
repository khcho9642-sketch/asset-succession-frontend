"use client";

import type { ReactNode } from "react";
import { formatEok } from "@/lib/phase2b/calculation";
import type { ClientFacts, MoneyResult, Scenario, ScenarioPlan } from "@/lib/phase2b";

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

export function ScenarioVisualGrid({ plan }: Readonly<{ plan: ScenarioPlan }>) {
  return (
    <section className="mt-6 grid gap-4 lg:grid-cols-2" aria-label="시나리오 핵심 그래프">
      <AssetCompositionChart facts={plan.facts} />
      <RecommendationComparisonChart plan={plan} />
      <LiquidityFundingChart plan={plan} />
      <ExecutionTimelineChart scenarios={plan.display_scenarios.recommended} liquiditySupport={plan.display_scenarios.liquidity_support} />
    </section>
  );
}

export function AssetCompositionChart({ facts, compact = false }: Readonly<{ facts: ClientFacts; compact?: boolean }>) {
  const rows = facts.assets
    .filter((asset) => asset.current_value_eok !== null)
    .map((asset) => ({ label: assetLabels[asset.type], value: asset.current_value_eok ?? 0 }));
  const total = rows.reduce((sum, row) => sum + row.value, 0);

  return (
    <ChartCard title="자산 구성" helper="확정 입력된 자산 금액만 막대로 표시합니다." compact={compact}>
      {rows.length === 0 || total <= 0 ? (
        <p className="text-sm text-[var(--muted)]">자산별 확정 금액이 없어 그래프는 추가 확인 필요로 표시합니다.</p>
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => {
            const percent = Math.round((row.value / total) * 100);
            return (
              <div key={row.label} className="grid gap-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold">{row.label}</span>
                  <span className="text-[var(--muted)]">{formatEok(row.value)} · {percent}%</span>
                </div>
                <div className="h-3 overflow-hidden bg-[var(--border)]" aria-label={`${row.label} ${formatEok(row.value)} ${percent}%`}>
                  <div className="h-full bg-[var(--gold)]" style={{ width: `${percent}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ChartCard>
  );
}

export function RecommendationComparisonChart({ plan, compact = false }: Readonly<{ plan: ScenarioPlan; compact?: boolean }>) {
  const rows = [
    {
      label: "현재 상태 기준안",
      tax: plan.baseline.calculation_result.total_tax,
      cash: plan.baseline.calculation_result.immediate_cash_required,
      risk: plan.baseline.calculation_result.status
    },
    ...plan.display_scenarios.recommended.map((scenario, index) => ({
      label: `AI 추천 ${index + 1} · ${scenario.name}`,
      tax: scenario.calculation_result.total_tax,
      cash: scenario.calculation_result.immediate_cash_required,
      risk: scenario.calculation_result.status
    }))
  ];
  const maxValue = Math.max(1, ...rows.flatMap((row) => [row.tax.value_eok ?? 0, row.cash.value_eok ?? 0]));

  return (
    <ChartCard title="기준안과 추천안 비교" helper="세금·즉시현금은 같은 계산 결과 객체에서 읽습니다." compact={compact}>
      <div className="grid gap-3">
        {rows.map((row) => (
          <div key={row.label} className="grid gap-1">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold">{row.label}</span>
              <span className="text-[var(--muted)]">{moneyLabel(row.tax)} / {moneyLabel(row.cash)}</span>
            </div>
            <div className="grid grid-cols-[1fr_1fr] gap-2">
              <Bar value={row.tax.value_eok} maxValue={maxValue} label={`세금 ${moneyLabel(row.tax)}`} tone="gold" />
              <Bar value={row.cash.value_eok} maxValue={maxValue} label={`즉시현금 ${moneyLabel(row.cash)}`} tone="navy" />
            </div>
            <p className="text-xs text-[var(--muted)]">위험·상태: {statusLabels[row.risk]}</p>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

export function LiquidityFundingChart({ plan, compact = false }: Readonly<{ plan: ScenarioPlan; compact?: boolean }>) {
  const financialAssets = plan.facts.assets
    .filter((asset) => asset.type === "financial")
    .reduce((sum, asset) => sum + (asset.current_value_eok ?? 0), 0);
  const availableCash = plan.facts.available_tax_payment_cash_eok ?? financialAssets;
  const requiredCash = plan.baseline.calculation_result.immediate_cash_required.value_eok ?? plan.baseline.calculation_result.total_tax.value_eok;
  const gap = plan.baseline.calculation_result.liquidity_gap.value_eok;
  const maxValue = Math.max(1, availableCash, requiredCash ?? 0, gap ?? 0);

  return (
    <ChartCard title="납세재원과 부족액" helper="상속세 납부 가능 현금이 있으면 우선 사용하고, 없으면 금융자산을 보조지표로 봅니다." compact={compact}>
      <div className="grid gap-3">
        <MetricBar label="확인 가용현금" value={availableCash} maxValue={maxValue} />
        <MetricBar label="즉시 필요현금" value={requiredCash} maxValue={maxValue} fallback="세액 계산 후 산정" />
        <MetricBar label="부족액" value={gap} maxValue={maxValue} fallback="비교 불가" danger />
      </div>
      {plan.display_scenarios.liquidity_support ? (
        <p className="mt-3 text-xs leading-5 text-[var(--muted)]">보험은 직접 절세안이 아니라 납세재원 보완안으로 분리했습니다.</p>
      ) : null}
    </ChartCard>
  );
}

export function ExecutionTimelineChart({ scenarios, liquiditySupport, compact = false }: Readonly<{ scenarios: Scenario[]; liquiditySupport?: Scenario | null; compact?: boolean }>) {
  const timeline = [...scenarios, ...(liquiditySupport ? [liquiditySupport] : [])]
    .flatMap((scenario) => scenario.timeline.slice(0, 3).map((event) => ({ scenario: scenario.name, event })))
    .slice(0, compact ? 6 : 8);

  return (
    <ChartCard title="증여·대출·상속 실행 타임라인" helper="추천된 시나리오의 실행 이벤트만 순서대로 표시합니다." compact={compact}>
      {timeline.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">추천 실행 단계는 추가 확인 후 생성합니다.</p>
      ) : (
        <ol className="grid gap-2">
          {timeline.map((item, index) => (
            <li key={`${item.scenario}-${item.event}-${index}`} className="grid grid-cols-[2.5rem_1fr] gap-3 text-sm">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--navy-950)] text-xs font-semibold text-white">{index + 1}</span>
              <span>
                <span className="block font-semibold text-[var(--navy-950)]">{item.event}</span>
                <span className="block text-xs text-[var(--muted)]">{item.scenario}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </ChartCard>
  );
}

function ChartCard({ title, helper, compact, children }: Readonly<{ title: string; helper: string; compact: boolean; children: ReactNode }>) {
  return (
    <article className={`report-chart border border-[var(--border)] bg-white ${compact ? "p-4" : "p-5"}`}>
      <h3 className="text-lg font-semibold tracking-[-0.04em] text-[var(--navy-950)]">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{helper}</p>
      <div className="mt-4">{children}</div>
    </article>
  );
}

function MetricBar({ label, value, maxValue, fallback, danger = false }: Readonly<{ label: string; value: number | null; maxValue: number; fallback?: string; danger?: boolean }>) {
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold">{label}</span>
        <span className="text-[var(--muted)]">{value === null ? fallback ?? "추가 확인 필요" : formatEok(value)}</span>
      </div>
      <Bar value={value} maxValue={maxValue} label={`${label} ${value === null ? fallback ?? "추가 확인 필요" : formatEok(value)}`} tone={danger ? "danger" : "gold"} />
    </div>
  );
}

function Bar({ value, maxValue, label, tone }: Readonly<{ value: number | null; maxValue: number; label: string; tone: "gold" | "navy" | "danger" }>) {
  const width = value === null ? 7 : Math.max(7, Math.round((value / maxValue) * 100));
  const color = tone === "danger" ? "var(--danger)" : tone === "navy" ? "var(--navy-950)" : "var(--gold)";
  return (
    <div className="h-3 overflow-hidden bg-[var(--border)]" aria-label={label}>
      <div className="h-full" style={{ width: `${width}%`, background: color }} />
    </div>
  );
}

function moneyLabel(result: MoneyResult) {
  return result.value_eok === null ? result.label : result.label;
}
