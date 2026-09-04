import Link from "next/link";

const navItems = [
  { href: "/", label: "랜딩" },
  { href: "/precheck", label: "사전계산" },
  { href: "/precheck/result", label: "결과비교" },
  { href: "/consultation", label: "상담신청" },
  { href: "/expert/overview", label: "전문가개요" },
  { href: "/expert/workspace", label: "작업공간" }
];

export function Nav() {
  return (
    <header className="site-header">
      <Link className="brand" href="/">
        Asset Succession
      </Link>
      <nav aria-label="주요 화면">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
