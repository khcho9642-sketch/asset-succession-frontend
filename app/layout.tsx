import { createShareMetadata } from "@/lib/share-metadata";
import "./globals.css";

export const metadata = createShareMetadata();

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" data-scroll-behavior="smooth">
      <body>
        {children}
      </body>
    </html>
  );
}
