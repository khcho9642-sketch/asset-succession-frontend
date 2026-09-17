"""Collect real published links only. No guessed file identifiers or authentication."""
import concurrent.futures, hashlib, json, re, time
from pathlib import Path
from urllib.parse import urljoin, urlparse
import requests
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/forms-additions-61/discovery'
OUT.mkdir(parents=True,exist_ok=True)
SOURCES={
 'local-tax':'https://www.law.go.kr/lsInfoP.do?lsiSeq=287031',
 'national-tax':'https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=279429',
 'inheritance-tax':'https://www.law.go.kr/lsInfoP.do?joNo=001700&lsId=007388',
 'local-tax-benefits':'https://www.law.go.kr/LSW/nwRvsLsInfoR.do?lsiSeq=166412',
 'fss':'https://fine.fss.or.kr/fine/main/contents.do?menuNo=900208',
 'law-byl-js':'https://www.law.go.kr/LSW/js/byl/byl.js',
 'court-forms':'https://help.scourt.go.kr/nm/minwon/doc/DocListAction.work',
 'court-home':'https://www.scourt.go.kr/portal/main.jsp',
 'iros':'https://www.iros.go.kr/',
 'family':'https://efamily.scourt.go.kr/cs/CsBltnWrtList.do?bltnbordId=0000005',
 'pension':'https://www.nps.or.kr/jsppage/mobile/in/HG_4B0004_01.jsp?hrnkMenuId=MW_IN&menuId=MW_IN_06',
 'government-inheritance':'https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=17400000001',
 'guardian':'https://dgfamily.scourt.go.kr/slfamily/civil_complaint/civil_06/index_03.html',
 'family-guide':'https://efamily.scourt.go.kr/cs/CsBltnWrtGuide.do?bltnbordId=0000007&guideCd=0000007001&guideYn=Y',
 'basic-guide':'https://efamily.scourt.go.kr/cs/CsBltnWrtGuide.do?bltnbordId=0000007&guideCd=0000007002&guideYn=Y',
 'removed-guide':'https://efamily.scourt.go.kr/cs/CsBltnWrtGuide.do?bltnbordId=0000007&guideCd=0000007007&guideYn=Y',
 'death-guide':'https://efamily.scourt.go.kr/cs/CsBltnWrtGuide.do?bltnbordId=0000008&guideCd=0000008006&guideYn=Y',
}
TERMS=re.compile(r'flDownload|bylView|bylInfo|bylNo|bylSeq|bylCls|DocList|DocView|FileDown|fileDown|download|\ud559\ubc95|\uc11c\uc2dd|\uc0ac\ub9dd|\uc0c1\uc18d|\uac00\uc5c5|\uc704\uc784|\ub0a9\uc138\ub2f4\ubcf4|\uacbd\uc815|\uac10\uba74|\ucde8\ub4dd\uc138')
def inspect(pair):
 key,url=pair
 record={'key':key,'requested_url':url,'checked_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
 try:
  response=requests.get(url,timeout=(12,35),headers={'User-Agent':'Mozilla/5.0'})
  record.update(status=response.status_code,url=response.url,content_type=response.headers.get('Content-Type'),bytes=len(response.content),sha256=hashlib.sha256(response.content).hexdigest())
  if response.encoding in (None,'ISO-8859-1'):response.encoding=response.apparent_encoding
  html=response.text
  soup=BeautifulSoup(html,'html.parser')
  record['title']=soup.title.get_text(' ',strip=True) if soup.title else ''
  record['links']=[{'text':a.get_text(' ',strip=True)[:200],'href':urljoin(response.url,a.get('href','')),'onclick':a.get('onclick'),'outer':str(a)[:650]} for a in soup.select('a') if TERMS.search(str(a))][:450]
  record['scripts']=[urljoin(response.url,a['src']) for a in soup.select('script[src]')]
  record['forms']=[{'action':f.get('action'),'method':f.get('method'),'fields':[{'name':x.get('name'),'value':x.get('value')} for x in f.select('input,select')]} for f in soup.select('form')]
  record['download_fragments']=[html[max(0,m.start()-160):m.start()+400] for m in re.finditer(r'flDownload|bylInfoP|bylView|fncFileDown|fileDown',html)][:65]
  for tag in soup(['script','style']):tag.decompose()
  text=soup.get_text(' ',strip=True)
  record['text_excerpt']=text[:2500]
  record['relevant_text']=[text[max(0,m.start()-60):m.start()+200] for m in TERMS.finditer(text)][:60]
 except Exception as exc:record['error']=str(exc)
 (OUT/(key+'.json')).write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
 print(key,record.get('status'),record.get('title'),record.get('error'),flush=True)
 return {'key':key,'status':record.get('status'),'title':record.get('title'),'error':record.get('error')}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:summary=list(pool.map(inspect,SOURCES.items()))
(OUT/'index.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
