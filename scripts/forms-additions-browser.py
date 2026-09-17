"""Read rendered public form menus; do not construct attachment identifiers."""
import json, re, hashlib, time
from pathlib import Path
from urllib.parse import urljoin
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/forms-additions-61/browser'
OUT.mkdir(parents=True,exist_ok=True)
sources={
 'local-tax':'https://www.law.go.kr/lsInfoP.do?lsiSeq=287031',
 'national-tax':'https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=279429',
 'inheritance-tax':'https://www.law.go.kr/lsInfoP.do?joNo=001700&lsId=007388',
 'tax-special':'https://www.law.go.kr/lsInfoP.do?lsiSeq=286381&viewCls=lsRvsDocInfoR',
 'vat':'https://www.law.go.kr/LSW/lsInfoP.do?ancYnChk=0&chrClsCd=010202&efYd=20260320&lsiSeq=284995&urlMode=lsInfoP',
 'local-benefit-search':'https://www.law.go.kr/lsBylSc.do',
 'court-home':'https://www.scourt.go.kr/portal/main.jsp',
 'guardian':'https://dgfamily.scourt.go.kr/slfamily/civil_complaint/civil_06/index_03.html',
 'iros':'https://www.iros.go.kr/',
 'family':'https://efamily.scourt.go.kr/cs/CsBltnWrtList.do?bltnbordId=0000005',
}
summary=[]
with sync_playwright() as p:
 browser=p.chromium.launch()
 context=browser.new_context(accept_downloads=True)
 for key,url in sources.items():
  page=context.new_page()
  record={'key':key,'source':url,'checked_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
  responses=[]
  page.on('response',lambda r:responses.append({'url':r.url,'status':r.status}) if any(x in r.url for x in ('byl','Byl','Doc','doc','Bltn','Bbs','Menu','menu','flDownload')) else None)
  try:
   response=page.goto(url,wait_until='domcontentloaded',timeout=45000)
   record['http_status']=response.status if response else None
   page.wait_for_timeout(2000)
   if 'law.go.kr' in url and key!='local-benefit-search':
    for selector in ('#bylView','a[onclick*="liBgcolorSpanByJi"]'):
     try:
      page.locator(selector).first.click(timeout=5000)
      page.wait_for_timeout(1500)
      record.setdefault('clicked',[]).append(selector)
     except Exception as e:record.setdefault('click_failures',[]).append(str(e)[:180])
   if key=='family':
    record['inputs']=page.locator('input,select').evaluate_all('(xs)=>xs.map(x=>({tag:x.tagName,id:x.id,name:x.name,title:x.title,placeholder:x.placeholder,type:x.type}))')
   if key=='local-benefit-search':
    record['inputs']=page.locator('input,select').evaluate_all('(xs)=>xs.map(x=>({tag:x.tagName,id:x.id,name:x.name,title:x.title,placeholder:x.placeholder,type:x.type}))')
   record['url']=page.url
   record['title']=page.title()
   links=page.locator('a').evaluate_all('(xs)=>xs.map(x=>({text:x.textContent.trim(),href:x.getAttribute("href"),onclick:x.getAttribute("onclick"),title:x.title}))')
   pattern=re.compile(r'서식|양식|취득|청구|신청|가업|납세|주식|사망|상속|위임|유언|후견|download|flDownload|fileDown|DocList|ecfs|자료|분할|변동',re.I)
   record['links']=[{**x,'href':urljoin(page.url,x['href'] or '')} for x in links if pattern.search(json.dumps(x,ensure_ascii=False))]
   text=page.locator('body').inner_text()
   record['text_sha256']=hashlib.sha256(text.encode()).hexdigest()
   record['text_excerpt']=text[:1400]
   record['responses']=responses[-80:]
   record['frames']=[{'name':f.name,'url':f.url} for f in page.frames]
  except Exception as e:record['error']=str(e)[:800]
  (OUT/(key+'.json')).write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
  summary.append({'key':key,'status':record.get('http_status'),'title':record.get('title'),'links':len(record.get('links',[])),'error':record.get('error')})
  print(json.dumps(summary[-1],ensure_ascii=False),flush=True)
  page.close()
 browser.close()
(OUT/'index.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
