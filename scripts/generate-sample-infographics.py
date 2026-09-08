"""Render the approved seven-page infographic sample from the verified tax fixture.

Prerequisites: reportlab, Pillow, Poppler; Nanum OFL fonts in .tmp/fonts.
Run node scripts/export-sample-infographic-data.mjs first.
No customer data, AI-generated tax numbers, or changes to old sample assets.
"""
from pathlib import Path
import json, math, hashlib, subprocess
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, Color
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/media/sample-report-v2'
OUT.mkdir(parents=True,exist_ok=True)
DATA=json.loads((ROOT/'lib/sampleInfographicScenario.json').read_text())
FONTS=ROOT/'.tmp/fonts'
for name,file in [('Serif','serif.ttf'),('SerifB','serifbold.ttf'),('Sans','NanumGothic-Regular.ttf'),('SansB','sansbold.ttf')]:
    pdfmetrics.registerFont(TTFont(name,str(FONTS/file)))
pdfmetrics.registerFont(TTFont('Numbers','/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'))
pdfmetrics.registerFont(TTFont('NumbersB','/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'))
W,H=595.275590551,841.88976378
PAPER='#F8F4EA'; INK='#26221B'; SOFT='#6B6152'; RED='#B23A2A'; BRASS='#7A6139'; LINE='#CFC5B5'; PANEL='#EFEAE0'; MUTED='#B1A18A'
c=canvas.Canvas(str(OUT/'sample-report.pdf'),pagesize=(W,H),pageCompression=1)
c.setTitle('자산승계 360 | 세금 효과를 보는 7장 샘플 보고서')
c.setAuthor('자산승계 360')
c.setSubject('가상 사례, 1차 상속세 비교, 2026-09-08 기준, 전문가 검토 전')
TEXT_RECORD=[]

def txt(x,y,s,size=11,font='Sans',color=INK,align='left'):
    s=str(s);c.setFillColor(HexColor(color));c.setFont(font,size)
    width=pdfmetrics.stringWidth(s,font,size)
    xx=x-width/2 if align=='center' else x-width if align=='right' else x
    if xx < 35 or xx+width > W-35: raise ValueError(f'Text outside page: {s}, {xx}, {width}')
    c.drawString(xx,H-y-size,s)
    TEXT_RECORD.append({'page':c.getPageNumber(),'text':s,'x':xx,'y':y,'width':width,'size':size})

def line(x1,y1,x2,y2,color=LINE,width=1):
    c.setStrokeColor(HexColor(color));c.setLineWidth(width);c.line(x1,H-y1,x2,H-y2)

def box(x,y,w,h,fill=PANEL,stroke=None,r=4):
    c.setFillColor(HexColor(fill));c.setStrokeColor(HexColor(stroke or fill));c.setLineWidth(.7)
    c.roundRect(x,H-y-h,w,h,r,stroke=bool(stroke),fill=1)

def circle(x,y,r,fill=PAPER,stroke=BRASS,width=1):
    c.setFillColor(HexColor(fill));c.setStrokeColor(HexColor(stroke));c.setLineWidth(width);c.circle(x,H-y,r,stroke=1,fill=1)

def arrow(x1,y1,x2,y2,color=BRASS,width=1.4):
    line(x1,y1,x2,y2,color,width)
    angle=math.atan2(y2-y1,x2-x1)
    for off in [-.55,.55]:
        line(x2,y2,x2-7*math.cos(angle+off),y2-7*math.sin(angle+off),color,width)

def person(x,y,s=1,color=BRASS):
    c.setStrokeColor(HexColor(color));c.setLineWidth(1.3)
    c.circle(x,H-y,5*s,stroke=1,fill=0)
    p=c.beginPath();p.moveTo(x-10*s,H-(y+21*s));p.curveTo(x-10*s,H-(y+7*s),x+10*s,H-(y+7*s),x+10*s,H-(y+21*s));p.close()
    c.drawPath(p,stroke=1,fill=0)

