"use client";

import { CircleAlert, FilePenLine, GitBranch, PanelRightOpen, X } from "lucide-react";
import { useState } from "react";
import { ExpertShell } from "@/components/ExpertShell";
import { strategyBranches } from "@/lib/mockData";

type SavedEdit = { event: string; memo: string };

function getDefaultEvent(strategyIndex: number) {
  return strategyBranches[strategyIndex].timeline_events[0] ?? "정밀검토 단계에서 구성";
}

export default function ExpertWorkspacePage() {
  const [activeStrategyIndex, setActiveStrategyIndex] = useState(4);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftEvent, setDraftEvent] = useState(getDefaultEvent(4));
  const [draftMemo, setDraftMemo] = useState(`${strategyBranches[4].key_review_items.join(", ")} 확인 후 보고서에 반영`);
  const [savedEdits, setSavedEdits] = useState<Record<number, SavedEdit>>({});
  const [savedStrategyIndex, setSavedStrategyIndex] = useState<number | null>(null);
  const activeStrategy = strategyBranches[activeStrategyIndex];
  const activeEvents = activeStrategy.timeline_events;
  const savedEdit = savedEdits[activeStrategyIndex];

  function selectStrategy(index: number) {
    setActiveStrategyIndex(index);
    setEditorOpen(false);
  }

  function openEditor() {
    const existing = savedEdits[activeStrategyIndex];
    setDraftEvent(existing?.event ?? getDefaultEvent(activeStrategyIndex));
    setDraftMemo(existing?.memo ?? `${activeStrategy.key_review_items.join(", ")} 확인 후 보고서에 반영`);
    setEditorOpen(true);
  }

  function saveEditor() {
    setSavedEdits((previous) => ({
      ...previous,
      [activeStrategyIndex]: { event: draftEvent, memo: draftMemo }
    }));
    setSavedStrategyIndex(activeStrategyIndex);
  }

  return (
    <ExpertShell>
      <main className="px-6 py-8 lg:px-10">
        <div className="flex gap-2 overflow-x-auto border-b border-[var(--border)] pb-3 no-scrollbar">
          {strategyBranches.map((strategy, index) => (
            <button
              key={strategy.name}
              type="button"
              aria-selected={index === activeStrategyIndex}
              onClick={() => selectStrategy(index)}
              className={`shrink-0 border px-4 py-3 text-sm font-semibold ${index === activeStrategyIndex ? "border-[var(--gold)] bg-white text-[var(--navy-950)]" : "border-[var(--border)] text-[var(--muted)]"}`}
            >
              {strategy.name}
            </button>
          ))}
        </div>

        <section className="mt-6 grid gap-6 xl:grid-cols-[0.72fr_1.38fr_0.9fr]">
          <aside className="border border-[var(--border)] bg-white p-6">
            <div className="flex items-center gap-3">
              <GitBranch className="h-5 w-5 text-[var(--gold)]" />
              <h1 className="text-xl font-semibold">이벤트 타임라인</h1>
            </div>
            {activeEvents.length > 0 ? (
              <ol className="mt-6 grid gap-4">
                {activeEvents.map((event, index) => (
                  <li key={event} className="flex gap-4">
                    <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center border border-[var(--gold)] text-xs font-semibold text-[var(--gold)]">{index + 1}</span>
                    <div>
                      <p className="text-sm font-semibold">{event}</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{activeStrategy.name} 영향 반영</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="mt-6 border border-dashed border-[var(--border)] bg-[var(--ivory)] p-5">
                <p className="text-sm font-semibold text-[var(--navy-950)]">이 전략의 상세 이벤트는 정밀검토 단계에서 구성합니다.</p>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">채무승계 증빙과 담보 승인 여부가 확인되기 전까지 가족법인 이벤트를 재사용하지 않습니다.</p>
              </div>
            )}
            {savedEdit ? (
              <div className="mt-5 border-l-2 border-[var(--gold)] bg-[var(--ivory)] p-4">
                <p className="text-xs font-semibold text-[var(--gold)]">최근 편집 · 화면에만 임시 반영됨</p>
                <p className="mt-2 text-sm font-semibold">{savedEdit.event}</p>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{savedEdit.memo}</p>
              </div>
            ) : null}
          </aside>

          <section className="border border-[var(--border)] bg-white p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold tracking-[0.08em] text-[var(--gold)]">{activeStrategy.name} 시나리오</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[var(--navy-950)]">자산·소유구조 변화</h2>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{activeStrategy.description}</p>
              </div>
              <button type="button" onClick={openEditor} className="inline-flex border border-[var(--border)] px-4 py-3 text-sm font-semibold">
                <PanelRightOpen className="mr-2 h-4 w-4" /> 이벤트 수정
              </button>
            </div>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {activeStrategy.family_transfer_results.map((result) => (
                <article key={result.person} className="border border-[var(--border)] bg-[var(--ivory)] p-5">
                  <p className="text-sm font-semibold">{result.person}</p>
                  <strong className="mt-5 block text-4xl tracking-[-0.06em]">{result.value}</strong>
                  <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{result.note}</p>
                </article>
              ))}
            </div>
            <div className="mt-8 border border-[var(--border)] p-5">
              <p className="text-sm font-semibold">하단 가족별 이전 결과</p>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {activeStrategy.family_transfer_results.map((result) => (
                  <div key={result.person} className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-3">
                    <span className="text-sm text-[var(--muted)]">{result.person}</span>
                    <strong className="text-right">{result.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <aside id="issues" className="grid gap-5">
            <article className="border border-[var(--border)] bg-[var(--navy-950)] p-6 text-white">
              <p className="text-sm text-white/55">세금·현금흐름 요약</p>
              <strong className="mt-4 block text-4xl tracking-[-0.06em]">{activeStrategy.liquidity_gap}</strong>
              <p className="mt-3 text-sm leading-6 text-white/65">{activeStrategy.status_detail}</p>
            </article>
            <article className="border border-[var(--border)] bg-white p-6">
              <div className="flex items-center gap-3">
                <CircleAlert className="h-5 w-5 text-[var(--warning)]" />
                <h2 className="text-lg font-semibold">쟁점 요약</h2>
              </div>
              <ul className="mt-5 grid gap-3 text-sm leading-6 text-[var(--muted)]">
                {activeStrategy.key_review_items.map((issue) => (
                  <li key={issue}>{activeStrategy.calculation_status} · {issue}</li>
                ))}
              </ul>
            </article>
            <article className="border border-[var(--border)] bg-white p-6">
              <div className="flex items-center gap-3">
                <FilePenLine className="h-5 w-5 text-[var(--gold)]" />
                <h2 className="text-lg font-semibold">{savedEdit ? "최근 편집 이벤트" : "다음 검토 작업"}</h2>
              </div>
              <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
                {savedEdit ? `${savedEdit.event} · ${savedEdit.memo}` : "선택한 시나리오의 이벤트, 금액 가정, 검토 메모를 편집해 비교표에 반영합니다."}
              </p>
              {savedEdit ? <p className="mt-3 text-xs font-semibold text-[var(--gold)]">화면에만 임시 반영됨</p> : null}
              <button type="button" onClick={openEditor} className="mt-5 inline-flex border border-[var(--border)] px-4 py-3 text-sm font-semibold">
                편집 열기
              </button>
            </article>
          </aside>
        </section>

        <section id="sources" className="mt-6 border border-[var(--border)] bg-white p-6">
          <p className="text-sm font-semibold tracking-[0.08em] text-[var(--gold)]">규칙·출처</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">공식 근거 검토 현황</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {[
              ["연결 규칙", "18개", "상속·증여·양도·취득 관련 검토 규칙"],
              ["공식 출처", "24건", "법령·예규·심판례 후보"],
              ["검토 대기", "6건", "전문가 확인 후 보고서 반영"]
            ].map(([label, value, body]) => (
              <article key={label} className="border border-[var(--border)] bg-[var(--ivory)] p-5">
                <p className="text-sm text-[var(--muted)]">{label}</p>
                <strong className="mt-3 block text-3xl tracking-[-0.05em] text-[var(--navy-950)]">{value}</strong>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{body}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      {editorOpen ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="이벤트 편집">
          <button type="button" aria-label="편집 배경 닫기" className="absolute inset-0 bg-black/45" onClick={() => setEditorOpen(false)} />
          <aside className="absolute right-0 top-0 h-full w-[min(28rem,92vw)] overflow-y-auto bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold tracking-[0.08em] text-[var(--gold)]">이벤트 편집</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[var(--navy-950)]">{activeStrategy.name}</h2>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">합성 데이터 기준으로 이벤트 가정과 검토 메모를 확인합니다.</p>
              </div>
              <button type="button" aria-label="이벤트 편집 닫기" onClick={() => setEditorOpen(false)} className="border border-[var(--border)] p-2">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-8 grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-semibold">적용 시나리오</span>
                <input readOnly value={activeStrategy.name} className="border border-[var(--border)] bg-[var(--ivory)] px-4 py-3 text-sm" />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-semibold">핵심 이벤트</span>
                <select className="border border-[var(--border)] bg-white px-4 py-3 text-sm" value={draftEvent} onChange={(event) => setDraftEvent(event.target.value)}>
                  {(activeEvents.length > 0 ? activeEvents : ["정밀검토 단계에서 구성"]).map((event) => (
                    <option key={event}>{event}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-semibold">검토 메모</span>
                <textarea className="min-h-32 border border-[var(--border)] px-4 py-3 text-sm" value={draftMemo} onChange={(event) => setDraftMemo(event.target.value)} />
              </label>
              {savedStrategyIndex === activeStrategyIndex ? (
                <p className="border-l-2 border-[var(--gold)] bg-[var(--ivory)] p-4 text-sm font-semibold text-[var(--navy-950)]">화면에만 임시 반영됨</p>
              ) : null}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <button type="button" onClick={saveEditor} className="bg-[var(--navy-950)] px-5 py-3 text-sm font-semibold text-white">합성 변경사항 저장</button>
              <button type="button" onClick={() => setEditorOpen(false)} className="border border-[var(--border)] px-5 py-3 text-sm font-semibold">닫기</button>
            </div>
          </aside>
        </div>
      ) : null}
    </ExpertShell>
  );
}
