import { Suspense } from "react";
import { PublicLightNav } from "@/components/PublicLightNav";
import { DiagnosisChat } from "@/components/DiagnosisChat";

export default function PrecheckPage() {
  return (
    <main className="min-h-screen bg-[#EFEAE0]">
      <PublicLightNav />
      <Suspense fallback={<div className="mx-auto max-w-6xl px-6 py-16 text-lg text-[#6B6152]">대화 공간을 준비하고 있어요.</div>}>
        <DiagnosisChat />
      </Suspense>
    </main>
  );
}
