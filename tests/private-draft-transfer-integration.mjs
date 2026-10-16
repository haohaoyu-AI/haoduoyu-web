// Actual website functions, SQLite and Word validation; synthetic host only.
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const original=fs.readFileSync(new URL('./upload-attempt-guards.mjs',import.meta.url),'utf8');
const boundary=original.indexOf('let cases = 0, failures = 0;');
if(boundary<0)throw Error('Upload integration harness boundary changed');
const temporary=new URL(`./.private-draft-transfer-${process.pid}.mjs`,import.meta.url);
const test=String.raw`
const {createPrivateDraftTransfer}=await import('../scripts/browser-upload/private-draft-transfer.mjs');
const {COMPLETE_CALL_BUDGET}=await import('../scripts/browser-upload/coordinate/src/complete-call-budget.js');
const {unzipSync}=await import('fflate');
let cases=0,submissions=0;
const completionRequests={};
// Check actual published schemas as well as calling production functions. The
// in-memory articleCall dispatcher does not itself enforce MCP input schemas.
function publishedShape(value,schema,path='args'){
 if(schema.type==='object'){
  assert.ok(value&&typeof value==='object'&&!Array.isArray(value),path);
  for(const key of schema.required||[])assert.ok(Object.hasOwn(value,key),path+'.'+key+' required');
  if(schema.additionalProperties===false)for(const key of Object.keys(value))assert.ok(Object.hasOwn(schema.properties||{},key),path+'.'+key+' not published');
  for(const [key,child]of Object.entries(schema.properties||{}))if(Object.hasOwn(value,key))publishedShape(value[key],child,path+'.'+key);
 }else if(schema.type==='array'){
  assert.ok(Array.isArray(value),path);if(schema.items)for(let i=0;i<value.length;i++)publishedShape(value[i],schema.items,path+'['+i+']');
 }
 if(Object.hasOwn(schema,'const'))assert.deepEqual(value,schema.const,path+' const');
 if(schema.enum)assert.ok(schema.enum.includes(value),path+' enum');
}
async function setup(label,options={}){
 const f=await fixture(label),meta=JSON.parse(sql.prepare('SELECT result_meta FROM articles WHERE id=?').get(f.id).result_meta);
 const platform=options.platform||'toutiao',channel=options.channel||'browser_filechooser',native=channel==='native_file_dialog';
 const blank=platform==='toutiao'?'https://mp.toutiao.com/profile_v4/graphic/publish':'https://zhuanlan.zhihu.com/write';
 f.account=guards.authorizedUploadAccounts[platform];
 // Fixture Word construction has finished. Native cases get a fresh parent
 // destination claim only AFTER the real (synthetic here) prepare callback.
 if(native&&platform==='toutiao')sql.prepare('UPDATE articles SET claim_expires=? WHERE id=?').run(instant(),f.id);
 const scope={article_id:f.id,platform,target_account:f.account,browser_session:'synthetic-'+f.id,executor_id:'synthetic-host-'+f.id,tab_id:'synthetic-editor-'+f.id};
 const file={filename:'final.docx',absolute_path:'/synthetic/'+f.id+'/final.docx',browser_session:scope.browser_session,sha256:f.hash,size:f.bytes.length,checked_at:instant(),visible_in_browser:false,visibility_unproven:true,handoff:{kind:'same_browser_download',download_path:'/synthetic/'+f.id+'/download.docx',download_browser_session:scope.browser_session,executor_id:scope.executor_id,source_sha256:f.hash,source_size:f.bytes.length,verified_in_cua:true,copied_in_same_executor:true}};
 const prepared={prepared_id:'synthetic-native-prepare-'+f.id,window_id:'synthetic-native-window-'+f.id,cycle:1};
 // Freeze dimensions from the actual SHA-matched PNG bytes embedded in this
 // synthetic finalized Word, not from a platform observation or a 1x1 default.
 const embedded=Object.entries(unzipSync(f.bytes)).filter(([path])=>/^word\/media\/.+\.png$/.test(path));
 const originalImages=imagePlan.map(image=>{
  const matches=embedded.filter(([,bytes])=>digest(bytes)===image.sha256);assert.equal(matches.length,1);
  const bytes=matches[0][1];load('image-integrity').assertRasterImage(bytes);
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  return {sha256:image.sha256,after_paragraph:image.after_paragraph,natural_width:view.getUint32(16),natural_height:view.getUint32(20)};
 });
 const content={url:blank,title:'',body:{paragraphs:[],images:[],captions:[],unclassified:[]}},calls=[];
 let chooserOpen=false,localCancelled=false,opens=0,writes=0,reopens=0,reopenedAt=null,parentClaimed=!native&&platform==='toutiao';
 const pictures=()=>originalImages.map((image,i)=>({reference_sha256:image.sha256,after_paragraph:image.after_paragraph,observed_url:'https://image.example.com/synthetic-'+i+'.png',natural_width:image.natural_width,natural_height:image.natural_height,display_width:image.natural_width*.5,display_height:image.natural_height*.5,loaded:true,inspected:true,inspected_at:instant()}));
 const importContent=()=>{
  content.url=editor(platform);content.title=options.importedTitle??'';
  content.body={paragraphs:[f.title,...f.paragraphs],images:pictures(),captions:[],unclassified:[]};
  if(platform==='zhihu')content.cover={reference_sha256:imagePlan[0].sha256,observed_url:'https://image.example.com/synthetic-cover.png',loaded:true,inspected:true,inspected_at:instant()};
 };
 const host={
  cancelLocal:context=>{
   localCancelled=true;calls.push('cancelLocal');
   assert.equal(context.import_channel,channel);assert.equal(context.article_id,scope.article_id);
   assert.equal(Object.keys(context).some(k=>/token|credential|password|nonce/.test(k)),false);
   return options.cancelLocal?options.cancelLocal(context):{cancelled:true,open_issued:calls.includes('native.Open'),pending_actions:0};
  },
  inspect:async context=>{
   const observation={...scope,editor_url:content.url,source:'documented_host_observation',checked_at:instant(),account_url:platform==='toutiao'?'https://www.toutiao.com/c/user/'+f.account+'/?enter_from=mp_profile':'https://www.zhihu.com/people/'+f.account,account_menu_observed:true,login_blocked:false,private_draft:true,pending:false,save_failed:false,title:content.title,body:structuredClone(content.body),file:structuredClone(file),...(native?{import_channel:channel,channel,...prepared,native_dialog_owned:chooserOpen,native_dialog_closed:!chooserOpen}:{chooser_owned:chooserOpen}),existing_drafts:{account:f.account,current_editor_url:blank,editor_checked:true,editor_empty:true,private_draft:true,draft_list_checked:true,matching_editor_urls:[],prior_submission:'never_attempted',checked_at:instant(),evidence_reference:'synthetic-never-submitted'},saved_indicator_observed:true,saved_at:instant(),actions_settled:true,chooser_closed:!chooserOpen,title_control:{editor_url:content.url,checked_at:instant(),unique:true,visible:true,enabled:true,tag:'TEXTAREA',label:'文章标题'},...(content.cover?{cover:structuredClone(content.cover)}:{})};
   if(options.inspect)await options.inspect(observation,context);
   return observation;
  },
  preparePicker:async context=>{
   opens++;chooserOpen=true;calls.push(native?'prepareNative':'prepareBrowser');
   assert.equal(context.import_channel,channel);
   const chooser={setFiles:async path=>{
    assert.equal(path,file.absolute_path);submissions++;calls.push('setFiles');chooserOpen=false;
    if(options.setFiles)await options.setFiles();
    importContent();
   }};
   const nativeDialog={ready:true,window_id:prepared.window_id,cycle:prepared.cycle,open:async(path,facts)=>{
    assert.equal(localCancelled,false,'native Open must not be dispatched after local cancellation');
    assert.equal(path,file.absolute_path);assert.equal(facts.import_channel,channel);assert.equal(facts.execute_import,true);assert.equal(facts.delivery_status,'saving');
    assert.equal(facts.attempt_id,attemptRow(f,platform).id);assert.equal(facts.sha256,f.hash);assert.equal(facts.size,f.bytes.length);
    assert.equal(Object.keys(facts).some(k=>/token|credential|password|nonce/.test(k)),false);
    assert.equal(JSON.stringify(facts).includes(f.claim),false);
    submissions++;calls.push('native.Open');chooserOpen=false;
    if(options.nativeOpen)await options.nativeOpen();
    importContent();
    const receipt={...scope,channel,...prepared,submitted:true,observed_at:instant()};
    if(options.nativeReceipt)options.nativeReceipt(receipt);
    return receipt;
   }};
   if(options.prepare)await options.prepare(context);
   return {...scope,editor_url:blank,channel,ready:true,files_selected:false,submitted:false,checked_at:instant(),...(native?{...prepared,nativeDialog}:{chooser})};
  },
  writeTitle:async context=>{writes++;calls.push('writeTitle');assert.equal(context.editor_url,content.url);assert.equal(context.title,f.title);content.title=context.title;if(options.writeTitle)await options.writeTitle(content);},
  reopenAndInspect:async context=>{if(!context.reuse_tab_id){reopens++;calls.push('independentReopen');reopenedAt=instant();}else assert.equal(context.reuse_tab_id,'synthetic-reopened-'+f.id);const value={...await host.inspect({purpose:'reopen'}),tab_id:'synthetic-reopened-'+f.id,reopened_at:reopenedAt};if(options.reopen)await options.reopen(value);return value;},
 };
 const input={scope,word:{output_id:meta.output_id,sha256:f.hash,size:f.bytes.length},baseline:{title:f.title,paragraphs:f.paragraphs,images:originalImages},host,importChannel:channel,now:instant};
 const transfer=createPrivateDraftTransfer(input);
 async function claimParent(){
  if(parentClaimed)return;
  const operation=platform==='toutiao'?'claim_article':'claim_article_delivery';calls.push(operation);
  const response=await call(f,operation,platform==='zhihu'?{platform}:{});assert.equal(response.claimed,true);
  f.claim=platform==='toutiao'?response.claim_token:response.delivery_token;parentClaimed=true;
 }
 async function exchange(request,accept){
  assert.equal(request.status,'tool_required',JSON.stringify(request));
  if(request.operation==='reserve_article_upload')await claimParent();
  calls.push(request.operation);
  const args={...request.args,...(request.operation==='record_article_status'?{claim_token:f.claim}:request.operation==='record_article_delivery'?{delivery_token:f.claim}:{execution_claim:f.claim})};
  const definition=tools.articleTools.find(item=>item.name===request.operation);assert.ok(definition,'published tool '+request.operation);publishedShape(args,definition.inputSchema);
  const response=await call(f,request.operation,args);return accept(response);
 }
 async function ready(){let r=await transfer.prepare();r=await exchange(r,transfer.acceptReserved);r=await exchange(r,transfer.acceptConsumed);r=await exchange(r,transfer.acceptSaving);assert.equal(r.status,'ready_to_submit');return r;}
 async function observed(){await ready();assert.equal((await transfer.submit()).status,'submitted');let r=await transfer.observe();r=await exchange(r,transfer.acceptObserved);assert.equal(r.status,'inspect');return r;}
 return {f,scope,file,content,host,input,transfer,calls,ready,observed,exchange,get opens(){return opens;},get writes(){return writes;},get reopens(){return reopens;},close(){chooserOpen=false;}};
}
async function check(name,work){await work();cases++;console.log('PASS '+name);}
const refused=r=>assert.equal(r.status,'blocked',JSON.stringify(r));
for(const platform of ['toutiao','zhihu'])await check(platform+' real SQLite/Word native chain: prepare before parent claim, consume+saving, one Open, full independent readback and destination completion',async()=>{
 const x=await setup('native-complete-'+platform,{platform,channel:'native_file_dialog'}),frozen=sql.prepare('SELECT result_meta,artifact_manifest,paragraphs FROM articles WHERE id=?').get(x.f.id);
 await x.observed();assert.equal((await x.transfer.fillTitle()).status,'title_exact');
 let request=await x.transfer.verify();assert.equal(request.args.state,'verified');
 if(platform==='zhihu'){assert.equal(request.args.readback.cover.loaded,true);assert.equal(request.args.readback.cover.reference_sha256,imagePlan[0].sha256);}
 request=await x.exchange(request,x.transfer.acceptVerified);
 completionRequests[platform]=structuredClone(request.args);
 assert.equal(request.operation,platform==='toutiao'?'record_article_status':'record_article_delivery');assert.equal(request.args.state,platform==='toutiao'?'completed':'saved');
 assert.equal((await x.exchange(request,x.transfer.acceptCompleted)).status,'done');
 assert.equal(attemptRow(x.f,platform).state,'verified');
 assert.equal(platform==='toutiao'?sql.prepare('SELECT state FROM articles WHERE id=?').get(x.f.id).state:sql.prepare('SELECT state FROM article_deliveries WHERE article_id=? AND platform=?').get(x.f.id,platform).state,platform==='toutiao'?'completed':'saved');
 assert.deepEqual(sql.prepare('SELECT result_meta,artifact_manifest,paragraphs FROM articles WHERE id=?').get(x.f.id),frozen);
 assert.equal(x.calls.filter(c=>c==='native.Open').length,1);assert.equal(x.calls.includes('setFiles'),false);assert.equal(x.reopens,1);
 const claim=platform==='toutiao'?'claim_article':'claim_article_delivery',saving=platform==='toutiao'?'record_article_status':'record_article_delivery';
 assert.ok(x.calls.indexOf('prepareNative')<x.calls.indexOf(claim));assert.ok(x.calls.indexOf(claim)<x.calls.indexOf('reserve_article_upload'));assert.ok(x.calls.indexOf('consume_article_upload')<x.calls.indexOf(saving));assert.ok(x.calls.indexOf(saving)<x.calls.indexOf('native.Open'));assert.ok(x.calls.indexOf('independentReopen')<x.calls.lastIndexOf('record_article_upload'));
});
await check('published MCP shapes reject completion cover and unsupported Toutiao status platform fields',async()=>{
 const delivery=tools.articleTools.find(item=>item.name==='record_article_delivery').inputSchema,status=tools.articleTools.find(item=>item.name==='record_article_status').inputSchema;
 const zhihu={...completionRequests.zhihu,delivery_token:'synthetic-schema-token'},toutiao={...completionRequests.toutiao,claim_token:'synthetic-schema-token'};
 publishedShape(zhihu,delivery);publishedShape(toutiao,status);
 assert.throws(()=>publishedShape({...zhihu,readback:{...zhihu.readback,cover:{loaded:true,reference_sha256:imagePlan[0].sha256,observed_url:'https://image.example.com/synthetic-cover.png'}}},delivery),/cover not published/);
 assert.throws(()=>publishedShape({...toutiao,platform:'toutiao'},status),/platform not published/);
});
await check('native channels cannot replay unknown Open or silently invoke browser setFiles',async()=>{
 for(const platform of ['toutiao','zhihu']){
  const x=await setup('native-unknown-'+platform,{platform,channel:'native_file_dialog',nativeOpen:()=>{throw Error('synthetic lost Open receipt');}});await x.ready();const result=await x.transfer.submit();refused(result);assert.equal(result.phase,'unknown');refused(await x.transfer.submit());assert.equal(x.calls.filter(c=>c==='native.Open').length,1);assert.equal(x.calls.includes('setFiles'),false);assert.equal(attemptRow(x.f,platform).state,'outcome_unknown');
 }
});
await check('native submission strict window/prepared/cycle receipts cannot become a second import',async()=>{
 for(const field of ['window_id','prepared_id','cycle','channel','submitted']){
  const x=await setup('native-receipt-'+field,{channel:'native_file_dialog',nativeReceipt:value=>{value[field]=field==='cycle'?2:field==='submitted'?false:'foreign';}});await x.ready();refused(await x.transfer.submit());refused(await x.transfer.submit());assert.equal(x.calls.filter(c=>c==='native.Open').length,1);assert.equal(x.calls.includes('setFiles'),false);
 }
});
await check('Zhihu completion requires its actual supported URL and independently matched loaded frozen cover',async()=>{
 for(const corrupt of [v=>delete v.cover,v=>v.cover.reference_sha256='0'.repeat(64),v=>v.cover.inspected=false,v=>v.cover.observed_url+='?token=synthetic-private',v=>v.cover.reference_sha256=imagePlan[1].sha256]){
  const x=await setup('zhihu-cover-refused',{platform:'zhihu',channel:'native_file_dialog',reopen:corrupt});await x.observed();await x.transfer.fillTitle();refused(await x.transfer.verify());assert.equal(attemptRow(x.f,'zhihu').state,'draft_observed');assert.equal(x.calls.filter(c=>c==='native.Open').length,1);
 }
 const x=await setup('zhihu-cover-loading',{platform:'zhihu',channel:'native_file_dialog'});await x.observed();await x.transfer.fillTitle();x.content.cover.loaded=false;assert.equal((await x.transfer.verify()).status,'waiting');assert.equal(x.reopens,0);assert.equal(x.calls.filter(c=>c==='native.Open').length,1);
 const y=await setup('zhihu-url-refused',{platform:'zhihu',channel:'native_file_dialog',inspect:(v,c)=>{if(c.purpose==='observe')v.editor_url='https://zhuanlan.zhihu.com/p/321/edit?draft=wrong';}});await y.ready();await y.transfer.submit();refused(await y.transfer.observe());assert.equal(attemptRow(y.f,'zhihu').state,'outcome_unknown');
});
await check('Zhihu final saved acknowledgement binds destination scope and exact retained URL',async()=>{
 for(const corrupt of [v=>delete v.draft_url,v=>v.draft_url='https://zhuanlan.zhihu.com/p/999/edit',v=>v.platform='toutiao',v=>v.article_id='foreign-article',v=>v.state='completed']){
  const x=await setup('zhihu-completion-refused',{platform:'zhihu',channel:'native_file_dialog'});await x.observed();await x.transfer.fillTitle();let request=await x.transfer.verify();request=await x.exchange(request,x.transfer.acceptVerified);const value={article_id:x.f.id,platform:'zhihu',state:'saved',draft_url:editor('zhihu')};corrupt(value);refused(await x.transfer.acceptCompleted(value));assert.equal(sql.prepare('SELECT state FROM article_deliveries WHERE article_id=? AND platform=?').get(x.f.id,'zhihu').state,'saving');assert.equal(attemptRow(x.f,'zhihu').state,'verified');assert.equal(x.calls.filter(c=>c==='native.Open').length,1);
 }
});
await check('real server consume/saving, one setFiles, empty-title fill, full reopen and completed',async()=>{
 const x=await setup('complete');const frozen=sql.prepare('SELECT result_meta,artifact_manifest,paragraphs FROM articles WHERE id=?').get(x.f.id);
 await x.observed();assert.equal(x.content.title,'');assert.equal((await x.transfer.fillTitle()).status,'title_exact');assert.equal(x.writes,1);
 let r=await x.transfer.verify();r=await x.exchange(r,x.transfer.acceptVerified);r=await x.exchange(r,x.transfer.acceptCompleted);assert.equal(r.status,'done',JSON.stringify(r));
 assert.equal(x.reopens,1);assert.equal(x.opens,1);assert.equal(x.calls.filter(c=>c==='setFiles').length,1);assert.equal(attemptRow(x.f).state,'verified');assert.equal(sql.prepare('SELECT state FROM articles WHERE id=?').get(x.f.id).state,'completed');
 assert.deepEqual(sql.prepare('SELECT result_meta,artifact_manifest,paragraphs FROM articles WHERE id=?').get(x.f.id),frozen);
 assert.ok(x.calls.indexOf('consume_article_upload')<x.calls.indexOf('record_article_status'));assert.ok(x.calls.indexOf('record_article_status')<x.calls.indexOf('setFiles'));assert.ok(x.calls.indexOf('independentReopen')<x.calls.lastIndexOf('record_article_upload'));
});
await check('existing exact title causes no title write; nonempty differing title is never overwritten',async()=>{
 const x=await setup('exact-title');await x.observed();x.content.title=x.f.title;assert.equal((await x.transfer.fillTitle()).status,'title_already_exact');assert.equal(x.writes,0);
 const y=await setup('different-title',{importedTitle:'user text'});await y.observed();refused(await y.transfer.fillTitle());assert.equal(y.writes,0);assert.equal(attemptRow(y.f).state,'draft_observed');
});
await check('no title, partial body, wrong images, anchors, loading and same-tab reopen cannot verify',async()=>{
 for(const corrupt of [v=>v.title='',v=>v.body.paragraphs.pop(),v=>v.body.images.pop(),v=>v.body.images[0].reference_sha256='0'.repeat(64),v=>v.body.images[0].after_paragraph++,v=>v.body.images[0].inspected=false,v=>v.tab_id=v.tab_id.replace('reopened','editor'),v=>v.account_url='https://www.toutiao.com/c/user/999/',v=>v.body.captions.push('unfrozen caption'),v=>v.body.unclassified.push('unknown')]){
  const x=await setup('bad-readback',{reopen:corrupt});await x.observed();await x.transfer.fillTitle();refused(await x.transfer.verify());assert.equal(attemptRow(x.f).state,'draft_observed');assert.equal(x.reopens,1);
 }
});
await check('frozen geometry is read from actual finalized Word image bytes; missing dimensions cannot start an import',async()=>{
 const x=await setup('word-original-dimensions',{channel:'native_file_dialog'});
 assert.equal(x.input.baseline.images.length,imagePlan.length);
 for(const image of x.input.baseline.images){
  const bytes=images.find(value=>digest(value)===image.sha256),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  assert.equal(image.natural_width,view.getUint32(16));assert.equal(image.natural_height,view.getUint32(20));
 }
 const incomplete=structuredClone(x.input.baseline);delete incomplete.images[0].natural_width;
 assert.throws(()=>createPrivateDraftTransfer({...x.input,baseline:incomplete}),/baseline_invalid/);
 assert.equal(x.opens,0);assert.equal(attemptRow(x.f),undefined);
 const rawLayout=JSON.parse(sql.prepare('SELECT artifact_manifest FROM articles WHERE id=?').get(x.f.id).artifact_manifest).layout;
 assert.equal(Object.hasOwn(rawLayout.images[0],'natural_width'),false,'website layout receipt does not supply invented pixel dimensions');
});
await check('both native platform chains reject wrong natural ratio, displayed stretching and forged legacy reference dimensions',async()=>{
 for(const platform of ['toutiao','zhihu'])for(const corrupt of [
  image=>image.natural_width*=2,
  image=>image.display_width*=2,
  image=>{image.natural_width*=2;image.display_width*=2;image.reference_width=image.display_width;image.reference_height=image.display_height;},
  image=>delete image.display_height,
 ]){
  const x=await setup('native-geometry-refused-'+platform,{platform,channel:'native_file_dialog',reopen:v=>corrupt(v.body.images[0])});
  const frozen=sql.prepare('SELECT result_meta,artifact_manifest FROM articles WHERE id=?').get(x.f.id);
  await x.observed();await x.transfer.fillTitle();
  assert.equal((await x.transfer.verify()).error_code,'image_mismatch');assert.equal(attemptRow(x.f,platform).state,'draft_observed');
  assert.equal(x.calls.filter(c=>c==='native.Open').length,1);assert.equal(x.calls.includes('setFiles'),false);
  assert.deepEqual(sql.prepare('SELECT result_meta,artifact_manifest FROM articles WHERE id=?').get(x.f.id),frozen);
 }
});
await check('the original Word ratio remains frozen if a caller mutates its baseline after construction',async()=>{
 const x=await setup('word-geometry-frozen',{channel:'native_file_dialog',reopen:v=>{v.body.images[0].natural_width*=2;v.body.images[0].display_width*=2;}});
 await x.observed();assert.equal((await x.transfer.fillTitle()).status,'title_exact');
 x.input.baseline.images[0].natural_width*=2;
 assert.equal((await x.transfer.verify()).error_code,'image_mismatch');assert.equal(attemptRow(x.f).state,'draft_observed');
});
await check('no permission or saving acknowledgement can issue setFiles',async()=>{
 const x=await setup('no-permit');refused(await x.transfer.submit());assert.equal(x.opens,0);
 const y=await setup('saving-refused');let r=await y.transfer.prepare();r=await y.exchange(r,y.transfer.acceptReserved);r=await y.exchange(r,y.transfer.acceptConsumed);refused(await y.transfer.acceptSaving({state:'word_ready'}));refused(await y.transfer.submit());assert.equal(y.calls.includes('setFiles'),false);
});
await check('explicit false/cached reserve and consume cannot grant submission',async()=>{
 const x=await setup('cached-reserve');let request=await x.transfer.prepare();const reservation=await call(x.f,'reserve_article_upload',{...request.args,execution_claim:x.f.claim});refused(await x.transfer.acceptReserved({...reservation,reserved:false}));assert.equal(x.calls.includes('setFiles'),false);
 const y=await setup('consume-false');request=await y.transfer.prepare();request=await y.exchange(request,y.transfer.acceptReserved);const response=await call(y.f,'consume_article_upload',{...request.args,execution_claim:y.f.claim});refused(await y.transfer.acceptConsumed({...response,execute_import:false}));assert.equal(y.calls.includes('setFiles'),false);
});
await check('scope/account/Word/empty-editor/history gates block before opening a picker',async()=>{
 for(const corrupt of [v=>v.target_account='999',v=>v.account_url='https://www.toutiao.com/c/user/999/',v=>v.file.sha256='0'.repeat(64),v=>v.file.size++,v=>v.body.paragraphs.push('user text'),v=>v.existing_drafts.prior_submission='submitted_unknown',v=>v.existing_drafts.draft_list_checked=false,v=>v.private_draft=false,v=>v.body.unclassified.push('unknown')]){
  const x=await setup('preflight-refused',{inspect:corrupt});refused(await x.transfer.prepare());assert.equal(x.opens,0);assert.equal(attemptRow(x.f),undefined);
 }
});
await check('live file/account/picker changes stop a consumed grant without submission',async()=>{
 for(const corrupt of [v=>v.file.absolute_path='/different/final.docx',v=>v.account_url='https://www.toutiao.com/c/user/999/',v=>v.chooser_owned=false,v=>v.title='user text']){
  const x=await setup('final-check',{inspect:(v,c)=>{if(c.purpose==='submit')corrupt(v);}});await x.ready();refused(await x.transfer.submit());assert.equal(x.calls.includes('setFiles'),false);assert.equal(attemptRow(x.f).state,'outcome_unknown');
 }
});
await check('a permit expiring in the awaited final inspection never invokes setFiles',async()=>{
 const x=await setup('expires',{inspect:(_,c)=>{if(c.purpose==='submit')tick+=61000;}});await x.ready();refused(await x.transfer.submit());assert.equal(x.calls.includes('setFiles'),false);
});
await check('unknown setFiles retains attempt and never retries or releases its owner automatically',async()=>{
 const x=await setup('unknown',{setFiles:()=>{throw Error('synthetic unknown with secret sentinel');}});await x.ready();const r=await x.transfer.submit();refused(r);assert.equal(r.phase,'unknown');assert.equal(JSON.stringify(r).includes('secret sentinel'),false);refused(await x.transfer.submit());assert.equal(x.calls.filter(c=>c==='setFiles').length,1);assert.equal(attemptRow(x.f).state,'outcome_unknown');
 const sibling=createPrivateDraftTransfer(x.input);refused(await sibling.prepare());assert.equal(x.opens,1);x.transfer.cancel();assert.equal((await x.transfer.settleClosed()).status,'settled');
});
await check('concurrent submission/cancellation hold ownership until the actual action settles',async()=>{
 let enter,release;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);const x=await setup('in-flight',{setFiles:async()=>{enter();await gate;}});await x.ready();const pending=x.transfer.submit();await entered;refused(await x.transfer.submit());x.transfer.cancel();refused(await x.transfer.settleClosed());refused(await createPrivateDraftTransfer(x.input).prepare());release();refused(await pending);assert.equal(x.calls.filter(c=>c==='setFiles').length,1);assert.equal((await x.transfer.settleClosed()).status,'settled');
});
await check('cancellation in a final read burns the grant without file submission',async()=>{
 let x;x=await setup('cancel-read',{inspect:(_,c)=>{if(c.purpose==='submit')x.transfer.cancel();}});await x.ready();refused(await x.transfer.submit());assert.equal(x.calls.includes('setFiles'),false);
});
await check('busy native cancellation is synchronous during final inspection on both platforms and prevents Open dispatch',async()=>{
 for(const platform of ['toutiao','zhihu']){
  let enter,release;const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve);
  const x=await setup('native-cancel-read-'+platform,{platform,channel:'native_file_dialog',inspect:async(_,context)=>{if(context.purpose==='submit'){enter();await gate;}}});
  await x.ready();const pending=x.transfer.submit();await entered;
  const cancellation=x.transfer.cancel();assert.equal(cancellation.cancellation_propagated,true);assert.equal(cancellation.submitted,false);
  assert.equal(x.calls.filter(c=>c==='cancelLocal').length,1);assert.equal(x.calls.includes('native.Open'),false);
  refused(await x.transfer.settleClosed());release();assert.equal((await pending).error_code,'execution_fenced');
  refused(await x.transfer.submit());assert.equal(x.calls.includes('native.Open'),false);assert.equal(attemptRow(x.f,platform).state,'outcome_unknown');
  x.close();assert.equal((await x.transfer.settleClosed()).status,'settled');refused(await x.transfer.prepare());
 }
});
await check('cancelling an issued native Open retains unknown outcome and the single issued call without claiming withdrawal',async()=>{
 for(const platform of ['toutiao','zhihu']){
  let enter,release;const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve);
  const x=await setup('native-cancel-open-'+platform,{platform,channel:'native_file_dialog',nativeOpen:async()=>{enter();await gate;}});
  await x.ready();const pending=x.transfer.submit();await entered;
  const cancellation=x.transfer.cancel();assert.equal(cancellation.cancellation_propagated,true);assert.equal(cancellation.submitted,true);
  assert.equal(Object.hasOwn(cancellation,'withdrawn'),false);assert.equal(Object.hasOwn(cancellation,'settled'),false);
  assert.equal(x.calls.filter(c=>c==='cancelLocal').length,1);refused(await x.transfer.settleClosed());
  release();const result=await pending;assert.equal(result.error_code,'execution_fenced');assert.equal(result.phase,'unknown');assert.equal(result.submitted,true);
  refused(await x.transfer.submit());assert.equal(x.calls.filter(c=>c==='native.Open').length,1);assert.equal(x.calls.includes('setFiles'),false);assert.equal(attemptRow(x.f,platform).state,'outcome_unknown');
  assert.equal((await x.transfer.settleClosed()).status,'settled');refused(await x.transfer.prepare());
 }
});
await check('an asynchronous or unconfirmed local cancellation receipt never restores a consumed native grant',async()=>{
 for(const cancelLocal of [()=>Promise.resolve({cancelled:true}),()=>({cancelled:false}),()=>{throw Error('synthetic private cancellation failure');}]){
  const x=await setup('native-cancel-unconfirmed',{channel:'native_file_dialog',cancelLocal});await x.ready();
  const result=x.transfer.cancel();assert.equal(result.error_code,'native_cancel_unconfirmed');assert.equal(result.cancellation_propagated,false);
  assert.equal(JSON.stringify(result).includes('private cancellation failure'),false);refused(await x.transfer.submit());
  assert.equal(x.calls.includes('native.Open'),false);assert.equal(attemptRow(x.f).state,'outcome_unknown');
 }
});
await check('title write cannot alter frozen body, cannot replay, or proceed after unknown response',async()=>{
 const x=await setup('title-body-change',{writeTitle:c=>c.body.paragraphs.pop()});await x.observed();refused(await x.transfer.fillTitle());refused(await x.transfer.fillTitle());assert.equal(x.writes,1);assert.equal(attemptRow(x.f).state,'draft_observed');
 const y=await setup('title-unknown',{writeTitle:()=>{throw Error('synthetic');}});await y.observed();refused(await y.transfer.fillTitle());refused(await y.transfer.fillTitle());assert.equal(y.writes,1);
});
await check('title write requires a new saved observation, not an old save indicator',async()=>{
 let old;const x=await setup('old-save',{writeTitle:()=>{old=instant();tick+=1000;},inspect:(v,c)=>{if(c.purpose==='saved')v.saved_at=old;}});await x.observed();await x.transfer.fillTitle();assert.equal((await x.transfer.verify()).status,'waiting');assert.equal(x.reopens,0);assert.equal(attemptRow(x.f).state,'draft_observed');
});
await check('real loading observations wait on the same draft without new submission',async()=>{
 const x=await setup('image-loading');await x.observed();x.content.body.images[0].loaded=false;assert.equal((await x.transfer.fillTitle()).status,'waiting');assert.equal(x.writes,0);x.content.body.images[0].loaded=true;await x.transfer.fillTitle();x.content.body.images[0].loaded=false;assert.equal((await x.transfer.verify()).status,'waiting');assert.equal(x.reopens,0);assert.equal(x.calls.filter(c=>c==='setFiles').length,1);
});
await check('a changing observation timestamp during title write is not a body change',async()=>{
 const x=await setup('fresh-title-read',{writeTitle:()=>{tick+=1000;},inspect:v=>{v.body.images.forEach(image=>image.inspected_at=instant());}});await x.observed();assert.equal((await x.transfer.fillTitle()).status,'title_exact');assert.equal(x.writes,1);
});
await check('cached inspection observations are refused even inside a nominal age window',async()=>{
 const x=await setup('cached-observation',{inspect:v=>{v.checked_at=new Clock(Clock.now()-1000).toISOString();}});refused(await x.transfer.prepare());assert.equal(x.opens,0);
});
await check('loading after reopening reuses its one retained independent tab and original timestamps',async()=>{
 let loading=true;const x=await setup('reopen-loading',{reopen:v=>{if(loading)v.body.images[0].loaded=false;}});await x.observed();await x.transfer.fillTitle();assert.equal((await x.transfer.verify()).status,'waiting');tick+=1000;loading=false;const request=await x.transfer.verify();assert.equal(request.operation,'record_article_upload');assert.equal(x.reopens,1);assert.equal(request.args.readback.saved_at,request.args.readback.reopened_at);assert.ok(Date.parse(request.args.readback.read_at)>Date.parse(request.args.readback.saved_at));
});
await check('host errors cannot spoof a public error code or leak arbitrary exception content',async()=>{
 const x=await setup('error-spoof',{inspect:()=>{throw Object.assign(Error('private sentinel'),{transfer_code:'private sentinel'});}});const r=await x.transfer.prepare();refused(r);assert.equal(r.error_code,'host_operation_unknown');assert.equal(JSON.stringify(r).includes('private sentinel'),false);assert.equal(x.opens,0);
});
await check('pending observations still verify the actual account and safe page scope',async()=>{
 const x=await setup('pending-scope',{inspect:(v,c)=>{if(c.purpose==='observe'){v.pending=true;v.account_url='https://www.toutiao.com/c/user/999/';}}});await x.ready();await x.transfer.submit();refused(await x.transfer.observe());assert.equal(attemptRow(x.f).state,'outcome_unknown');
});
await check('signed image URLs and a file-type title input cannot reach writes or verified evidence',async()=>{
 const x=await setup('signed-image',{reopen:v=>v.body.images[0].observed_url+='?token=private-sentinel'});await x.observed();await x.transfer.fillTitle();const r=await x.transfer.verify();refused(r);assert.equal(JSON.stringify(r).includes('private-sentinel'),false);
 const y=await setup('title-file-input',{inspect:(v,c)=>{if(c.purpose==='title'){v.title_control.tag='INPUT';v.title_control.type='file';}}});await y.observed();refused(await y.transfer.fillTitle());assert.equal(y.writes,0);
});
await check('host transfer requires an explicit platform-account/channel binding and original first-import authorization',async()=>{
 const x=await setup('wrong-platform');assert.throws(()=>createPrivateDraftTransfer({...x.input,scope:{...x.scope,platform:'zhihu'}}));
 assert.throws(()=>createPrivateDraftTransfer({...x.input,host:{inspect:x.host.inspect}}));
 let request=await x.transfer.prepare();const response=await call(x.f,'reserve_article_upload',{...request.args,execution_claim:x.f.claim});refused(await x.transfer.acceptReserved({...response,attempt:{...response.attempt,authorization_kind:'unconsumed_continuation'}}));assert.equal(x.calls.includes('setFiles'),false);
});
await check('new source reads are owner-scoped, token-free and write-free; full program is standalone',async()=>{
 const x=await setup('source');const rowBefore=JSON.stringify(sql.prepare('SELECT * FROM articles WHERE id=?').get(x.f.id)),attemptsBefore=sql.prepare('SELECT count(*) n FROM article_upload_attempts').get().n;
 const contract=await call(x.f,'read_article_handoff');assert.equal(contract.host_transfer.version,'2026-10-11-native-step-host-3');assert.equal(contract.host_transfer.default_import_channel,'native_file_dialog');assert.deepEqual(Array.from(contract.host_transfer.platforms),['toutiao','zhihu']);assert.equal(contract.host_transfer.normal_first_import_candidate,true);assert.equal(contract.host_transfer.candidate_is_not_permission_or_history_proof,true);
 assert.equal(contract.upload_coordination.toutiao_normal_first_import,'host_transfer');assert.equal(contract.upload_coordination.zhihu,'host_transfer');assert.equal(contract.upload_coordination.automatic_fallback,false);assert.equal(contract.upload_coordination.host_transfer_requires_runner_or_bridge,false);assert.match(contract.upload_protocol,/native_file_dialog/);
 const metadata=await call(x.f,'read_article_delivery_executor',{expected_version:contract.host_transfer.version,metadata_only:true});assert.equal(metadata.source_text,undefined);assert.equal(metadata.execute_import,false);
 const source=await call(x.f,'read_article_delivery_executor',{expected_version:metadata.version,expected_sha256:metadata.sha256});assert.equal(digest(source.source_text),metadata.sha256);assert.equal(Buffer.byteLength(source.source_text),metadata.size);assert.ok(metadata.size>0&&metadata.size<=COMPLETE_CALL_BUDGET.definition_max_utf8_bytes);assert.ok(Buffer.byteLength(JSON.stringify(source.source_text))<=COMPLETE_CALL_BUDGET.strict_max_utf8_bytes);assert.equal(contract.host_transfer.source.source_packaging_budget.max_source_utf8_bytes,COMPLETE_CALL_BUDGET.definition_max_utf8_bytes);assert.equal(contract.host_transfer.source.actual_complete_call_budget.strict_max_utf8_bytes,COMPLETE_CALL_BUDGET.strict_max_utf8_bytes);assert.equal(source.contains_parent_business,false);assert.equal(source.contains_private_baseline,false);assert.equal(source.complete_call_budget_verified,false);assert.doesNotMatch(source.source_text,/^import |^export |\beval\s*\(|runInContext|node:vm|cua-draft-runner|private-draft-executor|createPrivateDraftTransfer|createParentImportGate|createParentNativeStepBridge|createTrackedParentObservations|record_article_|claim_article|reserve_article_upload|consume_article_upload|paragraphs|full_body|title_control/m);assert.equal(source.source_text.includes(x.f.claim),false);
 const context={URL};vm.runInNewContext(source.source_text,context);assert.equal(context.createNativeStepSession.runtimeVersion,metadata.version);assert.equal(context.createPrivateDraftTransfer,undefined);assert.equal(context.createParentImportGate,undefined);
 await assert.rejects(tools.articleCall('other-owner','read_article_delivery_executor',{article_id:x.f.id,expected_version:metadata.version}));
 for(const extra of [{expected_version:'old'},{expected_sha256:'0'.repeat(64)},{metadata_only:'true'},{execution_claim:x.f.claim},{execute_import:true}])await assert.rejects(call(x.f,'read_article_delivery_executor',{expected_version:metadata.version,...extra}));
 assert.equal(JSON.stringify(sql.prepare('SELECT * FROM articles WHERE id=?').get(x.f.id)),rowBefore);assert.equal(sql.prepare('SELECT count(*) n FROM article_upload_attempts').get().n,attemptsBefore);assert.equal(networkCalls,0);
});
console.log(JSON.stringify({offline_groups:cases,synthetic_file_submissions:submissions,real_cua_calls:0,real_platform_calls:0,production_writes:0}));
sql.close();
`;
try{fs.writeFileSync(temporary,original.slice(0,boundary)+test);const r=spawnSync(process.execPath,[fileURLToPath(temporary)],{cwd:process.cwd(),encoding:'utf8',maxBuffer:4e6});process.stdout.write(r.stdout);process.stderr.write(r.stderr);process.exitCode=r.status??1;}finally{fs.rmSync(temporary,{force:true});}
