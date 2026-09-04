import { CircleAlert, FilePenLine, GitBranch, PanelRightOpen } from "lucide-react";
import { ExpertShell } from "@/components/ExpertShell";
import { strategyBranches, timelineEvents } from "@/lib/mockData";

export default function ExpertWorkspacePage() {
  return (
    <ExpertShell>
      <main className="px-6 py-8 lg:px-10">
        <div className="flex gap-2 overflow-x-auto border-b border-[var(--border)] pb-3 no-scrollbar">
          {strategyBranches.map((strategy, index) => (
            <button key={strategy.name} type="button" className={`shrink-0 border px-4 py-3 text-sm font-semibold ${index === 3 ? "border-[var(--gold)] bg-white text-[var(--navy-950)]" : "border-[var(--border)] text-[var(--muted)]"}`}>
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
            <ol className="mt-6 grid gap-4">
              {timelineEvents.map((event, index) => (
                <li key={event} className="flex gap-4">
                  <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center border border-[var(--gold)] text-xs font-semibold text-[var(--gold)]">{index + 1}</span>
                  <div>
                    <p className="text-sm font-semibold">{event}</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--muted)]">세금·소유권·현금흐름 영향 반영</p>
                  </div>
                </li>
              ))}
            </ol>
          </aside>

          <section className="border border-[var(--border)] bg-white p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">Family corporation scenario</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[var(--navy-950)]">자산·소유구조 변화</h2>
              </div>
              <button type="button" className="hidden border border-[var(--border)] px-4 py-3 text-sm font-semibold md:inline-flex">
                <PanelRightOpen className="mr-2 h-4 w-4" /> 이벤트 수정
              </button>
            </div>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {["부모", "가족법인", "자녀"].map((owner, index) => (
                <article key={owner} className="border border-[var(--border)] bg-[var(--ivory)] p-5">
                  <p className="text-sm font-semibold">{owner}</p>
                  <strong className="mt-5 block text-4xl tracking-[-0.06em]">{index === 0 ? "60%" : index === 1 ? "20%" : "20%"}</strong>
                  <p className="mt-3 text-sm leading-6 text-[var(--muted)]">시나리오 후 지분 구조 예시</p>
                </article>
              ))}
            </div>
            <div className="mt-8 border border-[var(--border)] p-5">
              <p className="text-sm font-semibold">하단 가족별 이전 결과</p>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {["배우자", "자녀 1", "자녀 2"].map((person, index) => (
                  <div key={person} className="flex items-center justify-between border-b border-[var(--border)] py-3">
                    <span className="text-sm text-[var(--muted)]">{person}</span>
                    <strong>{index === 0 ? "18억" : "14.5억"}</strong>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <aside id="issues" className="grid gap-5">
            <article className="border border-[var(--border)] bg-[var(--navy-950)] p-6 text-white">
              <p className="text-sm text-white/55">세금·현금흐름 요약</p>
              <strong className="mt-4 block text-4xl tracking-[-0.06em]">부족 7억</strong>
              <p className="mt-3 text-sm leading-6 text-white/65">보험 납부재원과 단계적 이전을 조합해 부족액을 줄이는 방향입니다.</p>
            </article>
            <article className="border border-[var(--border)] bg-white p-6">
              <div className="flex items-center gap-3">
                <CircleAlert className="h-5 w-5 text-[var(--warning)]" />
                <h2 className="text-lg font-semibold">쟁점 요약</h2>
              </div>
              <ul className="mt-5 grid gap-3 text-sm leading-6 text-[var(--muted)]">
                <li>전문가 검토 필수 · 채무승계 증빙 전 부담부증여 계산 제한</li>
                <li>추가 확인 필요 · 가족법인 지분평가 기준 확인 필요</li>
                <li>미입력 항목 · 보험 계약 상세가 아직 입력되지 않음</li>
              </ul>
            </article>
            <article className="border border-[var(--border)] bg-white p-6">
              <div className="flex items-center gap-3">
                <FilePenLine className="h-5 w-5 text-[var(--gold)]" />
                <h2 className="text-lg font-semibold">우측 편집 패널</h2>
              </div>
              <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
                이벤트 수정은 별도 페이지 이동이 아니라 우측 sheet에서 열리는 방식으로 표현합니다.
              </p>
            </article>
          </aside>
        </section>

        <section id="sources" className="mt-6 border border-[var(--border)] bg-white p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">Rules & sources</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">규칙·출처 placeholder</h2>
          <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
            세법 원문, 예규, 심판례 연결 상태를 보여주는 전문가 전용 영역입니다. 현재 PR에서는 실제 MCP나 세법 엔진을 연결하지 않고 합성 상태만 표시합니다.
          </p>
        </section>
      </main>
    </ExpertShell>
  );
}
