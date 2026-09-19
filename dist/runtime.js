// SPDX-License-Identifier: AGPL-3.0-only
let localSequence = 0;
// These IDs only correlate local documents/rectangles; they are not credentials.
export function localId(){
 if(typeof globalThis.crypto?.randomUUID==='function')return globalThis.crypto.randomUUID();
 return `local-${Date.now().toString(36)}-${(++localSequence).toString(36)}`;
}
export class PDFClient {
 constructor(factory=()=>new Worker('/pdf-worker.js?v=3',{type:'module'})){
  this.factory=factory;this.worker=null;this.pending=new Map();this.sequence=0;this.ready=null;
 }
 start(){
  if(this.ready)return this.ready;
  this.ready=new Promise((resolve,reject)=>{
   this.readyReject=reject;
   this.startTimer=setTimeout(()=>this.fail(Error('PDF 처리기 준비 시간이 초과되었습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.')),90000);
   try{
    this.worker=this.factory();
    this.worker.onmessage=({data})=>{
     if(data.type==='ready'){clearTimeout(this.startTimer);this.readyReject=null;resolve();return}
     if(data.type==='init-error'){this.fail(Error(data.error||'PDF 처리기를 준비하지 못했습니다.'));return}
     const p=this.pending.get(data.id);if(!p)return;
     if('progress'in data){p.onProgress?.(data.message,data.progress);return}
     clearTimeout(p.timer);this.pending.delete(data.id);data.error?p.reject(Error(data.error)):p.resolve(data.result);
    };
    this.worker.onerror=()=>this.fail(Error('PDF 처리기를 불러오지 못했습니다. 새로고침한 뒤 파일을 다시 넣어 주세요.'));
    this.worker.onmessageerror=()=>this.fail(Error('문서 처리 중 통신 오류가 발생했습니다. 파일을 다시 넣어 주세요.'));
   }catch(e){this.fail(Error('이 브라우저에서 PDF 처리기를 실행할 수 없습니다. 최신 Chrome 또는 Edge에서 열어 주세요.'))}
  });
  return this.ready;
 }
 async request(action,args={},onProgress){
  try{await this.start()}catch(e){this.ready=null;throw e}
  return new Promise((resolve,reject)=>{
   const id=++this.sequence;
   const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('문서 처리 시간이 초과되었습니다. 파일을 나누어 다시 넣어 주세요.'))},180000);
   this.pending.set(id,{resolve,reject,timer,onProgress});
   try{this.worker.postMessage({id,action,args})}catch(e){clearTimeout(timer);this.pending.delete(id);reject(Error('문서를 처리기에 보내지 못했습니다. 파일을 다시 넣어 주세요.'))}
  });
 }
 fail(error){
  clearTimeout(this.startTimer);this.readyReject?.(error);this.readyReject=null;
  for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error)}this.pending.clear();
  this.worker?.terminate();this.worker=null;this.ready=null;
 }
 dispose(){this.fail(Error('작업이 중단되었습니다.'))}
}
