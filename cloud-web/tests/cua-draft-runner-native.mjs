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
 const runtime=createDraftUploadRuntime({browser:options.browser||{},nativeFilePicker:options.missing?undefined:nativeFilePicker,accountReader:options.accountReader,now:()=>TIME});
 const input={article_id:'mock-article-'+(++serial),platform:p,target_account:accounts[p],browser_session:'mock-browser',executor_id:'mock-executor',word_sha256:HASH,word_size:123,baseline,ui,owned_new_draft:true,picker_mode:'native',upload_method:'coordinate',...options.input};
 const s=runtime.createSession(input);
 const file={filename:'article.docx',absolute_path:'/mock/article.docx',browser_session:'mock-browser',sha256:HASH,size:123,visible_in_browser:false,visibility_unproven:true,checked_at:TIME,
  handoff:{kind:'same_browser_download',download_path:'/mock/downloads/uuid',download_browser_session:'mock-browser',executor_id:'mock-executor',source_sha256:HASH,source_size:123,verified_in_cua:true,copied_in_same_executor:true}};
 const attempt=state=>({article_id:s.article_id,platform:p,target_account:accounts[p],word_sha256:HASH,word_size:123,attempt_id:'mock-attempt',state:state||'reserved',editor_urls:[],consumed_at:state?TIME:null,authorization_kind:'new_import'});
 Object.assign(x,{runtime,s,input,file,attempt,nativeFilePicker});return x;
}
const preflight=x=>x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'mock-original-execution'}});
async function consumed(x){
 const r=await preflight(x);assert.equal(r.operation,'reserve_article_upload',JSON.stringify(r));assert.equal(x.submits,0);
 assert.equal((await x.runtime.acceptReserve(x.s,{reserved:true,attempt:x.attempt()})).operation,'consume_article_upload');
 assert.equal((await x.runtime.acceptConsume(x.s,{execute_import:true,attempt:x.attempt('outcome_unknown')})).operation,x.s.platform==='toutiao'?'record_article_status':'record_article_delivery');
 assert.equal(x.submits,0);
}
async function submit(x){x.savingAcknowledged=true;return x.runtime.submitAfterSaving(x.s,{state:x.s.platform==='toutiao'?'toutiao_saving':'saving'});}
async function imported(x){await consumed(x);assert.equal((await submit(x)).operation,'record_article_upload');assert.equal(x.submits,1);}
async function check(name,fn){await fn();cases++;console.log('PASS',name);}

