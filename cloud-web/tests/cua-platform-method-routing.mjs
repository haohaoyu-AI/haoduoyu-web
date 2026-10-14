import assert from 'node:assert/strict';
import {createDraftUploadRuntime} from '../scripts/browser-upload/cua-draft-runner.mjs';
import {createArticleUploadBridge} from '../scripts/browser-upload/bridge.mjs';

// Offline adapter contracts and state transitions. These fixtures are not
// screenshots, actual mouse observations, or successful platform uploads.
const TIME='2026-10-10T14:00:00.000Z',HASH='a'.repeat(64);
const accounts={toutiao:'61556093362',zhihu:'ren-zhe-ai-chi-yu-52'};
const blank=p=>p==='toutiao'?'https://mp.toutiao.com/profile_v4/graphic/publish':'https://zhuanlan.zhihu.com/write';
const draft=p=>p==='toutiao'?'https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=12345':'https://zhuanlan.zhihu.com/p/12345/edit';
const baseline={title:'冻结标题',paragraphs:['冻结正文'],images:[]};
let serial=0,cases=0;
function fixture(platform,options={}){
 const log=[],state={url:blank(platform),title:'',rows:[],message:'private editor',list:[]};
 const binding=css=>({css,identity:{tag:'INPUT',type:'file'},observed_url:blank(platform),observed_at:TIME});
 const tab=id=>({id,url:async()=>state.url,playwright:{domSnapshot:async()=>state.message,locator:key=>({
  count:async()=>1,isVisible:async()=>true,isEnabled:async()=>true,innerText:async()=>key==='account'?accounts[platform]:'',getAttribute:async()=>null,
  evaluate:async(fn,arg)=>{
   if(key==='title')return fn({value:state.title});
   if(key==='body'){const children=state.rows.map(text=>({nodeType:1,tagName:'P',textContent:text,matches:s=>s.split(',').includes('p'),parentElement:{tagName:'DIV'},childNodes:[{nodeType:3,textContent:text}],children:[]}));return fn({nodeType:1,tagName:'DIV',matches:()=>false,children,childNodes:children,querySelectorAll:()=>[]},arg);}
   if(key==='list')return fn({querySelectorAll:()=>state.list});
   return fn({tagName:'INPUT',getAttribute:n=>n==='type'?'file':null});
  },click:async()=>log.push('dom_click:'+key),
 }),waitForEvent:event=>{
  log.push('wait:'+event);
  if(options.waitFailure)return Promise.reject(Error('filechooser timeout'));
  return Promise.resolve({setFiles:async path=>{
   log.push('setFiles:'+path);assert.equal(path,'/mock/article.docx');
   if(options.submitFailure)throw Error('setFiles timeout');
   importResult();
  }});
 }}});
 const editor=tab('mock-editor-'+(++serial)),list=tab('mock-list-'+serial);
 const ui={account:binding('account'),title:binding('title'),body:{...binding('body'),image_css:'img'},draftList:binding('list'),importFile:binding('file')};
 if(platform==='zhihu')ui.importStages=['menu','dialog','file'].map(stage=>({stage,browser_session:'mock-browser',tab_id:editor.id,binding:{...binding(stage),...(stage==='file'?{name:'点击选择本地文档或拖动文件到窗口上传'}:{})}}));
 function importResult(){state.url=draft(platform);state.title=baseline.title;state.rows=baseline.paragraphs;state.message=options.importPending?'文档导入中':options.importFailure?'导入失败':options.resultUnknown?'private editor':'草稿已保存';if(options.resultUnknown)state.url=blank(platform);}
 const receipt=c=>({...Object.fromEntries(Object.entries(c).filter(([key])=>!['binding','coordinate_actions'].includes(key))),checked_at:TIME,ready:true,window_count:1,window_handle:'mock-window-'+serial,files_selected:false,submitted:false});
 const nativeFilePicker={coordinate_contract:'screenshot-single-click-open-v1',prepare:async c=>{
  log.push(c.coordinate_actions?'coordinate:prepare':'native:prepare');assert.equal('file' in c,false);
  if(c.coordinate_actions){
   assert.deepEqual(c.coordinate_actions.document_stages.map(s=>s.stage),['menu','dialog','file']);
   assert.equal(c.coordinate_actions.file_selection,'single_click_exact_word');assert.equal(c.coordinate_actions.confirmation,'single_click_open');
   assert.equal(c.coordinate_actions.settle_after_each_action,true);assert.equal(c.coordinate_actions.relocate_on_window_change,true);
  }
  return receipt(c);
 },inspect:async c=>{log.push(c.coordinate_actions?'coordinate:inspect':'native:inspect');return receipt(c);},submit:async c=>{
  log.push(c.coordinate_actions?'coordinate:submit':'native:submit');assert.equal(c.file.sha256,HASH);assert.equal(c.file.absolute_path,'/mock/article.docx');
  if(options.submitFailure)throw Error('Native Open timeout');if(Object.hasOwn(options,'nativeSubmitResult'))return options.nativeSubmitResult;importResult();
 }};
 if(options.noBrowserWaiter)delete editor.playwright.waitForEvent;
 if(options.noCoordinateContract)delete nativeFilePicker.coordinate_contract;
 if(options.noNativeSubmit)delete nativeFilePicker.submit;
 const runtime=createDraftUploadRuntime({browser:{},nativeFilePicker:options.noNative?undefined:nativeFilePicker,now:()=>TIME});
 const input={article_id:'mock-article-'+serial,platform,target_account:accounts[platform],browser_session:'mock-browser',executor_id:'mock-executor',word_sha256:HASH,word_size:123,baseline,ui,...options.input};
 const session=runtime.createSession(input);
 const file={filename:'article.docx',absolute_path:'/mock/article.docx',sha256:HASH,size:123,browser_session:'mock-browser',visible_in_browser:true,checked_at:TIME};
 const attempt=state=>({article_id:input.article_id,platform,target_account:accounts[platform],word_sha256:HASH,word_size:123,attempt_id:'mock-attempt-'+serial,state:state||'reserved',authorization_kind:'new_import',editor_urls:[],consumed_at:state?TIME:null});
 return {platform,runtime,input,session,editor,list,file,attempt,log,state,nativeFilePicker};
}
const preflight=x=>x.runtime.preflight(x.session,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'mock-history'}});
async function submit(x){
 const reserve=await preflight(x);assert.equal(reserve.operation,'reserve_article_upload',JSON.stringify(reserve));if(x.session.upload_method)assert.equal(reserve.upload_method,x.session.upload_method);else assert.equal(Object.hasOwn(reserve,'upload_method'),false);
 assert.equal((await x.runtime.acceptReserve(x.session,{reserved:true,attempt:x.attempt()})).operation,'consume_article_upload');
 assert.equal((await x.runtime.acceptConsume(x.session,{execute_import:true,attempt:x.attempt('outcome_unknown')})).operation,x.platform==='toutiao'?'record_article_status':'record_article_delivery');
 return x.runtime.submitAfterSaving(x.session,{state:x.platform==='toutiao'?'toutiao_saving':'saving'});
}
async function check(name,fn){await fn();cases++;console.log('PASS',name);}
await check('platform defaults use named routes; capability availability never changes Toutiao to native',async()=>{
 for(const platform of ['toutiao','zhihu']){
  const x=fixture(platform);assert.equal(x.session.picker_mode,platform==='toutiao'?'browser':'native');assert.equal(x.session.upload_method,platform==='toutiao'?'codex':'coordinate');
  assert.equal((await submit(x)).operation,'record_article_upload');
  assert.deepEqual(x.log,platform==='toutiao'?['wait:filechooser','dom_click:file','setFiles:/mock/article.docx']:['coordinate:prepare','coordinate:inspect','coordinate:submit']);
  assert.equal((await x.runtime.submitAfterSaving(x.session,{state:platform==='toutiao'?'toutiao_saving':'saving'})).status,'blocked');
  assert.equal(x.log.filter(v=>v.startsWith('setFiles:')||v==='coordinate:submit').length,1);
 }
});
await check('conflicting named routes or cached picker changes are rejected before actions',async()=>{
 for(const platform of ['toutiao','zhihu']){
  const x=fixture(platform);
  for(const patch of [{picker_mode:platform==='toutiao'?'native':'browser'},{upload_method:platform==='toutiao'?'coordinate':'codex'},{upload_method:'tinyfish'},{picker_mode:null},{upload_method:null}]){
   assert.throws(()=>x.runtime.createSession({...x.input,...patch}),e=>e.kind==='picker_failure');
   assert.deepEqual(x.log,[]);
  }
  assert.throws(()=>{x.session.upload_method='other';},TypeError);assert.throws(()=>{x.session.picker_mode='other';},TypeError);
 }
});
await check('bare explicit picker keeps both original independent paths unnamed without a new coordinate contract',async()=>{
 for(const platform of ['toutiao','zhihu'])for(const picker_mode of ['browser','native']){
  const x=fixture(platform,{input:{picker_mode},noCoordinateContract:true});assert.equal(x.session.upload_method,null);assert.equal(x.runtime.createSession(x.input),x.session);
  assert.equal((await submit(x)).operation,'record_article_upload');
  const menu=platform==='zhihu'?['dom_click:menu','dom_click:dialog']:[];
  assert.deepEqual(x.log,[...menu,...(picker_mode==='browser'?['wait:filechooser','dom_click:file','setFiles:/mock/article.docx']:['native:prepare','native:inspect','native:submit'])]);
  assert.equal(x.log.some(v=>v.startsWith('coordinate:')),false);
  assert.throws(()=>x.runtime.createSession({...x.input,picker_mode:picker_mode==='browser'?'native':'browser'}),e=>e.kind==='picker_failure');
  assert.equal((await x.runtime.submitAfterSaving(x.session,{state:platform==='toutiao'?'toutiao_saving':'saving'})).status,'blocked');
  assert.equal(x.log.filter(v=>v.startsWith('setFiles:')||v==='native:submit').length,1);
 }
});
await check('named methods remain platform-bound and default coordinate still requires its actual contract',async()=>{
 for(const platform of ['toutiao','zhihu'])for(const input of [{upload_method:platform==='toutiao'?'coordinate':'codex'},{upload_method:platform==='toutiao'?'codex':'coordinate',picker_mode:platform==='toutiao'?'native':'browser'}])assert.throws(()=>fixture(platform,{input}),e=>e.kind==='picker_failure');
 for(const options of [{noNative:true},{noNativeSubmit:true}]){
  const x=fixture('toutiao',{input:{picker_mode:'native'},...options});assert.equal((await preflight(x)).kind,'picker_failure');assert.deepEqual(x.log,[]);
 }
 const named=fixture('zhihu',{input:{upload_method:'coordinate'},noCoordinateContract:true});assert.equal((await preflight(named)).kind,'picker_failure');assert.deepEqual(named.log,[]);
});
await check('absent official host capability blocks before any upload controls or permits; no fallback',async()=>{
 for(const [platform,options] of [['toutiao',{noBrowserWaiter:true}],['zhihu',{noNative:true}],['zhihu',{noCoordinateContract:true}],['zhihu',{noNativeSubmit:true}]]){
  const x=fixture(platform,options),r=await preflight(x);
  assert.equal(r.kind,'picker_failure');assert.equal(r.checkpoint.events.at(-1).cause,'tool_unavailable');assert.equal(x.session.pending,undefined);assert.deepEqual(x.log,[]);
 }
});
await check('Codex chooser timeout and malformed chooser never produce a reservation or another channel',async()=>{
 const x=fixture('toutiao',{waitFailure:true}),r=await preflight(x);assert.equal(r.kind,'picker_failure');assert.equal(x.session.pending,undefined);assert.deepEqual(x.log,['wait:filechooser','dom_click:file']);
 const y=fixture('toutiao');y.editor.playwright.waitForEvent=async()=>({});assert.equal((await preflight(y)).kind,'picker_failure');assert.equal(y.session.pending,undefined);assert.equal(y.log.includes('coordinate:prepare'),false);
});
await check('each route retains genuine pending, rejection, and unknown observations without resubmission',async()=>{
 for(const platform of ['toutiao','zhihu'])for(const options of [{importPending:true},{importFailure:true},{resultUnknown:true},{submitFailure:true}]){
  const x=fixture(platform,options),r=await submit(x);
  assert.equal(r.kind||r.status,options.importPending?'import_pending':options.importFailure?'platform_import_failure':options.submitFailure?'submission_unknown':'result_unknown');
  assert.equal(x.session.grant,false);assert.equal((await x.runtime.submitAfterSaving(x.session,{state:platform==='toutiao'?'toutiao_saving':'saving'})).status,'blocked');
  assert.equal(x.log.filter(v=>v.startsWith('setFiles:')||v==='coordinate:submit').length,1);
 }
});
await check('coordinate adapter never receives unsafe or foreign import-stage actions',async()=>{
 for(const patch of [s=>{s[0].binding.name='发布';},s=>{s[1].binding.identity.aria_label='定时';},s=>{s[2].binding.identity.title='Delete';},s=>{s[0].tab_id='other';},s=>{s[1].binding.observed_url='https://other.test/';}]){
  const x=fixture('zhihu');patch(x.session.ui.importStages);assert.equal((await preflight(x)).status,'blocked');assert.deepEqual(x.log,[]);assert.equal(x.session.pending,undefined);
 }
});
await check('explicit native failure or unfinished Open retains unknown ownership and never records a draft',async()=>{
 for(const [platform,input] of [['zhihu',{}],['toutiao',{picker_mode:'native'}]])for(const nativeSubmitResult of [{submitted:false},{window_closed:false},{window_count:1},{status:'unknown'},{status:'failed'},{isError:true},{success:false}]){
  const x=fixture(platform,{input,nativeSubmitResult,noCoordinateContract:platform==='toutiao'}),r=await submit(x);
  assert.equal(r.kind,'submission_unknown');assert.equal(x.session.grant,false);assert.equal(x.session.editor_urls.length,0);assert.equal(x.session.pending,null);
  assert.equal((await x.runtime.observe(x.session)).status,'blocked');assert.equal((await x.runtime.submitAfterSaving(x.session,{state:platform==='toutiao'?'toutiao_saving':'saving'})).status,'blocked');assert.equal(x.log.filter(v=>v==='coordinate:submit'||v==='native:submit').length,1);
 }
});
await check('bridge rejects cross-platform method metadata before credentials or authenticated tool calls',async()=>{
 let calls=0,claims=0;
 const bridge=createArticleUploadBridge({approvedScope:{article_id:'mock-article',platforms:['toutiao','zhihu']},currentClaim:async()=>{claims++;return 'mock-private-claim';},call:async(op,args)=>{calls++;assert.equal('upload_method' in args,false);assert.equal('picker_mode' in args,false);return {article_id:args.article_id,platform:args.platform,state:'outcome_unknown'};}});
 for(const [platform,upload_method,picker_mode] of [['toutiao','coordinate','native'],['zhihu','codex','browser']]){
  await assert.rejects(()=>bridge({status:'bridge_required',operation:'read_article_upload',upload_method,picker_mode,args:{article_id:'mock-article',platform}}),/fixed platform route/);
 }
 await assert.rejects(()=>bridge({status:'bridge_required',operation:'record_article_status',args:{article_id:'mock-article',platform:'zhihu',state:'toutiao_saving'}}),/scope differs/);
 assert.equal(claims,0);assert.equal(calls,0);
 for(const [platform,upload_method,picker_mode] of [['toutiao','codex','browser'],['zhihu','coordinate','native']])await bridge({status:'bridge_required',operation:'read_article_upload',upload_method,picker_mode,args:{article_id:'mock-article',platform}});
 for(const platform of ['toutiao','zhihu'])for(const picker_mode of ['browser','native'])await bridge({status:'bridge_required',operation:'read_article_upload',picker_mode,args:{article_id:'mock-article',platform}});
 await assert.rejects(()=>bridge({status:'bridge_required',operation:'read_article_upload',picker_mode:'native',args:{article_id:'other-article',platform:'toutiao'}}),/scope differs/);
 assert.equal(calls,6);assert.equal(claims,0);
});
console.log(`PASS platform method routing: ${cases} cases; offline adapters only; real screenshots, browser/mouse/platform submissions = 0`);
