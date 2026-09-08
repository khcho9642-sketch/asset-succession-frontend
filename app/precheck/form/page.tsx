import { PublicLightNav } from "@/components/PublicLightNav";
import { PrecheckWizard } from "@/components/PrecheckWizard";

export default function PrecheckFormPage() {
  return (
    <main className="min-h-screen bg-[var(--background)]">
      <PublicLightNav />
      <PrecheckWizard />
    </main>
  );
}
