"""Initialize the combined backlog before collecting any new source.

The user attachment remains unmodified. Task IDs, cards and original files are
counted separately. Previously downloaded evidence is restored only after a
byte-level check; a successful build is not a collection-complete claim.
"""
from pathlib import Path
import copy, hashlib, json, re, shutil, subprocess

ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / 'docs/forms-expansion-109'
DOC.mkdir(parents=True, exist_ok=True)
MANIFEST = ROOT / 'public/downloads/official-forms/manifest.json'
PRIOR = ROOT / '.tmp/restore61'
BASE = 'dfa9ddcf62e433e8c99c5793a5f17af4d302785a'

def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

legacy = json.loads(subprocess.check_output(['git', 'show', BASE + ':public/downloads/official-forms/manifest.json'], text=True))
assert len(legacy['documents']) == 74
write_json(DOC / 'legacy-manifest.json', legacy)
old_tasks = (PRIOR / 'tasks.md').read_text(encoding='utf-8')
attachment = (DOC / 'inputs/forms-backlog-2.md').read_text(encoding='utf-8')
old_items = re.findall(r'^- \[[ x]\] (P[0-3]-\d\d) (.+)$', old_tasks, re.M)
new_items = re.findall(r'^- \[ \] \*\*(P[4-9]-\d\d) (.+?)\*\*(.*)$', attachment, re.M)
assert len(old_items) == 61, len(old_items)
assert len(new_items) == 48, len(new_items)
updates = {'P1-03':'REG-I-01','P1-04':'REG-I-03','P1-05':'REG-G-01'}
aliases = {'P4-03':'P3-02','P7-07':'P3-03','P8-07':'P1-22'}
category = {
 'P0':'재산분배·상속','P1':'등기','P2':'공제·납부','P3':'매매·임대차',
 'P4':'증여','P5':'공제·납부','P6':'재산조회','P7':'재산조회','P8':'후견','P9':'공제·납부',
}
category_overrides = {
 'P0-01':'재산조회','P0-02':'재산조회','P0-03':'재산조회','P0-04':'재산조회',
 'P0-11':'공제·납부','P0-12':'공제·납부','P0-13':'공제·납부','P0-14':'공제·납부','P0-15':'공제·납부',
 'P1-14':'유언','P1-15':'유언','P1-16':'유언','P1-17':'유언','P1-18':'재산분배·상속','P1-19':'재산분배·상속',
 'P1-20':'불복·정정','P1-21':'재산분배·상속','P1-22':'후견','P1-23':'후견',
 'P2-01':'가업승계','P2-02':'가업승계','P2-03':'가업승계','P2-04':'가업승계','P2-05':'가업승계','P2-06':'가업승계',
 'P2-10':'불복·정정','P2-11':'불복·정정','P2-12':'불복·정정','P2-13':'불복·정정','P2-14':'불복·정정',
 'P3-03':'재산조회','P3-04':'불복·정정','P3-05':'증여','P3-06':'증여',
 'P5-02':'가업승계','P5-03':'가업승계','P5-04':'증여','P5-05':'재산분배·상속','P5-08':'재산분배·상속',
 'P8-01':'후견','P8-02':'불복·정정','P8-03':'재산분배·상속','P8-04':'재산분배·상속','P8-05':'재산분배·상속','P8-06':'재산분배·상속',
 'P9-02':'등기','P9-03':'차용·상환','P9-04':'가업승계','P9-05':'가업승계','P9-06':'매매·임대차','P9-07':'매매·임대차','P9-09':'양도','P9-10':'재산조회',
}
rows = []
for ident, raw in old_items:
    rows.append((ident, raw.replace(' [원본]','').split(' — REG-')[0], '[원본]' in raw))
for ident, title, tail in new_items:
    rows.append((ident, title, '[원본]' in tail))
