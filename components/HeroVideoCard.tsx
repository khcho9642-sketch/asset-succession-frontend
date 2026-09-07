"use client";

import { useState } from "react";

const heroVideo = "/media/asset-succession-ai-hero.mp4";
const heroPoster = "/media/asset-succession-ai-hero-poster.jpg";

export function HeroVideoCard() {
  const [videoFailed, setVideoFailed] = useState(false);

  return (
    <figure className="motion-result-stage mx-auto w-full max-w-[21rem] xl:max-w-[22rem]" style={{ animationDelay: "110ms" }}>
      <div className="border border-white/14 bg-white/[0.035] p-3 shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
        <div className="mb-3 flex items-center justify-between gap-3 px-1 text-xs font-semibold tracking-[0.08em] text-white/62">
          <span>시나리오 선별 데모</span>
          <span className="text-[var(--gold)]">36개 후보 → 3개 추천</span>
        </div>
        <div className="relative aspect-[9/16] overflow-hidden border border-white/10 bg-[var(--navy-950)]">
          <video
            aria-label="AI가 가족관계와 자산 정보를 분석하는 추상 모션 영상"
            autoPlay
            className={`hero-video-motion ${videoFailed ? "is-failed" : ""}`}
            loop
            muted
            onError={() => setVideoFailed(true)}
            playsInline
            poster={heroPoster}
            preload="metadata"
          >
            <source src={heroVideo} type="video/mp4" />
          </video>
          <img
            alt="AI 자산승계 분석을 표현한 프리미엄 다크 네이비·골드 비주얼"
            className={`hero-video-poster ${videoFailed ? "is-active" : ""}`}
            src={heroPoster}
          />
        </div>
        <figcaption className="mt-3 border-t border-white/10 px-1 pt-3 text-xs leading-5 text-white/52">
          합성 이미지 기반 데모 화면입니다. 개인정보 없이 자산승계 분석 흐름을 먼저 확인할 수 있습니다.
        </figcaption>
      </div>
    </figure>
  );
}