def icon(kind,x,y,s=1,color=BRASS):
    c.saveState();c.translate(x,H-y);c.scale(s,s);c.setStrokeColor(HexColor(color));c.setLineWidth(1.3);c.setLineJoin(1)
    if kind=='home':
        p=c.beginPath();p.moveTo(-16,-1);p.lineTo(0,13);p.lineTo(16,-1);c.drawPath(p)
        c.rect(-11,-19,22,19,stroke=1,fill=0);c.rect(-3,-19,6,10,stroke=1,fill=0)
    elif kind=='building':
        c.rect(-11,-20,22,34,stroke=1,fill=0)
        for xx in [-6,3]:
            for yy in [-10,0,10]:c.rect(xx,yy,3,3,stroke=1,fill=0)
    elif kind=='coins':
        for yy in [-14,-6,2]:
            c.ellipse(-13,yy,13,yy+8,stroke=1,fill=0)
            c.line(-13,yy+4,-13,yy-2);c.line(13,yy+4,13,yy-2)
    elif kind=='doc':
        p=c.beginPath();p.moveTo(-11,-20);p.lineTo(-11,15);p.lineTo(5,15);p.lineTo(12,8);p.lineTo(12,-20);p.close();c.drawPath(p)
        c.line(5,15,5,8);c.line(5,8,12,8)
        for yy in [2,-4,-10]:c.line(-6,yy,7,yy)
    elif kind=='check':
        c.circle(0,0,16,stroke=1,fill=0)
        p=c.beginPath();p.moveTo(-8,0);p.lineTo(-2,-6);p.lineTo(9,7);c.drawPath(p)
    c.restoreState()

def header(n,label,title,subtitle=None):
    box(0,0,W,H,PAPER,r=0)
    txt(42,28,'자산승계 360',15,'SerifB')
    txt(W-42,33,'가상 가족 A · 상속 샘플',8.5,'Sans',SOFT,'right')
    line(42,61,W-42,61,BRASS,.65)
    txt(42,83,f'{n:02d}',32,'Numbers',RED)
    line(101,90,101,121,LINE,1)
    txt(115,91,label,11,'SansB',BRASS)
    txt(115,110,'FAMILY WEALTH SUCCESSION',6.6,'Sans',SOFT)
    for i,t in enumerate(title.split('\n')):txt(42,149+i*35,t,27,'SerifB')
    if subtitle:txt(42,231 if '\n' in title else 195,subtitle,10.5,'Sans',SOFT)

def footer(n):
    line(42,795,W-42,795,BRASS,.7)
    txt(42,805,'샘플 · 가상 사례 · 1차 상속세 추정 · 전문가 검토 전',7.4,'Sans',SOFT)
    txt(W-42,805,f'{n:02d} / 07',8,'Numbers',INK,'right')
    txt(42,819,'기준 2026.09.08 | 2차 상속세·취득세·향후 양도세는 별도 검토',6.5,'Sans',SOFT)
    c.showPage()

def money(won):return f'{won/100_000_000:.2f}'
def exact(won):return f'{won:,}원'
def big_eok(x,y,number,size=38,color=INK):
    txt(x,y,number,size,'NumbersB',color)
    width=pdfmetrics.stringWidth(number,'NumbersB',size)
    txt(x+width+5,y+size*.45,'억원',12,'SansB',color)

A,B,C=DATA['cases']; delta=DATA['differenceWon']

# 01: exactly three dominant numbers; the reason takes one short sentence.
header(1,'세금효과 요약','같은 재산,\n배분에 따라 달라지는 세금.','배우자 5억 배분안과 15억 배분안의 1차 상속세 비교')
box(42,281,240,153,PANEL);box(296,281,257,153,PANEL)
txt(59,300,'A  배우자 5억 배분',11,'SansB',SOFT)
txt(313,300,'C  배우자 15억 배분',11,'SansB',SOFT)
big_eok(59,334,money(A['totalTaxWon']),38)
big_eok(313,334,money(C['totalTaxWon']),38)
txt(59,401,exact(A['totalTaxWon']),8.5,'Sans',SOFT)
txt(313,401,exact(C['totalTaxWon']),8.5,'Sans',SOFT)
box(42,462,511,191,PAPER,LINE)
txt(64,483,'예상 세금 차이',12,'SansB',RED)
big_eok(64,515,money(delta),61,RED)
txt(64,601,'감소  '+exact(delta),10,'SansB',RED)
txt(42,676,'배우자 상속공제가 5억에서 15억으로 늘어나는 가정입니다.',11,'Sans')
line(42,717,553,717)
txt(42,735,'자산 50억  ·  채무 5억  ·  배우자와 성년 자녀 3명',11,'SansB',SOFT)
footer(1)

