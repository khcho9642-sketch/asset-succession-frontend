import type { LibraryDocument } from "./FormsLibrary";

export function AdditionalFormMetadata({ item }: { item: LibraryDocument }) {
  if (!item.task_id) return null;
  return <details data-form-metadata style={{ marginTop: 12, fontSize: 12, lineHeight: 1.8 }}>
    <summary>서식 정보·이용방법</summary>
    <dl>
      <dt>서식번호</dt><dd>{item.form_no || "확인 중"}</dd>
      <dt>최종 개정일</dt><dd>{item.revised_at || "확인 중"}</dd>
      <dt>기한</dt><dd>{item.deadline || "기한 확인 필요"}{item.deadline_basis ? ` · ${item.deadline_basis}부터` : ""}</dd>
      <dt>제공 방식</dt><dd>{item.source_type || "확인 중"}</dd>
      <dt>이용 조건</dt><dd>{item.license}</dd>
      <dt>확인일</dt><dd>{item.checked_at ? item.checked_at.slice(0, 10) : "미확인"}</dd>
    </dl>
    <p>기관 원문의 대상·준비자료·제출처를 먼저 확인하세요. 원본 양식의 조항이나 작성 예시를 재작성하지 않았습니다.</p>
  </details>;
}
