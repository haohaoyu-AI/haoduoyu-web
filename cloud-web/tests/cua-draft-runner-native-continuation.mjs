import assert from 'node:assert/strict';
import {createDraftUploadRuntime,createZhihuAccountReader} from '../scripts/browser-upload/cua-draft-runner.mjs';

// Offline host-contract tests only. No cloud computer, browser, MCP or platform.
const TIME='2026-10-10T14:00:00.000Z',HASH='a'.repeat(64),IMAGE_HASH='b'.repeat(64);
const accounts={toutiao:'61556093362',zhihu:'ren-zhe-ai-chi-yu-52'};
const blank=p=>p==='toutiao'?'https://mp.toutiao.com/profile_v4/graphic/publish':'https://zhuanlan.zhihu.com/write';
const draft=p=>p==='toutiao'?'https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=12345':'https://zhuanlan.zhihu.com/p/12345/edit';
const baseline={title:'冻结标题',paragraphs:['正文第一段','正文第二段'],images:[{sha256:IMAGE_HASH,after_paragraph:1}]};
let serial=0,cases=0;
const binding=(p,css,url=blank(p))=>({css,identity:{tag:'INPUT',type:'file'},observed_at:TIME,observed_url:url});
const bodyRows=()=>[
 {kind:'paragraph',text:baseline.paragraphs[0]},
 {kind:'image',src:'https://img.example.test/body.png',loaded:true,width:100,height:50},
 {kind:'paragraph',text:baseline.paragraphs[1]},
];
function element(row){
 if(row.kind==='image')return {nodeType:1,tagName:'IMG',matches:s=>s==='img',currentSrc:row.src,complete:row.loaded,naturalWidth:row.width,naturalHeight:row.height};
 return {nodeType:1,tagName:'P',matches:s=>s.split(',').includes('p'),textContent:row.text,parentElement:{tagName:'DIV'},childNodes:[{nodeType:3,textContent:row.text}],children:[]};
}
function tab(p){
 const t={id:'mock-tab-'+(++serial),content:{url:blank(p),title:'',rows:[],account:accounts[p],list:[],saved:false},clicks:[],waits:0};
 t.url=async()=>t.content.url;
 const locator=key=>({count:async()=>key==='account'&&t.content.accountHidden?0:1,isVisible:async()=>key!=='account'||!t.content.accountInvisible,isEnabled:async()=>true,
  innerText:async()=>key==='account'?t.content.account:key==='file'&&p==='zhihu'?'点击选择本地文档或拖动文件到窗口上传':key==='saved'?'草稿已保存':'',
  getAttribute:async()=>null,
  evaluate:async(fn,arg)=>{
   if(key==='title')return fn({value:t.content.title});
   if(key==='body')return fn({nodeType:1,tagName:'DIV',matches:()=>false,children:t.content.rows.map(element),childNodes:t.content.rows.map(element),querySelectorAll:()=>[]},arg);
   if(key==='list')return fn({querySelectorAll:()=>t.content.list.map(row=>({textContent:row.title,href:row.url}))});
   if(key==='cover')return fn({src:'https://img.example.test/cover.png',complete:true,naturalWidth:100});
   return fn({tagName:'INPUT',getAttribute:name=>name==='type'?'file':null});
  },click:async()=>{t.clicks.push(key);if(key==='menu'&&t.content.hideAccountOnImport)t.content.accountHidden=true;},press:async()=>{},
 });
 t.playwright={locator,domSnapshot:async()=>t.content.blocker||'safe private editor',waitForEvent:async()=>{t.waits++;throw Error('Native mode must never register a browser waiter');}};
 return t;
}
function setup(p='zhihu',options={}){
 const editor=tab(p),list=tab(p),calls=[],x={editor,list,calls,options,savingAcknowledged:false,submits:0};
 const observation=(context,handle)=>({...Object.fromEntries(Object.entries(context).filter(([key])=>!['binding','coordinate_actions'].includes(key))),
  ready:true,window_count:1,window_handle:handle,checked_at:TIME,files_selected:false,submitted:false});
 const nativeFilePicker={
  coordinate_contract:'screenshot-single-click-open-v1',
  prepare:async context=>{
   calls.push(['prepare',context]);assert.equal('file' in context,false);assert.equal('absolute_path' in context,false);
   assert.equal(context.browser_session,'mock-browser');assert.equal(context.tab_id,editor.id);
   const actions=context.coordinate_actions;
   assert.equal(actions.contract,'screenshot-single-click-open-v1');
   assert.equal(actions.file_selection,context.purpose==='document'?'single_click_exact_word':'single_click_exact_existing_image');assert.equal(actions.confirmation,'single_click_open');
   assert.equal(actions.settle_after_each_action,true);assert.equal(actions.relocate_on_window_change,true);
   if(context.purpose==='document'){
    assert.deepEqual(actions.document_stages.map(step=>step.stage),['menu','dialog','file']);
    assert.ok(actions.document_stages.every(step=>step.browser_session==='mock-browser'&&step.tab_id===editor.id));
    // This state change is an offline host fixture, never screenshot evidence.
    if(editor.content.hideAccountOnImport)editor.content.accountHidden=true;
   }
   const handle=options.handle||'mock-native-window-'+(++serial);x.handle=handle;
   if(options.prepare) return options.prepare(context,observation(context,handle),x);
   return {...observation(context,handle),...options.preparePatch};
  },
  inspect:async context=>{
   calls.push(['inspect',context]);assert.equal(context.window_handle,x.handle);
   if(options.inspect)return options.inspect(context,observation(context,context.window_handle),x);
   return {...observation(context,context.window_handle),...options.inspectPatch};
  },
  submit:async context=>{
   calls.push(['submit',context]);x.submits++;
   assert.equal(context.window_handle,x.handle);
   if(context.purpose==='document'){
    assert.equal(x.savingAcknowledged,true);assert.equal(x.s.grant,false);assert.equal(x.s.phase,'reconcile');
    assert.equal(context.file.sha256,HASH);assert.equal(context.file.absolute_path,'/mock/article.docx');
   }else{assert.equal(context.purpose,'zhihu_cover');assert.equal(x.s.phase,'inspect');assert.equal(context.file.sha256,IMAGE_HASH);}
   if(options.submit) return options.submit(context,x);
   if(context.purpose==='document')Object.assign(editor.content,{url:draft(p),title:baseline.title,rows:bodyRows(),saved:true});
  },
 };
 const ui={account:binding(p,'account'),title:binding(p,'title'),body:{...binding(p,'body'),image_css:'img'},draftList:binding(p,'list'),
  importFile:binding(p,'file'),saved:{...binding(p,'saved'),allowed_texts:['草稿已保存']},coverImage:binding(p,'cover'),coverOpen:[],coverFile:binding(p,'coverFile')};
 if(p==='zhihu')ui.importStages=['menu','dialog','file'].map(stage=>({stage,browser_session:'mock-browser',tab_id:editor.id,binding:{...binding(p,stage),...(stage==='file'?{name:'点击选择本地文档或拖动文件到窗口上传'}:{})}}));
 const runtime=createDraftUploadRuntime({browser:options.browser||{},nativeFilePicker:options.missing?undefined:nativeFilePicker,accountReader:options.accountReader,now:()=>x.time||TIME});
 const input={article_id:'mock-article-'+(++serial),platform:p,target_account:accounts[p],browser_session:'mock-browser',executor_id:'mock-executor',word_sha256:HASH,word_size:123,baseline,ui,owned_new_draft:true,picker_mode:'native',upload_method:'coordinate',...options.input};
 const s=runtime.createSession(input);
 const file={filename:'article.docx',absolute_path:'/mock/article.docx',browser_session:'mock-browser',sha256:HASH,size:123,visible_in_browser:false,visibility_unproven:true,checked_at:TIME,
  handoff:{kind:'same_browser_download',download_path:'/mock/downloads/uuid',download_browser_session:'mock-browser',executor_id:'mock-executor',source_sha256:HASH,source_size:123,verified_in_cua:true,copied_in_same_executor:true}};
 const attempt=state=>({article_id:s.article_id,platform:p,target_account:accounts[p],word_sha256:HASH,word_size:123,attempt_id:'mock-attempt',state:state||'reserved',editor_urls:[],consumed_at:state?TIME:null,authorization_kind:'new_import'});
 Object.assign(x,{runtime,s,input,file,attempt,nativeFilePicker});return x;
}
const fields=['article_id','platform','target_account','browser_session','executor_id','tab_id','editor_url','purpose'];
const pending=(c,handle)=>({status:'native_pending',runtimeVersion:c.runtimeVersion,request_id:c.request_id,request_version:c.request_version,method:c.method,
 ...Object.fromEntries(fields.map(k=>[k,c[k]])),window_handle:handle,actions_settled:true,observed_at:TIME,checked_at:TIME});
