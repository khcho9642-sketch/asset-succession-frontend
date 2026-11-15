"""Continue actual official-source inspection without changing legacy data.
A saved HTTP success retains its retrieval timestamp; no shell counts as a form.
"""
from pathlib import Path
from urllib.parse import urljoin
import json,re,html
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
hp=Path(__file__).with_name('forms-expansion-collect.py');hs=hp.read_text()
exec(compile(hs.split('# These short Korean-law addresses')[0],str(hp),'exec'),globals())
DEST=OUT/'round9';DEST.mkdir(parents=True,exist_ok=True)
checkpoints.update(range(10,sum(r['status']=='확인 완료' for r in results)+1,10))
before=[r['id'] for r in results if r['status']=='확인 완료']

def saved_complete(ident,source,evidence,institution,note):
 r=byid[ident]
 if r['status']=='확인 완료':return
 assert not r['required_original'] and evidence['http_status']==200
 r.update(status='확인 완료',source_url=source,source_type='공식제공처',source_evidence=evidence,
   institution=institution,checked_at=evidence['checked_at'],reviewed_at=now(),note=note,
   license='공식 제공처 연결 · 개별 첨부 재배포 조건 미확인')
 r.pop('failure_reason',None);persist();print('확인 완료',ident,flush=True)

try:
 p=OUT/'round8/P8-06.json';d=json.loads(p.read_text());body=d['text'].split('본문 영역',1)[-1]
 for term in ['상속인이 없는 경우의 상속재산귀속','상속재산관리인의 선임청구 및 공고','상속채권자','공고']:
  assert norm(term) in norm(body),term
 ev={k:d[k] for k in ['url','http_status','checked_at','sha256']};ev['evidence_file']=str(p.relative_to(ROOT))
 saved_complete('P8-06',d['url'],ev,'법제처 찾기쉬운 생활법령정보',
  '상속인이 없는 경우의 상속재산귀속에 관한 공식 안내입니다. 상속재산관리인 선임 공고, 채권자 등에 대한 공고와 최고, 상속인 수색·특별연고자 분여 등 원문에 안내된 절차를 확인하세요. 기관의 현재 게시 명칭을 보존하며 실제 사건의 청산인·관리인 명칭과 적용 절차는 관할법원에서 확인해야 합니다.')
except Exception as e:fail('P8-06',str(e))

try:
 p=OUT/'round8/rent.json';d=json.loads(p.read_text());source=d['url']
 assert any(e['url']==source and e['status']==200 for e in d['events'])
 payload=next(x for x in d['payloads'] if 'selectFrmtDownloadList.open' in x['url'])
 rows=json.loads(payload['text'])['list'];titles=[]
 for term in ['임대사업자 등록신청서','임대사업자 등록사항 변경신고서','말소 신청서']:
  matches=[r for r in rows if norm(term) in norm(r['sjNm'])];assert matches,term
  titles.extend(r['sjNm'] for r in matches)
 ev={'url':source,'http_status':200,'checked_at':d['checked_at'],'matched_titles':titles,
   'response_sha256':digest(payload['text'].encode()),'evidence_file':str(p.relative_to(ROOT))}
 saved_complete('P9-06',source,ev,'국토교통부·한국토지주택공사 렌트홈',
  '렌트홈 민원법정서식 목록에서 임대사업자 등록신청서, 등록사항 변경신고서와 등록 전부·일부 말소 신청서를 확인했습니다. 목록의 서식명과 개정 표시를 확인하고 해당 HWP 또는 PDF를 선택하세요. 등록·변경과 말소는 서로 다른 신청입니다. 기존 주택임대사업자 거주주택 특례 자료와 함께 검토할 수 있습니다.')
except Exception as e:fail('P9-06',str(e))

# Re-use an observed public form-list request, changing only the search field.
try:
 p=OUT/'round8/efamily.json';d=json.loads(p.read_text())
 e=next(e for e in d['events'] if 'CsBltnWrtListAjax.do' in e['url'] and e.get('post_data'))
 from urllib.parse import parse_qsl
 payload=dict(parse_qsl(e['post_data'],keep_blank_values=True));payload['srchKeywd']='사망';payload['pageIndex']='1'
 r=http(e['url'],'POST',payload);data=r.json();save(DEST/'efamily-death-response.json',{'url':r.url,'http_status':200,'checked_at':now(),'request':payload,'data':data})
 rows=[row for row in data.get('resultList',[]) if '사망신고서' in html.unescape(row.get('bltnTitle',''))]
 if rows:
  evidence={'url':d['url'],'http_status':200,'checked_at':now(),'list_url':r.url,'response_sha256':digest(r.content),
    'matched_rows':rows,'evidence_file':str((DEST/'efamily-death-response.json').relative_to(ROOT))}
  complete('P0-05',d['url'],evidence,'대법원 전자가족관계등록시스템',
    note='대법원 전자가족관계등록시스템의 공식 신청서 양식 목록에서 사망신고서를 확인했습니다. 검색창에 «사망»을 입력하여 해당 서식과 작성안내를 선택하세요. 목록의 첨부 존재와 파일의 전체 인쇄 검수는 구분합니다.')
 else:fail('P0-05','검색 응답에 사망신고서 제목 없음',e['url'])
except Exception as e:fail('P0-05',str(e))

