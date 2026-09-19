// SPDX-License-Identifier: AGPL-3.0-only
import * as mupdf from './vendor/mupdf/mupdf.js';
import {quadRect} from './detect.js';
import {stripAlternateText} from './sanitize.js';
export {mupdf};
export function openPDF(bytes){const doc=new mupdf.PDFDocument(bytes);if(doc.needsPassword()){doc.destroy();throw Error('암호가 걸린 PDF입니다. 원래 프로그램에서 암호를 해제한 사본을 불러오세요.')}if(!doc.countPages()){doc.destroy();throw Error('페이지가 없는 PDF입니다.')}return doc}
export function extractPage(doc,index){
 const page=doc.loadPage(index),bounds=page.getBounds(),st=page.toStructuredText('preserve-images,ignore-actualtext'),lines=[],images=[];let line;
 st.walk({beginLine(){line={chars:[]};lines.push(line)},onChar(c,origin,font,size,quad){line?.chars.push({c,rect:quadRect(quad)})},onImageBlock(bbox){images.push([...bbox])}});
 st.destroy();page.destroy();return {bounds,lines,images};
}
export function renderPage(doc,index,maxWidth=1200){
 const p=doc.loadPage(index),b=p.getBounds(),scale=Math.min(maxWidth/(b[2]-b[0]),3),pix=p.toPixmap(mupdf.Matrix.scale(scale,scale),mupdf.ColorSpace.DeviceRGB,false,true);
 const png=pix.asPNG().slice();pix.destroy();p.destroy();return {png,bounds:b,scale};
}
export function imagePDF(bytes){
 const img=new mupdf.Image(bytes),doc=new mupdf.PDFDocument(),imageRef=doc.addImage(img),w=img.getWidth(),h=img.getHeight(),factor=Math.min(1,1600/Math.max(w,h)),width=w*factor,height=h*factor;
 const page=doc.addPage([0,0,width,height],0,{XObject:{Im0:imageRef}},`q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`);doc.insertPage(-1,page);img.destroy();page.destroy();imageRef.destroy();return doc;
}
export function saveBytes(doc){const buf=doc.saveToBuffer('garbage=4,compress=yes,clean=yes');const bytes=buf.asUint8Array().slice();buf.destroy();return bytes}
export function redactPDF(source,masks){
 // Graft only page content into a new document. Do not copy attachments,
 // annotations, forms, structure tags, actions, bookmarks or document metadata.
 const out=new mupdf.PDFDocument();
 try{
  const graft=out.newGraftMap();for(let i=0;i<source.countPages();i++)graft.graftPage(-1,source,i);graft.destroy();
  const contentRefs=new Set();
  const addContent=obj=>{if(obj.isArray()){for(let j=0;j<obj.length;j++){const child=obj.get(j);addContent(child);child.destroy()}}else if(obj.isStream())contentRefs.add(obj.asIndirect())};
  for(let i=0;i<out.countPages();i++){const p=out.findPage(i),c=p.get('Contents');addContent(c);c.destroy();p.destroy()}
  function stripDictionary(obj,depth=0){if(depth>64)throw Error('PDF 속성 구조가 너무 복잡합니다. 파일을 나눠 저장해 주세요.');if(obj.isDictionary()||obj.isStream()){for(const key of ['Metadata','PieceInfo','ActualText','Alt','E','AF'])obj.delete(key);obj.forEach(child=>{if(!child.isIndirect()&&(child.isDictionary()||child.isArray()))stripDictionary(child,depth+1)})}else if(obj.isArray())obj.forEach(child=>{if(!child.isIndirect())stripDictionary(child,depth+1)})}
  for(let i=1;i<out.countObjects();i++){const ref=out.newIndirect(i),obj=ref.resolve();stripDictionary(obj);if(obj.isStream()){const subtype=obj.get('Subtype');if(subtype.asName()==='Form')contentRefs.add(i);subtype.destroy()}obj.destroy();ref.destroy()}
  for(const num of contentRefs){const stream=out.newIndirect(num),buffer=stream.readStream(),bytes=buffer.asUint8Array(),clean=stripAlternateText(bytes);if(clean!==bytes)stream.writeStream(clean);buffer.destroy();stream.destroy()}
  for(let i=0;i<out.countPages();i++){
   const page=out.loadPage(i),obj=page.getObject();
   for(const key of ['Annots','AA','Metadata','PieceInfo','AF','StructParents','Thumb'])obj.delete(key);obj.destroy();
   const selected=masks.filter(m=>m.page===i&&m.enabled);
   for(const mask of selected){const a=page.createAnnotation('Redact');a.setRect(mask.rect);a.update();a.destroy()}
   if(selected.length){
    // First destroy the text and image pixels. The white fill below is only
    // presentation, never the mechanism protecting the underlying content.
    page.applyRedactions(false,mupdf.PDFPage.REDACT_IMAGE_PIXELS,mupdf.PDFPage.REDACT_LINE_ART_REMOVE_IF_COVERED,mupdf.PDFPage.REDACT_TEXT_REMOVE);
    const transform=mupdf.Matrix.invert(page.getTransform()),pageObj=page.getObject(),old=pageObj.get('Contents'),contents=out.newArray();
    const prefix=out.addStream('q\n',{});contents.push(prefix);prefix.destroy();
    if(old.isArray())for(let j=0;j<old.length;j++){const stream=old.get(j);contents.push(stream);stream.destroy()}
    else if(!old.isNull())contents.push(old);
    const paths=selected.map(m=>{const [x,y,x1,y1]=m.rect;return `${x} ${y} ${x1-x} ${y1-y} re f`}).join('\n');
    const fill=out.addStream(`\nQ\nq\n${transform.join(' ')} cm\n1 1 1 rg\n${paths}\nQ\n`,{});contents.push(fill);
    pageObj.put('Contents',contents);fill.destroy();contents.destroy();old.destroy();pageObj.destroy();
   }
   page.destroy();
  }
  // Strip nonvisual data from reachable resources too; content remains vector/text.
  for(let i=1;i<out.countObjects();i++){
   const ref=out.newIndirect(i),obj=ref.resolve();
   if(obj.isDictionary()||obj.isStream())for(const key of ['Metadata','PieceInfo','ActualText','Alt','E','AF'])obj.delete(key);
   obj.destroy();ref.destroy();
  }
  return saveBytes(out);
 }finally{out.destroy()}
}
