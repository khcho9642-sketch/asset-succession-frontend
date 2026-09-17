import type { Metadata } from "next";
import { PublicNav } from "@/components/PublicNav";
import { FormsLibrary } from "./FormsLibrary";
import manifest from "@/public/downloads/official-forms/manifest.json";
import styles from "./FormsLibrary.module.css";
import shell from "./FormsHeader.module.css";

export const metadata: Metadata = {
  title: "기관 서류 양식과 작성 예시 | 자산승계 360",
  description: "기관이 제공하는 상속·증여·차용·양도 관련 원본 양식, 작성 예시와 공식 제공처를 확인하세요.",
};
export const dynamic = "force-static";

export default function FormsPage() {
  return <div className={`${styles.page} ${shell.root}`}>
    <PublicNav />
    <FormsLibrary documents={manifest.documents} />
  </div>;
}
