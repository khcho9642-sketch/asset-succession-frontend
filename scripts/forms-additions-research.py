"""Public-source inspection only. No inferred download IDs, no authenticated requests."""
import json, re, hashlib, time
from pathlib import Path
from urllib.parse import urljoin
from concurrent.futures import ThreadPoolExecutor
import requests
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.tmp/forms-additions-proof/research'
OUT.mkdir(parents=True,exist_ok=True)
# Stage 0 precedes source registration; legacy record values are never changed.
p=ROOT/'app/forms/FormsLibrary.tsx'
s=p.read_text()
needle='  originalCategory: string; catalogTitle: string; exampleVerification: string;'
replacement=needle+'\n  form_no?: string | null; revised_at?: string | null; deadline?: string | null;\n  deadline_basis?: string | null; source_type?: "원본" | "공식제공처"; checked_at?: string;\n  status?: "확인 완료" | "확인 중"; task_id?: string;'
if 'form_no?:' not in s:
    assert needle in s
    s=s.replace(needle,replacement,1)
    old='"공제·납부", "등기"]'
    assert old in s
    s=s.replace(old,'"공제·납부", "등기", "재산조회", "유언", "후견", "불복·정정"]',1)
    p.write_text(s)
(ROOT/'.tmp/forms-additions-proof/schema-stage0.tsx').write_text(s)
seeds=[
 ('P0-01','https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=17400000001'),
 ('P0-02-04','https://fine.fss.or.kr/fine/main/contents.do?menuNo=900208'),
 ('P0-05','https://efamily.scourt.go.kr/cs/CsBltnWrtList.do?bltnbordId=0000005'),
 ('P0-06','https://efamily.scourt.go.kr/'),
 ('P0-07-10','https://help.scourt.go.kr/nm/minwon/doc/DocListAction.work'),
 ('LAW','https://www.law.go.kr/lsBylSc.do'),
 ('IROS','https://www.iros.go.kr/'),
 ('NPS','https://www.nps.or.kr/jsppage/mobile/in/HG_4B0004_01.jsp?hrnkMenuId=MW_IN&menuId=MW_IN_06'),
 ('LAW-LOCAL','https://www.law.go.kr/LSW/lsInfoP.do?chrClsCd=010202&lsId=008334&lsiSeq=282705&urlMode=lsEfInfoR&viewCls=thdCmpNewScP'),
]
def fetch(item):
    key,url=item
    r0={'id':key,'requested_url':url,'checked_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
    try:
        r=requests.get(url,timeout=(10,25),headers={'User-Agent':'Mozilla/5.0 (compatible; public-form-reference-check/1.0)'})
        r0.update(status_code=r.status_code,url=r.url,content_type=r.headers.get('Content-Type',''),bytes=len(r.content),sha256=hashlib.sha256(r.content).hexdigest())
        if r.encoding in (None,'ISO-8859-1'): r.encoding=r.apparent_encoding
        html=r.text
        (OUT/f'{key}.html').write_text(html)
        soup=BeautifulSoup(html,'html.parser')
        for t in soup(['script','style']):t.decompose()
        text=soup.get_text(' ',strip=True)
        (OUT/f'{key}.txt').write_text(text)
        soup=BeautifulSoup(html,'html.parser')
        r0['title']=soup.title.get_text(strip=True) if soup.title else ''
        r0['links']=[{'text':a.get_text(' ',strip=True),'href':urljoin(r.url,a.get('href','')),'onclick':a.get('onclick')} for a in soup.select('a[href]')]
        r0['scripts']=[urljoin(r.url,a['src']) for a in soup.select('script[src]')]
        r0['forms']=[{'action':f.get('action'),'method':f.get('method'),'inputs':[{'name':x.get('name'),'value':x.get('value')} for x in f.select('input,select')]} for f in soup.select('form')]
        r0['text_excerpt']=text[:3000]
    except Exception as e:r0['error']=str(e)
    (OUT/f'{key}.json').write_text(json.dumps(r0,ensure_ascii=False,indent=2))
    print(key,r0.get('status_code'),r0.get('title'),r0.get('error'),flush=True)
    return r0
with ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(fetch,seeds))
(OUT/'index.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
