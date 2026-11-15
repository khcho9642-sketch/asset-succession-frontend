"""Add only the requested catalog metadata and categories to the existing UI."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
p=ROOT/'app/forms/FormsLibrary.tsx'
s=p.read_text()
if 'import { AdditionalFormMetadata }' not in s:
    s=s.replace('import styles from "./FormsLibrary.module.css";', 'import styles from "./FormsLibrary.module.css";\nimport { AdditionalFormMetadata } from "./AdditionalFormMetadata";')
if 'form_no?:' not in s:
    s=s.replace('  primaryArtifactType?: string;', '  primaryArtifactType?: string;\n  form_no?: string | null; revised_at?: string | null; deadline?: string | null; deadline_basis?: string | null;\n  source_type?: string | null; checked_at?: string | null; status?: string; task_id?: string;')
s=s.replace('"공제·납부", "등기"];', '"공제·납부", "등기", "재산조회", "유언", "후견", "불복·정정"];')
s=s.replace('pending: "파일 미확보"', 'provider: "공식 제공처", pending: "확인 중"')
s=s.replace('const actionLabel = (item: LibraryDocument) => ', 'const actionLabel = (item: LibraryDocument) => item.delivery === "provider" ? "공식 제공처" : ')
# Keep the existing ZIP bytes and its ORIGINAL membership. New originals are separate.
s=s.replace('const hostedFileCount = documents.filter(item => item.delivery === "hosted")', 'const hostedFileCount = documents.filter(item => item.delivery === "hosted" && !item.task_id)')
s=s.replace('<span>사이트에서 {counts.hosted}개 개별·전체 다운로드</span>', '<span>개별 다운로드 {counts.hosted} · 공식 제공처 {counts.provider} · 확인 중 {counts.pending}</span>')
s=s.replace('<strong>{counts.hosted}</strong>개 자료', '<strong>74</strong>개 기존 자료')
s=s.replace('{counts.hosted}개 자료 한번에 받기', '기존 74개 자료 한번에 받기')
s=s.replace('전체 {counts.hosted}개 자료 포함 · 웹 사례 1개는 원본 이미지와 사이트 변환 PDF로 제공합니다.', '기존 74개 묶음입니다. 새로 확보한 원본은 각 카드에서 별도로 받습니다. 웹 사례 1개는 사이트 변환 PDF를 포함합니다.')
if '<AdditionalFormMetadata item={item}' not in s:
    s=s.replace('<h3>{item.title}</h3><p>{item.description}</p><small>{item.tags}</small>', '<h3>{item.title}</h3><p>{item.description}</p><small>{item.tags}</small>\n            <AdditionalFormMetadata item={item} />')
s=s.replace('href={item.example ?? item.sourceUrl}', 'href={item.example || item.sourceUrl || "#forms-usage"}')
s=s.replace('href={item.editable || item.sourceUrl}', 'href={item.editable || item.sourceUrl || "#forms-usage"}')
s=s.replace('href={item.sourceUrl}', 'href={item.sourceUrl || "#forms-usage"}')
s=s.replace('<a href={preview.sourceUrl} target="_blank" rel="noopener noreferrer">출처 게시물 확인</a>', '{preview.sourceUrl ? <a href={preview.sourceUrl} target="_blank" rel="noopener noreferrer">출처 게시물 확인</a> : <p>확인된 출처가 아직 없습니다.</p>}')
s=s.replace('{" · "}<a href={preview.licenseUrl} target="_blank" rel="noopener noreferrer">이용 조건 확인</a>', '{preview.licenseUrl ? <a href={preview.licenseUrl} target="_blank" rel="noopener noreferrer">이용 조건 확인</a> : null}')
s=s.replace('href={item.editable} download={item.delivery === "hosted"}', 'href={item.editable} target={item.delivery === "provider" ? "_blank" : undefined} download={item.delivery === "hosted"}')
p.write_text(s)
component='''import type { LibraryDocument } from "./FormsLibrary";

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
'''
(ROOT/'app/forms/AdditionalFormMetadata.tsx').write_text(component)
print('Existing UI extended: categories, per-item metadata, safe pending state; legacy records/files untouched.')
