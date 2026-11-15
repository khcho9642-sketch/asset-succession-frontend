"""Verify observed official form downloads; keep unverified IROS replacements pending."""
from pathlib import Path
from urllib.parse import urljoin,urlparse
from concurrent.futures import ThreadPoolExecutor
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
import json,re
hp=Path(__file__).with_name('forms-expansion-collect.py');hs=hp.read_text()
exec(compile(hs.split('# These short Korean-law addresses')[0],str(hp),'exec'),globals())
DEST=OUT/'round13';DEST.mkdir(parents=True,exist_ok=True)
checkpoints.update(range(10,sum(r['status']=='확인 완료' for r in results)+1,10))
before=[r['id'] for r in results if r['status']=='확인 완료']
# These pages were followed from the user's official registration-guide navigation.
jobs=[
 ('P1-01','https://easylaw.go.kr/CSP/CnpClsMain.laf?ccfNo=3&cciNo=1&cnpClsNo=4&csmSeq=566&popMenu=ov',['소유권이전','매매']),
 ('P1-06','https://easylaw.go.kr/CSP/CnpClsMain.laf?ccfNo=3&cciNo=4&cnpClsNo=3&csmSeq=566&popMenu=ov',['소유권이전','공유물분할']),
 ('P1-07','https://easylaw.go.kr/CSP/CnpClsMain.laf?ccfNo=4&cciNo=2&cnpClsNo=3&csmSeq=566&popMenu=ov',['근저당권','설정','신청']),
 ('P1-08','https://easylaw.go.kr/CSP/CnpClsMain.laf?ccfNo=4&cciNo=4&cnpClsNo=3&csmSeq=566&popMenu=ov',['근저당권','말소','신청']),
 ('P1-09','https://easylaw.go.kr/CSP/CnpClsMain.laf?ccfNo=5&cciNo=2&cnpClsNo=3&csmSeq=566&popMenu=ov',['전세권','설정','신청']),
 ('P1-12','https://easylaw.go.kr/CSP/CnpClsMain.laf?ccfNo=9&cciNo=1&cnpClsNo=3&csmSeq=566&popMenu=ov',['소유권이전청구권','가등기','신청'])]
def read(j):
 ident,url,terms=j
 try:p=inspect_page(url);save(DEST/(ident+'-page.json'),p);return j,p,None
 except Exception as e:save(DEST/(ident+'-page-failure.json'),{'url':url,'error':str(e),'checked_at':now()});return j,None,str(e)
for (ident,url,terms),p,error in ThreadPoolExecutor(max_workers=3).map(read,jobs):
 if not p:fail(ident,error,url);continue
 # Download only links actually exposed on this page. Do not invent IROS file IDs.
 candidates=[a for a in p['links'] if any(t in a['url'].lower() for t in ['download','.hwp','.pdf','.doc']) and 'easylaw.go.kr' in urlparse(a['url']).netloc]
 save(DEST/(ident+'-download-candidates.json'),candidates)
 found=[]
 for a in candidates[:8]:
  try:
   f,body=get_original(ident,a,terms,public=False)
   found.append(f)
   if ident=='P1-01' and '구분건물' in norm(body):byid['P1-02']['alternative_candidate']={'source':url,'file':f,'note':'본문에 구분건물이 있지만 독립 신청양식 여부는 추가 확인 필요'}
   break
  except Exception as e:save(DEST/(ident+'-file-failure-'+digest(a['url'].encode())[:8]+'.json'),{'url':a['url'],'error':str(e),'checked_at':now()})
 if found:
  r=byid[ident];r['alternative_official_source']=True;r['requested_provider']='대한민국 법원 인터넷등기소';r['inspected_originals']=found
  ev={'url':p['chain'][0]['url'],'http_status':200,'checked_at':p['checked_at'],'matched_terms':terms,'evidence_file':str((DEST/(ident+'-page.json')).relative_to(ROOT)),'download_sha256':[f['sha256'] for f in found]}
  # New cards may use the verified alternative source; three existing REG links stay untouched.
  complete(ident,p['chain'][0]['url'],ev,'법제처 찾기쉬운 생활법령정보',note='인터넷등기소 작성방법을 참조하여 법제처 생활법령정보가 제공하는 해당 신청서와 작성 안내를 확인했습니다. 인터넷등기소의 개별 파일 직링크를 확보한 것으로 표기하지 않습니다. 실제 제공 파일의 제목·본문을 검사했으며 재배포 조건 미확인으로 기관 제공처에서 받도록 연결합니다. 제출 전 관할 등기소의 현행 요구사항을 확인하세요.',license_text='법제처 공식 제공처의 첨부 원본 확인 · 자체 재배포하지 않음')
 else:fail(ident,'공식 대체 안내는 확인했으나 요청 신청서 원본 본문 확인 실패',url)

