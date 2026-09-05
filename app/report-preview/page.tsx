import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PublicLightNav } from "@/components/PublicLightNav";
import { ReportV2Preview } from "@/components/ReportV2Preview";

export default function ReportPreviewPage() {
  return (
    <main className="min-h-screen bg-[var(--background)]">
      <div className="print:hidden">
        <PublicLightNav />
      </div>
      <section className="mx-auto max-w-5xl px-6 py-12 lg:px-8 print:max-w-none print:p-0">
        <Link href="/precheck/result" className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--navy-900)] print:hidden">
          <ArrowLeft className="h-4 w-4" /> 결과 비교로 돌아가기
        </Link>
        <ReportV2Preview />
      </section>
    </main>
  );
}
