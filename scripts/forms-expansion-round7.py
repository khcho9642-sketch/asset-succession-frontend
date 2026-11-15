"""Finish source-only tasks whose successful public HTTP/DOM evidence was already
saved but not consumed. Retain the actual September 17 retrieval timestamps and
September 19 failed rechecks; do not describe these as fresh HTTP successes.
"""
from pathlib import Path
import json,re
hp=Path(__file__).with_name('forms-expansion-collect.py');hs=hp.read_text()
exec(compile(hs.split('# These short Korean-law addresses')[0],str(hp),'exec'),globals())
DEST=OUT/'round7';DEST.mkdir(parents=True,exist_ok=True)
checkpoints.update(range(10,sum(r['status']=='확인 완료' for r in results)+1,10))
before=[r['id'] for r in results if r['status']=='확인 완료']
source='https://ecfs.scourt.go.kr/psp/index.on?m=PSP720M24'

def court_evidence(query,titles):
    p=OUT/'round4'/('court-query-'+query+'.json')
    d=json.loads(p.read_text())
    assert d['url']==source
    assert any(e['url']==source and e['status']==200 for e in d['events'])
    assert any('/psp/psp720/selectNboardList.on' in e['url'] and e['status']==200 for e in d['events'])
    frame=next(f for f in d['frames'] if f['url']==source)
    text=frame['text']
    # Limit matching to the rendered table body, never the search input or navigation.
    start=text.index('번호\t\t제목\t첨부')
    end=text.index('\n총\n',start)
    table=text[start:end]
    assert '조회된 결과가 없습니다.' not in table
    rows=[line.strip() for line in table.splitlines() if re.match(r'^\d+\t+\[',line)]
    matched=[]
    for title in titles:
        found=[row for row in rows if norm(title) in norm(row)]
        assert found,(query,title,rows)
        matched.append(found[0])
    return {'url':source,'http_status':200,'checked_at':d['checked_at'],
      'search_query':query,'matched_rows':matched,'response_body_sha256':digest(text.encode()),
      'evidence_file':str(p.relative_to(ROOT)),'evidence_file_sha256':digest(p.read_bytes()),
      'verification_method':'review_of_preserved_successful_http_and_rendered_form_table',
      'recheck_note':'2026-09-19 재접속은 연결시간 초과. 아래 HTTP 200과 서식 목록 증거는 2026-09-17에 실제 수집한 응답입니다.'}

def accept_saved(ident,institution,evidence,note,related=None,form_no=None):
    r=byid[ident]
    if r['status']=='확인 완료':return
    assert not r['required_original'],ident
    assert evidence['http_status']==200 and evidence.get('checked_at')
    r.update(status='확인 완료',source_url=evidence['url'],source_type='공식제공처',
      checked_at=evidence['checked_at'],reviewed_at=now(),institution=institution,
      source_evidence=evidence,license='공식 제공처 연결 · 개별 첨부 재배포 조건 미확인',note=note)
    if related:r['related_ids']=related
    if form_no:r['form_no']=form_no
    r.pop('failure_reason',None)
    r.setdefault('attempts',[]).append({'checked_at':now(),'url':evidence['url'],
       'result':'보존된 실제 HTTP 200 및 서식 목록 응답을 재검토하여 등록; 개별 원본 바이너리 다운로드 완료를 의미하지 않음',
       'source_retrieved_at':evidence['checked_at']})
    persist()
    print('확인 완료',ident,'원문 응답 확인시점',evidence['checked_at'],flush=True)

jobs=[
 ('P0-07','상속',['상속재산포기심판청구'],'상속재산포기심판청구', ['P8-01']),
 ('P0-08','한정승인',['상속한정승인 심판청구서'],'상속한정승인 심판청구서',['P0-09','P8-05']),
 ('P1-15','유언',['유언증서검인 심판청구서'],'유언증서검인 심판청구서',['P1-14']),
 ('P1-18','상속',['상속재산의 분할 심판청구서'],'상속재산의 분할 심판청구서',['BP-I-01','P8-01']),
 ('P1-21','상속',['상속재산관리인선임 청구서 및 안내'],'상속재산관리인선임 청구서 및 안내',['P8-06']),
 ('P8-01','특별대리인',['특별대리인선임 심판청구서(상속재산 협의분할)','특별대리인선임 심판청구서(이해상반)'],'특별대리인선임 심판청구서(상속재산 협의분할) 및 (이해상반)',['P0-07','P1-18']),
]
for ident,query,titles,label,related in jobs:
    try:
        ev=court_evidence(query,titles)
        note='대한민국 법원 전자소송포털의 양식모음에서 검색어 «'+query+'»로 «'+label+'» 항목을 확인했습니다. 공식 제공처에서 사건에 맞는 양식과 작성안내를 선택하세요. 원본 파일을 이 사이트에서 재배포하는 항목은 아닙니다.'
        if ident=='P1-21':note+=' 기관이 게시한 서식 명칭을 그대로 기록했습니다. 현재 사건에서 관리인·청산인 중 필요한 신청과 관할법원의 서식 요구를 확인하세요.'
        if ident=='P8-01':note+=' 상속포기 등에서 특별대리인이 필요한지는 각 사건의 이해상반 여부를 별도로 확인해야 하며, 모든 경우에 필수라는 의미는 아닙니다.'
        accept_saved(ident,'대한민국 법원 전자소송포털',ev,note,related)
    except Exception as error:fail(ident,'보존 자료 재검토 실패: '+str(error),source)

