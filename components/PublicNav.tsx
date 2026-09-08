"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import styles from "./HomePage.module.css";

const diagnosisLinks = [
  { href: "/precheck?purpose=capital-gains", label: "양도" },
  { href: "/precheck?purpose=inheritance", label: "상속" },
  { href: "/precheck?purpose=gift", label: "증여" },
  { href: "/precheck?purpose=business", label: "가업승계" }
];

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
    <header ref={headerRef} className={styles.header}
      onKeyDown={(event) => {
        if (event.key === "Escape" && isMenuOpen) {
          setIsMenuOpen(false);
          menuButtonRef.current?.focus();
        }
      }}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setIsMenuOpen(false); }}>
      <div className={styles.headerInner}>
        <Link href="/" className={styles.brand} aria-label="자산승계 360 홈">
          <span>자산승계 <em>360</em></span><small>오늘의 준비가 내일의 가족을 지킵니다.</small>
        </Link>
        <nav className={styles.desktopNav} aria-label="진단 유형">
          {diagnosisLinks.map((item) => <Link href={item.href} key={item.href}>{item.label}</Link>)}
        </nav>
        <Link href="/consultation" className={styles.desktopConsultation}>전문가 상담</Link>
        <div className={styles.mobileNavActions}>
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
        <Link href="/consultation" onClick={() => setIsMenuOpen(false)}>전문가 상담</Link>
      </nav>
    </header>
  );
}
