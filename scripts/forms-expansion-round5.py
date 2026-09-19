"""Continue the finite 109-task collection, using public search controls only.
No login, case records, or private data are accessed. A search-box echo is not
form evidence: only matching rows with a confirmed form attachment qualify.
"""
from pathlib import Path
from urllib.parse import urljoin
import json, re, traceback
from playwright.sync_api import sync_playwright
hp=Path(__file__).with_name('forms-expansion-collect.py'); hs=hp.read_text()
exec(compile(hs.split('# These short Korean-law addresses')[0], str(hp), 'exec'), globals())
DEST=OUT/'round5'; DEST.mkdir(parents=True, exist_ok=True)
checkpoints.update(range(10, sum(r['status']=='확인 완료' for r in results)+1, 10))
START_DONE={r['id'] for r in results if r['status']=='확인 완료'}

# Do not make a narrower guardianship record satisfy an extension automatically.
# The existing artifact contains the exact court-provided linked attachments.
target=byid['P1-22']
if target['status']=='확인 완료':
    evidence=target.get('source_evidence',{})
    byid['P8-07']['attempts']=byid['P8-07'].get('attempts',[])+[{'checked_at':now(),'result':'Rechecking attached diagnostic and property forms; not assuming target alone completes extension.'}]

DOM="""() => ({url:location.href,text:document.body ? document.body.innerText : '',
 links:Array.prototype.map.call(document.querySelectorAll('a'),a=>({text:a.textContent.trim(),url:a.href,onclick:a.getAttribute('onclick'),id:a.id})),
 inputs:Array.prototype.map.call(document.querySelectorAll('input,select,button'),a=>({tag:a.tagName,type:a.type,id:a.id,name:a.name,value:a.value,text:a.textContent,title:a.title,visible:!!(a.offsetWidth||a.offsetHeight||a.getClientRects().length)})),
 rows:Array.prototype.map.call(document.querySelectorAll('tr'),a=>({text:a.innerText,html:a.outerHTML})),
 scripts:Array.prototype.map.call(document.querySelectorAll('script[src]'),a=>a.src)})"""
