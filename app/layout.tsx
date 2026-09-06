import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
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
