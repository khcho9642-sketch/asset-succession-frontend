"""Complete only evidence-backed backlog records and continue original acquisition."""
from pathlib import Path
from urllib.parse import urljoin
from concurrent.futures import ThreadPoolExecutor
import json,re
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
hp=Path(__file__).with_name('forms-expansion-collect.py');hs=hp.read_text()
exec(compile(hs.split('# These short Korean-law addresses')[0],str(hp),'exec'),globals())
DEST=OUT/'round12';DEST.mkdir(parents=True,exist_ok=True)
checkpoints.update(range(10,sum(r['status']=='확인 완료' for r in results)+1,10))
before=[r['id'] for r in results if r['status']=='확인 완료']

def embedded_guide(label,terms):
 p=OUT/'round11'/(label+'.json');d=json.loads(p.read_text());assert d['http_status']==200
 fragments=[]
 for s in d['scripts']:
  for m in re.finditer(r'\$\("#contentSpan"\)\.html\(("(?:[^"\\]|\\.)*")\)',s.get('text','')):
   fragments.append(json.loads(m.group(1)))
 text=BeautifulSoup('\n'.join(fragments),'html.parser').get_text(' ',strip=True)
 assert fragments and all(norm(t) in norm(text) for t in terms),(label,text[:500])
 proof={'url':d['url'],'http_status':200,'checked_at':d['checked_at'],'response_sha256':d['sha256'],'verified_terms':terms,'content_text':text,'extraction':'JSON string literal supplied by the official page for #contentSpan; no generated content','evidence_file':str(p.relative_to(ROOT))}
 save(DEST/(label+'-content.json'),proof);return d,proof

try:
 sources=[]
 for label,terms in [('ef-family',['가족관계증명서','상세','발급']),('ef-basic',['기본증명서','상세','발급']),('ef-removed',['제적','등본','발급'])]:
  d,ev=embedded_guide(label,terms);sources.append(ev)
 if byid['P0-06']['status']!='확인 완료':
  byid['P0-06']['supplementary_sources']=sources
  complete('P0-06',sources[0]['url'],sources[0],'대법원 전자가족관계등록시스템',note='가족관계증명서 상세, 기본증명서 상세, 제적등본의 기재사항·발급방법을 각 공식 안내에서 확인했습니다. 신청 자격과 제출기관이 요구하는 증명서 유형을 확인하여 발급하세요. 실제 개인 증명서는 수집하지 않았습니다.')
except Exception as e:fail('P0-06',str(e))
try:
 d,ev=embedded_guide('ef-death-guide',['사망신고서','사망사실을 안 날부터 1개월','신고장소'])
 scripts='\n'.join(x.get('text','') for x in d['scripts'])
 targets=re.findall(r"fileDownloader\('([^']*사망신고서\.hwp)'\)",scripts)
 assert targets,'기관 응답의 실제 사망신고서 다운로드 경로 미확인'
 a={'url':urljoin(d['url'],targets[0]),'text':'사망신고서','origin':d['url']}
 f,body=get_original('P0-05',a,['사망','신고서'],public=False)
 byid['P0-05']['inspected_original']={**f,'rehosting':'not permitted/verified; official source only'}
 byid['P0-05']['deadline']='1개월';byid['P0-05']['deadline_basis']='신고의무자가 사망사실을 안 날'
 if byid['P0-05']['status']!='확인 완료':complete('P0-05',d['url'],ev,'대법원 전자가족관계등록시스템',note='대법원이 게시한 사망신고 안내와 실제 사망신고서 HWP 원본의 본문을 확인했습니다. 사망신고의무자의 일반 신고기간은 사망사실을 안 날부터 1개월입니다. 가족관계등록불명자 등의 예외와 구비서류는 원문을 확인하세요. 문서 재배포 조건은 미확인으로 기관 제공처에서 받도록 연결합니다.',license_text='대법원 제공 원본 확보 · 재배포 조건 미확인으로 공식 제공처만 연결')
except Exception as e:fail('P0-05',str(e))

