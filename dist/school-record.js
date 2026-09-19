// SPDX-License-Identifier: AGPL-3.0-only
// All coordinates are in original page space, including OCR-derived locations.
export const schoolSections={header:'사진 옆 표 전체 · 졸업대장번호 포함',personal:'인적·학적사항 전체',awards:'수상경력 전체',volunteer:'봉사활동 실적 전체',footer:'모든 페이지 하단'};
export const defaultSections=()=>Object.fromEntries(Object.keys(schoolSections).map(k=>[k,true]));
const compact=s=>s.replace(/[\s·ㆍ・.,:：()（）\[\]\-–]/g,'');
const union=chars=>[Math.min(...chars.map(c=>c.rect[0])),Math.min(...chars.map(c=>c.rect[1])),Math.max(...chars.map(c=>c.rect[2])),Math.max(...chars.map(c=>c.rect[3]))];
const title=s=>/^(?:학교생활(?:세부사항)?기록부|학교생활기록부Ⅱ|학교생활기록부II)(?:사본|계속)?$/.test(compact(s));

// PDF tables often emit one text line per cell. Merge cells by their baselines,
// but prefer native text over an overlapping OCR rendition of the same row.
export function layoutRows(page){
 const all=page.lines.filter(l=>l.chars.length).map(l=>({...l,rect:union(l.chars)}));
 const native=all.filter(l=>!l.ocr);
 const lines=all.filter(l=>{
  if(!l.ocr)return true;
  const cy=(l.rect[1]+l.rect[3])/2;
  const sameRow=native.filter(n=>Math.abs((n.rect[1]+n.rect[3])/2-cy)<Math.max(4,(l.rect[3]-l.rect[1])*.5)).sort((a,b)=>a.rect[0]-b.rect[0]);
  return !sameRow.length||!compact(sameRow.flatMap(n=>n.chars).map(c=>c.c).join('')).includes(compact(l.chars.map(c=>c.c).join('')));
 }).sort((a,b)=>a.rect[1]-b.rect[1]||a.rect[0]-b.rect[0]);
 const rows=[];
 for(const line of lines){
  const cy=(line.rect[1]+line.rect[3])/2,h=line.rect[3]-line.rect[1];
  const row=rows.findLast(r=>Math.abs(r.cy-cy)<=Math.max(2,Math.min(r.height,h)*.36));
  if(row){
   for(const c of line.chars)if(!row.chars.some(o=>o.c===c.c&&Math.abs(o.rect[0]-c.rect[0])<2&&Math.abs(o.rect[1]-c.rect[1])<3))row.chars.push(c);
  }else rows.push({cy,height:h,chars:[...line.chars]});
 }
 return rows.map(r=>{r.chars.sort((a,b)=>a.rect[0]-b.rect[0]);return {...r,text:r.chars.map(c=>c.c).join(''),rect:union(r.chars)}}).sort((a,b)=>a.rect[1]-b.rect[1]);
}
const mainNames={
 '인적학적사항':'personal','인적사항':'personal','학적사항':'personal',
 '출결상황':'attendance','수상경력':'awards',
 '자격증및인증취득상황':'certificates','자격증및인증취득사항':'certificates',
 '국가직무능력표준이수상황':'qualifications','진로희망사항':'career',
 '창의적체험활동상황':'creative','창의적재량활동상황':'creative',
 '교과학습발달상황':'academic','독서활동상황':'reading',
 '행동특성및종합의견':'behavior','학교폭력조치상황관리':'discipline',
 '학교폭력조치사항':'discipline','학교폭력조치상황':'discipline'
};
function heading(row,page){
 const s=compact(row.text),name=s.replace(/^\d{1,2}/,'').replace(/계속$/,'');
 if(row.rect[0]>page.bounds[0]+(page.bounds[2]-page.bounds[0])*.6)return null;
 if(/^(?:학년)?봉사활동실적(?:학년)?$/.test(name))return {kind:'volunteer',sub:true};
 if(/^(자율|동아리|진로|자치)활동(?:상황|실적)?$/.test(name))return {kind:'creative-other',sub:true};
 if(mainNames[name])return {kind:mainNames[name],sub:false};
 // An unknown numbered section is still an explicit boundary. Never extend a
 // removed section through an unrecognised new section simply by its number.
 if(/^\s*\d{1,2}\s*[.．]\s*[가-힣]/.test(row.text)&&s.length<32)return {kind:'other',sub:false};
 return null;
}
function tableHeader(rows){
 // The diagonal 학년/구분 cell places 학년 below the other column labels.
 // Anchor on the neighbouring columns, then collect nearby header rows.
 const anchor=rows.find(r=>{const s=compact(r.text);return s.includes('반')&&s.includes('번호')&&s.includes('담임')});
 if(!anchor)return null;
 const reach=Math.max(20,anchor.height*2.5);
 const nearby=rows.filter(r=>Math.abs(r.cy-anchor.cy)<=reach&&!compact(r.text).includes('졸업대장'));
 const grade=nearby.find(r=>compact(r.text).includes('학년'));
 if(!grade)return null;
 const headerRows=nearby.filter(r=>r===anchor||r===grade||/^(?:구분|학과|성명|담임|교사)+$/.test(compact(r.text)));
 const chars=headerRows.flatMap(r=>r.chars),rect=union(chars);
 const register=rows.findLast(r=>compact(r.text).includes('졸업대장')&&r.rect[3]<=anchor.rect[1]+2&&anchor.rect[1]-r.rect[3]<Math.max(60,anchor.height*5));
 return {chars,rect,top:Math.min(rect[1],register?.rect[1]??rect[1]),hasRegister:!!register};
}
function columnCenter(row,label){
 const chars=row.chars.filter(c=>!/[\s·ㆍ]/.test(c.c)),s=chars.map(c=>c.c).join(''),start=s.indexOf(label);
 if(start<0)return null;const b=union(chars.slice(start,start+label.length));return (b[0]+b[2])/2;
}
function tableStudents(rows,header,end){
 const columns=['학년','학과','반','번호','담임'].map(label=>({label,center:columnCenter(header,label)})).filter(c=>c.center!==null).sort((a,b)=>a.center-b.center);
 if(!['학년','반','번호','담임'].every(label=>columns.some(c=>c.label===label)))return [];
 const samples=[];
 for(const row of rows.filter(r=>r.rect[1]>header.rect[3]&&r.rect[1]<end)){
  if(samples.length&&row.rect[1]-samples.at(-1).bottom>Math.max(30,(header.rect[3]-header.rect[1])*3))break;
  const values=['학년','반','번호'].map(label=>{const i=columns.findIndex(c=>c.label===label),c=columns[i].center;
   const left=i?(columns[i-1].center+c)/2:-Infinity,right=i+1<columns.length?(c+columns[i+1].center)/2:Infinity;
   return row.chars.filter(ch=>{const x=(ch.rect[0]+ch.rect[2])/2;return x>left&&x<right}).map(ch=>ch.c).join('').trim();
  });
  if(values.every(v=>/^\d{1,2}$/.test(v))&&+values[0]>=1&&+values[0]<=6&&+values[1]>0&&+values[2]>0)samples.push({values:values.map(Number),bottom:row.rect[3]});
 }
 return samples;
}
function tableStudentId(samples){
 if(!samples.length)return null;
 const latest=samples.filter(s=>s.values[0]===Math.max(...samples.map(v=>v.values[0])));
 const ids=[...new Set(latest.map(({values:s})=>`${s[0]}${String(s[1]).padStart(2,'0')}${String(s[2]).padStart(2,'0')}`))];
 return ids.length===1?ids[0]:null;
}

