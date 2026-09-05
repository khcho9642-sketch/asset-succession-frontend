import Link from "next/link";
import { publicNav } from "@/lib/mockData";

export function PublicNav() {
  return (
    <header className="absolute inset-x-0 top-0 z-20">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-8">
        <Link href="/" className="text-lg font-semibold tracking-[-0.02em] text-white">
          자산승계 360
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-medium text-white/72 md:flex">
          {publicNav.map((item) => (
            <Link key={item.href} href={item.href} className="transition hover:text-white">
              {item.label}
            </Link>
          ))}
        </nav>
        <Link href="/precheck" className="border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/45">
          무료 진단
        </Link>
      </div>
    </header>
  );
}
