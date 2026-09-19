// SPDX-License-Identifier: AGPL-3.0-only
import {categories,detect} from './detect.js';
import {zipSync} from './vendor/fflate/browser.js';
import {localId,PDFClient} from './runtime.js';
import {schoolSections,defaultSections,inspectSchoolRecord,schoolRecordMasks} from './school-record.js?v=9';
const $=id=>document.getElementById(id);
const documents=[];let active=0,pageIndex=0,busy=false,showOriginal=false,drawing=false,viewToken=0,pageURL='',downloadURL='',ocrWorker,faceModule,facePromise,toastTimer,dragStart,autoExportTimer;
const pdfClient=new PDFClient();
const current=()=>documents[active];
function notify(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6500)}
function status(message='',progress=0,error=false){$('statusBar').hidden=!message;$('statusText').textContent=message;$('progress').value=progress;$('progress').hidden=error;$('statusBar').classList.toggle('error',error)}
function escape(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function settings(){return Object.fromEntries(Object.keys(categories).map(k=>[k,$(`setting-${k}`).checked]))}
function words(){return $('customWords').value.split(/[,\n]/).map(v=>v.trim()).filter(Boolean)}
const rpc=(action,args={},onProgress)=>pdfClient.request(action,args,onProgress);
function setBusy(value){busy=value;updateControls()}
function updateControls(){
 const d=current(),ready=!!d?.ready&&!busy;
 $('uploadBtn').disabled=busy;$('demoBtn').disabled=busy;$('clearBtn').disabled=busy||!documents.length;
 $('rescanBtn').disabled=!ready;$('drawBtn').disabled=!ready;$('undoBtn').disabled=!ready||!d?.masks.some(m=>m.source==='manual');
 $('studentId').disabled=!ready;
 const batchProblem=batchIssue();$('batchHint').textContent=batchProblem||`${documents.length}개 문서를 자동 마스킹해 학번별 PDF ZIP을 준비하고 있습니다.`;
 $('prevPage').disabled=!ready||pageIndex===0;$('nextPage').disabled=!ready||pageIndex>=d.pages.length-1;
 $('step2').classList.toggle('current',!!d?.ready);$('step3').classList.toggle('current',!$('downloadResult').hidden);
 document.querySelectorAll('#categorySettings input,#scanOcr,#customWords').forEach(e=>e.disabled=busy);
 $('schoolRecordToggle').disabled=!ready;
 document.querySelectorAll('#schoolOptions input').forEach(e=>e.disabled=!ready||!d?.schoolRecordEnabled);
 $('footerSize').disabled=!ready||!d?.schoolRecordEnabled||!d?.sectionOptions?.footer;
}
function validId(id){return /^\d{3,12}$/.test(id||'')}
function batchIssue(){
 if(!documents.length)return '여러 생기부 파일을 추가하면 한 번에 저장할 수 있습니다.';
 const failed=documents.filter(d=>d.error).map(d=>d.name);if(failed.length)return `불러오지 못한 파일: ${failed.join(', ')}`;
 const loading=documents.filter(d=>!d.ready).map(d=>d.name);if(loading.length)return `${loading.length}개 문서를 검사 중입니다.`;
 const noId=documents.filter(d=>!validId(d.studentId)).map(d=>d.name);if(noId.length)return `학번을 찾지 못한 파일: ${noId.join(', ')}`;
 const ids=documents.map(d=>d.studentId);if(new Set(ids).size!==ids.length)return '같은 학번이 있어 ZIP 파일명을 만들 수 없습니다.';
 return '';
}
function scheduleAutoExport(){
 clearTimeout(autoExportTimer);if(busy||batchIssue())return;
 autoExportTimer=setTimeout(()=>{if(!busy&&!batchIssue())save(true,true)},250);
}
function renderFiles(){
 $('fileCount').textContent=documents.length;
 $('fileList').innerHTML=documents.length?documents.map((d,i)=>`<button class="file-item ${i===active?'active':''} ${d.error?'error':''}" data-file="${i}" ${busy?'disabled':''}><span class="file-icon">▤</span><span class="file-info"><strong>${escape(d.name)}</strong><small>${d.error?'불러오기 실패':d.ready?`${d.pages.length}쪽 · 자동 마스킹 완료`:'검사 중…'}</small></span></button>`).join(''):'<p class="empty-files">불러온 문서가 없습니다.</p>';
 $('fileList').querySelectorAll('[data-file]').forEach(b=>b.onclick=()=>{clearDownload();active=Number(b.dataset.file);pageIndex=0;drawing=false;renderCurrent()});
}
function renderDetections(){
 const d=current(),masks=d?.masks||[];$('maskCount').textContent=masks.filter(m=>m.enabled).length;
 if(!d?.ready){$('detectionList').innerHTML='<div class="empty-detections"><span>✓</span><p>문서를 불러오면<br>찾은 항목이 표시됩니다.</p></div>';return}
 if(!masks.length){$('detectionList').innerHTML='<div class="empty-detections"><span>⌕</span><p>자동으로 찾은 항목이 없습니다.<br>원본을 확인하고 필요하면<br>직접 가리기를 사용하세요.</p></div>';return}
 $('detectionList').innerHTML=masks.map((m,i)=>`<div class="detection"><input type="checkbox" data-mask="${i}" aria-label="${escape(m.value)} 제거" ${m.enabled?'checked':''} ${busy?'disabled':''}><button data-jump="${m.page}" ${busy?'disabled':''}><strong>${escape(m.value)}</strong><small>${m.page+1}쪽 · ${m.source==='section'?'항목 전체':m.source==='manual'?'직접 지정':m.source==='ocr'?'인쇄 글자 인식':m.type==='photo'?'사진 후보 · 확인 필요':'자동 탐지'}</small></button><span class="category-tag">${escape(m.type==='section'?'생기부':m.type==='custom'?'추가 단어':m.type==='manual'?'직접':categories[m.type]?.split(' · ')[0]||m.type)}</span></div>`).join('');
 $('detectionList').querySelectorAll('[data-mask]').forEach(el=>el.onchange=()=>{masks[+el.dataset.mask].enabled=el.checked;invalidate();renderMasks();renderDetections()});
 $('detectionList').querySelectorAll('[data-jump]').forEach(el=>el.onclick=()=>{pageIndex=+el.dataset.jump;renderPage()});
}
function invalidate(){clearDownload();const d=current();if(d)d.reviewed=false;renderFiles();updateControls();scheduleAutoExport()}
function applySchoolRecord(d){
 const manual=d.masks.filter(m=>m.source==='manual');
 const result=d.schoolRecordEnabled?schoolRecordMasks(d.pages,d.schoolRecordInfo,d.sectionOptions,d.footerPercent):{masks:[],missing:[]};
 d.sectionMissing=result.missing;
 // Keep the underlying word candidates so turning a whole section off restores
 // its individual privacy masks without running OCR again.
 d.masks=[...result.masks,...d.baseMasks.filter(m=>!result.masks.some(s=>s.page===m.page&&s.rect[0]<=m.rect[0]&&s.rect[1]<=m.rect[1]&&s.rect[2]>=m.rect[2]&&s.rect[3]>=m.rect[3])),...manual];
}
function renderSchoolRecord(){
 const d=current(),on=!!d?.schoolRecordEnabled;
 $('schoolRecordToggle').checked=on;
 $('schoolRecordStatus').textContent=!d?.ready?'생기부를 불러오면 자동으로 켜집니다.':d.schoolRecordInfo.recognized?(on?'생기부 자동 인식 · 항목 가리기 켜짐':'생기부 자동 인식 · 항목 가리기 꺼짐'):(on?'직접 선택한 생기부 · 경계를 확인하세요.':'생기부로 인식되지 않았습니다. 직접 켤 수 있습니다.');
 $('schoolRecordPanel').classList.toggle('recognized',on);
 document.querySelectorAll('[data-section]').forEach(e=>e.checked=d?.sectionOptions?.[e.dataset.section]??true);
 $('footerSize').value=d?.footerPercent||8;$('footerSizeValue').textContent=`${d?.footerPercent||8}%`;
 const missing=on?(d.sectionMissing||[]):[];
 $('schoolMissing').hidden=!missing.length;
 $('schoolMissing').textContent=missing.length?`찾지 못한 항목: ${missing.map(k=>schoolSections[k]).join(', ')}. 해당 항목이 있으면 직접 가려 주세요.`:'';
}
function updateSchoolRecord(){const d=current();if(!d?.ready||busy)return;applySchoolRecord(d);invalidate();renderSchoolRecord();renderDetections();renderMasks();updateControls()}
function renderMasks(){const d=current(),p=d?.pages[pageIndex];if(!p)return;const [x,y,x1,y1]=p.bounds,w=x1-x,h=y1-y;
 $('maskLayer').innerHTML=d.masks.filter(m=>m.page===pageIndex&&m.enabled).map(m=>{const [a,b,c,e]=m.rect;return `<div class="mask ${showOriginal?'outline':''}" style="left:${100*(a-x)/w}%;top:${100*(b-y)/h}%;width:${100*(c-a)/w}%;height:${100*(e-b)/h}%"></div>`}).join('');
 $('pageWrap').classList.toggle('drawing',drawing);$('drawBtn').classList.toggle('active',drawing);$('drawBtn').textContent=drawing?'✓ 지정 완료':'▧ 직접 가리기';
}
async function renderPage(){
 const d=current();if(!d?.ready)return;
 const token=++viewToken;$('pageNumber').textContent=`${pageIndex+1} / ${d.pages.length}`;
 updateControls();renderMasks();
 try{const data=await rpc('render',{key:d.key,page:pageIndex,maxWidth:1250});if(token!==viewToken)return;
  if(pageURL)URL.revokeObjectURL(pageURL);pageURL=URL.createObjectURL(new Blob([data.png],{type:'image/png'}));$('pageImage').src=pageURL;renderMasks();
 }catch(e){notify(e.message)}
}
function renderCurrent(){
 const d=current();renderFiles();renderDetections();renderSchoolRecord();$('dropZone').hidden=!!d?.ready;$('pageWrap').hidden=!d?.ready;$('emptyHint').hidden=!!d?.ready;
 $('studentId').value=d?.studentId||'';
 $('idHint').textContent=d?.idCandidates?.length>1?`여러 학번을 찾았습니다: ${d.idCandidates.join(', ')}. 한 학생의 문서인지 확인하세요.`:d?.idCandidates?.length===1?(d.idInferred?'상단 표의 최근 학년·반·번호로 만든 학번입니다. 학교의 학번 형식과 맞는지 확인하세요.':'자동으로 찾은 학번입니다. 맞는지 확인하세요.'):'학번을 찾지 못하면 직접 입력해 주세요.';
 $('documentType').textContent=d?.ready?(d.pages.every(p=>p.native)?'원본 글자 유지 · PDF로 저장':d.pages.some(p=>p.native)?'글자·이미지 혼합 · 원본 글자만 복사 가능':'스캔·이미지 문서 · 글자 복사 불가'):'문서를 추가하면 저장 방식을 확인할 수 있습니다.';
 if(d?.error)status(d.error,0,true);else if(!busy)status(d?.warnings?.join(' / ')||'',100,!!d?.warnings?.length);
 updateControls();if(d?.ready)renderPage();else $('pageNumber').textContent='— / —';
}
async function canvasFromPNG(png){const bitmap=await createImageBitmap(new Blob([png],{type:'image/png'}));const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;c.getContext('2d').drawImage(bitmap,0,0);bitmap.close();return c}
async function getOCR(){
 if(ocrWorker)return ocrWorker;
 if(!window.Tesseract){await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/vendor/tesseract/tesseract.min.js';script.onload=resolve;script.onerror=()=>reject(Error('글자 인식 도구를 불러오지 못했습니다.'));document.head.append(script)})}
 ocrWorker=await window.Tesseract.createWorker('kor+eng',1,{workerPath:'/vendor/tesseract/worker.min.js',corePath:'/vendor/tesseract-core',langPath:'/vendor/tessdata',workerBlobURL:false,cacheMethod:'none',logger:m=>{if(m.status==='recognizing text')status(`인쇄 글자 위치 검사 중 · ${Math.round(m.progress*100)}%`,Math.round(m.progress*100))}});
 await ocrWorker.setParameters({preserve_interword_spaces:'1'});return ocrWorker;
}
async function scanText(canvas,p){
 const w=await getOCR();const {data}=await w.recognize(canvas,{}, {blocks:true,text:true});
 const sx=(p.bounds[2]-p.bounds[0])/canvas.width,sy=(p.bounds[3]-p.bounds[1])/canvas.height,lines=[];
 for(const block of data.blocks||[])for(const para of block.paragraphs||[])for(const l of para.lines||[]){const chars=[];
  for(const word of l.words||[]){
   if(word.symbols?.length){for(const symbol of word.symbols){const b=symbol.bbox;chars.push({c:symbol.text,rect:[p.bounds[0]+b.x0*sx,p.bounds[1]+b.y0*sy,p.bounds[0]+b.x1*sx,p.bounds[1]+b.y1*sy]})}}
   else{const b=word.bbox;for(const [i,c]of Array.from(word.text).entries()){const count=Array.from(word.text).length;chars.push({c,rect:[p.bounds[0]+(b.x0+(b.x1-b.x0)*i/count)*sx,p.bounds[1]+b.y0*sy,p.bounds[0]+(b.x0+(b.x1-b.x0)*(i+1)/count)*sx,p.bounds[1]+b.y1*sy]})}}
   if(chars.length)chars.push({c:' ',rect:chars.at(-1).rect});
  }
  if(chars.length)lines.push({chars,ocr:true});
 }
 return lines;
}
async function getFaces(){
 if(!facePromise)facePromise=(async()=>{faceModule=await import('./vendor/face-api/face-api.esm.js');await faceModule.tf.setBackend('cpu');await faceModule.tf.ready();await faceModule.nets.tinyFaceDetector.loadFromUri('/vendor/face-api');return faceModule})();
 return facePromise;
}
async function scanFaces(canvas,p,page){
 const api=await getFaces(),result=await api.detectAllFaces(canvas,new api.TinyFaceDetectorOptions({inputSize:608,scoreThreshold:.5}));
 const [x,y,x1,y1]=p.bounds,sx=(x1-x)/canvas.width,sy=(y1-y)/canvas.height;
 return result.map((f,i)=>{const b=f.box;return {id:`face-${page}-${i}`,type:'photo',value:'얼굴 영역',page,rect:[Math.max(x,x+(b.x-b.width*.35)*sx),Math.max(y,y+(b.y-b.height*.5)*sy),Math.min(x1,x+(b.x+b.width*1.35)*sx),Math.min(y1,y+(b.y+b.height*1.5)*sy)],enabled:true,source:'face'}});
}
async function analyze(d){
 const opts=settings();d.warnings=[];
 for(let i=0;i<d.pages.length;i++){
  const p=d.pages[i];if(p.native===undefined)p.native=p.lines.reduce((n,l)=>n+l.chars.length,0)>15;
  const area=(p.bounds[2]-p.bounds[0])*(p.bounds[3]-p.bounds[1]);
  const needOCR=$('scanOcr').checked&&(!p.native||p.images.some(b=>(b[2]-b[0])*(b[3]-b[1])>area*.2))&&!p.ocrChecked;
  const needFaces=opts.photo&&p.images.length>0&&!p.facesChecked;
  if(!needOCR&&!needFaces)continue;
  status(`${d.name} · ${i+1}/${d.pages.length}쪽 검사`,Math.round(i/d.pages.length*100));
  const render=await rpc('render',{key:d.key,page:i,maxWidth:needOCR?2200:1200});const canvas=await canvasFromPNG(render.png);
  if(needOCR){try{const lines=await scanText(canvas,p);if(!p.originalLines)p.originalLines=p.lines;p.lines=[...p.originalLines,...lines];p.ocrChecked=true;if(!lines.length&&!p.native)d.warnings.push(`${i+1}쪽: 인식된 글자가 없습니다. 직접 확인해 주세요.`)}catch(e){d.warnings.push(`${i+1}쪽: 인쇄 글자 검사 실패. 직접 가려 주세요.`);if(ocrWorker){await ocrWorker.terminate();ocrWorker=null}}}
  if(needFaces){try{p.faces=await scanFaces(canvas,p,i);p.facesChecked=true}catch(e){d.warnings.push(`${i+1}쪽: 얼굴 검사 실패. 사진을 직접 가려 주세요.`)}}
  canvas.width=0;canvas.height=0;
 }
 const result=detect(d.pages,opts,words());
 d.masks=[...result.masks,...(d.masks||[]).filter(m=>m.source==='manual')];
 if(opts.photo)d.pages.forEach((p,i)=>{
  const area=(p.bounds[2]-p.bounds[0])*(p.bounds[3]-p.bounds[1]);
  p.images.forEach((rect,j)=>{const a=(rect[2]-rect[0])*(rect[3]-rect[1]);if(a>area*.001&&a<area*.35)d.masks.push({id:`photo-${i}-${j}`,type:'photo',value:'삽입 이미지 · 사진 후보',page:i,rect,enabled:true,source:'image'})});
  for(const f of p.faces||[])if(!d.masks.some(m=>m.type==='photo'&&m.page===i&&m.rect[0]<=f.rect[0]&&m.rect[1]<=f.rect[1]&&m.rect[2]>=f.rect[2]&&m.rect[3]>=f.rect[3]))d.masks.push(f);
 });
 d.baseMasks=d.masks.filter(m=>m.source!=='manual');
 d.schoolRecordInfo=inspectSchoolRecord(d.pages);
 if(!d.schoolRecordEdited)d.schoolRecordEnabled=d.schoolRecordInfo.recognized;
 d.sectionOptions??=defaultSections();d.footerPercent??=d.schoolRecordInfo.footerPercent;
 d.idInferred=!result.ids.length&&!!d.schoolRecordInfo.studentId;
 d.idCandidates=d.idInferred?[d.schoolRecordInfo.studentId]:result.ids;
 if(!d.idEdited)d.studentId=d.idCandidates.length===1?d.idCandidates[0]:'';
 applySchoolRecord(d);
 d.reviewed=false;d.ready=true;
}
async function addFiles(files){
 if(busy){notify('현재 검사가 끝난 뒤 파일을 추가해 주세요.');return}
 const items=Array.from(files);if(!items.length)return;clearDownload();
 if(documents.reduce((n,d)=>n+d.size,0)+items.reduce((n,f)=>n+f.size,0)>350*1024*1024){notify('한 번에 350 MB까지 처리합니다. 현재 문서를 저장한 뒤 나누어 추가해 주세요.');return}
 setBusy(true);
 try{
 for(const file of items){
  if(!/\.(pdf|png|jpe?g|webp)$/i.test(file.name)){notify(`${file.name}: PDF·JPG·PNG·WEBP를 선택해 주세요.`);continue}
  if(file.size>50*1024*1024){notify(`${file.name}: 파일당 50 MB까지 지원합니다.`);continue}
  const d={key:localId(),name:file.name,size:file.size,pages:[],masks:[],studentId:'',ready:false,reviewed:false};documents.push(d);active=documents.length-1;pageIndex=0;renderCurrent();
  try{status(`${file.name} 불러오는 중`,0);let bytes=await file.arrayBuffer();const isImage=!/\.pdf$/i.test(file.name);
   if(isImage){const bitmap=await createImageBitmap(file);if(bitmap.width*bitmap.height>45_000_000){bitmap.close();throw Error('이미지가 너무 큽니다. 4,500만 화소 이하로 줄여 주세요.')}const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(bitmap,0,0);bitmap.close();const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));bytes=await blob.arrayBuffer();c.width=0;c.height=0}
   const result=await rpc('load',{key:d.key,bytes,image:isImage},status);d.pages=result.pages;await analyze(d);
  }catch(e){d.error=e.message;d.ready=false;notify(`${file.name}: ${e.message}`)}
  renderCurrent();
 }
 }catch(e){notify(`파일을 불러오지 못했습니다: ${e.message}`)}
 finally{setBusy(false);status();renderCurrent();$('fileInput').value='';scheduleAutoExport()}
}
async function rescan(){const d=current();if(!d?.ready||busy)return;clearDownload();setBusy(true);renderDetections();try{await analyze(d);notify('검사가 완료되었습니다. ZIP을 자동으로 준비합니다.')}catch(e){notify(e.message)}finally{setBusy(false);status();renderCurrent();scheduleAutoExport()}}
function clearDownload(){if(downloadURL)URL.revokeObjectURL(downloadURL);downloadURL='';$('downloadResult').hidden=true;$('downloadLink').removeAttribute('href');$('openDownloadLink').removeAttribute('href')}
function download(data,name,type='application/pdf'){
 if(downloadURL)URL.revokeObjectURL(downloadURL);
 downloadURL=URL.createObjectURL(new Blob([data],{type}));
 $('downloadName').textContent=name;
 $('downloadLink').href=downloadURL;$('downloadLink').download=name;
 $('openDownloadLink').href=downloadURL;$('openDownloadLink').hidden=type!=='application/pdf';
 $('downloadResult').hidden=false;
}
async function save(all=false,automatic=false){
 if(busy)return;const list=all?documents:[current()];
 if(automatic){const issue=batchIssue();if(issue){notify(issue);return}}
 else if(list.some(d=>!d?.ready||!d.reviewed||!validId(d.studentId))){notify('각 문서의 학번과 마스킹 영역을 먼저 확인해 주세요.');return}
 const ids=list.map(d=>d.studentId);if(new Set(ids).size!==ids.length){notify('같은 학번의 문서가 있습니다. 덮어쓰기를 막기 위해 ZIP 저장을 중단했습니다. 개별 저장하거나 학번을 확인하세요.');return}
 setBusy(true);renderDetections();
 try{const zip={};for(const [i,d]of list.entries()){status(`${d.studentId}.pdf · 개인정보 제거 중 (${i+1}/${list.length})`,Math.round(i/list.length*100));const {bytes}=await rpc('export',{key:d.key,masks:d.masks});if(all)zip[`${d.studentId}.pdf`]=bytes;else download(bytes,`${d.studentId}.pdf`)}if(all){status('ZIP 파일을 만드는 중',95);download(zipSync(zip,{level:0}),automatic?'학번별_자동마스킹.zip':'학생문서_마스킹.zip','application/zip')}notify('ZIP 파일이 준비되었습니다. 아래에서 다운로드하세요.')}catch(e){notify(`저장하지 못했습니다: ${e.message}`)}finally{setBusy(false);status();renderDetections();updateControls()}
}
$('categorySettings').innerHTML=Object.entries(categories).map(([k,v])=>`<label class="check"><input id="setting-${k}" type="checkbox" checked><span>${v}</span></label>`).join('');
$('schoolOptions').innerHTML=Object.entries(schoolSections).map(([k,v])=>`<label class="check"><input type="checkbox" data-section="${k}" checked disabled><span>${v}</span></label>`).join('');
$('schoolRecordToggle').onchange=e=>{const d=current();if(!d)return;d.schoolRecordEnabled=e.target.checked;d.schoolRecordEdited=true;updateSchoolRecord()};
document.querySelectorAll('[data-section]').forEach(e=>e.onchange=()=>{current().sectionOptions[e.dataset.section]=e.checked;updateSchoolRecord()});
$('footerSize').oninput=e=>{current().footerPercent=Number(e.target.value);updateSchoolRecord()};
document.querySelectorAll('#categorySettings input,#scanOcr').forEach(e=>e.onchange=()=>{if(current()?.ready){invalidate();notify('설정을 적용하려면 현재 문서 다시 검사를 눌러 주세요.')}});
$('customWords').oninput=()=>{if(current()?.ready)invalidate()};
$('uploadBtn').onclick=()=>$('fileInput').click();$('fileInput').onchange=e=>addFiles(e.target.files);
$('dropZone').onclick=()=>{if(!busy)$('fileInput').click()};$('dropZone').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();if(!busy)$('fileInput').click()}};
$('documentStage').ondragover=e=>{e.preventDefault();$('dropZone').classList.add('drag-over')};$('documentStage').ondragleave=()=>$('dropZone').classList.remove('drag-over');$('documentStage').ondrop=e=>{e.preventDefault();$('dropZone').classList.remove('drag-over');addFiles(e.dataTransfer.files)};
$('rescanBtn').onclick=rescan;
$('prevPage').onclick=()=>{if(pageIndex>0){pageIndex--;renderPage()}};$('nextPage').onclick=()=>{if(pageIndex<current().pages.length-1){pageIndex++;renderPage()}};
$('studentId').oninput=e=>{const d=current();d.studentId=e.target.value.replace(/[^0-9]/g,'').slice(0,12);e.target.value=d.studentId;d.idEdited=true;invalidate()};
function setView(original){showOriginal=original;$('originalView').classList.toggle('selected',original);$('maskedView').classList.toggle('selected',!original);$('originalView').setAttribute('aria-pressed',String(original));$('maskedView').setAttribute('aria-pressed',String(!original));renderMasks()}
$('maskedView').onclick=()=>setView(false);$('originalView').onclick=()=>setView(true);
$('drawBtn').onclick=()=>{drawing=!drawing;if(drawing){setView(false);notify('문서 위에서 드래그해 지울 영역을 지정하세요.')}renderMasks()};
$('undoBtn').onclick=()=>{const d=current(),i=d.masks.findLastIndex(m=>m.source==='manual');if(i>=0){d.masks.splice(i,1);invalidate();renderMasks();renderDetections()}};
function pointer(e){const r=$('pageWrap').getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))]}
$('pageWrap').onpointerdown=e=>{if(!drawing||busy)return;e.preventDefault();dragStart=pointer(e);$('pageWrap').setPointerCapture(e.pointerId);$('dragRect').hidden=false;Object.assign($('dragRect').style,{left:`${dragStart[0]*100}%`,top:`${dragStart[1]*100}%`,width:'0',height:'0'})};
$('pageWrap').onpointermove=e=>{if(!dragStart)return;const p=pointer(e);Object.assign($('dragRect').style,{left:`${Math.min(p[0],dragStart[0])*100}%`,top:`${Math.min(p[1],dragStart[1])*100}%`,width:`${Math.abs(p[0]-dragStart[0])*100}%`,height:`${Math.abs(p[1]-dragStart[1])*100}%`})};
$('pageWrap').onpointerup=e=>{if(!dragStart)return;const a=dragStart,b=pointer(e);dragStart=null;$('dragRect').hidden=true;const d=current(),[x,y,x1,y1]=d.pages[pageIndex].bounds;if(Math.abs(a[0]-b[0])<.004||Math.abs(a[1]-b[1])<.004)return;d.masks.push({id:localId(),type:'manual',value:'직접 지정한 영역',page:pageIndex,rect:[x+Math.min(a[0],b[0])*(x1-x),y+Math.min(a[1],b[1])*(y1-y),x+Math.max(a[0],b[0])*(x1-x),y+Math.max(a[1],b[1])*(y1-y)],enabled:true,source:'manual'});invalidate();renderMasks();renderDetections()};
$('pageWrap').onpointercancel=()=>{dragStart=null;$('dragRect').hidden=true};
$('clearBtn').onclick=()=>{if(busy)return;clearDownload();pdfClient.dispose();ocrWorker?.terminate().catch(()=>{});ocrWorker=null;documents.length=0;active=0;pageIndex=0;viewToken++;if(pageURL)URL.revokeObjectURL(pageURL);pageURL='';$('pageImage').removeAttribute('src');status();renderCurrent()};
$('helpBtn').onclick=()=>$('helpDialog').showModal();$('closeHelp').onclick=()=>$('helpDialog').close();$('helpDialog').onclick=e=>{if(e.target===$('helpDialog'))$('helpDialog').close()};
$('demoBtn').onclick=async()=>{try{const r=await fetch('/school-record-example.pdf');if(!r.ok)throw Error('예시 문서를 불러오지 못했습니다.');await addFiles([new File([await r.blob()],'예시_학교생활기록부.pdf',{type:'application/pdf'})])}catch(e){notify(e.message)}};
if(document.modelContext?.registerTool){
 try{
  Promise.resolve(document.modelContext.registerTool({
   name:'get_masking_status',
   description:'현재 문서의 검사 및 확인 상태를 읽습니다. 개인정보 값은 반환하지 않습니다.',
   inputSchema:{type:'object',properties:{},additionalProperties:false},
   annotations:{readOnlyHint:true},
   execute(input){
    if(!input||typeof input!=='object'||Object.keys(input).length)throw Error('빈 객체만 입력할 수 있습니다.');
    return {busy,documents:documents.map((d,i)=>({index:i,pages:d.pages.length,ready:d.ready,reviewed:d.reviewed,selectedMaskCount:d.masks.filter(m=>m.enabled).length,hasValidStudentId:validId(d.studentId)}))};
   }
  })).catch(()=>{});
 }catch{}
}
window.addEventListener('beforeunload',()=>{pdfClient.dispose();ocrWorker?.terminate()});
renderCurrent();
