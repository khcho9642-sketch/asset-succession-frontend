"use client";

import { useEffect, useRef, useState } from "react";

const reports = [
  {
    title: "우리 가족 자산승계 진단서",
    eyebrow: "Report 01",
    description: "가족별 역할과 현재 자산 구조를 먼저 정리합니다.",
    family: ["장남 (사업 승계)", "장녀 (자산 분산)", "차남 (생활 안정)"],
    strategy: "분할 증여",
    metrics: [
      ["확인 자산", "50억"],
      ["가족 구성", "배우자·자녀 3명"],
      ["우선 목표", "세금·노후재원"]
    ]
  },
  {
    title: "맞춤 자산승계 전략 비교",
    eyebrow: "Report 02",
    description: "현 상태 기준안과 AI 추천 3개를 한 화면에서 비교합니다.",
    family: ["기준안", "단계적 증여", "배우자 배분"],
    strategy: "추천안 3개 선별",
    metrics: [
      ["세금 영향", "추가 확인"],
      ["현금흐름", "부족액 점검"],
      ["실행 난이도", "중간"]
    ]
  },
  {
    title: "자산승계 실행 로드맵",
    eyebrow: "Report 03",
    description: "증여·대출·상속 실행 순서와 주의사항을 가족회의용으로 정리합니다.",
    family: ["1차 확인", "전문가 검토", "실행 관리"],
    strategy: "단계별 실행",
    metrics: [
      ["1단계", "자료 정리"],
      ["2단계", "세무 검토"],
      ["3단계", "가족 합의"]
    ]
  }
] as const;

export function HeroPaperCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPointerPaused, setIsPointerPaused] = useState(false);
  const [isFocusPaused, setIsFocusPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const isPaused = isPointerPaused || isFocusPaused;

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (isPaused || prefersReducedMotion) return undefined;
    const timer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % reports.length);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [isPaused]);

  function goTo(index: number) {
    setActiveIndex((index + reports.length) % reports.length);
  }

  function handleTouchEnd(clientX: number) {
    if (touchStartX.current === null) return;
    const distance = clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(distance) < 36) return;
    goTo(activeIndex + (distance < 0 ? 1 : -1));
  }

  const activeReport = reports[activeIndex];

  return (
    <section
      aria-label="샘플 보고서 미리보기"
      className="paper-carousel motion-result-stage mx-auto w-full max-w-[25.5rem] lg:ml-auto"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsFocusPaused(false);
      }}
      onFocus={() => setIsFocusPaused(true)}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") goTo(activeIndex - 1);
        if (event.key === "ArrowRight") goTo(activeIndex + 1);
      }}
      onMouseEnter={() => setIsPointerPaused(true)}
      onMouseLeave={() => setIsPointerPaused(false)}
      onTouchEnd={(event) => {
        handleTouchEnd(event.changedTouches[0]?.clientX ?? 0);
        setIsPointerPaused(false);
      }}
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0]?.clientX ?? null;
        setIsPointerPaused(true);
      }}
      style={{ animationDelay: "110ms" }}
      tabIndex={0}
    >
      <div className="paper-stack" data-active-page={activeIndex + 1}>
        <article key={activeReport.title} className="paper-page-card" aria-live="polite">
          <div className="paper-page-curl" aria-hidden="true" />
          <div className="flex items-center justify-between gap-4 border-b border-[#D8CCB9] pb-4">
            <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#B23A2A]">{activeReport.eyebrow}</span>
            <span className="text-xs font-semibold text-[#7A6139]">자산승계 360</span>
          </div>

          <h2 className="mt-7 text-[1.85rem] font-semibold leading-tight tracking-[-0.055em] text-[#26221B]">{activeReport.title}</h2>
          <p className="mt-3 text-sm leading-6 text-[#6B6152]">{activeReport.description}</p>

          <div className="mt-7 border border-[#D8CCB9] bg-[#FFFDF8] p-4">
            <p className="text-xs font-bold tracking-[0.16em] text-[#7A6139]">가족 구조</p>
            <div className="mt-4 grid gap-2">
              {activeReport.family.map((person) => (
                <span key={person} className="flex items-center justify-between border-b border-[#E4D9C8] pb-2 text-sm text-[#26221B] last:border-b-0 last:pb-0">
                  <span>{person}</span>
                  <span className="h-2 w-2 rounded-full bg-[#B23A2A]" aria-hidden="true" />
                </span>
              ))}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-[0.82fr_1fr] gap-3">
            <div className="border border-[#D8CCB9] bg-[#F8F4EA] p-4">
              <p className="text-xs font-bold tracking-[0.14em] text-[#7A6139]">첫 번째 전략</p>
              <strong className="mt-2 block text-2xl tracking-[-0.05em] text-[#B23A2A]">{activeReport.strategy}</strong>
            </div>
            <dl className="grid gap-2">
              {activeReport.metrics.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 border border-[#E2D7C6] bg-[#FFFDF8] px-3 py-2">
                  <dt className="text-xs text-[#6B6152]">{label}</dt>
                  <dd className="text-sm font-semibold text-[#26221B]">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="mt-7 h-2 overflow-hidden bg-[#E7DDCD]" aria-hidden="true">
            <div className="h-full bg-[#B23A2A]" style={{ width: `${48 + activeIndex * 18}%` }} />
          </div>
        </article>
      </div>

      <div className="mt-5 flex items-center justify-center gap-2" aria-label="보고서 페이지 선택">
        {reports.map((report, index) => (
          <button
            key={report.title}
            type="button"
            aria-label={`${index + 1}번째 보고서 보기`}
            aria-pressed={activeIndex === index}
            className="min-h-11 min-w-11 text-lg leading-none text-[#7A6139] transition hover:text-[#B23A2A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B23A2A]"
            onClick={() => goTo(index)}
          >
            {activeIndex === index ? "●" : "○"}
          </button>
        ))}
      </div>
      <p className="sr-only">좌우 방향키 또는 모바일 스와이프로 보고서 3장을 확인할 수 있습니다.</p>
    </section>
  );
}
