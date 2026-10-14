import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createDraftUploadRuntime} from '../scripts/browser-upload/cua-draft-runner.mjs';
import {prepareNamedWord} from '../scripts/browser-upload/file-ready.mjs';
const TIME = '2026-10-06T09:30:00.000Z';
const hash = 'a'.repeat(64), ihash = 'b'.repeat(64);
const url = p => p === 'toutiao' ? 'https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=12345' : 'https://zhuanlan.zhihu.com/p/12345/edit';
const blank = p => p === 'toutiao' ? 'https://mp.toutiao.com/profile_v4/graphic/publish' : 'https://zhuanlan.zhihu.com/write';
const binding = css => ({css, identity:{tag:'INPUT',type:'file'}, observed_at: TIME, observed_url: 'https://example.test/observed'});
const ui = {account: binding('account'), title: binding('title'), body: {...binding('body'), image_css:'img'}, draftList: binding('list'), importFile: binding('file'), saved: {...binding('saved'), allowed_texts: ['草稿已保存']}, coverImage: binding('cover'), coverOpen: [], coverFile: binding('coverFile'), toggleOrderedList: binding('toggle')};
const baseline = {title: '冻结原标题', paragraphs: ['第一段正文', '1. 冻结小标题', '最后一段'], images: [{sha256: ihash, after_paragraph: 1}]};
const image = {kind: 'image', src: 'https://img.example.test/a.png?signature=never-persist', loaded: true, width: 100, height: 50};
function rows() {return [{kind:'paragraph',text:baseline.paragraphs[0], tag:'P'}, image, ...baseline.paragraphs.slice(1).map(text=>({kind:'paragraph',text,tag:'P'}))];}
let serial = 0, platformCalls = 0, nativeSubmissionCalls = 0, realCalls = 0;
function domElement(row) {
  if (row.kind === 'image') return {nodeType:1, tagName:'IMG', currentSrc:row.src, src:row.src, complete:row.loaded, naturalWidth:row.width,naturalHeight:row.height,matches:s=>s==='img'};
  return {nodeType:1, tagName:row.tag || 'P', parentElement:{tagName:row.list?'OL':'DIV'}, textContent:row.text, childNodes:[{nodeType:3,textContent:row.text}], children:[], matches:s=>s.split(',').includes((row.tag||'P').toLowerCase())};
}
class MockTab {
  constructor(p, content = {}) {this.id = 'mock-'+(++serial); this.p=p;this.content={title:'',rows:[],url:blank(p),account:p==='toutiao'?'61556093362':'ren-zhe-ai-chi-yu-52',list:[],saved:false,...content};this.log=[];this.selection={selected:'',block:'',collapsed:true,at_end:true};this.fileCount=0;this.browserWaitCount=0;this.browserPickerAllowed=p==='toutiao';
    this.playwright={domSnapshot:async()=>this.content.blocker || (this.content.pending?'文档导入中…':'safe private editor'), locator:key=>this.locator(key), getByRole:(_,o)=>this.locator(o.name),getByText:t=>this.locator(t),getByPlaceholder:t=>this.locator(t), evaluate:async()=>this.selection,
      waitForEvent:async event=>{this.browserWaitCount++;assert.equal(this.browserPickerAllowed,true,'Default Zhihu coordinate flow must not use a browser filechooser');assert.equal(event,'filechooser');return {setFiles:async file=>{this.fileCount++;platformCalls++;this.log.push(['setFiles',file]);if(this.content.throwUpload)throw Error(this.content.throwUpload);this.content={...this.content,title:baseline.title,rows:rows(),url:url(p),saved:true};}};}};
  }
  locator = (key) => {// eslint-disable-next-line @typescript-eslint/no-this-alias
    const t=this; const value=()=>key==='account'?t.content.account:key==='saved'?'草稿已保存':key==='title'?t.content.title:key==='anchor'?baseline.paragraphs[0]:key==='duplicate'?baseline.title:key==='heading'?baseline.paragraphs[1].replace(/^\d+\. /,''):'';
    return {count:async()=>t.content.missing===key?0:1,isVisible:async()=>key!=='saved'||t.content.saved,isEnabled:async()=>true,innerText:async()=>value(),getAttribute:async name=>name==='aria-label'?t.content.ariaLabel?.[key]||null:name==='title'?null:value(),
      evaluate:async (fn,arg)=>{
        if(key==='title') return fn({value:t.content.title});
        if(key==='body')return fn({nodeType:1,tagName:'DIV',matches:()=>false,children:t.content.rows.map(domElement),childNodes:t.content.rows.map(domElement),querySelectorAll:()=> (t.content.captions||[]).map(value=>({value}))},arg);
        if(key==='list') return fn({querySelectorAll:()=>t.content.list.map(r=>({textContent:r.title,href:r.url}))});
        if(key==='cover')return fn({src:'https://img.example.test/cover.png',complete:true,naturalWidth:100});
        return fn({tagName:'INPUT',getAttribute:name=>name==='type'?'file':name==='aria-label'?t.content.ariaLabel?.[key]||null:null});
      }, click:async()=>{t.log.push(['click',key]);t.focus=key;if(key==='toggle'){const row=t.content.rows.find(r=>r.list);if(row)row.list=false;}},
      press:async k=>{t.log.push(['press',key,k]);if(k==='Home')t.selection={selected:'',block:value(),collapsed:true,at_end:false};if(k==='End')t.selection={selected:'',block:value(),collapsed:true,at_end:true};if(k==='Shift+End')t.selection={selected:value(),block:value(),collapsed:false,at_end:true};if(k==='Backspace'&&key==='duplicate')t.content.rows.shift();if(k==='Backspace'&&key==='heading'){const row=t.content.rows.find(r=>r.text===baseline.paragraphs[1].replace(/^\d+\. /,''));if(row)row.text='';}if(t.content.captionFocus)t.selection.block='图片描述';},
      type:async text=>{t.log.push(['type',key,text]);if(key==='heading'){const row=t.content.rows.find(r=>r.text==='');if(row)row.text=text;}},
    };
  }
  async url(){return this.content.url;} async goto(u){this.content.url=u;this.log.push(['goto',u]);} async reload(){this.log.push(['reload']);this.content.throwUpload=null;} async close(){this.log.push(['close']);}
}
// Offline fixtures exercise each platform's actual runtime branch. Synthetic
// native receipts are host-contract inputs, never screenshots or upload proof.
function setup(p='toutiao', extra={}, onReopen=()=>{}) {
  const editor=new MockTab(p),list=new MockTab(p), reopened=[],nativeCalls=[];
  if(extra.picker_mode==='browser'&&extra.upload_method===undefined)editor.browserPickerAllowed=true;
  const nativeObservation=(context,handle)=>({...Object.fromEntries(Object.entries(context).filter(([key])=>!['binding','coordinate_actions'].includes(key))),ready:true,window_count:1,window_handle:handle,checked_at:TIME,files_selected:false,submitted:false});
  let nativeHandle;
  const nativeFilePicker={coordinate_contract:'screenshot-single-click-open-v1',
    prepare:async context=>{nativeCalls.push(['prepare',context]);nativeHandle='synthetic-native-window-'+(++serial);return nativeObservation(context,nativeHandle);},
    inspect:async context=>{nativeCalls.push(['inspect',context]);assert.equal(context.window_handle,nativeHandle);return nativeObservation(context,nativeHandle);},
    submit:async context=>{nativeCalls.push(['submit',context]);assert.equal(context.window_handle,nativeHandle);editor.fileCount++;nativeSubmissionCalls++;editor.log.push(['nativeOpen',context.file.absolute_path]);if(editor.content.throwUpload)throw Error(editor.content.throwUpload);if(context.purpose==='document')editor.content={...editor.content,title:baseline.title,rows:rows(),url:url(p),saved:true};},
  };
  const runtime=createDraftUploadRuntime({now:()=>TIME,nativeFilePicker:p==='zhihu'?nativeFilePicker:undefined,browser:{tabs:{new:async()=>{const tab=new MockTab(p,structuredClone(editor.content));onReopen(tab);reopened.push(tab);return tab;}}}});
  const observedUI=p==='zhihu'?Object.fromEntries(Object.entries(ui).map(([key,value])=>[key,Array.isArray(value)?value:{...value,observed_url:key==='coverFile'?url(p):blank(p)}])):ui;
  if(p==='zhihu')observedUI.importStages=['menu','dialog','file'].map(stage=>({stage,binding:{...binding(stage),observed_url:blank(p),...(stage==='file'?{name:'点击选择本地文档或拖动文件到窗口上传'}:{})},browser_session:'mock-session',tab_id:editor.id}));
  const input={article_id:'synthetic-article',platform:p,target_account:editor.content.account,word_sha256:hash,word_size:123,browser_session:'mock-session',...(p==='zhihu'?{executor_id:'cua-executor'}:{}),baseline,ui:observedUI,owned_new_draft:true,...extra};
  const s=runtime.createSession(input);
  const file={filename:'synthetic.docx',absolute_path:'/mock/synthetic.docx',sha256:hash,size:123,browser_session:'mock-session',visible_in_browser:true,checked_at:TIME,native_chooser_cancelled:true,native_open_used:false};
  const attempt=(state='reserved')=>({attempt_id:'attempt-'+p,article_id:s.article_id,platform:p,target_account:s.target_account,word_sha256:hash,word_size:123,state,editor_urls:[],consumed_at:state==='reserved'?null:TIME,authorization_kind:'new_import'});
  return {runtime,s,editor,list,reopened,input,file,attempt,nativeFilePicker,nativeCalls,nativeObservation};
}
async function reachConsumed(x) {
  let r=await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'synthetic-execution-history'}});
  assert.equal(r.operation,'reserve_article_upload');
  r=await x.runtime.acceptReserve(x.s,{reserved:true,attempt:x.attempt()});assert.equal(r.operation,'consume_article_upload');
  r=await x.runtime.acceptConsume(x.s,{execute_import:true,attempt:x.attempt('outcome_unknown')});assert.equal(r.operation,x.s.platform==='toutiao'?'record_article_status':'record_article_delivery');
  assert.equal(x.editor.fileCount,0);return r;
}
async function importOnce(x) {await reachConsumed(x);const r=await x.runtime.submitAfterSaving(x.s,{state:x.s.platform==='toutiao'?'toutiao_saving':'saving'});assert.equal(r.operation,'record_article_upload');assert.equal(x.editor.fileCount,1);if(x.s.upload_method==='coordinate'){assert.equal(x.editor.browserWaitCount,0);assert.equal(x.nativeCalls.filter(([method])=>method==='submit').length,1);}return r;}
const inspected=[{observed_url:'https://img.example.test/a.png',reference_sha256:ihash,checked_at:TIME,inspected:true,reference_width:100,reference_height:50}];
function sameBrowserDownload(x) {
  return {filename:x.file.filename,absolute_path:x.file.absolute_path,sha256:hash,size:123,browser_session:'mock-session',visible_in_browser:false,visibility_unproven:true,checked_at:TIME,
    handoff:{kind:'same_browser_download',download_path:'/mock/downloads/original-uuid',download_browser_session:'mock-session',executor_id:'cua-executor',source_sha256:hash,source_size:123,verified_in_cua:true,copied_in_same_executor:true}};
}
let tests=0;
async function test(name, fn){await fn();tests++;console.log('PASS',name);}
await test('Toutiao same-browser download keeps visibility unproven and prepares a genuine chooser before permission',async()=>{
 for(const platform of ['toutiao']){
  const x=setup(platform,{executor_id:'cua-executor'});x.file=sameBrowserDownload(x);x.file.handoff.chooser_prepared=true;x.file.handoff.chooser_prepared_at='2001-01-01T00:00:00Z';
  let chooserCalls=0;const waiter=x.editor.playwright.waitForEvent;x.editor.playwright.waitForEvent=async event=>{chooserCalls++;assert.equal(x.s.pending,undefined);assert.equal(x.editor.fileCount,0);return waiter(event);};
  const reserve=await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'synthetic-execution-history'}});
  assert.equal(reserve.operation,'reserve_article_upload');assert.equal(chooserCalls,1);assert.equal(x.editor.fileCount,0);
  assert.equal(reserve.args.preflight.file.visible_in_browser,false);assert.equal(reserve.args.preflight.file.visibility_unproven,true);assert.equal(reserve.args.preflight.file.handoff.chooser_prepared,true);assert.equal(reserve.args.preflight.file.handoff.chooser_prepared_at,TIME);
  assert.equal(x.file.handoff.chooser_prepared_at,'2001-01-01T00:00:00Z','caller evidence is not promoted or mutated');
  const consume=await x.runtime.acceptReserve(x.s,{reserved:true,attempt:x.attempt()});assert.deepEqual(consume.args.file_confirmation,reserve.args.preflight.file);assert.equal(x.editor.fileCount,0);
  assert.throws(()=>{x.s.file.absolute_path='/mock/different.docx';},TypeError);assert.throws(()=>{x.s.file.handoff.download_path='/mock/different-source';},TypeError);
  await x.runtime.acceptConsume(x.s,{execute_import:true,attempt:x.attempt('outcome_unknown')});assert.equal(x.editor.fileCount,0);
  assert.equal((await x.runtime.submitAfterSaving(x.s,{state:platform==='toutiao'?'toutiao_saving':'saving'})).operation,'record_article_upload');assert.equal(x.editor.fileCount,1);assert.equal(chooserCalls,1);
  await x.runtime.acceptObserved(x.s,{recorded:true});assert.equal((await x.runtime.verify(x.s,{inspectedBindings:inspected,...(platform==='zhihu'?{coverInspection:{observed_url:'https://img.example.test/cover.png',reference_sha256:ihash,checked_at:TIME,inspected:true}}:{})})).args.state,'verified');assert.equal(x.s.file.visible_in_browser,false);assert.equal(x.s.file.visibility_unproven,true);
  assert.equal((await x.runtime.submitAfterSaving(x.s,{state:platform==='toutiao'?'toutiao_saving':'saving'})).status,'blocked');assert.equal(x.editor.fileCount,1);
  const c=x.runtime.checkpoint(x.s);assert.equal('file' in c,false);assert.equal('handoff' in c,false);assert.equal('grant' in c,false);
  const restored=setup(platform,{...x.input,checkpoint:c});assert.equal(restored.s.grant,undefined);assert.equal(restored.s.chooser,undefined);assert.equal(restored.s.readonly_fenced,true);assert.equal((await restored.runtime.submitAfterSaving(restored.s,{state:'toutiao_saving'})).status,'blocked');assert.equal(restored.editor.fileCount,0);
 }
});
await test('download provenance binds both byte checks, source path, browser and executor before chooser',async()=>{
 const patches=[f=>{delete f.handoff;},f=>{delete f.visibility_unproven;},f=>{f.handoff.kind='filesystem_stat';},f=>{f.handoff.download_path='relative/path';},f=>{f.handoff.download_path='/mock/../source';},f=>{f.handoff.download_path='/mock/\u0000source';},f=>{f.handoff.download_browser_session='other-browser';},f=>{f.browser_session='other-browser';},f=>{f.handoff.executor_id='other-executor';},f=>{f.handoff.source_sha256='c'.repeat(64);},f=>{f.handoff.source_size=124;},f=>{f.handoff.verified_in_cua=false;},f=>{f.handoff.copied_in_same_executor=false;},f=>{f.handoff.downloaded_at=TIME;},f=>{f.sha256='c'.repeat(64);},f=>{f.size=124;},f=>{f.checked_at='2001-01-01T00:00:00Z';},f=>{f.absolute_path='/mock/../synthetic.docx';}];
 for(const patch of patches){const x=setup('toutiao',{executor_id:'cua-executor'});x.file=sameBrowserDownload(x);patch(x.file);const r=await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'synthetic'}});assert.equal(r.status,'blocked');assert.equal(x.s.pending,undefined);assert.equal(x.editor.fileCount,0);assert.equal(x.editor.log.some(e=>e[0]==='click'),false);}
 const x=setup();x.file=sameBrowserDownload(x);assert.equal((await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'synthetic'}})).status,'blocked');assert.equal(x.editor.fileCount,0);
});
await test('supported true visibility evidence stays separate from unproven download handoff',async()=>{
 for(const patch of [{handoff:{kind:'same_browser_download'}},{visibility_unproven:true},{visibility_unproven:false}]){const x=setup();Object.assign(x.file,patch);assert.equal((await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'synthetic'}})).status,'blocked');assert.equal(x.editor.log.length,0);assert.equal(x.editor.fileCount,0);}
 const x=setup();const r=await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'synthetic'}});assert.equal(r.operation,'reserve_article_upload');assert.equal(r.args.preflight.file.visible_in_browser,true);assert.equal('handoff' in r.args.preflight.file,false);assert.equal('visibility_unproven' in r.args.preflight.file,false);assert.equal('executor_id' in x.s,false);
});
await test('a download cannot grant import permission to unknown history or read-only verification',async()=>{
 for(const extra of [{},{import_mode:'verify_existing'}]){const x=setup('toutiao',{executor_id:'cua-executor',...extra});x.file=sameBrowserDownload(x);const r=await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,...(extra.import_mode?{history:{prior_submission:'never_attempted',evidence_reference:'synthetic'}}:{})});assert.equal(r.status,'blocked');assert.equal(x.s.pending,undefined);assert.equal(x.editor.log.length,0);assert.equal(x.editor.fileCount,0);}
});
await test('caller-prepared assertions cannot substitute for a working official chooser',async()=>{
 for(const broken of ['timeout','missing-setFiles']){const x=setup('toutiao',{executor_id:'cua-executor'});x.file=sameBrowserDownload(x);x.file.handoff.chooser_prepared=true;x.file.handoff.chooser_prepared_at=TIME;x.editor.playwright.waitForEvent=async()=>{if(broken==='timeout')throw Error('filechooser timeout');return {};};const r=await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'synthetic'}});assert.equal(r.kind,'picker_failure');assert.equal(x.s.pending,undefined);assert.equal(x.editor.fileCount,0);assert.equal(x.s.readonly_fenced,true);}
});
await test('download byte checks tolerate bounded clock skew but expire before consume',async()=>{
 const x=setup('toutiao',{executor_id:'cua-executor'});x.file=sameBrowserDownload(x);x.file.checked_at='2026-10-06T09:30:30.000Z';assert.equal((await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'synthetic'}})).operation,'reserve_article_upload');assert.equal(x.s.file.handoff.chooser_prepared_at,TIME);
 const y=setup('toutiao',{executor_id:'cua-executor'});y.file=sameBrowserDownload(y);y.file.checked_at='2026-10-06T09:31:01.000Z';assert.equal((await y.runtime.preflight(y.s,{editorTab:y.editor,listTab:y.list,fileEvidence:y.file,history:{prior_submission:'never_attempted',evidence_reference:'synthetic'}})).status,'blocked');assert.equal(y.editor.log.length,0);
 let clock=TIME;const z=setup('toutiao',{executor_id:'cua-executor'});z.runtime=createDraftUploadRuntime({now:()=>clock,browser:{}});z.s=z.runtime.createSession(z.input);z.file=sameBrowserDownload(z);await z.runtime.preflight(z.s,{editorTab:z.editor,listTab:z.list,fileEvidence:z.file,history:{prior_submission:'never_attempted',evidence_reference:'synthetic'}});clock='2026-10-06T09:46:00.000Z';assert.equal((await z.runtime.acceptReserve(z.s,{reserved:true,attempt:z.attempt()})).status,'blocked');assert.equal(z.editor.fileCount,0);assert.equal(z.s.grant,false);
});
await test('first authorized SDK path-access failure retains an unknown fence and cannot replay',async()=>{
 const x=setup('toutiao',{executor_id:'cua-executor'});x.file=sameBrowserDownload(x);await reachConsumed(x);x.editor.content.throwUpload='file path unavailable to browser';const r=await x.runtime.submitAfterSaving(x.s,{state:'toutiao_saving'});assert.equal(r.kind,'submission_unknown');assert.equal(r.checkpoint.readonly_fenced,true);assert.equal(x.s.grant,false);assert.equal(x.s.document_imported_this_session,false);assert.equal(x.s.file.visible_in_browser,false);assert.equal(x.editor.fileCount,1);
 assert.equal((await x.runtime.submitAfterSaving(x.s,{state:'toutiao_saving'})).status,'blocked');assert.equal(x.editor.fileCount,1);
 const restored=setup('toutiao',{...x.input,checkpoint:r.checkpoint});assert.equal((await restored.runtime.submitAfterSaving(restored.s,{state:'toutiao_saving'})).status,'blocked');assert.equal(restored.editor.fileCount,0);
});
await test('whole public file replacement after consume cannot change either approved submission path',async()=>{
 for(const unproven of [false,true]){
  const x=setup('toutiao',{executor_id:'cua-executor'});if(unproven)x.file=sameBrowserDownload(x);await reachConsumed(x);
  x.s.file={...structuredClone(x.s.file),absolute_path:'/different-unchecked/synthetic.docx'};
  const r=await x.runtime.submitAfterSaving(x.s,{state:'toutiao_saving'});assert.equal(r.kind,'readback_mismatch');assert.equal(x.s.readonly_fenced,true);assert.equal(x.s.grant,false);assert.equal(x.editor.fileCount,0);assert.deepEqual(x.editor.log.filter(row=>row[0]==='setFiles'),[]);
  assert.equal((await x.runtime.submitAfterSaving(x.s,{state:'toutiao_saving'})).status,'blocked');assert.equal(x.editor.fileCount,0);
 }
});
await test('public file replacement across final asynchronous UI checks blocks actual setFiles',async()=>{
 for(const unproven of [false,true]){
  for(const boundary of ['control','last-editor-read']){
   const x=setup('toutiao',{executor_id:'cua-executor'});if(unproven)x.file=sameBrowserDownload(x);await reachConsumed(x);
   const locate=x.editor.locator;let titleReads=0,changed=false;
   x.editor.locator=key=>{const l=locate(key);if(boundary==='control'&&key==='file')l.isEnabled=async()=>{changed=true;x.s.file={...structuredClone(x.s.file),absolute_path:'/async-unchecked/synthetic.docx'};return true;};if(boundary==='last-editor-read'&&key==='title'){const evaluate=l.evaluate;l.evaluate=async(...args)=>{titleReads++;const result=await evaluate(...args);if(titleReads===2){changed=true;x.s.file={...structuredClone(x.s.file),absolute_path:'/async-unchecked/synthetic.docx'};}return result;};}return l;};
   const r=await x.runtime.submitAfterSaving(x.s,{state:'toutiao_saving'});assert.equal(changed,true);assert.equal(r.kind,'readback_mismatch');assert.equal(x.s.readonly_fenced,true);assert.equal(x.editor.fileCount,0);assert.deepEqual(x.editor.log.filter(row=>row[0]==='setFiles'),[]);
  }
 }
});
await test('even identical replacement file objects cannot carry the original permission',async()=>{
 for(const unproven of [false,true]){
  const x=setup('toutiao',{executor_id:'cua-executor'});if(unproven)x.file=sameBrowserDownload(x);await reachConsumed(x);x.s.file=structuredClone(x.s.file);
  assert.equal((await x.runtime.submitAfterSaving(x.s,{state:'toutiao_saving'})).kind,'readback_mismatch');assert.equal(x.editor.fileCount,0);
 }
});
await test('private file approval is required unchanged at reserve and consume boundaries',async()=>{
 for(const unproven of [false,true]){
  for(const boundary of ['reserve','consume']){
   const x=setup('toutiao',{executor_id:'cua-executor'});if(unproven)x.file=sameBrowserDownload(x);
   await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'synthetic'}});
   if(boundary==='consume')await x.runtime.acceptReserve(x.s,{reserved:true,attempt:x.attempt()});
   x.s.file={...structuredClone(x.s.file),absolute_path:'/before-grant/synthetic.docx'};
   const r=boundary==='reserve'?await x.runtime.acceptReserve(x.s,{reserved:true,attempt:x.attempt()}):await x.runtime.acceptConsume(x.s,{execute_import:true,attempt:x.attempt('outcome_unknown')});
   assert.equal(r.kind,'readback_mismatch');assert.equal(x.s.grant,false);assert.equal(x.s.readonly_fenced,true);assert.equal(x.editor.fileCount,0);
  }
 }
});
await test('late source save indicator remains observable without another document upload',async()=>{
 for(const unavailable of ['hidden','absent']){
  const x=setup();await importOnce(x);await x.runtime.acceptObserved(x.s,{recorded:true});
  if(unavailable==='hidden')x.editor.content.saved=false;else x.editor.content.missing='saved';
  const wait=await x.runtime.verify(x.s,{inspectedBindings:inspected});
  assert.equal(wait.status,'waiting');assert.equal(wait.kind,'import_pending');assert.equal(x.s.blocked,null);assert.equal(x.s.grant,false);assert.equal(x.reopened.length,0);
  x.editor.content.saved=true;delete x.editor.content.missing;
  assert.equal((await x.runtime.observe(x.s)).operation,'record_article_upload');await x.runtime.acceptObserved(x.s,{recorded:true});
  assert.equal((await x.runtime.verify(x.s,{inspectedBindings:inspected})).args.state,'verified');assert.equal(x.editor.fileCount,1);
  const restored=setup('toutiao',{checkpoint:wait.checkpoint});assert.equal(restored.s.readonly_fenced,true);assert.equal(restored.s.grant,undefined);
  assert.equal((await restored.runtime.submitAfterSaving(restored.s,{state:'toutiao_saving'})).status,'blocked');assert.equal(restored.editor.fileCount,0);
 }
});
await test('delayed independent save reuses the same tab after private exit',async()=>{
 const x=setup('toutiao',{},tab=>{tab.content.saved=false;});await importOnce(x);await x.runtime.acceptObserved(x.s,{recorded:true});x.s.ui.saveExit=binding('exit');
 const locate=x.editor.locator;x.editor.locator=key=>{const l=locate(key),click=l.click;if(key==='exit')l.click=async()=>{await click();x.editor.content.url='https://mp.toutiao.com/profile_v4/graphic/articles';};return l;};
 assert.equal((await x.runtime.verify(x.s,{inspectedBindings:inspected})).status,'waiting');assert.equal(x.reopened.length,1);assert.equal(x.s.blocked,null);
 x.reopened[0].content.saved=true;
 assert.equal((await x.runtime.verify(x.s,{inspectedBindings:inspected})).args.state,'verified');assert.equal(x.reopened.length,1);
 assert.equal(x.editor.log.filter(e=>e[0]==='click'&&e[1]==='exit').length,1);assert.equal(x.editor.fileCount,1);
});
await test('independent image loading can finish on the same reopened draft',async()=>{
 const x=setup('toutiao',{},tab=>{tab.content.rows.find(r=>r.kind==='image').loaded=false;});await importOnce(x);await x.runtime.acceptObserved(x.s,{recorded:true});
 assert.equal((await x.runtime.verify(x.s,{inspectedBindings:inspected})).status,'waiting');assert.equal(x.s.blocked,null);
 x.reopened[0].content.rows.find(r=>r.kind==='image').loaded=true;
 assert.equal((await x.runtime.verify(x.s,{inspectedBindings:inspected})).args.state,'verified');assert.equal(x.reopened.length,1);assert.equal(x.editor.fileCount,1);
});
await test('independent editor mount and empty body stay pending until exact readback',async()=>{
 for(const missing of ['body','empty']){
  const x=setup('toutiao',{},tab=>{if(missing==='body')tab.content.missing='body';else tab.content.rows=[];});await importOnce(x);await x.runtime.acceptObserved(x.s,{recorded:true});
  assert.equal((await x.runtime.verify(x.s,{inspectedBindings:inspected})).status,'waiting');assert.equal(x.s.blocked,null);
  delete x.reopened[0].content.missing;x.reopened[0].content.rows=rows();
  assert.equal((await x.runtime.verify(x.s,{inspectedBindings:inspected})).args.state,'verified');assert.equal(x.reopened.length,1);assert.equal(x.editor.fileCount,1);
 }
});
await test('waiting save blocks cover writes and does not forgive readback changes',async()=>{
 const x=setup('zhihu');await importOnce(x);await x.runtime.acceptObserved(x.s,{recorded:true});x.editor.content.saved=false;
 assert.equal((await x.runtime.verify(x.s,{inspectedBindings:inspected})).status,'waiting');assert.equal(x.s.phase,'import_pending');
 assert.equal((await x.runtime.setZhihuCover(x.s,{coverInspection:{observed_url:'https://img.example.test/cover.png',reference_sha256:ihash,checked_at:TIME,inspected:true}})).status,'blocked');assert.equal(x.editor.fileCount,1);
 const y=setup('toutiao',{},tab=>{tab.content.saved=false;});await importOnce(y);await y.runtime.acceptObserved(y.s,{recorded:true});
 assert.equal((await y.runtime.verify(y.s,{inspectedBindings:inspected})).status,'waiting');y.reopened[0].content.saved=true;y.reopened[0].content.rows[0].text='用户改后的正文';
 assert.equal((await y.runtime.verify(y.s,{inspectedBindings:inspected})).kind,'readback_mismatch');assert.equal(y.editor.fileCount,1);assert.equal(y.reopened.length,1);
});
await test('Zhihu delegates screenshot single-click stages to the coordinate host without a browser waiter',async()=>{
 const x=setup('zhihu');let waits=0;
 x.editor.playwright.waitForEvent=async()=>{waits++;throw Error('coordinate method must not register a browser filechooser');};
 await reachConsumed(x);
 assert.deepEqual(x.nativeCalls.map(([method])=>method),['prepare']);assert.equal(waits,0);assert.equal(x.editor.fileCount,0);
 assert.deepEqual(x.editor.log.filter(([method])=>method==='click'),[]);
 const actions=x.nativeCalls[0][1].coordinate_actions;
 assert.equal(actions.contract,'screenshot-single-click-open-v1');
 assert.deepEqual(actions.document_stages.map(step=>step.stage),['menu','dialog','file']);
 assert.equal(actions.file_selection,'single_click_exact_word');assert.equal(actions.confirmation,'single_click_open');
 assert.equal(actions.settle_after_each_action,true);assert.equal(actions.relocate_on_window_change,true);
});
await test('explicit independent Zhihu browser mode preserves the original menu/dialog/waiter order and one submission',async()=>{
 const x=setup('zhihu',{picker_mode:'browser'}),order=[];let resolve;
 assert.equal(x.s.picker_mode,'browser');assert.equal(x.s.upload_method,null);
 const originalWait=x.editor.playwright.waitForEvent,originalLocate=x.editor.locator;
 x.editor.playwright.waitForEvent=event=>{order.push('wait:'+x.editor.id);return new Promise(r=>{resolve=async()=>r(await originalWait(event));});};
 x.editor.locator=key=>{const l=originalLocate(key),click=l.click;l.click=async()=>{order.push('click:'+key+':'+x.editor.id);if(key!=='file')assert.equal(resolve,undefined,'dialog open is not a chooser event');await click();if(key==='file')await resolve();};return l;};
 await reachConsumed(x);
 assert.deepEqual(order,['click:menu:'+x.editor.id,'click:dialog:'+x.editor.id,'wait:'+x.editor.id,'click:file:'+x.editor.id]);assert.equal(x.editor.fileCount,0);assert.equal(x.nativeCalls.length,0);
 assert.equal((await x.runtime.submitAfterSaving(x.s,{state:'saving'})).operation,'record_article_upload');assert.equal(x.editor.fileCount,1);
 assert.equal((await x.runtime.submitAfterSaving(x.s,{state:'saving'})).status,'blocked');assert.equal(x.editor.fileCount,1);
});
await test('wrong Zhihu dialog trigger or session is refused before reservation',async()=>{
 for(const kind of ['dialog','session','missing']){
  const x=setup('zhihu');let waits=0;x.editor.playwright.waitForEvent=async()=>{waits++;throw Error('unexpected wait');};
  if(kind==='dialog')x.s.ui.importStages[2].binding={...binding('dialog'),name:'导入文档'};
  if(kind==='session')x.s.ui.importStages[2].browser_session='different-browser';
  if(kind==='missing')delete x.s.ui.importStages;
  const r=await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'synthetic'}});
  assert.equal(r.kind,'picker_failure');assert.equal(waits,0);assert.equal(x.s.attempt_id,undefined);assert.equal(x.editor.fileCount,0);
 }
});
await test('immediate visible refusal after setFiles return keeps platform rejection distinct',async()=>{
 const x=setup(),waiter=x.editor.playwright.waitForEvent;
 x.editor.playwright.waitForEvent=async event=>{const c=await waiter(event),submit=c.setFiles;c.setFiles=async file=>{await submit(file);x.editor.content.blocker='导入失败，请重试';};return c;};
 await reachConsumed(x);const r=await x.runtime.submitAfterSaving(x.s,{state:'toutiao_saving'});
 assert.equal(r.kind,'platform_import_failure');assert.equal(r.checkpoint.submission_returned_at,TIME);assert.equal(x.s.readonly_fenced,true);assert.equal(x.editor.fileCount,1);
});
const reimportInput={previous_attempt_id:'previous-consumed-attempt',prior_draft_identity:'known_editor_url',existing_editor_url:url('toutiao'),authorization_scope:'duplicate_tolerant_task',current_task_id:'same-manual-task',authorization_key:'new-action',confirmation_message_id:'actual-owner-reference',prior_executor_end_reference:'actual-end-reference',confirm_reimport:true,confirm_new_draft:true,preserve_existing_draft:true,prior_executor_stopped:true,confirm_duplicate_tolerant_task:true,retained_editor_urls:[url('toutiao')]};
const legacyInput={expected_attempt_id:null,confirm_unrecorded_history:true,prior_draft_identity:'unknown_without_editor_url',current_task_id:'exact-legacy-manual-task',authorization_key:'legacy-new-action',confirmation_message_id:'actual-legacy-owner-reference',prior_executor_end_reference:'actual-legacy-end-reference',confirm_reimport:true,confirm_new_draft:true,preserve_existing_draft:true,prior_executor_stopped:true};
const legacyAttempt=x=>({...x.attempt(),authorization_kind:'owner_confirmed_legacy_reimport',previous_attempt_id:null});
await test('owner-authorized legacy download remains history unknown and gets exactly one new import',async()=>{
 const x=setup('toutiao',{executor_id:'cua-executor',import_mode:'owner_confirmed_legacy_reimport',reimport:legacyInput});x.file=sameBrowserDownload(x);
 const reserve=await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'irrelevant-old-proof'}});
 assert.equal(reserve.args.mode,'owner_confirmed_legacy_reimport');assert.equal(reserve.args.preflight.existing_drafts.prior_submission,'submitted_unknown');assert.equal(reserve.args.preflight.file.visible_in_browser,false);assert.equal(reserve.args.preflight.file.handoff.chooser_prepared,true);assert.equal('previous_attempt_id' in reserve.args,false);assert.equal(x.editor.fileCount,0);
 const attempt=legacyAttempt(x),consume=await x.runtime.acceptReserve(x.s,{reserved:true,attempt,legacy_reimport_permission_ready:true});assert.deepEqual(consume.args.file_confirmation,reserve.args.preflight.file);assert.equal(consume.args.reimport_editor_confirmation.editor_empty,true);
 await x.runtime.acceptConsume(x.s,{execute_import:true,attempt:{...attempt,state:'outcome_unknown',consumed_at:TIME}});assert.equal((await x.runtime.submitAfterSaving(x.s,{state:'toutiao_saving'})).operation,'record_article_upload');assert.equal(x.editor.fileCount,1);assert.equal(x.s.file.visible_in_browser,false);
 assert.equal((await x.runtime.submitAfterSaving(x.s,{state:'toutiao_saving'})).status,'blocked');assert.equal(x.editor.fileCount,1);
});
await test('explicit legacy unknown history prepares a chooser then consumes one new root on either platform',async()=>{
 for(const platform of ['toutiao','zhihu']){
  const x=setup(platform,{import_mode:'owner_confirmed_legacy_reimport',reimport:legacyInput});
  assert.equal(x.runtime.createSession(x.input),x.s,'one session per authorized legacy action');
  const reserve=await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'irrelevant-old-proof'}});
  assert.equal(reserve.args.mode,'owner_confirmed_legacy_reimport');assert.equal(reserve.args.expected_attempt_id,null);assert.equal(reserve.args.confirm_unrecorded_history,true);assert.equal(reserve.args.authorization_scope,'exact_reimport');
  assert.equal(reserve.args.current_word_sha256,hash);assert.equal('previous_attempt_id' in reserve.args,false);assert.equal(reserve.args.preflight.existing_drafts.prior_submission,'submitted_unknown');
  assert.equal(reserve.args.preflight.existing_drafts.editor_empty,true);if(platform==='toutiao')assert(x.editor.log.some(e=>e[0]==='click'&&e[1]==='file'));else{assert.deepEqual(x.nativeCalls.map(([method])=>method),['prepare']);assert.equal(x.editor.log.some(e=>e[0]==='click'),false);}assert.equal(x.editor.fileCount,0);
  const attempt=legacyAttempt(x),consume=await x.runtime.acceptReserve(x.s,{reserved:true,attempt,legacy_reimport_permission_ready:true});
  assert.equal(consume.operation,'consume_article_upload');assert.equal(consume.args.reimport_editor_confirmation.current_editor_url,blank(platform));assert.equal('consume_token' in consume.args,false);
  await x.runtime.acceptConsume(x.s,{execute_import:true,attempt:{...attempt,state:'outcome_unknown',consumed_at:TIME}});
  const submitted=await x.runtime.submitAfterSaving(x.s,{state:platform==='toutiao'?'toutiao_saving':'saving'});assert.equal(submitted.operation,'record_article_upload');assert.equal(x.editor.fileCount,1);
  assert.equal((await x.runtime.submitAfterSaving(x.s,{state:platform==='toutiao'?'toutiao_saving':'saving'})).status,'blocked');assert.equal(x.editor.fileCount,1);
  const checkpoint=x.runtime.checkpoint(x.s);assert.equal('execution_claim' in checkpoint,false);assert.equal('consume_token' in checkpoint,false);
  const restored=setup(platform,{...x.input,checkpoint});assert.equal(restored.s.grant,undefined);assert.equal(restored.s.readonly_fenced,true);assert.equal((await restored.runtime.submitAfterSaving(restored.s,{state:'toutiao_saving'})).status,'blocked');assert.equal(restored.editor.fileCount,0);
 }
});
await test('legacy known drafts remain historical and cannot become the new result',async()=>{
 const x=setup('toutiao',{import_mode:'owner_confirmed_legacy_reimport',reimport:{...legacyInput,prior_draft_identity:'known_editor_url',existing_editor_url:url('toutiao'),retained_editor_urls:[url('toutiao')]}});
 x.list.content.list=[{title:baseline.title,url:url('toutiao')},{title:baseline.title,url:url('toutiao').replace('12345','67890')}];
 const r=await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file});assert.equal(r.args.preflight.existing_drafts.prior_submission,'submitted_unknown');assert.equal(r.args.preflight.existing_drafts.matching_editor_urls.length,2);assert.deepEqual(x.s.editor_urls,[]);
 const attempt=legacyAttempt(x);await x.runtime.acceptReserve(x.s,{reserved:true,attempt,legacy_reimport_permission_ready:true});await x.runtime.acceptConsume(x.s,{execute_import:true,attempt:{...attempt,state:'outcome_unknown',consumed_at:TIME}});
 assert.equal((await x.runtime.submitAfterSaving(x.s,{state:'toutiao_saving'})).kind,'readback_mismatch');assert.equal(x.editor.fileCount,1);assert.equal(x.runtime.checkpoint(x.s).previous_editor_urls.length,2);
});
await test('legacy actions refuse missing approval, invented parents and nonblank editors before reserve',async()=>{
 for(const patch of [{expected_attempt_id:undefined},{expected_attempt_id:'invented-attempt'},{confirm_unrecorded_history:false},{previous_attempt_id:undefined},{previous_attempt_id:'invented-consumed-attempt'}])assert.throws(()=>setup('toutiao',{import_mode:'owner_confirmed_legacy_reimport',reimport:{...legacyInput,...patch}}),e=>e.kind==='permission_approval');
 for(const patch of [{confirm_reimport:false},{prior_executor_stopped:false},{prior_executor_end_reference:''},{confirmation_message_id:''},{current_task_id:''},{prior_draft_identity:undefined},{authorization_scope:'duplicate_tolerant_task'},{existing_editor_url:url('toutiao')}]){
  const x=setup('toutiao',{import_mode:'owner_confirmed_legacy_reimport',reimport:{...legacyInput,...patch}});const r=await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file});assert.equal(r.status,'blocked');assert.equal(x.editor.fileCount,0);assert.equal(x.editor.log.some(e=>e[0]==='click'),false);assert.equal(x.s.pending,undefined);
 }
 for(const patch of [{title:'用户已有内容'},{url:'https://mp.toutiao.com/profile_v4/graphic/articles'}]){
  const x=setup('toutiao',{import_mode:'owner_confirmed_legacy_reimport',reimport:legacyInput});Object.assign(x.editor.content,patch);assert.equal((await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file})).status,'blocked');assert.equal(x.editor.fileCount,0);assert.equal(x.s.pending,undefined);
 }
});
await test('legacy permission must be a fresh authorized root and cannot borrow a linked or ordinary grant',async()=>{
 for(const patch of [{legacy_reimport_permission_ready:false},{reserved:false},{attempt:{authorization_kind:'new_import'}},{attempt:{authorization_kind:'owner_confirmed_reimport',previous_attempt_id:'old-consumed'}},{attempt:{previous_attempt_id:'fabricated-parent'}},{attempt:{word_size:124}}]){
  const x=setup('toutiao',{import_mode:'owner_confirmed_legacy_reimport',reimport:legacyInput});await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file});const r=await x.runtime.acceptReserve(x.s,{reserved:true,legacy_reimport_permission_ready:true,...patch,attempt:{...legacyAttempt(x),...patch.attempt}});assert.equal(r.kind,'lease_lost');assert.equal(x.editor.fileCount,0);assert(!x.s.grant);
 }
 const normal=setup();await normal.runtime.preflight(normal.s,{editorTab:normal.editor,listTab:normal.list,fileEvidence:normal.file,history:{prior_submission:'never_attempted',evidence_reference:'synthetic'}});assert.equal((await normal.runtime.acceptReserve(normal.s,{reserved:true,legacy_reimport_permission_ready:true,attempt:legacyAttempt(normal)})).kind,'lease_lost');assert.equal(normal.editor.fileCount,0);
});
await test('legacy consumed receipt must belong to this new root and cached permissions stay read only',async()=>{
 for(const patch of [{authorization_kind:'owner_confirmed_reimport'},{previous_attempt_id:'old-consumed'},{platform:'zhihu'},{state:'reserved',consumed_at:null},{consumed_at:'2001-01-01T00:00:00Z'}]){
  const x=setup('toutiao',{import_mode:'owner_confirmed_legacy_reimport',reimport:legacyInput});await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file});const attempt=legacyAttempt(x);await x.runtime.acceptReserve(x.s,{reserved:true,legacy_reimport_permission_ready:true,attempt});assert.equal((await x.runtime.acceptConsume(x.s,{execute_import:true,attempt:{...attempt,state:'outcome_unknown',consumed_at:TIME,...patch}})).kind,'lease_lost');assert(!x.s.grant);assert.equal(x.editor.fileCount,0);
 }
 const x=setup('toutiao',{import_mode:'owner_confirmed_legacy_reimport',reimport:legacyInput});await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file});const attempt={...legacyAttempt(x),state:'outcome_unknown',consumed_at:TIME};assert.equal((await x.runtime.acceptReserve(x.s,{reserved:false,attempt})).status,'reconcile_only');assert.equal(x.s.grant,undefined);assert.equal(x.editor.fileCount,0);
});
await test('authorized linked attempt keeps old URLs historical and consumes only new permit',async()=>{
 const x=setup('toutiao',{import_mode:'owner_confirmed_reimport',reimport:reimportInput});x.list.content.list=[{title:baseline.title,url:url('toutiao')}];
 const waiter=x.editor.playwright.waitForEvent;x.editor.playwright.waitForEvent=async event=>{const c=await waiter(event),setFiles=c.setFiles;c.setFiles=async file=>{await setFiles(file);x.editor.content.url=url('toutiao').replace('12345','67890');};return c;};
 const r=await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file});
 assert.equal(r.args.mode,'owner_confirmed_reimport');assert.equal(r.args.preflight.existing_drafts.prior_submission,'submitted_unknown');assert.deepEqual(x.s.editor_urls,[]);assert.deepEqual(r.args.preflight.existing_drafts.matching_editor_urls,[url('toutiao')]);assert.equal('retained_editor_urls' in r.args,false);
 const attempt={...x.attempt(),authorization_kind:'owner_confirmed_reimport',previous_attempt_id:reimportInput.previous_attempt_id};
 const consume=await x.runtime.acceptReserve(x.s,{attempt,reimport_permission_ready:true});assert.equal(consume.operation,'consume_article_upload');assert.equal(consume.args.reimport_editor_confirmation.editor_empty,true);
 await x.runtime.acceptConsume(x.s,{execute_import:true,attempt:{...attempt,state:'outcome_unknown',consumed_at:TIME}});assert.equal((await x.runtime.submitAfterSaving(x.s,{state:'toutiao_saving'})).operation,'record_article_upload');assert.equal(x.editor.fileCount,1);
 assert.deepEqual(x.runtime.checkpoint(x.s).previous_editor_urls,[url('toutiao')]);
 const restarted=setup('toutiao',{...x.input,checkpoint:x.runtime.checkpoint(x.s)});assert.equal(restarted.s.phase,'reconcile');assert.deepEqual(restarted.s.previous_editor_urls,[url('toutiao')]);assert.equal(restarted.s.grant,undefined);assert.equal(restarted.s.chooser,undefined);
 const sameRuntime=x.runtime.createSession({...x.input,checkpoint:x.runtime.checkpoint(x.s)});assert.notEqual(sameRuntime,x.s);assert.equal(sameRuntime.readonly_fenced,true);
});
await test('linked upload cannot report an old preserved draft as the new result',async()=>{
 const x=setup();await importOnce(x);x.s.previous_editor_urls=[url('toutiao')];assert.equal((await x.runtime.observe(x.s)).kind,'readback_mismatch');assert.equal(x.editor.fileCount,1);
});
await test('linked sibling cannot discard another same-platform prepared chooser',async()=>{
 const x=setup();await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'synthetic'}});
 const sibling=x.runtime.createSession({...x.input,import_mode:'owner_confirmed_reimport',reimport:reimportInput});
 const r=await x.runtime.preflight(sibling,{editorTab:new MockTab('toutiao'),listTab:new MockTab('toutiao'),fileEvidence:x.file});assert.equal(r.kind,'picker_failure');
 await x.runtime.acceptReserve(x.s,{attempt:x.attempt()});await x.runtime.acceptConsume(x.s,{execute_import:true,attempt:x.attempt('outcome_unknown')});await x.runtime.submitAfterSaving(x.s,{state:'toutiao_saving'});assert.equal(x.editor.fileCount,1);
});
await test('correct observed automatic Zhihu cover skips every cover upload',async()=>{
 const x=setup('zhihu');await importOnce(x);await x.runtime.acceptObserved(x.s,{recorded:true});
 const r=await x.runtime.setZhihuCover(x.s,{coverInspection:{observed_url:'https://img.example.test/cover.png',reference_sha256:ihash,checked_at:TIME,inspected:true}});
 assert.equal(r.status,'cover_already_verified');assert.equal(x.editor.fileCount,1);assert.equal(x.editor.log.some(e=>e[0]==='click'&&e[1]==='coverFile'),false);
});
await test('saved exit precedes independent reopen and prohibits public controls',async()=>{
 const x=setup();await importOnce(x);x.s.ui.saveExit=binding('exit');const r=await x.runtime.verify(x.s,{inspectedBindings:inspected});assert.equal(r.operation,'record_article_upload');assert.ok(x.editor.log.some(e=>e[0]==='click'&&e[1]==='exit'));assert.ok(x.s.events.find(e=>e.event==='save_exit_clicked'));assert.equal(x.s.events.some(e=>e.event==='saved_editor_exited'),false,'a returned click alone does not prove editor exit');
 const y=setup();await importOnce(y);y.s.ui.saveExit={...binding('publish'),name:'发布'};assert.equal((await y.runtime.verify(y.s,{inspectedBindings:inspected})).kind,'permission_approval');assert.equal(y.reopened.length,0);
});
await test('normal single import, exact independent receipt, and completion bridge',async()=>{
 const x=setup();await importOnce(x);const r=await x.runtime.acceptObserved(x.s,{recorded:true});assert.equal(r.status,'inspect');
 const v=await x.runtime.verify(x.s,{inspectedBindings:inspected});assert.equal(v.operation,'record_article_upload');assert.equal(v.args.readback.paragraphs.length,3);assert.equal(v.args.readback.images[0].after_paragraph,1);assert.equal(v.args.readback.images[0].observed_url,'https://img.example.test/a.png');assert.equal(x.reopened.length,1);
 const complete=await x.runtime.acceptVerified(x.s,{recorded:true,attempt:{state:'verified',attempt_id:x.s.attempt_id}});assert.equal(complete.operation,'record_article_status');assert.equal('platform' in complete.args,false);
 const done=await x.runtime.acceptCompleted(x.s,{state:'completed'});assert.equal(done.status,'done');assert.equal(x.editor.fileCount,1);
});
await test('cached identity, replayed consume, and repeated submit cannot resubmit',async()=>{
 const x=setup();assert.equal(x.runtime.createSession(x.input),x.s);await importOnce(x);
 assert.equal((await x.runtime.submitAfterSaving(x.s,{state:'toutiao_saving'})).status,'blocked');assert.equal(x.editor.fileCount,1);
});
await test('no native Cancel prerequisite; chooser is prepared once before reservation',async()=>{
 const x=setup();delete x.file.native_chooser_cancelled;delete x.file.native_open_used;
 let chooserCalls=0;const waiter=x.editor.playwright.waitForEvent;x.editor.playwright.waitForEvent=async(...args)=>{chooserCalls++;return waiter(...args);};
 await importOnce(x);assert.equal(chooserCalls,1);assert.equal(x.editor.fileCount,1);
});
await test('chooser wait budget excludes asynchronous page prechecks',async()=>{
 const x=setup();let waiting=false;const snapshot=x.editor.playwright.domSnapshot,waiter=x.editor.playwright.waitForEvent,locate=x.editor.locator;
 x.editor.playwright.domSnapshot=async()=>{assert.equal(waiting,false,'page prechecks must complete before registering the chooser wait');return snapshot();};
 x.editor.playwright.waitForEvent=async(...args)=>{waiting=true;return waiter(...args);};
 x.editor.locator=key=>{const l=locate(key),click=l.click;l.click=async()=>{if(key==='file')waiting=false;return click();};return l;};
 const r=await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'synthetic'}});assert.equal(r.operation,'reserve_article_upload');assert.equal(x.editor.fileCount,0);
});
await test('chooser timeout stops before reserve and preserves diagnostic after checkpoint restart',async()=>{
 const x=setup();x.editor.playwright.waitForEvent=async()=>{throw Error('CDP filechooser timeout');};
 const r=await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'synthetic'}});
 assert.equal(r.kind,'picker_failure');assert.equal(x.s.attempt_id,undefined);assert.equal(x.editor.fileCount,0);
 const ids={operation_id:'11111111-1111-4111-8111-111111111111',executor_id:'22222222-2222-4222-8222-222222222222'};
 assert.equal(x.runtime.diagnosticRequest(x.s,ids).args.stage,'chooser_wait');
 const y=setup('toutiao',{checkpoint:r.checkpoint});assert.equal(y.runtime.diagnosticRequest(y.s,ids).args.cause,'timeout');assert.equal(y.s.grant,undefined);assert.equal(y.s.chooser,undefined);
 assert.equal((await y.runtime.submitAfterSaving(y.s,{state:'toutiao_saving'})).status,'blocked');assert.equal(y.editor.fileCount,0);
});
await test('prepared chooser ownership spans reserve/consume bridge across sessions',async()=>{
 const x=setup();const first=await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'synthetic'}});assert.equal(first.operation,'reserve_article_upload');
 const second=x.runtime.createSession({...x.input,article_id:'other-synthetic-article'}),editor=new MockTab('toutiao'),list=new MockTab('toutiao');
 const r=await x.runtime.preflight(second,{editorTab:editor,listTab:list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'synthetic'}});
 assert.equal(r.kind,'picker_failure');assert.equal(editor.log.some(v=>v[0]==='click'&&v[1]==='file'),false);
 await x.runtime.acceptReserve(x.s,{attempt:x.attempt()});await x.runtime.acceptConsume(x.s,{execute_import:true,attempt:x.attempt('outcome_unknown')});await x.runtime.submitAfterSaving(x.s,{state:'toutiao_saving'});assert.equal(x.editor.fileCount,1);
});
await test('setFiles failure is submission uncertainty; visible platform rejection is distinct',async()=>{
 const x=setup();await reachConsumed(x);x.editor.content.throwUpload='CDP timeout';const r=await x.runtime.submitAfterSaving(x.s,{state:'toutiao_saving'});assert.equal(r.kind,'submission_unknown');assert.equal(r.checkpoint.submission_started_at,TIME);assert.equal(r.checkpoint.submission_returned_at,null);assert.equal(x.editor.fileCount,1);
 await x.runtime.submitAfterSaving(x.s,{state:'toutiao_saving'});assert.equal(x.editor.fileCount,1);
 const y=setup();await importOnce(y);y.editor.content.blocker='导入失败';assert.equal((await y.runtime.observe(y.s)).kind,'platform_import_failure');assert.equal(y.editor.fileCount,1);
});
await test('restart checkpoint never contains/replays an import grant',async()=>{
 const x=setup();await reachConsumed(x);const c=x.runtime.checkpoint(x.s);assert.equal('grant' in c,false);
 const y=setup('toutiao',{checkpoint:c});assert.equal(y.s.phase,'reconcile');assert.equal((await y.runtime.submitAfterSaving(y.s,{state:'toutiao_saving'})).status,'blocked');assert.equal(y.editor.fileCount,0);
});
await test('cancel after consume retains fence and never touches chooser',async()=>{
 const x=setup();await reachConsumed(x);x.runtime.cancel(x.s);assert.equal((await x.runtime.submitAfterSaving(x.s,{state:'toutiao_saving'})).kind,'cancelled');assert.equal(x.editor.fileCount,0);
});
await test('permission failure stops before upload without fallback',async()=>{
 const x=setup();await reachConsumed(x);x.editor.content.blocker='Permission denied';assert.equal((await x.runtime.submitAfterSaving(x.s,{state:'toutiao_saving'})).kind,'permission_approval');assert.equal(x.editor.fileCount,0);assert.equal((await x.runtime.recoverBrowser(x.s)).status,'blocked');
});
await test('browser error 9 after setFiles allows one same-page read-only recovery',async()=>{
 const x=setup();await reachConsumed(x);x.editor.content.throwUpload='error9 CDP timeout';assert.equal((await x.runtime.submitAfterSaving(x.s,{state:'toutiao_saving'})).kind,'submission_unknown');assert.equal(x.editor.fileCount,1);
 const r=await x.runtime.recoverBrowser(x.s);assert.equal(r.status,'result_unknown');assert.equal(x.editor.fileCount,1);await x.runtime.recoverBrowser(x.s);assert.equal(x.editor.log.filter(v=>v[0]==='reload').length,1);
});
await test('empty editor and zero list classify unknown without history proof',async()=>{
 const x=setup();const r=await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file});assert.equal(r.args.mode,'verify_existing');assert.equal(r.args.preflight.existing_drafts.prior_submission,'submitted_unknown');assert.equal(x.editor.fileCount,0);
});
await test('explicit and inferred verify_existing never consume a historical reserved import',async()=>{
 for(const explicit of [false,true])for(const p of ['toutiao','zhihu']){
  const x=setup(p,explicit?{import_mode:'verify_existing'}:{});let chooserCalls=0;
  x.editor.playwright.waitForEvent=async()=>{chooserCalls++;throw Error('read-only must not prepare a chooser');};
  const r=await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,...(explicit?{history:{prior_submission:'never_attempted',evidence_reference:'synthetic'}}:{})});
  assert.equal(r.args.mode,'verify_existing');
  const next=await x.runtime.acceptReserve(x.s,{reserved:false,execute_import:false,attempt:{...x.attempt(),authorization_kind:'new_word'}});
  assert.equal(next.status,'reconcile_only');assert.equal(next.operation,undefined);assert.equal(x.s.pending,null);assert.equal(x.s.grant,undefined);assert.equal(chooserCalls,0);assert.equal(x.editor.fileCount,0);
 }
});
await test('lost prepared chooser blocks before consume even for a reserved import',async()=>{
 const x=setup();const r=await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'synthetic'}});
 assert.equal(r.args.mode,'new_import');assert.ok(x.s.chooser);x.s.chooser=null;
 const next=await x.runtime.acceptReserve(x.s,{reserved:true,attempt:x.attempt()});
 assert.equal(next.kind,'picker_failure');assert.equal(next.operation,undefined);assert.equal(x.s.pending,null);assert.equal(x.s.grant,false);assert.equal(x.editor.fileCount,0);
});
await test('prepared chooser permits the same unconsumed cached import exactly once',async()=>{
 const x=setup();const r=await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'synthetic'}});
 assert.equal(r.args.mode,'new_import');assert.ok(x.s.chooser);
 const next=await x.runtime.acceptReserve(x.s,{reserved:false,execute_import:false,attempt:{...x.attempt(),authorization_kind:'new_word'}});
 assert.equal(next.operation,'consume_article_upload');assert.equal(x.editor.fileCount,0);
 await x.runtime.acceptConsume(x.s,{execute_import:true,attempt:x.attempt('outcome_unknown')});
 assert.equal((await x.runtime.submitAfterSaving(x.s,{state:'toutiao_saving'})).operation,'record_article_upload');assert.equal(x.editor.fileCount,1);
 assert.equal((await x.runtime.submitAfterSaving(x.s,{state:'toutiao_saving'})).status,'blocked');assert.equal(x.editor.fileCount,1);
});
await test('two matching URLs block as duplicates without deletion',async()=>{
 const x=setup();x.list.content.list=[{title:baseline.title,url:url('toutiao')},{title:baseline.title,url:url('toutiao').replace('12345','67890')}];const r=await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file});assert.equal(r.kind,'duplicate_draft');assert.equal(x.editor.fileCount,0);
});
await test('old draft and user-edited text stay read-only',async()=>{
 const x=setup();await importOnce(x);const c=x.runtime.checkpoint(x.s);const y=setup('toutiao',{checkpoint:c});y.editor.content={...y.editor.content,title:baseline.title,rows:rows(),url:url('toutiao')};
 assert.equal((await y.runtime.bindRecovery(y.s,y.editor)).status,'inspect_readonly');assert.equal((await y.runtime.repairParagraph(y.s,{kind:'duplicate_title',binding:binding('duplicate')})).kind,'readback_mismatch');assert.equal(y.editor.log.some(v=>v[0]==='type'),false);
 const z=setup();await importOnce(z);z.editor.content.rows[0].text='用户新编辑正文';assert.equal((await z.runtime.acceptObserved(z.s,{recorded:true})).kind,'readback_mismatch');assert.equal(z.editor.log.some(v=>v[0]==='type'),false);
});
await test('Toutiao and Zhihu have independent attempts; Zhihu independent cover required',async()=>{
 const a=setup('toutiao'),b=setup('zhihu');await importOnce(a);await importOnce(b);assert.notEqual(a.s.attempt_id,b.s.attempt_id);
 const r=await b.runtime.verify(b.s,{inspectedBindings:inspected,coverInspection:{observed_url:'https://img.example.test/cover.png',reference_sha256:ihash,checked_at:TIME,inspected:true}});assert.equal(r.args.readback.cover.loaded,true);assert.equal(a.editor.fileCount,1);assert.equal(b.editor.fileCount,1);
});
await test('locator mismatch, login and captcha fail closed',async()=>{
 for(const [label,kind] of [['请先登录','login'],['验证码','captcha']]){const x=setup();x.editor.content.blocker=label;assert.equal((await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file})).kind,kind);assert.equal(x.editor.fileCount,0);}
 const x=setup();x.editor.content.missing='account';assert.equal((await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file})).status,'blocked');assert.equal(x.editor.fileCount,0);
});
await test('structural duplicate title repair is fail-closed with no text edit',async()=>{
 const x=setup();await importOnce(x);x.editor.content.rows.unshift({kind:'paragraph',text:baseline.title,tag:'P'});const r=await x.runtime.repairParagraph(x.s,{kind:'duplicate_title',binding:binding('duplicate')});assert.equal(r.kind,'format_missing_images');assert.equal(x.editor.content.rows[0].text,baseline.title);assert.equal(x.editor.log.some(v=>v[0]==='type'),false);
});

