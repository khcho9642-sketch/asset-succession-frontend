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

const chartColors = ["var(--gold)", "var(--navy-950)", "#6f7f8f", "#28745a", "#c8b58a"];

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
  const rows = Object.values(
    facts.assets
      .filter((asset) => asset.current_value_eok !== null)
      .reduce<Record<string, { label: string; value: number }>>((accumulator, asset) => {
        const label = assetLabels[asset.type];
        accumulator[label] = {
          label,
          value: (accumulator[label]?.value ?? 0) + (asset.current_value_eok ?? 0)
        };
        return accumulator;
      }, {})
  );
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const donutGradient = buildDonutGradient(rows.map((row, index) => ({ ...row, color: chartColors[index % chartColors.length] })), total);

  return (
    <ChartCard title="자산 구성" helper="확정 입력된 자산 금액만 막대와 도넛으로 표시합니다." compact={compact}>
      {rows.length === 0 || total <= 0 ? (
        <p className="text-sm text-[var(--muted)]">자산별 확정 금액이 없어 그래프는 추가 확인 필요로 표시합니다.</p>
      ) : (
        <div className={`grid gap-4 ${compact ? "sm:grid-cols-[7rem_1fr] sm:items-center print:grid-cols-[7rem_1fr] print:items-center" : "md:grid-cols-[9rem_1fr] md:items-center"}`}>
          <div className="motion-donut relative mx-auto h-32 w-32 rounded-full" style={{ background: donutGradient }} aria-label={`확인된 자산 기준 구성비 총 ${formatEok(total)}`}>
            <div className="absolute inset-6 rounded-full bg-white" />
            <div className="absolute inset-0 flex items-center justify-center text-center">
              <span className="text-xs font-semibold leading-4 text-[var(--navy-950)]">확인 자산<br />{formatEok(total)}</span>
            </div>
          </div>
          <div className="grid gap-3">
          {rows.map((row, index) => {
            const percent = Math.round((row.value / total) * 100);
            return (
              <div key={row.label} className="grid gap-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 font-semibold">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: chartColors[index % chartColors.length] }} />
                    {row.label}
                  </span>
                  <span className="text-[var(--muted)]">{formatEok(row.value)} · {percent}%</span>
                </div>
                <div className="h-3 overflow-hidden bg-[var(--border)]" aria-label={`${row.label} ${formatEok(row.value)} ${percent}%`}>
                  <div className="motion-bar-fill h-full" style={{ width: `${percent}%`, background: chartColors[index % chartColors.length], animationDelay: `${index * 80}ms` }} />
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}
    </ChartCard>
  );
}

export function RecommendationComparisonChart({ plan, compact = false, recommendationLabel = "AI 추천" }: Readonly<{ plan: ScenarioPlan; compact?: boolean; recommendationLabel?: string }>) {
  const rows = [
    {
      label: "현재 상태 기준안",
      tax: plan.baseline.calculation_result.total_tax,
      cash: plan.baseline.calculation_result.immediate_cash_required,
      risk: plan.baseline.calculation_result.status
    },
    ...plan.display_scenarios.recommended.map((scenario, index) => ({
      label: `${recommendationLabel} ${index + 1} · ${scenario.name}`,
      tax: scenario.calculation_result.total_tax,
      cash: scenario.calculation_result.immediate_cash_required,
      risk: scenario.calculation_result.status
    }))
  ];
  const maxValue = Math.max(1, ...rows.flatMap((row) => [row.tax.value_eok ?? 0, row.cash.value_eok ?? 0]));

  return (
    <ChartCard title={recommendationLabel === "검토 후보" ? "기준안과 검토 후보 비교" : "기준안과 추천안 비교"} helper="세금·즉시현금은 같은 계산 결과 객체에서 읽습니다." compact={compact}>
      <div className="grid gap-3">
        {rows.map((row, index) => (
          <div key={row.label} className="grid gap-1">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold">{row.label}</span>
              <span className="text-[var(--muted)]">{moneyLabel(row.tax)} / {moneyLabel(row.cash)}</span>
            </div>
            <div className="grid grid-cols-[1fr_1fr] gap-2">
              <Bar value={row.tax.value_eok} maxValue={maxValue} label={`세금 ${moneyLabel(row.tax)}`} tone="gold" delay={index * 80} />
              <Bar value={row.cash.value_eok} maxValue={maxValue} label={`즉시현금 ${moneyLabel(row.cash)}`} tone="navy" delay={index * 80 + 45} />
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
        <MetricBar label="확인 가용현금" value={availableCash} maxValue={maxValue} delay={0} />
        <MetricBar label="즉시 필요현금" value={requiredCash} maxValue={maxValue} fallback="세액 계산 후 산정" delay={90} />
        <MetricBar label="부족액" value={gap} maxValue={maxValue} fallback="비교 불가" danger delay={180} />
      </div>
      {plan.display_scenarios.liquidity_support ? (
        <p className="mt-3 text-xs leading-5 text-[var(--muted)]">보험은 직접 절세안이 아니라 납세재원 보완안으로 분리했습니다.</p>
      ) : null}
    </ChartCard>
  );
}

export function ExecutionTimelineChart({ scenarios, liquiditySupport, compact = false, candidateMode = false }: Readonly<{ scenarios: Scenario[]; liquiditySupport?: Scenario | null; compact?: boolean; candidateMode?: boolean }>) {
  const timeline = [...scenarios, ...(liquiditySupport ? [liquiditySupport] : [])]
    .flatMap((scenario) => scenario.timeline.slice(0, 3).map((event) => ({ scenario: scenario.name, event })))
    .slice(0, compact ? 6 : 8);

  return (
    <ChartCard title={candidateMode ? "검토 후보별 실행 순서" : "증여·대출·상속 실행 타임라인"} helper={candidateMode ? "검토 후보에 연결된 실행 단계를 순서대로 표시합니다." : "추천된 시나리오의 실행 이벤트만 순서대로 표시합니다."} compact={compact}>
      {timeline.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{candidateMode ? "후보별" : "추천"} 실행 단계는 추가 확인 후 생성합니다.</p>
      ) : (
        <ol className="grid gap-2">
          {timeline.map((item, index) => (
            <li
              key={`${item.scenario}-${item.event}-${index}`}
              className="motion-timeline-item grid grid-cols-[2.5rem_1fr] gap-3 text-sm"
              style={{ animationDelay: `${index * 70}ms` }}
            >
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
    <article className={`motion-chart-card report-chart border border-[var(--border)] bg-white ${compact ? "p-4" : "p-5"}`}>
      <h3 className="text-lg font-semibold tracking-[-0.04em] text-[var(--navy-950)]">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{helper}</p>
      <div className="mt-4">{children}</div>
    </article>
  );
}

function MetricBar({ label, value, maxValue, fallback, danger = false, delay = 0 }: Readonly<{ label: string; value: number | null; maxValue: number; fallback?: string; danger?: boolean; delay?: number }>) {
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold">{label}</span>
        <span className="text-[var(--muted)]">{value === null ? fallback ?? "추가 확인 필요" : formatEok(value)}</span>
      </div>
      <Bar value={value} maxValue={maxValue} label={`${label} ${value === null ? fallback ?? "추가 확인 필요" : formatEok(value)}`} tone={danger ? "danger" : "gold"} delay={delay} />
    </div>
  );
}

function Bar({ value, maxValue, label, tone, delay = 0 }: Readonly<{ value: number | null; maxValue: number; label: string; tone: "gold" | "navy" | "danger"; delay?: number }>) {
  const width = value === null ? 7 : Math.max(7, Math.round((value / maxValue) * 100));
  const color = tone === "danger" ? "var(--danger)" : tone === "navy" ? "var(--navy-950)" : "var(--gold)";
  return (
    <div className="h-3 overflow-hidden bg-[var(--border)]" aria-label={label}>
      <div className="motion-bar-fill h-full" style={{ width: `${width}%`, background: color, animationDelay: `${delay}ms` }} />
    </div>
  );
}

function moneyLabel(result: MoneyResult) {
  return result.value_eok === null ? result.label : result.label;
}

function buildDonutGradient(rows: Array<{ value: number; color: string }>, total: number) {
  let cursor = 0;
  const segments = rows.map((row) => {
    const start = cursor;
    const end = cursor + (row.value / total) * 100;
    cursor = end;
    return `${row.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
  });
  return `conic-gradient(${segments.join(", ")})`;
}