const receipt=(request)=>({runtimeVersion:request.runtimeVersion,request_id:request.request_id,request_version:request.request_version,method:request.method,
 actions_settled:true,observed_at:request.observed_at,receipt:{...Object.fromEntries(fields.map(k=>[k,request[k]])),window_handle:request.window_handle,checked_at:request.observed_at,
 ...(request.method==='submit'?{submitted:true,window_closed:true,window_count:0}:{ready:true,window_count:1,files_selected:false,submitted:false})}});
const preflight=x=>x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'mock-history'}});
async function consumed(x){assert.equal((await preflight(x)).operation,'reserve_article_upload');assert.equal((await x.runtime.acceptReserve(x.s,{reserved:true,attempt:x.attempt()})).operation,'consume_article_upload');assert.equal((await x.runtime.acceptConsume(x.s,{execute_import:true,attempt:x.attempt('outcome_unknown')})).operation,x.s.platform==='zhihu'?'record_article_delivery':'record_article_status');}
const submit=x=>{x.savingAcknowledged=true;return x.runtime.submitAfterSaving(x.s,{state:x.s.platform==='zhihu'?'saving':'toutiao_saving'});};
const resume=(x,r)=>x.runtime.resumeNative(x.s,receipt(r.request));
async function siblingBlocked(x){const sibling=x.runtime.createSession({...x.input,article_id:'sibling-'+(++serial)});assert.equal((await x.runtime.preflight(sibling,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'mock'}})).status,'blocked');}
async function check(name,fn){await fn();cases++;console.log('PASS',name);}
await check('prepare pending ends its call before reserve and exact resume never reopens',async()=>{
 const x=setup('zhihu',{prepare:(c,r)=>pending(c,r.window_handle)}),r=await preflight(x);assert.equal(r.status,'native_pending');assert.equal(r.request.method,'prepare');assert.equal(x.s.phase,'preflight');assert.equal(x.s.pending,undefined);assert.equal(x.submits,0);
 assert.equal((await resume(x,r)).operation,'reserve_article_upload');assert.deepEqual(x.calls.map(([m])=>m),['prepare']);assert.equal((await resume(x,r)).status,'blocked');assert.equal(x.s.phase,'reserve');
 assert.equal((await x.runtime.acceptReserve(x.s,{attempt:x.attempt()})).operation,'consume_article_upload');
});
await check('wrong id/version/runtime/scope/handle/semantic evidence preserves pending and owner',async()=>{
 const x=setup('zhihu',{prepare:(c,r)=>pending(c,r.window_handle)}),r=await preflight(x),good=receipt(r.request),before=JSON.stringify(x.runtime.checkpoint(x.s));
 const changes=[e=>e.request_id='old',e=>e.request_version++,e=>e.runtimeVersion='old-runtime',e=>e.method='submit',e=>e.actions_settled=false,e=>e.receipt.article_id='foreign',e=>e.receipt.browser_session='foreign',e=>e.receipt.window_handle='foreign',e=>e.receipt.ready=false,e=>e.receipt.files_selected=true,e=>e.receipt.submitted=true,e=>e.receipt.extra='not-accepted',e=>e.receipt.checked_at='2026-10-10T14:00:01.000Z',e=>e.observed_at='2026-10-10T14:00:01.000Z'];
 for(const change of changes){const bad=structuredClone(good);change(bad);assert.equal((await x.runtime.resumeNative(x.s,bad)).status,'blocked');assert.equal(JSON.stringify(x.runtime.checkpoint(x.s)),before);}
 await siblingBlocked(x);assert.equal((await resume(x,r)).operation,'reserve_article_upload');assert.equal(x.calls.length,1);
});
await check('ordinary public entry points cannot change a pending session',async()=>{
 const x=setup('zhihu',{prepare:(c,r)=>pending(c,r.window_handle)}),r=await preflight(x),before=JSON.stringify(x.runtime.checkpoint(x.s));
 for(const method of ['preflight','acceptReserve','acceptConsume','submitAfterSaving','observe','acceptObserved','bindRecovery','reconcileExisting','recoverBrowser','repairParagraph','repairMissingImage','setZhihuCover','loadImages','verify','acceptVerified','acceptCompleted']){
  assert.equal((await x.runtime[method](x.s,{})).status,'blocked',method);assert.equal(JSON.stringify(x.runtime.checkpoint(x.s)),before,method);
 }
 assert.equal((await resume(x,r)).operation,'reserve_article_upload');
});
await check('stale observation is refused; newer actual same-window observation has matching checked_at',async()=>{
 const x=setup('zhihu',{prepare:(c,r)=>pending(c,r.window_handle)}),r=await preflight(x);x.time='2026-10-10T14:01:01.000Z';
 assert.equal((await resume(x,r)).status,'blocked');const refreshed=receipt(r.request);refreshed.receipt.checked_at=x.time;assert.equal((await x.runtime.resumeNative(x.s,refreshed)).status,'blocked');await siblingBlocked(x);refreshed.observed_at=x.time;assert.equal((await x.runtime.resumeNative(x.s,refreshed)).operation,'reserve_article_upload');assert.equal(x.calls.length,1);
});
await check('future and pre-operation pending timestamps or unsettled actions cannot yield continuation',async()=>{
 for(const patch of [{observed_at:'2026-10-10T14:00:01.000Z',checked_at:'2026-10-10T14:00:01.000Z'},{observed_at:'2026-10-10T13:59:59.000Z',checked_at:'2026-10-10T13:59:59.000Z'},{actions_settled:false},{request_id:'wrong'},{checked_at:'wrong'}]){
  const x=setup('zhihu',{prepare:(c,r)=>({...pending(c,r.window_handle),...patch})});assert.equal((await preflight(x)).status,'blocked');await siblingBlocked(x);assert.equal(x.calls.length,1);
 }
});
await check('prepare resume live account/body/navigation/control mutations never reserve',async()=>{
 const mutations=[x=>x.editor.content.account='wrong',x=>x.editor.content.title='user edit',x=>x.editor.content.rows=bodyRows(),x=>x.editor.content.url=draft('zhihu'),x=>x.s.browser_session='wrong',x=>x.s.chooser_binding.identity={tag:'BUTTON'}];
 for(const mutate of mutations){const x=setup('zhihu',{prepare:(c,r)=>pending(c,r.window_handle)}),r=await preflight(x);mutate(x);assert.equal((await resume(x,r)).status,'blocked');assert.equal(x.s.pending,undefined);assert.equal(x.submits,0);await siblingBlocked(x);assert.equal(x.calls.length,1);}
});
await check('inspect resumes after consumed saving entry without restoring grant or consuming again',async()=>{
 const x=setup('zhihu',{inspect:(c,r)=>pending(c,r.window_handle)});await consumed(x);const r=await submit(x);assert.equal(r.status,'native_pending');assert.equal(r.request.method,'inspect');assert.equal(x.s.grant,false);assert.equal(x.s.pending,null);assert.equal(x.s.phase,'reconcile');
 const before=JSON.stringify(x.runtime.checkpoint(x.s));assert.equal((await submit(x)).status,'blocked');assert.equal((await x.runtime.acceptConsume(x.s,{execute_import:true,attempt:x.attempt('outcome_unknown')})).status,'blocked');assert.equal(JSON.stringify(x.runtime.checkpoint(x.s)),before);assert.equal(x.submits,0);
 assert.equal((await resume(x,r)).operation,'record_article_upload');assert.equal(x.submits,1);assert.equal(x.s.grant,false);assert.deepEqual(x.calls.map(([m])=>m),['prepare','inspect','submit']);assert.equal((await resume(x,r)).status,'blocked');assert.equal(x.submits,1);
});
await check('inspect resumed guard failure retains owner and spent permission',async()=>{
 const x=setup('zhihu',{inspect:(c,r)=>pending(c,r.window_handle)});await consumed(x);const r=await submit(x);x.editor.content.account='other';assert.equal((await resume(x,r)).status,'blocked');assert.equal(x.s.grant,false);assert.equal(x.submits,0);await siblingBlocked(x);assert.equal(x.calls.length,2);
});
await check('submit pending handles normal new private draft URL and cannot Open twice',async()=>{
 const x=setup('zhihu',{submit:(c,x)=>{Object.assign(x.editor.content,{url:draft('zhihu'),title:baseline.title,rows:bodyRows(),saved:true});return pending(c,c.window_handle);}});await consumed(x);const r=await submit(x);assert.equal(r.status,'native_pending');assert.equal(r.request.method,'submit');assert.equal(x.submits,1);assert.equal(x.s.grant,false);assert.equal(x.s.document_imported_this_session,undefined);assert.equal(x.s.submission_returned_at,undefined);
 const wrong=receipt(r.request);wrong.receipt.window_closed=false;assert.equal((await x.runtime.resumeNative(x.s,wrong)).status,'blocked');await siblingBlocked(x);x.time='2026-10-10T14:00:10.000Z';assert.equal((await resume(x,r)).operation,'record_article_upload');assert.equal(x.s.document_imported_this_session,true);assert.equal(x.s.submission_returned_at,TIME);assert.equal((await resume(x,r)).status,'blocked');assert.equal((await submit(x)).status,'blocked');assert.equal(x.submits,1);
});
await check('cancelled pending rejects late callback and retains ownership without GUI closure proof',async()=>{
 const x=setup('zhihu',{prepare:(c,r)=>pending(c,r.window_handle)}),r=await preflight(x);x.runtime.cancel(x.s);assert.equal((await resume(x,r)).status,'blocked');await siblingBlocked(x);assert.equal(x.calls.length,1);assert.equal(x.submits,0);assert.equal(x.s.phase,'cancelled');
});
await check('native input exception is unknown and cannot release owner or repeat input',async()=>{
 const x=setup('zhihu',{submit:()=>{throw Error('native input timeout');}});await consumed(x);assert.equal((await submit(x)).kind,'submission_unknown');assert.equal(x.runtime.diagnostic(x.s).substep,'native_submit');await siblingBlocked(x);assert.equal((await submit(x)).status,'blocked');assert.equal(x.submits,1);
});
await check('checkpoint has no continuation/handle/grant and cannot restore a pending session',async()=>{
 const x=setup('zhihu',{prepare:(c,r)=>pending(c,r.window_handle)}),r=await preflight(x),c=x.runtime.checkpoint(x.s),json=JSON.stringify(c);for(const field of ['grant','request_id','request_version','window_handle','nativeContinuation'])assert.equal(json.includes(field),false,field);
 const restored=x.runtime.createSession({...x.input,checkpoint:c});assert.equal((await x.runtime.resumeNative(restored,receipt(r.request))).status,'blocked');assert.equal(restored.grant,undefined);assert.equal(restored.readonly_fenced,true);assert.equal((await resume(x,r)).operation,'reserve_article_upload');
});
await check('different runtime has different correlation epoch even for matching first scope',async()=>{
 const x=setup('zhihu',{prepare:(c,r)=>pending(c,r.window_handle)}),old=await preflight(x);
 const other=createDraftUploadRuntime({browser:{},nativeFilePicker:x.nativeFilePicker,now:()=>TIME}),s=other.createSession(x.input);const r=await other.preflight(s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'mock'}});
 assert.equal(r.status,'native_pending');assert.notEqual(r.request.request_id,old.request.request_id);assert.equal((await other.resumeNative(s,receipt(old.request))).status,'blocked');assert.equal((await other.resumeNative(s,receipt(r.request))).operation,'reserve_article_upload');
});
await check('cover prepare/inspect/submit each suspends explicitly and resumes once',async()=>{
 const x=setup('zhihu');await consumed(x);assert.equal((await submit(x)).operation,'record_article_upload');await x.runtime.acceptObserved(x.s,{recorded:true});x.s.ui.coverFile.observed_url=draft('zhihu');
 x.options.prepare=(c,r)=>pending(c,r.window_handle);x.options.inspect=(c,r)=>pending(c,r.window_handle);x.options.submit=(c)=>pending(c,c.window_handle);
 const f={absolute_path:'/mock/cover.png',sha256:IMAGE_HASH,size:40,browser_session:'mock-browser',visible_in_browser:true,checked_at:TIME};let r=await x.runtime.setZhihuCover(x.s,{fileEvidence:f});assert.equal(r.request.method,'prepare');assert.equal(x.submits,1);
 r=await resume(x,r);assert.equal(r.request.method,'inspect');assert.equal(x.submits,1);r=await resume(x,r);assert.equal(r.request.method,'submit');assert.equal(x.submits,2);const last=r;assert.equal((await resume(x,r)).status,'cover_requires_inspection');assert.equal((await resume(x,last)).status,'blocked');assert.equal(x.submits,2);
});
const closure=(request,observed_at=TIME,submitted=false)=>({runtimeVersion:request.runtimeVersion,request_id:request.request_id,request_version:request.request_version,method:request.method,actions_settled:true,observed_at,
 receipt:{...Object.fromEntries(fields.map(k=>[k,request[k]])),window_handle:request.window_handle,checked_at:observed_at,window_closed:true,window_count:0,submitted}});