try:
 p=OUT/'round11/ksd-loaded.json';d=json.loads(p.read_text());dom=d['dom'];t=dom['text']
 assert any(e['url']==d['url'] and e['status']==200 for e in d['events'])
 assert all(norm(s) in norm(t) for s in ['주식 찾기','미수령 주식','현금배당금 조회 신청'])
 routes=[a for a in dom['links'] if a['text'] in ['주식 찾기','현금배당금조회 신청'] and a['url'].startswith('javascript:menuMove')]
 assert len(routes)>=2
 ev={'url':d['url'],'http_status':200,'checked_at':d['checked_at'],'body_sha256':digest(t.encode()),'matched_terms':['주식 찾기','미수령 주식','현금배당금 조회 신청'],'navigation':routes,'evidence_file':str(p.relative_to(ROOT))}
 if byid['P6-05']['status']!='확인 완료':complete('P6-05',d['url'],ev,'한국예탁결제원',note='한국예탁결제원 증권대행 주주서비스의 주식 찾기와 현금배당금 조회 신청 경로입니다. 첫 화면의 주주 서비스에서 선택할 수 있습니다. 미수령 주식·종이 주권과 현금배당금 조회를 구분하고, 조회 가능 범위와 신청인 자격은 기관 안내에 따릅니다. 개인 조회나 인증을 대신 수행하지 않았습니다.')
except Exception as e:fail('P6-05',str(e))

jobs=[
 ('nts-ems','https://ems.nts.go.kr/tax_inquiry/guide_01.html'),
 ('nts-guide4','https://www.nts.go.kr/tax_inquiry/guide_04.html'),
 ('notary','https://easylaw.go.kr/CSP/CnpClsMainBtr.laf?ccfNo=2&cciNo=2&cnpClsNo=2&csmSeq=272&menuType=onhunqna&popMenu=ov'),
 ('bankruptcy','https://djb.scourt.go.kr/rel/information/min/MinListAction.work?pageIndex=17')]
def read(j):
 label,url=j
 try:
  p=inspect_page(url);save(DEST/(label+'.json'),p);return label,p
 except Exception as e:save(DEST/(label+'-failure.json'),{'url':url,'checked_at':now(),'error':str(e)});return label,None
pages=dict(ThreadPoolExecutor(max_workers=4).map(read,jobs))
for ident,terms,note in [
 ('P2-14',['심사청구서','심판청구서','전체서식'],'국세청 세무조사 가이드북의 심사청구서와 심판청구서 제공 안내를 확인했습니다. 요청한 조세심판원 게시물 대신 확인한 국세청 공식 대체 출처입니다. 두 불복 절차와 제출기관을 구분하여 사용하세요.'),
 ('P3-04',['세무대리인 위임장','전체서식'],'국세청 세무조사 가이드북의 세무대리인 위임장입니다. 요청한 한국세무사회 서식 대신 확인한 국세청 공식 대체 출처이며 세무조사 관련 위임을 위한 양식입니다. 일반 기장·신고 위임 계약서로 확대하지 않습니다.')]:
 if byid[ident]['status']=='확인 완료':continue
 for label in ['nts-ems','nts-guide4']:
  d=pages[label]
  if d and all(norm(t) in norm(d['text']) for t in terms):
   byid[ident]['alternative_official_source']=True
   complete(ident,d['chain'][0]['url'],{'http_status':200,'checked_at':d['checked_at'],'matched_terms':terms,'evidence_file':str((DEST/(label+'.json')).relative_to(ROOT))},'국세청',note=note,license_text='공식 제공처 연결 · 개별 원본 재배포하지 않음');break
# Discover body and attachment links from each actually returned official page.
for label in ['notary','bankruptcy']:
 d=pages[label]
 if not d:continue
 matching=[a for a in d['links'] if ('공증' in a['text'] and label=='notary') or ('상속재산' in a['text'] and label=='bankruptcy')]
 save(DEST/(label+'-observed-links.json'),matching)
 for i,a in enumerate(matching[:5]):
  if urlparse(a['url']).netloc not in ['easylaw.go.kr','www.easylaw.go.kr','djb.scourt.go.kr','slb.scourt.go.kr']:continue
  try:save(DEST/(label+'-detail-'+str(i)+'.json'),inspect_page(a['url']))
  except Exception as e:save(DEST/(label+'-detail-'+str(i)+'-failure.json'),{'url':a['url'],'checked_at':now(),'error':str(e)})