await test('numbered heading automatic edits are disabled without any typing',async()=>{
 const x=setup();await importOnce(x);const heading=x.editor.content.rows.find(r=>r.text===baseline.paragraphs[1]);heading.text='冻结小标题';heading.list=true;heading.tag='LI';
 const r=await x.runtime.repairParagraph(x.s,{kind:'numbered_heading',paragraph_index:1,binding:binding('heading')});assert.equal(r.kind,'format_missing_images');assert.equal(heading.list,true);assert.equal(x.editor.log.some(r=>r[0]==='type'),false);
});
await test('pending and later blank unknown never cause a second document import',async()=>{
 const x=setup();await importOnce(x);x.editor.content.pending=true;assert.equal((await x.runtime.observe(x.s)).status,'import_pending');x.editor.content.pending=false;x.editor.content.url=blank('toutiao');x.editor.content.title='';x.editor.content.rows=[];assert.equal((await x.runtime.observe(x.s)).status,'result_unknown');assert.equal(x.editor.fileCount,1);
});
await test('automatic missing image insertion is disabled before Return or chooser',async()=>{
 const x=setup();await importOnce(x);x.s.ui.imageFile=binding('imageFile');x.editor.content.rows=x.editor.content.rows.filter(r=>r.kind!=='image');
 const evidence={sha256:ihash,checked_at:TIME,visible_in_browser:true,browser_session:'mock-session',absolute_path:'/mock/frozen-image.png'};
 const r=await x.runtime.repairMissingImage(x.s,{index:0,anchorBinding:binding('anchor'),fileEvidence:evidence,inspectedBindings:[]});assert.equal(r.kind,'format_missing_images');assert.equal(x.editor.fileCount,1);assert.equal(x.editor.log.some(r=>r[0]==='press'&&r[2]==='Return'),false);
});
await test('caption focus refuses input or image insertion before any test character',async()=>{
 const x=setup();await importOnce(x);x.s.ui.imageFile=binding('imageFile');x.editor.content.rows=x.editor.content.rows.filter(r=>r.kind!=='image');x.editor.content.captionFocus=true;
 const r=await x.runtime.repairMissingImage(x.s,{index:0,anchorBinding:binding('anchor'),fileEvidence:{sha256:ihash,checked_at:TIME,visible_in_browser:true,browser_session:'mock-session',absolute_path:'/mock/frozen-image.png'},inspectedBindings:[]});assert.equal(r.kind,'format_missing_images');assert.equal(x.editor.fileCount,1);assert.equal(x.editor.log.some(r=>r[0]==='type'),false);
});
await test('private Zhihu independent cover submitted once and never interpreted as a body image',async()=>{
 const x=setup('zhihu');await importOnce(x);await x.runtime.acceptObserved(x.s,{recorded:true});const f={sha256:ihash,checked_at:TIME,visible_in_browser:true,browser_session:'mock-session',absolute_path:'/mock/cover.png',size:12};
 assert.equal((await x.runtime.setZhihuCover(x.s,{fileEvidence:f})).status,'cover_requires_inspection');assert.equal(x.editor.fileCount,2);assert.equal((await x.runtime.setZhihuCover(x.s,{fileEvidence:f})).kind,'result_unknown');assert.equal(x.editor.fileCount,2);
});
await test('unknown checkpoint can reconcile matching existing URL with no import permission',async()=>{
 const x=setup();await reachConsumed(x);const c=x.runtime.checkpoint(x.s);const y=setup('toutiao',{checkpoint:c});y.list.content.list=[{title:baseline.title,url:url('toutiao')}];y.editor.content={...y.editor.content,title:baseline.title,rows:rows(),url:url('toutiao')};
 const r=await y.runtime.reconcileExisting(y.s,{editorTab:y.editor,listTab:y.list});assert.equal(r.operation,'record_article_upload');assert.equal(y.editor.fileCount,0);assert.equal(y.s.document_imported_this_session,false);
});


