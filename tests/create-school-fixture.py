"""Fictional native-text school record to exercise section boundaries and continuations."""
import io
from pathlib import Path
import fitz
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor

pdfmetrics.registerFont(TTFont('Korean',io.BytesIO(fitz.Font('korea').buffer)))
root=Path(__file__).resolve().parent.parent
c=canvas.Canvas(str(root/'dist/school-record-example.pdf'),pagesize=(595,842),pageCompression=1)
c.setTitle('가림 - 가상 학교생활기록부 예시')
def text(x,y,s,size=10):
    c.setFillColor(HexColor('#202938'));c.setFont('Korean',size);c.drawString(x,842-y,s)
def line(x,y,x1,y1):
    c.setStrokeColor(HexColor('#929ba9'));c.setLineWidth(.5);c.line(x,842-y,x1,842-y1)
def table(top,heights,widths,rows):
    xs=[38]
    for w in widths:xs.append(xs[-1]+w)
    ys=[top]
    for h in heights:ys.append(ys[-1]+h)
    c.setFillColor(HexColor('#eef3f8'));c.rect(38,842-ys[1],xs[-1]-38,heights[0],fill=1,stroke=0)
    for y in ys:line(xs[0],y,xs[-1],y)
    for x in xs:line(x,ys[0],x,ys[-1])
    for ri,row in enumerate(rows):
        for ci,cell in enumerate(row):
            for j,t in enumerate(str(cell).split('\n')):text(xs[ci]+8,ys[ri]+17+j*18,t,9)
def heading(y,s):text(38,y,s,12)
def page(n):
    text(185,34,'학교생활세부사항기록부',17)
    text(164,54,'가림 기능 확인용 예시 · 실제 학생 정보가 아닙니다.',8)
    line(38,788,557,788)
    text(38,805,'가상푸른고등학교   3학년 1반 5번   김예시',9)
    text(410,820,f'발급일 2026.09.19.     {n} / 3',9)
page(1)
# Multi-row header with a diagonal cell, as seen beside the student photograph.
for y in [74,96,132,152,172,192]:line(38,y,557,y)
for x in [38,106,286,334,379,557]:line(x,96,x,192)
for x in [38,145,557]:line(x,74,x,96)
line(38,96,106,132)
text(44,89,'졸업 대장 번호',9);text(155,89,'2026-0123',9)
text(77,106,'구분',8);text(43,125,'학년',9)
for x,label in [(185,'학과'),(304,'반'),(346,'번호'),(444,'담임성명')]:text(x,117,label,9)
for y,grade,room,number,teacher in [(146,'1','2','8','김가상'),(166,'2','3','6','이연습'),(186,'3','1','5','박예시')]:
    for x,value in [(68,grade),(180,'보통과'),(306,room),(349,number),(444,teacher)]:text(x,y,value,9)
heading(211,'1. 인적·학적사항')
table(224,[27,48,60,32],[96,423],[['구분','내용'],['인적사항','성명 : 김예시   주민등록번호 : 090101-3123456\n주소 : 인천광역시 가상구 예시로 123'],['학적사항','2022년 2월 가상중학교 졸업\n2022년 3월 가상푸른고등학교 입학'],['특기사항','개인 학적 기록 전체가 제거되는지 확인합니다.']])
heading(424,'2. 출결상황')
table(438,[24,42],[96,100,323],[['학년','수업일수','특기사항'],['3','190','출결 내용은 원래 글자 그대로 남습니다.']])
heading(550,'3. 수상경력')
table(565,[25,56,56,60],[64,180,130,145],[['학년','수상명','수상연월일','수여기관'],['1','가상과학탐구대회 최우수','2023.06.15.','가상교육지원청'],['2','교내 독서발표 우수상','2024.10.12.','가상푸른고등학교'],['3','가상창의설계대회 금상','2025.05.16.','가상교육원']])
c.showPage()
page(2)
heading(85,'3. 수상경력 (계속)')
table(100,[25,56,35],[64,180,130,145],[['학년','수상명','수상연월일','수여기관'],['3','다음 페이지 수상 기록','2025.07.19.','가상교육원'],['3','계속된 수상 실적도 제거','2025.11.01.','가상교육원']])
heading(251,'4. 자격증 및 인증 취득상황')
table(264,[24,40],[130,389],[['구분','내용'],['자격증','가상자격증 정보는 보존합니다.']])
heading(365,'5. 창의적 체험활동상황')
table(380,[24,56],[130,389],[['영역','특기사항'],['자율활동','자율활동 문장은 그대로 보존합니다.\n공동체 문제를 조사하고 해결 방안을 발표함.']])
heading(490,'봉사활동 실적')
table(506,[26,60,60,60,48],[64,140,235,80],[['학년','일자 또는 기간','장소 또는 주관기관명 / 활동내용','시간'],['1','2023.05.12.','가상도서관 / 도서 정리 활동','4'],['2','2024.08.21.','가상복지관 / 행사 준비 활동','6'],['3','2025.03.10.','가상봉사센터 / 환경 정화 활동','3'],['3','2025.04.16.','봉사 실적은 다음 쪽으로 이어집니다.','2']])
c.showPage()
page(3)
heading(82,'5. 창의적 체험활동상황 (계속)')
heading(115,'봉사활동 실적 (계속)')
table(131,[26,60,60],[64,140,235,80],[['학년','일자 또는 기간','장소 또는 주관기관명 / 활동내용','시간'],['3','2025.06.22.','다음 페이지 봉사 실적 / 가상활동','4'],['3','2025.08.11.','가상시설 방문 봉사활동','3']])
heading(335,'6. 교과학습발달상황')
table(351,[26,117],[96,423],[['과목','세부능력 및 특기사항'],['물리학','빛의 반사와 굴절을 비교하는 실험을 설계함.\n실험에서 얻은 자료를 그래프로 표현하고\n관찰 결과를 근거로 자신의 생각을 설명함.\n이 문장은 마스킹 후에도 드래그해 복사할 수 있습니다.']])
heading(543,'7. 독서활동상황')
table(557,[24,45],[96,423],[['과목','독서활동'],['과학','과학 도서를 읽고 주요 개념을 정리함.']])
heading(677,'8. 행동특성 및 종합의견')
text(46,705,'다른 사람의 의견을 듣고 협력하여 과제를 해결함.')
text(46,728,'이 예시는 항목 인식과 저장 기능 확인을 위한 가상 문서입니다.',9)
c.save()