# 02: family tree and proportional asset composition.
header(2,'가족과 자산','누구의 재산인지부터,\n가족의 구조를 그립니다.')
box(42,251,511,228,PAPER,LINE)
person(216,286,1.1);person(377,286,1.1)
txt(216,323,'아버지',12,'SansB',align='center');txt(377,323,'배우자',12,'SansB',align='center')
txt(216,345,'전 재산 50억 소유',9,'Sans',SOFT,'center');txt(377,345,'생존 가정',9,'Sans',SOFT,'center')
line(243,300,350,300);line(297,300,297,383);line(130,383,464,383)
for x,name in [(130,'첫째'),(297,'둘째'),(464,'셋째')]:
    line(x,383,x,400);person(x,410,.75);txt(x,440,name+' · 성년',10,'SansB',align='center')
txt(42,508,'자산 구성',12,'SansB')
segments=[(25,'건물',INK),(15,'주택',BRASS),(10,'예금',MUTED)]
x=42
for value,label,color in segments:
    ww=511*value/50;box(x,540,ww,31,color,r=0)
    txt(x+ww/2,548,f'{value/50*100:.0f}%',10,'SansB',PAPER,'center');x+=ww
for x,kind,label,value in [(110,'building','건물','25'),(296,'home','주택','15'),(481,'coins','예금','10')]:
    icon(kind,x,606,.8);txt(x,639,label+' '+value+'억원',12,'SansB',align='center')
box(42,690,511,69,PANEL)
txt(62,704,'금융기관 채무',9.5,'Sans',SOFT);txt(62,724,'5억원',19,'SerifB')
txt(328,704,'채무 차감 후 순재산',9.5,'Sans',SOFT);txt(328,724,'45억원',19,'SerifB')
footer(2)

# 03: honest zero-based tax bars on a common 0..14억 scale.
header(3,'세 가지 배분안','배우자 배분액을 바꿔,\n같은 조건으로 비교합니다.','자산·채무·자녀 수·장례비·신고 조건은 모두 동일합니다.')
left,right,top,bottom=62,529,295,587
for value in [0,4,8,12]:
    yy=bottom-(bottom-top)*value/14
    line(left,yy,right,yy,LINE,.6);txt(left,yy-14,f'{value}억',8,'Sans',SOFT)
for x,row,color in [(133,A,INK),(295,B,BRASS),(457,C,RED)]:
    hh=(bottom-top)*(row['totalTaxWon']/1e8)/14
    box(x-42,bottom-hh,84,hh,color,r=2)
    txt(x,bottom-hh-36,money(row['totalTaxWon']),24,'NumbersB',color,'center')
    txt(x,607,row['code']+'안',12,'SansB',align='center')
    txt(x,631,f"배우자 {row['spouseAllocationWon']/1e8:.0f}억원",10,'Sans',SOFT,'center')
box(42,687,511,70,PANEL)
txt(62,701,'A안 대비 C안',10,'SansB',SOFT)
txt(62,725,'1차 상속세 4.26억원 감소',19,'SerifB',RED)
txt(42,771,'단위: 억원 · 소수 둘째 자리 반올림 · 가족 전체의 생애 총세금 비교는 아닙니다.',7.7,'Sans',SOFT)
footer(3)

