"""Finite continuation through independently discovered official public pages.
Only successful HTTP/content checks become completed tasks. Originals and public
redistribution permissions are distinct; existing 74 records remain untouched.
"""
from pathlib import Path
from urllib.parse import urljoin, urlparse
from concurrent.futures import ThreadPoolExecutor
import json, re, traceback
from bs4 import BeautifulSoup
hp=Path(__file__).with_name('forms-expansion-collect.py'); hs=hp.read_text()
exec(compile(hs.split('# These short Korean-law addresses')[0],str(hp),'exec'),globals())
DEST=OUT/'round6'; DEST.mkdir(parents=True,exist_ok=True)
checkpoints.update(range(10,sum(r['status']=='확인 완료' for r in results)+1,10))
START_DONE={r['id'] for r in results if r['status']=='확인 완료'}

# These URLs were followed from actual official-page links or search results.
# This list is a retrieval queue, never proof by itself.
jobs=[
 ('P7-03','https://www.mps.mil.kr/info/deceIncmAplcForm.do',['유족','청구서'],'국방부 군인연금',
  '국방부 군인연금의 유족연금 신청안내와 청구서 제공 항목입니다. 유족대표자 선정·등분 청구 등 필요한 첨부를 원문에서 확인하세요.'),
 ('P3-03','https://edi.nhis.or.kr/webedi/file_sy/all_sangsil.html',['건강','상실','사망'],'국민건강보험공단',
  '국민건강보험 EDI의 사업장(직장) 가입자 자격상실 신고 안내입니다. 건강보험 상실부호의 사망 항목을 확인할 수 있습니다. 사업장용 안내이며 지역가입자·피부양자 처리는 공단에서 별도로 확인하세요.'),
 ('P7-07','https://www.nhis.or.kr/static/alim/paper/oldpaper/202302/sub/23.html',['임의계속가입','퇴직','신청기한'],'국민건강보험공단',
  '국민건강보험공단 2023년 2월 안내의 임의계속가입 제도를 함께 연결합니다. 이는 요건을 갖춘 퇴직자의 제도이며, 사망자의 자격을 유족에게 자동 승계한다는 뜻이 아닙니다. 자격상실 안내와 적용 대상을 구분하세요.'),
 ('P8-05','https://www.easylaw.go.kr/CSP/CnpClsMain.laf?ccfNo=4&cciNo=3&cnpClsNo=1&csmSeq=255',['한정승인후상속재산의청산','채권자에대한공고','배당변제'],'법제처 찾기쉬운 생활법령정보',
  '한정승인 이후 채권자 공고·최고, 신고기간, 배당변제와 우선권, 유증 및 경매 절차를 안내합니다. 법원의 한정승인 심판과 이후 청산을 구분하고 관할 법원·전문가와 확인하세요.'),
 ('P8-06','https://www.easylaw.go.kr/CSP/CnpClsMain.laf?ccfNo=5&cciNo=2&cnpClsNo=1&csmSeq=255&popMenu=ov',['상속인이없는','공고','청산'],'법제처 찾기쉬운 생활법령정보',
  '상속인이 없는 경우의 재산 관리·청산 및 공고 절차를 안내합니다. 상속인 수색·채권자 신고·특별연고자 분여 등 서로 다른 절차를 원문에서 구분하세요.'),
 ('P5-06','https://easylaw.go.kr/CSP/CnpClsMainBtr.laf?ccfNo=4&cciNo=1&cnpClsNo=2&csmSeq=916&popMenu=ov',['증여세과세가액불산입신청','신탁계약서','장애인'],'법제처 찾기쉬운 생활법령정보',
  '장애인 신탁재산의 증여세 과세가액 불산입 요건과 신청서류 안내입니다. 자익신탁·타익신탁의 신고 시점을 구분하고 증여세 신고서, 증여재산명세·계약 및 장애인 증빙을 확인하세요.'),
 ('P3-06','https://easylaw.go.kr/CSP/CnpClsMainBtr.laf?ccfNo=4&cciNo=2&cnpClsNo=2&csmSeq=1259&popMenu=ov',['부담부증여','채무액','양도'],'법제처 찾기쉬운 생활법령정보',
  '부담부증여의 채무인수분을 양도로 보는 구조에 관한 공식 안내입니다. 증여계약서 원본이 아니라 절차·과세 안내이며, 인수채무의 실재·승계와 증여세 및 양도소득세를 구분해 검토하세요.'),
 ('DISCOVER-TT','https://www.tt.go.kr/mUser/attach/formList.do',[], '조세심판원',''),
 ('DISCOVER-TT-REVIEW','https://www.tt.go.kr/mUser/guide/judgmentList.do',[],'조세심판원',''),
 ('DISCOVER-MONEY','https://easylaw.go.kr/CSP/CnpClsMain.laf?ccfNo=2&cciNo=3&cnpClsNo=2&csmSeq=272&menuType=lsi&popMenu=ov',[],'법제처',''),
 ('DISCOVER-DIVISION','https://www.easylaw.go.kr/CSP/CnpClsMain.laf?ccfNo=4&cciNo=3&cnpClsNo=1&csmSeq=255',[],'법제처',''),
 ('DISCOVER-RENT','https://www.renthome.go.kr/webportal/bbs/frmtDownload/frmtDownloadList.open',[],'국토교통부 렌트홈',''),
 ('DISCOVER-TAXAGENT','https://www.kacta.or.kr/license_view/tax_publication/taxInfo/taxDoc_down.asp',[],'한국세무사회',''),
 ('DISCOVER-VAT','https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=2447&cntntsId=7780',[],'국세청',''),
 ('DISCOVER-GUARDIAN','https://sladmin.scourt.go.kr/slfamily/civil_complaint/civil_06/index_03.html',[],'서울가정법원',''),
]

