"""Resume the 109-task backlog using actual rendered institutional pages.

This is a finite collection run, not a simulated verification. Homepage status
codes are not accepted as proof of a requested form. Existing annex bundles are
reused only after checking their original bytes and the requested annex title.
"""
from pathlib import Path
from urllib.parse import unquote, urljoin, urlparse, quote
import json, re, hashlib, copy, time
from playwright.sync_api import sync_playwright

# Reuse the already-reviewed parsing, record and checkpoint functions, without
# running its HTTP collection stage. Both files live in the same scripts folder.
helper_path=Path(__file__).with_name('forms-expansion-collect.py')
helper_source=helper_path.read_text(encoding='utf-8')
exec(compile(helper_source.split('# These short Korean-law addresses')[0],str(helper_path),'exec'),globals())
BROWSER_OUT=OUT/'browser';BROWSER_OUT.mkdir(parents=True,exist_ok=True)

# Original legal bundles already downloaded from official sources contain these
# requested annexes. Do not alter the source bundle or its existing catalog card.
reuse={
 'P5-02':('NTS-IG-12',['창업자금','증여재산평가','과세가액 계산명세서']),
 'P5-03':('NTS-IG-12',['가업승계','증여재산평가','과세가액 계산명세서']),
 'P5-04':('NTS-IG-11',['증여재산 및 평가명세서']),
 'P5-05':('NTS-IG-10',['상속인별 상속재산 및 그 평가명세서']),
}
for ident,(legacy_id,terms) in reuse.items():
    if byid[ident]['status']=='확인 완료':continue
    old=next(d for d in legacy['documents'] if d['id']==legacy_id)
    matched=False
    for f in old.get('files',[]):
        if f['format'].lower() not in ('hwp','hwpx'):continue
        local=ROOT/'public'/unquote(f['path']).lstrip('/')
        if not local.is_file():continue
        b=local.read_bytes()
        if hashlib.sha256(b).hexdigest()!=f.get('sha256'):continue
        try:ext,text=parse_binary(b)
        except Exception:continue
        if not all(norm(t) in norm(text) for t in terms):continue
        reused={'name':f['name'],'url':f.get('sourceUrl'),'path':str(local.relative_to(ROOT)),'local_url':f['path'],
            'bytes':len(b),'sha256':f['sha256'],'format':ext,'http_status':200,'title_verified':True,
            'checked_at':f.get('checkedOn') or old.get('checkedOn'),'reused_from':legacy_id,
            'acquisition_note':'기존 공식 다운로드 원본을 재검수해 재사용. 이 기록은 이번 접속 성공을 주장하지 않습니다.'}
        ev={'type':'previous_official_acquisition_and_current_byte_inspection','legacy_id':legacy_id,
            'original_source_url':f.get('sourceUrl'),'original_checked_at':f.get('checkedOn'),'verified_sha256':f['sha256'],
            'current_inspection_at':now(),'matched_annex_titles':terms}
        byid[ident]['reused_from']=legacy_id
        complete(ident,f.get('sourcePage') or old['sourceUrl'],ev,'국가법령정보센터',[reused],
            note='공식 합본 안에 요청한 별지·부표가 들어 있습니다. 필요한 부표 제목을 확인해 사용하며, 원본 전체를 변경 없이 제공합니다.',
            form_no=old.get('form_no'),license_text=old.get('license'))
        matched=True;break
    if not matched:fail(ident,'기존 공식 합본의 실제 본문에서 요청한 부표를 확인하지 못했습니다.')

# Restore usable local URLs on previously verified public originals. Never copy
# the private FSS originals to public storage as part of this step.
for r in results:
    for f in r.get('files',[]):
        if f.get('path','').startswith('public/') and (ROOT/f['path']).is_file():
            f.setdefault('local_url','/'+quote(f['path'][7:],safe='/'))
persist()

