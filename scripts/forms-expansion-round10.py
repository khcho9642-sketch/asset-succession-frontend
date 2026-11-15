"""Continue source verification using actual public responses and attachment anchors.
No form is invented; alternative official publishers are explicitly identified.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin
import json,re
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
hp=Path(__file__).with_name('forms-expansion-collect.py');hs=hp.read_text()
exec(compile(hs.split('# These short Korean-law addresses')[0],str(hp),'exec'),globals())
DEST=OUT/'round10';DEST.mkdir(parents=True,exist_ok=True)
checkpoints.update(range(10,sum(r['status']=='확인 완료' for r in results)+1,10))
before=[r['id'] for r in results if r['status']=='확인 완료']

def register_saved(ident,filename,terms,institution,note,related):
 p=OUT/'round9'/filename;d=json.loads(p.read_text());text=d['dom']['text']
 assert any(e['url'].split('&ntstDcmClCd')[0]==d['url'].split('&ntstDcmClCd')[0] and e['status']==200 for e in d['events'])
 assert all(norm(term) in norm(text) for term in terms)
 if byid[ident]['status']=='확인 완료':return
 ev={'url':d['url'],'http_status':200,'checked_at':d['checked_at'],'body_sha256':digest(text.encode()),
  'matched_terms':terms,'evidence_file':str(p.relative_to(ROOT)),'verification_method':'public_HTTP_200_and_rendered_primary_source'}
 r=byid[ident];r.update(status='확인 완료',source_url=d['url'],source_type='공식제공처',source_evidence=ev,
  institution=institution,checked_at=d['checked_at'],reviewed_at=now(),note=note,related_ids=related,
  license='공식 제공처 연결 · 원문 재배포하지 않음')
 r.pop('failure_reason',None);persist();print('확인 완료',ident,flush=True)

for args in [
 ('P5-08','taxinterpretation-loaded.json',['상속재산 재분할','서면-2024-상속증여-3343','신고기한','증여세'],
  '국세청 국세법령정보시스템','상속등기 후 신고기한을 경과하여 재분할하는 경우의 증여세 과세 여부를 다룬 국세청 회신(2024-09-26)입니다. 최초 협의분할과 재분할을 구분하고 원문의 적용 요건·예외를 확인하세요. 특정 질의회신이며 모든 재분할에 증여세가 발생한다는 뜻은 아닙니다.',['BP-I-01','P1-18']),
 ('P9-05','taxbusiness-loaded.json',['사업의 포괄양도','광주지방법원-2021-구합-12336','권리','의무','부가가치세'],
  '국세청 국세법령정보시스템','사업용 건물의 매각이 사업의 포괄양도로 인정되지 않은 사례와 관련 법령을 확인할 수 있는 국세청 판례 자료(2022-04-15)입니다. 단순 자산 매각과 사업의 동일성을 유지한 권리·의무의 포괄승계를 구분하여 검토하는 참고자료이며, 현재 거래의 비과세 여부를 확정하는 안내는 아닙니다.',['P2-04','P9-04'])
]:
 try:register_saved(*args)
 except Exception as e:fail(args[0],str(e))

jobs=[
 ('nts-guide','https://sc.nts.go.kr/tax_inquiry/guide_01.html'),
 ('hana-inheritance','https://www.kebhana.com/cont/news/news01/news0101/1424358_118324.jsp'),
 ('valuation-rule','https://www.law.go.kr/LSW/admRulLsInfoP.do?admRulSeq=2100000281898'),
 ('valuation-sontax','https://mob.tbht.hometax.go.kr/jsonAction.do?actionId=UTBRNAAX18F001'),
 ('klac-forms','https://www.klac.or.kr/legalinfo/legalFrm.do'),
 ('klac-license','https://www.klac.or.kr/disclosure/cpyrhtManage.do'),
 ('ksd','https://ta.ksd.or.kr/'),
 ('comwel','https://www.kcomwel.or.kr/'),
 ('retirement','https://100lifeplan.fss.or.kr/'),
 ('knia','https://consumer.knia.or.kr/'),
 ('klia','https://www.klia.or.kr/'),
]
def read(job):
 key,url=job
 try:
  r=http(url);r.encoding=r.apparent_encoding or 'utf-8';s=BeautifulSoup(r.text,'html.parser')
  d={'url':r.url,'http_status':200,'checked_at':now(),'sha256':digest(r.content),'text':s.get_text(' ',strip=True),'html':r.text,
   'links':[{'text':a.get_text(' ',strip=True),'url':urljoin(r.url,a.get('href','')),'onclick':a.get('onclick')} for a in s.select('a[href]')],
   'scripts':[{'url':urljoin(r.url,x.get('src','')) if x.get('src') else '', 'text':x.get_text()} for x in s.select('script')]}
  save(DEST/(key+'.json'),d);return key,d,None
 except Exception as e:save(DEST/(key+'-failure.json'),{'url':url,'error':str(e),'checked_at':now()});return key,None,str(e)
reads={k:(d,e) for k,d,e in ThreadPoolExecutor(max_workers=5).map(read,jobs)}
d,e=reads['nts-guide']
for ident,terms,note in [
 ('P2-14',['심사청구서','심판청구서','전체서식'], '국세청 세무조사 가이드북의 서식 목록 16번 심사청구서와 17번 심판청구서입니다. 요청한 조세심판원 자체 게시물 대신 국세청이 공식 배포한 양식모음 제공처를 확인했습니다. 두 불복 절차는 서로 다르므로 대상 처분과 제출기관을 구분하여 선택하세요.'),
 ('P3-04',['세무대리인 위임장','전체서식'], '국세청 세무조사 가이드북의 7번 세무대리인 위임장입니다. 요청한 한국세무사회 자료 대신 확인한 국세청 공식 제공 서식을 연결합니다. 세무조사 관련 양식모음이며 모든 기장·신고 위임 업무의 범위를 대신 정하는 계약서가 아닙니다.'),
]:
 if byid[ident]['status']=='확인 완료':continue
 if d and all(norm(t) in norm(d['text']) for t in terms):
  ev={k:d[k] for k in ['url','http_status','checked_at','sha256']};ev.update(matched_terms=terms,evidence_file=str((DEST/'nts-guide.json').relative_to(ROOT)))
  byid[ident]['alternative_official_source']=True
  complete(ident,d['url'],ev,'국세청',note=note,license_text='공식 제공처 연결 · 개별 파일 재배포 조건 미확인')
 else:fail(ident,e or '공식 서식 목록에서 대상 양식 미확인',jobs[0][1])

# Acquire the unmodified official combined file for inspection only, without rehosting it.
if d:
 for a in d['links']:
  if '전체서식' in a['text'] and any(x in a['text'] for x in ['PDF','HWP']):
   try:
    r=http(a['url']);ext,text=parse_binary(r.content)
    assert all(norm(t) in norm(text) for t in ['세무대리인위임장','심사청구서','심판청구서'])
    f=REVIEW/('NTS-tax-investigation-forms-'+digest(r.content)[:12]+'.'+ext);f.write_bytes(r.content)
    save(DEST/('nts-original-'+ext+'.json'),{'url':r.url,'http_status':200,'checked_at':now(),'sha256':digest(r.content),'bytes':len(r.content),'format':ext,'title_verified':True,'artifact_path':'originals/'+f.name,'text_excerpt':text[:5000], 'note':'기관의 전체 서식모음 원본을 검수용으로만 보관합니다. 각 서식을 분리하거나 재작성하지 않았습니다.'})
   except Exception as error:save(DEST/('nts-original-failure-'+digest(a['url'].encode())[:8]+'.json'),{'url':a['url'],'error':str(error),'checked_at':now()})

d,e=reads['hana-inheritance']
if byid['P6-01']['status']!='확인 완료':
 if d and all(norm(t) in norm(d['text']) for t in ['상속예금','필요서류','가족관계']):
  ev={k:d[k] for k in ['url','http_status','checked_at','sha256']};ev['evidence_file']=str((DEST/'hana-inheritance.json').relative_to(ROOT))
  complete('P6-01',d['url'],ev,'하나은행',note='하나은행이 게시한 상속예금 지급 신청 시 필요서류 안내(2015-01-08)입니다. 가족관계 및 지급 동의 관련 자료를 확인하는 참고 출처로 연결합니다. 오래된 게시물의 소액 기준을 현재 기준이나 전 은행 공통 기준으로 사용하지 말고, 청구 시 거래 은행에 최신 서류와 간편지급 요건을 확인하세요.',license_text='은행 공식 제공처 연결 · 문서 재배포하지 않음')
 else:fail('P6-01',e or '해당 은행 안내 본문 미확인',jobs[1][1])

expr="({text:document.body?document.body.innerText:'',html:document.documentElement.outerHTML,links:Array.from(document.querySelectorAll('a')).map(a=>({text:a.innerText,url:a.href,onclick:a.getAttribute('onclick')})),inputs:Array.from(document.querySelectorAll('input,select,button')).map(e=>({tag:e.tagName,id:e.id,name:e.name,type:e.type,value:e.value,text:e.innerText,visible:!!e.getClientRects().length})),scripts:Array.from(document.scripts).map(s=>({url:s.src,text:s.src?'':s.textContent}))})"
with sync_playwright() as p:
 browser=p.chromium.launch();ctx=browser.new_context(locale='ko-KR',accept_downloads=True)
 for key,url in [jobs[i] for i in [2,3,4,6,7]]:
  page=ctx.new_page();cdp=ctx.new_cdp_session(page);events=[];payloads=[]
  def record(r):
   if r.request.resource_type in ('document','xhr','fetch'):
    ev={'url':r.url,'status':r.status,'method':r.request.method}
    if r.request.method=='POST':ev['post_data']=r.request.post_data
    events.append(ev)
    if r.status==200 and r.request.resource_type in ('xhr','fetch'):
     try:
      t=r.text()
      if len(t)<1800000:payloads.append({'url':r.url,'body':t,'sha256':digest(t.encode())})
     except Exception:pass
  page.on('response',record)
  def snap(label):
   res=cdp.send('Runtime.evaluate',{'expression':expr,'returnByValue':True});dom=res.get('result',{}).get('value',{})
   save(DEST/(label+'.json'),{'url':page.url,'checked_at':now(),'events':events,'dom':dom,'payloads':payloads,'errors':res.get('exceptionDetails')});return dom
  try:
   page.goto(url,wait_until='commit',timeout=18000);page.wait_for_timeout(6000);dom=snap(key+'-loaded')
   if key=='valuation-rule':
    for label in ['별표/서식','별표ㆍ서식','첨부파일']:
     js="""(()=>{let a=Array.from(document.querySelectorAll('a,button,span')).find(a=>a.getClientRects().length&&a.textContent.trim()===LABEL);if(a){a.click();return true}return false})()""".replace('LABEL',json.dumps(label))
     cdp.send('Runtime.evaluate',{'expression':js,'returnByValue':True});page.wait_for_timeout(1200);snap(key+'-'+label.replace('/','-'))
   if key=='klac-forms':
    for q in ['상속','유언','유류분','기여분','증여']:
     js="""(()=>{let xs=Array.from(document.querySelectorAll('input[type=text],input[type=search]')).filter(e=>e.getClientRects().length);let e=xs.at(-1);if(!e)return false;e.value=QUERY;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));e.focus();return true})()""".replace('QUERY',json.dumps(q))
     res=cdp.send('Runtime.evaluate',{'expression':js,'returnByValue':True})
     if res.get('result',{}).get('value'):page.keyboard.press('Enter');page.wait_for_timeout(1800);snap('klac-'+q)
  except Exception as error:save(DEST/(key+'-browser-failure.json'),{'url':url,'checked_at':now(),'error':str(error),'events':events})
  finally:page.close()
 browser.close()
persist()
exec(compile('# Extend the catalog'+hs.split('# Extend the catalog',1)[1],str(hp),'exec'),globals())
save(DEST/'batch-result.json',{'checked_at':now(),'newly_completed_ids':[r['id'] for r in results if r['status']=='확인 완료' and r['id'] not in before], 'pending_ids':[r['id'] for r in results if r['status']!='확인 완료']})
