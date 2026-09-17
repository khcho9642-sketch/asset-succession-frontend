"""Download published originals, register per-item evidence, and preserve all 74 baseline records."""
import copy, hashlib, io, json, re, struct, subprocess, time, zipfile, zlib
from pathlib import Path
from urllib.parse import quote, urlparse
import requests, olefile
from bs4 import BeautifulSoup
from pypdf import PdfReader
ROOT=Path(__file__).resolve().parents[1]
DOC=ROOT/'docs/forms-additions-61'
OUT=ROOT/'.tmp/forms-additions-proof'
PRIVATE=OUT/'downloaded-originals'
PUBLIC=ROOT/'public/downloads/official-forms/additions'
for p in (DOC,OUT,PRIVATE,PUBLIC):p.mkdir(parents=True,exist_ok=True)
BASE='68db15b305e3dda2883d2d956709879a9034e5f9'
M=ROOT/'public/downloads/official-forms/manifest.json'
baseline=json.loads(subprocess.check_output(['git','show',BASE+':public/downloads/official-forms/manifest.json'],text=True))
originals=copy.deepcopy(baseline['documents'])
assert len(originals)==74
TASKS=ROOT/'tasks.md'
tasktext=TASKS.read_text(encoding='utf-8')
items=re.findall(r'^- \[[ x]\] (P[0-3]-\d\d) (.+)$',tasktext,re.M)
assert len(items)==61 and len({i for i,t in items})==61
# Stage 0: additive schema and category extension precedes any registration.
ui=ROOT/'app/forms/FormsLibrary.tsx'
s=ui.read_text(encoding='utf-8')
needle='  originalCategory: string; catalogTitle: string; exampleVerification: string;'
if 'form_no?:' not in s:
 assert needle in s
 s=s.replace(needle,needle+'\n  form_no?: string | null; revised_at?: string | null; deadline?: string | null;\n  deadline_basis?: string | null; source_type?: "원본" | "공식제공처" | null; checked_at?: string;\n  status?: "확인 완료" | "확인 중"; task_id?: string;',1)
 s=s.replace('"공제·납부", "등기"]','"공제·납부", "등기", "재산조회", "유언", "후견", "불복·정정"]',1)
# Pending records have no invented external navigation.
s=s.replace('href={item.editable}', 'href={item.editable || undefined} aria-disabled={!item.editable}')
s=s.replace('href={item.sourceUrl}', 'href={item.sourceUrl || undefined}')
s=s.replace('href={item.example ?? item.sourceUrl}', 'href={item.example ?? (item.sourceUrl || undefined)}')
s=s.replace('href={preview.sourceUrl}', 'href={preview.sourceUrl || undefined}')
s=s.replace('href={preview.editable}', 'href={preview.editable || undefined} aria-disabled={!preview.editable}')
ui.write_text(s,encoding='utf-8')
SESSION=requests.Session();SESSION.headers['User-Agent']='Mozilla/5.0 (compatible; public-form-verification/1.0)'
CACHE={}
def now():return time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
def compact(s):return re.sub(r'\s+','',s)
def get(url):
 if url not in CACHE:
  r=SESSION.get(url,timeout=(12,40));
  if r.encoding in (None,'ISO-8859-1'):r.encoding=r.apparent_encoding
  CACHE[url]=r
 return CACHE[url]
def hwp_text(data):
 with olefile.OleFileIO(io.BytesIO(data)) as f:
  header=f.openstream('FileHeader').read()
  if not header.startswith(b'HWP Document File'):raise ValueError('HWP header mismatch')
  compressed=bool(struct.unpack_from('<I',header,36)[0]&1)
  parts=[]
  for name in f.listdir():
   if len(name)==2 and name[0]=='BodyText':
    b=f.openstream(name).read();b=zlib.decompress(b,-15) if compressed else b
    pos=0
    while pos+4<=len(b):
     head=struct.unpack_from('<I',b,pos)[0];pos+=4;tag=head&1023;size=head>>20
     if size==4095:
      size=struct.unpack_from('<I',b,pos)[0];pos+=4
     if tag==67:parts.append(b[pos:pos+size].decode('utf-16le',errors='ignore'))
     pos+=size
  return '\n'.join(parts)
