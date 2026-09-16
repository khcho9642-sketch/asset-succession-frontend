"use client";

import Image from "next/image";
import Link from "next/link";
import { Calculator, FileText, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { KAKAO_OPEN_CHAT_URL } from "@/lib/contactLinks";
import styles from "./PublicNav.module.css";

const diagnosisLinks = [
  { href: "/precheck?purpose=capital-gains", label: "양도" },
  { href: "/precheck?purpose=inheritance", label: "상속" },
  { href: "/precheck?purpose=gift", label: "증여" },
  { href: "/precheck?purpose=business", label: "가업승계" }
];

const formsLibraryHref = "/downloads/asset-succession-forms-v1/index.html";

function KakaoConsultationLink({ compact = false }: { compact?: boolean }) {
  return (
    <a href={KAKAO_OPEN_CHAT_URL} target="_blank" rel="noopener noreferrer"
      aria-label="카카오 상담 (새 창)" title="카카오 상담" className={styles.kakaoLink}>
      <Image src={compact ? "/images/kakao-consultation-icon.svg" : "/images/kakao-consultation.svg"}
        width={compact ? 40 : 160} height={compact ? 40 : 42} alt="" aria-hidden="true" unoptimized
        className={compact ? styles.kakaoIcon : styles.kakaoImage} />
    </a>
  );
}

export function PublicNav() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isMenuOpen) return;
    function closeOutside(event: PointerEvent) {
      if (!headerRef.current?.contains(event.target as Node)) setIsMenuOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [isMenuOpen]);

  return (
    <header ref={headerRef} className={styles.header} role="banner" data-public-header
      onKeyDown={(event) => {
        if (event.key === "Escape" && isMenuOpen) {
          setIsMenuOpen(false);
          menuButtonRef.current?.focus();
        }
      }}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setIsMenuOpen(false); }}>
      <div className={styles.headerInner} data-public-header-inner>
        <Link href="/" className={styles.brand} aria-label="자산승계 360 홈" data-public-brand>
          <span>자산승계 <em>360</em></span><small>오늘의 준비가 내일의 가족을 지킵니다.</small>
        </Link>
        <nav className={styles.desktopNav} aria-label="진단 유형">
          {diagnosisLinks.map((item) => <Link href={item.href} key={item.href}>{item.label}</Link>)}
        </nav>
        <div className={styles.desktopActions} data-public-desktop-actions>
          <KakaoConsultationLink />
          <Link href="/calculator" className={styles.formsLibrary}>
            <Calculator aria-hidden="true" size={18} /><span>간편계산기</span>
          </Link>
          <Link href={formsLibraryHref} className={styles.formsLibrary}>
            <FileText aria-hidden="true" size={18} /><span>서류양식</span>
          </Link>
          <Link href="/consultation" className={styles.desktopConsultation}>전문가 상담</Link>
        </div>
        <div className={styles.mobileNavActions}>
          <KakaoConsultationLink compact />
          <Link href={formsLibraryHref} aria-label="서류양식">
            <FileText aria-hidden="true" size={22} />
          </Link>
          <Link href="/calculator" aria-label="간편계산기">
            <Calculator aria-hidden="true" size={22} />
          </Link>
          <Link href="/consultation">상담</Link>
          <button ref={menuButtonRef} type="button" aria-controls="mobile-diagnosis-menu"
            aria-expanded={isMenuOpen} aria-label={isMenuOpen ? "메뉴 닫기" : "메뉴 열기"}
            onClick={() => setIsMenuOpen((open) => !open)}>
            {isMenuOpen ? <X aria-hidden="true" size={25} /> : <Menu aria-hidden="true" size={25} />}
          </button>
        </div>
      </div>
      <nav id="mobile-diagnosis-menu" hidden={!isMenuOpen} className={styles.mobileMenu} aria-label="모바일 진단 유형">
        {diagnosisLinks.map((item) => <Link href={item.href} key={item.href} onClick={() => setIsMenuOpen(false)}>{item.label}</Link>)}
        <a href={KAKAO_OPEN_CHAT_URL} target="_blank" rel="noopener noreferrer"
          aria-label="카카오 상담 (새 창)" onClick={() => setIsMenuOpen(false)}>카카오 상담</a>
        <Link href="/calculator" onClick={() => setIsMenuOpen(false)}>간편계산기</Link>
        <Link href={formsLibraryHref} onClick={() => setIsMenuOpen(false)}>서류양식</Link>
        <Link href="/consultation" onClick={() => setIsMenuOpen(false)}>전문가 상담</Link>
      </nav>
    </header>
  );
}
