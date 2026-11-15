"""Use live public form search controls and observed attachments, not guessed file IDs."""
from pathlib import Path
from urllib.parse import quote,urljoin,urlparse
import json,re,hashlib,requests
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
helper_path=Path(__file__).with_name('forms-expansion-collect.py')
helper_source=helper_path.read_text()
exec(compile(helper_source.split('# These short Korean-law addresses')[0],str(helper_path),'exec'),globals())
DEST=OUT/'round3';DEST.mkdir(parents=True,exist_ok=True)

def record_file(ident,b,url,title,terms,source):
 ext,body=parse_binary(b)
 if not all(norm(t) in norm(body) for t in terms):raise ValueError('원본 본문에 요청 서식명 불일치: '+','.join(terms))
 sha=digest(b);name=ident+'_'+sha[:12]+'.'+ext;dest=PUB/name;dest.write_bytes(b)
 f={'name':title,'url':url,'bytes':len(b),'sha256':sha,'format':ext,'role':'original','http_status':200,'checked_at':now(),'title_verified':True,'path':str(dest.relative_to(ROOT)),'local_url':'/downloads/official-forms/expansion/'+quote(name)}
 dates=re.findall(r'(?:개정|신설)\s*(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})',body[:4000])
 if dates:f['revised_at']='%04d-%02d-%02d'%tuple(map(int,dates[0]))
 save(DEST/(ident+'-'+sha[:12]+'.json'),{'file':f,'source':source,'text':body[:16000]})
 return f,body

# Busan's 2026-04-28 amended motor-vehicle form, discovered on its actual post.
if byid['P1-24']['status']!='확인 완료':
 source='https://www.busan.go.kr/car/crdocuments/1617333'
 try:
  r=http(source);r.encoding=r.apparent_encoding or 'utf-8';s=BeautifulSoup(r.text,'html.parser')
  choices=[a for a in s.select('a[href]') if '이전등록' in a.get_text() and '.hwp' in a.get_text().lower()]
  if not choices:raise ValueError('공식 게시물의 원본 HWP 링크 미확보')
  url=urljoin(r.url,choices[0]['href']);f,body=get_original('P1-24',{'url':url,'text':choices[0].get_text(' ',strip=True),'origin':source},['이전등록','신청서','상속'])
  byid['P1-24']['revised_at']=f.get('revised_at')
  complete('P1-24',source,{'http_status':200,'checked_at':now(),'post_sha256':digest(r.content),'form_sha256':f['sha256']},'부산광역시 차량등록사업소',[f],form_no='자동차등록규칙 별지 제14호서식',note='부산시가 2026-04-28 시행 개정서식으로 게시한 이전등록 신청서입니다. 상속 원인 항목을 포함한 원본 본문을 확인했습니다.')
 except Exception as e:fail('P1-24',str(e),source)