export function inspectSchoolRecord(pages){
 const rows=pages.map(layoutRows),events=[],headers=[];let hasTitle=false;
 rows.forEach((rs,i)=>{
  const p=pages[i];if(rs.some(r=>title(r.text)&&r.rect[1]<p.bounds[1]+(p.bounds[3]-p.bounds[1])*.25))hasTitle=true;
  for(const row of rs){const h=heading(row,p);if(h)events.push({...h,page:i,y:row.rect[1],bottom:row.rect[3]})}
  const top=tableHeader(rs);if(top&&top.rect[1]<p.bounds[1]+(p.bounds[3]-p.bounds[1])*.45){
   const next=events.find(e=>e.page===i&&!e.sub&&e.y>top.rect[3]);
   const students=tableStudents(rs,top,next?.y??p.bounds[3]);
   // A graduation register and multiple valid grade rows can locate the table
   // even when the first numbered heading was not extracted.
   const standalone=top.hasRegister&&new Set(students.map(s=>s.values[0])).size>=2;
   const bottom=next?next.y-7:standalone?Math.min(p.bounds[3],Math.max(...students.map(s=>s.bottom))+10):null;
   if(bottom!==null)headers.push({page:i,rect:[p.bounds[0],Math.max(p.bounds[1],top.top-12),p.bounds[2],bottom],studentId:tableStudentId(students),hasRegister:top.hasRegister,standalone});
  }
 });
 const kinds=new Set(events.filter(e=>!e.sub&&e.kind!=='other').map(e=>e.kind));
 const recognized=hasTitle||(kinds.size>=3&&kinds.has('personal'))||(headers.length>0&&kinds.has('personal')&&kinds.size>=2)||headers.some(h=>h.standalone);
 let footerPercent=8;
 rows.forEach((rs,i)=>{const p=pages[i],height=p.bounds[3]-p.bounds[1];for(const r of rs){
  if(r.rect[1]<p.bounds[1]+height*.84)continue;
  const s=compact(r.text);
  if(/\d학년\d{1,2}반\d{1,2}번/.test(s)||/^(?:발급일|출력일|발급번호|출력번호)/.test(s)||/^[가-힣]{2,25}(?:초등학교|중학교|고등학교)(?:\d+(?:\/\d+)?)?$/.test(s))footerPercent=Math.max(footerPercent,Math.ceil((p.bounds[3]-r.rect[1]+8)/height*100));
 }});
 return {recognized,rows,events,headers,footerPercent:Math.min(18,footerPercent),studentId:headers.map(h=>h.studentId).find(Boolean)||null};
}

