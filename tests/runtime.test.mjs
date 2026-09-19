import assert from 'node:assert/strict';
import {PDFClient,localId} from '../dist/runtime.js';
const savedCrypto=globalThis.crypto;
Object.defineProperty(globalThis,'crypto',{value:{},configurable:true});
assert.notEqual(localId(),localId());
Object.defineProperty(globalThis,'crypto',{value:savedCrypto,configurable:true});
let ready=false,posted=0,instance;
class DelayedWorker{
 constructor(){instance=this;setTimeout(()=>{ready=true;this.onmessage({data:{type:'ready'}})},25)}
 postMessage({id}){assert.equal(ready,true,'request sent before worker readiness');posted++;setTimeout(()=>this.onmessage({data:{id,result:{ok:true}}}),1)}
 terminate(){}
}
const client=new PDFClient(()=>new DelayedWorker());
const requests=[client.request('load'),client.request('render')];
assert.equal(posted,0);assert.deepEqual(await Promise.all(requests),[{ok:true},{ok:true}]);
instance.postMessage=()=>{throw Error('failed transfer')};
await assert.rejects(client.request('load'),/보내지 못했습니다/);assert.equal(client.pending.size,0);
client.dispose();
const failed=new PDFClient(()=>{const worker={terminate(){}};setTimeout(()=>worker.onmessage({data:{type:'init-error',error:'initialization failed'}}),1);return worker});
await assert.rejects(failed.request('load'),/initialization failed/);assert.equal(failed.worker,null);assert.equal(failed.ready,null);
console.log('PASS: missing randomUUID, delayed initialization, queued requests, transfer failure, initialization failure cleanup');
