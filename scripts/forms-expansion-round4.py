"""Inspect current public portals after the retired court URL failed; retain every failed state."""
from pathlib import Path
from urllib.parse import quote,urljoin
from concurrent.futures import ThreadPoolExecutor
import json,re,requests,copy
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
hp=Path(__file__).with_name('forms-expansion-collect.py');hs=hp.read_text()
exec(compile(hs.split('# These short Korean-law addresses')[0],str(hp),'exec'),globals())
DEST=OUT/'round4';DEST.mkdir(parents=True,exist_ok=True)

def read_page(url):
 try:
  r=http(url);r.encoding=r.apparent_encoding or 'utf-8';s=BeautifulSoup(r.text,'html.parser')
  d={'url':r.url,'http_status':200,'checked_at':now(),'sha256':digest(r.content),'text':s.get_text(' ',strip=True),'links':[{'text':a.get_text(' ',strip=True),'url':urljoin(r.url,a.get('href','')),'onclick':a.get('onclick')} for a in s.select('a[href]')],'forms':[{'action':urljoin(r.url,f.get('action','')),'method':f.get('method'),'inputs':[{'name':i.get('name'),'id':i.get('id'),'type':i.get('type'),'value':i.get('value')} for i in f.select('input,select')]} for f in s.select('form')]}
  save(DEST/('page-'+digest(url.encode())[:12]+'.json'),d);return d,None
 except Exception as e:return None,str(e)

# This exact source was already verified for the legacy gift-registration guide.
ident='P9-02';url='https://easylaw.go.kr/CSP/CnpClsMain.laf?ccfNo=3&cciNo=2&cnpClsNo=2&csmSeq=566&popMenu=ov'
if byid[ident]['status']!='확인 완료':
 d,e=read_page(url)
 if d and all(t in norm(d['text']) for t in ['증여계약서','검인']):
  byid[ident]['related_ids']=['BP-G-01','REG-G-01']
  complete(ident,url,{k:v for k,v in d.items() if k not in ('text','links','forms')},'법제처 찾기쉬운 생활법령정보',note='증여에 의한 부동산 소유권 이전등기의 제출서류 중 증여계약서 검인 절차를 안내합니다. 기존 부평구청 증여계약서와 함께 확인하세요.')
 else:fail(ident,e or '계약서 검인 안내 본문 미확인',url)

# Discovery follows actual anchors on the supplied official sites only.
roots=[('ksd','https://ta.ksd.or.kr/'),('nhis','https://www.nhis.or.kr/'),('renthome','https://www.renthome.go.kr/'),('military','https://www.mps.mil.kr/info/deceIncmAplcForm.do'),('knia','https://consumer.knia.or.kr/consumer/general-guide/0201.do'),('nts-vat','https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=2447&cntntsId=7780'),('taxagency','https://www.kacpta.or.kr/'),('comwel','https://www.comwel.or.kr/'),('tt','https://www.tt.go.kr/')]
with ThreadPoolExecutor(max_workers=5) as pool:root_reads=list(pool.map(lambda j:(j,*read_page(j[1])),roots))
for (key,url),d,e in root_reads:
 save(DEST/(key+'-root.json'),d or {'url':url,'error':e,'checked_at':now()})

