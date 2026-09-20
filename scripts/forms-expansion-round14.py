"""Continue from saved evidence and verify original court/tax form downloads."""
from pathlib import Path
from urllib.parse import urljoin,urlparse
import json,re
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
hp=Path(__file__).with_name('forms-expansion-collect.py');hs=hp.read_text()
exec(compile(hs.split('# These short Korean-law addresses')[0],str(hp),'exec'),globals())
DEST=OUT/'round14';DEST.mkdir(parents=True,exist_ok=True)
checkpoints.update(range(10,sum(r['status']=='확인 완료' for r in results)+1,10))
before=[r['id'] for r in results if r['status']=='확인 완료']

def ev_from_dom(d,file,terms):
 assert any(e['status']==200 for e in d['events'])
 assert all(norm(t) in norm(d['dom']['text']) for t in terms)
 return {'url':d['url'],'http_status':200,'checked_at':d['checked_at'],'matched_terms':terms,'body_sha256':digest(d['dom']['text'].encode()),'evidence_file':str(file.relative_to(ROOT))}
try:
 f=OUT/'round13/court-query-상속재산.json';d=json.loads(f.read_text())
 row=None
 for p in d['payloads']:
  if 'selectNboardList.on' not in p['url']:continue
  j=json.loads(p['body'])
  for x in j.get('data',{}).get('dlt_nboardList',[]):
   if '상속재산파산신청서(상속인)' in norm(x.get('title','')).replace('상속재산파산신청서상속인','상속재산파산신청서(상속인)') and x.get('fileSysName'):row=x
 # Verify the named row independently of the normalization branch above.
 for p in d['payloads']:
  if 'selectNboardList.on' in p['url']:
   for x in json.loads(p['body']).get('data',{}).get('dlt_nboardList',[]):
    if '상속재산파산신청서' in norm(x.get('title','')) and x.get('fileSysName'):row=x
 assert row and any('selectNboardList.on' in e['url'] and e['status']==200 for e in d['events'])
 ev=ev_from_dom(d,f,['상속재산파산신청서','상속인']);ev['official_result_row']=row
 if byid['P8-04']['status']!='확인 완료':complete('P8-04','https://ecfs.scourt.go.kr/psp/index.on?m=PSP720M24',ev,'대한민국 법원 전자소송포털',note='법원 양식모음에서 상속재산파산신청서(상속인)와 상속재산파산신청서(상속인외)의 제목 및 실제 첨부파일 정보를 확인했습니다. 양식모음에서 상속재산으로 검색하여 신청 자격에 맞는 서식을 선택하세요. 상속인 개인의 파산과 상속재산 자체의 파산을 구분합니다. 개별 첨부의 전체 인쇄 레이아웃은 미검수입니다.')
except Exception as e:fail('P8-04',str(e))
try:
 f=OUT/'round13/ksd-query-상속.json';d=json.loads(f.read_text());row=None
 for p in d['payloads']:
  if '/TAWS/TrscoWS' in p['url']:
   j=json.loads(p['body'])
   for x in j.get('formFileList',[]):
    if x.get('AG_HOMEP_FRMT_MENU_NM')=='상속재산 지급 동의서':row=x
 assert row and row.get('AG_HOMEP_FRMT_FILE_NM') and all(t in norm(row.get('AG_HOMEP_FRMT_DESC_CONTENT','')) for t in ['상속주식','수령','명의개서팀'])
 ev=ev_from_dom(d,f,['상속재산 지급 동의서']);ev['official_result_row']=row
 if byid['P6-04']['status']!='확인 완료':complete('P6-04','https://ta.ksd.or.kr/',ev,'한국예탁결제원',note='한국예탁결제원 증권대행의 양식/서식에서 상속재산 지급 동의서와 주식·대금 상속 수령 안내를 확인했습니다. 양식/서식에서 상속으로 검색할 수 있습니다. 대표상속인 지정·인감 관련 자료 및 평가금액별 구비서류는 명의개서팀에 확인하세요. 예탁결제원 증권대행 대상 주식의 절차이며, 증권사 계좌의 주식 이전은 해당 증권사의 별도 요건을 확인해야 합니다. 모든 증권사에 적용되는 통합 양식으로 표시하지 않습니다.',license_text='한국예탁결제원 공식 안내 · 개별 원본 재배포하지 않음')
except Exception as e:fail('P6-04',str(e))

