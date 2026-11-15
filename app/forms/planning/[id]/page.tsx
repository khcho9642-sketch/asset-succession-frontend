import { notFound, redirect } from "next/navigation";

export default async function PlanningPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^PLAN-0[1-6]$/.test(id)) notFound();
  redirect("/forms");
}
