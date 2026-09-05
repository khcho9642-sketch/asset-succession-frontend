"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ASSESSMENT_STORAGE_KEY, formatAnswer } from "@/lib/assessment";
import type { AssessmentSnapshot } from "@/lib/assessment";

export function AssessmentSummary({ compact = false }: Readonly<{ compact?: boolean }>) {
  const [snapshot, setSnapshot] = useState<AssessmentSnapshot | null | undefined>(undefined);

  useEffect(() => {
    const raw = window.sessionStorage.getItem(ASSESSMENT_STORAGE_KEY);
    if (!raw) {
      setSnapshot(null);
      return;
    }
    try {
      setSnapshot(JSON.parse(raw) as AssessmentSnapshot);
    } catch {
      setSnapshot(null);
    }
  }, []);

  if (snapshot === undefined) {
    return <div className="border border-[var(--border)] bg-white p-5 text-sm text-[var(--muted)]">사전진단 요약을 확인하는 중입니다.</div>;
  }

  if (!snapshot) {
    return (
      <div className="border border-[var(--border)] bg-white p-6">
        <p className="text-sm font-semibold text-[var(--gold)]">사전진단 입력값 없음</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[var(--navy-950)]">먼저 무료 사전진단을 완료해 주세요.</h2>
        <p className="mt-3 text-sm leading-7 text-[var(--muted)]">이 브라우저 세션에 연결된 진단 스냅샷이 없어 고정 예시만 볼 수 있습니다.</p>
        <Link href="/precheck" className="mt-5 inline-flex bg-[var(--navy-950)] px-5 py-3 text-sm font-semibold text-white">
          사전진단 시작하기
        </Link>
      </div>
    );
  }

  const entries = Object.entries(snapshot.answers);

  return (
    <section className="border border-[var(--border)] bg-white p-6">
      <p className="text-sm font-semibold text-[var(--gold)]">연결된 사전진단</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--navy-950)]">{snapshot.assessment_id}</h2>
          <p className="mt-2 text-xs text-[var(--muted)]">같은 브라우저 세션에서만 유지되는 비식별 입력 스냅샷입니다.</p>
        </div>
        <span className="border border-[var(--border)] bg-[var(--ivory)] px-3 py-2 text-xs font-semibold text-[var(--navy-900)]">
          우선 관점: {snapshot.review_focus.join(", ")}
        </span>
      </div>
      <dl className={`mt-5 grid gap-3 text-sm ${compact ? "" : "md:grid-cols-2"}`}>
        {entries.map(([key, answer]) => (
          <div key={key} className="border-t border-[var(--border)] pt-3">
            <dt className="text-[var(--muted)]">{answer.label}</dt>
            <dd className="mt-1 font-semibold leading-6 text-[var(--text)]">{formatAnswer(answer)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