# 04: allocation is not a tax expense; branch totals equal45억원 beforefuneral/tax.
header(4,'배우자 배분안','배우자 15억,\n자녀들에게는 30억.','C안의 배분 예시 · 채무 차감 후, 세금·장례비 차감 전')
box(165,274,266,75,PANEL)
txt(298,287,'나눌 순재산',10,'SansB',SOFT,'center');txt(298,311,'45억원',24,'SerifB',INK,'center')
line(298,349,298,385);line(145,385,428,385);arrow(145,385,145,416);arrow(428,385,428,416)
box(42,424,215,130,PAPER,LINE);box(296,424,257,130,PAPER,LINE)
person(145,447,.8);txt(145,479,'배우자',12,'SansB',align='center');txt(145,506,'15억원',25,'SerifB',RED,'center')
person(424,447,.8);txt(424,479,'성년 자녀 3명',12,'SansB',align='center');txt(424,506,'합계 30억원',25,'SerifB',INK,'center')
line(424,554,424,578);line(333,578,515,578)
for x,name in [(333,'첫째'),(424,'둘째'),(515,'셋째')]:
    line(x,578,x,596);txt(x,607,name,10,'Sans',SOFT,'center');txt(x,629,'10억원',14,'SerifB',INK,'center')
box(42,698,511,59,PANEL)
txt(62,711,'배우자 상속공제',11,'SansB',SOFT)
txt(326,708,'5억',22,'SerifB',SOFT);arrow(381,730,425,730,RED,1.8);txt(446,708,'15억',22,'SerifB',RED)
txt(42,771,'실제 분할·공제 요건 확인이 필요합니다. 자녀별 배분은 세전 예시입니다.',8,'Sans',SOFT)
footer(4)

# 05: exact calculation, compact supplementary comparison table.
header(5,'세금 계산 근거','재산에서 공제를 빼고,\n세율을 적용합니다.','C안 · 배우자 15억원 배분 기준')
box(42,274,233,67,PANEL);box(320,274,233,67,PANEL)
txt(58,285,'상속재산',10,'SansB',SOFT);txt(58,307,'50억원',22,'SerifB')
txt(337,285,'과세가액',10,'SansB',SOFT);txt(337,307,'44.95억원',22,'SerifB')
arrow(282,309,311,309)
txt(42,356,'채무 5억 + 장례비 0.05억 차감',10,'Sans',SOFT)
for x,label,value in [(42,'일괄공제','5억'),(218,'배우자공제','15억'),(394,'금융재산공제','1억')]:
    box(x,395,159,68,PAPER,LINE);txt(x+15,407,label,9.5,'SansB',SOFT);txt(x+15,431,value,20,'SerifB')
txt(42,477,'금융재산공제: (예금 10억 - 금융채무 5억) × 20% = 1억',9,'Sans',SOFT)
arrow(298,503,298,525)
txt(298,540,'과세표준 23.95억원',22,'SerifB',INK,'center')
txt(298,578,'× 40% - 누진공제 1.6억 - 신고세액공제 3%',10,'Sans',SOFT,'center')
box(42,616,511,77,PANEL)
txt(59,630,'추정 상속세',11,'SansB',RED);big_eok(325,628,money(C['totalTaxWon']),30,RED)
txt(59,660,'798,000,000 - 23,940,000 = 774,060,000원',9,'Sans',SOFT)
line(42,718,553,718)
txt(42,732,'A안  33.95억 × 50% - 4.6억 → 신고공제 후 12.00억',9.4,'Sans',SOFT)
txt(42,754,'B안  28.95억 × 40% - 1.6억 → 신고공제 후   9.68억',9.4,'Sans',SOFT)
footer(5)