await check('inline final prepare/inspect reject future and pre-operation observations',async()=>{
 for(const checked_at of ['2026-10-10T14:00:01.000Z','2026-10-10T13:59:59.000Z']){
  const x=setup('zhihu',{preparePatch:{checked_at}});assert.equal((await preflight(x)).status,'blocked');assert.equal(x.s.pending,undefined);assert.equal(x.submits,0);
  const y=setup('zhihu',{inspectPatch:{checked_at}});await consumed(y);assert.equal((await submit(y)).status,'blocked');assert.equal(y.submits,0);assert.equal(y.s.grant,false);
 }
});
await check('cancellation requires exact fresh settled closure; wrong closure cannot release owner',async()=>{
 const x=setup('zhihu',{prepare:(c,r)=>pending(c,r.window_handle)}),r=await preflight(x);x.runtime.cancel(x.s);const good=closure(r.request),before=JSON.stringify(x.runtime.checkpoint(x.s));
 for(const change of [e=>e.request_id='old',e=>e.request_version++,e=>e.runtimeVersion='old',e=>e.actions_settled=false,e=>e.receipt.window_count=1,e=>e.receipt.window_closed=false,e=>e.receipt.window_handle='other',e=>e.receipt.target_account='other',e=>e.observed_at='2026-10-10T14:00:01.000Z']){
  const bad=structuredClone(good);change(bad);assert.equal(x.runtime.settleNative(x.s,bad).status,'blocked');assert.equal(JSON.stringify(x.runtime.checkpoint(x.s)),before);await siblingBlocked(x);
 }
 assert.equal(x.runtime.settleNative(x.s,good).native_outcome,'closed');assert.equal(x.s.grant,false);assert.equal(x.s.phase,'cancelled');assert.equal(x.s.readonly_fenced,true);assert.equal((await resume(x,r)).status,'blocked');assert.equal(x.runtime.settleNative(x.s,good).status,'blocked');
 const sibling=x.runtime.createSession({...x.input,article_id:'after-closed-'+(++serial)});assert.equal((await x.runtime.preflight(sibling,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'mock'}})).status,'native_pending');
});
await check('unknown submitted action accepts actual closed evidence without restoring permission',async()=>{
 const x=setup('zhihu',{submit:(c,x)=>{x.failedContext=c;throw Error('input timeout');}});await consumed(x);assert.equal((await submit(x)).status,'blocked');const e=closure(x.failedContext,TIME,true);assert.equal(x.runtime.settleNative(x.s,e).native_outcome,'closed');assert.equal(x.s.grant,false);assert.equal(x.s.document_imported_this_session,false);assert.equal(x.s.phase,'reconcile');assert.equal((await submit(x)).status,'blocked');assert.equal(x.submits,1);
});
await check('prepare exception without a bound window cannot release owner using a guessed handle',async()=>{
 const x=setup('zhihu',{prepare:(c,r,x)=>{x.failedContext=c;throw Error('prepare timeout');}});assert.equal((await preflight(x)).status,'blocked');assert.equal(x.runtime.diagnostic(x.s).substep,'native_prepare');const e=closure({...x.failedContext,window_handle:'guessed'});assert.equal(x.runtime.settleNative(x.s,e).status,'blocked');await siblingBlocked(x);assert.equal(x.submits,0);assert.equal(x.calls.length,1);
 e.receipt.window_handle=null;assert.equal(x.runtime.settleNative(x.s,e).status,'blocked');e.receipt.all_open_file_windows=1;assert.equal(x.runtime.settleNative(x.s,e).status,'blocked');e.receipt.all_open_file_windows=0;assert.equal(x.runtime.settleNative(x.s,e).native_outcome,'closed');assert.equal(x.s.grant,false);assert.equal(x.s.document_imported_this_session,false);
});
await check('caller runtimeVersion override cannot change operation version',async()=>{
 let actual;const runtime=createDraftUploadRuntime({browser:{},runtimeVersion:'forged-version',now:()=>TIME,nativeFilePicker:{coordinate_contract:'screenshot-single-click-open-v1',prepare:async c=>{actual=c;throw Error('no real GUI');},inspect:async()=>{},submit:async()=>{}}});
 const x=setup();const s=runtime.createSession(x.input);assert.equal((await runtime.preflight(s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'mock'}})).status,'blocked');assert.equal(actual.runtimeVersion,'2026-10-10-platform-methods-5');
});
await check('draft list changes during prepare observation cannot reserve',async()=>{
 const x=setup('zhihu',{prepare:(c,r)=>pending(c,r.window_handle)}),r=await preflight(x);x.list.content.list=[{title:baseline.title,url:draft('zhihu')}];assert.equal((await resume(x,r)).kind,'duplicate_draft');assert.equal(x.s.pending,undefined);assert.equal(x.submits,0);await siblingBlocked(x);
});
await check('in-flight cancellation never releases owner until actual action return and closed evidence',async()=>{
 let resolveAction,started;const inFlight=new Promise(resolve=>{started=resolve;});
 const x=setup('zhihu',{prepare:(c,r,x)=>{x.failedContext=c;started();return new Promise(resolve=>{resolveAction=()=>resolve(pending(c,r.window_handle));});}}),work=preflight(x);await inFlight;x.runtime.cancel(x.s);
 assert.equal(x.runtime.settleNative(x.s,closure({...x.failedContext,window_handle:x.handle})).status,'blocked');await siblingBlocked(x);resolveAction();assert.equal((await work).status,'blocked');await siblingBlocked(x);
 assert.equal(x.runtime.settleNative(x.s,closure({...x.failedContext,window_handle:x.handle})).native_outcome,'closed');assert.equal(x.s.phase,'cancelled');assert.equal(x.s.grant,false);assert.equal(x.submits,0);assert.equal(x.calls.length,1);
});
await check('ready native chooser cancellation/false consume/nonreserved result need actual closure before release',async()=>{
 for(const branch of ['cancel','false_consume','nonreserved']){
  const x=setup();await preflight(x);const context=x.calls[0][1];
  if(branch==='cancel')x.runtime.cancel(x.s);
  else if(branch==='nonreserved')assert.equal((await x.runtime.acceptReserve(x.s,{attempt:x.attempt('outcome_unknown')})).status,'reconcile_only');
  else{await x.runtime.acceptReserve(x.s,{attempt:x.attempt()});assert.equal((await x.runtime.acceptConsume(x.s,{execute_import:false,attempt:x.attempt('outcome_unknown')})).status,'reconcile_only');}
  await siblingBlocked(x);assert.equal(x.calls.length,1);assert.equal(x.submits,0);
  assert.equal(x.runtime.settleNative(x.s,closure({...context,window_handle:x.handle})).native_outcome,'closed');assert.equal(x.s.grant,false);assert.equal(x.s.readonly_fenced,true);
  const sibling=x.runtime.createSession({...x.input,article_id:'fresh-after-close-'+(++serial)});assert.equal((await x.runtime.preflight(sibling,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'mock'}})).operation,'reserve_article_upload');assert.equal(x.submits,0);
 }
});
console.log(`PASS explicit native continuation: ${cases} cases; offline mocks; real browser/native/platform submissions = 0`);