def read_job(job):
 ident,url,terms,institution,note=job
 try:
  response=http(url); response.encoding=response.apparent_encoding or 'utf-8'
  soup=BeautifulSoup(response.text,'html.parser')
  body=soup.get_text(' ',strip=True)
  links=[{'text':a.get_text(' ',strip=True),'url':urljoin(response.url,a.get('href','')),'onclick':a.get('onclick'),'origin':response.url} for a in soup.select('a[href]')]
  data={'url':response.url,'http_status':200,'checked_at':now(),'sha256':digest(response.content),'text':body,'links':links,
        'rows':[{'text':r.get_text(' ',strip=True),'html':str(r)} for r in soup.select('tr')],
        'scripts':[{'url':urljoin(response.url,s.get('src','')),'text':s.get_text()} for s in soup.select('script')],
        'forms':[{'action':urljoin(response.url,f.get('action','')),'html':str(f)} for f in soup.select('form')]}
  save(DEST/(ident+'.json'),data)
  return job,data,None
 except Exception as error:
  save(DEST/(ident+'-failed.json'),{'url':url,'error':str(error),'checked_at':now()});return job,None,str(error)

pages={}
with ThreadPoolExecutor(max_workers=5) as pool:reads=list(pool.map(read_job,jobs))
for job,data,error in reads:
 ident,url,terms,institution,note=job
 if data:pages[ident]=data
 if ident.startswith('DISCOVER-'):continue
 if byid[ident]['status']=='확인 완료':continue
 if not data or not all(norm(t) in norm(data['text']) for t in terms):
  fail(ident,error or '기관 응답에서 요청한 본문·서류명을 확인하지 못했습니다.',url);continue
 evidence={k:data[k] for k in ('url','http_status','checked_at','sha256')};evidence['matched_terms']=terms
 if ident=='P7-03':
  forms=[a for a in data['links'] if 'downloadLocal.do' in a['url'] and any(t in a['text']+a['url'] for t in ['청구서','제3호'])]
  if not forms:fail(ident,'유족연금 안내는 있으나 청구서 링크가 없습니다.',url);continue
  evidence['form_links']=forms
  originals=[]
  for link in forms[:2]:
   try:
    f,_=get_original(ident,link,['청구'],public=False);originals.append(f)
   except Exception as ex:fail(ident,'원본 추가 검사: '+str(ex),link['url'])
  complete(ident,data['url'],evidence,institution,files=originals,note=note,license_text='국방부 공식 제공처 연결 · 첨부 재배포 조건 미확인')
 elif ident=='P7-07':
  if byid['P3-03']['status']!='확인 완료':fail(ident,'자격상실 기본 안내의 확인을 먼저 완료해야 합니다.',url);continue
  target=byid['P3-03'];target['related_ids']=sorted(set(target.get('related_ids',[])+['P7-07']))
  target.setdefault('supplementary_sources',[]).append({'title':'임의계속가입 제도(퇴직자 대상)','url':data['url'],'evidence':evidence})
  target['note']+=' 퇴직자 임의계속가입의 별도 안내는 https://www.nhis.or.kr/static/alim/paper/oldpaper/202302/sub/23.html 에서 확인할 수 있습니다. 이 제도는 사망자 자격의 자동 승계가 아닙니다.'
  byid[ident]['alias_verified']=True
  complete(ident,data['url'],evidence,institution,note=note,license_text='공식 제공처 링크 · 공단 2023년 안내, 현재 개별 적용은 공단 확인')
 else:
  if ident=='P8-05':byid[ident]['related_ids']=['P0-08','P0-10']
  if ident=='P3-06':byid[ident]['related_ids']=['BP-G-01']
  if ident=='P5-06':byid[ident]['related_ids']=['P5-04']
  complete(ident,data['url'],evidence,institution,note=note,license_text='공식 제공처 링크 · 본문 및 원본 양식 재배포하지 않음')