assert len({x[0] for x in rows}) == 109
header = '''# /forms 1·2차 통합 작업표 — 109개 작업 ID

원문 첨부: docs/forms-expansion-109/inputs/forms-backlog-2.md
보존 기준: dfa9ddcf62e433e8c99c5793a5f17af4d302785a의 기존 74개 자료·다운로드·ZIP.
작업 브랜치: assistant/forms-additions-109. 메인·계산기·채팅·MCP·보고서·운영 설정은 변경하지 않는다.

## 계수와 중복
1차 61개 + 2차 48개 = 109개 작업 ID.
P1-03/P1-04/P1-05는 기존 REG-I-01/REG-I-03/REG-G-01의 검증된 출처 URL 교체만 수행한다.
P4-03/P7-07/P8-07은 각각 P3-02/P3-03/P1-22로 통합한다. 확장 안내·첨부는 통합 카드에서 보존한다.
따라서 명시된 중복만 제거하면 신규 카드 103개, 기존 포함 177개다. 첨부의 최종 180은 위 URL 교체 3건을 신규 카드로 계산한 수치이므로 숫자를 맞추기 위한 중복 카드는 만들지 않는다.

## 체크 기준
확인된 출처와 요청 서류의 존재를 증거로 기록한 항목만 [x]로 표시한다.
[원본]은 실제 바이너리 확보·형식·본문·해시 확인이 필요하다. 공개 재배포 여부는 별도로 판단한다.
출처/원본을 확보하지 못한 항목은 확인 중으로 기록하고 체크하지 않는다.
각 항목 처리 직후 저장하고 10건마다 완료 ID 전체를 체크포인트에 기록한다.
법령번호·개정일·기한은 사용자 요청의 기재값과 공식 확인값을 구분한다. 미확인은 null이다.

'''
task_lines = [header]
for ident, title, required in rows:
    suffix = ' [원본]' if required else ''
    if ident in updates: suffix += ' — 출처만 교체: ' + updates[ident]
    if ident in aliases: suffix += ' — 통합: ' + aliases[ident]
    task_lines.append(f'- [ ] {ident} {title}{suffix}\n')
# The entire checklist is persisted BEFORE evidence restoration or collection.
(ROOT / 'tasks.md').write_text(''.join(task_lines), encoding='utf-8')

prior_results = {r['id']: r for r in json.loads((PRIOR / 'docs/forms-additions-61/results.json').read_text())}
current_path = DOC / 'results.json'
current_results = {r['id']: r for r in json.loads(current_path.read_text())} if current_path.exists() else {}
results = []
for ident, title, required in rows:
    record = {
      'id': ident, 'title': title, 'category': category_overrides.get(ident, category[ident[:2]]),
      'required_original': required, 'operation': 'source_url_update' if ident in updates else 'alias' if ident in aliases else 'add',
      'target_id': updates.get(ident) or aliases.get(ident), 'status':'확인 중', 'source_url':None,
      'checked_at':None,'form_no':None,'revised_at':None,'deadline':None,'deadline_basis':None,
      'license':'미확인','source_type':None,'files':[], 'failure_reason':'실제 공식 출처·서식 확인 대기',
    }
    prior = prior_results.get(ident)
    if prior and prior.get('status') == '확인 완료':
        copied = []
        valid = True
        for file in prior.get('files', []):
            rel = file.get('path')
            private = file.get('artifact_path')
            source = PRIOR / rel if rel else PRIOR / '.tmp/forms-additions-proof' / private if private else None
            if not source or not source.is_file() or hashlib.sha256(source.read_bytes()).hexdigest() != file['sha256']:
                valid = False; break
            item = copy.deepcopy(file)
            if rel:
                dest = ROOT / rel
            else:
                dest = ROOT / '.tmp/forms-expansion-proof' / private
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, dest)
            copied.append(item)
        if valid and (not required or copied):
            record.update(copy.deepcopy(prior))
            record.update(category=category_overrides.get(ident, category[ident[:2]]), required_original=required, files=copied)
            record['restored_from_run'] = 35198148042
            record.pop('failure_reason', None)
    if ident in current_results:
        # New verified progress takes precedence over a previous snapshot.
        record.update(current_results[ident])
    results.append(record)
write_json(current_path, results)
write_json(DOC / 'request-index.json', [{'id':i,'title':t,'required_original':r,'operation':'source_url_update' if i in updates else 'alias' if i in aliases else 'add','target_id':updates.get(i) or aliases.get(i)} for i,t,r in rows])
write_json(DOC / 'attachment-integrity.json', {'path':'inputs/forms-backlog-2.md','sha256':hashlib.sha256((DOC/'inputs/forms-backlog-2.md').read_bytes()).hexdigest(),'task_ids':48})
# No speculative new URL enters the public catalog at bootstrap time.
write_json(MANIFEST, legacy)
done = [r['id'] for r in results if r['status'] == '확인 완료']
text = (ROOT/'tasks.md').read_text()
for ident in done: text = text.replace(f'- [ ] {ident} ',f'- [x] {ident} ')
text += f'\n## 집계\n확인 완료 {len(done)}/109 · 미체크 {109-len(done)}. 기존 검수 증거 복원과 이번 새 접속 검증은 별도 기록한다.\n'
(ROOT/'tasks.md').write_text(text)
print(json.dumps({'restored_completed':len(done),'unchecked':109-len(done),'completed_ids':done},ensure_ascii=False))
