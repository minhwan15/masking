import assert from 'node:assert/strict';
import fs from 'node:fs';
import {openPDF,extractPage,redactPDF,mupdf} from '../dist/engine.js';
import {inspectSchoolRecord,schoolRecordMasks,defaultSections} from '../dist/school-record.js';
const doc=openPDF(fs.readFileSync(new URL('../dist/school-record-example.pdf',import.meta.url)));
const pages=Array.from({length:doc.countPages()},(_,i)=>extractPage(doc,i));
const info=inspectSchoolRecord(pages);assert.equal(info.recognized,true);assert.equal(info.studentId,'30105');
assert.ok(info.headers[0].hasRegister,'Graduation register row not found');
assert.ok(info.headers[0].rect[1]<74,'Graduation register upper border not covered');
// The submitted layout has 학년 in a lower diagonal cell and a separate 학과
// column. OCR lines and absence of the following heading must not lose the table.
const headerOnly={...pages[0],lines:pages[0].lines.filter(l=>l.chars.some(c=>c.rect[1]>=74)&&l.chars.every(c=>c.rect[3]<194)).map(l=>({...l,ocr:true}))};
const isolated=inspectSchoolRecord([headerOnly]);assert.ok(isolated.recognized);assert.equal(isolated.studentId,'30105');assert.equal(isolated.headers.length,1);assert.ok(isolated.headers[0].rect[3]>=192);
const shifted={...headerOnly,bounds:[0,0,595,130],lines:headerOnly.lines.map(l=>({...l,chars:l.chars.map(c=>({...c,rect:c.rect.map((v,i)=>i%2?v-65:v)}))}))};
assert.equal(inspectSchoolRecord([shifted]).studentId,'30105','Cropped table image coordinates');
const sameLine={bounds:[0,0,595,842],images:[],lines:[]};
const cell=(s,x,y)=>({chars:Array.from(s,(c,i)=>({c,rect:[x+i*8,y,x+(i+1)*8,y+10]}))});
for(const [s,x]of [['학년',40],['반',120],['번호',190],['담임성명',310]])sameLine.lines.push(cell(s,x,80));
for(const [s,x]of [['3',44],['1',120],['5',192],['박가상',310]])sameLine.lines.push(cell(s,x,110));
sameLine.lines.push(cell('학교생활기록부',160,25),cell('1. 인적학적사항',38,160));
assert.equal(inspectSchoolRecord([sameLine]).studentId,'30105','Original single-line header regression');
const result=schoolRecordMasks(pages,info);assert.deepEqual(result.missing,[]);
assert.equal(result.masks.find(m=>m.section==='footer').rect[1],842*.92,'Default footer height is 8%');
assert.deepEqual(result.masks.filter(m=>m.section==='awards').map(m=>m.page),[0,1]);
assert.deepEqual(result.masks.filter(m=>m.section==='volunteer').map(m=>m.page),[1,2]);
const page3Volunteer=result.masks.find(m=>m.section==='volunteer'&&m.page===2);assert.ok(page3Volunteer.rect[1]>90,'A repeated creative-activity heading must end the preceding volunteer section');
assert.equal(result.masks.filter(m=>m.section==='footer').length,3);
const bytes=redactPDF(doc,result.masks),out=openPDF(bytes);
const read=d=>Array.from({length:d.countPages()},(_,i)=>{const p=d.loadPage(i),s=p.toStructuredText(),t=s.asText();s.destroy();p.destroy();return t}).join('\n');
const text=read(out);
for(const removed of ['졸업 대장 번호','2026-0123','보통과','담임성명','김예시','김가상','박예시','인적','학적','가상과학탐구대회','다음 페이지 수상 기록','봉사활동','가상시설','발급일','가상푸른고등학교'])assert.ok(!text.includes(removed),'Not removed: '+removed);
for(const kept of ['출결 내용은 원래 글자 그대로','가상자격증 정보는 보존','자율활동 문장은 그대로','빛의 반사와 굴절','드래그해 복사','독서활동상황','행동특성 및 종합의견'])assert.ok(text.includes(kept),'Lost content: '+kept);
function assertWhite(d,page,rect){
 const p=d.loadPage(page),pix=p.toPixmap(mupdf.Matrix.identity,mupdf.ColorSpace.DeviceRGB,false,false),data=pix.getPixels(),stride=pix.getStride();
 for(let y=Math.ceil(rect[1])+2;y<Math.floor(rect[3])-2;y+=7)for(let x=Math.ceil(rect[0])+2;x<Math.floor(rect[2])-2;x+=7){const offset=y*stride+x*3;assert.deepEqual(Array.from(data.slice(offset,offset+3)),[255,255,255],`Not white at ${page}:${x},${y}`)}
 pix.destroy();p.destroy();
}
for(const m of result.masks)assertWhite(out,m.page,m.rect);
assert.ok(read(doc).includes('김예시'),'Source modified');
fs.writeFileSync(new URL('school-redacted.pdf',import.meta.url),bytes);
const options={...defaultSections(),awards:false,volunteer:false};const reduced=schoolRecordMasks(pages,info,options,12);
assert.ok(!reduced.masks.some(m=>['awards','volunteer'].includes(m.section)));
for(const m of reduced.masks.filter(m=>m.section==='footer'))assert.equal(m.rect[1],842*.88);
const unmasked=openPDF(redactPDF(doc,reduced.masks));assert.ok(read(unmasked).includes('다음 페이지 수상 기록'));assert.ok(read(unmasked).includes('가상시설'));unmasked.destroy();
// Rotation + nonzero CropBox + colored backgrounds catch coordinate errors that
// text-extraction-only assertions miss. Fill and erasure must use the same area.
for(const angle of [0,90,180,270]){
 const d=new mupdf.PDFDocument(),font=d.addSimpleFont(new mupdf.Font('Helvetica'));
 const ref=d.addPage([0,0,400,500],angle,{Font:{F1:font}},'0.2 0.5 0.7 rg 0 0 400 500 re f 0 0 0 rg BT /F1 16 Tf 70 400 Td (SECRET_NAME) Tj 0 -230 Td (KEEP_TEXT) Tj ET');
 ref.put('CropBox',[25,35,375,475]);d.insertPage(-1,ref);ref.destroy();font.destroy();
 const p=extractPage(d,0),line=p.lines.find(l=>l.chars.map(c=>c.c).join('').includes('SECRET_NAME'));
 const cs=line.chars,r=[Math.min(...cs.map(c=>c.rect[0]))-3,Math.min(...cs.map(c=>c.rect[1]))-3,Math.max(...cs.map(c=>c.rect[2]))+3,Math.max(...cs.map(c=>c.rect[3]))+3];
 const clean=openPDF(redactPDF(d,[{page:0,enabled:true,rect:r}]));
 assert.ok(!read(clean).includes('SECRET_NAME'));assert.ok(read(clean).includes('KEEP_TEXT'));
 assertWhite(clean,0,r);clean.destroy();d.destroy();
}
// Number changes, OCR whitespace, and an unknown next heading are boundaries.
function fakePage(lines){return {bounds:[0,0,600,800],images:[],lines:lines.map(([text,y])=>({ocr:true,chars:Array.from(text,(c,i)=>({c,rect:[30+i*9,y,39+i*9,y+12]}))}))}}
const synthetic=[fakePage([['학 교 생 활 기 록 부',20],['1. 인적 사항',100],['비공개내용',140],['2. 학적 사항',180],['학교이동기록',220],['3. 출결 상황',280],['4. 수 상 경 력',360],['상 이름',400],['5. 새로 생긴 항목',490],['남길 내용',540]])];
const syn=inspectSchoolRecord(synthetic),ms=schoolRecordMasks(synthetic,syn);assert.ok(syn.recognized);assert.ok(ms.masks.filter(m=>m.section==='personal').some(m=>m.rect[1]<100&&m.rect[3]>220));assert.ok(ms.masks.find(m=>m.section==='awards').rect[3]<490);
const mixed=synthetic.map(p=>({...p,lines:[...p.lines.map(l=>({...l,ocr:false})),...p.lines.map(l=>({...l,chars:l.chars.map(c=>({...c,rect:c.rect.map((v,i)=>v+(i%2?2:3))}))}))]}));
assert.equal(inspectSchoolRecord(mixed).events.length,syn.events.length,'Duplicate OCR should not corrupt native headings');
const sections=[fakePage([['학교생활기록부',20],['5. 창의적 체험활동상황',80],['봉사활동 실적',120],['봉사 내용',160]]),fakePage([['5. 창의적 체험활동상황 (계속)',50],['자율활동',100],['자율활동 세부능력 문장',140],['동아리활동',220],['동아리활동 세부능력 문장',260],['봉사활동 실적',360],['봉사 내용',400],['6. 교과학습발달상황',500]])];
const continued=schoolRecordMasks(sections,inspectSchoolRecord(sections));
const continuedPage=continued.masks.filter(m=>m.section==='volunteer'&&m.page===1);assert.equal(continuedPage.length,1);assert.ok(continuedPage[0].rect[1]>300,'Autonomous and club activities must never be swept into a volunteer continuation');
const exam=[fakePage([['3학년 시험지',20],['문제 1. 인적사항을 설명하시오.',100],['수상경력에 관한 글을 읽고 답하시오.',170]])];assert.equal(inspectSchoolRecord(exam).recognized,false);
// Early footers are discovered and remain user-adjustable.
const early=[fakePage([['학교생활기록부',20],['가상학교 3학년 1반 5번',700]])];assert.ok(inspectSchoolRecord(early).footerPercent>7);
out.destroy();doc.destroy();
console.log('PASS: whole sections, multi-page continuations, per-page footers, current grade ID, deselection, non-records, white pixel fill, cropped/rotated pages, retained selectable Korean');