def inspect_binary(data):
 if data.startswith(b'\xd0\xcf\x11\xe0'):return 'hwp',hwp_text(data)
 if data.startswith(b'%PDF-'):return 'pdf','\n'.join(p.extract_text() or '' for p in PdfReader(io.BytesIO(data)).pages)
 if data.startswith(b'PK'):
  with zipfile.ZipFile(io.BytesIO(data)) as z:
   names=z.namelist()
   if any(n.startswith('Contents/section') for n in names):return 'hwpx',' '.join(BeautifulSoup(z.read(n),'xml').get_text(' ') for n in names if n.startswith('Contents/section') and n.endswith('.xml'))
 raise ValueError('HTML/error response or unsupported binary format')
def category(i):
 p,n=i.split('-');n=int(n)
 if p=='P0':return '재산조회' if n<=6 else '재산분배·상속' if n<=10 else '공제·납부'
 if p=='P1':return '등기' if n<=13 or n==24 else '유언' if n<=17 else '후견' if n in (21,22,23) else '재산분배·상속'
 if p=='P2':return '가업승계' if n<=6 else '불복·정정' if n>=10 and n<=14 else '공제·납부'
 return {'P3-01':'등기','P3-02':'양도','P3-03':'재산조회','P3-04':'불복·정정','P3-05':'증여','P3-06':'증여'}[i]
