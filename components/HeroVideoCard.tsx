"use client";

import { useState } from "react";

const heroVideo = "/media/asset-succession-ai-hero.mp4";
const heroPoster = "/media/asset-succession-ai-hero-poster.jpg";

export function HeroVideoCard() {
  const [videoFailed, setVideoFailed] = useState(false);

  return (
    <figure className="motion-result-stage mx-auto w-full max-w-[21rem] xl:max-w-[22rem]" style={{ animationDelay: "110ms" }}>
      <div className="border border-white/14 bg-white/[0.035] p-3 shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
        <div className="mb-3 flex items-center justify-between gap-3 px-1 text-xs font-semibold tracking-[0.12em] text-white/58">
          <span>AI PREVIEW</span>
          <span className="text-[var(--gold)]">36 → 3</span>
        </div>
        <div className="relative aspect-[9/16] overflow-hidden border border-white/10 bg-[var(--navy-950)]">
          <video
            aria-label="AI가 가족관계와 자산 정보를 분석하는 추상 모션 영상"
            autoPlay
            className={`hero-video-motion h-full w-full object-contain ${videoFailed ? "is-failed" : ""}`}
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
            className={`hero-video-poster h-full w-full object-contain ${videoFailed ? "is-active" : ""}`}
            src={heroPoster}
          />
        </div>
        <figcaption className="mt-3 border-t border-white/10 px-1 pt-3 text-xs leading-5 text-white/52">
          Preview 검토용 생성 영상입니다. Production 적용 전 정식 무워터마크 영상으로 교체해야 합니다.
        </figcaption>
      </div>
    </figure>
  );
}
