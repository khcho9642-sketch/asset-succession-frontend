import Link from "next/link";
import styles from "./PublicNav.module.css";

const publicLinks = [
  { href: "/calculator", label: "간편계산기" },
  { href: "/forms", label: "자료실" },
  { href: "/consultation", label: "전문가 상담" }
];

export function PublicNav() {
  return (
    <header className={styles.header} role="banner" data-public-header>
      <div className={styles.headerInner} data-public-header-inner>
        <Link href="/" className={styles.brand} aria-label="자산승계 360 홈" data-public-brand>
          <span>자산승계 <em>360</em></span><small>오늘의 준비가 내일의 가족을 지킵니다.</small>
        </Link>
        <nav className={styles.primaryNav} aria-label="주요 메뉴">
          {publicLinks.map((item) => <Link href={item.href} key={item.href}>{item.label}</Link>)}
        </nav>
      </div>
    </header>
  );
}
