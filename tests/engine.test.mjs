import assert from 'node:assert/strict';
import fs from 'node:fs';
import {openPDF,extractPage,redactPDF,renderPage} from '../dist/engine.js';
import {detect,categories} from '../dist/detect.js';
const enabled=Object.fromEntries(Object.keys(categories).map(k=>[k,true]));
const load=p=>openPDF(new Uint8Array(fs.readFileSync(new URL(p,import.meta.url))));
const txt=d=>Array.from({length:d.countPages()},(_,i)=>{const p=d.loadPage(i),s=p.toStructuredText();const t=s.asText();s.destroy();p.destroy();return t}).join('\n');
const doc=load('../dist/example.pdf');
const result=detect([extractPage(doc,0)],enabled);
assert.deepEqual(result.ids,['30105']);
assert.equal(result.masks.filter(m=>m.type==='name').length,2);
const bytes=redactPDF(doc,result.masks),out=openPDF(bytes),text=txt(out);
for(const value of ['김예시','30105','가상푸른고등학교','090101-3123456','010-1234-5678','example@student.test','인천광역시'])assert.ok(!text.includes(value),value+' remains');
assert.ok(text.includes('빛의 반사와 굴절을 비교하는 실험'));
assert.ok(text.includes('실제 학생 정보가 아닙니다.'));
assert.ok(txt(doc).includes('김예시'),'Original was modified');
assert.equal(Object.keys(out.getEmbeddedFiles()).length,0);
const p=out.loadPage(0);assert.equal(p.getAnnotations().length,0);p.destroy();
fs.writeFileSync(new URL('30105.pdf',import.meta.url),bytes);out.destroy();doc.destroy();

const rot=load('rotated-tagged.pdf');
const native=extractPage(rot,0),chars=native.lines.find(l=>l.chars.map(c=>c.c).join('').includes('SECRET_NAME')).chars;
const r=[Math.min(...chars.map(c=>c.rect[0]))-1,Math.min(...chars.map(c=>c.rect[1]))-1,Math.max(...chars.map(c=>c.rect[2]))+1,Math.max(...chars.map(c=>c.rect[3]))+1];
const rotBytes=redactPDF(rot,[{page:0,rect:r,enabled:true}]);const rotOut=openPDF(rotBytes);
assert.ok(!txt(rotOut).includes('SECRET_NAME'));assert.ok(txt(rotOut).includes('KEEP_ORIGINAL_TEXT'));
fs.writeFileSync(new URL('rotated-redacted.pdf',import.meta.url),rotBytes);
// Inspect all reachable content streams for hidden alternative text left by marked content.
for(let i=1;i<rotOut.countObjects();i++){const o=rotOut.newIndirect(i);if(o.isStream()){const b=o.readStream();const s=b.asString();b.destroy();assert.ok(!s.includes('SECRET_NAME'),'Hidden ActualText leaked');assert.ok(!s.includes('SECRET_ALT'),'Hidden Alt leaked')}o.destroy()}
rot.destroy();rotOut.destroy();

const img=load('image-fixture.pdf');const imgBytes=redactPDF(img,[{page:0,rect:[20,20,100,120],enabled:true}]);const imgOut=openPDF(imgBytes);
assert.ok(txt(imgOut).includes('KEEP_ME'));fs.writeFileSync(new URL('pixel-redacted.pdf',import.meta.url),imgBytes);img.destroy();imgOut.destroy();

function page(lines){return {bounds:[0,0,600,800],images:[],lines:lines.map((t,j)=>({chars:Array.from(t,(c,i)=>({c,rect:[20+i*10,20+j*20,30+i*10,34+j*20]}))}))}}
const custom=detect([page(['성명 : 홍길동','홍길동 학생은 실험에 참여함.','학번 : 00105','비밀단어'])],enabled,['비밀단어']);
assert.deepEqual(custom.ids,['00105']);assert.equal(custom.masks.filter(m=>m.type==='name').length,2);assert.equal(custom.masks.filter(m=>m.type==='custom').length,1);
const noGuesses=detect([page(['고등 학생은 활동에 참여함.','김예시 학생은 발표함.','담임성명','글자','이름 : 가나다','학교생활기록부'])],enabled);
assert.equal(noGuesses.masks.filter(m=>m.type==='name').length,0,'Prose and generic table words are not names');
const labeled=detect([page(['성명 : 김예시','김예시는 자율활동에 참여함.','성명','박가상'])],enabled);
assert.equal(labeled.masks.filter(m=>m.type==='name'&&m.value==='김예시').length,2,'Only a labeled value may repeat as a name');
assert.ok(labeled.masks.some(m=>m.type==='name'&&m.value==='박가상'),'Adjacent 성명 value is a name');
assert.deepEqual(detect([page(['3학년 1반 5번'])],enabled).ids,['30105']);
assert.equal(detect([page(['학번 : 30105','학번 : 30106'])],enabled).ids.length,2);
assert.equal(detect([page(['성명 : 홍길동'])],{...enabled,name:false}).masks.length,0);
assert.ok(renderPage(load('../dist/example.pdf'),0,500).png.length>0);
console.log('PASS: destructive redaction, original text retention, original unchanged, metadata isolation, rotated tagged text, pixel redaction, repeated names, IDs and custom words');
const spaced=detect([page(['성 명 : _ 김 예 시    학 번 : 3 0 1 0 5','학 교 명 : 가 상 푸 른 고 등 학 교'])],enabled);
assert.deepEqual(spaced.ids,['30105']);
assert.ok(spaced.masks.some(m=>m.type==='name'&&m.value==='김예시'));
assert.ok(spaced.masks.some(m=>m.type==='school'&&m.value==='가상푸른고등학교'));
console.log('PASS: spaced Korean OCR field values and student IDs');
