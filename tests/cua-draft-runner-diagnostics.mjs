import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import {accountFixture,accountContext,TIME,ACCOUNT} from './fixtures/cua-account-readiness-fixture.mjs';

const moduleUrl=process.env.CUA_DRAFT_RUNNER_SOURCE?pathToFileURL(process.env.CUA_DRAFT_RUNNER_SOURCE):new URL('../scripts/browser-upload/cua-draft-runner.mjs',import.meta.url);
const {createDraftUploadRuntime,createZhihuAccountReader}=await import(moduleUrl);
const source=fs.readFileSync(moduleUrl,'utf8').replace(/^export (?=function)/gm,'');
const SECRET='synthetic-private-cookie-token-9231';
const fields=['version','source','stage','substep','kind','error_name','summary','count','visible','enabled','checks','checked_at','failed_at'].sort();
let cases=0;
async function check(name,operation){await operation();cases++;console.log('PASS',name);}
function setup(accountReader,options={}){
  let urlReads=0;
  const locator={count:async()=>{if(options.staticError)throw options.staticError;return options.staticVisible?1:0;},
    isVisible:async()=>{if(options.staticVisibleError)throw options.staticVisibleError;return true;},
    getAttribute:async()=>{if(options.staticHrefError)throw options.staticHrefError;return `https://www.zhihu.com/people/${ACCOUNT}`;}};
  const list={id:'mock-list',url:async()=>{urlReads++;if(options.editorUrlError&&urlReads===(options.editorUrlFailureOn||1))throw options.editorUrlError;return 'https://zhuanlan.zhihu.com/drafts';},playwright:{locator:()=>locator}};
  const editor={id:'mock-editor',url:async()=> 'https://zhuanlan.zhihu.com/write',playwright:{}};
  const ui={account:{css:'own-profile',observed_at:TIME,observed_url:'https://zhuanlan.zhihu.com/write',attribute:'href',encoding:'zhihu_profile_href'}};
  const runtime=(options.factory||createDraftUploadRuntime)({browser:{},accountReader,now:options.now||(()=>TIME)});
  const session=runtime.createSession({article_id:'mock-article',platform:'zhihu',target_account:ACCOUNT,browser_session:'mock-browser',executor_id:'mock-executor',word_sha256:'a'.repeat(64),word_size:123,baseline:{title:'mock title',paragraphs:['mock paragraph'],images:[]},ui,picker_mode:'native'});
  const file={filename:'article.docx',absolute_path:'/mock/article.docx',browser_session:'mock-browser',sha256:'a'.repeat(64),size:123,visible_in_browser:true,checked_at:TIME};
  return {runtime,session,preflight:()=>runtime.preflight(session,{editorTab:editor,listTab:list,fileEvidence:options.file||file,history:{prior_submission:'never_attempted',evidence_reference:'synthetic-only'}})};
}
function safe(value){assert.equal(JSON.stringify(value).includes(SECRET),false);}

