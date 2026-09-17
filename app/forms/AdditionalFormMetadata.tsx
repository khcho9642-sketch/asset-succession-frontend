type AdditionalMetadata = {
  task_id?: string;
  form_no?: string | null;
  revised_at?: string | null;
  deadline?: string | null;
  deadline_basis?: string | null;
  license?: string;
  source_type?: string | null;
  checked_at?: string;
  status?: string;
  downloaded_originals?: Array<{ url: string; local_url?: string; path?: string; format?: string; bytes?: number }>;
};

/** Metadata belongs to the website; institutional original files remain unchanged. */
export function AdditionalFormMetadata({ item }: { item: AdditionalMetadata }) {
  if (!item.task_id) return null;
  const rows = [
    ["서식번호", item.form_no || "확인 중"],
    ["최종개정일", item.revised_at || "원문 확인 필요"],
    ["신청·신고 기한", item.deadline ? `${item.deadline} · ${item.deadline_basis || "기산점 확인 필요"}` : "해당 절차의 공식 안내에서 확인"],
    ["출처 유형", item.source_type || "확인 중"],
    ["이용 조건", item.license || "확인 중"],
    ["자료 확인일", item.checked_at?.slice(0, 10) || "확인 중"],
  ];
  return <details data-additional-form-metadata style={{ marginTop: 12, fontSize: 12, lineHeight: 1.7 }}>
    <summary style={{ cursor: "pointer", minHeight: 32 }}>서식 정보·이용방법</summary>
    <dl style={{ margin: "8px 0", display: "grid", gridTemplateColumns: "minmax(72px, 1fr) minmax(0, 3fr)", gap: "6px 10px", overflowWrap: "anywhere" }}>
      {rows.map(([label, value]) => <div key={label} style={{ display: "contents" }}><dt>{label}</dt><dd style={{ margin: 0 }}>{value}</dd></div>)}
    </dl>
    <p>원본의 작성방법을 먼저 읽고, 제출 대상·기한·첨부자료를 공식 제공처에서 확인하세요. 확인하지 못한 값을 임의로 기입하지 마세요.</p>
    {(item.downloaded_originals?.length || 0) > 1 && <div aria-label="이 항목의 개별 원본 파일">
      {item.downloaded_originals?.map((file, index) => {
        const local = file.local_url || (file.path?.startsWith("public/") ? "/" + file.path.slice(7).split("/").map(encodeURIComponent).join("/") : undefined);
        return <a key={`${file.url}-${index}`} href={local || file.url} download={local ? true : undefined}
          target={local ? undefined : "_blank"} rel="noopener noreferrer"
          style={{ display: "block", minHeight: 44, paddingBlock: 8 }}>원본 파일 {index + 1} · {file.format?.toUpperCase() || "기관 파일"}</a>;
      })}
    </div>}
  </details>;
}
