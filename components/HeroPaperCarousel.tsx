"use client";

import Image from "next/image";
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { HeroReportContent, heroReports } from "./HeroReportContent";
import styles from "./HomePage.module.css";

const AUTO_ADVANCE_MS = 4000;
type PageState = { index: number; outgoing: number | null; direction: "forward" | "back"; sequence: number };

function turnPage(current: PageState, target: number, reducedMotion: boolean): PageState {
  const index = (target + heroReports.length) % heroReports.length;
  if (index === current.index) return current;
  return {
    index,
    outgoing: reducedMotion ? null : current.index,
    direction: (index - current.index + heroReports.length) % heroReports.length === 1 ? "forward" : "back",
    sequence: current.sequence + 1
  };
}

function ReportSheet({ index }: { index: number }) {
  const report = heroReports[index];
  return <>
    <Image src={report.image} alt="" aria-hidden="true" className={styles.reportImage}
      width={1474} height={1067} sizes="(min-width: 1024px) 48vw, 1px" unoptimized
      loading={index === 0 ? "eager" : "lazy"} />
    <HeroReportContent index={index} />
    <span className={styles.paperCurl} aria-hidden="true" />
  </>;
}

export function HeroPaperCarousel() {
  const [pageState, setPageState] = useState<PageState>({ index: 0, outgoing: null, direction: "forward", sequence: 0 });
  const activeIndex = pageState.index;
  const [pointerPaused, setPointerPaused] = useState(false);
  const [focusPaused, setFocusPaused] = useState(false);
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [pageHidden, setPageHidden] = useState(false);
  const [manualChange, setManualChange] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const paused = pointerPaused || focusPaused || manuallyPaused || reducedMotion || pageHidden;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setReducedMotion(media.matches);
    const syncVisibility = () => setPageHidden(document.hidden);
    syncMotion();
    syncVisibility();
    media.addEventListener("change", syncMotion);
    document.addEventListener("visibilitychange", syncVisibility);
    return () => {
      media.removeEventListener("change", syncMotion);
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, []);

  useEffect(() => {
    if (paused) return;
    // Starts are four seconds apart; completing the leaf animation does not reset this timer.
    const timer = window.setTimeout(() => {
      setManualChange(false);
      setPageState((current) => turnPage(current, current.index + 1, reducedMotion));
    }, AUTO_ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [paused, activeIndex, reducedMotion]);

  useEffect(() => {
    if (pageState.outgoing === null) return;
    const sequence = pageState.sequence;
    // Also settle if animationend is cancelled by print, a preference change or tab suspension.
    const timer = window.setTimeout(() => {
      setPageState((current) => current.sequence === sequence ? { ...current, outgoing: null } : current);
    }, 850);
    return () => window.clearTimeout(timer);
  }, [pageState.outgoing, pageState.sequence]);

  function goTo(index: number) {
    setManualChange(true);
    setPageState((current) => turnPage(current, index, reducedMotion));
  }

  return (
    <section className={styles.carousel} aria-label="샘플 보고서 미리보기" aria-roledescription="캐러셀"
      data-testid="hero-carousel" data-active-page={activeIndex + 1} data-paused={paused}
      tabIndex={0}
      onFocus={() => setFocusPaused(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocusPaused(false); }}
      onMouseEnter={() => setPointerPaused(true)} onMouseLeave={() => setPointerPaused(false)}
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        if (event.key === "Home") goTo(0);
        else if (event.key === "End") goTo(heroReports.length - 1);
        else goTo(activeIndex + (event.key === "ArrowRight" ? 1 : -1));
      }}
      onTouchStart={(event) => {
        const touch = event.touches[0];
        touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
        setPointerPaused(true);
      }}
      onTouchEnd={(event) => {
        const touch = event.changedTouches[0];
        const start = touchStart.current;
        if (touch && start) {
          const dx = touch.clientX - start.x;
          const dy = touch.clientY - start.y;
          if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.2) goTo(activeIndex + (dx < 0 ? 1 : -1));
        }
        touchStart.current = null;
        setPointerPaused(false);
      }}
      onTouchCancel={() => { touchStart.current = null; setPointerPaused(false); }}>
      <div className={styles.paperStack} data-turning={pageState.outgoing !== null && !reducedMotion}>
        {heroReports.map((report, index) => {
          const position = (index - activeIndex + heroReports.length) % heroReports.length;
          return (
            <article key={report.image} className={styles.paper} data-position={position}
              data-testid="hero-report" aria-label={report.title} aria-roledescription="슬라이드"
              aria-hidden={position !== 0} inert={position !== 0}>
              <ReportSheet index={index} />
            </article>
          );
        })}
        {pageState.outgoing !== null && !reducedMotion ? (
          <div key={pageState.sequence} className={`${styles.paper} ${styles.turningPaper}`}
            data-position="0" data-direction={pageState.direction} data-testid="turning-paper" aria-hidden="true" inert
            onAnimationEnd={(event) => {
              if (event.target !== event.currentTarget || event.pseudoElement) return;
              const sequence = pageState.sequence;
              setPageState((current) => current.sequence === sequence ? { ...current, outgoing: null } : current);
            }}>
            <ReportSheet index={pageState.outgoing} />
          </div>
        ) : null}
      </div>
      <div className={styles.carouselControls}>
        <div className={styles.dots} aria-label="보고서 페이지 선택">
          {heroReports.map((report, index) => <button key={report.image} type="button"
            aria-label={String(index + 1) + "번째 보고서 보기"} aria-pressed={activeIndex === index}
            onClick={() => goTo(index)}><span aria-hidden="true">{activeIndex === index ? "●" : "○"}</span></button>)}
        </div>
        {!reducedMotion ? <button type="button" className={styles.playback}
          aria-label={manuallyPaused ? "보고서 자동 넘김 재생" : "보고서 자동 넘김 정지"}
          aria-pressed={manuallyPaused} onClick={() => setManuallyPaused((value) => !value)}>
          {manuallyPaused ? <Play aria-hidden="true" size={14} /> : <Pause aria-hidden="true" size={14} />}
        </button> : null}
      </div>
      <p className={styles.sampleNote}>샘플 보고서 · 실제 진단 결과는 가족의 상황에 따라 달라집니다.</p>
      <p className="sr-only" aria-live={manualChange ? "polite" : "off"} aria-atomic="true">{heroReports[activeIndex].title}</p>
      <p className="sr-only">좌우 방향키, 페이지 선택 버튼 또는 스와이프로 보고서 3장을 확인할 수 있습니다.</p>
    </section>
  );
}
