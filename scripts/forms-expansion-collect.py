"""Finite, incremental collection of the user's 109 requested form tasks.
Never mark a homepage response as a specific form; preserve original bytes and
separate acquisition from permission to rehost. Run from a clean checked-out ref.
"""
from pathlib import Path
from urllib.parse import urljoin, urlparse, quote
from concurrent.futures import ThreadPoolExecutor
import copy, hashlib, io, json, re, struct, time, zipfile, zlib
import requests, olefile
from bs4 import BeautifulSoup
from pypdf import PdfReader

ROOT=Path(__file__).resolve().parents[1]
DOC=ROOT/'docs/forms-expansion-109'
OUT=DOC/'evidence'; OUT.mkdir(parents=True,exist_ok=True)
PUB=ROOT/'public/downloads/official-forms/expansion'; PUB.mkdir(parents=True,exist_ok=True)
REVIEW=ROOT/'.tmp/forms-expansion-proof/originals'; REVIEW.mkdir(parents=True,exist_ok=True)
MP=ROOT/'public/downloads/official-forms/manifest.json'
results=json.loads((DOC/'results.json').read_text())
byid={r['id']:r for r in results}
legacy=json.loads((DOC/'legacy-manifest.json').read_text())
checkpoints=set()

def now(): return time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
def norm(s): return re.sub(r'[^가-힣A-Za-z0-9]','',s or '')
def save(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def digest(b): return hashlib.sha256(b).hexdigest()
def parse_binary(b):
    if b.startswith(b'%PDF-'): return 'pdf','\n'.join(p.extract_text() or '' for p in PdfReader(io.BytesIO(b)).pages)
    if b.startswith(b'PK'):
        with zipfile.ZipFile(io.BytesIO(b)) as z:
            names=[n for n in z.namelist() if n.startswith('Contents/section') and n.endswith('.xml')]
            if names: return 'hwpx','\n'.join(BeautifulSoup(z.read(n),'xml').get_text(' ') for n in names)
            if 'word/document.xml' in z.namelist(): return 'docx',BeautifulSoup(z.read('word/document.xml'),'xml').get_text(' ')
    if b.startswith(bytes.fromhex('d0cf11e0')):
        with olefile.OleFileIO(io.BytesIO(b)) as f:
            if not f.exists('FileHeader'): raise ValueError('HWP FileHeader 없음')
            header=f.openstream('FileHeader').read()
            if not header.startswith(b'HWP Document File'): raise ValueError('HWP 서명 불일치')
            compressed=struct.unpack_from('<I',header,36)[0]&1
            parts=[]
            for name in f.listdir():
                if len(name)!=2 or name[0]!='BodyText': continue
                data=f.openstream(name).read(); data=zlib.decompress(data,-15) if compressed else data
                pos=0
                while pos+4<=len(data):
                    h=struct.unpack_from('<I',data,pos)[0]; pos+=4; size=h>>20
                    if size==4095:
                        if pos+4>len(data): break
                        size=struct.unpack_from('<I',data,pos)[0]; pos+=4
                    if (h&1023)==67: parts.append(data[pos:pos+size].decode('utf-16le',errors='ignore'))
                    pos+=size
            if not parts and f.exists('PrvText'): parts=[f.openstream('PrvText').read().decode('utf-16le',errors='ignore')]
            return 'hwp','\n'.join(parts)
    raise ValueError('HWP/HWPX/DOCX/PDF 바이너리 확인 실패')

def http(url,method='GET',data=None):
    response=requests.request(method,url,data=data,timeout=(9,22),headers={'User-Agent':'Mozilla/5.0','Accept-Language':'ko-KR,ko;q=0.9'})
    if response.status_code!=200: raise ValueError('HTTP '+str(response.status_code))
    if len(response.content)>30_000_000: raise ValueError('검토 파일 크기 제한 초과')
    return response

def inspect_page(url):
    chain=[]; seen=set(); queue=[url]; links=[]; texts=[]
    while queue and len(seen)<5:
        current=queue.pop(0)
        if current in seen: continue
        seen.add(current)
        response=http(current)
        response.encoding=response.apparent_encoding or 'utf-8'
        soup=BeautifulSoup(response.text,'html.parser')
        chain.append({'url':response.url,'http_status':200,'sha256':digest(response.content),'checked_at':now()})
        texts.append(soup.get_text(' ',strip=True))
        for a in soup.select('a[href]'):
            href=urljoin(response.url,a.get('href',''))
            if href.startswith('https://'):
                links.append({'text':a.get_text(' ',strip=True),'url':href,'onclick':a.get('onclick'),'origin':response.url})
        # Follow only iframe/frame sources actually present in the official page.
        for f in soup.select('iframe[src],frame[src]'):
            target=urljoin(response.url,f['src'])
            if urlparse(target).netloc==urlparse(response.url).netloc: queue.append(target)
    return {'requested_url':url,'checked_at':now(),'http_status':200,'chain':chain,'text':'\n'.join(texts),'links':links}

def persist():
    for r in results:
        if r['operation']=='alias':
            target=byid[r['target_id']]
            # An extension task is not complete merely because a narrower target exists.
            if r.get('alias_verified') and target['status']=='확인 완료': r['status']='확인 완료'
    save(DOC/'results.json',results)
    text=(ROOT/'tasks.md').read_text()
    for r in results:
        text=re.sub(r'^- \[[ x]\] '+re.escape(r['id'])+' ',f'- [{"x" if r["status"]=="확인 완료" else " "}] '+r['id']+' ',text,flags=re.M)
    text=re.sub(r'\n## 집계[\s\S]*$','',text)
    done=[r['id'] for r in results if r['status']=='확인 완료']
    text+=f'\n## 집계\n확인 완료 {len(done)}/109 · 미체크 {109-len(done)}. 원본 파일 확보·공개 재배포·출처 확인은 별도 기록합니다.\n'
    (ROOT/'tasks.md').write_text(text,encoding='utf-8')
    summary={'requested_tasks':109,'first_batch':61,'second_batch':48,'existing_records':74,'new_unique_records':103,'manifest_records':177,
      'completed':len(done),'unchecked':109-len(done),'completed_ids':done,'pending_ids':[r['id'] for r in results if r['status']!='확인 완료'],
      'original_required_ids':[r['id'] for r in results if r['required_original']],
      'original_acquired_ids':[r['id'] for r in results if r.get('files')],
      'failed_original_ids':[r['id'] for r in results if r['required_original'] and r['status']!='확인 완료']}
    save(DOC/'summary.json',summary)
    for checkpoint in range(10,len(done)+1,10):
        if checkpoint not in checkpoints:
            checkpoints.add(checkpoint)
            save(DOC/f'checkpoint-{checkpoint:03d}.json',{'progress':checkpoint,'total':109,'completed_ids':done[:checkpoint]})
            print('진행률 '+str(checkpoint)+'/109 '+', '.join(done[:checkpoint]),flush=True)

def fail(ident,reason,url=None):
    r=byid[ident]
    r.setdefault('attempts',[]).append({'checked_at':now(),'url':url,'result':reason})
    if r['status']!='확인 완료': r['failure_reason']=reason
    persist()

def complete(ident,source,evidence,institution,files=None,note=None,form_no=None,license_text=None):
    r=byid[ident]
    if r['required_original'] and not files:
        fail(ident,'필수 원본 파일 미확보',source); return
    r.update(status='확인 완료',source_url=source,checked_at=now(),institution=institution,source_evidence=evidence,
             source_type='원본' if files else '공식제공처',license=license_text or ('법령 별지서식 · 공공누리 유형 표시 없음' if files else '공식 제공처 링크 · 재배포하지 않음'))
    if files is not None: r['files']=files
    if note:r['note']=note
    if form_no:r['form_no']=form_no
    r.pop('failure_reason',None)
    persist();print('확인 완료',ident,source,flush=True)

def get_original(ident,link,terms,public=True):
    response=http(link['url'])
    ext,text=parse_binary(response.content)
    if not all(norm(term) in norm(text) for term in terms): raise ValueError('원본 본문에 요청 서식명이 없음: '+','.join(terms))
    sha=digest(response.content); name=f'{ident}_{sha[:12]}.{ext}'
    dest=(PUB if public else REVIEW)/name;dest.write_bytes(response.content)
    file={'name':re.sub(r'\s+',' ',link['text']).strip() or byid[ident]['title'],'url':response.url,'bytes':len(response.content),
      'sha256':sha,'format':ext,'role':'original','http_status':200,'checked_at':now(),'title_verified':True}
    if public:file.update(path=str(dest.relative_to(ROOT)),local_url='/downloads/official-forms/expansion/'+quote(name))
    else:file['artifact_path']='originals/'+name
    date=re.search(r'개정\s*(\d{4})\s*[.년]\s*(\d{1,2})\s*[.월]\s*(\d{1,2})',text[:4000])
    if date:file['revised_at']='%04d-%02d-%02d'%tuple(map(int,date.groups()))
    head=re.search(r'[^\n]{0,70}별지\s*제[^\n]{0,70}서식',text[:2500])
    if head:file['form_no_excerpt']=head.group(0)
    save(OUT/(ident+'-'+sha[:12]+'.json'),{'file':file,'text_excerpt':text[:4500],'source':link})
    return file,text

# These short Korean-law addresses resolve the institution's CURRENT instrument.
# They are lookup requests, not accepted sources until their actual response and form are inspected.
law_jobs={
 '지방세특례제한법시행규칙': [('P0-14',[['지방세','감면','신청서']])],
 '국민연금법시행규칙': [('P0-16',[['유족연금','지급','청구서'],['반환일시금','청구서'],['사망일시금','청구서']])],
 '자동차등록규칙': [('P1-24',[['이전등록','신청서']])],
 '법인세법시행규칙': [('P2-03',[['주식등변동상황명세서']])],
 '국세징수법시행규칙': [('P2-08',[['납세담보','제공서']])],
 '농지법시행규칙': [('P3-01',[['농지취득자격증명','신청서']])],
 '부동산거래신고등에관한법률시행규칙': [('P3-02',[['부동산','거래계약','신고서']]),('P4-01',[['주택취득자금','조달','입주계획서']]),('P4-02',[['토지취득자금','조달계획서']]),('P4-04',[['부동산','해제','신고서'],['부동산','변경','신고서']])],
 '조세특례제한법시행규칙': [('P5-01',[['영농자녀','증여농지','감면신청서']])],
 '상속세및증여세법시행규칙': [('P5-02',[['창업자금','증여재산평가','과세가액']]),('P5-03',[['가업승계','증여재산평가','과세가액']]),('P5-04',[['증여재산','평가명세서']]),('P5-05',[['상속인별','상속재산','평가명세서']]),('P5-07',[['공익법인','출연재산','보고서']])],
 '지방세법시행규칙': [('P9-01',[['등록에대한등록면허세','신고서']])],
 '부가가치세법시행규칙': [('P9-04',[['폐업','신고서']])],
 '국제조세조정에관한법률시행규칙': [('P9-08',[['해외금융계좌','신고서']])],
}
# Prior rendered pages contain actual, observed file links, not guessed flSeq values.
old_root=ROOT/'.tmp/restore61/docs/forms-additions-61/browser'
old_pages={}
for p in old_root.glob('*.json'):
    try:
        page=json.loads(p.read_text())
        if isinstance(page,dict) and page.get('links'):
            old_pages[p.stem]=page
    except (ValueError,UnicodeError):pass
old_map={'조세특례제한법시행규칙':'tax-special','상속세및증여세법시행규칙':'inheritance-tax','지방세법시행규칙':'local-tax','부가가치세법시행규칙':'vat'}

def read_law(item):
    instrument,jobs=item
    source='https://www.law.go.kr/법령/'+instrument
    try:return instrument,jobs,inspect_page(source),None
    except Exception as error:return instrument,jobs,None,str(error)
with ThreadPoolExecutor(max_workers=3) as pool:
    law_reads=list(pool.map(read_law,law_jobs.items()))
for instrument,jobs,page,error in law_reads:
    old=old_pages.get(old_map.get(instrument,''),{})
    if page:
        save(OUT/('law-'+instrument+'.json'),page)
        links=page['links']
        source=page['chain'][-1]['url']
    else:
        links=[];source='https://www.law.go.kr/법령/'+instrument
    # Old observed URLs remain candidates; each binary must be fetched anew.
    links+= [{'text':a.get('text',''),'url':a.get('href',''),'origin':old.get('url') or old.get('source')} for a in old.get('links',[])]
    for ident,groups in jobs:
        if byid[ident]['status']=='확인 완료':continue
        acquired=[]; excerpts=[]
        try:
            for terms in groups:
                options=[a for a in links if 'flDownload.do' in a.get('url','') and '.hwp' in a.get('text','').lower() and '.hwpx' not in a.get('text','').lower() and all(norm(t) in norm(a.get('text','')) for t in terms)]
                if not options:raise ValueError('공식 목록에서 요청 HWP 링크 미확보: '+','.join(terms))
                selected=options[0]
                f,t=get_original(ident,selected,terms,public=True)
                if f['sha256'] not in {x['sha256'] for x in acquired}:acquired.append(f)
                excerpts.append(t)
            # A fresh canonical-page response is needed for current-form status.
            if not page:raise ValueError('파일 확보했으나 현행 법령 페이지 재확인 필요: '+str(error))
            byid[ident]['revised_at']=acquired[0].get('revised_at')
            title=options[0]['text']
            no=re.search(r'\[([^]]*(?:서식)[^]]*)\]',title)
            form_no=instrument+' '+no.group(1) if no else None
            complete(ident,source,page['chain'],'국가법령정보센터',acquired,
                note='법령이 제공하는 원본 서식입니다. 합본에 포함된 부표는 문서 안에서 해당 제목을 확인하세요.',form_no=form_no)
        except Exception as e:
            if acquired:byid[ident]['partial_files']=acquired
            fail(ident,str(e),source)

# Explicit provider-page candidates supplied by the user or observed in official navigation.
providers={
 'P0-05':('https://efamily.scourt.go.kr/cs/CsBltnWrtGuide.do?bltnbordId=0000008&guideCd=0000008006&guideYn=Y',['사망','신고'],'대법원 전자가족관계등록시스템'),
 'P0-06':('https://efamily.scourt.go.kr/cs/CsBltnWrtGuide.do?bltnbordId=0000007&guideCd=0000007001&guideYn=Y',['가족관계증명서','상세'],'대법원 전자가족관계등록시스템'),
 'P8-12':('https://egdrs.scourt.go.kr/',['후견','증명서'],'대법원 전자후견등기시스템'),
 'P9-10':('https://www.realtyprice.kr/',['공동주택','개별공시지가'],'부동산공시가격 알리미'),
}
config=DOC/'verified-source-candidates.json'
if config.exists():
    for ident,data in json.loads(config.read_text()).items():providers[ident]=(data['url'],data['terms'],data['institution'])
with ThreadPoolExecutor(max_workers=4) as pool:
    def read_provider(pair):
        ident,(url,terms,institution)=pair
        try:return ident,url,terms,institution,inspect_page(url),None
        except Exception as error:return ident,url,terms,institution,None,str(error)
    provider_reads=list(pool.map(read_provider,providers.items()))
for ident,url,terms,institution,page,error in provider_reads:
    if byid[ident]['status']=='확인 완료':continue
    if not page:fail(ident,str(error),url);continue
    save(OUT/(ident+'-provider.json'),page)
    if not all(norm(t) in norm(page['text']) for t in terms):fail(ident,'HTTP 200이나 본문에서 요청 자료 존재를 확인하지 못함',url);continue
    if ident=='P0-05':
        # Filing guidance does not by itself establish the application form.
        byid[ident]['guidance_evidence']=page['chain'];fail(ident,'사망신고 안내 확인. 사망신고서 첨부 원문 추가 확인 필요',url);continue
    if ident=='P0-06':
        parts=[]
        try:
            for code,word in [('0000007002','기본증명서'),('0000007007','제적')]:
                extra=inspect_page('https://efamily.scourt.go.kr/cs/CsBltnWrtGuide.do?bltnbordId=0000007&guideCd='+code+'&guideYn=Y')
                if norm(word) not in norm(extra['text']):raise ValueError(word+' 안내 본문 미확인')
                parts.extend(extra['chain'])
        except Exception as e:fail(ident,str(e),url);continue
        page['chain'].extend(parts)
    complete(ident,url,page['chain'],institution,note='기관 원문에서 대상·준비자료·신청방법을 확인하세요. 서식 다운로드와 안내 페이지를 구분합니다.')

# User-explicit duplicate mapping, never add duplicate cards to satisfy a count.
if byid['P3-02']['status']=='확인 완료':
    byid['P4-03'].update(alias_verified=True,status='확인 완료',source_url=byid['P3-02']['source_url'],checked_at=now(),files=copy.deepcopy(byid['P3-02']['files']),source_type='원본',license=byid['P3-02']['license'],note='첨부의 명시적 중복. P3-02 원본 및 카드로 통합.')
    persist()

# Save explicit unsuccessful states for every task, without assigning an invented URL.
for r in results:
    if r['status']!='확인 완료' and not r.get('attempts'):
        r['failure_reason']='요청 범위의 공식 원문·파일 검증을 아직 완료하지 못했습니다.'
persist()

# Extend the catalog without rewriting any existing record.
manifest=copy.deepcopy(legacy)
for r in results:
    if r['operation']=='source_url_update' and r['status']=='확인 완료':
        next(d for d in manifest['documents'] if d['id']==r['target_id'])['sourceUrl']=r['source_url']
    if r['operation']!='add':continue
    public_files=[]
    for f in r.get('files',[]):
        if f.get('local_url') and f.get('path'):
            public_files.append({'name':f.get('name') or r['title'],'path':f['local_url'],'format':f['format'].upper(),'role':'original','bytes':f['bytes'],'delivery':'hosted'})
    verified=r['status']=='확인 완료'
    source=r.get('source_url') if verified else None
    hosted=verified and bool(public_files)
    delivery='hosted' if hosted else 'provider' if verified else 'pending'
    card={'id':r['id'],'title':r['title'],'catalogTitle':r['title'],'category':r['category'],'originalCategory':r['category'],
      'description':r.get('note') or ('기관 원문에서 서식·준비자료·이용방법을 확인하세요.' if verified else '공식 출처 및 요청 서류를 확인하고 있습니다.'),
      'tags':r['id']+' · '+r['category'],'format':public_files[0]['format'] if hosted else '공식 안내' if verified else '확인 중',
      'editable':public_files[0]['path'] if hosted else source or '', 'example':None,'thumbnail':None,
      'sizeLabel':str((public_files[0]['bytes']+1023)//1024)+' KB' if hosted else '공식 제공처' if verified else '확인 중',
      'sourceUrl':source or '', 'institution':r.get('institution') or '공식 출처 확인 중','checkedOn':(r.get('checked_at') or '')[:10],
      'license':r.get('license') or '미확인','licenseUrl':r.get('license_source') or '',
      'verification':r.get('failure_reason') or '실제 응답·문서 존재 확인. 전체 서식의 제출 적합성 판단은 별도입니다.',
      'exampleVerification':'기관 작성 예시 추가 확인 필요','delivery':delivery,'files':public_files,
      'form_no':r.get('form_no'),'revised_at':r.get('revised_at'),'deadline':r.get('deadline'),'deadline_basis':r.get('deadline_basis'),
      'source_type':'원본' if hosted else '공식제공처' if verified else None,'checked_at':r.get('checked_at'),'status':r['status'],
      'source_evidence':r.get('source_evidence'),'task_id':r['id'],'related_ids':r.get('related_ids',[])}
    manifest['documents'].append(card)
manifest.update(additionRequests=results,additionCount=103,additionTaskCount=109,publishedCount=len(manifest['documents']),
    legacyBundleCount=74,deliveryCounts={k:sum(d.get('delivery')==k for d in manifest['documents']) for k in ['hosted','provider','direct','pending']})
assert len(manifest['documents'])==177
for old in legacy['documents']:
    updated=next(d for d in manifest['documents'] if d['id']==old['id'])
    allowed=any(r['operation']=='source_url_update' and r['status']=='확인 완료' and r['target_id']==old['id'] for r in results)
    assert {k:v for k,v in updated.items() if not(allowed and k=='sourceUrl')}=={k:v for k,v in old.items() if not(allowed and k=='sourceUrl')},old['id']
save(MP,manifest)
print(json.dumps(json.loads((DOC/'summary.json').read_text()),ensure_ascii=False,indent=2),flush=True)
