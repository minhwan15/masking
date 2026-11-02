// SPDX-License-Identifier: AGPL-3.0-only
const engineReady=import('./engine.js');
const docs=new Map();
let queue=Promise.resolve();
async function handle({data:{id,action,args}}){
 try{let result;
  const {openPDF,extractPage,renderPage,imagePDF,redactPDF}=await engineReady;
  if(action==='load'){
   const doc=args.image?imagePDF(new Uint8Array(args.bytes)):openPDF(new Uint8Array(args.bytes));
   if(doc.countPages()>600){doc.destroy();throw Error('한 파일은 600페이지까지 지원합니다. 학생별로 나누어 불러오세요.')}
   docs.set(args.key,doc);const pages=[];
   for(let i=0;i<doc.countPages();i++){pages.push(extractPage(doc,i));self.postMessage({id,progress:Math.round(100*(i+1)/doc.countPages()),message:`문서 읽는 중 · ${i+1}/${doc.countPages()}쪽`})}
   result={pages};
  }else if(action==='render'){result=renderPage(docs.get(args.key),args.page,args.maxWidth)}
  else if(action==='export'){result={bytes:redactPDF(docs.get(args.key),args.masks)}}
  else if(action==='clear'){for(const doc of docs.values())doc.destroy();docs.clear();result={ok:true}}
  else throw Error('알 수 없는 작업입니다.');
  self.postMessage({id,result});
 }catch(e){self.postMessage({id,error:e.message||String(e)})}
}
// Register immediately, before asynchronous WASM initialization can drop messages.
self.onmessage=event=>{queue=queue.then(()=>handle(event))};
engineReady.then(()=>self.postMessage({type:'ready'})).catch(()=>self.postMessage({type:'init-error',error:'PDF 처리기를 준비하지 못했습니다. 새로고침 후 다시 시도해 주세요.'}));
