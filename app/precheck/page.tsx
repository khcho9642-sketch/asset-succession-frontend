import { PublicLightNav } from "@/components/PublicLightNav";
import { PrecheckWizard } from "@/components/PrecheckWizard";

export default function PrecheckPage() {
  return (
    <main className="min-h-screen bg-[var(--background)]">
      <PublicLightNav />
      <PrecheckWizard />
    </main>
  );
}