with sync_playwright() as p:
 browser=p.chromium.launch();ctx=browser.new_context(locale='ko-KR',accept_downloads=True)
 ctx.set_default_timeout(5000)
 def snapshot(page,key,events):
  d={'url':page.url,'checked_at':now(),'events':events,'frames':[]}
  for fr in page.frames:
   fd={'url':fr.url}
   try:fd['text']=fr.locator('body').inner_text(timeout=1200)
   except Exception as e:fd['text_error']=str(e)[:300]
   try:fd['links']=fr.locator('a').evaluate_all('(xs)=>xs.map(a=>({text:a.textContent.trim(),url:a.href,onclick:a.getAttribute("onclick"),id:a.id}))')
   except Exception as e:fd['link_error']=str(e)[:300]
   try:fd['inputs']=fr.locator('input,select,button').evaluate_all('(xs)=>xs.map(a=>({tag:a.tagName,type:a.type,id:a.id,name:a.name,value:a.value,text:a.textContent,placeholder:a.placeholder,title:a.title}))')
   except Exception as e:fd['input_error']=str(e)[:300]
   d['frames'].append(fd)
  save(DEST/(key+'.json'),d);return d
 for key,url in [('court','https://ecfs.scourt.go.kr/psp/index.on?m=PSP720M24'),('iros','https://www.iros.go.kr/'),('taxforms','https://taxlaw.nts.go.kr/af/USEAFE001M.do'),('efamily','https://efamily.scourt.go.kr/cs/CsBltnWrtList.do?bltnbordId=0000005')]:
  page=ctx.new_page();events=[];errors=[]
  page.on('response',lambda r:events.append({'url':r.url,'status':r.status}) if r.request.resource_type in ('document','xhr','fetch') else None)
  page.on('pageerror',lambda e:errors.append(str(e)[:300]))
  try:
   page.goto(url,wait_until='commit',timeout=25000)
   for iteration in range(12):
    page.wait_for_timeout(3000)
    try:
     text=page.locator('body').inner_text(timeout=1000)
     controls=page.locator('input:visible,button:visible').count()
     if len(text)>500 and controls>2:break
    except Exception:pass
   snapshot(page,key+'-loaded',events)
   if key=='taxforms':
    inputs=page.get_by_placeholder('내용을 입력하세요',exact=True)
    if inputs.count():
     inputs.first.fill('평가');page.get_by_role('button',name='조회',exact=True).first.click();page.wait_for_timeout(2000)
    snapshot(page,'taxforms-search',events)
    candidates=page.locator('tr').filter(has_text='심의').all()
    for n,row in enumerate(candidates[:3]):
     try:
      a=row.locator('a').first
      if a.count():a.click();page.wait_for_timeout(1700);snapshot(page,'taxforms-detail-'+str(n),events)
     except Exception as e:errors.append(str(e)[:300])
   if key=='efamily':
    visible=page.locator('input[type="text"]:visible')
    if visible.count():
     visible.last.fill('사망');visible.last.press('Enter');page.wait_for_timeout(1700)
    d=snapshot(page,'efamily-search',events)
    alltext='\n'.join(x.get('text','') for x in d['frames'])
    if '사망신고서' in alltext and any(e['status']==200 for e in events):
     complete('P0-05',page.url,{'http_status':200,'checked_at':now(),'body_sha256':digest(alltext.encode()),'matched_title':'사망신고서'},'대법원 전자가족관계등록시스템',note='공식 양식 목록의 사망신고서를 확인했습니다. 기관 제공처에서 원본 및 작성 안내를 확인하세요.')
   if key=='court':
    visible=page.locator('input[type="text"]:visible')
    if visible.count():
     for query in ['상속','유언','기여분','유류분','특별대리인','친생자','인지청구','부재자','실종','한정승인']:
      visible=page.locator('input[type="text"]:visible')
      if not visible.count():break
      visible.last.fill(query);visible.last.press('Enter');page.wait_for_timeout(1700)
      snapshot(page,'court-query-'+query,events)
   if key=='iros':
    for label in ['고객센터','자료센터','등기신청양식']:
     candidates=page.get_by_text(label,exact=True)
     for a in candidates.all():
      try:
       if a.is_visible():a.click();page.wait_for_timeout(1700);break
      except Exception:pass
     snapshot(page,'iros-'+label,events)
   save(DEST/(key+'-errors.json'),errors)
  except Exception as e:save(DEST/(key+'-error.json'),{'url':url,'error':str(e),'events':events,'errors':errors})
  finally:page.close()
 # Read the exact public script/XML URLs observed above to identify replacement
 # form-search controls. No credentials, private endpoints or write actions.
 observed=[]
 for f in DEST.glob('*loaded.json'):
  for e in json.loads(f.read_text()).get('events',[]):
   u=e['url']
   if any(t in u for t in ['PSPLayoutDefault.xml','Pm10ComMenu.js','config.xml']):observed.append(u)
 for u in dict.fromkeys(observed):
  try:
   r=ctx.request.get(u,timeout=15000)
   if r.status==200:
    save(DEST/('public-source-'+digest(u.encode())[:12]+'.json'),{'url':u,'status':r.status,'text':r.text(),'checked_at':now()})
  except Exception:pass
 browser.close()
persist()
exec(compile('# Extend the catalog'+hs.split('# Extend the catalog',1)[1],str(hp),'exec'),globals())