law_jobs={
 '지방세특례제한법시행규칙':[('P0-14',[['지방세','감면','신청서']])],
 '국민연금법시행규칙':[('P0-16',[['유족연금','청구서'],['반환일시금','청구서'],['사망일시금','청구서']])],
 '자동차등록규칙':[('P1-24',[['이전등록','신청서']])],
 '법인세법시행규칙':[('P2-03',[['주식등변동상황명세서']])],
 '국세징수법시행규칙':[('P2-08',[['납세담보','제공서']])],
 '농지법시행규칙':[('P3-01',[['농지취득자격증명','신청서']])],
 '부동산거래신고등에관한법률시행규칙':[('P3-02',[['부동산','거래계약','신고서']]),('P4-01',[['주택취득자금','조달','입주계획서']]),('P4-02',[['토지취득자금','조달계획서']]),('P4-04',[['부동산','해제','신고서'],['부동산','변경','신고서']])],
 '조세특례제한법시행규칙':[('P5-01',[['영농자녀','증여농지','감면신청서']])],
 '상속세및증여세법시행규칙':[('P5-07',[['공익법인','출연재산','보고서']])],
 '지방세법시행규칙':[('P9-01',[['등록에대한등록면허세','신고서']])],
 '부가가치세법시행규칙':[('P9-04',[['휴업','폐업','신고서']])],
 '국제조세조정에관한법률시행규칙':[('P9-08',[['해외금융계좌','신고서']])],
}
known_law_pages={
 '부동산거래신고등에관한법률시행규칙':'https://www.law.go.kr/LSW//lsInfoP.do?ancYnChk=0&chrClsCd=010202&efYd=20260210&lsiSeq=283339&urlMode=lsInfoP',
 '상속세및증여세법시행규칙':'https://www.law.go.kr/lsInfoP.do?joNo=001700&lsId=007388',
 '지방세법시행규칙':'https://www.law.go.kr/lsInfoP.do?lsiSeq=287031',
 '조세특례제한법시행규칙':'https://www.law.go.kr/lsInfoP.do?lsiSeq=286381&viewCls=lsRvsDocInfoR',
 '부가가치세법시행규칙':'https://www.law.go.kr/LSW/lsInfoP.do?ancYnChk=0&chrClsCd=010202&efYd=20260320&lsiSeq=284995&urlMode=lsInfoP',
}
provider_jobs=json.loads((DOC/'browser-sources.json').read_text())
provider_jobs.update({
 'P0-05':{'url':'https://efamily.scourt.go.kr/cs/CsBltnWrtList.do?bltnbordId=0000005','terms':['사망신고서'],'institution':'대법원 전자가족관계등록시스템'},
 'P0-06':{'url':'https://efamily.scourt.go.kr/cs/CsBltnWrtGuide.do?bltnbordId=0000007&guideCd=0000007001&guideYn=Y','terms':['가족관계증명서','상세'],'institution':'대법원 전자가족관계등록시스템'},
 'P8-12':{'url':'https://egdrs.scourt.go.kr/','terms':['후견','등기사항증명서','부존재증명서'],'institution':'대법원 전자후견등기시스템'},
})
cache={}
with sync_playwright() as p:
    browser=p.chromium.launch()
    ctx=browser.new_context(locale='ko-KR',accept_downloads=True)
    ctx.set_default_timeout(5000)
    def inspect_rendered(url,law=False):
        if url in cache:return cache[url]
        page=ctx.new_page();events=[]
        page.on('response',lambda r: events.append({'url':r.url,'http_status':r.status}) if r.request.resource_type=='document' or 'flDownload' in r.url else None)
        try:
            try:response=page.goto(url,wait_until='domcontentloaded',timeout=22000)
            except Exception:
                response=None
                if not events:raise
            page.wait_for_timeout(1100)
            if law:
                for frame in page.frames:
                    try:
                        button=frame.get_by_text('별표·서식',exact=True)
                        if button.count():button.first.click(timeout=3000)
                    except Exception:pass
                page.wait_for_timeout(1100)
            if 'CsBltnWrtList.do' in url:
                for frame in page.frames:
                    try:
                        inputs=frame.locator('input[type="text"]')
                        if inputs.count():
                            inputs.first.fill('사망');inputs.first.press('Enter');page.wait_for_timeout(1200)
                    except Exception:pass
            texts=[];links=[];forms=[]
            for frame in page.frames:
                try:
                    texts.append(frame.locator('body').inner_text(timeout=4000))
                    links.extend(frame.locator('a').evaluate_all('(xs)=>xs.map(a=>({text:a.textContent.trim(),url:a.href,onclick:a.getAttribute("onclick")}))'))
                    forms.extend(frame.locator('form').evaluate_all('(xs)=>xs.map(f=>({action:f.action,method:f.method,fields:[...f.querySelectorAll("input,select")].map(x=>({name:x.name,type:x.type,value:x.value}))}))'))
                except Exception:pass
            statuses=[e for e in events if e['http_status']==200]
            if not statuses:raise ValueError('문서 응답 HTTP 200을 확보하지 못함')
            body='\n'.join(texts)
            if len(body)<30:raise ValueError('공식 페이지의 내용이 로드되지 않음')
            data={'requested_url':url,'url':page.url,'checked_at':now(),'http_status':200,'events':events,'text':body,
                'sha256':digest(body.encode()),'links':links,'forms':forms}
            cache[url]=data
            save(BROWSER_OUT/('page-'+hashlib.sha256(url.encode()).hexdigest()[:14]+'.json'),data)
            return data
        finally:page.close()
    def download_rendered(ident,link,terms):
        response=ctx.request.get(link['url'],timeout=22000,headers={'Referer':link.get('origin') or 'https://www.law.go.kr/'})
        if response.status!=200:raise ValueError('원본 HTTP '+str(response.status))
        b=response.body();ext,text=parse_binary(b)
        if not all(norm(t) in norm(text) for t in terms):raise ValueError('원본 본문에서 요청 서식명 불일치')
        sha=digest(b);name=f'{ident}_{sha[:12]}.{ext}';dest=PUB/name;dest.write_bytes(b)
        f={'name':link.get('text') or byid[ident]['title'],'url':response.url,'bytes':len(b),'sha256':sha,'format':ext,'role':'original','http_status':200,
            'checked_at':now(),'title_verified':True,'path':str(dest.relative_to(ROOT)),'local_url':'/downloads/official-forms/expansion/'+quote(name)}
        rev=re.search(r'(?:개정|신설)\s*(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})',text[:5000])
        if rev:f['revised_at']='%04d-%02d-%02d'%tuple(map(int,rev.groups()))
        save(BROWSER_OUT/(ident+'-'+sha[:12]+'.json'),{'file':f,'text_excerpt':text[:8000]})
        return f,text
    for instrument,jobs in law_jobs.items():
        if all(byid[i]['status']=='확인 완료' for i,_ in jobs):continue
        url=known_law_pages.get(instrument,'https://www.law.go.kr/법령/'+instrument)
        try:page=inspect_rendered(url,law=True)
        except Exception as e:
            for ident,_ in jobs:fail(ident,'공식 법령 브라우저 조회 실패: '+str(e)[:500],url)
            continue
        for ident,groups in jobs:
            if byid[ident]['status']=='확인 완료':continue
            acquired=[]
            try:
                for terms in groups:
                    options=[a for a in page['links'] if 'flDownload.do' in a.get('url','') and '.hwp' in a.get('text','').lower() and '.hwpx' not in a.get('text','').lower() and all(norm(t) in norm(a['text']) for t in terms)]
                    if ident=='P3-02':options=[a for a in options if not any(t in a['text'] for t in ['해제','변경','정정'])]
                    if ident=='P9-04':options=[a for a in options if '다단계' not in a['text']]
                    if not options:raise ValueError('실제 서식 목록에서 원본 첨부 링크를 확보하지 못함: '+','.join(terms))
                    f,text=download_rendered(ident,{**options[0],'origin':page['url']},terms)
                    if f['sha256'] not in {x['sha256'] for x in acquired}:acquired.append(f)
                byid[ident]['revised_at']=acquired[0].get('revised_at')
                number=re.search(r'\[([^]]*서식[^]]*)\]',options[0]['text'])
                form_no=instrument+' '+number.group(1) if number else None
                if ident=='P4-01':
                    ev=json.loads((BROWSER_OUT/(ident+'-'+acquired[0]['sha256'][:12]+'.json')).read_text())
                    if not all(norm(t) in norm(ev['text_excerpt']) for t in ['가상자산','사업자']):raise ValueError('요청한 2026년 개정 항목 확인 필요')
                complete(ident,page['url'],{'events':page['events'],'body_sha256':page['sha256'],'checked_at':page['checked_at']},'국가법령정보센터',acquired,
                    note='현행 공식 법령 페이지에서 요청 서식을 찾아 실제 원본의 본문과 형식을 확인했습니다. 합본의 부표는 해당 제목을 선택해 사용하세요.',form_no=form_no)
            except Exception as e:
                if acquired:byid[ident]['partial_files']=acquired
                fail(ident,str(e)[:600],page['url'])
    for ident,job in provider_jobs.items():
        if byid[ident]['status']=='확인 완료':continue
        try:
            data=inspect_rendered(job['url'])
            if not all(norm(t) in norm(data['text']) for t in job['terms']):raise ValueError('응답 본문에서 요청 서식·절차 존재를 확인하지 못함')
            if ident=='P0-06':
                for guide,terms in [('0000007002',['기본증명서','상세']),('0000007007',['제적'])]:
                    extra=inspect_rendered('https://efamily.scourt.go.kr/cs/CsBltnWrtGuide.do?bltnbordId=0000007&guideCd='+guide+'&guideYn=Y')
                    if not all(norm(t) in norm(extra['text']) for t in terms):raise ValueError('추가 증명서 안내 미확인')
            ev={'url':data['url'],'http_status':200,'checked_at':data['checked_at'],'body_sha256':data['sha256'],'verified_terms':job['terms']}
            complete(ident,data['url'],ev,job['institution'],note=job.get('note'))
        except Exception as e:fail(ident,'공식 제공처 확인 실패: '+str(e)[:600],job['url'])

    # Discover search controls and actual registration-form links. Do not invent
    # individual form IDs or silently replace iros URLs with generic homepages.
    for label,url in [('court','https://www.scourt.go.kr/nm/minwon/doc/DocListAction.work'),('iros','https://www.iros.go.kr/')]:
        try:
            data=inspect_rendered(url)
            save(BROWSER_OUT/(label+'-navigation.json'),data)
        except Exception as e:save(BROWSER_OUT/(label+'-navigation.json'),{'url':url,'error':str(e),'checked_at':now()})
    browser.close()

if byid['P3-02']['status']=='확인 완료':
    target=byid['P3-02'];r=byid['P4-03']
    r.update(status='확인 완료',alias_verified=True,source_url=target['source_url'],checked_at=target['checked_at'],files=copy.deepcopy(target['files']),
             source_type='원본',license=target['license'],note='첨부에서 지정한 중복. P3-02와 같은 원본·카드로 통합했습니다.')
persist()
# Run only the existing pure catalog builder, not its earlier network loops.
exec(compile(helper_source.split('# Extend the catalog without rewriting any existing record.')[1],str(helper_path),'exec'),globals())
