"""Resolve missing items from real search results and published links, with bounded retries."""
import hashlib,json,re,time
from pathlib import Path
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];DOC=ROOT/'docs/forms-additions-61';OUT=DOC/'resolution';OUT.mkdir(exist_ok=True)
QUERIES=[
 ('P0-14','지방세 감면 신청서','지방세특례제한법'),
 ('P0-16-a','유족연금 지급 청구서','국민연금법'),
 ('P0-16-b','반환일시금 지급 청구서','국민연금법'),
 ('P0-16-c','사망일시금 지급 청구서','국민연금법'),
 ('P1-24','이전등록 신청서','자동차등록규칙'),
 ('P2-03','주식등변동상황명세서','법인세법'),
 ('P2-08','납세담보 제공서','국세징수법'),
 ('P2-11','기한후과세표준신고서','국세'),
 ('P2-15','재산 평가심의위원회 심의신청서','상속'),
 ('P3-01','농지취득자격증명 신청서','농지법'),
 ('P3-02','부동산 거래계약 신고서','부동산 거래신고'),
]
records=[]
with sync_playwright() as p:
 browser=p.chromium.launch();context=browser.new_context(accept_downloads=True)
 for ident,query,instrument in QUERIES:
  out=OUT/(ident+'.json')
  if out.exists():continue
  page=context.new_page();record={'id':ident,'query':query,'instrument':instrument,'checked_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())};responses=[]
  page.on('response',lambda r:responses.append({'url':r.url,'status':r.status}) if any(w in r.url for w in ['Byl','byl','flDownload']) else None)
  try:
   response=page.goto('https://www.law.go.kr/lsBylSc.do',wait_until='domcontentloaded',timeout=30000);record['search_http_status']=response.status
   page.locator('#query').fill(query);page.locator('#query').press('Enter');page.wait_for_timeout(1800)
   record['search_url']=page.url
   candidates=page.locator('a[onclick*="bylViewWideAll"]')
   record['candidates']=candidates.evaluate_all('(xs)=>xs.map(x=>({text:x.textContent.trim(),onclick:x.getAttribute("onclick"),context:x.closest("li")?.innerText || x.parentElement?.innerText}))')
   chosen=None
   q=re.sub(r'\s+','',query)
   for index,a in enumerate(record['candidates']):
    t=re.sub(r'\s+','',a['text']);c=re.sub(r'\s+','',a.get('context') or '')
    if q in t and (re.sub(r'\s+','',instrument) in c or len(record['candidates'])==1):chosen=index;break
   if chosen is None:
    record['error']='공식 검색 결과에서 문서명과 소관 법령이 함께 일치하는 항목을 확인하지 못함'
   else:
    record['selected']=record['candidates'][chosen]
    candidates.nth(chosen).click(timeout=5000);page.wait_for_timeout(1800)
    targets=[page]+[x for x in context.pages if x!=page]
    record['pages']=[]
    for target in targets:
     try:
      links=target.locator('a[href]').evaluate_all('(xs)=>xs.map(x=>({text:x.textContent.trim(),href:x.href}))')
      body=target.locator('body').inner_text(timeout=5000)
      record['pages'].append({'url':target.url,'title':target.title(),'text_excerpt':body[:2500],'text_sha256':hashlib.sha256(body.encode()).hexdigest(),'links':[a for a in links if 'flDownload.do?' in a['href']]})
     except Exception as e:record.setdefault('page_errors',[]).append(str(e)[:200])
   record['responses']=responses[-30:]
  except Exception as e:record['error']=str(e)[:700]
  out.write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8');records.append({'id':ident,'error':record.get('error'),'pages':len(record.get('pages',[]))});print(json.dumps(records[-1],ensure_ascii=False),flush=True)
  for tab in context.pages:tab.close()
 browser.close()
# Read the complete official menus and their declared redirects; old help host is not rewritten.
seeds={
 'court':'https://www.scourt.go.kr/portal/main.jsp',
 'iros':'https://www.iros.go.kr/',
 'efamily':'https://efamily.scourt.go.kr/cs/CsBltnWrtList.do?bltnbordId=0000005',
 'will':'https://www.easylaw.go.kr/CSP/CnpClsMainBtr.laf?ccfNo=2&cciNo=1&cnpClsNo=1&csmSeq=234&menuType=prec&popMenu=ov',
 'notary':'https://www.moj.go.kr/moj/2303/subview.do',
 'tax-valuation':'https://nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7731',
 'tax-payment':'https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7719&mi=2325',
 'tribunal':'https://www.tt.go.kr/',
 'fss-license':'https://www.fss.or.kr/fss/main/contents.do?menuNo=200701',
}
for key,url in seeds.items():
 f=OUT/(key+'-navigation.json')
 if f.exists():continue
 d={'key':key,'requested_url':url}
 try:
  r=requests.get(url,timeout=(10,25));r.encoding=r.apparent_encoding;sp=BeautifulSoup(r.text,'html.parser')
  d.update(status=r.status_code,url=r.url,title=sp.title.get_text() if sp.title else '',body=sp.get_text(' ',strip=True)[-18000:],links=[{'text':a.get_text(' ',strip=True),'href':urljoin(r.url,a.get('href','')),'onclick':a.get('onclick')} for a in sp.select('a')],frames=[urljoin(r.url,x.get('src','')) for x in sp.select('frame,iframe')],scripts=[urljoin(r.url,x['src']) for x in sp.select('script[src]')],inline_scripts=[x.get_text()[:6000] for x in sp.select('script:not([src])')],forms=[{'action':urljoin(r.url,x.get('action','')),'method':x.get('method'),'inputs':[{'name':y.get('name'),'id':y.get('id'),'value':y.get('value')} for y in x.select('input,select')]} for x in sp.select('form')])
 except Exception as e:d['error']=str(e)
 f.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8');print(key,d.get('status'),d.get('error'),flush=True)
(OUT/'index.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
