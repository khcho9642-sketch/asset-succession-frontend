"""Incremental public-source verification. Never erase a validated original after a failed recheck."""
import concurrent.futures,hashlib,io,json,re,struct,time,zipfile,zlib
from pathlib import Path
from urllib.parse import quote,urljoin,urlparse
import requests,olefile
from bs4 import BeautifulSoup
from pypdf import PdfReader
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];DOC=ROOT/'docs/forms-additions-61';OUT=DOC/'deep';OUT.mkdir(exist_ok=True)
MP=ROOT/'public/downloads/official-forms/manifest.json';manifest=json.loads(MP.read_text());results=json.loads((DOC/'results.json').read_text());records={r['id']:r for r in results};cards={r['id']:r for r in manifest['documents']};tasks=ROOT/'tasks.md'
PUB=ROOT/'public/downloads/official-forms/additions';PUB.mkdir(exist_ok=True);PRIVATE=ROOT/'.tmp/forms-additions-proof/downloaded-originals';PRIVATE.mkdir(parents=True,exist_ok=True)
required=set(re.findall(r'^- \[[ x]\] (P[0-3]-\d\d) .*\[원본\]',tasks.read_text(),re.M))
def now():return time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
def norm(t):return re.sub(r'[^가-힣A-Za-z0-9]','',t)
def persist():
 manifest['additionRequests']=results;manifest['publishedCount']=len(manifest['documents']);manifest['additionCount']=58
 manifest['deliveryCounts']={k:sum(d.get('delivery')==k for d in manifest['documents']) for k in ['hosted','provider','pending']}
 MP.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
 (DOC/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
 text=tasks.read_text()
 for r in results:text=re.sub(r'^- \[[ x]\] '+r['id']+' ',f'- [{"x" if r["status"]=="확인 완료" else " "}] '+r['id']+' ',text,flags=re.M)
 done=[r['id'] for r in results if r['status']=='확인 완료'];text=re.sub(r'\n## 최근 실행 집계[\s\S]*$','',text);text+=f'\n## 최근 실행 집계\n확인 완료 {len(done)}/61 · 미체크 {61-len(done)}. 원본 필수 {len(required)}개 작업. 58개 신규 카드와 기존 출처 교체 3개 작업을 구분합니다.\n';tasks.write_text(text)
 summary={'requested_tasks':61,'new_cards':58,'source_update_tasks':3,'legacy_records':74,'manifest_cards':len(manifest['documents']),'completed':len(done),'unchecked':61-len(done),'completed_ids':done,'pending_ids':[r['id'] for r in results if r['status']!='확인 완료'],'original_task_successes':[r['id'] for r in results if r['files']],'original_required_pending':[r['id'] for r in results if r['id'] in required and not r['files']]}
 (DOC/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
 if len(done)>0 and len(done)%10==0:
  checkpoint={'progress':len(done),'total':61,'completed_ids':done};(DOC/f'checkpoint-{len(done):02d}.json').write_text(json.dumps(checkpoint,ensure_ascii=False,indent=2)+'\n');print(json.dumps(checkpoint,ensure_ascii=False),flush=True)
def fail(ident,reason,url=None):
 r=records[ident];r.setdefault('attempts',[]).append({'checked_at':now(),'url':url,'result':reason})
 if r['status']!='확인 완료':r['failure_reason']=reason;cards.get(ident,{}).update(verification=reason)
 persist()
def finish(ident,url,institution,terms,text,evidence,form_no=None,files=None,note=None):
 r=records[ident]
 if r['status']=='확인 완료':return
 if not all(norm(term) in norm(text) for term in terms):return fail(ident,'본문에서 요청한 문서명·내용을 확인하지 못했습니다.',url)
 if ident in required and not files:return fail(ident,'공식 제공 안내는 확인했으나 필수 원본 파일을 확보하지 못했습니다.',url)
 r.update(status='확인 완료',source_url=url,checked_at=now(),source_type='원본' if files else '공식제공처',license='법령 별지서식 원문·공공누리 유형 표시 미확인' if files else '공식 제공처 링크·재배포 없음',files=files or [],form_no=form_no or r.get('form_no'),source_evidence=evidence);r.pop('failure_reason',None)
 if note:r['note']=note
 if r['operation']=='source_url_update':
  target=cards[r['target_id']];target['sourceUrl']=url
 else:
  card=cards[ident];file=files[0] if files else None
  card.update(status='확인 완료',source_type=r['source_type'],license=r['license'],sourceUrl=url,checked_at=r['checked_at'],checkedOn=r['checked_at'][:10],institution=institution,delivery='hosted' if file and file.get('local_url') else 'provider',editable=file.get('local_url',file['url']) if file else url,format=file['format'].upper() if file else '공식 안내',sizeLabel=f'{(file["bytes"]+1023)//1024} KB' if file else '기관 제공처',form_no=r['form_no'],description=note or '공식 원문과 제공 서식에서 작성방법·제출자료를 확인하세요.',verification='HTTP 200 및 요청 문서의 존재를 확인했습니다. 확인 범위는 자료 정보에서 확인하세요.',downloaded_originals=r['files'],source_evidence=evidence)
 persist();print(ident,'확인 완료',url,flush=True)
def fetch(url):
 try:
  response=requests.get(url,timeout=(7,14),headers={'User-Agent':'Mozilla/5.0'})
  response.encoding=response.apparent_encoding
  soup=BeautifulSoup(response.text,'html.parser')
  evidence={'url':response.url,'requested_url':url,'checked_at':now(),'http_status':response.status_code,'sha256':hashlib.sha256(response.content).hexdigest(),'title':soup.title.get_text(' ',strip=True) if soup.title else ''}
  return response,soup,evidence
 except Exception as e:return None,None,{'url':url,'checked_at':now(),'error':str(e)}
def binary(data):
 if data.startswith(b'%PDF-'):return 'pdf','\n'.join(p.extract_text() or '' for p in PdfReader(io.BytesIO(data)).pages)
 if data.startswith(b'PK'):
  with zipfile.ZipFile(io.BytesIO(data)) as z:
   sections=[n for n in z.namelist() if n.startswith('Contents/section') and n.endswith('.xml')]
   if sections:return 'hwpx','\n'.join(BeautifulSoup(z.read(n),'xml').get_text(' ') for n in sections)
 if data.startswith(b'\xd0\xcf\x11\xe0'):
  with olefile.OleFileIO(io.BytesIO(data)) as f:
   h=f.openstream('FileHeader').read();assert h.startswith(b'HWP Document File');compressed=bool(struct.unpack_from('<I',h,36)[0]&1);parts=[]
   for n in f.listdir():
    if len(n)==2 and n[0]=='BodyText':
     b=f.openstream(n).read();b=zlib.decompress(b,-15) if compressed else b;pos=0
     while pos+4<=len(b):
      header=struct.unpack_from('<I',b,pos)[0];pos+=4;size=header>>20
      if size==4095:size=struct.unpack_from('<I',b,pos)[0];pos+=4
      if header&1023==67:parts.append(b[pos:pos+size].decode('utf-16le',errors='ignore'))
      pos+=size
   return 'hwp','\n'.join(parts)
 raise ValueError('HWP/HWPX/PDF 원본 형식이 아닙니다.')
def download(ident,url,terms,public=False):
 r=requests.get(url,timeout=(8,20),headers={'User-Agent':'Mozilla/5.0'})
 if r.status_code!=200:raise ValueError('첨부파일 HTTP '+str(r.status_code))
 ext,text=binary(r.content)
 if not all(norm(t) in norm(text) for t in terms):raise ValueError('원본 본문과 요청 문서가 일치하지 않습니다.')
 name=ident+'_'+hashlib.sha256(r.content).hexdigest()[:10]+'.'+ext;dest=(PUB if public else PRIVATE)/name;dest.write_bytes(r.content)
 f={'url':url,'bytes':len(r.content),'sha256':hashlib.sha256(r.content).hexdigest(),'format':ext,'http_status':200,'title_verified':True,'checked_at':now()}
 if public:f.update(path=str(dest.relative_to(ROOT)),local_url='/downloads/official-forms/additions/'+quote(name))
 else:f['artifact_path']='downloaded-originals/'+name
 return f,text
# Exact separately discovered official guidance URLs.
guides=json.loads((DOC/'guide-sources.json').read_text())
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 fetched=list(pool.map(lambda item:(item,fetch(item[1]['url'])),guides.items()))
for (ident,guide),(response,soup,ev) in fetched:
 (OUT/(ident+'-guide.json')).write_text(json.dumps(ev,ensure_ascii=False,indent=2))
 if response is None or response.status_code!=200:fail(ident,ev.get('error','HTTP '+str(ev.get('http_status'))),guide['url']);continue
 text=soup.get_text(' ',strip=True)
 # Attachment filename can be an HTML attribute rather than body text.
 proof=text+' '+str(soup)
 finish(ident,guide['url'],guide['institution'],guide['terms'],proof,ev,note=guide.get('note'))
 if records[ident]['status']=='확인 완료':
  records[ident]['related_sources']=guide.get('related_sources',[]);persist()
# Short, legitimate HTTP checks; do not keep timing out on the same host indefinitely.
roots={
 'law':'https://www.law.go.kr/lsBylSc.do',
 'court':'https://www.scourt.go.kr/portal/main.jsp',
 'iros':'https://www.iros.go.kr/',
 'family':'https://efamily.scourt.go.kr/cs/CsBltnWrtList.do?bltnbordId=0000005',
 'tribunal':'https://www.tt.go.kr/',
 'legal-aid':'https://www.klac.or.kr/pil/klac-format',
 'nts-valuation':'https://www.nts.go.kr/nts/na/ntt/selectNttList.do?bbsId=30023&mi=2346',
}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:root_results=dict(pool.map(lambda pair:(pair[0],fetch(pair[1])),roots.items()))
for key,(response,soup,ev) in root_results.items():
 if soup is not None:
  ev.update(links=[{'text':a.get_text(' ',strip=True),'href':urljoin(response.url,a.get('href','')),'onclick':a.get('onclick')} for a in soup.select('a')],forms=[{'action':urljoin(response.url,f.get('action','')),'method':f.get('method'),'fields':[{'name':x.get('name'),'id':x.get('id'),'type':x.get('type'),'value':x.get('value'),'options':[{'value':o.get('value'),'text':o.get_text()} for o in x.select('option')]} for x in f.select('input,select')]} for f in soup.select('form')],frames=[urljoin(response.url,x.get('src','')) for x in soup.select('frame,iframe')],scripts=[urljoin(response.url,x['src']) for x in soup.select('script[src]')],inline_scripts=[x.get_text()[:9000] for x in soup.select('script:not([src])')],text=soup.get_text(' ',strip=True)[-12000:])
 (OUT/(key+'-root.json')).write_text(json.dumps(ev,ensure_ascii=False,indent=2))
# Query actual law UI and click the observed form listing; arbitrary file IDs are never used.
queries=[('P0-14','지방세 감면 신청서','지방세특례제한법'),('P0-16-a','유족연금','국민연금법'),('P0-16-b','반환일시금','국민연금법'),('P0-16-c','사망일시금','국민연금법'),('P1-24','이전등록 신청서','자동차등록규칙'),('P2-03','주식등변동상황명세서','법인세법'),('P2-08','납세담보 제공서','국세징수법'),('P2-11','기한후','국세'),('P3-01','농지취득자격증명','농지법'),('P3-02','부동산 거래계약 신고서','부동산 거래신고')]
with sync_playwright() as p:
 browser=p.chromium.launch();ctx=browser.new_context(accept_downloads=True);ctx.set_default_timeout(6500)
 if root_results['law'][0] is not None and root_results['law'][0].status_code==200:
  page=ctx.new_page();network=[];page.on('response',lambda r:network.append({'url':r.url,'status':r.status}) if any(s in r.url for s in ['Byl','byl','flDownload']) else None)
  for key,query,instrument in queries:
   ident=key[:5] if key.startswith('P0-16') else key
   if records[ident]['status']=='확인 완료':continue
   ev={'id':key,'query':query,'instrument':instrument,'checked_at':now()}
   try:
    response=page.goto(roots['law'],wait_until='commit',timeout=18000);page.locator('#query').fill(query);page.locator('#query').press('Enter');page.wait_for_timeout(1400)
    # Both official narrow and wide list modes are supported.
    matches=page.locator('a[onclick*="bylViewAll"],a[onclick*="bylViewWideAll"]')
    candidates=matches.evaluate_all('(xs)=>xs.map(x=>({text:x.textContent.trim(),onclick:x.getAttribute("onclick"),context:x.closest("li")?.innerText || x.parentElement?.innerText}))')
    ev.update(http_status=response.status if response else None,candidates=candidates)
    selected=None
    for index,c in enumerate(candidates):
     if norm(query) in norm(c['text']) and (norm(instrument) in norm(c.get('context','')) or len(candidates)==1):selected=index;break
    if selected is None:raise ValueError('公式検索結果に対象書式名と法令名の一致なし')
    ev['selected']=candidates[selected];matches.nth(selected).click();page.wait_for_timeout(1200)
    ev['responses']=network[-20:]
    download_choices=[]
    for tab in ctx.pages:
     for frame in tab.frames:
      try:
       for a in frame.locator('a[href*="flDownload.do"]').evaluate_all('(xs)=>xs.map(x=>({text:x.textContent.trim(),href:x.href}))'):
        if '.hwp' in a['text'].lower() or '.pdf' in a['text'].lower():download_choices.append({**a,'page':frame.url})
      except Exception:pass
    ev['downloads']=download_choices
    chosen=next((a for a in download_choices if norm(query) in norm(a['text'])),None)
    if chosen is None:raise ValueError('요청 서식의 실제 파일 주소를 확인하지 못했습니다.')
    file,text=download(key,chosen['href'],[query],public=True)
    ev['file']=file
    if ident=='P0-16':
     records[ident].setdefault('partial_files',[]).append(file)
     if len({f['sha256'] for f in records[ident]['partial_files']})>=2 and key=='P0-16-c':finish(ident,chosen['page'],'국가법령정보센터',['청구'],text,ev,files=records[ident]['partial_files'],note='유족연금·반환일시금·사망일시금의 해당 청구서 원본을 구분해 사용하세요.')
    else:finish(ident,chosen['page'],'국가법령정보센터',[query],text,ev,files=[file])
   except Exception as e:ev['error']=str(e);fail(ident,str(e),roots['law'])
   (OUT/(key+'-law.json')).write_text(json.dumps(ev,ensure_ascii=False,indent=2));print(key,ev.get('error','검증 성공'),flush=True)
   for tab in ctx.pages:
    if tab!=page:tab.close()
  page.close()
 else:
  for key,q,l in queries:fail(key[:5] if key.startswith('P0-16') else key,'공식 별표·서식 검색 접속 실패: '+str(root_results['law'][2].get('error',root_results['law'][2].get('http_status'))),roots['law'])
 # Discover real menus on available court, registry, legal-aid and official forms pages.
 for key in ['court','iros','family','tribunal','legal-aid','nts-valuation']:
  response,soup,ev0=root_results[key]
  if response is None or response.status_code!=200:continue
  page=ctx.new_page();ev={'key':key,'checked_at':now(),'http_status':response.status_code,'source':roots[key]};responses=[]
  page.on('response',lambda r:responses.append({'url':r.url,'status':r.status}) if any(t in r.url.lower() for t in ['doc','form','bltn','bbs','down','menu','search','ntt']) else None)
  try:
   page.goto(roots[key],wait_until='commit',timeout=18000)
   page.wait_for_timeout(1200)
   if key=='family':
    field=page.locator('input[name="srchKeywd"]');field.fill('사망');field.press('Enter');page.wait_for_timeout(1200)
   if key=='nts-valuation':
    link=page.get_by_text('재산의 매매 등 가액의 시가인정 심의 신청서',exact=False).first
    link.click();page.wait_for_timeout(1200)
   # Open only observed menu labels, never manufacture a document path.
   if key in ['court','iros','tribunal','legal-aid']:
    words={'court':['양식','전자민원','전자소송'],'iros':['등기신청양식','자료센터','고객센터'],'tribunal':['서식','심판청구서'],'legal-aid':['증여']}[key]
    for word in words:
     candidate=page.get_by_role('link').filter(has_text=word)
     if candidate.count():
      try:candidate.first.click(timeout=3500);page.wait_for_timeout(700)
      except Exception:pass
      break
   ev['pages']=[]
   for tab in ctx.pages:
    for frame in tab.frames:
     try:
      body=frame.locator('body').inner_text(timeout=4000)
      links=frame.locator('a').evaluate_all('(xs)=>xs.map(x=>({text:x.textContent.trim(),href:x.getAttribute("href"),onclick:x.getAttribute("onclick")}))')
      inputs=frame.locator('input,select').evaluate_all('(xs)=>xs.map(x=>({name:x.name,id:x.id,type:x.type,placeholder:x.placeholder,title:x.title,options:x.options?Array.from(x.options).map(o=>({value:o.value,text:o.text})):[]}))')
      ev['pages'].append({'url':frame.url,'body':body[-18000:],'links':links,'inputs':inputs})
     except Exception as e:ev.setdefault('errors',[]).append(str(e)[:200])
   ev['responses']=responses[-70:]
  except Exception as e:ev['error']=str(e)
  (OUT/(key+'-browser.json')).write_text(json.dumps(ev,ensure_ascii=False,indent=2));print(key,ev.get('error','접속'),flush=True)
  for tab in ctx.pages:tab.close()
 browser.close()
# Keep individual unresolved source attempts traceable; do not fill missing URLs with homepages.
for r in results:
 if r['status']=='확인 완료':continue
 ident=r['id']
 key='iros' if ident.startswith('P1-') and int(ident[3:])<=13 else 'court' if ident in ['P0-07','P0-08','P0-09','P0-10','P1-15','P1-16','P1-18','P1-19','P1-20','P1-21','P1-22','P1-23'] else 'family' if ident in ['P0-05','P0-06'] else 'tribunal' if ident=='P2-14' else 'legal-aid' if ident=='P3-05' else 'nts-valuation' if ident=='P2-15' else None
 if key:
  root_ev=root_results[key][2]
  reason='공식 메뉴 접속은 확인했으나 해당 개별 서식의 존재·파일을 아직 검증하지 못했습니다.' if root_ev.get('http_status')==200 else '공식 제공처 접속 실패: '+str(root_ev.get('error',root_ev.get('http_status')))
  fail(ident,reason,roots[key])
persist();print((DOC/'summary.json').read_text(),flush=True)