export function schoolRecordMasks(pages,info,options=defaultSections(),footerPercent=8){
 const masks=[],found=new Set();const percent=Math.max(3,Math.min(18,Number(footerPercent)||8));
 const add=(kind,page,rect)=>{if(rect[3]-rect[1]<2)return;found.add(kind);if(options[kind])masks.push({id:`section-${kind}-${page}-${masks.length}`,type:'section',section:kind,value:schoolSections[kind],page,rect,enabled:true,source:'section'})};
 const footerY=p=>p.bounds[3]-(p.bounds[3]-p.bounds[1])*percent/100;
 for(const h of info.headers)add('header',h.page,h.rect);
 let active=null;
 pages.forEach((p,i)=>{
  const rs=info.rows[i],pageTitle=rs.find(r=>title(r.text)&&r.rect[1]<p.bounds[1]+(p.bounds[3]-p.bounds[1])*.2);
  let start=pageTitle?pageTitle.rect[3]+5:p.bounds[1];
  for(const event of info.events.filter(e=>e.page===i&&e.y<footerY(p))){
   const target=['personal','awards','volunteer'].includes(event.kind)?event.kind:null;
   // Repeated section headers on continuation pages do not end that section.
   if(target&&target===active)continue;
   // A fresh 창의적 체험활동 heading starts its own 자율·동아리·진로 rows.
   // It is not evidence that a previous page's 봉사활동 continues.
   if(active==='volunteer'&&event.kind==='creative'&&!event.sub){active=null;start=Math.max(p.bounds[1],event.y-7);continue}
   const end=Math.max(p.bounds[1],event.y-7);
   if(active)add(active,i,[p.bounds[0],start,p.bounds[2],end]);
   active=target;start=end;
  }
  if(active)add(active,i,[p.bounds[0],start,p.bounds[2],footerY(p)]);
  add('footer',i,[p.bounds[0],footerY(p),p.bounds[2],p.bounds[3]]);
 });
 return {masks,missing:Object.keys(schoolSections).filter(k=>options[k]&&!found.has(k))};
}