for ident,parts,note,related in [
 ('P1-23',[('부재자',['부재자재산관리인선임 심판청구서 및 안내']),('실종',['실종선고 심판청구서'])],
  '공식 양식모음에서 «부재자재산관리인선임 심판청구서 및 안내»와 «실종선고 심판청구서»를 각각 확인했습니다. 검색어 «부재자», «실종»으로 찾을 수 있습니다. 두 절차를 같은 신청으로 취급하지 말고 사건에 맞게 선택하세요.',[]),
 ('P8-03',[('친생자',['친생자관계부존재확인의소','친생자관계존재확인의 소']),('인지청구',['인지청구의소'])],
  '공식 양식모음에서 친생자관계 존재·부존재 확인과 인지청구 양식을 각각 확인했습니다. 검색어 «친생자», «인지청구»를 사용하세요. 원고·피고·제소 요건은 사건별로 검토해야 합니다.',[]),
]:
    try:
        evidence=[court_evidence(q,t) for q,t in parts]
        ev={'url':source,'http_status':200,'checked_at':min(e['checked_at'] for e in evidence),
            'pages':evidence,'matched_rows':[row for e in evidence for row in e['matched_rows']],
            'verification_method':'review_of_preserved_successful_http_and_rendered_form_tables'}
        accept_saved(ident,'대한민국 법원 전자소송포털',ev,note,related)
    except Exception as error:fail(ident,'복수 서식 재검토 실패: '+str(error),source)

try:
    p=OUT/'round4/military-root.json';d=json.loads(p.read_text())
    assert d['http_status']==200
    for term in ['퇴역유족연금 청구서','상이유족연금 청구서','구비서류']:
        assert norm(term) in norm(d['text'])
    files=[a for a in d['links'] if '/downloadLocal.do?' in a['url']]
    assert any('[별지 제3호]' in a['url'] for a in files)
    assert any('별지 제2호' in a['url'] for a in files)
    ev={k:d[k] for k in ['url','http_status','checked_at','sha256']}
    ev.update(matched_titles=['퇴역유족연금 청구서','상이유족연금 청구서','유족대표자 선정서','퇴직유족급여 등분 청구서'],
       attachment_links=files,evidence_file=str(p.relative_to(ROOT)),evidence_file_sha256=digest(p.read_bytes()),
       verification_method='review_of_preserved_successful_http_with_form_download_anchors',
       recheck_note='2026-09-19 재접속은 연결시간 초과. HTTP 200 및 서식 링크 확인은 2026-09-17 수집 응답에 근거합니다.')
    accept_saved('P7-03','국방부 군인연금',ev,
      '국방부 군인연금의 유족연금 신청안내입니다. 퇴역유족연금·상이유족연금 청구서와 유족대표자 선정서·등분 청구서 및 제출서류 안내를 제공합니다. 해당 급여와 유족관계에 맞는 원문 서식을 선택하세요. 개별 첨부 재배포 조건과 파일 열림은 확인 전이므로 공식 제공처로 연결합니다.')
except Exception as error:fail('P7-03','보존 자료 재검토 실패: '+str(error),'https://www.mps.mil.kr/info/deceIncmAplcForm.do')

persist()
exec(compile('# Extend the catalog'+hs.split('# Extend the catalog',1)[1],str(hp),'exec'),globals())
new=[r['id'] for r in results if r['status']=='확인 완료' and r['id'] not in before]
save(DEST/'reviewed-source-items.json',{'reviewed_at':now(),'newly_completed_ids':new,
 'source_retrieval_dates_preserved':True,'new_original_files_downloaded':0,
 'note':'서식이 존재하는 기존 성공 응답을 확인해 공식 제공처 항목으로 등록했습니다. 오늘 재접속 성공 또는 원본 파일 확보로 보고하지 않습니다.'})
print('NEW_DONE',','.join(new),flush=True)