queries={
 '상속':[('P0-07',['상속','포기']),('P0-08',['상속','한정승인']),('P0-09',['상속재산목록']),('P0-10',['특별한정승인']),('P1-18',['상속재산','분할']),('P1-21',['상속재산','관리인']),('P8-02',['상속','회복']),('P8-04',['상속재산','파산'])],
 '유언':[('P1-15',['유언','검인']),('P1-16',['유언집행자','선임'])],
 '기여분':[('P1-19',['기여분'])],
 '유류분':[('P1-20',['유류분'])],
 '특별대리인':[('P8-01',['특별대리인','선임'])],
 '친생자':[('P8-03',['친생자관계','존부'])],
 '부재자':[('P1-23',['부재자','재산관리'])],
 '실종':[], '인지':[], '한정승인':[('P0-10',['특별한정승인'])],
}
with sync_playwright() as p:
    browser=p.chromium.launch()
    ctx=browser.new_context(locale='ko-KR',accept_downloads=True)
    ctx.set_default_timeout(8000)
    page=ctx.new_page(); network=[]
    def record(response):
        if response.request.resource_type in ('xhr','fetch','document'):
            item={'url':response.url,'status':response.status,'method':response.request.method}
            if 'selectNboard' in response.url:
                item['request_body']=response.request.post_data
                try:item['response_text']=response.text()
                except Exception:pass
            network.append(item)
    page.on('response',record)
    source='https://ecfs.scourt.go.kr/psp/index.on?m=PSP720M24'
    court_rows=[]
    try:
        response=page.goto(source,wait_until='commit',timeout=30000)
        if not response or response.status!=200:raise ValueError('court document HTTP not 200')
        for _ in range(20):
            if page.evaluate("!!document.getElementById('mf_pfwork_ibx_searchWord')"):break
            page.wait_for_timeout(1000)
        save(DEST/'court-initial.json',page.evaluate(DOM))
        # These IDs were observed in the preceding public-page evidence.
        for query,jobs in queries.items():
            try:
                page.evaluate("""q=>{const x=document.getElementById('mf_pfwork_ibx_searchWord');
                  if(!x)throw Error('observed search control unavailable');x.focus();x.value=q;
                  x.dispatchEvent(new Event('input',{bubbles:true}));x.dispatchEvent(new Event('change',{bubbles:true}));
                  const b=document.getElementById('mf_pfwork_btn_search');if(!b)throw Error('observed search button unavailable');b.click();}""",query)
                page.wait_for_timeout(1500)
                d=page.evaluate(DOM);save(DEST/('court-'+query+'.json'),d)
                row_texts=[row for row in d['rows'] if '<td' in row['html']]
                court_rows.extend(row_texts)
                for ident,terms in jobs:
                    if byid[ident]['status']=='확인 완료':continue
                    matches=[row for row in row_texts if all(norm(t) in norm(row['text']) for t in terms)]
                    if not matches:
                        fail(ident,'공식 검색결과에서 요청 서식 행 미확인',source);continue
                    row=matches[0]
                    # A form-list record must expose an attachment/download control.
                    if not any(s in row['html'].lower() for s in ['download','첨부','파일','hwp','pdf','file','img','button','href']):
                        fail(ident,'서식 제목은 있으나 첨부 제어 미확인',source);continue
                    # P1-23 and P8-03 are multi-document requests, finalized after all queries.
                    if ident in ('P1-23','P8-03'):continue
                    ev={'http_status':200,'checked_at':now(),'body_sha256':digest(d['text'].encode()),'search_query':query,'matched_row':row['text'],'evidence_file':str((DEST/('court-'+query+'.json')).relative_to(ROOT))}
                    complete(ident,source,ev,'대한민국 법원 전자소송포털',note='전자소송포털 양식모음에서 검색어 «'+query+'»로 «'+row['text'].strip()+'» 항목을 확인했습니다. 개별 사정에 맞는 서식은 원문에서 선택하세요. 법원 양식의 개별 재배포 조건은 확인 전이므로 기관 제공처로 연결합니다.',license_text='공식 제공처 연결 · 개별 첨부 재배포 조건 미확인')
                # Read the observed public form-page XML for precise download/navigation metadata.
                for e in list(network):
                    if 'PSP720M24.xml' in e['url'] and e['status']==200:
                        r=ctx.request.get(e['url']);save(DEST/'court-screen-definition.json',{'url':e['url'],'status':r.status,'text':r.text()});break
            except Exception as e:
                save(DEST/('court-'+query+'-failure.json'),{'error':str(e),'checked_at':now()})
        # Distinct companion forms must both be present for combined requests.
        for ident,groups in [('P1-23',[['부재자','재산관리'],['실종','선고']]),('P8-03',[['친생자관계','존부'],['인지']])]:
            matched=[]
            for terms in groups:
                found=[r for r in court_rows if all(norm(t) in norm(r['text']) for t in terms)]
                if found:matched.append(found[0]['text'])
            if len(matched)==len(groups):
                complete(ident,source,{'http_status':200,'checked_at':now(),'matched_rows':matched},'대한민국 법원 전자소송포털',note='전자소송포털 양식모음에서 관련 신청 양식들을 확인했습니다: '+' / '.join(matched)+'. 각 절차는 서로 다르므로 해당 사건의 양식을 선택하세요.',license_text='공식 제공처 연결 · 개별 첨부 재배포 조건 미확인')
    except Exception as e:save(DEST/'court-failure.json',{'error':str(e),'traceback':traceback.format_exc(),'checked_at':now()})
    save(DEST/'court-network.json',network)
    page.close()

    # The older family-registration page overrides JS collection prototypes.
    # Native DOM evaluation avoids the locator engine conflict without changing site security.
    page=ctx.new_page()
    src='https://efamily.scourt.go.kr/cs/CsBltnWrtList.do?bltnbordId=0000005'
    try:
        r=page.goto(src,wait_until='commit',timeout=30000)
        if not r or r.status!=200:raise ValueError('family list HTTP not 200')
        page.wait_for_timeout(2500)
        d=page.evaluate(DOM);save(DEST/'efamily-before.json',d)
        controls=[x for x in d['inputs'] if x['type']=='text' and x.get('visible')]
        if controls:
            field=controls[-1]
            page.evaluate("""o=>{const x=document.getElementById(o.id)||document.querySelector('[name="'+o.name+'"]');
             if(!x)throw Error('search input missing');x.value='사망';x.dispatchEvent(new Event('change',{bubbles:true}));
             const nodes=document.querySelectorAll('button,a,input[type=button],input[type=submit]');
             for(let i=0;i<nodes.length;i++){const a=nodes[i];const t=(a.textContent||a.value||'').trim();if(t==='조회'){a.click();return;}}
             throw Error('observed search button not found');}""",field)
            page.wait_for_timeout(1800)
        d=page.evaluate(DOM);save(DEST/'efamily-after.json',d)
        rows=[r for r in d['rows'] if '사망신고서' in norm(r['text']) and '<td' in r['html']]
        if rows:
            complete('P0-05',src,{'http_status':200,'checked_at':now(),'matched_rows':[r['text'] for r in rows],'body_sha256':digest(d['text'].encode())},'대법원 전자가족관계등록시스템',note='공식 신청서 양식 목록의 사망신고서를 확인했습니다. 검색어 «사망»으로 해당 양식과 작성방법을 확인하세요.',license_text='공식 제공처 연결 · 서식 재배포 조건 미확인')
        else:fail('P0-05','검색 응답은 수신했으나 사망신고서 행 미확인',src)
    except Exception as e:fail('P0-05',str(e),src)
    page.close()
    family_guides=[('가족관계증명서','https://efamily.scourt.go.kr/cs/CsBltnWrtGuide.do?bltnbordId=0000007&guideCd=0000007001&guideYn=Y'),('기본증명서','https://efamily.scourt.go.kr/cs/CsBltnWrtGuide.do?bltnbordId=0000007&guideCd=0000007002&guideYn=Y'),('제적','https://efamily.scourt.go.kr/cs/CsBltnWrtGuide.do?bltnbordId=0000007&guideCd=0000007007&guideYn=Y')]
    guides=[]
    for label,url in family_guides:
        pg=ctx.new_page()
        try:
            rp=pg.goto(url,wait_until='commit',timeout=25000);pg.wait_for_timeout(700)
            dd=pg.evaluate(DOM);save(DEST/('efamily-guide-'+label+'.json'),dd)
            if rp and rp.status==200 and label in norm(dd['text']):guides.append({'url':pg.url,'http_status':200,'matched':label,'sha256':digest(dd['text'].encode()),'checked_at':now()})
        except Exception as e:save(DEST/('efamily-guide-'+label+'-failure.json'),{'error':str(e)})
        finally:pg.close()
    if len(guides)==3:complete('P0-06',family_guides[0][1],{'http_status':200,'pages':guides,'checked_at':now()},'대법원 전자가족관계등록시스템',note='가족관계증명서·기본증명서의 종류 및 상세 증명서, 제적등·초본 발급 안내를 각각 확인했습니다. 제출기관이 요구하는 증명서 종류를 확인한 뒤 발급하세요.')
    else:fail('P0-06','세 종류 발급 안내 중 '+str(len(guides))+'개만 확인',family_guides[0][1])

    # Discover only actual public navigation/data references in the downloaded iros page.
    pg=ctx.new_page();events=[]
    pg.on('response',lambda r:events.append({'url':r.url,'status':r.status}) if r.request.resource_type in ('document','xhr','fetch','script') else None)
    try:
        pg.goto('https://www.iros.go.kr/',wait_until='commit',timeout=25000);pg.wait_for_timeout(14000)
        d=pg.evaluate(DOM);save(DEST/'iros-native-dom.json',d)
        for ev in list(events):
            if ev['status']==200 and any(s in ev['url'] for s in ['Pm10P0IrosMain.xml','Pm10ComMenu.js']):
                rr=ctx.request.get(ev['url'],timeout=15000)
                save(DEST/('iros-resource-'+digest(ev['url'].encode())[:12]+'.json'),{'url':ev['url'],'status':rr.status,'text':rr.text()})
        save(DEST/'iros-network.json',events)
    except Exception as e:save(DEST/'iros-failure.json',{'error':str(e),'events':events})
    finally:pg.close()
    browser.close()
persist()
exec(compile('# Extend the catalog'+hs.split('# Extend the catalog',1)[1],str(hp),'exec'),globals())
print('NEW_DONE',','.join(r['id'] for r in results if r['status']=='확인 완료' and r['id'] not in START_DONE),flush=True)