# 06: cash budget explicitly repaysdebt and ringfences livingfunds.
header(6,'생활비와 납부재원','세금이 줄어도,\n쓸 수 있는 현금은 확인해야 합니다.')
txt(42,232,'C안 · 예금 사용, 채무 전액 상환, 생활재원 5억원 확보 가정',10,'Sans',SOFT)
box(42,282,238,257,PANEL);box(295,282,258,257,PANEL)
icon('coins',73,315,.65);txt(95,303,'쓸 수 있는 현금',12,'SansB')
txt(59,350,'예금',11,'Sans',SOFT);txt(262,350,'10억',13,'SansB',INK,'right')
txt(59,384,'채무 상환',11,'Sans',SOFT);txt(262,384,'- 5억',13,'SansB',INK,'right')
txt(59,418,'장례비',11,'Sans',SOFT);txt(262,418,'- 0.05억',13,'SansB',INK,'right')
line(59,455,262,455)
big_eok(59,476,money(DATA['cash']['availableWon']),29)
icon('doc',326,315,.65);txt(347,303,'필요한 현금',12,'SansB')
txt(312,350,'추정 상속세',11,'Sans',SOFT);txt(535,350,'7.74억',13,'SansB',INK,'right')
txt(312,384,'남겨둘 생활재원',11,'Sans',SOFT);txt(535,384,'+ 5억',13,'SansB',INK,'right')
txt(312,418,'생활재원은 세금 공제가 아닙니다.',8,'Sans',SOFT)
line(312,455,535,455)
big_eok(312,476,money(DATA['cash']['requiredWon']),29)
box(42,574,511,127,PAPER,LINE)
txt(63,594,'추가 확보할 현금',12,'SansB',RED)
big_eok(63,627,money(DATA['cash']['shortfallWon']),39,RED)
txt(42,727,'대출 상환 시기와 생활재원 목표가 달라지면 필요한 현금도 달라집니다.',10,'Sans',SOFT)
txt(42,752,'세금만의 부족액은 2.79억원입니다. 위 7.79억원에는 생활재원 5억원이 포함됩니다.',8,'Sans',SOFT)
footer(6)

# 07: short timeline, material conditions, clickable primary references.
header(7,'실행 준비','가족의 선택을,\n실행 가능한 계획으로.')
line(73,290,73,534,LINE,2)
for y,num,title,sub,kind in [(280,'1','자료 준비','재산 소유 · 평가액 · 채무 · 과거 증여','doc'),(387,'2','가족의 배분안 검토','배우자 배분 · 자녀 간 형평 · 생활재원','home'),(494,'3','전문가 확인 후 실행','공제 요건 · 분할·신고 기한 · 납부 계획','check')]:
    circle(73,y+20,24,PAPER,BRASS);txt(73,y+4,num,21,'Numbers',BRASS,'center')
    txt(119,y+1,title,18,'SerifB');txt(119,y+39,sub,10,'Sans',SOFT)
box(42,593,511,126,PANEL)
txt(58,605,'이 샘플의 계산 조건',11,'SansB')
for i,s in enumerate(['거주자인 아버지 단독 소유 · 배우자와 성년 자녀 3명 · 사전증여 없음',
    '금융기관 채무 5억 · 공제 대상 예금 10억 · 직접 장례비 500만원',
    '기한 내 신고·재산분할 요건 충족 · 기타 특수재산·추가공제 없음',
    '배우자의 향후 상속과 취득세·양도세까지 포함한 총절세액은 아님']):
    txt(58,630+i*19,s,8.8,'Sans',SOFT)
refs=[('국세청 상속공제','https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7956&mi=6528'),('국세청 계산흐름도','https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7720&mi=2326'),('상증세법 제19조','https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1024572131'),('상증세법 제69조','https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029616341')]
txt(42,735,'계산 근거',9,'SansB',SOFT)
for x,(label,url) in zip([42,171,315,443],refs):
    txt(x,758,label,8.8,'Sans',BRASS);width=pdfmetrics.stringWidth(label,'Sans',8.8)
    line(x,772,x+width,772,BRASS,.5);c.linkURL(url,(x,H-775,x+width,H-755),relative=0)
footer(7)
c.save()