# Keep complete HTML and observed scripts for portals that redefine JS serializers.
for key,url in [('family','https://efamily.scourt.go.kr/cs/CsBltnWrtGuide.do?bltnbordId=0000007&guideCd=0000007001&guideYn=Y'),
 ('basic','https://efamily.scourt.go.kr/cs/CsBltnWrtGuide.do?bltnbordId=0000007&guideCd=0000007002&guideYn=Y'),
 ('removed','https://efamily.scourt.go.kr/cs/CsBltnWrtGuide.do?bltnbordId=0000007&guideCd=0000007007&guideYn=Y')]:
 try:
  r=http(url);r.encoding=r.apparent_encoding or 'utf-8';s=BeautifulSoup(r.text,'html.parser')
  save(DEST/(key+'-html.json'),{'url':r.url,'http_status':200,'checked_at':now(),'sha256':digest(r.content),'html':r.text,
   'scripts':[{'url':urljoin(r.url,x.get('src','')) if x.get('src') else '', 'text':x.get_text()} for x in s.select('script')]})
 except Exception as e:save(DEST/(key+'-html-failure.json'),{'url':url,'checked_at':now(),'error':str(e)})

# CDP Runtime evaluation uses Chromium's protocol serialization, not the portal's JSON override.
expr="({text:document.body?document.body.innerText:'',html:document.documentElement.outerHTML,links:Array.from(document.querySelectorAll('a')).map(a=>({text:a.innerText,url:a.href,onclick:a.getAttribute('onclick')})),inputs:Array.from(document.querySelectorAll('input,select,button')).map(e=>({tag:e.tagName,id:e.id,name:e.name,type:e.type,value:e.value,text:e.innerText,visible:!!e.getClientRects().length})),scripts:Array.from(document.scripts).map(s=>({url:s.src,text:s.src?'':s.textContent}))})"
with sync_playwright() as p:
 browser=p.chromium.launch();ctx=browser.new_context(locale='ko-KR',accept_downloads=True)
 for key,url,queries in [
  ('court','https://ecfs.scourt.go.kr/psp/index.on?m=PSP720M24',['특별한정','기여','유류분','유언집행','상속회복','상속재산','한정승인','진단서']),
  ('iros','https://www.iros.go.kr/index.jsp',[]),
  ('efamily','https://efamily.scourt.go.kr/cs/CsBltnWrtList.do?bltnbordId=0000005',[]),
  ('rent','https://www.renthome.go.kr/webportal/bbs/frmtDownload/frmtDownloadList.open',[]),
  ('taxinterpretation','https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=200000000000009274',[]),
  ('taxbusiness','https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=000000000000574762',[]),
 ]:
  page=ctx.new_page();cdp=ctx.new_cdp_session(page);events=[];payloads=[]
  def record(r):
   if r.request.resource_type in ('document','xhr','fetch'):
    ev={'url':r.url,'status':r.status,'method':r.request.method}
    if r.request.method=='POST':ev['post_data']=r.request.post_data
    events.append(ev)
    if r.status==200 and r.request.resource_type in ('xhr','fetch'):
     try:
      t=r.text()
      if len(t)<1500000:payloads.append({'url':r.url,'body':t,'sha256':digest(t.encode())})
     except Exception:pass
  page.on('response',record)
  def snap(label):
   resp=cdp.send('Runtime.evaluate',{'expression':expr,'returnByValue':True})
   d=resp.get('result',{}).get('value',{})
   save(DEST/(label+'.json'),{'url':page.url,'checked_at':now(),'events':events,'dom':d,'payloads':payloads,'protocol_errors':resp.get('exceptionDetails')})
   return d
  try:
   page.goto(url,wait_until='commit',timeout=20000);page.wait_for_timeout(11000);snap(key+'-loaded')
   for query in queries:
    js="""(()=>{let xs=Array.from(document.querySelectorAll('input[type=text]')).filter(e=>e.getClientRects().length);let e=xs.at(-1);if(!e)return 'no-input';e.value=QUERY;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));e.focus();return 'filled'})()""".replace('QUERY',json.dumps(query))
    cdp.send('Runtime.evaluate',{'expression':js,'returnByValue':True});page.keyboard.press('Enter');page.wait_for_timeout(2000);snap('court-'+query)
   if key=='iros':
    for label in ['고객센터','자료센터','등기신청양식']:
     js="""(()=>{let a=Array.from(document.querySelectorAll('a,button,span')).find(a=>a.getClientRects().length&&a.textContent.trim()===LABEL);if(a){a.click();return true}return false})()""".replace('LABEL',json.dumps(label))
     cdp.send('Runtime.evaluate',{'expression':js,'returnByValue':True});page.wait_for_timeout(2500);snap('iros-'+label)
   if key=='rent':
    page.evaluate('() => fn_selectList(2)');page.wait_for_timeout(2500);snap('rent-page2')
  except Exception as e:save(DEST/(key+'-browser-failure.json'),{'url':url,'error':str(e),'checked_at':now(),'events':events})
  finally:page.close()
 browser.close()
persist()
exec(compile('# Extend the catalog'+hs.split('# Extend the catalog',1)[1],str(hp),'exec'),globals())
save(DEST/'batch-result.json',{'checked_at':now(),'newly_completed_ids':[r['id'] for r in results if r['status']=='확인 완료' and r['id'] not in before],
 'remaining_ids':[r['id'] for r in results if r['status']!='확인 완료']})
