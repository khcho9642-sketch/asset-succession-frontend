import type { Metadata } from "next";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { PublicNav } from "@/components/PublicNav";
import { FormsLibrary, type LibraryDocument } from "./FormsLibrary";
import styles from "./FormsLibrary.module.css";

export const metadata: Metadata = {
  title: "서류 양식과 작성 예시 | 자산승계 360",
  description: "재산배분·상속, 증여, 차용·상환, 양도, 가업승계의 작성 양식과 가상 작성 예시를 살펴보세요.",
};
export const dynamic = "force-static";

const BASE = "/downloads/asset-succession-forms-v1/";
const presentation = [
  ["AS360-F06", "가족별 재산배분·정산표", "재산분배·상속", "누가 무엇을 얼마나 받을지, 재산별 배분안과 정산 계획을 한눈에.", "재산별 배분 · 합계 확인 · 정산"],
  ["AS360-F01", "상속재산분할협의서", "재산분배·상속", "누가 어떤 재산을 받는지, 합의한 분할 내용과 취득 범위를 작성해요.", "분할 합의 · 재산별 배분 · 서명"],
  ["AS360-F05", "금전소비대차계약서", "차용·상환", "가족 간 돈을 빌려줄 때 원금, 이자와 상환 약정을 정리해요.", "차용증 · 원금 · 이자 · 상환"],
  ["AS360-F02", "현금 증여계약서", "증여", "증여할 금액과 지급일, 당사자가 합의한 내용을 정리해요.", "증여 금액 · 지급 방법 · 합의"],
  ["AS360-F03", "부동산 증여계약서", "증여", "증여할 부동산과 지분, 이전에 필요한 합의 내용을 작성해요.", "부동산 표시 · 지분 · 권리부담"],
  ["AS360-F04", "주식 증여계약서", "증여", "발행회사와 주식 수, 이전 방법과 당사자의 합의를 기록해요.", "회사 · 주식 수 · 이전 방법"],
  ["AS360-F07", "과거 증여 사실정리표", "증여", "누가, 언제, 누구에게 얼마를 증여했는지 증빙과 함께 모아보세요.", "증여자 · 수증자 · 금액 · 시점"],
  ["AS360-F08", "원리금 상환·이체 확인표", "차용·상환", "상환 약정과 실제 지급 내역을 나란히 확인하고 기록해요.", "상환 계획 · 실제 이체 · 증빙"],
  ["AS360-F09", "취득·양도 비용자료 정리표", "양도", "취득·양도 금액과 지출 비용, 확인할 증빙을 함께 정리해요.", "취득가 · 양도가 · 비용 증빙"],
  ["AS360-F10", "가업승계 지분배분 준비표", "가업승계", "승계 전후 주식 수와 지분율, 준비해야 할 자료를 정리해요.", "주주 · 이전 주식 수 · 준비자료"],
] as const;

type Manifest = { documents: Array<{ id: string; editable_file: string; example_file: string; format: string; version: string }> };
function fileUrl(relative: string) {
  return BASE + relative.split("/").map(encodeURIComponent).join("/");
}

export default function FormsPage() {
  const directory = path.join(process.cwd(), "public", BASE);
  const manifest = JSON.parse(readFileSync(path.join(directory, "04_사이트등록/forms_manifest.json"), "utf8")) as Manifest;
  const documents: LibraryDocument[] = presentation.map(([id, title, category, description, tags]) => {
    const record = manifest.documents.find(item => item.id === id);
    if (!record) throw new Error(`Registered form not found: ${id}`);
    const bytes = statSync(path.join(directory, record.editable_file)).size;
    return {
      id, title, category, description, tags,
      format: record.format === "xlsx" ? "Excel" : "Word",
      editable: fileUrl(record.editable_file), example: fileUrl(record.example_file),
      thumbnail: fileUrl(`previews/${id.toLowerCase()}.webp`),
      sizeLabel: `${Math.ceil(bytes / 1024)} KB`, version: record.version,
    };
  });
  const bundleBytes = statSync(path.join(directory, "asset_succession_forms_v1.zip")).size;
  return <div className={styles.page}>
    <PublicNav />
    <FormsLibrary documents={documents}
      bundleUrl={fileUrl("asset_succession_forms_v1.zip")}
      bundleSize={`${(bundleBytes / 1024 / 1024).toFixed(1)} MB`}
      guideUrl={fileUrl("03_이용안내/00_먼저읽기_이용안내.pdf")}
      allExamplesUrl={fileUrl("00_작성예시_모아보기.pdf")} />
  </div>;
}
