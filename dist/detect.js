// SPDX-License-Identifier: AGPL-3.0-only
export const categories = {name:'이름',student:'학번',school:'학교명',resident:'주민번호 · 생년월일',address:'주소',contact:'전화 · 이메일',photo:'사진 · 얼굴'};
export function rectUnion(rects){return [Math.min(...rects.map(r=>r[0])),Math.min(...rects.map(r=>r[1])),Math.max(...rects.map(r=>r[2])),Math.max(...rects.map(r=>r[3]))]}
export function quadRect(q){return [Math.min(q[0],q[2],q[4],q[6]),Math.min(q[1],q[3],q[5],q[7]),Math.max(q[0],q[2],q[4],q[6]),Math.max(q[1],q[3],q[5],q[7])]}
export function detect(pages,enabled,custom=[]){
 const masks=[],ids=new Set(),names=new Set(),schoolNames=new Set(); let next=0;
 const add=(type,value,page,chars,source='auto')=>{
  if(!enabled[type]&&type!=='custom')return;
  const lines=new Map(); for(const c of chars){if(!c.rect||!c.c.trim())continue; const key=c.line; if(!lines.has(key))lines.set(key,[]);lines.get(key).push(c.rect)}
  for(const rs of lines.values()){
   const b=rectUnion(rs),rect=[b[0]-.6,b[1]-.4,b[2]+.6,b[3]+.4];
   if(!masks.some(m=>m.page===page&&m.type===type&&m.rect.every((v,i)=>Math.abs(v-rect[i])<1))) masks.push({id:`a${next++}`,type,value,page,rect,enabled:true,source:source==='auto'&&chars.some(c=>c.ocr)?'ocr':source});
  }
 };
 const all=pages.map((p,page)=>{
  let text='',map=[];
  p.lines.forEach((l,line)=>{for(const c of l.chars){for(const unit of c.c){text+=unit;map.push({...c,c:unit,line,ocr:!!l.ocr})}}text+='\n';map.push({c:'\n',line})});
  return {text,map,page};
 });
 const match=(obj,regex,type,group=0,collect)=>{for(const m of obj.text.matchAll(regex)){
  const val=m[group]; if(!val)continue; const start=m.index+(group?m[0].lastIndexOf(val):0);
  collect?.(val); add(type,val,obj.page,obj.map.slice(start,start+val.length));
 }};
 const forbiddenNames=new Set(['학년','학교','성명','이름','학번','학생','담임','교사','번호','성별','남자','여자','보호자','학부모','작성자','주소','주민번호','생년월일','고등','중등','초등','학과','구분','내용','활동','사항','상황','특기','성적','과목','자율','동아리','진로','봉사']);
 // A name has to come from an explicit identity label. In particular, do not
 // infer a name from prose such as “홍길동 학생”, OCR fragments, or a surname.
 const keepName=v=>{v=v.replace(/\s/g,'');if(v.length>=2&&v.length<=4&&!forbiddenNames.has(v))names.add(v)};
 for(const o of all){
  const p=pages[o.page];
  // OCR often inserts a space between every Korean syllable. Match a compact
  // view while retaining each original glyph's location and line boundaries.
  const compact={text:'',map:[],page:o.page};
  for(let n=0;n<o.text.length;n++)if(!/[ \t\r]/.test(o.text[n])){compact.text+=o.text[n];compact.map.push(o.map[n])}
  match(compact,/[가-힣A-Za-z0-9·]{2,25}(?:초등학교|중학교|고등학교|대학교|유치원)/g,'school',0,v=>schoolNames.add(v));
  match(compact,/(?:학번|학생번호|수험번호)[:：]?[_·.－–-]*(\d{3,12})(?!\d)/g,'student',1,v=>ids.add(v));
  match(compact,/(?<!\d)\d{6}[-–—]?[1-8]\d{6}(?!\d)/g,'resident');
  match(o,/(?<!\d)\d{6}\s*[-–—]?\s*[1-8]\d{6}(?!\d)/g,'resident');
  match(o,/(?<!\d)\d{6}\s*[-–—]\s*[*●○Xx]{6,7}/g,'resident');
  match(o,/(?:생년월일|생\s*일)\s*[:：]?\s*((?:19|20)\d{2}\s*[.년/\-]\s*\d{1,2}\s*[.월/\-]\s*\d{1,2}\s*일?)/g,'resident',1);
  match(o,/(?<!\d)(?:01[016789]|0[2-6][1-5]?)\s*[-.)]?\s*\d{3,4}\s*[-.]?\s*\d{4}(?!\d)/g,'contact');
  match(o,/[A-Z0-9._%+-]+\s*@\s*[A-Z0-9.-]+\s*\.\s*[A-Z]{2,}/gi,'contact');
  match(o,/(?:학\s*번|학생\s*번호|수험\s*번호)\s*[:：]?\s*(\d{3,12})(?!\d)/g,'student',1,v=>ids.add(v));
  match(o,/(\d{1,2}\s*학년\s*\d{1,2}\s*반\s*\d{1,3}\s*번)/g,'student',1,v=>{const n=v.match(/\d+/g);if(n?.length===3)ids.add(n[0]+n[1].padStart(2,'0')+n[2].padStart(2,'0'))});
  // Same-line labels are intentionally handled line-by-line. Do not compact
  // an entire page here: doing so can join “성명” in one table cell to “고등”
  // from a later cell or paragraph.
  for(const line of p.lines){
   const chars=line.chars.filter(c=>c.c.trim()),text=chars.map(c=>c.c).join('').replace(/[\s]/g,'');
   const m=text.match(/^성명[:：]?[_·.－–-]*([가-힣]{2,4})(?=$|학번|학년|번호|주민|생년|학교|성별|연락)/);
   if(m)keepName(m[1]);
  }
  match(o,/[가-힣A-Za-z0-9·]{2,25}(?:초등학교|중학교|고등학교|대학교|유치원|초등학원)/g,'school',0,v=>schoolNames.add(v));
  match(o,/(?:학교명|소속학교)\s*[:：]?\s*([^\n:：|]{2,35})/g,'school',1,v=>schoolNames.add(v.trim()));
  match(o,/(?:주\s*소|거주지|도로명주소)\s*[:：]?\s*([^\n]{5,100})/g,'address',1);
  match(o,/(?:서울(?:특별시)?|부산(?:광역시)?|대구(?:광역시)?|인천(?:광역시)?|광주(?:광역시)?|대전(?:광역시)?|울산(?:광역시)?|세종(?:특별자치시)?|경기도|강원(?:도|특별자치도)|충청[남북]도|전라[남북]도|전북특별자치도|경상[남북]도|제주(?:도|특별자치도))\s+[가-힣0-9][^\n]{4,100}/g,'address');
  // Labels in separate PDF cells: locate a short value beside or directly below the label.
  for(const line of p.lines){const label=line.chars.map(c=>c.c).join('').replace(/[\s:：]/g,'');
   const type=label==='성명'?'name':/^(학번|학생번호|수험번호)$/.test(label)?'student':/^(학교명|소속학교)$/.test(label)?'school':null;
   if(!type||!line.chars.length)continue;
   const b=rectUnion(line.chars.map(c=>c.rect));
   const candidates=p.lines.filter(l=>l!==line&&l.chars.length).map(l=>({l,b:rectUnion(l.chars.map(c=>c.rect)),s:l.chars.map(c=>c.c).join('').trim()})).filter(c=>{
    if(type==='name'&&!/^[가-힣\s]{2,7}$/.test(c.s))return false;
    if(type==='student'&&!/^\d{3,12}$/.test(c.s.replace(/\s/g,'')))return false;
    if(type==='school'&&!/학교|유치원/.test(c.s))return false;
    const right=c.b[0]>=b[2]-1&&c.b[0]-b[2]<130&&Math.abs((c.b[1]+c.b[3]-b[1]-b[3])/2)<10;
    const below=c.b[1]>=b[3]-1&&c.b[1]-b[3]<32&&Math.abs(c.b[0]-b[0])<55;
    return right||below;
   }).sort((a,c)=>(Math.abs(a.b[0]-b[2])+3*Math.abs(a.b[1]-b[1]))-(Math.abs(c.b[0]-b[2])+3*Math.abs(c.b[1]-b[1])));
   if(candidates[0]){const c=candidates[0],v=c.s.replace(/\s/g,'');if(type==='name')keepName(v);if(type==='school')schoolNames.add(c.s);if(type==='student'){ids.add(v);add(type,v,o.page,c.l.chars.map(x=>({...x,line:p.lines.indexOf(c.l)})))}}
  }
 }
 // Repeat known values throughout the document, including text split into single glyphs.
 const terms=[...Array.from(names,v=>['name',v]),...Array.from(schoolNames,v=>['school',v]),...Array.from(ids,v=>['student',v]),...custom.filter(Boolean).map(v=>['custom',v.trim()])];
 for(const o of all){let compact='',map=[];for(let i=0;i<o.text.length;i++)if(!/\s/.test(o.text[i])){compact+=o.text[i];map.push(o.map[i])}
  for(const [type,val] of terms){const needle=val.replace(/\s/g,'');if(!needle)continue;let at=0;while((at=compact.indexOf(needle,at))!==-1){add(type,val,o.page,map.slice(at,at+needle.length));at+=needle.length}}
 }
 return {masks,ids:[...ids]};
}