# Public browser navigation; use observed menu anchors, never a guessed file ID.
expr="({text:document.body?document.body.innerText:'',html:document.documentElement.outerHTML,links:Array.from(document.querySelectorAll('a')).map(a=>({text:a.innerText,url:a.href,onclick:a.getAttribute('onclick')})),inputs:Array.from(document.querySelectorAll('input,select,button')).map(e=>({tag:e.tagName,id:e.id,name:e.name,type:e.type,value:e.value,text:e.innerText,visible:!!e.getClientRects().length})),scripts:Array.from(document.scripts).map(s=>({url:s.src,text:s.src?'':s.textContent}))})"
with sync_playwright() as p:
 browser=p.chromium.launch();ctx=browser.new_context(locale='ko-KR',accept_downloads=True)
 for label,url in [('ksd','https://ta.ksd.or.kr/'),('nts','https://ems.nts.go.kr/tax_inquiry/guide_01.html'),('guardian','https://sladmin.scourt.go.kr/slfamily/civil_complaint/civil_06/index_03.html'),('efamily','https://efamily.scourt.go.kr/cs/CsBltnWrtGuide.do?bltnbordId=0000008&guideCd=0000008006&guideYn=Y')]:
  page=ctx.new_page();cdp=ctx.new_cdp_session(page);events=[];payloads=[]
  def record(r):
   if r.request.resource_type in ['document','xhr','fetch']:
    events.append({'url':r.url,'status':r.status,'method':r.request.method})
    if r.status==200 and r.request.resource_type in ['xhr','fetch']:
     try:
      t=r.text()
      if len(t)<2000000:payloads.append({'url':r.url,'body':t,'sha256':digest(t.encode())})
     except Exception:pass
  page.on('response',record)
  def snap(name):
   dom=cdp.send('Runtime.evaluate',{'expression':expr,'returnByValue':True}).get('result',{}).get('value',{})
   save(DEST/(name+'.json'),{'url':page.url,'checked_at':now(),'events':events,'dom':dom,'payloads':payloads});return dom
  try:
   page.goto(url,wait_until='commit',timeout=22000);page.wait_for_timeout(7000);dom=snap(label+'-loaded')
   if label=='ksd':
    for title in ['주식 찾기','현금배당금조회 신청','양식/서식']:
     js="""(()=>{let a=Array.from(document.querySelectorAll('a')).find(a=>a.textContent.trim()===TITLE&&a.getAttribute('href')?.startsWith('javascript:menuMove'));if(a){a.click();return true}return false})()""".replace('TITLE',json.dumps(title))
     if cdp.send('Runtime.evaluate',{'expression':js,'returnByValue':True}).get('result',{}).get('value'):page.wait_for_timeout(6000);snap('ksd-'+title.replace('/','-').replace(' ',''))
   if label=='nts' and dom.get('text') and any(e['status']==200 and e['url']==page.url for e in events):
    for ident,terms in [('P2-14',['심사청구서','심판청구서']),('P3-04',['세무대리인 위임장'])]:
     if byid[ident]['status']!='확인 완료' and all(norm(t) in norm(dom['text']) for t in terms):
      byid[ident]['alternative_official_source']=True
      complete(ident,page.url,{'http_status':200,'checked_at':now(),'matched_terms':terms,'body_sha256':digest(dom['text'].encode()),'evidence_file':str((DEST/'nts-loaded.json').relative_to(ROOT))},'국세청',note='국세청 세무조사 가이드북에 실제 제공되는 요청 서식의 안내입니다. 요청 기관의 대체 공식 출처로 구분하며 세무조사 서식의 용도로 확인하세요. 개별 원본 재배포는 하지 않습니다.')
  except Exception as e:save(DEST/(label+'-browser-failure.json'),{'url':url,'error':str(e),'checked_at':now(),'events':events})
  finally:page.close()
 browser.close()
persist()
exec(compile('# Extend the catalog'+hs.split('# Extend the catalog',1)[1],str(hp),'exec'),globals())
save(DEST/'batch-result.json',{'newly_completed_ids':[r['id'] for r in results if r['status']=='확인 완료' and r['id'] not in before],'completed':sum(r['status']=='확인 완료' for r in results),'checked_at':now()})
