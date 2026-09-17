"""Use saved official search evidence to download and register additional originals."""
import hashlib,io,json,re,struct,time,zipfile,zlib
from pathlib import Path
from urllib.parse import quote
import requests,olefile
from bs4 import BeautifulSoup
from pypdf import PdfReader
ROOT=Path(__file__).resolve().parents[1];DOC=ROOT/'docs/forms-additions-61';RES=DOC/'resolution';PUB=ROOT/'public/downloads/official-forms/additions';PUB.mkdir(exist_ok=True)
M=ROOT/'public/downloads/official-forms/manifest.json';manifest=json.loads(M.read_text());results=json.loads((DOC/'results.json').read_text());tasks=ROOT/'tasks.md'
TERMS={'P0-14':['지방세','감면','신청'],'P0-16-a':['유족연금','청구'],'P0-16-b':['반환일시금','청구'],'P0-16-c':['사망일시금','청구'],'P1-24':['이전등록','신청'],'P2-03':['주식등변동상황명세서'],'P2-08':['납세담보','제공'],'P2-11':['기한','신고'],'P2-15':['평가심의','신청'],'P3-01':['농지취득자격증명','신청'],'P3-02':['부동산','거래계약','신고']}
def normalize(t):return re.sub(r'[^가-힣A-Za-z0-9]','',t)
def inspect(data):
 if data.startswith(b'%PDF-'):return 'pdf','\n'.join(p.extract_text() or '' for p in PdfReader(io.BytesIO(data)).pages)
 if data.startswith(b'\xd0\xcf\x11\xe0'):
  with olefile.OleFileIO(io.BytesIO(data)) as f:
   head=f.openstream('FileHeader').read();assert head.startswith(b'HWP Document File');compressed=bool(struct.unpack_from('<I',head,36)[0]&1);parts=[]
   for name in f.listdir():
    if len(name)==2 and name[0]=='BodyText':
     b=f.openstream(name).read();b=zlib.decompress(b,-15) if compressed else b;pos=0
     while pos+4<=len(b):
      n=struct.unpack_from('<I',b,pos)[0];pos+=4;size=n>>20
      if size==4095:size=struct.unpack_from('<I',b,pos)[0];pos+=4
      if n&1023==67:parts.append(b[pos:pos+size].decode('utf-16le',errors='ignore'))
      pos+=size
   return 'hwp','\n'.join(parts)
 raise ValueError('원본 HWP/PDF 형식이 아님')
def persist():
 manifest['additionRequests']=results
 manifest['deliveryCounts']={k:sum(d['delivery']==k for d in manifest['documents']) for k in ['hosted','provider','pending']}
 M.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 (DOC/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 t=tasks.read_text();done=[r['id'] for r in results if r['status']=='확인 완료']
 for r in results:t=re.sub(r'^- \[[ x]\] '+r['id']+' ',f'- [{"x" if r["status"]=="확인 완료" else " "}] '+r['id']+' ',t,flags=re.M)
 t=re.sub(r'\n## 최근 실행 집계[\s\S]*$','',t);t+=f'\n## 최근 실행 집계\n확인 완료 {len(done)}/61 · 미체크 {61-len(done)}.\n';tasks.write_text(t)
 if len(done)%10==0:
  ck={'progress':len(done),'total':61,'completed_ids':done};(DOC/f'checkpoint-{len(done):02d}.json').write_text(json.dumps(ck,ensure_ascii=False,indent=2));print(json.dumps(ck,ensure_ascii=False),flush=True)
for result in results:
 ident=result['id']
 if result['status']=='확인 완료':continue
 keys=[ident] if ident!='P0-16' else ['P0-16-a','P0-16-b','P0-16-c']
 if not all((RES/(key+'.json')).exists() for key in keys):continue
 files=[];sources=[];texts=[]
 try:
  for key in keys:
   evidence=json.loads((RES/(key+'.json')).read_text())
   if evidence.get('error'):raise ValueError(evidence['error'])
   selected=evidence.get('selected',{})
   choices=[]
   for page in evidence.get('pages',[]):
    for link in page.get('links',[]):
     if link['text'].strip().endswith('.hwp') and all(normalize(term) in normalize(link['text']) for term in TERMS[key]):choices.append((page,link))
   if not choices:raise ValueError('선택한 공식 서식의 실제 HWP 다운로드 링크 미확인')
   page,link=choices[0];r=requests.get(link['href'],timeout=(10,35))
   if r.status_code!=200:raise ValueError('원본 HTTP '+str(r.status_code))
   ext,text=inspect(r.content)
   if not all(normalize(term) in normalize(text) for term in TERMS[key]):raise ValueError('다운로드 본문과 요청한 서식 불일치')
   filename=key+'_'+re.sub(r'[^가-힣A-Za-z0-9_-]','_',result['title'])+'.'+ext;dest=PUB/filename;dest.write_bytes(r.content)
   files.append({'url':link['href'],'path':str(dest.relative_to(ROOT)),'bytes':len(r.content),'sha256':hashlib.sha256(r.content).hexdigest(),'format':ext,'http_status':200,'title_verified':True,'local_url':'/downloads/official-forms/additions/'+quote(filename)})
   sources.append(page['url']);texts.append(text)
  result.update(status='확인 완료',checked_at=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),source_type='원본',license='법령 별지서식 원문·공공누리 유형 표시 미확인',files=files,source_url=sources[0],related_sources=sources)
  result.pop('failure_reason',None)
  forms=re.findall(r'별지\s*제?\s*([\d]+(?:호의[\d]+)?호?)\s*서식',texts[0][:1000])
  if forms:result['form_no']=evidence['instrument']+' 별지 제'+forms[0]+'서식'
  changes=re.findall(r'(?:개정|신설)\s*(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})',texts[0][:1000])
  if changes:result['revised_at']=changes[0][0]+'-'+changes[0][1].zfill(2)+'-'+changes[0][2].zfill(2)
  card=next(d for d in manifest['documents'] if d['id']==ident)
  card.update(status='확인 완료',source_type='원본',license=result['license'],editable=files[0]['local_url'],sourceUrl=result['source_url'],institution='국가법령정보센터',delivery='hosted',format='HWP',sizeLabel=str((files[0]['bytes']+1023)//1024)+' KB',checked_at=result['checked_at'],checkedOn=result['checked_at'][:10],form_no=result['form_no'],revised_at=result['revised_at'],downloaded_originals=files,verification='HTTP 200·HWP 파일 구조와 요청 서식의 본문 확인. 전체 인쇄 레이아웃은 별도 확인 필요.',description='기관 원본 파일을 변경 없이 제공합니다. 첨부 내 작성방법과 제출기관 요구사항을 확인하세요.')
  persist();print(ident,'원본 확보 완료',len(files),flush=True)
 except Exception as e:
  result['failure_reason']=str(e);persist();print(ident,'확인 중',str(e),flush=True)
summary=json.loads((DOC/'summary.json').read_text());done=[r['id'] for r in results if r['status']=='확인 완료'];summary.update(completed=len(done),unchecked=61-len(done),completed_ids=done,pending_ids=[r['id'] for r in results if r['status']!='확인 완료'],original_task_successes=[r['id'] for r in results if r['files']])
summary['original_required_pending']=[r['id'] for r in results if r['id'] in summary.get('original_required_pending',[]) and not r['files']]
(DOC/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n');print(json.dumps(summary,ensure_ascii=False),flush=True)
