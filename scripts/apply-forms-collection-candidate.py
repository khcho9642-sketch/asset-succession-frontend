"""Apply one reviewed collection result without changing unrelated records.

Usage: python scripts/apply-forms-collection-candidate.py <candidate.json>
The operator reviews official-source evidence before running this command.
"""
from pathlib import Path
import copy
import datetime
import hashlib
import json
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / 'docs/forms-expansion-109'
MANIFEST = ROOT / 'public/downloads/official-forms/manifest.json'

def read(path):
    return json.loads(path.read_text())

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

candidate_path = Path(sys.argv[1]).resolve()
candidate = read(candidate_path)
ident = candidate['id']
private_provider = candidate.get('source_type') == '민간제공처'
results = read(DOC / 'results.json')
before_results = copy.deepcopy(results)
record = next(row for row in results if row['id'] == ident)
assert record['status'] != '확인 완료', f'{ident}: already complete'
assert candidate['status'] == '확인 완료'
assert candidate['source_url'].startswith('https://')
assert candidate.get('source_evidence')
assert not record['required_original'] or candidate.get('files'), 'Actual original required'
manifest = read(MANIFEST)
before_manifest = copy.deepcopy(manifest)
evidence_dir = DOC / 'evidence/round16'
evidence_dir.mkdir(parents=True, exist_ok=True)
files = []
verified_provider_files = []
for item in candidate.get('files', []):
    source = Path(item['artifact_path'])
    if not source.is_absolute():
        source = candidate_path.parent / source
    data = source.read_bytes()
    assert len(data) == item['bytes']
    assert hashlib.sha256(data).hexdigest() == item['sha256']
    assert item.get('title_verified') is True
    assert data.startswith((b'%PDF-', b'PK', bytes.fromhex('d0cf11e0')))
    extension = item['format'].lower()
    assert extension in {'pdf', 'hwp', 'hwpx', 'doc', 'docx', 'odt'}
    if item.get('redistribution_allowed') is False or item.get('delivery') == 'provider_page':
        verified_provider_files.append({key: value for key, value in item.items() if key not in {'artifact_path', 'text_path'}})
        continue
    # Store actual official files only; no conversion or synthetic form.
    target = ROOT / 'public/downloads/official-forms/expansion' / f'{ident}_{item["sha256"][:12]}.{extension}'
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    metadata = {key: value for key, value in item.items() if key not in {'artifact_path', 'text_path'}}
    metadata['path'] = str(target.relative_to(ROOT))
    metadata['local_url'] = '/' + str(target.relative_to(ROOT / 'public'))
    files.append(metadata)