jobs=[
 ('P0-16','유족연금','국민연금법',['유족연금','청구서']),
 ('P0-16','반환일시금','국민연금법',['반환일시금','사망일시금','청구서']),
 ('P2-03','주식등변동상황','법인세법',['주식등변동상황명세서']),
 ('P2-08','납세담보','국세징수법',['납세담보','제공서']),
 ('P2-11','기한후','국세기본법',['기한후','과세표준','신고서']),
 ('P2-15','평가심의위원회','상속세',['평가','심의','신청서']),
 ('P3-01','농지취득자격증명','농지법',['농지취득자격증명','신청서']),
 ('P9-08','해외금융계좌','국제조세조정',['해외금융계좌','신고서']),
]
files_by_id={};ev_by_id={}
with sync_playwright() as p:
 browser=p.chromium.launch()
 ctx=browser.new_context(locale='ko-KR',accept_downloads=True)
 ctx.set_default_timeout(4500)
 for ident,query,instrument,terms in jobs:
  if byid[ident]['status']=='확인 완료':continue
  source='https://www.law.go.kr/lsBylSc.do?query='+quote(query)
  page=ctx.new_page();responses=[]
  page.on('response',lambda r:responses.append({'url':r.url,'status':r.status}) if r.request.resource_type in ('document','xhr','fetch') else None)
  try:
   response=page.goto(source,wait_until='domcontentloaded',timeout=22000)
   page.wait_for_timeout(1400)
   # txtSearch and #query are existing controls observed in the official source.
   if page.locator('#query').count():
    page.locator('#query').fill(query)
    page.evaluate("() => {if(typeof txtSearch === 'function') txtSearch();}")
   page.wait_for_timeout(1800)
   body=page.locator('body').inner_text()
   rows=page.locator('tr').all();matching=[]
   for row in rows:
    t=row.inner_text()
    if norm(instrument) in norm(t) and all(norm(v) in norm(t) for v in terms):matching.append(row)
   snapshot={'requested_url':source,'url':page.url,'checked_at':now(),'http_status':response.status if response else None,'text':body[:70000],'responses':responses,'rows':[row.inner_text() for row in matching], 'links':page.locator('a').evaluate_all('(xs)=>xs.map(a=>({text:a.textContent,url:a.href,onclick:a.getAttribute("onclick"),title:a.title,html:a.innerHTML}))')}
   save(DEST/(ident+'-'+query+'-search.json'),snapshot)
   if not response or response.status!=200:raise ValueError('법령 검색 최초 응답이 200이 아님')
   if not matching:raise ValueError('공식 검색 결과에 법령명과 요청 서식명 일치 없음')
   acquired=None
   for row in matching[:2]:
    anchors=row.locator('a').all()
    ranked=[]
    for a in anchors:
     markup=a.evaluate('(a)=>a.outerHTML');href=a.get_attribute('href') or ''
     if any(x in markup.lower() for x in ['hwp','한글','다운로드','download','fdown']):ranked.append((a,href,markup))
    for a,href,markup in ranked[:5]:
     try:
      if 'flDownload.do' in href:
       rr=ctx.request.get(urljoin(page.url,href),timeout=16000)
       if rr.status!=200:raise ValueError('첨부 HTTP '+str(rr.status))
       acquired=record_file(ident,rr.body(),rr.url,row.inner_text(),terms,source);break
      with page.expect_download(timeout=12000) as info:a.click(timeout=4000)
      dl=info.value;temp=DEST/(ident+'-download.tmp');dl.save_as(temp)
      download_res=ctx.request.get(dl.url,timeout=16000)
      if download_res.status!=200:raise ValueError('다운로드 URL HTTP '+str(download_res.status))
      if digest(download_res.body())!=digest(temp.read_bytes()):raise ValueError('브라우저 다운로드와 원본 재조회 바이트 불일치')
      acquired=record_file(ident,temp.read_bytes(),dl.url,dl.suggested_filename,terms,source);temp.unlink();break
     except Exception as exc:
      snapshot.setdefault('download_attempts',[]).append(str(exc)[:300])
    if acquired:break
   save(DEST/(ident+'-'+query+'-search.json'),snapshot)
   if not acquired:raise ValueError('일치하는 검색 행은 있으나 원본 다운로드를 확인하지 못함')
   f,body=acquired
   files_by_id.setdefault(ident,[]).append(f)
   ev_by_id.setdefault(ident,[]).append({'source':source,'http_status':200,'checked_at':now(),'body_sha256':digest(snapshot['text'].encode()),'binary_sha256':f['sha256']})
   if ident!='P0-16':
    byid[ident]['revised_at']=f.get('revised_at')
    complete(ident,source,ev_by_id[ident],'국가법령정보센터',files_by_id[ident],note='현행 별표·서식 검색 결과의 법령명과 서식명을 대조한 후 원본 파일 본문을 확인했습니다.')
  except Exception as e:fail(ident,'현행 법령 서식 검색: '+str(e)[:600],source)
  finally:page.close()
 if len(files_by_id.get('P0-16',[]))>=2:
  complete('P0-16',ev_by_id['P0-16'][0]['source'],ev_by_id['P0-16'],'국가법령정보센터',files_by_id['P0-16'],note='유족연금 청구서 및 반환일시금·사망일시금 청구서를 함께 확보했습니다. 지급 종류와 대상에 맞는 서식을 선택하세요.')
 # The courts' own portal now points its public forms menu to this replacement page.
 for key,url in [('court-current','https://ecfs.scourt.go.kr/psp/index.on?m=PSP720M24'),('nps-forms','https://www.nps.or.kr/pnsinfo/databbs/getOHAF0279M0List.do?menuId=MN24000998'),('iros','https://www.iros.go.kr/')]:
  page=ctx.new_page();net=[]
  page.on('response',lambda r:net.append({'url':r.url,'status':r.status}) if r.request.resource_type in ('document','xhr','fetch') else None)
  try:
   response=page.goto(url,wait_until='domcontentloaded',timeout=22000);page.wait_for_timeout(2800)
   data={'url':page.url,'http_status':response.status if response else None,'checked_at':now(),'responses':net,'frames':[]}
   for fr in page.frames:
    try:data['frames'].append({'url':fr.url,'text':fr.locator('body').inner_text(timeout=4000),'links':fr.locator('a').evaluate_all('(xs)=>xs.map(a=>({text:a.textContent,url:a.href,onclick:a.getAttribute("onclick")}))'),'inputs':fr.locator('input,select,button').evaluate_all('(xs)=>xs.map(x=>({tag:x.tagName,type:x.type,name:x.name,id:x.id,title:x.title,placeholder:x.placeholder,value:x.value,text:x.textContent}))')})
    except Exception:pass
   save(DEST/(key+'.json'),data)
  except Exception as e:save(DEST/(key+'.json'),{'url':url,'error':str(e),'responses':net,'checked_at':now()})
  page.close()
 browser.close()
persist()
exec(compile('# Extend the catalog'+helper_source.split('# Extend the catalog',1)[1],str(helper_path),'exec'),globals())
