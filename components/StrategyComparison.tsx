import { strategyBranches } from "@/lib/mockData";

export function StrategyComparison() {
  return (
    <div className="overflow-hidden border border-[var(--border)] bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full border-collapse text-left">
          <thead className="bg-[var(--ivory)] text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
            <tr>
              <th className="px-5 py-4">전략</th>
              <th className="px-5 py-4">예상 세금·비용</th>
              <th className="px-5 py-4">즉시 필요현금</th>
              <th className="px-5 py-4">부모 잔여재산</th>
              <th className="px-5 py-4">자녀 이전재산</th>
              <th className="px-5 py-4">납부재원 부족액</th>
              <th className="px-5 py-4">자산 통제권</th>
              <th className="px-5 py-4">상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {strategyBranches.map((strategy) => (
              <tr key={strategy.name} className="align-top">
                <td className="px-5 py-5">
                  <p className="font-semibold text-[var(--text)]">{strategy.name}</p>
                  <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{strategy.considerations.join(" · ")}</p>
                </td>
                <td className="px-5 py-5 text-sm">{strategy.expectedCost}</td>
                <td className="px-5 py-5 text-sm">{strategy.immediateCash}</td>
                <td className="px-5 py-5 text-sm">{strategy.parentAssets}</td>
                <td className="px-5 py-5 text-sm">{strategy.childTransfer}</td>
                <td className="px-5 py-5 text-sm">{strategy.fundingGap}</td>
                <td className="px-5 py-5 text-sm">{strategy.control}</td>
                <td className="px-5 py-5">
                  <span className="inline-flex border border-[var(--border)] px-3 py-1 text-xs font-semibold text-[var(--navy-900)]">
                    {strategy.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
