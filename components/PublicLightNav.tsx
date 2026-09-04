import Link from "next/link";
import { publicNav } from "@/lib/mockData";

export function PublicLightNav() {
  return (
    <header className="border-b border-[var(--border)] bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8">
        <Link href="/" className="text-lg font-semibold tracking-[-0.02em] text-[var(--navy-950)]">
          자산승계 360
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-medium text-[var(--muted)] md:flex">
          {publicNav.map((item) => (
            <Link key={item.href} href={item.href} className="transition hover:text-[var(--text)]">
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