REPLACE={'P1-03':'REG-I-01','P1-04':'REG-I-03','P1-05':'REG-G-01'}
LAW={
 'P0-11':('local-tax','지방세법 시행규칙','[별지 제3호서식]','취득세'),
 'P0-12':('local-tax','지방세법 시행규칙','[별지 제3호서식]','취득상세명세서'),
 'P0-13':('local-tax','지방세법 시행규칙','[별지 제4호서식]','납부서'),
 'P0-15':('local-tax','지방세법 시행규칙','[별지 제8호서식]','비과세'),
 'P2-01':('tax-special','조세특례제한법 시행규칙','[별지 제11호의6서식]','창업자금'),
 'P2-02':('tax-special','조세특례제한법 시행규칙','[별지 제11호의8서식]','가업승계'),
 'P2-04':('vat','부가가치세법 시행규칙','[별지 제11호서식]','사업자등록정정신고서'),
 'P2-05':('inheritance-tax','상속세 및 증여세법 시행규칙','[별지 제9호서식]','사후관리추징사유'),
 'P2-07':('inheritance-tax','상속세 및 증여세법 시행규칙','[별지 제13호서식]','물납'),
 'P2-10':('national-tax','국세기본법 시행규칙','[별지 제16호의2서식]','경정'),
 'P2-12':('national-tax','국세기본법 시행규칙','[별지 제56호의3서식]','과세전적부'),
 'P2-13':('national-tax','국세기본법 시행규칙','[별지 제32호서식]','이의신청'),
}
FSS={'P0-02':'신청서 다운로드','P0-03':'위임장 다운로드','P0-04':'외국인 사망자 대상 신청서류 안내문 다운로드'}
GUIDES={
 'P0-01':('government-inheritance',['재산조회','통합처리'],'행정안전부·정부24'),
 'P0-06':('family-guide',['가족관계증명서','상세'],'대법원 전자가족관계등록시스템'),
}
# The following supplementary resolutions must themselves contain observed URLs and evidence.
extra=DOC/'resolved-sources.json'
EXTRA=json.loads(extra.read_text(encoding='utf-8')) if extra.exists() else {}
results=[];done=[];new=[];evidence=[]
def save():
 current=TASKS.read_text(encoding='utf-8')
 for result in results:
  ident=result['id'];mark='x' if result['status']=='확인 완료' else ' '
  current=re.sub(r'^- \[[ x]\] '+re.escape(ident)+r' ',f'- [{mark}] {ident} ',current,flags=re.M)
 current=re.sub(r'\n## 최근 실행 집계[\s\S]*$','',current)
 current+='\n## 최근 실행 집계\n'+f'확인 완료 {len(done)}/61 · 미체크 {61-len(done)} · 원본 다운로드 성공 {sum(bool(r.get("files")) for r in results)}개 작업. 확인 불가는 미완료로 유지합니다.\n'
 TASKS.write_text(current,encoding='utf-8')
 manifest=copy.deepcopy(baseline);manifest['documents']=originals+new
 manifest['additionRequests']=results
 manifest['additionCount']=len(new);manifest['requestedTaskCount']=61
 manifest['publishedCount']=len(manifest['documents'])
 manifest['deliveryCounts']={k:sum(d.get('delivery')==k for d in manifest['documents']) for k in ['hosted','provider','pending']}
 M.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 (DOC/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 (DOC/'http-evidence.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for ident,title0 in items:
 title=title0.replace(' [원본]','').split(' — REG-')[0]
 record={'id':ident,'title':title,'operation':'source_url_update' if ident in REPLACE else 'add','target_id':REPLACE.get(ident),'status':'확인 중','checked_at':now(),'form_no':None,'revised_at':None,'deadline':None,'deadline_basis':None,'license':'미확인','source_type':None,'files':[]}
 source='';institution='공식 출처 확인 중';href='';format_label='확인 중';public_file=None
 try:
  if ident in LAW:
   key,instrument,prefix,term=LAW[ident]
   page=json.loads((DOC/'browser'/f'{key}.json').read_text(encoding='utf-8'))
   assert page.get('http_status')==200
   source=page['source'];institution='국가법령정보센터'
   found=[a for a in page['links'] if a['text'].strip().startswith(prefix) and a['text'].strip().endswith('.hwp') and 'flDownload.do?' in a['href']]
   if not found:raise ValueError('Rendered official annex matching the requested form was not found')
   href=found[0]['href'];record['form_no']=instrument+' '+prefix.strip('[]')
   record['observed_title']=re.sub(r'\s+',' ',found[0]['text']).strip()
   r=get(href)
   if r.status_code!=200:raise ValueError(f'원본 HTTP {r.status_code}')
   ext,text=inspect_binary(r.content)
   if compact(term) not in compact(text):raise ValueError('Binary text does not contain the requested form title')
   filename=ident+'_'+re.sub(r'[^가-힣A-Za-z0-9_-]','_',title)+'.'+ext
   file=PUBLIC/filename;file.write_bytes(r.content)
   public_file='/downloads/official-forms/additions/'+quote(filename)
   record['files']=[{'url':href,'path':str(file.relative_to(ROOT)),'bytes':len(r.content),'sha256':hashlib.sha256(r.content).hexdigest(),'format':ext,'title_verified':True,'http_status':r.status_code}]
   changes=re.findall(r'<\s*(?:개정|신설)\s*(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})',text[:1500])
   if changes:record['revised_at']='-'.join([changes[0][0],changes[0][1].zfill(2),changes[0][2].zfill(2)])
   record['license']='법령 별지서식 원문·공공누리 유형 표시 미확인'
   record['source_type']='원본';format_label=ext.upper()
   record['note']='공식 합본 서식은 분리·재작성하지 않고 원본 전체를 제공합니다.' if ident in ('P0-12','P2-05') else '기관 원본 문구·조항·표를 변경하지 않았습니다.'
   if ident=='P2-04':record['note']='사용자 목록의 제9호와 달리 실제 공식 서식은 제11호입니다. 원문 기준으로 기록했습니다.'
   record['status']='확인 완료'
  elif ident in FSS:
   page=json.loads((DOC/'discovery/fss.json').read_text(encoding='utf-8'))
   source=page['url'];institution='금융감독원 금융소비자 정보포털 파인'
   link=next(a for a in page['links'] if a['text']==FSS[ident]);href=link['href']
   r=get(href)
   if r.status_code!=200:raise ValueError(f'원본 HTTP {r.status_code}')
   ext,text=inspect_binary(r.content)
   term='위임' if ident=='P0-03' else '외국인' if ident=='P0-04' else '상속인'
   if term not in compact(text):raise ValueError('기관 첨부 본문 제목 확인 실패')
   name=ident+'.'+ext;(PRIVATE/name).write_bytes(r.content)
   record['files']=[{'url':href,'artifact_path':'downloaded-originals/'+name,'bytes':len(r.content),'sha256':hashlib.sha256(r.content).hexdigest(),'format':ext,'http_status':200,'title_verified':True}]
   record['source_type']='원본';record['license']='재배포 조건 미확인: 내려받은 원본은 검증 산출물에 보관하고 공식 원본 주소로 연결'
   record['status']='확인 완료';format_label=ext.upper()
  elif ident in GUIDES:
   key,terms,institution=GUIDES[ident];page=json.loads((DOC/'discovery'/f'{key}.json').read_text(encoding='utf-8'))
   source=page['url'];r=get(source);text=BeautifulSoup(r.text,'html.parser').get_text(' ',strip=True)
   if r.status_code!=200 or not all(term in text for term in terms):raise ValueError('HTTP 또는 본문 일치 확인 실패')
   if ident=='P0-06':
    for k,term in [('basic-guide','기본증명서'),('removed-guide','제적')]:
     guide=json.loads((DOC/'discovery'/f'{k}.json').read_text());rr=get(guide['url']);assert rr.status_code==200 and term in rr.text
    record['related_sources']=[json.loads((DOC/'discovery'/f'{k}.json').read_text())['url'] for k in ['basic-guide','removed-guide']]
   if ident=='P0-01':
    if '1년' in text and '말일' in text:record.update(deadline='1년',deadline_basis='사망일이 속한 달의 말일',form_no='사망자 및 피후견인 등 재산조회 통합처리에 관한 기준 별지 제1호서식')
   record['source_type']='공식제공처';record['license']='공식 서비스 안내 링크·재배포 없음';record['status']='확인 완료';href=source;format_label='공식 안내'
  elif ident in EXTRA:
   e=EXTRA[ident];source=e['url'];institution=e['institution'];r=get(source)
   text=BeautifulSoup(r.text,'html.parser').get_text(' ',strip=True)
   if r.status_code!=200 or not all(compact(term) in compact(text) for term in e['terms']):raise ValueError('보완 출처 HTTP200/본문 일치 미확인')
   if '[원본]' in title0:raise ValueError('원본 필수 항목: 직접 파일 확보 필요')
   record.update({k:e[k] for k in ['deadline','deadline_basis','form_no','revised_at'] if k in e})
   record.update(status='확인 완료',source_type='공식제공처',license='공식 제공처 안내 링크·재배포 없음');href=source;format_label='공식 안내'
  else:raise ValueError('개별 공식 출처·서식 또는 원본 파일 확인 대기')
 except Exception as exc:record['failure_reason']=str(exc)
 record['source_url']=source if record['status']=='확인 완료' else None
 if record['status']=='확인 완료':done.append(ident)
 evidence.append({'id':ident,'checked_at':record['checked_at'],'url':href or source,'status':record['status'],'reason':record.get('failure_reason'),'files':record['files']})
 if ident in REPLACE:
  if record['status']=='확인 완료':
   old=next(d for d in originals if d['id']==REPLACE[ident]);old['sourceUrl']=source
 else:
  ready=record['status']=='확인 완료'
  new.append({'id':ident,'task_id':ident,'title':title,'catalogTitle':title,'category':category(ident),'originalCategory':category(ident),'description':record.get('note', '기관 원본 또는 공식 안내에서 작성·제출 방법을 확인하세요.' if ready else '개별 서식의 공식 출처와 원본을 확인하고 있습니다.'),'tags':ident+' · '+title,'format':format_label,'editable':public_file or href if ready else '', 'example':None,'thumbnail':None,'sizeLabel':str((record['files'][0]['bytes']+1023)//1024)+' KB' if record['files'] else '공식 안내' if ready else '확인 중','institution':institution if ready else '공식 출처 확인 중','sourceUrl':source if ready else '', 'checkedOn':record['checked_at'][:10],'license':record['license'],'verification':'HTTP 200·기관 서식 본문 확인. 파일 전체 인쇄 레이아웃은 별도 검토가 필요합니다.' if record['files'] else '공식 안내 본문 확인' if ready else record.get('failure_reason'),'exampleVerification':'기관 작성 예시 미확인','delivery':'hosted' if public_file else 'provider' if ready else 'pending',**{k:record[k] for k in ['status','form_no','revised_at','deadline','deadline_basis','license','source_type','checked_at']},'downloaded_originals':record['files']})
 results.append(record);save()
 print(f'{ident} {record["status"]} {record.get("failure_reason","")}',flush=True)
 if len(done) and len(done)%10==0 and ready:
  checkpoint={'progress':len(done),'total':61,'completed_ids':done.copy()};(DOC/f'checkpoint-{len(done):02d}.json').write_text(json.dumps(checkpoint,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(checkpoint,ensure_ascii=False),flush=True)
# Read back tasks and actual manifest; no unverified task is checked.
final=TASKS.read_text(encoding='utf-8');unchecked=len(re.findall(r'^- \[ \] P[0-3]-\d\d ',final,re.M))
assert unchecked==61-len(done)
summary={'requested_tasks':61,'new_cards':len(new),'source_update_tasks':3,'legacy_records':74,'manifest_cards':len(originals)+len(new),'completed':len(done),'unchecked':unchecked,'completed_ids':done,'pending_ids':[r['id'] for r in results if r['status']!='확인 완료'],'original_task_successes':[r['id'] for r in results if r['files']],'original_required_pending':[r['id'] for r,(i,t) in zip(results,items) if '[원본]' in t and not r['files']]}
(DOC/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False),flush=True)
