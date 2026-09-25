import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://frontend-prototype-roan.vercel.app");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "자산승계 360",
  description: "AI가 36개 자산승계 전략 후보를 비교해 우리 가족에게 필요한 핵심 대안을 선별하는 무료 사전진단 화면"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" data-scroll-behavior="smooth">
      <body>
        {children}
      </body>
    </html>
  );
}