evidence = copy.deepcopy(candidate)
evidence['files'] = files
evidence['verified_provider_files'] = verified_provider_files
evidence['candidate_reviewed_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
evidence['task_operation'] = record['operation']
evidence['target_id'] = record.get('target_id')
evidence_ref = f'docs/forms-expansion-109/evidence/round16/{ident}.json'
write(ROOT / evidence_ref, evidence)
for key in ('status', 'source_url', 'institution', 'checked_at', 'source_type', 'license', 'note', 'form_no', 'revised_at', 'deadline', 'deadline_basis'):
    if key in candidate:
        record[key] = candidate[key]
if private_provider:
    record.update(provider_origin='private_institution', provider_authority='private_terms')
record['files'] = files
record['source_evidence'] = {**candidate['source_evidence'], 'evidence_file': evidence_ref}
record.pop('failure_reason', None)
if record['operation'] == 'source_url_update':
    target = next(item for item in manifest['documents'] if item['id'] == record['target_id'])
    # The approved legacy operation changes only this URL.
    target['sourceUrl'] = candidate['source_url']
elif record['operation'] == 'alias':
    record['alias_verified'] = True
    assert next(row for row in results if row['id'] == record['target_id'])['status'] == '확인 완료'
else:
    target = next(item for item in manifest['documents'] if item['id'] == ident)
    public_files = [{
        'name': item['name'], 'path': item['local_url'], 'format': item['format'].upper(),
        'role': item.get('role', 'original'), 'bytes': item['bytes'], 'delivery': 'hosted',
        'sha256': item['sha256'], 'sourceUrl': item['url'],
        'sourcePage': candidate['source_url'], 'checkedOn': candidate['checked_at'][:10],
    } for item in files]
    hosted = bool(public_files)
    target.update(
        description=candidate['note'],
        format=' · '.join(dict.fromkeys(item['format'] for item in public_files)) if hosted else '민간 참고서식' if private_provider else '공식 안내',
        editable=public_files[0]['path'] if hosted else candidate['source_url'],
        sizeLabel=f'{(sum(item["bytes"] for item in public_files) + 1023) // 1024} KB' if hosted else '민간 제공처' if private_provider else '공식 제공처',
        sourceUrl=candidate['source_url'], institution=candidate['institution'],
        checkedOn=candidate['checked_at'][:10], license=candidate['license'],
        licenseUrl=candidate.get('license_url') or candidate['source_url'],
        verification=('민간 제공기관의 원문과 요청 자료를 대조했습니다. 법정서식이 아닙니다.' if private_provider else '공식 원문과 요청 자료를 대조했습니다.') + (' 실제 원본의 형식·본문·해시를 확인했습니다.' if hosted else ' 파일은 제공처에서 확인하세요.'),
        delivery='hosted' if hosted else 'provider', files=public_files,
        source_type=candidate['source_type'], checked_at=candidate['checked_at'], status='확인 완료',
        source_evidence=copy.deepcopy(record['source_evidence']),
    )
    if private_provider:
        target.update(provider_origin='private_institution', provider_authority='private_terms')
    for key in ('form_no', 'revised_at', 'deadline', 'deadline_basis'):
        if key in candidate:
            target[key] = candidate[key]
    if candidate.get('catalog_title'):
        target['title'] = candidate['catalog_title']

done = [row['id'] for row in results if row['status'] == '확인 완료']
summary = read(DOC / 'summary.json')
summary.update(completed=len(done), unchecked=len(results)-len(done), completed_ids=done,
               pending_ids=[row['id'] for row in results if row['status'] != '확인 완료'],
               original_acquired_ids=[row['id'] for row in results if row.get('files')],
               failed_original_ids=[row['id'] for row in results if row['required_original'] and row['status'] != '확인 완료'])
text = (ROOT / 'tasks.md').read_text()
assert len(re.findall(r'^- \[ \] ' + re.escape(ident) + ' ', text, re.M)) == 1
text = re.sub(r'^- \[ \] ' + re.escape(ident) + ' ', f'- [x] {ident} ', text, flags=re.M)
text = re.sub(r'확인 완료 \d+/109 · 미체크 \d+\.', f'확인 완료 {len(done)}/109 · 미체크 {109-len(done)}.', text)
if '## 이번 17건 처리 기록' not in text:
    text = text.replace('\n## 집계', '\n## 이번 17건 처리 기록\n\n## 집계')
text = text.replace('\n## 집계', f'\n- {ident}: [공식 출처·원본 확인 근거]({evidence_ref})\n\n## 집계')
manifest['additionRequests'] = copy.deepcopy(results)
manifest['deliveryCounts'] = {kind: sum(item['delivery'] == kind for item in manifest['documents']) for kind in ('hosted', 'provider', 'direct', 'pending')}

assert len(results) == 109 and len(manifest['documents']) == 177
assert [row for row in results if row['id'] != ident] == [row for row in before_results if row['id'] != ident]
target_id = record.get('target_id') if record['operation'] == 'source_url_update' else ident
assert [item for item in manifest['documents'] if item['id'] != target_id] == [item for item in before_manifest['documents'] if item['id'] != target_id]
assert manifest['bundle'] == before_manifest['bundle']
assert len(set(item['id'] for item in manifest['documents'])) == 177
assert re.findall(r'^- \[x\] (P\d-\d{2}) ', text, re.M) == done
write(DOC / 'results.json', results)
write(DOC / 'summary.json', summary)
write(MANIFEST, manifest)
(ROOT / 'tasks.md').write_text(text)
if len(done) % 10 == 0:
    write(DOC / f'checkpoint-{len(done):03d}.json', {'progress': len(done), 'total': 109, 'completed_ids': done})
print(json.dumps({'id': ident, 'completed': len(done), 'pending': summary['unchecked'], 'files': len(files), 'evidence': evidence_ref}, ensure_ascii=False))
