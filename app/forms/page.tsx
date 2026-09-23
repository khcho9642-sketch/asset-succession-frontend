import type { Metadata } from "next";
import { PublicNav } from "@/components/PublicNav";
import { FormsLibrary } from "./FormsLibrary";
import manifest from "@/public/downloads/official-forms/manifest.json";
import groups from "@/public/downloads/official-forms/presentation-groups.json";
import { mergeGeneratedPreviews } from "@/lib/forms/preview-index";
import { expandDocumentParts, expandDocumentSections } from "@/lib/forms/document-parts";
import parts from "@/public/downloads/official-forms/document-parts.json";
import sections from "@/public/downloads/official-forms/document-sections.json";
import styles from "./FormsLibrary.module.css";
import shell from "./FormsHeader.module.css";

export const metadata: Metadata = {
  title: "상속·증여 서류 자료실 | 자산승계 360",
  description: "상속·증여·양도·가업승계에 필요한 공공·민간 제공처의 양식과 작성사례, 서류별 미리보기와 이용 방법을 확인하세요.",
};
export const dynamic = "force-static";
export default function FormsPage() {
  const documents = expandDocumentParts(expandDocumentSections(manifest.documents, sections), parts);
  return <div className={`${styles.page} ${shell.root}`}><PublicNav /><FormsLibrary documents={mergeGeneratedPreviews(documents)} groups={groups} /></div>;
}