await test('concurrent reentry is rejected while the first action completes once',async()=>{
 const x=setup();let release,entered;const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r);const snapshot=x.editor.playwright.domSnapshot;
 x.editor.playwright.domSnapshot=async()=>{entered();await gate;return snapshot();};
 const first=x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'synthetic'}});await ready;
 await assert.rejects(x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file}),e=>e.kind==='result_unknown');release();assert.equal((await first).operation,'reserve_article_upload');assert.equal(x.editor.fileCount,0);
});

await test('cancelled pending chooser cannot reserve and keeps ownership until settlement',async()=>{
 const x=setup();let settle,entered;const ready=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>settle=resolve);let waits=0;
 const waiter=x.editor.playwright.waitForEvent;
 x.editor.playwright.waitForEvent=event=>{waits++;if(waits===1){entered();return gate;}return waiter(event);};
 const preflight=s=>x.runtime.preflight(s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'synthetic'}});
 const pending=preflight(x.s);await ready;x.runtime.cancel(x.s);
 const sibling=x.runtime.createSession({...x.input,article_id:'pending-cancel-sibling'});
 assert.equal((await preflight(sibling)).kind,'picker_failure');assert.equal(waits,1,'unsettled cancelled waiter keeps the global chooser fence');
 settle({setFiles:async()=>{throw Error('cancelled chooser must never submit');}});
 const cancelled=await pending;assert.equal(cancelled.status,'blocked');assert.equal(cancelled.kind,'cancelled');assert.equal(x.s.phase,'cancelled');assert.equal(x.s.pending,undefined);assert.equal(x.editor.fileCount,0);
 const after=x.runtime.createSession({...x.input,article_id:'after-cancel-settlement'});
 assert.equal((await preflight(after)).operation,'reserve_article_upload');assert.equal(waits,2,'settled cancelled waiter releases ownership');
});
await test('failed chooser click retains ownership until its pending waiter settles',async()=>{
 const x=setup();let settle;const gate=new Promise(resolve=>settle=resolve);let waits=0;
 const waiter=x.editor.playwright.waitForEvent,locate=x.editor.locator;
 x.editor.playwright.waitForEvent=event=>{waits++;return waits===1?gate:waiter(event);};
 x.editor.locator=key=>{const control=locate(key),click=control.click;if(key==='file')control.click=async(...args)=>{if(waits===1)throw Error('synthetic click failed');return click(...args);};return control;};
 const preflight=s=>x.runtime.preflight(s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'synthetic'}});
 assert.equal((await preflight(x.s)).kind,'picker_failure');
 const sibling=x.runtime.createSession({...x.input,article_id:'pending-click-sibling'});
 assert.equal((await preflight(sibling)).kind,'picker_failure');assert.equal(waits,1,'failed click does not release an unsettled chooser waiter');
 settle({setFiles:async()=>{throw Error('abandoned chooser must never submit');}});await gate;await Promise.resolve();
 const after=x.runtime.createSession({...x.input,article_id:'after-click-settlement'});
 assert.equal((await preflight(after)).operation,'reserve_article_upload');assert.equal(waits,2);assert.equal(x.editor.fileCount,0);
});
await test('cancelled coordinate cover preparation retains ownership until a fresh window-closure receipt',async()=>{
 const x=setup('zhihu');await importOnce(x);await x.runtime.acceptObserved(x.s,{recorded:true});
 let settle,entered,context;const ready=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>settle=resolve);
 x.nativeFilePicker.prepare=observed=>{context=observed;entered();return gate.then(()=>x.nativeObservation(context,'synthetic-cover-window'));};
 const cover=x.runtime.setZhihuCover(x.s,{fileEvidence:{sha256:ihash,checked_at:TIME,visible_in_browser:true,browser_session:'mock-session',absolute_path:'/mock/cover.png',size:12}});
 await ready;x.runtime.cancel(x.s);
 const y=setup();let waits=0;const waiter=y.editor.playwright.waitForEvent;y.editor.playwright.waitForEvent=(...args)=>{waits++;return waiter(...args);};
 const preflight=s=>x.runtime.preflight(s,{editorTab:y.editor,listTab:y.list,fileEvidence:y.file,history:{prior_submission:'never_attempted',evidence_reference:'synthetic'}});
 const sibling=x.runtime.createSession({...y.input,article_id:'pending-cover-sibling'});
 assert.equal((await preflight(sibling)).kind,'picker_failure');assert.equal(waits,0);
 settle();assert.equal((await cover).kind,'cancelled');assert.equal(x.editor.fileCount,1);
 assert.equal((await preflight(sibling)).kind,'picker_failure');assert.equal(waits,0,'a returned call does not prove window closure');
 const scope=Object.fromEntries(['article_id','platform','target_account','browser_session','executor_id','tab_id','editor_url','purpose'].map(key=>[key,context[key]]));
 const closed=x.runtime.settleNative(x.s,{runtimeVersion:context.runtimeVersion,request_id:context.request_id,request_version:context.request_version,method:context.method,actions_settled:true,observed_at:TIME,receipt:{...scope,window_handle:'synthetic-cover-window',checked_at:TIME,window_closed:true,window_count:0,submitted:false}});
 assert.equal(closed.native_outcome,'closed');assert.equal(x.s.grant,false);
 const after=x.runtime.createSession({...y.input,article_id:'after-cover-settlement'});
 assert.equal((await preflight(after)).operation,'reserve_article_upload');assert.equal(waits,1);
});
await test('cancelled read-only preflight cannot emit a reservation request',async()=>{
 const x=setup('toutiao',{import_mode:'verify_existing'});let settle,entered;const ready=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>settle=resolve);
 const locate=x.list.locator;
 x.list.locator=key=>{const control=locate(key),evaluate=control.evaluate;if(key==='list')control.evaluate=async(...args)=>{entered();await gate;return evaluate(...args);};return control;};
 const pending=x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file});await ready;x.runtime.cancel(x.s);settle();
 const result=await pending;assert.equal(result.kind,'cancelled');assert.equal(x.s.phase,'cancelled');assert.equal(x.s.pending,undefined);assert.equal(x.editor.fileCount,0);
 assert.equal(x.s.events.some(e=>e.event==='bridge_request'),false);
});
await test('file helper copies existing legal bytes, validates checksum, never overwrites',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'draft-runner-'));try {const bytes=Buffer.from('synthetic Word byte fixture');const sha=createHash('sha256').update(bytes).digest('hex');const source=path.join(dir,'already-authorized');await fs.writeFile(source,bytes);const destination=path.join(dir,'named.docx');const r=await prepareNamedWord({source,destination,sha256:sha,size:bytes.length});assert.equal(r.visible_in_browser,false);await assert.rejects(prepareNamedWord({source,destination,sha256:sha,size:bytes.length}));}finally{await fs.rm(dir,{recursive:true});}
});
await test('already loaded images require no scrolling and retain full independent verification',async()=>{
 for(const platform of ['toutiao','zhihu']){
  const x=setup(platform);await importOnce(x);await x.runtime.acceptObserved(x.s,{recorded:true});
  let snapshots=0;const snapshot=x.editor.playwright.domSnapshot;x.editor.playwright.domSnapshot=async()=>{snapshots++;return snapshot();};
  const before=x.editor.log.length,r=await x.runtime.loadImages(x.s);
  assert.equal(r.status,'images_observed');assert.equal(snapshots,1);assert.equal(x.editor.log.slice(before).some(event=>event[0]==='press'),false);
  const verified=await x.runtime.verify(x.s,{inspectedBindings:inspected,...(platform==='zhihu'?{coverInspection:{observed_url:'https://img.example.test/cover.png',reference_sha256:ihash,checked_at:TIME,inspected:true}}:{})});
  assert.equal(verified.args.state,'verified');assert.deepEqual(verified.args.readback.paragraphs,baseline.paragraphs);assert.equal(verified.args.readback.images[0].after_paragraph,1);assert.equal(x.editor.fileCount,1);
 }
});
await test('unloaded images still use bounded scrolling and verify complete text and image anchors',async()=>{
 const x=setup();await importOnce(x);await x.runtime.acceptObserved(x.s,{recorded:true});
 x.editor.content.rows=x.editor.content.rows.map(row=>({...row}));
 x.editor.content.rows.find(row=>row.kind==='image').loaded=false;
 let downs=0,snapshots=0;const snapshot=x.editor.playwright.domSnapshot,locate=x.editor.locator;
 x.editor.playwright.domSnapshot=async()=>{snapshots++;return snapshot();};
 x.editor.locator=key=>{const control=locate(key),press=control.press;if(key==='body')control.press=async value=>{await press(value);if(value==='PageDown'&&++downs===2)x.editor.content.rows.find(row=>row.kind==='image').loaded=true;};return control;};
 assert.equal((await x.runtime.loadImages(x.s)).status,'images_observed');assert.equal(downs,2);assert.equal(snapshots,4);
 assert.equal(x.editor.log.filter(event=>event[0]==='press'&&event[2]==='Control+Home').length,1);
 const verified=await x.runtime.verify(x.s,{inspectedBindings:inspected});assert.equal(verified.args.state,'verified');assert.deepEqual(verified.args.readback.paragraphs,baseline.paragraphs);assert.equal(verified.args.readback.images[0].reference_sha256,ihash);assert.equal(verified.args.readback.images[0].after_paragraph,1);assert.equal(x.editor.fileCount,1);
});
await test('scrolling that cannot load every image remains pending and cannot complete',async()=>{
 const x=setup();await importOnce(x);await x.runtime.acceptObserved(x.s,{recorded:true});x.editor.content.rows=x.editor.content.rows.map(row=>({...row}));x.editor.content.rows.find(row=>row.kind==='image').loaded=false;
 assert.equal((await x.runtime.loadImages(x.s)).status,'images_pending');
 assert.equal(x.editor.log.filter(event=>event[0]==='press'&&event[2]==='PageDown').length,baseline.paragraphs.length+baseline.images.length+1);
 const verified=await x.runtime.verify(x.s,{inspectedBindings:inspected});assert.equal(verified.status,'waiting');assert.equal(verified.kind,'import_pending');assert.equal(x.s.events.some(event=>event.event==='independent_readback_verified'),false);assert.equal(x.editor.fileCount,1);
});
await test('loaded-image shortcut never bypasses full frozen-body verification',async()=>{
 const x=setup();await importOnce(x);await x.runtime.acceptObserved(x.s,{recorded:true});x.editor.content.rows[0].text='用户后来编辑的正文';
 assert.equal((await x.runtime.loadImages(x.s)).status,'images_observed');assert.equal((await x.runtime.verify(x.s,{inspectedBindings:inspected})).kind,'readback_mismatch');assert.equal(x.editor.fileCount,1);assert.equal(x.s.events.some(event=>event.event==='independent_readback_verified'),false);
});
await test('private draft retains full title over thirty characters and verifies despite publishing-length hint',async()=>{
 const oldTitle=baseline.title;
 try{
  baseline.title='完整冻结原标题不得因为发布长度提示而自动缩短'.repeat(2);assert.ok(baseline.title.length>30);
  const x=setup();x.editor.content.blocker='标题超过30字，正式发布前请调整';await importOnce(x);await x.runtime.acceptObserved(x.s,{recorded:true});
  const r=await x.runtime.verify(x.s,{inspectedBindings:inspected});assert.equal(r.args.state,'verified');assert.equal(r.args.readback.title,baseline.title);assert.deepEqual(r.args.readback.paragraphs,baseline.paragraphs);
  assert.equal(x.s.events.filter(event=>event.event==='title_length_warning_observed').length,1);assert.equal(x.editor.log.some(event=>event[0]==='type'),false);assert.equal(x.editor.fileCount,1);
 }finally{baseline.title=oldTitle;}
});
await test('title length hint cannot substitute for an actual private saved indicator',async()=>{
 const x=setup();await importOnce(x);x.editor.content.blocker='标题超过30字';x.editor.content.saved=false;
 const r=await x.runtime.verify(x.s,{inspectedBindings:inspected});assert.equal(r.status,'waiting');assert.equal(r.kind,'import_pending');assert.equal(x.reopened.length,0);assert.equal(x.s.events.some(event=>event.event==='independent_readback_verified'),false);
});
await test('title length hint never permits truncated title or changed body',async()=>{
 for(const mutate of [x=>{x.editor.content.title='缩短后的标题';},x=>{x.editor.content.rows[0].text='改过的正文';}]){
  const x=setup();await importOnce(x);x.editor.content.blocker='标题超过30字';mutate(x);
  assert.equal((await x.runtime.verify(x.s,{inspectedBindings:inspected})).kind,'readback_mismatch');assert.equal(x.s.events.some(event=>event.event==='independent_readback_verified'),false);assert.equal(x.editor.fileCount,1);
 }
});
await test('explicit import or save failure blocks private verification even with a length hint and old saved indicator',async()=>{
 for(const failure of ['导入失败','保存失败','未能保存','无法保存草稿','Save failed','Failed to save']){
  const x=setup();await importOnce(x);x.editor.content.blocker='标题超过30字 '+failure;assert.equal(x.editor.content.saved,true);
  const r=await x.runtime.verify(x.s,{inspectedBindings:inspected});assert.equal(r.kind,'platform_import_failure');assert.equal(x.s.readonly_fenced,true);assert.equal(x.s.events.some(event=>event.event==='independent_readback_verified'),false);assert.equal(x.editor.fileCount,1);
 }
});
await test('title length hint does not relax login, captcha or permission controls',async()=>{
 for(const [failure,kind] of [['请先登录','login'],['验证码','captcha'],['Permission denied','permission_approval']]){
  const x=setup();x.editor.content.blocker='标题超过30字 '+failure;const r=await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'synthetic'}});
  assert.equal(r.kind,kind);assert.equal(x.editor.fileCount,0);assert.equal(x.s.pending,undefined);
 }
});
console.log(JSON.stringify({tests, offline_setFiles_calls:platformCalls, offline_native_open_calls:nativeSubmissionCalls, real_platform_calls:realCalls, model_calls:0, production_db_writes:0}));
