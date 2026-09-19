// SPDX-License-Identifier: AGPL-3.0-only
// Remove nonvisual replacement/alternative text from PDF content dictionaries.
// Work with byte offsets: never decode/re-encode font or image byte streams.
export function stripAlternateText(bytes){
 let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));
 if(!s.includes('BDC')&&!s.includes('DP'))return bytes;
 const tokens=[];let i=0;
 const ws=c=>c==='\0'||/\s/.test(c),delim=c=>!c||ws(c)||'()<>[]{}/%'.includes(c);
 while(i<s.length){
  if(ws(s[i])){i++;continue}
  if(s[i]==='%'){while(i<s.length&&!/[\r\n]/.test(s[i]))i++;continue}
  const start=i;let type='atom',value='';
  if(s[i]==='('){type='string';i++;let depth=1;while(i<s.length&&depth){if(s[i]==='\\'){i+=2;continue}if(s[i]==='(')depth++;if(s[i]===')')depth--;i++}if(depth)throw Error('PDF 문자열 구조를 안전하게 처리하지 못했습니다. 원본 프로그램에서 PDF로 다시 저장해 주세요.')}
  else if(s.slice(i,i+2)==='<<'||s.slice(i,i+2)==='>>'){type=s.slice(i,i+2);i+=2}
  else if(s[i]==='<'){type='string';i++;while(i<s.length&&s[i]!=='>')i++;i++}
  else if(s[i]==='/' ){type='name';i++;const begin=i;while(i<s.length&&!delim(s[i]))i++;value=s.slice(begin,i).replace(/#([0-9a-f]{2})/gi,(_,v)=>String.fromCharCode(parseInt(v,16)))}
  else if('[]'.includes(s[i])){type=s[i++]}
  else{while(i<s.length&&!delim(s[i]))i++;if(i===start)i++;value=s.slice(start,i)}
  if(type==='atom'&&value==='BI')throw Error('대체 텍스트와 특수 인라인 이미지가 함께 있는 PDF입니다. 원본 프로그램에서 일반 PDF로 다시 내보내 주세요.');
  tokens.push({start,end:i,type,value});
 }
 const endValue=at=>{const t=tokens[at];if(!t)throw Error('잘못된 PDF 속성입니다.');if(t.type==='<<'||t.type==='['){const stack=[t.type];let j=at+1;for(;j<tokens.length&&stack.length;j++){const k=tokens[j].type;if(k==='<<'||k==='[')stack.push(k);else if(k==='>>'||k===']')stack.pop()}if(stack.length)throw Error('PDF 속성 구조를 확인할 수 없습니다.');return j-1}if(t.type==='atom'&&/^\d+$/.test(t.value)&&tokens[at+2]?.value==='R')return at+2;return at};
 const ranges=[];let depth=0;
 for(let n=0;n<tokens.length;n++){const t=tokens[n];if(t.type==='<<')depth++;else if(t.type==='>>')depth--;else if(depth>0&&t.type==='name'&&['ActualText','Alt','E'].includes(t.value)){const end=endValue(n+1);ranges.push([t.start,tokens[end].end]);n=end}}
 if(!ranges.length)return bytes;
 const length=bytes.length-ranges.reduce((a,[s,e])=>a+e-s,0),out=new Uint8Array(length);let src=0,dest=0;
 for(const [start,end]of ranges){out.set(bytes.subarray(src,start),dest);dest+=start-src;src=end}out.set(bytes.subarray(src),dest);return out;
}
