import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicNav } from "@/components/PublicNav";
import content from "@/lib/forms/planning-content.json";
import { PlanningWorkspace } from "../PlanningWorkspace";

export function generateStaticParams() {
  return content.resources.map(resource => ({ id: resource.id }));
}
export const dynamicParams = false;
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const resource = content.resources.find(item => item.id === id);
  return { title: `${resource?.title ?? "생전 준비자료"} | 자산승계 360` };
}
export default async function PlanningPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resource = content.resources.find(item => item.id === id);
  if (!resource) notFound();
  return <><PublicNav /><PlanningWorkspace key={resource.id} resource={resource} resources={content.resources} /></>;
}