# Rendering provides identical A4 dimensions for all7websiteimages.
subprocess.run(['pdftoppm','-scale-to-x','1400','-scale-to-y','1980','-png',str(OUT/'sample-report.pdf'),str(OUT/'render')],check=True,stdout=subprocess.DEVNULL)
titles=['세금효과 요약','가족과 자산','세 가지 배분안','배우자 배분안','세금 계산 근거','생활비와 납부재원','실행 준비']
heads=['같은 재산, 배분에 따라 달라지는 세금.','누구의 재산인지부터, 가족의 구조를 그립니다.','배우자 배분액을 바꿔 같은 조건으로 비교합니다.','배우자 15억, 자녀들에게는 30억.','재산에서 공제를 빼고 세율을 적용합니다.','세금이 줄어도 쓸 수 있는 현금은 확인해야 합니다.','가족의 선택을 실행 가능한 계획으로.']
points=[
 ['가상 사례의 1차 상속세 비교입니다. A 배우자 5억원 배분안 1,200,375,000원, C 배우자 15억원 배분안 774,060,000원, 예상 차액 426,315,000원입니다.','표시 금액 12.00억, 7.74억, 4.26억은 소수 둘째 자리 반올림입니다.','배우자 상속공제가 5억원에서15억원으로 달라집니다. 2차 상속세·취득세·향후 양도세는 포함하지 않습니다.'],
 ['거주자인 아버지가 건물25억원·주택15억원·예금10억원을 모두 소유하는 가상 조건입니다.','배우자는 생존하고 첫째·둘째·셋째 자녀는 모두 성년입니다.','금융기관 채무5억원 차감 후 순재산은45억원입니다. 장례비·세금 차감 전입니다.'],
 ['동일한 재산·채무·장례비와 신고 조건으로 비교합니다.','A 배우자5억원:1,200,375,000원. B 배우자10억원:968,060,000원. C 배우자15억원:774,060,000원.','세로축0부터 시작한 그래프입니다. 1차 상속세가 적어도 가족 전체의 총세금 최소안을 뜻하지 않습니다.'],
 ['채무를 뺀45억원을 배우자15억원, 자녀들에게30억원으로 배분하는 C안입니다.','자녀에게 각각10억원씩 배분한 예시이며 장례비와 상속세를 차감하기 전입니다.','배우자의 실제 분할과 공제 요건을 확인해야 합니다. 배우자 배분액은 가족 순재산에서 차감되는 비용이 아닙니다.'],
 ['C안:50억-채무5억-장례비0.05억=과세가액44.95억.','일괄5억+배우자15억+금융1억=공제21억. 금융공제는(예금10억-금융채무5억)×20%입니다.','과세표준23.95억×40%-누진공제1.6억=산출세액798,000,000원. 신고세액공제23,940,000원 차감 후774,060,000원입니다.'],
 ['예금10억을 전액 사용할 수 있고 채무5억을 모두 상환하며 장례비500만원을 지급하는 가상 조건입니다. 가용현금은4.95억원입니다.','C안 추정 상속세774,060,000원과 별도로 남겨둘 생활재원5억원을 합친 필요현금은1,274,060,000원입니다.','추가 확보할 현금은779,060,000원입니다. 세금만의 부족액279,060,000원과 생활재원5억원이 합쳐진 금액이며, 생활재원은 세금 공제가 아닙니다.'],
 ['재산 소유·평가액·채무·과거 증여 자료를 준비합니다. 가족의 배분안과 생활재원을 검토합니다.','거주자, 성년 자녀3명, 사전증여·특수재산 없음, 기한 내 신고와 배우자 분할 요건 충족을 가정합니다.','전문가가 공제 요건과 분할·신고 기한, 납부 계획을 검토한 뒤 실행합니다. 기준일2026-09-08.']
]
pages=[]
for i in range(1,8):
    source=OUT/f'render-{i}.png'
    im=Image.open(source).convert('RGB');assert im.size==(1400,1980)
    target=OUT/f'page-{i:02d}.webp';im.save(target,'WEBP',quality=94,method=6)
    pages.append({'title':titles[i-1],'headline':heads[i-1],'points':points[i-1],'image':f'/media/sample-report-v2/page-{i:02d}.webp','width':1400,'height':1980,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
manifest={'version':2,'lawCheckedOn':DATA['lawCheckedOn'],'pdf':'/media/sample-report-v2/sample-report.pdf','scenario':'父 단독소유50억, 금융기관채무5억, 배우자+성년자녀3명','pages':pages,'taxesWon':[x['totalTaxWon'] for x in [A,B,C]],'differenceWon':delta,'references':[{'label':label,'url':url} for label,url in refs]}
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
(ROOT/'.tmp/sample-infographic-text-bounds.json').write_text(json.dumps(TEXT_RECORD,ensure_ascii=False,indent=2))
print(json.dumps({'pdf':str(OUT/'sample-report.pdf'),'pages':len(pages),'taxes':manifest['taxesWon'],'imageBytes':[p.stat().st_size for p in sorted(OUT.glob('page-*.webp'))]},ensure_ascii=False))
