"""Preserve prior successful evidence; transient rechecks must not erase inspected original files."""
import copy,hashlib,json,re,subprocess,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];DOC=ROOT/'docs/forms-additions-61';MP='public/downloads/official-forms/manifest.json';RP='docs/forms-additions-61/results.json'
manifest=json.loads((ROOT/MP).read_text());current=json.loads((ROOT/RP).read_text());byid={x['id']:x for x in current}
history=subprocess.check_output(['git','log','--format=%H','--',RP],text=True).splitlines()
restored=[]
for sha in history:
 try:
  old_results=json.loads(subprocess.check_output(['git','show',sha+':'+RP],text=True,stderr=subprocess.DEVNULL))
  old_manifest=json.loads(subprocess.check_output(['git','show',sha+':'+MP],text=True,stderr=subprocess.DEVNULL))
 except (subprocess.CalledProcessError,ValueError):continue
 for old in old_results:
  ident=old['id'];latest=byid[ident]
  if latest['status']=='확인 완료' or old['status']!='확인 완료':continue
  # File-based verification survives only if the already committed bytes still match.
  files=old.get('files',[])
  if files and not all(f.get('path') and (ROOT/f['path']).is_file() and hashlib.sha256((ROOT/f['path']).read_bytes()).hexdigest()==f['sha256'] for f in files):continue
  # Guidance verification retains its original timestamp and reports the unsuccessful recheck.
  previous=copy.deepcopy(old)
  previous['last_recheck']={'checked_at':latest['checked_at'],'status':'확인 중','reason':latest.get('failure_reason','재접속 실패')}
  previous['restored_evidence_commit']=sha
  if previous['id']=='P0-01':previous['note']='공식 안내 확인 기록을 보존했습니다. 최근 재접속 실패는 별도 기록하며 최신 접속 성공이라고 표시하지 않습니다.'
  byid[ident]=previous
  if old['operation']=='add':
   card=copy.deepcopy(next(d for d in old_manifest['documents'] if d['id']==ident))
   card['last_recheck']=previous['last_recheck']
   idx=next(i for i,d in enumerate(manifest['documents']) if d['id']==ident);manifest['documents'][idx]=card
  restored.append(ident)
# Detailed FSS copyright conditions were actually read; do not label them as blanket permission.
for ident in ['P0-02','P0-03','P0-04']:
 r=byid[ident]
 r['license']='금융감독원 저작권 정책: 영리 이용·재배포 사전협의 필요. 원본은 검토용으로 다운로드했으며 공개 복제하지 않음.'
 r['license_source']='https://www.fss.or.kr/fss/main/contents.do?menuNo=200701'
 r['publication_note']='공식 첨부 주소 연결의 정책상 통지 요건을 운영 공개 전 확인할 것.'
 card=next(d for d in manifest['documents'] if d['id']==ident);card['license']=r['license'];card['license_source']=r['license_source'];card['publication_note']=r['publication_note']
results=[byid[r['id']] for r in current]
manifest['additionRequests']=results
manifest['deliveryCounts']={k:sum(d.get('delivery')==k for d in manifest['documents']) for k in ['hosted','provider','pending']}
(ROOT/MP).write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
(ROOT/RP).write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
tp=ROOT/'tasks.md';t=tp.read_text();done=[r['id'] for r in results if r['status']=='확인 완료']
for r in results:t=re.sub(r'^- \[[ x]\] '+r['id']+' ',f'- [{"x" if r["status"]=="확인 완료" else " "}] '+r['id']+' ',t,flags=re.M)
t=t.replace('원본 필수 23개 항목','원본 필수 24개 항목')
t=re.sub(r'\n## 최근 실행 집계[\s\S]*$','',t);t+=f'\n## 최근 실행 집계\n확인 완료 {len(done)}/61 · 미체크 {61-len(done)}. 원본 필수 24개 작업. 최근 재접속 실패와 기존 원본 검수 완료는 별도 기록합니다.\n';tp.write_text(t)
summary=json.loads((DOC/'summary.json').read_text());summary.update(completed=len(done),unchecked=61-len(done),completed_ids=done,pending_ids=[r['id'] for r in results if r['status']!='확인 완료'],original_task_successes=[r['id'] for r in results if r.get('files')],recovered_original_evidence=restored)
required=set(re.findall(r'^- \[[ x]\] (P[0-3]-\d\d) .*\[원본\]',t,re.M));summary['original_required_pending']=[r['id'] for r in results if r['id'] in required and not r.get('files')]
(DOC/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'restored_ids':restored,'completed':len(done),'unchecked':61-len(done)},ensure_ascii=False),flush=True)
