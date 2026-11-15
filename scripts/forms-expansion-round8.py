"""Resume remaining official sources; never accept a shell, error page or guessed file.
Read-only institutional HTTP/browser access. Existing 74 records stay unchanged.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin
import json,re
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
hp=Path(__file__).with_name('forms-expansion-collect.py');hs=hp.read_text()
exec(compile(hs.split('# These short Korean-law addresses')[0],str(hp),'exec'),globals())
DEST=OUT/'round8';DEST.mkdir(parents=True,exist_ok=True)
checkpoints.update(range(10,sum(r['status']=='확인 완료' for r in results)+1,10))
before=[r['id'] for r in results if r['status']=='확인 완료']

def read_source(job):
 key,url,terms=job
 try:
  r=http(url);r.encoding=r.apparent_encoding or 'utf-8';s=BeautifulSoup(r.text,'html.parser')
  for el in s.select('script,style,nav,header,footer'):el.decompose()
  text=s.get_text(' ',strip=True)
  d={'url':r.url,'requested_url':url,'http_status':200,'checked_at':now(),'sha256':digest(r.content),'text':text,
   'matched_terms':[term for term in terms if norm(term) in norm(text)],
   'links':[{'text':a.get_text(' ',strip=True),'url':urljoin(r.url,a.get('href','')),'onclick':a.get('onclick')} for a in s.select('a[href]')]}
  save(DEST/(key+'.json'),d);return key,d,None
 except Exception as e:
  d={'url':url,'checked_at':now(),'error':str(e)};save(DEST/(key+'-failed.json'),d);return key,None,str(e)

jobs=[
 ('P3-03','https://edi.nhis.or.kr/webedi/file_sy/all_sangsil.html',['자격상실','사망']),
 ('P3-03-dependent','https://edi.nhis.or.kr/webedi/file_sy/pibuyangja_jagyuk.html',['자격','사망']),
 ('P3-06','https://easylaw.go.kr/CSP/CnpClsMainBtr.laf?ccfNo=4&cciNo=2&cnpClsNo=2&csmSeq=1259&popMenu=ov',['부담부증여','채무','양도소득세']),
 ('P5-06','https://easylaw.go.kr/CSP/CnpClsMainBtr.laf?ccfNo=4&cciNo=1&cnpClsNo=2&csmSeq=916&popMenu=ov',['장애인','신탁','과세가액','불산입']),
 ('P5-08','https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=200000000000003515',['재분할','증여','상속']),
 ('P8-05','https://www.easylaw.go.kr/CSP/CnpClsMain.laf?ccfNo=4&cciNo=3&cnpClsNo=1&csmSeq=255',['한정승인','청산','채권','공고']),
 ('P8-06','https://www.easylaw.go.kr/CSP/CnpClsMain.laf?ccfNo=5&cciNo=2&cnpClsNo=1&csmSeq=255&popMenu=ov',['상속인','부존재','청산','공고']),
 ('P9-03-discovery','https://www.moj.go.kr/moj/331/subview.do',['공증']),
 ('P9-05-discovery','https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=2447&cntntsId=7780',['양도']),
 ('P8-07-discovery','https://sladmin.scourt.go.kr/slfamily/civil_complaint/civil_06/index_03.html',['성년후견','진단서','재산목록']),
]
reads={key:(d,e) for key,d,e in ThreadPoolExecutor(max_workers=5).map(read_source,jobs)}
accepted={
 'P3-03':('국민건강보험공단 EDI','국민건강보험공단의 사업장 가입자 자격상실 신고 작성안내입니다. 사망 관련 상실 사유와 작성 항목을 확인하세요. 지역가입자·피부양자 처리는 자격 유형에 맞는 공단 안내를 별도로 확인해야 합니다.'),
 'P3-06':('법제처 찾기쉬운 생활법령정보','채무를 함께 인수하는 부담부증여의 안내입니다. 채무인수 부분의 양도소득세와 증여 부분의 증여세를 구분하여 확인하세요. 새 계약서를 작성하거나 이 안내를 계약서 원본으로 제공하지 않습니다.'),
 'P5-06':('법제처 찾기쉬운 생활법령정보','장애인에게 증여한 재산을 신탁하는 경우의 과세가액 불산입 요건과 사후관리 안내입니다. 신탁계약·장애인 증명·신고서 등 원문에 제시된 서류를 확인하세요. 모든 장애인 증여에 자동 적용된다는 뜻은 아닙니다.'),
 'P5-08':('국세청 국세법령정보시스템','상속재산을 분할한 뒤 다시 나눌 때 증여세가 문제되는 경우에 대한 국세청 해석입니다. 최초 협의분할과 재분할을 구분하고 적용 시점과 예외 요건을 원문에서 확인하세요. 개별 질의회신을 모든 사건의 결론으로 일반화하지 않습니다.'),
 'P8-05':('법제처 찾기쉬운 생활법령정보','한정승인 이후 상속채권자에 대한 공고·최고와 변제 등 청산 절차를 안내합니다. 법원 심판 수리와 청산 완료는 구분해야 합니다.'),
 'P8-06':('법제처 찾기쉬운 생활법령정보','상속인이 있는지 분명하지 않은 상속재산의 관리·청산과 공고 절차에 관한 안내입니다. 공고의 대상과 기산점은 해당 절차별 원문을 확인하세요.'),
}
for key,(institution,note) in accepted.items():
 if byid[key]['status']=='확인 완료':continue
 d,e=reads[key];terms=next(j[2] for j in jobs if j[0]==key)
 if d and len(d['matched_terms'])==len(terms):
  ev={k:d[k] for k in ['url','http_status','checked_at','sha256','matched_terms']};ev['evidence_file']=str((DEST/(key+'.json')).relative_to(ROOT))
  complete(key,d['url'],ev,institution,note=note)
 else:fail(key,e or '요청한 안내 본문을 확인하지 못함',next(j[1] for j in jobs if j[0]==key))

# The supplementary continuation-insurance source was actually fetched Sept 19.
# It concerns retirees, not continuation of a deceased person's insurance.
if byid['P3-03']['status']=='확인 완료' and byid['P7-07']['status']!='확인 완료':
 try:
  p=OUT/'round6/P7-07.json';d=json.loads(p.read_text())
  assert d['http_status']==200
  assert all(norm(t) in norm(d['text']) for t in ['임의계속가입','퇴직','신청기한','적용기간'])
  ev={k:d[k] for k in ['url','http_status','checked_at','sha256']};ev['evidence_file']=str(p.relative_to(ROOT))
  r=byid['P7-07'];r.update(alias_verified=True,status='확인 완료',source_type='공식제공처',source_url=d['url'],source_evidence=ev,
   institution='국민건강보험공단',checked_at=d['checked_at'],reviewed_at=now(),license='공식 제공처 연결 · 재배포하지 않음',
   note='국민건강보험공단의 자격상실 안내에 2023년 2월 공단 사보의 퇴직자 임의계속가입 안내를 연결합니다. 임의계속가입은 사망자의 자격을 상속한다는 제도가 아닙니다. 퇴직자의 가입·신청 요건은 최신 공단 안내와 개별 자격으로 다시 확인하세요.')
  r.pop('failure_reason',None);persist()
 except Exception as e:fail('P7-07',str(e))

# Native DOM evaluation avoids the portals' overridden Map breaking Playwright locators.
# Discover only document-listed links or publicly delivered frontend requests.
with sync_playwright() as p:
 browser=p.chromium.launch();ctx=browser.new_context(locale='ko-KR',accept_downloads=True)
 ctx.set_default_timeout(4500)
 for key,url in [
  ('rent','https://www.renthome.go.kr/webportal/bbs/frmtDownload/frmtDownloadList.open'),
  ('efamily','https://efamily.scourt.go.kr/cs/CsBltnWrtList.do?bltnbordId=0000005'),
  ('family-guide','https://efamily.scourt.go.kr/cs/CsBltnWrtGuide.do?bltnbordId=0000007&guideCd=0000007001&guideYn=Y'),
  ('basic-guide','https://efamily.scourt.go.kr/cs/CsBltnWrtGuide.do?bltnbordId=0000007&guideCd=0000007002&guideYn=Y'),
  ('removed-guide','https://efamily.scourt.go.kr/cs/CsBltnWrtGuide.do?bltnbordId=0000007&guideCd=0000007007&guideYn=Y'),
  ('iros','https://www.iros.go.kr/index.jsp'),
 ]:
  page=ctx.new_page();events=[];payloads=[]
  def record(r):
   if r.request.resource_type in ('document','xhr','fetch'):
    ev={'url':r.url,'status':r.status,'method':r.request.method};events.append(ev)
    if r.request.method=='POST':ev['post_data']=r.request.post_data
    if r.status==200 and r.request.resource_type in ('xhr','fetch'):
     try:
      text=r.text()
      if len(text)<700000:payloads.append({'url':r.url,'text':text,'sha256':digest(text.encode())})
     except Exception:pass
  page.on('response',record)
  def snap(label):
   frames=[]
   for fr in page.frames:
    try:
     d=fr.evaluate('''() => ({text:document.body ? document.body.innerText : '', links:[...document.querySelectorAll('a')].map(a=>({text:a.innerText,url:a.href,onclick:a.getAttribute('onclick')})),inputs:[...document.querySelectorAll('input,select,button')].map(e=>({id:e.id,name:e.name,type:e.type,value:e.value,text:e.innerText,visible:!!e.getClientRects().length})),scripts:[...document.scripts].map(s=>({url:s.src,text:s.src?'':s.textContent}))})''')
     d['url']=fr.url;frames.append(d)
    except Exception as e:frames.append({'url':fr.url,'error':str(e)})
   save(DEST/(label+'.json'),{'url':page.url,'checked_at':now(),'events':events,'frames':frames,'payloads':payloads})
  try:
   page.goto(url,wait_until='commit',timeout=18000);page.wait_for_timeout(5000);snap(key)
   if key=='efamily':
    action=page.evaluate('''() => {let els=[...document.querySelectorAll('input[type=text]')].filter(e=>e.getClientRects().length);let e=els.at(-1);if(!e)return false;e.value='사망';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));let btn=[...document.querySelectorAll('a,button,input[type=button]')].find(b=>b.getClientRects().length&&/^(조회|검색)$/.test((b.innerText||b.value||'').trim()));if(btn){btn.click();return true}return false}''')
    page.wait_for_timeout(2500);snap('efamily-death-search')
   if key=='iros':
    for label in ['고객센터','자료센터','등기신청양식']:
     clicked=page.evaluate('''label=>{let a=[...document.querySelectorAll('a,button,span')].find(a=>a.getClientRects().length&&a.textContent.trim()===label);if(a){a.click();return true}return false}''',label)
     page.wait_for_timeout(1800);snap('iros-'+label)
  except Exception as e:save(DEST/(key+'-browser-failure.json'),{'url':url,'checked_at':now(),'error':str(e),'events':events})
  finally:page.close()
 browser.close()
persist()
exec(compile('# Extend the catalog'+hs.split('# Extend the catalog',1)[1],str(hp),'exec'),globals())
new=[r['id'] for r in results if r['status']=='확인 완료' and r['id'] not in before]
save(DEST/'batch-result.json',{'checked_at':now(),'newly_completed_ids':new,'remaining':[r['id'] for r in results if r['status']!='확인 완료']})
print('NEW_DONE',','.join(new),flush=True)
