"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readAssessmentFromSession } from "@/lib/assessment";
import type { AssessmentLoadResult } from "@/lib/assessment";

export function AssessmentMetrics({ mode = "result" }: Readonly<{ mode?: "result" | "report" }>) {
  const [loadResult, setLoadResult] = useState<AssessmentLoadResult>({ status: "loading" });

  useEffect(() => {
    setLoadResult(readAssessmentFromSession());
  }, []);

  if (loadResult.status === "loading") {
    return <div className="border border-[var(--border)] bg-white p-5 text-sm text-[var(--muted)]">입력 기반 요약을 확인하는 중입니다.</div>;
  }

  if (loadResult.status !== "ready") {
    return (
      <section className="border border-[var(--border)] bg-white p-6">
        <p className="text-sm font-semibold text-[var(--gold)]">입력 기반 계산 요약 없음</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[var(--navy-950)]">총 부담·즉시 필요현금·납부재원 부족액은 사전진단 완료 후 표시됩니다.</h2>
        <p className="mt-3 text-sm leading-7 text-[var(--muted)]">현재 전략 숫자는 계산엔진 연결 전 합성 예시이며, 입력값에 따른 확정 세액이 아닙니다.</p>
        <Link href="/precheck" className="mt-5 inline-flex bg-[var(--navy-950)] px-5 py-3 text-sm font-semibold text-white print:hidden">
          사전진단 시작하기
        </Link>
      </section>
    );
  }

  const { metrics } = loadResult;
  const cards = mode === "result"
    ? [
        ["전략별 총 부담", metrics.totalBurden, "세액 계산엔진 연결 전 합성 비교값"],
        ["즉시 필요현금", metrics.immediateCash, "입력한 금융자산을 상담 재원 후보로 표시"],
        ["납부재원 부족액", metrics.fundingGap, "취득가·채무·공제 확인 후 산정"]
      ]
    : [
        ["입력 총자산", metrics.totalAssets, "사전진단 자산 금액 합계"],
        ["입력 금융자산", metrics.financialAssets, "납부재원 후보"],
        ["채무·보증금", metrics.estimatedDebt, "직접 입력한 채무만 반영"],
        ["순자산", metrics.netAssets, "채무금액이 있어야 산정"]
      ];

  return (
    <section className="grid gap-4">
      <div className={`grid gap-4 ${mode === "result" ? "sm:grid-cols-3" : "md:grid-cols-4"}`}>
        {cards.map(([label, value, helper], index) => (
          <article key={label} className={`border border-[var(--border)] p-5 ${index === 0 ? "bg-[var(--navy-950)] text-white" : "bg-white"}`}>
            <p className={`text-sm ${index === 0 ? "text-white/60" : "text-[var(--muted)]"}`}>{label}</p>
            <strong className={`mt-3 block text-3xl tracking-[-0.06em] ${index === 0 ? "text-white" : "text-[var(--navy-950)]"}`}>{value}</strong>
            <p className={`mt-3 text-xs leading-5 ${index === 0 ? "text-white/55" : "text-[var(--muted)]"}`}>{helper}</p>
          </article>
        ))}
      </div>
      <p className="border-l-2 border-[var(--gold)] bg-[var(--ivory)] p-4 text-xs leading-6 text-[var(--muted)]">
        입력 총자산 {metrics.totalAssets} · 입력 순자산 {metrics.netAssets}. {metrics.confidenceNote}
      </p>
    </section>
  );
}
