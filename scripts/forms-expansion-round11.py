"""Resume the existing backlog; verify real responses before checking each task.
Uses public pages only. No authentication, form recreation or production changes.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
import json,re
hp=Path(__file__).with_name('forms-expansion-collect.py');hs=hp.read_text()
exec(compile(hs.split('# These short Korean-law addresses')[0],str(hp),'exec'),globals())
DEST=OUT/'round11';DEST.mkdir(parents=True,exist_ok=True)
checkpoints.update(range(10,sum(r['status']=='확인 완료' for r in results)+1,10))
before=[r['id'] for r in results if r['status']=='확인 완료']

def read(label,url):
 try:
  r=http(url);r.encoding=r.apparent_encoding or 'utf-8';s=BeautifulSoup(r.text,'html.parser')
  d={'url':r.url,'http_status':200,'checked_at':now(),'sha256':digest(r.content),'text':s.get_text(' ',strip=True),'html':r.text,
   'links':[{'text':a.get_text(' ',strip=True),'url':urljoin(r.url,a.get('href','')),'onclick':a.get('onclick')} for a in s.select('a[href]')],
   'scripts':[{'url':urljoin(r.url,a.get('src','')) if a.get('src') else '', 'text':a.get_text()} for a in s.select('script')]}
  save(DEST/(label+'.json'),d);return d
 except Exception as e:save(DEST/(label+'-failure.json'),{'url':url,'checked_at':now(),'error':str(e)});return None

def evidence(d,label,terms):
 assert d and d.get('http_status')==200 and all(norm(t) in norm(d['text']) for t in terms)
 return {'url':d['url'],'http_status':200,'checked_at':d['checked_at'],'body_sha256':d['sha256'],'matched_terms':terms,'evidence_file':str((DEST/(label+'.json')).relative_to(ROOT))}

def finish(ident,d,label,terms,institution,note):
 if byid[ident]['status']=='확인 완료':return
 try:
  ev=evidence(d,label,terms)
  complete(ident,d['url'],ev,institution,note=note,license_text='공식 제공처 연결 · 원문 파일을 재배포하지 않음')
 except Exception as e:fail(ident,str(e),d.get('url') if d else None)

jobs=[
 ('nts','https://www.nts.go.kr/tax_inquiry/guide_01.html'),
 ('guardian','https://sladmin.scourt.go.kr/slfamily/civil_complaint/civil_06/index_03.html'),
 ('court-guide','https://www.scourt.go.kr/nm/min_3/min_3_10/min_3_10_3/index.html'),
 ('ef-death-guide','https://efamily.scourt.go.kr/cs/CsBltnWrtGuide.do?bltnbordId=0000008&guideCd=0000008006&guideYn=Y'),
 ('ef-family','https://efamily.scourt.go.kr/cs/CsBltnWrtGuide.do?bltnbordId=0000007&guideCd=0000007001&guideYn=Y'),
 ('ef-basic','https://efamily.scourt.go.kr/cs/CsBltnWrtGuide.do?bltnbordId=0000007&guideCd=0000007002&guideYn=Y'),
 ('ef-removed','https://efamily.scourt.go.kr/cs/CsBltnWrtGuide.do?bltnbordId=0000007&guideCd=0000007007&guideYn=Y'),
 ('life-consumer','https://consumer.insure.or.kr'),
 ('rehab-forms','https://slb.scourt.go.kr/rel/information/min/MinListAction.work'),
 ('nts-byl','https://www.nts.go.kr/nts/ad/nf/nltFormatApiList.do?mi=40178&searchSe=select&selectCode=type11'),
 ('law-valuation','https://www.law.go.kr/LSW/admRulLsInfoP.do?admRulSeq=2100000281898'),
 ('rent','https://www.renthome.go.kr/webportal/bbs/frmtDownload/frmtDownloadList.open')]
reads={key:d for key,d in ThreadPoolExecutor(max_workers=5).map(lambda j:(j[0],read(*j)),jobs)}
for ident,terms,note in [
 ('P2-14',['심사청구서','심판청구서','전체서식'],'국세청 세무조사 가이드북에 수록된 심사청구서와 심판청구서를 연결합니다. 요청한 조세심판원 게시물의 대체 공식 출처임을 구분합니다. 서로 다른 불복 절차의 제출기관과 대상 처분을 확인하세요. 기관의 전체 서식모음이며 개별 파일 재배포는 하지 않습니다.'),
 ('P3-04',['세무대리인 위임장','전체서식'],'국세청 세무조사 가이드북의 세무대리인 위임장입니다. 요청한 한국세무사회 서식 대신 확인한 국세청 공식 대체 자료이며 세무조사 관련 위임 범위에 관한 문서입니다. 일반 기장·신고 계약서로 확대하지 않습니다.')]:
 byid[ident]['alternative_official_source']=True
 finish(ident,reads['nts'],'nts',terms,'국세청',note)

# Inspect the original combined forms without changing or publicly rehosting it.
d=reads['nts']
if d:
 for a in d['links']:
  if '전체서식' in a['text'] and any(t in a['text'].upper() for t in ['PDF','HWP']):
   try:
    r=http(a['url']);ext,body=parse_binary(r.content)
    if not all(norm(t) in norm(body) for t in ['세무대리인위임장','심사청구서','심판청구서']):raise ValueError('요청 서식의 원본 본문 미확인')
    file=REVIEW/('NTS-combined-'+digest(r.content)[:12]+'.'+ext);file.write_bytes(r.content)
    save(DEST/('nts-original-'+ext+'.json'),{'url':r.url,'http_status':200,'sha256':digest(r.content),'bytes':len(r.content),'checked_at':now(),'artifact_path':'originals/'+file.name,'title_verified':True,'text_excerpt':body[:5000],'purpose':'기관 전체서식 원본 검수용, 공개 재배포하지 않음'})
   except Exception as e:save(DEST/('nts-original-failure-'+digest(a['url'].encode())[:8]+'.json'),{'url':a['url'],'error':str(e),'checked_at':now()})

family=[(reads['ef-family'],'ef-family',['가족관계증명서','상세']),(reads['ef-basic'],'ef-basic',['기본증명서','상세']),(reads['ef-removed'],'ef-removed',['제적'])]
if byid['P0-06']['status']!='확인 완료' and all(d and all(norm(t) in norm(d['text']) for t in ts) for d,k,ts in family):
 evs=[evidence(d,k,ts) for d,k,ts in family]
 byid['P0-06']['supplementary_sources']=evs
 complete('P0-06',family[0][0]['url'],evs[0],'대법원 전자가족관계등록시스템',note='가족관계증명서 상세, 기본증명서 상세, 제적 관련 발급 안내를 각각 확인했습니다. 실제 발급 과정에서 신청인 자격과 대상자를 확인하세요. 발급된 개인 증명서 파일을 수집하지 않습니다.')

# Search current law collections only through URLs returned by official pages.
for label,instrument,ident,groups in [
 ('law-rent','민간임대주택에관한특별법시행규칙','P9-07',[['임대사업자','지위','승계']]),
 ('law-industrial','산업재해보상보험법시행규칙','P7-04',[['유족','장례비','청구서'],['유족','장의비','청구서']])]:
 try:
  page=inspect_page('https://www.law.go.kr/법령/'+instrument);save(DEST/(label+'.json'),page)
  candidates=[a for a in page['links'] if any(all(norm(t) in norm(a['text']) for t in ts) for ts in groups)]
  for a in candidates:
   try:
    ts=next(ts for ts in groups if all(norm(t) in norm(a['text']) for t in ts))
    f,body=get_original(ident,a,ts,public=True)
    complete(ident,page['chain'][-1]['url'],{'http_status':200,'checked_at':now(),'matched_terms':ts,'evidence_file':str((DEST/(label+'.json')).relative_to(ROOT))},'국가법령정보센터',files=[f],note='현행 법령 페이지에서 실제 제공하는 별지서식을 내려받아 본문을 확인했습니다. 신청 대상과 제출기관을 원문에서 확인하세요.',form_no=f.get('form_no_excerpt'));break
   except Exception as e:fail(ident,str(e),a['url'])
 except Exception as e:fail(ident,str(e))

expr="({text:document.body?document.body.innerText:'',html:document.documentElement.outerHTML,links:Array.from(document.querySelectorAll('a')).map(a=>({text:a.innerText,url:a.href,onclick:a.getAttribute('onclick')})),inputs:Array.from(document.querySelectorAll('input,select,button')).map(e=>({tag:e.tagName,id:e.id,name:e.name,type:e.type,value:e.value,text:e.innerText,visible:!!e.getClientRects().length})),scripts:Array.from(document.scripts).map(s=>({url:s.src,text:s.src?'':s.textContent}))})"
with sync_playwright() as p:
 browser=p.chromium.launch();ctx=browser.new_context(locale='ko-KR',accept_downloads=True)
 for label,url,searches in [
  ('ksd','https://ta.ksd.or.kr/',['주식 찾기','현금배당금조회 신청','상속인 금융거래 조회','양식/서식']),
  ('life','https://consumer.insure.or.kr',['보험금 청구','보험금청구','사망보험금']),
  ('efamily','https://efamily.scourt.go.kr/cs/CsBltnWrtList.do?bltnbordId=0000005',[]),
  ('court','https://ecfs.scourt.go.kr/psp/index.on?m=PSP720M24',[]),
  ('iros','https://www.iros.go.kr/index.jsp',['고객센터','자료센터','등기신청양식']),
  ('valuation','https://www.law.go.kr/LSW/admRulLsInfoP.do?admRulSeq=2100000281898',[]),
  ('rent-guide','https://www.renthome.go.kr/webportal/bbs/frmtDownload/frmtDownloadList.open',['임대사업자 민원신청'])]:
  page=ctx.new_page();cdp=ctx.new_cdp_session(page);events=[];payloads=[];errors=[]
  def record(r):
   if r.request.resource_type in ('document','xhr','fetch'):
    ev={'url':r.url,'status':r.status,'method':r.request.method}
    if r.request.method=='POST':ev['post_data']=r.request.post_data
    events.append(ev)
    if r.status==200 and r.request.resource_type in ('xhr','fetch'):
     try:
      t=r.text()
      if len(t)<2000000:payloads.append({'url':r.url,'body':t,'sha256':digest(t.encode())})
     except Exception:pass
  page.on('response',record);page.on('pageerror',lambda e:errors.append(str(e)))
  def snap(name):
   value=cdp.send('Runtime.evaluate',{'expression':expr,'returnByValue':True}).get('result',{}).get('value',{})
   save(DEST/(name+'.json'),{'url':page.url,'checked_at':now(),'events':events,'dom':value,'payloads':payloads,'page_errors':errors});return value
  try:
   page.goto(url,wait_until='commit',timeout=20000);page.wait_for_timeout(9000);dom=snap(label+'-loaded')
   for term in searches:
    js="""(()=>{let es=Array.from(document.querySelectorAll('a,button,span')).filter(e=>e.getClientRects().length&&e.textContent.trim()===TERM);if(es[0]){es[0].click();return true}return false})()""".replace('TERM',json.dumps(term))
    res=cdp.send('Runtime.evaluate',{'expression':js,'returnByValue':True})
    if res.get('result',{}).get('value'):page.wait_for_timeout(3000);dom=snap(label+'-'+term.replace('/','-').replace(' ',''))
   if label=='efamily':
    for q in ['사망']:
     js="""(()=>{let es=Array.from(document.querySelectorAll('input[type=text],input[type=search]')).filter(e=>e.getClientRects().length);let e=es.at(-1);if(!e)return false;e.value=QUERY;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));e.focus();return true})()""".replace('QUERY',json.dumps(q))
     if cdp.send('Runtime.evaluate',{'expression':js,'returnByValue':True}).get('result',{}).get('value'):page.keyboard.press('Enter');page.wait_for_timeout(2200);dom=snap(label+'-death')
   if label=='court':
    for q in ['상속재산','유언집행자','기여','특별한정승인','상속회복','유류분']:
     js="""(()=>{let es=Array.from(document.querySelectorAll('input[type=text],input[type=search]')).filter(e=>e.getClientRects().length);let e=es.at(-1);if(!e)return false;e.value=QUERY;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));e.focus();return true})()""".replace('QUERY',json.dumps(q))
     if cdp.send('Runtime.evaluate',{'expression':js,'returnByValue':True}).get('result',{}).get('value'):page.keyboard.press('Enter');page.wait_for_timeout(1800);snap(label+'-'+q)
  except Exception as e:save(DEST/(label+'-browser-failure.json'),{'url':url,'checked_at':now(),'error':str(e),'events':events,'page_errors':errors})
  finally:page.close()
 browser.close()
persist()
exec(compile('# Extend the catalog'+hs.split('# Extend the catalog',1)[1],str(hp),'exec'),globals())
save(DEST/'batch-result.json',{'checked_at':now(),'newly_completed_ids':[r['id'] for r in results if r['status']=='확인 완료' and r['id'] not in before],'pending_ids':[r['id'] for r in results if r['status']!='확인 완료']})