# Inspect real JS handlers and bodies rather than checking a site's empty bootstrap response.
expr="({text:document.body?document.body.innerText:'',html:document.documentElement.outerHTML,links:Array.from(document.querySelectorAll('a')).map(a=>({text:a.innerText,url:a.href,onclick:a.getAttribute('onclick')})),inputs:Array.from(document.querySelectorAll('input,select,button')).map(e=>({tag:e.tagName,id:e.id,name:e.name,type:e.type,value:e.value,text:e.innerText,visible:!!e.getClientRects().length})),scripts:Array.from(document.scripts).map(s=>({url:s.src,text:s.src?'':s.textContent}))})"
with sync_playwright() as p:
 browser=p.chromium.launch();ctx=browser.new_context(locale='ko-KR',accept_downloads=True)
 for label,url in [('court','https://ecfs.scourt.go.kr/psp/index.on?m=PSP720M24'),('iros','https://www.iros.go.kr/index.jsp'),('taxforms','https://taxlaw.nts.go.kr/af/USEAFE001M.do'),('ksd','https://ta.ksd.or.kr/')]:
  page=ctx.new_page();cdp=ctx.new_cdp_session(page);events=[];payloads=[];errs=[]
  def record(r):
   if r.request.resource_type in ['document','xhr','fetch']:
    events.append({'url':r.url,'status':r.status,'method':r.request.method,'request_body':r.request.post_data if r.request.method=='POST' else None})
    if r.status==200 and r.request.resource_type in ['xhr','fetch']:
     try:
      t=r.text()
      if len(t)<2000000:payloads.append({'url':r.url,'body':t,'sha256':digest(t.encode())})
     except Exception:pass
  page.on('response',record);page.on('pageerror',lambda e:errs.append(str(e)))
  def snap(name):
   dom=cdp.send('Runtime.evaluate',{'expression':expr,'returnByValue':True}).get('result',{}).get('value',{})
   save(DEST/(name+'.json'),{'url':page.url,'checked_at':now(),'events':events,'dom':dom,'payloads':payloads,'page_errors':errs});return dom
  try:
   page.goto(url,wait_until='commit',timeout=22000)
   for step in range(15):
    page.wait_for_timeout(3000);dom=cdp.send('Runtime.evaluate',{'expression':expr,'returnByValue':True}).get('result',{}).get('value',{})
    if len(dom.get('text',''))>600 and len([x for x in dom.get('inputs',[]) if x['visible']])>=2:break
   dom=snap(label+'-loaded')
   if label=='ksd':
    js="(()=>{let a=Array.from(document.querySelectorAll('a')).find(a=>a.textContent.trim()==='양식/서식'&&a.getAttribute('href')?.startsWith('javascript:menuMove'));if(a){a.click();return true}return false})()"
    if cdp.send('Runtime.evaluate',{'expression':js,'returnByValue':True}).get('result',{}).get('value'):page.wait_for_timeout(7000);dom=snap(label+'-forms')
   if label=='iros':
    for title in ['고객센터','자료센터','등기신청양식']:
     js="(()=>{let a=Array.from(document.querySelectorAll('a,button,span')).find(a=>a.getClientRects().length&&a.textContent.trim()===TITLE);if(a){a.click();return true}return false})()".replace('TITLE',json.dumps(title))
     if cdp.send('Runtime.evaluate',{'expression':js,'returnByValue':True}).get('result',{}).get('value'):page.wait_for_timeout(3000);dom=snap(label+'-'+title)
   queries={'court':['한정승인','유언집행자','기여분','유류분','상속회복','상속재산','후견'], 'taxforms':['평가심의','기한후'], 'ksd':['상속'],'iros':['매매','상속','증여','신탁','근저당']}[label]
   for q in queries:
    js="""(()=>{let es=Array.from(document.querySelectorAll('input[type=text],input[type=search]')).filter(e=>e.getClientRects().length&&!e.disabled);let e=es.at(-1);if(!e)return false;let setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(e,QUERY);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));e.focus();return true})()""".replace('QUERY',json.dumps(q))
    if not cdp.send('Runtime.evaluate',{'expression':js,'returnByValue':True}).get('result',{}).get('value'):break
    page.keyboard.press('Enter');page.wait_for_timeout(2300);dom=snap(label+'-query-'+q)
    if label=='court':
     # Read content only; an exact result row is required and general navigation is excluded.
     main=dom.get('text','')
     exact=[('P0-09',['상속재산목록']),('P0-10',['특별한정승인']),('P1-16',['유언집행자선임']),('P1-19',['기여분결정']),('P1-20',['유류분반환청구']),('P8-02',['상속회복청구'])]
     for ident,terms in exact:
      if byid[ident]['status']=='확인 완료':continue
      # Query result tables must contain a named downloadable form, not a free-text help result.
      tableText=cdp.send('Runtime.evaluate',{'expression':"Array.from(document.querySelectorAll('tbody')).map(t=>t.innerText).join('\\n')",'returnByValue':True}).get('result',{}).get('value','')
      if all(norm(t) in norm(tableText) for t in terms) and ('청구' in tableText or '상속재산목록' in tableText) and any(e['status']==200 and 'selectNboardList' in e['url'] for e in events):
       complete(ident,url,{'url':url,'http_status':200,'checked_at':now(),'matched_terms':terms,'table_sha256':digest(tableText.encode()),'evidence_file':str((DEST/(label+'-query-'+q+'.json')).relative_to(ROOT))},'대한민국 법원 전자소송포털',note='공식 양식 목록의 해당 서식명을 확인했습니다. 기관의 양식모음에서 제목으로 찾아 원본을 받으세요. 개별 사건의 작성·제출 적합성은 별도로 확인하세요.',license_text='공식 제공처 연결 · 개별 첨부 재배포 조건 미확인')
   save(DEST/(label+'-finished.json'),{'checked_at':now(),'events_count':len(events),'page_errors':errs})
  except Exception as e:save(DEST/(label+'-failure.json'),{'url':url,'error':str(e),'checked_at':now(),'events':events,'page_errors':errs})
  finally:page.close()
 browser.close()
persist()
exec(compile('# Extend the catalog'+hs.split('# Extend the catalog',1)[1],str(hp),'exec'),globals())
save(DEST/'batch-result.json',{'newly_completed_ids':[r['id'] for r in results if r['status']=='확인 완료' and r['id'] not in before],'completed':sum(r['status']=='확인 완료' for r in results),'checked_at':now()})
