import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "자산승계 360",
  description: "상속·증여·매각·가족법인·보험 활용까지 비교하는 자산승계 사전진단 화면"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        {children}
      </body>
    </html>
  );
}
