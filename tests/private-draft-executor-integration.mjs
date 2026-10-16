// Offline integration: actual site functions, migrations, SQLite, OOXML/PNG
// validation and authenticated bridge/tool-host. Browser and native windows are
// deliberately synthetic fixtures; this is not a CUA or platform upload test.
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const temporary = new URL(`./.private-draft-executor-integration-${process.pid}.mjs`, import.meta.url);
const guardsHarness = fs.readFileSync(new URL('./upload-attempt-guards.mjs', import.meta.url), 'utf8');
const boundary = guardsHarness.indexOf('let cases = 0, failures = 0;');
if (boundary < 0) throw Error('Actual SQLite/Word harness boundary changed');
const harness = guardsHarness.slice(0, boundary);
const integration = String.raw`
const {createPrivateDraftExecutor} = await import('../scripts/browser-upload/private-draft-executor.mjs');
const {createArticleUploadBridge} = await import('../scripts/browser-upload/bridge.mjs');
const {createArticleUploadHost,createUploadToolCall} = await import('../scripts/browser-upload/tool-host.mjs');
const scopeKeys = ['article_id','platform','target_account','browser_session','executor_id','tab_id','editor_url','purpose'];
const blank = p => p === 'toutiao' ? 'https://mp.toutiao.com/profile_v4/graphic/publish' : 'https://zhuanlan.zhihu.com/write';
const draft = p => p === 'toutiao' ? 'https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=777001' : 'https://zhuanlan.zhihu.com/p/777001/edit';
const observedImage = i => 'https://synthetic.invalid/validated-image-' + i + '.png';
const coverUrl = 'https://synthetic.invalid/validated-cover.png';
const locatorBinding = (p,css) => ({css,identity:{tag:'INPUT',type:'file'},observed_url:blank(p),observed_at:instant()});
let serial = 0, cases = 0, syntheticSetFiles = 0, syntheticNativeOpen = 0;
const frozenFields = ['source_key','result_key','result_meta','paragraphs','artifact_manifest','upload_guard_version'];
const frozenArticle = f => Object.fromEntries(frozenFields.map(key => [key,sql.prepare('SELECT * FROM articles WHERE id=?').get(f.id)[key]]));
const runtimeScope = c => Object.fromEntries(scopeKeys.map(key => [key,c[key]]));
const inspectedBindings = () => imagePlan.map((image,index) => ({observed_url:observedImage(index),reference_sha256:image.sha256,checked_at:instant(),inspected:true,reference_width:1,reference_height:1}));
const coverInspection = () => ({observed_url:coverUrl,reference_sha256:imagePlan[0].sha256,checked_at:instant(),inspected:true});
function bodyRows(f) {
 const picture = (image,index) => ({kind:'image',src:observedImage(index),sha256:image.sha256,loaded:true});
 const rows = imagePlan.flatMap((image,index) => image.after_paragraph === 0 ? [picture(image,index)] : []);
 f.paragraphs.forEach((text,index) => {
  rows.push({kind:'paragraph',text});
  rows.push(...imagePlan.flatMap((image,i) => image.after_paragraph === index+1 ? [picture(image,i)] : []));
 });
 return rows;
}
function domNode(row) {
 if (row.kind === 'image') return {nodeType:1,tagName:'IMG',currentSrc:row.src,src:row.src,complete:row.loaded,naturalWidth:row.loaded?1:0,naturalHeight:row.loaded?1:0,matches:q=>q==='img',getAttribute:()=>null};
 return {nodeType:1,tagName:'P',textContent:row.text,parentElement:{tagName:'DIV'},childNodes:[{nodeType:3,textContent:row.text}],children:[],matches:q=>q.split(',').includes('p'),getAttribute:()=>null};
}
async function setup(f,p,options={}) {
 const actor={pending:0,stopped:false,settled:false};
 const awaited = async action => {actor.pending++;actor.settled=false;try{return await action();}finally{actor.pending--;}};
 const calls=[],nativeCalls=[],reopened=[],emitted=[];
 const target = guards.authorizedUploadAccounts[p];
 const file = {filename:'final-'+f.id+'.docx',absolute_path:'/synthetic/'+f.id+'/final-'+f.id+'.docx',browser_session:'synthetic-browser-'+f.id,sha256:f.hash,size:f.bytes.length,visible_in_browser:false,visibility_unproven:true,checked_at:instant(),handoff:{kind:'same_browser_download',download_path:'/synthetic/'+f.id+'/actual-download-event',download_browser_session:'synthetic-browser-'+f.id,executor_id:'synthetic-executor-'+f.id,source_sha256:f.hash,source_size:f.bytes.length,verified_in_cua:true,copied_in_same_executor:true}};
 function tab(content={}) {
  const t={id:'synthetic-tab-'+(++serial),content:{url:blank(p),account:target,title:'',rows:[],saved:false,list:[],...content},log:[],submissions:0};
  t.url=async()=>t.content.url;
  t.goto=async url=>awaited(async()=>{t.content.url=url;t.log.push(['goto',url]);});
  t.close=async()=>awaited(async()=>{t.log.push(['close']);});
  t.playwright={domSnapshot:async()=>t.content.blocker||'synthetic private draft editor',locator:key=>({
   count:async()=>1,isVisible:async()=>key==='saved'?t.content.saved:true,isEnabled:async()=>true,
   innerText:async()=>key==='account'?t.content.account:key==='saved'?'草稿已保存':'',getAttribute:async()=>null,
   evaluate:async(fn,arg)=>{
    if(key==='title')return fn({value:t.content.title});
    if(key==='body')return fn({nodeType:1,tagName:'DIV',matches:()=>false,children:t.content.rows.map(domNode),childNodes:t.content.rows.map(domNode),querySelectorAll:()=>[]},arg);
    if(key==='list')return fn({querySelectorAll:()=>t.content.list.map(row=>({textContent:row.title,href:row.url}))});
    if(key==='cover')return fn({src:coverUrl,currentSrc:coverUrl,complete:t.content.coverLoaded!==false,naturalWidth:t.content.coverLoaded===false?0:1});
    return fn({tagName:'INPUT',getAttribute:name=>name==='type'?'file':null});
   },
   click:async()=>awaited(async()=>{t.log.push(['click',key]);}),
   press:async key=>awaited(async()=>{t.log.push(['press',key]);}),
  }),waitForEvent:async event=>awaited(async()=>{
   assert.equal(p,'toutiao','Zhihu coordinate route cannot wait for browser filechooser');
   t.log.push(['wait',event]);assert.equal(event,'filechooser');
   return {setFiles:async path=>awaited(async()=>{
    assert.equal(path,file.absolute_path);assert.equal(t.submissions,0);
    t.log.push(['setFiles',path]);t.submissions++;syntheticSetFiles++;
    Object.assign(t.content,{url:draft(p),title:f.title,rows:bodyRows(f),saved:true});
    if(options.submitUnknown)throw Error('Synthetic post-import transport response unknown');
   })};
  })};
  return t;
 }
 const editorTab=tab(),listTab=tab();
 let windowHandle=null,windowOpen=false;
 const nativeFilePicker={coordinate_contract:'screenshot-single-click-open-v1',
  prepare:async context=>awaited(async()=>{
   nativeCalls.push(['prepare',context]);assert.equal(context.file,undefined);
   assert.equal(context.coordinate_actions.confirmation,'single_click_open');
   assert.equal(context.coordinate_actions.settle_after_each_action,true);
   assert.equal(context.coordinate_actions.relocate_on_window_change,true);
   assert.deepEqual(context.coordinate_actions.document_stages.map(step=>step.stage),['menu','dialog','file']);
   windowHandle='synthetic-window-'+(++serial);windowOpen=true;
   return {...runtimeScope(context),ready:true,window_count:1,window_handle:windowHandle,checked_at:instant(),files_selected:false,submitted:false};
  }),
  inspect:async context=>awaited(async()=>{
   nativeCalls.push(['inspect',context]);assert.equal(context.window_handle,windowHandle);assert.equal(windowOpen,true);
   return {...runtimeScope(context),ready:true,window_count:1,window_handle:windowHandle,checked_at:instant(),files_selected:false,submitted:false};
  }),
  submit:async context=>awaited(async()=>{
   nativeCalls.push(['submit',context]);assert.equal(context.window_handle,windowHandle);assert.equal(windowOpen,true);
   assert.equal(context.file.sha256,f.hash);assert.equal(context.file.size,f.bytes.length);assert.equal(context.file.absolute_path,file.absolute_path);
   assert.equal(editorTab.submissions,0);editorTab.submissions++;syntheticNativeOpen++;windowOpen=false;
   Object.assign(editorTab.content,{url:draft(p),title:f.title,rows:bodyRows(f),saved:true});
   if(options.submitUnknown)throw Error('Synthetic native Open response unknown');
  }),
 };
 const browser={tabs:{new:async()=>awaited(async()=>{
  const other=tab(structuredClone(editorTab.content));other.content.url=draft(p);
  if(options.corruptReopen)options.corruptReopen(other);reopened.push(other);return other;
 })}};
 const ui={account:locatorBinding(p,'account'),title:locatorBinding(p,'title'),body:{...locatorBinding(p,'body'),image_css:'img'},draftList:locatorBinding(p,'list'),importFile:locatorBinding(p,'file'),saved:{...locatorBinding(p,'saved'),allowed_texts:['草稿已保存']},coverImage:locatorBinding(p,'cover')};
 if(p==='zhihu')ui.importStages=['menu','dialog','file'].map(stage=>({stage,browser_session:file.browser_session,tab_id:editorTab.id,binding:{...locatorBinding(p,stage),...(stage==='file'?{name:'点击选择本地文档或拖动文件到窗口上传'}:{})}}));
 const baseline={title:f.title,paragraphs:f.paragraphs,images:imagePlan.map(image=>({sha256:image.sha256,after_paragraph:image.after_paragraph}))};
 const input={article_id:f.id,platform:p,target_account:target,word_sha256:f.hash,word_size:f.bytes.length,browser_session:file.browser_session,executor_id:file.handoff.executor_id,baseline,ui,owned_new_draft:true};
 const runtime=createPrivateDraftExecutor({browser:options.noBrowser?undefined:browser,nativeFilePicker:options.noNative?undefined:nativeFilePicker,now:instant});
 const session=runtime.createSession(input);
 let claim=f.claim;
 if(p==='zhihu'){
  const result=await call(f,'claim_article_delivery',{platform:p});assert.equal(result.claimed,true);claim=result.delivery_token;
 }
 const operationNames=['reserve_article_upload','consume_article_upload','record_article_upload','record_article_status','record_article_delivery','read_article_upload','record_article_upload_executor_end','finish_article_upload_execution'];
 const officialCall=createUploadToolCall(Object.fromEntries(operationNames.map(operation=>[operation,async args=>{
  calls.push(operation);
  return {structuredContent:await tools.articleCall(f.owner,operation,args),isError:false};
 }])));
 const bridge=createArticleUploadBridge({approvedScope:{article_id:f.id,platforms:[p],file_handoff:{[p]:file}},currentClaim:async platform=>{assert.equal(platform,p);return claim;},executionStopped:platform=>platform===p&&actor.stopped&&actor.settled&&actor.pending===0&&session.cancelled&&!windowOpen,call:officialCall});
 const host=createArticleUploadHost({bridge,emit:receipt=>{emitted.push(receipt);}});
 async function exchange(request,accept) {
  const operationId=crypto.randomUUID(),receipt=await host.execute(operationId,request);
  assert.equal(receipt.source,'actual_authenticated_bridge_response',JSON.stringify(receipt));
  return accept?host.deliver(operationId,accept):receipt.result;
 }
 async function stopAndSettle() {
  runtime.cancel(session);actor.stopped=true;
  // Every fixture action above is awaited; no background action, timer or promise
  // is left running. This models actual settled actions, not a constant callback.
  assert.equal(actor.pending,0);assert.equal(windowOpen,false);
  await Promise.resolve();actor.settled=true;
 }
 async function closeNativeFixture() {
  const context=nativeCalls.at(-1)?.[1];
  assert.equal(windowOpen,true);assert.ok(context);
  return awaited(async()=>{
   windowOpen=false;
   return {runtimeVersion:context.runtimeVersion,request_id:context.request_id,request_version:context.request_version,method:context.method,actions_settled:true,observed_at:instant(),receipt:{...runtimeScope(context),window_handle:windowHandle,checked_at:instant(),window_closed:true,window_count:0,submitted:false}};
  });
 }
 return {f,p,target,file,baseline,input,runtime,session,editorTab,listTab,browser,nativeFilePicker,nativeCalls,reopened,calls,emitted,host,bridge,exchange,actor,stopAndSettle,closeNativeFixture};
}
const preflight = x => x.runtime.preflight(x.session,{editorTab:x.editorTab,listTab:x.listTab,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'synthetic fresh SQLite article without prior imports'}});
const readonlyRequest = x => ({status:'bridge_required',operation:'read_article_upload',args:{article_id:x.f.id,platform:x.p}});
const finishRequest = x => ({status:'bridge_required',operation:'finish_article_upload_execution',args:{article_id:x.f.id,platform:x.p,executor_stopped:true}});
const verification = x => ({inspectedBindings:inspectedBindings(),...(x.p==='zhihu'?{coverInspection:coverInspection()}:{})});
const refuse = result => {assert.equal(result.status,'blocked',JSON.stringify(result));assert.equal(result.operation,undefined);};
async function permission(x) {
 let request=await preflight(x);assert.equal(request.operation,'reserve_article_upload');
 assert.equal(x.editorTab.submissions,0);
 assert.equal(request.args.preflight.file.visible_in_browser,false);
 assert.equal(request.args.preflight.file.handoff.chooser_prepared,true);
 request=await x.exchange(request,response=>x.runtime.acceptReserve(x.session,response));
 assert.equal(request.operation,'consume_article_upload');
 request=await x.exchange(request,response=>x.runtime.acceptConsume(x.session,response));
 assert.equal(request.operation,x.p==='toutiao'?'record_article_status':'record_article_delivery');
 assert.equal(x.editorTab.submissions,0);return request;
}
async function imported(x) {
 const request=await permission(x);
 const observed=await x.exchange(request,response=>x.runtime.submitAfterSaving(x.session,response));
 assert.equal(observed.operation,'record_article_upload',JSON.stringify(observed));
 assert.equal(x.editorTab.submissions,1);
 assert.equal((await x.exchange(observed,response=>x.runtime.acceptObserved(x.session,response))).status,'inspect');
}
async function checked(name,run) {await run();cases++;console.log('PASS '+name);}

await checked('actual site Word/PNG manifest flows through both default private routes and independent reopened content verification',async()=>{
 const f=await fixture('compact-real-site-two-platforms'),frozen=frozenArticle(f);
 const initial=await call(f,'read_article_manifest');
 assert.equal(initial.word.sha256,f.hash);assert.equal(initial.word.size,f.bytes.length);
 assert.equal(initial.manifest.layout.images.length,imagePlan.length);
 const toutiao=await setup(f,'toutiao');await imported(toutiao);
 assert.deepEqual(toutiao.editorTab.log.filter(([action])=>['wait','click','setFiles'].includes(action)).map(([action,key])=>[action,key]),[['wait','filechooser'],['click','file'],['setFiles',toutiao.file.absolute_path]]);
 assert.equal(toutiao.nativeCalls.length,0);
 let verified=await toutiao.runtime.verify(toutiao.session,verification(toutiao));
 assert.equal(verified.args.state,'verified');assert.equal(verified.args.readback.independently_reopened,true);
 assert.deepEqual(verified.args.readback.paragraphs,f.paragraphs);
 assert.deepEqual(verified.args.readback.images.map(image=>image.after_paragraph),[0,2]);
 let completed=await toutiao.exchange(verified,response=>toutiao.runtime.acceptVerified(toutiao.session,response));
 assert.equal(completed.operation,'record_article_status');
 assert.equal((await toutiao.exchange(completed,response=>toutiao.runtime.acceptCompleted(toutiao.session,response))).status,'done');
 await toutiao.stopAndSettle();assert.equal(toutiao.reopened.length,1);
 const main=sql.prepare('SELECT * FROM articles WHERE id=?').get(f.id);
 assert.equal(main.state,'completed');assert.equal(main.claim_expires,instant());
 const firstAttempt=JSON.stringify(attemptRow(f));
 const zhihu=await setup(f,'zhihu');await imported(zhihu);
 assert.equal(zhihu.editorTab.log.some(([action])=>['wait','click','setFiles'].includes(action)),false);
 assert.deepEqual(zhihu.nativeCalls.map(([method])=>method),['prepare','inspect','submit']);
 verified=await zhihu.runtime.verify(zhihu.session,verification(zhihu));assert.equal(verified.args.state,'verified');
 assert.equal(verified.args.readback.cover.reference_sha256,imagePlan[0].sha256);
 completed=await zhihu.exchange(verified,response=>zhihu.runtime.acceptVerified(zhihu.session,response));
 assert.equal(completed.operation,'record_article_delivery');
 assert.equal((await zhihu.exchange(completed,response=>zhihu.runtime.acceptCompleted(zhihu.session,response))).status,'done');
 await zhihu.stopAndSettle();assert.equal(zhihu.reopened.length,1);
 const delivery=sql.prepare("SELECT * FROM article_deliveries WHERE article_id=? AND platform='zhihu'").get(f.id);
 assert.equal(delivery.state,'saved');assert.equal(delivery.claim_expires,instant());
 assert.equal(JSON.stringify(attemptRow(f)),firstAttempt,'Zhihu must not edit Toutiao attempt');
 assert.equal(attemptRow(f,'zhihu').state,'verified');assert.equal(attemptRow(f).state,'verified');
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM article_upload_attempts WHERE article_id=?').get(f.id).n,2);
 assert.equal(toutiao.editorTab.submissions,1);assert.equal(zhihu.editorTab.submissions,1);
 assert.deepEqual(frozenArticle(f),frozen);assert.equal(digest(objects.get(frozen.result_key)),f.hash);
 const final=await call(f,'read_article_manifest');
 assert.equal(final.destinations.find(d=>d.platform==='toutiao').state,'completed');
 assert.equal(final.destinations.find(d=>d.platform==='zhihu').state,'saved');
 // Successful status writes settle their own lease at now. finish is only for
 // a still-live interrupted execution; calling it here would invent a release.
 await assert.rejects(toutiao.bridge(finishRequest(toutiao)));
 await assert.rejects(zhihu.bridge(finishRequest(zhihu)));
});

await checked('lost actual consume receipt is read-only, spends one permit and settles a real executor-end/finish release without import',async()=>{
 for(const p of ['toutiao','zhihu']) {
  const f=await fixture('compact-lost-consume-'+p),x=await setup(f,p),frozen=frozenArticle(f);
  const otherLease=()=>p==='zhihu'?sql.prepare('SELECT state,claim_token,claim_expires FROM articles WHERE id=?').get(f.id):sql.prepare("SELECT state,claim_token,claim_expires FROM article_deliveries WHERE article_id=? AND platform='zhihu'").get(f.id);
  const otherBefore=otherLease();
  const reserveRequest=await preflight(x);
  const consumeRequest=await x.exchange(reserveRequest,response=>x.runtime.acceptReserve(x.session,response));
  const operationId=crypto.randomUUID(),receipt=await x.host.execute(operationId,consumeRequest);
  assert.equal(receipt.result.execute_import,true);assert.equal(attemptRow(f,p).state,'outcome_unknown');
  const unknown=await x.host.deliver(operationId,async()=>{throw Error('Synthetic receiving-host response rejected after actual consume');});
  assert.equal(unknown.status,'receipt_delivery_unknown');assert.equal(unknown.automatic_retry_allowed,false);
  await assert.rejects(x.host.deliver(operationId,response=>x.runtime.acceptConsume(x.session,response)));
  assert.deepEqual(await x.host.execute(operationId,consumeRequest),receipt);
  assert.equal(x.calls.filter(op=>op==='consume_article_upload').length,1);
  refuse(await x.runtime.submitAfterSaving(x.session,{state:p==='toutiao'?'toutiao_saving':'saving'}));
  assert.equal(x.editorTab.submissions,0);
  const read=await x.exchange(readonlyRequest(x));assert.equal(read.attempt.state,'outcome_unknown');
  await assert.rejects(x.bridge(finishRequest(x)),{status:'execution_not_stopped'});
  assert.equal(x.calls.includes('finish_article_upload_execution'),false);
  // Cancel the prepared native fixture by an awaited fixture close observation.
  x.runtime.cancel(x.session);
  if(p==='zhihu')assert.equal(x.runtime.settleNative(x.session,await x.closeNativeFixture()).native_outcome,'closed');
  await x.stopAndSettle();
  const attempt=attemptRow(f,p);
  await x.exchange({status:'bridge_required',operation:'record_article_upload_executor_end',args:{article_id:f.id,platform:p,attempt_id:attempt.id,target_account:x.target,word_sha256:f.hash,word_size:f.bytes.length,expected_attempt_revision:attempt.revision,prior_draft_identity:'unknown_without_editor_url',prior_executor_stopped:true,prior_executor_end_reference:'synthetic-executor-cancelled-settled-'+f.id}});
  const history=JSON.stringify(attemptRow(f,p));
  const released=await x.exchange(finishRequest(x));assert.equal(released.released,true);assert.equal(released.new_upload_allowed,false);assert.equal(released.history_preserved,true);
  const lease=p==='toutiao'?sql.prepare('SELECT claim_token,claim_expires FROM articles WHERE id=?').get(f.id):sql.prepare("SELECT claim_token,claim_expires FROM article_deliveries WHERE article_id=? AND platform='zhihu'").get(f.id);
  assert.equal(lease.claim_token,null);assert.equal(lease.claim_expires,null);
  assert.deepEqual(otherLease(),otherBefore,'Finishing one platform must retain the other platform lease');
  assert.equal(JSON.stringify(attemptRow(f,p)),history);assert.deepEqual(frozenArticle(f),frozen);
  assert.equal((await x.exchange(readonlyRequest(x))).attempt.state,'outcome_unknown');
  await assert.rejects(x.bridge(consumeRequest));assert.equal(x.editorTab.submissions,0);
 }
});

await checked('missing supported host prevents reservation or consume and any simulated file submission',async()=>{
 for(const p of ['toutiao','zhihu']) {
  const f=await fixture('compact-no-host-'+p),x=await setup(f,p,{noNative:p==='zhihu'});
  if(p==='toutiao')delete x.editorTab.playwright.waitForEvent;
  refuse(await preflight(x));assert.equal(x.calls.length,0);assert.equal(attemptRow(f,p),undefined);
  assert.equal(x.editorTab.submissions,0);assert.equal(x.nativeCalls.length,0);
 }
});

await checked('cross-platform method, bridge and consume scope never spend the wrong destination permission',async()=>{
 const f=await fixture('compact-cross-platform'),x=await setup(f,'toutiao'),request=await preflight(x);
 assert.throws(()=>x.runtime.createSession({...x.input,platform:'zhihu',target_account:guards.authorizedUploadAccounts.zhihu,upload_method:'codex',picker_mode:'browser'}));
 await assert.rejects(x.bridge({...request,picker_mode:'native',upload_method:'coordinate'}));
 await assert.rejects(x.bridge({...request,args:{...request.args,platform:'zhihu',target_account:guards.authorizedUploadAccounts.zhihu}}));
 assert.equal(x.calls.length,0);assert.equal(attemptRow(f),undefined);
 const consumeRequest=await x.exchange(request,response=>x.runtime.acceptReserve(x.session,response));
 await assert.rejects(x.bridge({...consumeRequest,args:{...consumeRequest.args,platform:'zhihu'}}));
 assert.equal(attemptRow(f).consumed_at,null);assert.equal(attemptRow(f,'zhihu'),undefined);
 assert.equal(x.editorTab.submissions,0);
});

await checked('host-inspected Word and source bindings cannot be swapped and actual stored Word bytes are validated',async()=>{
 const f=await fixture('compact-word-source-identity'),other=await fixture('compact-other-word'),x=await setup(f,'toutiao');
 assert.notEqual(f.hash,other.hash);
 const request=await preflight(x);
 for(const patch of [{sha256:other.hash},{size:f.bytes.length+1},{absolute_path:'/synthetic/other/final.docx'},{handoff:{...request.args.preflight.file.handoff,download_path:'/synthetic/other/download'}}]) {
  await assert.rejects(x.bridge({...request,args:{...request.args,preflight:{...request.args.preflight,file:{...request.args.preflight.file,...patch}}}}));
 }
 assert.equal(x.calls.length,0);assert.equal(attemptRow(f),undefined);
 const frozen=frozenArticle(f),bytes=objects.get(frozen.result_key);objects.set(frozen.result_key,other.bytes);
 await assert.rejects(x.bridge(request));assert.equal(attemptRow(f),undefined);assert.equal(x.editorTab.submissions,0);
 objects.set(frozen.result_key,bytes);
 assert.equal((await x.exchange(request)).reserved,true);assert.deepEqual(frozenArticle(f),frozen);
});

await checked('actual server readback is not marked verified when independent title, image source or layout is incomplete',async()=>{
 const mutations=[tab=>tab.content.title='changed user title',tab=>tab.content.rows[1].text='changed user paragraph',tab=>tab.content.rows[0].src='https://different-source.invalid/uninspected.png',tab=>tab.content.rows=tab.content.rows.filter(row=>row.kind!=='image'),tab=>tab.content.rows.reverse(),tab=>tab.content.saved=false];
 for(const mutate of mutations) {
  const f=await fixture('compact-incomplete-reopen'),x=await setup(f,'toutiao',{corruptReopen:mutate}),frozen=frozenArticle(f);
  await imported(x);const result=await x.runtime.verify(x.session,verification(x));assert.notEqual(result.args?.state,'verified');
  assert.equal(attemptRow(f).state,'draft_observed');assert.equal(sql.prepare('SELECT state FROM articles WHERE id=?').get(f.id).state,'toutiao_saving');
  assert.equal(x.editorTab.submissions,1);assert.deepEqual(frozenArticle(f),frozen);
 }
});

await checked('unknown browser/native submission preserves the actual consumed attempt and cannot replay file import',async()=>{
 for(const p of ['toutiao','zhihu']) {
  const f=await fixture('compact-unknown-submit-'+p),x=await setup(f,p,{submitUnknown:true});
  const saving=await permission(x),result=await x.exchange(saving,response=>x.runtime.submitAfterSaving(x.session,response));
  assert.equal(result.kind,'submission_unknown');assert.equal(x.editorTab.submissions,1);
  assert.equal(attemptRow(f,p).state,'outcome_unknown');
  refuse(await x.runtime.submitAfterSaving(x.session,{state:p==='toutiao'?'toutiao_saving':'saving'}));
  assert.equal((await x.exchange(readonlyRequest(x))).attempt.state,'outcome_unknown');
  assert.equal(x.editorTab.submissions,1);assert.equal(x.calls.filter(op=>op==='consume_article_upload').length,1);
 }
});

await checked('pending import and temporarily empty independent editor reuse the same draft and one existing submission',async()=>{
 const f=await fixture('compact-delayed-readback'),x=await setup(f,'toutiao',{corruptReopen:tab=>{tab.content.rows=[];}});
 await imported(x);const attemptBefore=JSON.stringify(attemptRow(f));
 x.editorTab.content.blocker='文档导入中…';
 assert.equal((await x.runtime.observe(x.session)).status,'import_pending');
 assert.equal(JSON.stringify(attemptRow(f)),attemptBefore);x.editorTab.content.blocker='';
 const pending=await x.runtime.verify(x.session,verification(x));assert.equal(pending.status,'waiting');assert.equal(pending.kind,'import_pending');
 assert.equal(x.reopened.length,1);assert.equal(x.editorTab.submissions,1);assert.equal(JSON.stringify(attemptRow(f)),attemptBefore);
 x.reopened[0].content.rows=bodyRows(f);
 const verified=await x.runtime.verify(x.session,verification(x));assert.equal(verified.args.state,'verified');
 const completed=await x.exchange(verified,response=>x.runtime.acceptVerified(x.session,response));
 assert.equal((await x.exchange(completed,response=>x.runtime.acceptCompleted(x.session,response))).status,'done');
 assert.equal(x.reopened.length,1);assert.equal(x.editorTab.submissions,1);assert.equal(attemptRow(f).state,'verified');
});

await checked('actual current handoff retains ready Word and delivers the independent executor through complete-call source guards',async()=>{
 const f=await fixture('compact-current-handoff'),handoff=await call(f,'read_article_handoff');
 assert.equal(handoff.execute_import,false);assert.equal(handoff.word.sha256,f.hash);assert.equal(handoff.word.size,f.bytes.length);
 assert.equal(handoff.destinations.find(d=>d.platform==='toutiao').upload_method,'codex');
 assert.equal(handoff.draft_delivery.methods.zhihu.upload_method,'coordinate');
 assert.equal(handoff.upload_runtime.version,'2026-10-10-private-draft-executor-8');
 assert.equal(handoff.upload_runtime.contract_version,7);
 assert.equal(handoff.upload_runtime.modules.runner.entrypoint,'createPrivateDraftExecutor');
 const budget=handoff.upload_runtime.execution_contract.project_budget;
 assert.equal(budget.max_source_utf8_bytes,61000);
 assert.equal(budget.max_json_quoted_utf8_bytes,62000);
 assert.equal(budget.reserved_call_utf8_bytes,2000);
 for(const module of ['runner','bridge']) {
  const descriptor=handoff.upload_runtime.modules[module];let offset=0,source='';
  do {
   const page=await call(f,'read_article_upload_runtime',{module,expected_version:handoff.upload_runtime.version,expected_sha256:descriptor.sha256,offset});
   assert.equal(page.execute_import,false);assert.equal(page.read_only,true);
   assert.equal(digest(page.source_text),page.chunk_sha256);
   source+=page.source_text;offset=page.next_offset;
  } while(offset!==null);
  assert.equal(digest(source),descriptor.sha256);assert.equal(Buffer.byteLength(source),descriptor.size);
  assert.ok(Buffer.byteLength(source)<=budget.max_source_utf8_bytes);assert.ok(Buffer.byteLength(JSON.stringify(source))<=budget.max_json_quoted_utf8_bytes);
  assert.doesNotMatch(source,/^import |^export /m);
 }
});

assert.equal(networkCalls,0);
console.log(JSON.stringify({offline_integration_cases:cases,actual_site_functions:true,actual_sqlite_and_ooxml:true,synthetic_browser_setFiles_calls:syntheticSetFiles,synthetic_native_Open_calls:syntheticNativeOpen,real_platform_calls:0,real_cua_calls:0,cua_host_acceptance_tested:false,model_calls:0,network_calls:networkCalls,production_db_writes:0}));
`;
try {
  fs.writeFileSync(temporary, harness + '\n' + integration, {flag:'wx'});
  const result=spawnSync(process.execPath,[fileURLToPath(temporary)],{encoding:'utf8',cwd:fileURLToPath(new URL('..',import.meta.url)),maxBuffer:1024*1024});
  process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exitCode=result.status??1;
} finally {
  fs.unlinkSync(temporary);
}