await check('Zhihu coordinate method prepares all stages and one authorized Open with zero browser waiter or locator clicks',async()=>{
 for(const platform of ['zhihu']){
  const x=setup(platform);await imported(x);
  assert.equal(x.runtime.runtime_version,'native_file_picker_v1');assert.equal(x.editor.waits,0);
  assert.deepEqual(x.editor.clicks,[]);
  assert.deepEqual(x.calls.map(([call])=>call),['prepare','inspect','submit']);
  assert.equal(x.s.file.handoff.chooser_prepared,true);assert.equal(x.s.file.visible_in_browser,false);
  assert.equal((await submit(x)).status,'blocked');assert.equal(x.submits,1);
 }
});
await check('fresh file scope is unchanged across reserve and consume; prepare never receives its path',async()=>{
 const x=setup();const r=await preflight(x);const c=await x.runtime.acceptReserve(x.s,{attempt:x.attempt()});
 assert.deepEqual(c.args.file_confirmation,r.args.preflight.file);
 assert.equal('file' in x.calls[0][1],false);assert.throws(()=>{x.s.file.absolute_path='/mock/other.docx';},TypeError);
});
await check('submission before consume or before successful saving acknowledgement is blocked',async()=>{
 const early=setup();await preflight(early);assert.equal((await submit(early)).status,'blocked');assert.equal(early.submits,0);
 const beforeSaving=setup();await consumed(beforeSaving);
 assert.equal((await beforeSaving.runtime.submitAfterSaving(beforeSaving.s,{state:'failed'})).status,'blocked');assert.equal(beforeSaving.submits,0);
});
await check('false consume never submits and cannot be replayed as true',async()=>{
 const x=setup();await preflight(x);await x.runtime.acceptReserve(x.s,{attempt:x.attempt()});
 assert.equal((await x.runtime.acceptConsume(x.s,{execute_import:false,attempt:x.attempt('outcome_unknown')})).status,'reconcile_only');
 assert.equal((await x.runtime.acceptConsume(x.s,{execute_import:true,attempt:x.attempt('outcome_unknown')})).status,'blocked');assert.equal(x.submits,0);
});
await check('missing native tools stop before menu, reserve, consume or browser fallback',async()=>{
 for(const platform of ['zhihu']){
  const x=setup(platform,{missing:true});const r=await preflight(x);assert.equal(r.kind,'picker_failure');
  assert.equal(r.checkpoint.events.at(-1).cause,'tool_unavailable');assert.equal(x.s.pending,undefined);assert.equal(x.editor.waits,0);assert.deepEqual(x.editor.clicks,[]);
 }
});
await check('the coordinate contract and every adapter method are required before any native opening',async()=>{
 for(const method of ['coordinate_contract','prepare','inspect','submit']){const x=setup();delete x.nativeFilePicker[method];assert.equal((await preflight(x)).kind,'picker_failure');assert.equal(x.calls.length,0);assert.equal(x.editor.waits,0);}
 for(const contract of ['native-only','screenshot-double-click-open-v1']){const x=setup();x.nativeFilePicker.coordinate_contract=contract;assert.equal((await preflight(x)).kind,'picker_failure');assert.equal(x.calls.length,0);assert.equal(x.editor.waits,0);}
});
await check('native picker mode is immutable before and after preparation',async()=>{
 const x=setup();assert.throws(()=>{x.s.picker_mode='browser';},TypeError);await preflight(x);assert.throws(()=>{Object.defineProperty(x.s,'picker_mode',{value:'browser'});},TypeError);assert.equal(x.editor.waits,0);
});
await check('invalid or stale native window observations cannot reserve',async()=>{
 const patches=[{ready:false},{window_count:2},{window_handle:''},{checked_at:'2000-01-01T00:00:00Z'},{checked_at:'2026-10-10T14:02:00Z'},{files_selected:true},{submitted:true},
  {article_id:'other'},{platform:'toutiao'},{target_account:'other'},{browser_session:'other'},{executor_id:'other'},{tab_id:'other'},{editor_url:'https://mp.toutiao.com/other'},{purpose:'zhihu_cover'}];
 for(const preparePatch of patches){const x=setup('zhihu',{preparePatch});assert.equal((await preflight(x)).kind,'picker_failure');assert.equal(x.s.pending,undefined);assert.equal(x.submits,0);assert.equal(x.editor.waits,0);}
});
await check('native control requires a fresh observation in the exact editor',async()=>{
 for(const patch of [{observed_url:'https://example.test/other'},{observed_at:'2000-01-01T00:00:00Z'}]){const x=setup();Object.assign(x.s.ui.importStages[2].binding,patch);assert.equal((await preflight(x)).kind,'picker_failure');assert.equal(x.calls.length,0);}
});
await check('native preflight timeout has no permit, fallback or automatic reopening',async()=>{
 const x=setup('zhihu',{prepare:async()=>{throw Error('Native Open File timeout');}});const r=await preflight(x);
 assert.equal(r.kind,'picker_failure');assert.equal(x.s.pending,undefined);assert.equal(x.calls.length,1);assert.equal(x.submits,0);
 assert.equal((await preflight(x)).status,'blocked');assert.equal(x.calls.length,1);assert.equal(x.editor.waits,0);
});
await check('cancellation during native prepare preserves chooser ownership until the late observation settles',async()=>{
 let settle,started;const entered=new Promise(resolve=>{started=resolve;});
 const x=setup('zhihu',{prepare:(context,receipt)=>{started();return new Promise(resolve=>{settle=()=>resolve(receipt);});}});
 const pending=preflight(x);await entered;x.runtime.cancel(x.s);
 const sibling=x.runtime.createSession({...x.input,article_id:'mock-other-article'});
 assert.equal((await x.runtime.preflight(sibling,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'mock'}})).kind,'picker_failure');
 assert.equal(x.calls.length,1);settle();assert.equal((await pending).kind,'cancelled');assert.equal(x.submits,0);
});
await check('reused native handle is rejected on another session after abandonment',async()=>{
 const x=setup('zhihu',{handle:'mock-single-handle'});await preflight(x);x.runtime.cancel(x.s);
 const sibling=x.runtime.createSession({...x.input,article_id:'mock-other-article'});
 assert.equal((await x.runtime.preflight(sibling,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'mock'}})).kind,'picker_failure');assert.equal(x.submits,0);
});
await check('changed native window during inspect consumes no GUI submission',async()=>{
 for(const inspectPatch of [{window_handle:'other'},{window_count:0},{files_selected:true},{target_account:'other'},{purpose:'zhihu_cover'}]){
  const x=setup('zhihu',{inspectPatch});await consumed(x);assert.equal((await submit(x)).kind,'picker_failure');assert.equal(x.submits,0);
  assert.equal((await submit(x)).status,'blocked');assert.equal(x.submits,0);
 }
});
await check('scope changes during awaited native inspection block Open',async()=>{
 const x=setup('zhihu',{inspect:(context,receipt,x)=>{x.s.browser_session='other';return receipt;}});await consumed(x);assert.equal((await submit(x)).status,'blocked');assert.equal(x.submits,0);
});
await check('account, editor and file mutation before Open cannot use the consumed permission',async()=>{
 for(const mutate of [x=>{x.editor.content.account='other';},x=>{x.editor.content.title='user edit';},x=>{x.editor.content.url=draft('zhihu');},x=>{x.s.file={...x.s.file,absolute_path:'/mock/other.docx'};}]){
  const x=setup();await consumed(x);mutate(x);assert.equal((await submit(x)).status,'blocked');assert.equal(x.submits,0);
 }
});
await check('native Open timeout is unknown after one call and never replays a consumed permit',async()=>{
 const x=setup('zhihu',{submit:async()=>{throw Error('Native Open timeout after tool click');}});await consumed(x);const r=await submit(x);
 assert.equal(r.kind,'submission_unknown');assert.equal(x.submits,1);assert.equal(r.checkpoint.submission_started_at,TIME);assert.equal(r.checkpoint.submission_returned_at,null);
 assert.equal((await submit(x)).status,'blocked');assert.equal(x.submits,1);assert.equal(x.editor.waits,0);
});
await check('checkpoint omits native window handles and grants; restored session can only reconcile',async()=>{
 const x=setup();await consumed(x);const checkpoint=x.runtime.checkpoint(x.s),encoded=JSON.stringify(checkpoint);
 assert.equal(encoded.includes(x.handle),false);assert.equal('grant' in checkpoint,false);assert.equal('chooser' in checkpoint,false);
 const restored=x.runtime.createSession({...x.input,checkpoint});assert.equal(restored.readonly_fenced,true);assert.equal(restored.grant,undefined);
 x.savingAcknowledged=true;assert.equal((await x.runtime.submitAfterSaving(restored,{state:'saving'})).status,'blocked');assert.equal(x.submits,0);
});
await check('Zhihu still requires exact menu/dialog/file stages and an actual local-document trigger',async()=>{
 for(const mutate of [x=>{delete x.s.ui.importStages;},x=>{x.s.ui.importStages[2].browser_session='other';},x=>{x.s.ui.importStages[2].binding={...binding('zhihu','dialog'),name:'导入文档'};}]){
  const x=setup('zhihu');mutate(x);assert.equal((await preflight(x)).kind,'picker_failure');assert.equal(x.calls.length,0);assert.equal(x.submits,0);
 }
});
await check('public controls and tool permission refusal never fall back to another channel',async()=>{
 const publish=setup();publish.s.ui.importStages[2].binding.name='发布';assert.equal((await preflight(publish)).kind,'permission_approval');assert.equal(publish.calls.length,0);
 const denied=setup('zhihu',{prepare:async()=>{throw Error('Permission denied');}});assert.equal((await preflight(denied)).kind,'permission_approval');assert.equal(denied.editor.waits,0);
});
await check('coordinate menu/dialog bindings reject public actions and missing identities before host clicks',async()=>{
 for(const stage of [0,1]){
  for(const patch of [{name:'发布'},{text:'定时发布'},{placeholder:'删除草稿'},{identity:{tag:'BUTTON',aria_label:'Publish'}},{identity:{tag:'BUTTON',title:'Schedule'}},{identity:{}}]){
   const x=setup();Object.assign(x.s.ui.importStages[stage].binding,patch);
   assert.equal((await preflight(x)).kind,'permission_approval',JSON.stringify({stage,patch}));
   assert.equal(x.calls.length,0);assert.equal(x.submits,0);assert.equal(x.editor.waits,0);assert.deepEqual(x.editor.clicks,[]);
  }
 }
});
await check('Zhihu cover uses independent native picker and preserves frozen-body checks',async()=>{
 const x=setup('zhihu');await imported(x);assert.equal((await x.runtime.acceptObserved(x.s,{recorded:true})).status,'inspect');
 x.s.ui.coverFile.observed_url=draft('zhihu');
 const fileEvidence={absolute_path:'/mock/cover.png',sha256:IMAGE_HASH,size:40,browser_session:'mock-browser',visible_in_browser:true,checked_at:TIME};
 assert.equal((await x.runtime.setZhihuCover(x.s,{fileEvidence})).status,'cover_requires_inspection');assert.equal(x.submits,2);assert.equal(x.editor.waits,0);
 assert.equal(x.editor.clicks.includes('coverFile'),false);assert.equal(x.calls.filter(([op])=>op==='prepare').at(-1)[1].purpose,'zhihu_cover');
 assert.equal((await x.runtime.setZhihuCover(x.s,{fileEvidence})).status,'blocked');assert.equal(x.submits,2);
});
await check('correct existing cover is reused with no new picker or Open',async()=>{
 const x=setup('zhihu');await imported(x);await x.runtime.acceptObserved(x.s,{recorded:true});
 assert.equal((await x.runtime.setZhihuCover(x.s,{coverInspection:{observed_url:'https://img.example.test/cover.png',reference_sha256:IMAGE_HASH,checked_at:TIME,inspected:true}})).status,'cover_already_verified');assert.equal(x.submits,1);assert.equal(x.calls.length,3);
});
await check('missing native capability blocks before any cover opener',async()=>{
 const x=setup('zhihu');await imported(x);await x.runtime.acceptObserved(x.s,{recorded:true});
 x.s.ui.coverFile.observed_url=draft('zhihu');x.s.ui.coverOpen=[binding('zhihu','coverMenu',draft('zhihu'))];
 delete x.nativeFilePicker.submit;
 const r=await x.runtime.setZhihuCover(x.s,{fileEvidence:{absolute_path:'/mock/cover.png',sha256:IMAGE_HASH,size:40,browser_session:'mock-browser',visible_in_browser:true,checked_at:TIME}});
 assert.equal(r.kind,'picker_failure');assert.equal(r.checkpoint.events.at(-1).cause,'tool_unavailable');assert.equal(x.editor.clicks.includes('coverMenu'),false);assert.equal(x.submits,1);
});
await check('native cover rejects invalid file evidence without another Open',async()=>{
 for(const patch of [{absolute_path:'/mock/../cover.png'},{absolute_path:'relative.png'},{size:0},{checked_at:'2000-01-01T00:00:00Z'},{sha256:'c'.repeat(64)}]){
  const x=setup('zhihu');await imported(x);await x.runtime.acceptObserved(x.s,{recorded:true});x.s.ui.coverFile.observed_url=draft('zhihu');
  const r=await x.runtime.setZhihuCover(x.s,{fileEvidence:{absolute_path:'/mock/cover.png',sha256:IMAGE_HASH,size:40,browser_session:'mock-browser',visible_in_browser:true,checked_at:TIME,...patch}});
  assert.equal(r.status,'blocked');assert.equal(x.submits,1);
 }
});
await check('user-edited or recovered draft cannot upload a native cover',async()=>{
 for(const mutate of [x=>{x.editor.content.rows[0].text='user edit';},x=>{x.s.readonly_fenced=true;}]){
  const x=setup('zhihu');await imported(x);await x.runtime.acceptObserved(x.s,{recorded:true});mutate(x);
  const r=await x.runtime.setZhihuCover(x.s,{fileEvidence:{absolute_path:'/mock/cover.png',sha256:IMAGE_HASH,size:40,browser_session:'mock-browser',visible_in_browser:true,checked_at:TIME}});
  assert.equal(r.status,'blocked');assert.equal(x.submits,1);assert.equal(x.calls.length,3);
 }
});
await check('cover timeout keeps outcome unknown and cannot replay its picker',async()=>{
 const x=setup('zhihu');await imported(x);await x.runtime.acceptObserved(x.s,{recorded:true});x.s.ui.coverFile.observed_url=draft('zhihu');
 x.options.submit=async()=>{throw Error('Native cover Open timeout');};
 const fileEvidence={absolute_path:'/mock/cover.png',sha256:IMAGE_HASH,size:40,browser_session:'mock-browser',visible_in_browser:true,checked_at:TIME};
 assert.equal((await x.runtime.setZhihuCover(x.s,{fileEvidence})).kind,'submission_unknown');assert.equal(x.submits,2);
 assert.equal((await x.runtime.setZhihuCover(x.s,{fileEvidence})).status,'blocked');assert.equal(x.submits,2);
});
await check('automatic missing body-image and paragraph edits remain disabled with native mode',async()=>{
 for(const method of ['repairMissingImage','repairParagraph']){const x=setup();await imported(x);await x.runtime.acceptObserved(x.s,{recorded:true});assert.equal((await x.runtime[method](x.s)).status,'blocked');assert.equal(x.submits,1);}
});
function liveIdentity() {
 const state={account:accounts.zhihu,reads:[],navigations:0,menuClicks:0};
 const home='https://www.zhihu.com/',verificationTab={id:'mock-account-tab-'+(++serial)};
 let url=home,open=false;
 verificationTab.goto=async value=>{assert.equal(value,home);url=value;open=false;state.navigations++;};
 verificationTab.url=async()=>url;
 verificationTab.playwright={domSnapshot:async()=>state.blocker||'知乎首页',locator:key=>({
  count:async()=>key==='avatar'||open?1:0,isVisible:async()=>true,isEnabled:async()=>true,
  innerText:async()=>state.menuLabel||'打开头像菜单',getAttribute:async name=>name==='href'?`/people/${state.account}`:null,
  evaluate:async fn=>fn({tagName:'BUTTON',getAttribute:()=>null}),
  click:async()=>{assert.equal(key,'avatar');state.menuClicks++;open=true;},
 })};
 const accountReader=createZhihuAccountReader({verificationTab,menu:{css:'avatar',identity:{tag:'BUTTON'},observed_url:home,observed_at:TIME},accountLink:{css:'ownProfile',observed_url:home,observed_at:TIME},now:()=>TIME});
 const inspect=accountReader.inspect;accountReader.inspect=async context=>{state.reads.push(context);return inspect(context);};
 return {state,accountReader,verificationTab};
}
await check('real helper freshly reads the avatar menu in an independent tab after the import menu hides the editor identity',async()=>{
 const identity=liveIdentity(),x=setup('zhihu',{accountReader:identity.accountReader});x.editor.content.hideAccountOnImport=true;
 await imported(x);assert.ok(identity.state.reads.length>0);
 assert.equal(identity.state.navigations,identity.state.reads.length);assert.equal(identity.state.menuClicks,identity.state.reads.length);
 assert.equal(new Set(identity.state.reads.map(r=>r.request_id)).size,identity.state.reads.length);
 assert.deepEqual(x.editor.clicks,[]);assert.equal(x.editor.waits,0);assert.equal(x.submits,1);
 assert.ok(identity.state.reads.every(r=>r.tab_id===x.editor.id&&r.browser_session==='mock-browser'));
 assert.equal(JSON.stringify(x.runtime.checkpoint(x.s)).includes('profile_href'),false);
});
await check('missing identity with no reader stops before reserve or file submission',async()=>{
 const x=setup('zhihu');x.editor.content.hideAccountOnImport=true;
 assert.equal((await preflight(x)).status,'blocked');assert.equal(x.s.pending,undefined);assert.deepEqual(x.calls.map(([method])=>method),['prepare']);assert.equal(x.submits,0);
});
await check('a closed menu that retains a hidden profile link requires fresh account evidence too',async()=>{
 const identity=liveIdentity(),x=setup('zhihu',{accountReader:identity.accountReader});x.editor.content.accountInvisible=true;
 await consumed(x);assert.ok(identity.state.reads.length>0);identity.state.account='different-account';
 assert.equal((await submit(x)).kind,'login');assert.equal(x.submits,0);
});
await check('static account mismatch never falls back even to the correct live reader',async()=>{
 const identity=liveIdentity(),x=setup('zhihu',{accountReader:identity.accountReader});x.editor.content.account='other';
 assert.equal((await preflight(x)).kind,'login');assert.equal(identity.state.reads.length,0);assert.equal(x.submits,0);
});
await check('live account switch before native Open is detected without another file submission',async()=>{
 const identity=liveIdentity(),x=setup('zhihu',{accountReader:identity.accountReader});x.editor.content.hideAccountOnImport=true;
 await consumed(x);identity.state.account='different-account';
 assert.equal((await submit(x)).kind,'login');assert.equal(x.submits,0);assert.equal(x.s.grant,false);
});
await check('unscoped, stale, future, foreign and arbitrary profile identity evidence cannot reserve',async()=>{
 const patches=[{request_id:'old'},{article_id:'other'},{browser_session:'other'},{executor_id:'other'},{tab_id:'other'},
  {editor_url:'https://zhuanlan.zhihu.com/other'},{target_account:'other'},{purpose:'document'},
  {checked_at:'2026-10-10T13:58:59Z'},{checked_at:'2026-10-10T14:00:01Z'},{read_started_at:'2026-10-10T13:59:59Z'},
  {read_started_at:'invalid'},{source:'cached_profile'},{authenticated_account_menu:false},{verification_tab_id:''},
  {verification_url:'https://www.zhihu.com/people/'+accounts.zhihu},{profile_href:'https://evil.test/people/'+accounts.zhihu},
  {profile_href:'http://www.zhihu.com/people/'+accounts.zhihu},{profile_href:'https://secret@www.zhihu.com/people/'+accounts.zhihu},
  {profile_href:'https://www.zhihu.com/people/'+accounts.zhihu+'?old=true'},{profile_href:'/people/other'},{unexpected:'field'}];
 for(const patch of patches){const identity=liveIdentity(),read=identity.accountReader.inspect;identity.accountReader.inspect=async c=>({...await read(c),...patch});
  const x=setup('zhihu',{accountReader:identity.accountReader});x.editor.content.accountHidden=true;
  assert.equal((await preflight(x)).kind,Object.hasOwn(patch,'profile_href')?'login':'account_read_failure',JSON.stringify(patch));assert.equal(x.s.pending,undefined);assert.equal(x.submits,0);assert.equal(x.calls.length,0);
 }
});
await check('previous valid receipt cannot be replayed for the next identity check',async()=>{
 const identity=liveIdentity(),read=identity.accountReader.inspect;let receipt;
 identity.accountReader.inspect=async c=>receipt||(receipt=await read(c));
 const x=setup('zhihu',{accountReader:identity.accountReader});x.editor.content.accountHidden=true;
 assert.equal((await preflight(x)).kind,'account_read_failure');assert.equal(x.s.pending,undefined);assert.equal(x.calls.length,0);
});
await check('account tab cannot be the editor; blocked or unsafe avatar actions stop before reserve',async()=>{
 for(const mutate of [(i,x)=>{i.verificationTab.id=x.editor.id;},i=>{i.state.blocker='请先登录';},i=>{i.state.blocker='滑块验证';},i=>{i.state.menuLabel='退出登录';}]){
  const identity=liveIdentity(),x=setup('zhihu',{accountReader:identity.accountReader});x.editor.content.accountHidden=true;mutate(identity,x);
  assert.equal((await preflight(x)).kind,'account_read_failure');assert.equal(x.s.pending,undefined);assert.equal(x.calls.length,0);assert.equal(x.submits,0);
 }
});
await check('scope changes or cancellation during the awaited account read cannot continue preflight',async()=>{
 for(const mutate of [x=>{x.s.browser_session='different';},x=>{x.editor.content.url='https://zhuanlan.zhihu.com/other';},x=>x.runtime.cancel(x.s)]){
  const identity=liveIdentity(),read=identity.accountReader.inspect;let x;
  identity.accountReader.inspect=async c=>{const r=await read(c);mutate(x);return r;};
  x=setup('zhihu',{accountReader:identity.accountReader});x.editor.content.accountHidden=true;
  assert.equal((await preflight(x)).status,'blocked');assert.equal(x.s.pending,undefined);assert.equal(x.submits,0);assert.equal(x.calls.length,0);
 }
});
await check('saved and independently reopened Zhihu draft also use live identity and preserve full readback',async()=>{
 const identity=liveIdentity(),reopened=tab('zhihu');
 reopened.goto=async url=>{Object.assign(reopened.content,{url,title:baseline.title,rows:bodyRows(),saved:true,accountHidden:true});};
 const x=setup('zhihu',{accountReader:identity.accountReader,browser:{tabs:{new:async()=>reopened}}});x.editor.content.hideAccountOnImport=true;
 await imported(x);await x.runtime.acceptObserved(x.s,{recorded:true});
 const r=await x.runtime.verify(x.s,{inspectedBindings:[{observed_url:'https://img.example.test/body.png',reference_sha256:IMAGE_HASH,reference_width:100,reference_height:50,checked_at:TIME,inspected:true}],
  coverInspection:{observed_url:'https://img.example.test/cover.png',reference_sha256:IMAGE_HASH,checked_at:TIME,inspected:true}});
 assert.equal(r.operation,'record_article_upload',JSON.stringify(r));assert.equal(r.args.state,'verified');
 assert.deepEqual(r.args.readback.paragraphs,baseline.paragraphs);assert.equal(r.args.readback.images.length,1);assert.equal(r.args.readback.independently_reopened,true);
 assert.ok(identity.state.reads.some(r=>r.tab_id===reopened.id));assert.equal(x.submits,1);
});
console.log(`PASS native file picker host contract: ${cases} cases; mock actions only; real browsers/computers/platform submissions = 0`);