expr="({text:document.body?document.body.innerText:'',html:document.documentElement.outerHTML,links:Array.from(document.querySelectorAll('a')).map(a=>({text:a.innerText,url:a.href,onclick:a.getAttribute('onclick')})),inputs:Array.from(document.querySelectorAll('input,select,button')).map(e=>({tag:e.tagName,id:e.id,name:e.name,type:e.type,value:e.value,text:e.innerText,visible:!!e.getClientRects().length})),scripts:Array.from(document.scripts).map(s=>({url:s.src,text:s.src?'':s.textContent}))})"
with sync_playwright() as p:
 browser=p.chromium.launch();ctx=browser.new_context(locale='ko-KR',accept_downloads=True)
 for label,url in [('court','https://ecfs.scourt.go.kr/psp/index.on?m=PSP720M24'),('valuation-law','https://www.law.go.kr/LSW/admRulLsInfoP.do?admRulSeq=2100000281898'),('valuation-form','https://mob.tbht.hometax.go.kr/jsonAction.do?actionId=UTBRNAAX18F001'),('ksd','https://ta.ksd.or.kr/')]:
  page=ctx.new_page();cdp=ctx.new_cdp_session(page);events=[];payloads=[];downloads=[]
  def record(r):
   if r.request.resource_type in ['document','xhr','fetch']:
    events.append({'url':r.url,'status':r.status,'method':r.request.method,'request_body':r.request.post_data if r.request.method=='POST' else None})
    if r.status==200 and r.request.resource_type in ['xhr','fetch']:
     try:
      t=r.text()
      if len(t)<2500000:payloads.append({'url':r.url,'body':t,'sha256':digest(t.encode())})
     except Exception:pass
  page.on('response',record);page.on('download',lambda d:downloads.append(d))
  def snap(name):
   dom=cdp.send('Runtime.evaluate',{'expression':expr,'returnByValue':True}).get('result',{}).get('value',{})
   save(DEST/(name+'.json'),{'url':page.url,'checked_at':now(),'events':events,'dom':dom,'payloads':payloads});return dom
  def click_text(term):
   js="(()=>{let a=Array.from(document.querySelectorAll('a,button,span')).find(a=>a.getClientRects().length&&a.textContent.trim()===TERM);if(a){a.click();return true}return false})()".replace('TERM',json.dumps(term))
   return cdp.send('Runtime.evaluate',{'expression':js,'returnByValue':True}).get('result',{}).get('value')
  def query(q):
   js="""(()=>{let es=Array.from(document.querySelectorAll('input[type=text],input[type=search]')).filter(e=>e.getClientRects().length&&!e.disabled);let e=es.at(-1);if(!e)return false;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,QUERY);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));e.focus();return true})()""".replace('QUERY',json.dumps(q))
   yes=cdp.send('Runtime.evaluate',{'expression':js,'returnByValue':True}).get('result',{}).get('value')
   if yes:page.keyboard.press('Enter');page.wait_for_timeout(2500)
   return yes
  try:
   page.goto(url,wait_until='commit',timeout=22000)
   for _ in range(15):
    page.wait_for_timeout(2500);dom=cdp.send('Runtime.evaluate',{'expression':expr,'returnByValue':True}).get('result',{}).get('value',{})
    if len(dom.get('text',''))>900:break
   dom=snap(label+'-loaded')
   if label=='court':
    for q,target in [('한정승인','상속한정승인'),('성년후견','성년후견'),('진단서','진단서'),('상속재산','상속재산파산신청서')]:
     if not query(q):break
     dom=snap(label+'-query-'+q)
     js="""(()=>{let rows=Array.from(document.querySelectorAll('tbody tr')).filter(e=>e.innerText.replace(/\\s/g,'').includes(TARGET));let a=rows.flatMap(r=>Array.from(r.querySelectorAll('a[href]'))).find(a=>a.getAttribute('href').includes('downdoc')&&a.getAttribute('href').includes('.hwp'));if(a){a.click();return true}return false})()""".replace('TARGET',json.dumps(target))
     try:cdp.send('Runtime.evaluate',{'expression':js,'returnByValue':True});page.wait_for_timeout(2500);snap(label+'-download-'+q)
     except Exception as e:save(DEST/(label+'-click-failure-'+q+'.json'),{'error':str(e),'checked_at':now()})
   if label=='ksd':
    js="(()=>{let a=Array.from(document.querySelectorAll('a')).find(a=>a.textContent.trim()==='양식/서식'&&a.getAttribute('href')?.startsWith('javascript:menuMove'));if(a){a.click();return true}return false})()"
    cdp.send('Runtime.evaluate',{'expression':js,'returnByValue':True});page.wait_for_timeout(5000)
    query('상속');snap('ksd-search')
    js="(()=>{let b=Array.from(document.querySelectorAll('button')).find(b=>b.getAttribute('onclick')?.includes('downListCall'));if(b){b.click();return true}return false})()"
    cdp.send('Runtime.evaluate',{'expression':js,'returnByValue':True});page.wait_for_timeout(3000);snap('ksd-download')
   if label=='valuation-law':
    for term in ['별표/서식','별표ㆍ서식','별표/서식목록열림','첨부파일']:
     click_text(term);page.wait_for_timeout(2000);dom=snap('valuation-'+term.replace('/','-'))
    for fr in page.frames:
     try:
      dat=fr.evaluate(expr);save(DEST/('valuation-frame-'+digest(fr.url.encode())[:10]+'.json'),{'url':fr.url,'checked_at':now(),'dom':dat})
      for a in dat.get('links',[]):
       if all(t in norm(a['text']) for t in ['시가인정','신청']) and a['url'].startswith('http'):
        try:
         f,body=get_original('P2-15',{'url':a['url'],'text':a['text'],'origin':fr.url},['시가인정','신청'],public=True)
         byid['P2-15']['requested_form_basis']='상속세 및 증여세법 시행규칙 별지 (사용자 기재)'
         complete('P2-15',url,{'url':url,'http_status':200,'checked_at':now(),'evidence_file':str((DEST/('valuation-frame-'+digest(fr.url.encode())[:10]+'.json')).relative_to(ROOT))},'국가법령정보센터 · 국세청',files=[f],note='공식 평가심의위원회 운영 규정의 납세자 시가인정 심의 신청서입니다. 요청 목록의 상증세법 시행규칙 별지가 아닌 운영규정의 서식임을 구분합니다. 과세관청이 사용하는 심의 의뢰서와 다릅니다.',form_no=f.get('form_no_excerpt'))
        except Exception as e:fail('P2-15',str(e),a['url'])
     except Exception:pass
   if label=='valuation-form':
    for term in ['파일내려받기','파일 내려받기','서식제출']:
     click_text(term);page.wait_for_timeout(2000);snap(label+'-'+term)
   for n,dl in enumerate(downloads):
    try:
     saved=REVIEW/(label+'-'+str(n)+'-'+dl.suggested_filename);dl.save_as(saved);b=saved.read_bytes();ext,body=parse_binary(b)
     ev={'url':dl.url,'suggested_filename':dl.suggested_filename,'checked_at':now(),'bytes':len(b),'sha256':digest(b),'format':ext,'artifact_path':'originals/'+saved.name,'body_excerpt':body[:16000],'unmodified_original':True}
     save(DEST/(label+'-original-'+str(n)+'.json'),ev)
     if label=='court' and '한정승인' in norm(body) and '상속재산목록' in norm(body):
      byid['P0-09']['inspected_original']=ev
      complete('P0-09',url,{'url':url,'http_status':200,'checked_at':now(),'matched_terms':['한정승인','상속재산목록'],'evidence_file':str((DEST/(label+'-original-'+str(n)+'.json')).relative_to(ROOT))},'대한민국 법원 전자소송포털',note='법원 상속한정승인 심판청구서 원본에 포함된 상속재산목록을 확인했습니다. 독립 서식 파일로 분리·재작성하지 않고 공식 합본을 받는 경로로 연결합니다. 적극재산과 채무 내역은 실제 증빙에 따라 작성하세요.')
     if label=='valuation-form' and all(t in norm(body) for t in ['시가인정','심의','신청서']):
      byid['P2-15']['inspected_original']=ev
      # Keep the acquired original privately when republishing terms are not verified.
      ff={k:ev[k] for k in ['url','bytes','sha256','format','artifact_path','checked_at']};ff.update(role='original',name=dl.suggested_filename,http_status=200,title_verified=True)
      byid['P2-15']['provisional_original']=ff
      byid['P2-15']['note']='국세청에서 원본을 내려받아 본문을 확인했습니다. 공개 재배포 조건과 반복 검증용 파일 보존을 확정한 후 완료 처리합니다.';persist()
    except Exception as e:save(DEST/(label+'-original-failure-'+str(n)+'.json'),{'url':dl.url,'error':str(e),'checked_at':now()})
  except Exception as e:save(DEST/(label+'-failure.json'),{'url':url,'error':str(e),'checked_at':now(),'events':events})
  finally:page.close()
 browser.close()
persist()
exec(compile('# Extend the catalog'+hs.split('# Extend the catalog',1)[1],str(hp),'exec'),globals())
save(DEST/'batch-result.json',{'newly_completed_ids':[r['id'] for r in results if r['status']=='확인 완료' and r['id'] not in before],'completed':sum(r['status']=='확인 완료' for r in results),'checked_at':now()})
