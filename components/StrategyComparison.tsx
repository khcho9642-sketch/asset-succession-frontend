import { strategyBranches } from "@/lib/mockData";

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

function StatusBadge({ status }: Readonly<{ status: string }>) {
  return <span className="inline-flex border border-[var(--border)] bg-[var(--ivory)] px-3 py-1 text-xs font-semibold text-[var(--navy-900)]">{status}</span>;
}

export function StrategyComparison() {
  return (
    <>
      <div className="hidden overflow-hidden border border-[var(--border)] bg-white lg:block">
        <table className="w-full border-collapse text-left">
          <thead className="bg-[var(--ivory)] text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
            <tr>
              <th className="px-4 py-4">전략</th>
              <th className="px-4 py-4">현재 세금·비용</th>
              <th className="px-4 py-4">미래 세금·비용</th>
              <th className="px-4 py-4">총 부담</th>
              <th className="px-4 py-4">즉시 현금</th>
              <th className="px-4 py-4">부모 잔여</th>
              <th className="px-4 py-4">자녀 이전</th>
              <th className="px-4 py-4">부족액</th>
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
                <td className="px-4 py-5 text-sm font-semibold">{strategy.total_burden}</td>
                <td className="px-4 py-5 text-sm">{strategy.immediate_cash_required}</td>
                <td className="px-4 py-5 text-sm">{strategy.parent_remaining_assets}</td>
                <td className="px-4 py-5 text-sm">{strategy.child_transferred_assets}</td>
                <td className="px-4 py-5 text-sm">{strategy.liquidity_gap}</td>
                <td className="px-4 py-5 text-sm">{strategy.control_level}</td>
                <td className="px-4 py-5 text-sm">{strategy.complexity}</td>
                <td className="px-4 py-5"><StatusBadge status={strategy.calculation_status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:hidden">
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
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{strategy.status_detail}</p>
              </div>
              <dl className="mt-5 grid gap-3">
                {fields.map(([label, key]) => (
                  <div key={key} className="grid grid-cols-[7.5rem_1fr] gap-3 border-t border-[var(--border)] pt-3 text-sm">
                    <dt className="text-[var(--muted)]">{label}</dt>
                    <dd className="font-semibold text-[var(--text)]">{strategy[key]}</dd>
                  </div>
                ))}
              </dl>
            </article>
          );
        })}
      </div>
    </>
  );
}
