"""Restore acquired institutional originals after the failed UI build; never re-fetch or relabel them."""
from pathlib import Path
import shutil, json, hashlib, re
ROOT=Path(__file__).resolve().parents[1]
backup=ROOT/'.tmp/recovered'
# The prior artifact preserves paths relative to repository root.
for relative in ['docs/forms-expansion-109','public/downloads/official-forms/additions','public/downloads/official-forms/expansion']:
    src=backup/relative
    if src.exists(): shutil.copytree(src, ROOT/relative, dirs_exist_ok=True)
proof=ROOT/'.tmp/forms-expansion-proof'; proof.mkdir(parents=True,exist_ok=True)
oldproof=backup/'.tmp/forms-expansion-proof'
if (oldproof/'downloaded-originals').exists():
    shutil.copytree(oldproof/'downloaded-originals',proof/'downloaded-originals',dirs_exist_ok=True)
shutil.copy2(backup/'tasks.md',ROOT/'tasks.md')
shutil.copy2(oldproof/'manifest.json',ROOT/'public/downloads/official-forms/manifest.json')
shutil.copytree(oldproof/'source/forms',ROOT/'app/forms',dirs_exist_ok=True)
p=ROOT/'app/forms/FormsLibrary.tsx'; s=p.read_text()
bad='{preview.sourceUrl ? {preview.sourceUrl ? <a href={preview.sourceUrl} target="_blank" rel="noopener noreferrer">출처 게시물 확인</a> : <p>확인된 출처가 아직 없습니다.</p>} : <p>확인된 출처가 아직 없습니다.</p>}'
good='{preview.sourceUrl ? <a href={preview.sourceUrl} target="_blank" rel="noopener noreferrer">출처 게시물 확인</a> : <p>확인된 출처가 아직 없습니다.</p>}'
s=s.replace(bad,good)
s=s.replace('item.delivery === "provider" ? "공식 제공처" : item.delivery === "provider" ? "공식 제공처" :','item.delivery === "provider" ? "공식 제공처" :')
p.write_text(s)
rows=json.loads((ROOT/'docs/forms-expansion-109/results.json').read_text())
legacy=json.loads((ROOT/'docs/forms-expansion-109/legacy-manifest.json').read_text())
manifest=json.loads((ROOT/'public/downloads/official-forms/manifest.json').read_text())
assert len(rows)==109
for old in legacy['documents']:
    current=next(x for x in manifest['documents'] if x['id']==old['id'])
    assert current==old,old['id']
files=[]
for row in rows:
    if row['status']!='확인 완료':continue
    if row['required_original']:assert row.get('files'),row['id']
    for f in row.get('files',[]):
        path=ROOT/f['path'] if f.get('path') else proof/f['artifact_path']
        assert path.is_file(),(row['id'],str(path))
        assert hashlib.sha256(path.read_bytes()).hexdigest()==f['sha256'],row['id']
        files.append({'id':row['id'],'path':str(path.relative_to(ROOT)),'sha256':f['sha256']})
check=(ROOT/'tasks.md').read_text()
report={'restored_from_run':35206693723,'verified_tasks':len(re.findall(r'^- \[x\] P',check,re.M)), 'unchecked_tasks':len(re.findall(r'^- \[ \] P',check,re.M)), 'restored_files':files,'legacy_records_unchanged':True,'prior_failure':'JSX conditional nested twice by non-idempotent text replacement','deployed':False}
(proof/'rescue.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