# Follow links actually present in previously verified official menus.
follow=[]
for key,term,ident in [('DISCOVER-MONEY','차용증 공증하기','P9-03'),('DISCOVER-DIVISION','공동상속인의 상속재산분할','P5-08')]:
 d=pages.get(key)
 if d:
  matches=[a for a in d['links'] if norm(a['text'])==norm(term) and urlparse(a['url']).hostname in ('easylaw.go.kr','www.easylaw.go.kr')]
  if matches:follow.append((ident,matches[0]['url'],[], '법제처 찾기쉬운 생활법령정보',''))
for job,data,error in map(read_job,follow):
 ident,url,_,institution,_=job
 if not data:fail(ident,error,url);continue
 terms=['공정증서','확정일자'] if ident=='P9-03' else ['재분할','증여']
 if not all(norm(t) in norm(data['text']) for t in terms):
  fail(ident,'공식 본문에서 '+'·'.join(terms)+'의 결합 안내 미확인',url);continue
 note='공정증서와 확정일자의 기능·절차를 구분하는 공식 안내입니다. 확정일자만으로 대여 사실이나 세금 처리가 확정되는 것은 아닙니다.' if ident=='P9-03' else '상속재산 분할 후 재분할에 따른 증여세 적용과 예외를 원문에서 확인하세요. 최초 협의분할과 재분할은 구분됩니다.'
 byid[ident]['related_ids']=['SC-30','SC-31'] if ident=='P9-03' else ['BP-I-01']
 complete(ident,data['url'],{k:data[k] for k in ('url','http_status','checked_at','sha256')},institution,note=note,license_text='공식 제공처 안내 · 재배포하지 않음')

# Preserve precise public attachment/search URLs for subsequent finite work.
for key in ['DISCOVER-TT','DISCOVER-RENT','DISCOVER-TAXAGENT','DISCOVER-GUARDIAN','DISCOVER-VAT']:
 d=pages.get(key)
 if not d:continue
 needles=['심사청구','심판청구','위임','진단서','재산목록','사망','신고','정정','승계','포괄','임대','form','download','board','Download']
 save(DEST/(key+'-candidates.json'),{'url':d['url'],'links':[a for a in d['links'] if any(t in a['text']+a['url']+(a['onclick'] or '') for t in needles)],'scripts':d['scripts'],'rows':d['rows']})
persist()
exec(compile('# Extend the catalog'+hs.split('# Extend the catalog',1)[1],str(hp),'exec'),globals())
print('NEW_DONE',','.join(r['id'] for r in results if r['status']=='확인 완료' and r['id'] not in START_DONE),flush=True)
