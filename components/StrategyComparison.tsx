import { strategyBranches } from "@/lib/mockData";
import type { Strategy } from "@/lib/mockData";

const fields = [
  ["현재 세금·비용", "current_tax_and_cost"],
  ["미래 세금·비용", "future_tax_and_cost"],
  ["총 부담", "total_burden"],
  ["즉시 필요현금", "immediate_cash_required"],
  ["부모 잔여재산", "parent_remaining_assets"],
  ["자녀 이전재산", "child_transferred_assets"],
  ["납부재원 부족액", "liquidity_gap"],
  ["자산 통제권", "control_level"],
  ["실행 복잡도", "complexity"]
] as const;

type MetricKey = Extract<keyof Strategy, typeof fields[number][1]>;

const mobileDetailFields = fields.filter(([, key]) => !["total_burden", "immediate_cash_required", "liquidity_gap"].includes(key));
const mobileSummaryFields: ReadonlyArray<readonly [string, MetricKey]> = [
  ["총 부담", "total_burden"],
  ["즉시 필요현금", "immediate_cash_required"],
  ["납부재원 부족액", "liquidity_gap"]
];

function StatusBadge({ status }: Readonly<{ status: string }>) {
  return <span className="inline-flex border border-[var(--border)] bg-[var(--ivory)] px-3 py-1 text-xs font-semibold text-[var(--navy-900)]">{status}</span>;
}

export function StrategyComparison() {
  return (
    <>
      <div className="hidden overflow-hidden border border-[var(--border)] bg-white lg:block print:hidden">
        <table className="w-full border-collapse text-left">
          <thead className="bg-[var(--ivory)] text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
            <tr>
              <th className="px-4 py-4">전략</th>
              <th className="px-4 py-4">현재 세금·비용</th>
              <th className="px-4 py-4">미래 세금·비용</th>
              <th className="bg-white px-4 py-4 text-[var(--navy-950)]">총 부담</th>
              <th className="bg-white px-4 py-4 text-[var(--navy-950)]">즉시 현금</th>
              <th className="px-4 py-4">부모 잔여</th>
              <th className="px-4 py-4">자녀 이전</th>
              <th className="bg-white px-4 py-4 text-[var(--navy-950)]">부족액</th>
              <th className="px-4 py-4">통제권</th>
              <th className="px-4 py-4">복잡도</th>
              <th className="px-4 py-4">상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {strategyBranches.map((strategy) => (
              <tr key={strategy.name} className="align-top">
                <td className="px-4 py-5">
                  <p className="font-semibold text-[var(--text)]">{strategy.name}</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{strategy.key_review_items.join(" · ")}</p>
                </td>
                <td className="px-4 py-5 text-sm">{strategy.current_tax_and_cost}</td>
                <td className="px-4 py-5 text-sm">{strategy.future_tax_and_cost}</td>
                <td className="bg-[var(--ivory)]/45 px-4 py-5 text-base font-bold text-[var(--navy-950)]">{strategy.total_burden}</td>
                <td className="bg-[var(--ivory)]/45 px-4 py-5 text-base font-bold text-[var(--navy-950)]">{strategy.immediate_cash_required}</td>
                <td className="px-4 py-5 text-sm">{strategy.parent_remaining_assets}</td>
                <td className="px-4 py-5 text-sm">{strategy.child_transferred_assets}</td>
                <td className="bg-[var(--ivory)]/45 px-4 py-5 text-base font-bold text-[var(--navy-950)]">{strategy.liquidity_gap}</td>
                <td className="px-4 py-5 text-sm">{strategy.control_level}</td>
                <td className="px-4 py-5 text-sm">{strategy.complexity}</td>
                <td className="px-4 py-5"><StatusBadge status={strategy.calculation_status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:hidden print:hidden">
        {strategyBranches.map((strategy) => {
          const Icon = strategy.icon;
          return (
            <article key={strategy.name} className="border border-[var(--border)] bg-white p-5">
              <div className="flex items-start gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-[var(--gold)] text-[var(--gold)]">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-lg font-semibold tracking-[-0.03em]">{strategy.name}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{strategy.description}</p>
                </div>
              </div>
              <div className="mt-5">
                <StatusBadge status={strategy.calculation_status} />
              </div>
              <dl className="mt-5 grid gap-3">
                {mobileSummaryFields.map(([label, key]) => (
                  <div key={key} className="grid grid-cols-[7.5rem_1fr] gap-3 border-t border-[var(--border)] pt-3 text-sm">
                    <dt className="text-[var(--muted)]">{label}</dt>
                    <dd className="font-semibold text-[var(--text)]">{strategy[key]}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 border-l-2 border-[var(--gold)] pl-3 text-sm leading-6 text-[var(--muted)]">{strategy.key_review_items[0]} · {strategy.status_detail}</p>
              <details className="mt-5 border-t border-[var(--border)] pt-4">
                <summary className="cursor-pointer text-sm font-semibold text-[var(--navy-900)]">상세 지표 펼치기</summary>
                <dl className="mt-4 grid gap-3">
                  {mobileDetailFields.map(([label, key]) => (
                    <div key={key} className="grid grid-cols-[7.5rem_1fr] gap-3 border-t border-[var(--border)] pt-3 text-sm">
                      <dt className="text-[var(--muted)]">{label}</dt>
                      <dd className="font-semibold text-[var(--text)]">{strategy[key]}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </article>
          );
        })}
      </div>

      <div className="hidden print:block">
        <table className="print-comparison-table w-full border-collapse text-left">
          <caption className="mb-2 text-left text-sm font-semibold">표 A. 세금·비용·현금흐름</caption>
          <thead>
            <tr>
              <th>전략</th>
              <th>현재 세금·비용</th>
              <th>미래 세금·비용</th>
              <th>총 부담</th>
              <th>즉시 필요현금</th>
              <th>납부재원 부족액</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {strategyBranches.map((strategy) => (
              <tr key={strategy.name}>
                <td>{strategy.name}</td>
                <td>{strategy.current_tax_and_cost}</td>
                <td>{strategy.future_tax_and_cost}</td>
                <td>{strategy.total_burden}</td>
                <td>{strategy.immediate_cash_required}</td>
                <td>{strategy.liquidity_gap}</td>
                <td>{strategy.calculation_status}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="print-comparison-table mt-5 w-full border-collapse text-left">
          <caption className="mb-2 text-left text-sm font-semibold">표 B. 가족 이전결과·통제권·실행 난이도</caption>
          <thead>
            <tr>
              <th>전략</th>
              <th>부모 잔여재산</th>
              <th>자녀 이전재산</th>
              <th>통제권</th>
              <th>복잡도</th>
              <th>핵심 검토사항</th>
            </tr>
          </thead>
          <tbody>
            {strategyBranches.map((strategy) => (
              <tr key={strategy.name}>
                <td>{strategy.name}</td>
                <td>{strategy.parent_remaining_assets}</td>
                <td>{strategy.child_transferred_assets}</td>
                <td>{strategy.control_level}</td>
                <td>{strategy.complexity}</td>
                <td>{strategy.key_review_items.join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
