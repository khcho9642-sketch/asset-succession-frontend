"""Incremental finite collection; preserve all legacy bytes and each completed task."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin, unquote, quote
import json, re, hashlib, copy, requests
from bs4 import BeautifulSoup

helper_path=Path(__file__).with_name('forms-expansion-collect.py')
helper_source=helper_path.read_text()
exec(compile(helper_source.split('# These short Korean-law addresses')[0], str(helper_path), 'exec'),globals())
RESUME=OUT/'resume';RESUME.mkdir(parents=True,exist_ok=True)
# Sources are discovered official URLs; no synthesized attachment IDs.
IFEZ='https://www.ifez.go.kr/main/pst/view.do?pst_id=ciz01&pst_sn=194680&search='
GUARD='https://sladmin.scourt.go.kr/slfamily/civil_complaint/civil_06/index_03.html'
BUPYEONG='https://www.icbp.go.kr/main/bbs/bbsMsgDetail.do?bcd=taxes_form&msg_seq=60'
provider_jobs=[
 ('P1-22',GUARD,['성년후견개시심판청구'],'서울가정법원'),
 ('P8-08',GUARD,['한정후견개시심판청구','특정후견심판청구'],'서울가정법원'),
 ('P8-09',GUARD,['후견계약 등기신청서','임의후견감독인선임'],'서울가정법원'),
 ('P8-10',GUARD,['거주 건물 또는 대지 매도허가','법정대리권의 범위변경'],'서울가정법원'),
 ('P8-11',GUARD,['후견사무보고서','재산목록보고서'],'서울가정법원'),
 ('P8-12',GUARD,['등기사항 부존재증명서 발급신청서','등기사항증명서 발급신청서'],'서울가정법원'),
]
raw_jobs=[
 ('P3-02',IFEZ,'https://www.ifez.go.kr/other/attach/process.file.do?TP=dn&key=A43C001FCF8AF4E&sn=91749',['부동산거래계약','신고서']),
 ('P4-02',IFEZ,'https://www.ifez.go.kr/other/attach/process.file.do?TP=dn&key=6F696BD40D27E54&sn=91711',['토지취득자금','조달','토지이용계획서']),
 ('P4-01',IFEZ,'https://www.ifez.go.kr/other/attach/process.file.do?TP=dn&key=6F696BD40D27E54&sn=91710',['주택취득자금','조달','입주계획서','가상','사업자']),
]

# Cache one actual request per official page instead of timing out per task.
def read_once(url):
 try:
  r=requests.get(url,timeout=(6,14),headers={'User-Agent':'Mozilla/5.0','Accept-Language':'ko-KR'})
  if r.status_code!=200:raise ValueError('HTTP '+str(r.status_code))
  r.encoding=r.apparent_encoding or 'utf-8'
  s=BeautifulSoup(r.text,'html.parser')
  links=[{'text':a.get_text(' ',strip=True),'url':urljoin(r.url,a.get('href','')),'onclick':a.get('onclick')} for a in s.select('a[href]')]
  d={'url':r.url,'http_status':r.status_code,'checked_at':now(),'sha256':digest(r.content),'text':s.get_text(' ',strip=True),'links':links}
  save(RESUME/('page-'+digest(url.encode())[:12]+'.json'),d)
  return url,d,None
 except Exception as e:return url,None,str(e)
urls=list(dict.fromkeys([j[1] for j in provider_jobs]+[IFEZ,BUPYEONG,
 'https://www.ifez.go.kr/main/pst/view.do?pst_id=ciz01&pst_sn=194681&search=',
 'https://www.ifez.go.kr/main/pst/view.do?pst_id=ciz01&pst_sn=194682&search=']))
with ThreadPoolExecutor(max_workers=4) as pool:cache={u:(p,e) for u,p,e in pool.map(read_once,urls)}

for ident,url,terms,institution in provider_jobs:
 if byid[ident]['status']=='확인 완료':continue
 page,error=cache[url]
 if not page:fail(ident,'이번 공식 페이지 접속: '+str(error),url);continue
 if not all(norm(t) in norm(page['text']) for t in terms):fail(ident,'HTTP 200이나 요청 서식명이 본문에서 확인되지 않음',url);continue
 evidence={k:v for k,v in page.items() if k not in ('text','links')}
 evidence['matched_titles']=terms
 note='서울가정법원 공식 양식 목록에서 해당 문서명을 확인했습니다. 개별 신청서 파일을 재호스팅한 항목이 아니라 공식 제공처 안내입니다.'
 if ident=='P8-10':note='법원은 거주 건물·대지 매도허가와 법정대리권 범위변경 양식을 별도로 제공합니다. 모든 매각·증여에 동일한 허가가 필수라는 뜻은 아니며 후견 종류·권한·거주 여부를 확인하세요.'
 complete(ident,url,evidence,institution,note=note)

for ident,source,url,terms in raw_jobs:
 if byid[ident]['status']=='확인 완료':continue
 try:
  f,body=get_original(ident,{'url':url,'text':byid[ident]['title'],'origin':source},terms)
  if ident=='P4-01':
   dates=re.findall(r'(?:개정|신설)\s*(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})',body[:5000])
   if not any(int(y)>=2026 for y,m,d in dates):raise ValueError('파일 확보했으나 요청한 2026년 개정 표시를 확인하지 못함')
  byid[ident]['revised_at']=f.get('revised_at')
  if f.get('form_no_excerpt'):byid[ident]['form_no']=f['form_no_excerpt']
  evidence={'http_status':200,'checked_at':f['checked_at'],'attachment_source':source,'binary_sha256':f['sha256'],'matched_body_terms':terms}
  complete(ident,source,evidence,'인천경제자유구역청',[f],note='공식 기관이 첨부한 법령 별지서식의 원본 파일입니다. 본문을 수정하지 않았습니다. 서식의 개정일과 대상 거래를 확인해 사용하세요.',license_text='법령 별지서식 원본; 기관 게시물의 공공누리 유형은 별도 미확인')
 except Exception as e:fail(ident,'공식 원본 확보·검수: '+str(e),url)

# The latest Bupyeong notice explicitly offers a form and an institutional example.
if byid['P0-14']['status']!='확인 완료':
 page,error=cache[BUPYEONG]
 try:
  if not page:raise ValueError(error)
  choices=[a for a in page['links'] if '지방세' in a['text'] and '감면' in a['text'] and '.hwp' in a['text'].lower() and '예시' not in a['text'] and a['url'].startswith('https://')]
  if not choices:raise ValueError('게시물은 확인했으나 다운로드 가능한 첨부 URL 미확보')
  f,body=get_original('P0-14',{**choices[0],'origin':BUPYEONG},['지방세','감면','신청서'])
  byid['P0-14']['revised_at']=f.get('revised_at')
  license_text='공공누리 제1유형 (출처표시)' if '제1유형' in page['text'] else '법령 별지서식 원본; 기관의 공공누리 유형은 미확인'
  complete('P0-14',BUPYEONG,{k:v for k,v in page.items() if k not in ('text','links')},'인천광역시 부평구청',[f],form_no='지방세특례제한법 시행규칙 별지 제1호서식',license_text=license_text)
 except Exception as e:fail('P0-14',str(e),BUPYEONG)

# Requested annex title differs across versions: inspect the full official bundle, not just first-page text.
if byid['P5-05']['status']!='확인 완료':
 old=next(d for d in legacy['documents'] if d['id']=='NTS-IG-10')
 for f in old.get('files',[]):
  local=ROOT/'public'/unquote(f.get('path','')).lstrip('/')
  if f.get('format','').lower() not in ('hwp','hwpx','pdf') or not local.is_file():continue
  try:
   b=local.read_bytes();ext,body=parse_binary(b)
   save(RESUME/('P5-05-inspect-'+ext+'.json'),{'body':body,'file':f})
   if digest(b)!=f.get('sha256') or not all(norm(t) in norm(body) for t in ['상속인별','상속재산','평가명세서']):continue
   record={'name':f['name'],'url':f.get('sourceUrl'),'path':str(local.relative_to(ROOT)),'local_url':f['path'],'bytes':len(b),'sha256':digest(b),'format':ext,'http_status':200,'checked_at':f.get('checkedOn'),'title_verified':True,'reused_from':'NTS-IG-10'}
   complete('P5-05',old['sourceUrl'],{'type':'existing_official_bundle_reinspected','legacy_id':'NTS-IG-10','sha256':digest(b),'checked_at':now()},'국가법령정보센터',[record],note='기존 공식 상속세 신고서 합본의 상속인별 재산·평가명세 부표를 확인했습니다. 새 계약서나 별도 예시를 만든 것이 아닙니다.',license_text=old['license'])
   break
  except Exception as e:fail('P5-05',str(e),old['sourceUrl'])

# Every component of a compound request is needed before checking it off.
if byid['P4-04']['status']!='확인 완료':
 files=[];evidence=[]
 try:
  for source,terms in [('https://www.ifez.go.kr/main/pst/view.do?pst_id=ciz01&pst_sn=194681&search=',['부동산거래계약','해제','신고서']),('https://www.ifez.go.kr/main/pst/view.do?pst_id=ciz01&pst_sn=194682&search=',['부동산거래계약','변경','신고서'])]:
   page,error=cache[source]
   if not page:raise ValueError(error)
   options=[a for a in page['links'] if '.hwp' in a['text'].lower() and all(norm(t) in norm(a['text']) for t in terms) and a['url'].startswith('https://')]
   if not options:raise ValueError('해제/변경 서식 첨부 URL 미확보')
   f,body=get_original('P4-04',{**options[0],'origin':source},terms);files.append(f);evidence.append({'url':source,'http_status':200,'checked_at':page['checked_at'],'sha256':page['sha256']})
  complete('P4-04',evidence[0]['url'],evidence,'인천경제자유구역청',files,note='해제등 신고서와 변경 신고서를 각각 확보했습니다. 실제 거래 변경 내용에 해당하는 원본을 사용하세요.')
 except Exception as e:fail('P4-04',str(e))

if byid['P3-02']['status']=='확인 완료':
 byid['P4-03'].update(alias_verified=True,status='확인 완료',source_url=byid['P3-02']['source_url'],checked_at=now(),files=copy.deepcopy(byid['P3-02']['files']),source_type='원본',license=byid['P3-02']['license'],note='첨부의 명시적 중복: P3-02로 통합')
persist()
# Rebuild only added cards and explicitly permitted source-URL updates.
exec(compile('# Extend the catalog'+helper_source.split('# Extend the catalog',1)[1],str(helper_path),'exec'),globals())
