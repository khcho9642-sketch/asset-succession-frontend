"""Continue inspected originals and official form searches; no invented attachment IDs."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote, urljoin
import json,re,requests
from bs4 import BeautifulSoup
helper_path=Path(__file__).with_name('forms-expansion-collect.py')
helper_source=helper_path.read_text()
exec(compile(helper_source.split('# These short Korean-law addresses')[0],str(helper_path),'exec'),globals())
DEST=OUT/'round2';DEST.mkdir(parents=True,exist_ok=True)

# These exact attachments were observed in saved official pages, including 2026 annex listings.
originals=[
 ('P5-01','https://www.law.go.kr/lsInfoP.do?lsiSeq=286381&viewCls=lsRvsDocInfoR','https://www.law.go.kr/flDownload.do?gubun=&flSeq=168819949&bylClsCd=110202',['영농자녀','증여농지','세액감면신청서'],'조세특례제한법 시행규칙 별지 제52호서식'),
 ('P5-07','https://www.law.go.kr/lsInfoP.do?joNo=001700&lsId=007388','https://www.law.go.kr/flDownload.do?gubun=&flSeq=162627633&bylClsCd=110202',['공익법인','출연재산','보고서'],'상속세 및 증여세법 시행규칙 별지 제23호서식'),
 ('P9-01','https://www.law.go.kr/lsInfoP.do?lsiSeq=287031','https://www.law.go.kr/flDownload.do?gubun=&flSeq=164920533&bylClsCd=110202',['등록','등록면허세','신고서'],'지방세법 시행규칙 별지 제9호서식'),
 ('P9-04','https://www.law.go.kr/LSW/lsInfoP.do?ancYnChk=0&chrClsCd=010202&efYd=20260320&lsiSeq=284995&urlMode=lsInfoP','https://www.law.go.kr/LSW/flDownload.do?gubun=&flSeq=162619115&bylClsCd=110202',['휴업','폐업','신고서'],'부가가치세법 시행규칙 별지 제9호서식'),
]
def acquire(job):
 ident,source,url,terms,number=job
 if byid[ident]['status']=='확인 완료':return job,None,None,None
 try:
  f,body=get_original(ident,{'url':url,'text':byid[ident]['title'],'origin':source},terms)
  return job,f,body,None
 except Exception as e:return job,None,None,str(e)
with ThreadPoolExecutor(max_workers=3) as pool:acquired=list(pool.map(acquire,originals))
for job,f,body,error in acquired:
 ident,source,url,terms,number=job
 if byid[ident]['status']=='확인 완료':continue
 if error:fail(ident,'관찰한 공식 첨부 원본 재조회: '+error,url);continue
 byid[ident]['revised_at']=f.get('revised_at')
 complete(ident,source,{'http_status':200,'checked_at':f['checked_at'],'binary_sha256':f['sha256'],'matched_body_terms':terms},'국가법령정보센터',[f],form_no=number,
  note='공식 법령 페이지에서 발견한 첨부를 실제 다운로드하고 본문·서식명을 확인했습니다. 원본의 조항과 부표를 수정하지 않았습니다.')

# A failed connection on one official attachment is retried once, without bypassing controls.
if byid['P4-04']['status']!='확인 완료':
 parts=[('https://www.ifez.go.kr/main/pst/view.do?pst_id=ciz01&pst_sn=194681&search=','https://www.ifez.go.kr/other/attach/process.file.do?TP=dn&sn=51196&key=07CD13077418238',['부동산거래계약','해제','신고서']),('https://www.ifez.go.kr/main/pst/view.do?pst_id=ciz01&pst_sn=194682&search=','https://www.ifez.go.kr/other/attach/process.file.do?TP=dn&sn=80454&key=BB3480D2E9F6BF9',['부동산거래계약','변경','신고서'])]
 files=[];ev=[]
 try:
  for source,url,terms in parts:
   f,body=get_original('P4-04',{'url':url,'text':' / '.join(terms),'origin':source},terms)
   files.append(f);ev.append({'url':url,'http_status':200,'sha256':f['sha256'],'checked_at':f['checked_at']})
  complete('P4-04',parts[0][0],ev,'인천경제자유구역청',files,form_no='부동산 거래신고 등에 관한 법률 시행규칙 별지 제3호·제4호서식',note='변경 신고서와 해제등 신고서 원본을 각각 제공합니다. 변경과 해제는 서로 다른 신청입니다.')
 except Exception as e:fail('P4-04',str(e))

# Original form search URL and its EUC-KR searchWord parameter were inspected in
# the official Seoul Family Court links. Search responses are not pre-approved sources.
COURT='https://help.scourt.go.kr/nm/minwon/doc/DocListAction.work?pageIndex=1&pageSize=5&min_gubun=&sName=&eName=&min_gubun_sel=&searchWord='
queries=['상속','유언','기여분','유류분','특별대리인','친생자','인지청구','부재자','실종','한정승인','상속재산목록']
urls=[COURT+quote(q,encoding='euc-kr') for q in queries]
urls+=['https://help.scourt.go.kr/nm/minwon/doc/ProDocList.work?eName=&min_gubun=&min_gubun_sel=&pageIndex=44&pageSize=5&sName=&searchWord=']
provider_jobs=[
 ('P7-01','https://www.geps.or.kr/bizInformation_pensionBiz_retirementClaim',['유족급여','청구서','작성방법'],'공무원연금공단'),
 ('P7-06','https://www.poba.or.kr/prd/prd01/prd0101/prd010105',['사망급여금','유족대표','청구'],'대한지방행정공제회'),
 ('P9-09','https://www.nts.go.kr/nts/ad/nf/nltFormatApiList.do?mi=40178&searchSe=select&selectCode=type11',['국외전출자'],'국세청'),
]
# P9-09 must follow the actual nav link to its substantive page, not count navigation text.
urls+= [x[1] for x in provider_jobs]
urls+=['https://efamily.scourt.go.kr/cs/CsBltnWrtGuide.do?bltnbordId=0000007&guideCd=0000007001&guideYn=Y','https://efamily.scourt.go.kr/cs/CsBltnWrtGuide.do?bltnbordId=0000007&guideCd=0000007002&guideYn=Y','https://efamily.scourt.go.kr/cs/CsBltnWrtGuide.do?bltnbordId=0000007&guideCd=0000007007&guideYn=Y',
'https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=135742&cntntsId=109141',
'https://www.nps.or.kr/pnsinfo/ntpsklg/getOHAF0082M0.do',
'https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=2447&cntntsId=7780',
'https://www.law.go.kr/LSW/lsInfoP.do?chrClsCd=010202&lsId=006742&lsiSeq=284983&urlMode=lsEfInfoR&viewCls=thdCmpNewScP']

def read_url(url):
 try:
  r=requests.get(url,timeout=(7,16),headers={'User-Agent':'Mozilla/5.0','Accept-Language':'ko-KR'})
  if r.status_code!=200:raise ValueError('HTTP '+str(r.status_code))
  r.encoding=r.apparent_encoding or 'utf-8';s=BeautifulSoup(r.text,'html.parser')
  if 'Web firewall security policies' in s.get_text():raise ValueError('기관 웹방화벽 안내')
  links=[{'text':a.get_text(' ',strip=True),'url':urljoin(r.url,a.get('href','')),'onclick':a.get('onclick')} for a in s.select('a[href]')]
  data={'requested_url':url,'url':r.url,'http_status':200,'checked_at':now(),'sha256':digest(r.content),'text':s.get_text(' ',strip=True),'links':links,
    'forms':[{'action':urljoin(r.url,f.get('action','')),'method':f.get('method','GET'),'fields':[{'name':x.get('name'),'type':x.get('type'),'value':x.get('value')} for x in f.select('input')]} for f in s.select('form')]}
  save(DEST/('page-'+digest(url.encode())[:12]+'.json'),data)
  return url,data,None
 except Exception as e:return url,None,str(e)
with ThreadPoolExecutor(max_workers=6) as pool:readings=list(pool.map(read_url,list(dict.fromkeys(urls))))
pages={u:(d,e) for u,d,e in readings}

court_tasks={
 'P0-07':[['상속재산포기심판청구'],['상속포기심판청구']],
 'P0-08':[['상속한정승인심판청구']],
 'P0-09':[['상속재산목록','한정승인']],
 'P0-10':[['특별한정승인','청구']],
 'P1-15':[['유언증서검인','청구']],
 'P1-16':[['유언집행자선임','청구']],
 'P1-18':[['상속재산의분할심판청구'],['상속재산분할심판청구']],
 'P1-19':[['기여분','결정','청구']],
 'P1-20':[['유류분','반환','소장']],
 'P1-21':[['상속재산관리인선임','청구']],
 'P1-23':[['부재자재산관리인','실종선고','청구']],
 'P8-01':[['특별대리인선임','청구']],
 'P8-02':[['상속회복','소장']],
 'P8-03':[['친생자관계','인지청구','소장']],
 'P8-04':[['상속재산','파산신청서']],
}
for ident,groups in court_tasks.items():
 if byid[ident]['status']=='확인 완료':continue
 found=None
 for url,(page,error) in pages.items():
  if not page or not ('scourt.go.kr/nm/minwon/doc/' in url):continue
  # Require a result-table/document label, not the query field's value.
  matching=[g for g in groups if all(norm(t) in norm(page['text']) for t in g)]
  if matching:found=page,matching[0];break
 if not found:
  reasons=[{'url':u,'reason':e or '요청 양식명 미확인'} for u,(p,e) in pages.items() if 'scourt.go.kr/nm/minwon/doc/' in u]
  byid[ident]['search_attempts']=reasons;fail(ident,'공식 양식 검색에서 요청 문서 존재를 확인하지 못함');continue
 page,terms=found
 complete(ident,page['url'],{k:v for k,v in page.items() if k not in ('text','links','forms')},'대한민국 법원 전자민원센터',note='공식 양식 검색 결과에서 요청 청구서의 문서명을 확인했습니다. 개별 파일 재배포가 아니라 공식 양식 제공처로 연결합니다.')

for ident,url,terms,institution in provider_jobs:
 if byid[ident]['status']=='확인 완료':continue
 page,error=pages[url]
 if ident=='P9-09' and page:
  candidates=[a for a in page['links'] if '국외전출자' in a['text'] and a['url'].startswith('https://')]
  if candidates:
   _,page,error=read_url(candidates[0]['url'])
   terms=['국외전출자','양도소득세','신고']
 if not page or not all(norm(t) in norm(page['text']) for t in terms):fail(ident,error or '요청 업무의 본문 확인 실패',url);continue
 complete(ident,page['url'],{k:v for k,v in page.items() if k not in ('text','links','forms')},institution,
  note='기관의 지급·청구 또는 신고 안내 원문입니다. 개별 대상·신청방법과 해당 서류를 원문에서 확인하세요.')

if byid['P0-06']['status']!='확인 완료':
 group=[]
 for end,terms in [('0000007001',['가족관계증명서','상세']),('0000007002',['기본증명서','상세']),('0000007007',['제적'])]:
  url='https://efamily.scourt.go.kr/cs/CsBltnWrtGuide.do?bltnbordId=0000007&guideCd='+end+'&guideYn=Y'
  page,error=pages[url]
  if page and all(norm(t) in norm(page['text']) for t in terms):group.append(page)
 if len(group)==3:
  complete('P0-06',group[0]['url'],[{k:v for k,v in p.items() if k not in ('text','links','forms')} for p in group],'대법원 전자가족관계등록시스템',note='가족관계증명서 상세·기본증명서 상세·제적등본의 공식 발급 안내 세 가지를 확인했습니다. 필요한 발급 대상과 제출처 요구사항을 구분하세요.')
 else:fail('P0-06','가족·기본·제적 안내 3종 중 확인된 페이지 '+str(len(group))+'개')

persist()
exec(compile('# Extend the catalog'+helper_source.split('# Extend the catalog',1)[1],str(helper_path),'exec'),globals())