await check('helper raw error survives both catches privately with accurate not_checked fields',async()=>{
  const raw=new TypeError(SECRET);raw.stack=SECRET;raw.cookie=SECRET;
  const x=accountFixture({errorAt:'menu_count',error:raw});
  const reader=createZhihuAccountReader(x.argumentsForReader),r=setup(reader,{now:x.now});
  const result=await r.preflight(),diagnostic=r.runtime.diagnostic(r.session);
  assert.equal(result.kind,'account_read_failure');assert.equal(diagnostic.stage,'file_handoff');
  assert.equal(diagnostic.substep,'account_menu_count');assert.equal(diagnostic.error_name,'TypeError');
  assert.equal(diagnostic.count,'not_checked');assert.equal(diagnostic.visible,'not_checked');assert.equal(diagnostic.enabled,'not_checked');
  assert.equal(diagnostic.summary,'Upload operation failed; private diagnostic retained.');
  assert.equal(diagnostic.checked_at,x.now());assert.deepEqual(Object.keys(diagnostic).sort(),fields);
  safe([result,r.session,r.runtime.checkpoint(r.session),diagnostic]);
  diagnostic.summary=SECRET;diagnostic.count=999;
  const original=r.runtime.diagnostic(r.session);assert.notEqual(original.summary,SECRET);assert.equal(original.count,'not_checked');
  await r.preflight();assert.deepEqual(r.runtime.diagnostic(r.session),original);
  assert.equal('raw' in result,false);assert.equal('cause' in r.session,false);
});
await check('known fixed helper errors retain precise summary and observed zero count',async()=>{
  const x=accountFixture({menu:[{count:0}],frozenClock:true});x.argumentsForReader.readinessMaxChecks=1;
  const r=setup(createZhihuAccountReader(x.argumentsForReader),{now:x.now});
  assert.equal((await r.preflight()).kind,'account_read_failure');const d=r.runtime.diagnostic(r.session);
  assert.equal(d.summary,'Zhihu avatar menu unavailable');assert.equal(d.count,0);
  assert.equal(d.visible,'not_checked');assert.equal(d.enabled,'not_checked');safe(d);
});
await check('count was observed but a failed visible read is never reported as false',async()=>{
  const x=accountFixture({errorAt:'menu_visible',error:Error(SECRET)}),r=setup(createZhihuAccountReader(x.argumentsForReader),{now:x.now});
  await r.preflight();const d=r.runtime.diagnostic(r.session);
  assert.equal(d.substep,'account_menu_visible');assert.equal(d.count,1);assert.equal(d.visible,'not_checked');assert.equal(d.enabled,'not_checked');safe(d);
});
await check('external reader exceptions and poisoned getters are safely retained without masking failure',async()=>{
  for(const raw of [Object.assign(Error(SECRET),{stack:SECRET,authorization:SECRET}),{get message(){throw Error(SECRET);},get name(){throw Error(SECRET);},stack:SECRET}]){
    const r=setup({inspect:async()=>{throw raw;}});assert.equal((await r.preflight()).kind,'account_read_failure');
    const d=r.runtime.diagnostic(r.session);assert.equal(d.substep,'account_live_read');assert.equal(d.summary,'Upload operation failed; private diagnostic retained.');
    safe([d,r.session,r.runtime.checkpoint(r.session)]);
  }
});
await check('runtime count failures keep the actual substep and safe public channel',async()=>{
  const r=setup(undefined,{staticError:Error('Unknown CDP tab 12 '+SECRET)});
  assert.equal((await r.preflight()).kind,'browser_crash');const d=r.runtime.diagnostic(r.session);
  assert.equal(d.source,'draft_runtime');assert.equal(d.substep,'account_binding_count');assert.equal(d.count,'not_checked');safe([d,r.session]);
});
await check('static profile binding visibility and href reads have distinct exact failure markers',async()=>{
  for(const [option,substep] of [['staticVisibleError','account_binding_visible'],['staticHrefError','account_binding_href']]){
    const r=setup(undefined,{staticVisible:true,[option]:Error('Unknown CDP tab 12 '+SECRET)});
    assert.equal((await r.preflight()).kind,'browser_crash');const d=r.runtime.diagnostic(r.session);
    assert.equal(d.substep,substep);safe([d,r.session,r.runtime.checkpoint(r.session)]);
    if(option==='staticVisibleError'){assert.equal(d.count,1);assert.equal(d.visible,'not_checked');}
  }
});
await check('editor url failure before the reader inspect cannot be mislabelled as reader failure',async()=>{
  let reads=0;
  const r=setup({inspect:async()=>{reads++;assert.fail('reader must not be called');}},{editorUrlError:Error('Unknown CDP tab 12 '+SECRET)});
  assert.equal((await r.preflight()).kind,'browser_crash');const d=r.runtime.diagnostic(r.session);
  assert.equal(d.substep,'account_editor_url');assert.equal(reads,0);safe([d,r.session]);
});
await check('current editor url read after a successful inspect has the same precise url boundary',async()=>{
  let reads=0;
  const reader={inspect:async context=>{reads++;return {...context,source:'fresh_account_menu',verification_tab_id:'mock-independent',verification_url:'https://www.zhihu.com/',authenticated_account_menu:true,profile_href:`https://www.zhihu.com/people/${ACCOUNT}`,read_started_at:TIME,checked_at:TIME};}};
  const r=setup(reader,{editorUrlError:Error('Unknown CDP tab 12 '+SECRET),editorUrlFailureOn:2});
  assert.equal((await r.preflight()).kind,'browser_crash');const d=r.runtime.diagnostic(r.session);
  assert.equal(d.substep,'account_editor_url');assert.equal(reads,1);safe([d,r.session]);
});
await check('file-evidence rejection distinguishes its substep while public journals stay unchanged',async()=>{
  const r=setup(undefined,{staticVisible:true,file:{filename:'article.docx',absolute_path:'/mock/article.docx',browser_session:'mock-browser',sha256:'a'.repeat(64),size:123,visible_in_browser:true,checked_at:'2026-10-10T13:00:00.000Z'}});
  assert.equal((await r.preflight()).kind,'result_unknown');const d=r.runtime.diagnostic(r.session);
  assert.equal(d.substep,'word_evidence');assert.equal(d.summary,'Fresh named Word evidence in this browser session is required');
  assert.equal(r.runtime.checkpoint(r.session).events.some(event=>'summary' in event||'stack' in event||'substep' in event),false);
});
await check('standalone definitions retain the original synthetic error only inside the private WeakMap',async()=>{
  const context=vm.createContext({URL});vm.runInContext(source+'\n globalThis.makeAccountReader=createZhihuAccountReader; globalThis.makeRuntime=createDraftUploadRuntime;',context);
  const raw=Error(SECRET),x=accountFixture({errorAt:'navigation',error:raw});
  const reader=context.makeAccountReader(x.argumentsForReader);let caught;
  try{await reader.inspect(accountContext());assert.fail('Expected failure');}catch(error){caught=error;}
  context.syntheticError=caught;context.syntheticRaw=raw;
  assert.equal(vm.runInContext('uploadDiagnosticRecords.get(syntheticError).raw === syntheticRaw',context),true);
  assert.equal('cause' in caught,false);assert.equal('raw' in caught,false);safe([caught,reader.diagnostic(caught)]);
  assert.equal(reader.diagnostic(caught).substep,'account_navigation');
  const runtimeCase=setup(context.makeAccountReader(x.argumentsForReader),{factory:context.makeRuntime,now:x.now});
  assert.equal((await runtimeCase.preflight()).kind,'account_read_failure');
  context.syntheticSession=runtimeCase.session;
  assert.equal(vm.runInContext('uploadDiagnosticRecords.get(syntheticSession).raw === syntheticRaw',context),true);
  safe([runtimeCase.session,runtimeCase.runtime.diagnostic(runtimeCase.session),runtimeCase.runtime.checkpoint(runtimeCase.session)]);
});
console.log(`PASS safe diagnostics: ${cases} cases; synthetic errors only; external actions=0.`);
