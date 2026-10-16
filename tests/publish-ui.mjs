// Offline React-element harness with inert GET/submit responses. No real network,
// browser, production data, API mutations, or platform operations occur.
import assert from 'node:assert/strict';
import {syntheticDraftLinks,hiddenDiagnostic,diagnosticProbes} from './presentation-security-fixture.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
import {renderToStaticMarkup} from 'react-dom/server';
const nativeRequire=createRequire(import.meta.url);
const compile=path=>ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const helper={},nav={},page={},uploadProgress={},wordStages={};
vm.runInNewContext(compile('components/upload-progress.ts'),{exports:uploadProgress});
vm.runInNewContext(compile('components/publish-focus.ts'),{exports:helper,URL});
vm.runInNewContext(compile('components/studio-nav.tsx'),{exports:nav,require:nativeRequire});
// Load the current real Word progress component in SSR; no placeholder or route mock.
vm.runInNewContext(compile('components/word-stage-progress.tsx'),{exports:wordStages,require:name=>name==='./publish-focus'?helper:nativeRequire(name),Date,Intl});
const states=[],refs=[],callbacks=[];let si=0,ri=0,ci=0,rows=[],pendingTotalFixture,transportFixture;
const storage=new Map();
const hooks={useState(initial){const index=si++;if(!(index in states))states[index]=initial;return [states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value;}];},useRef(initial){const index=ri++;return refs[index]??=( {current:initial} );},useCallback(fn){callbacks[ci++]=fn;return fn;},useEffect(){}};
vm.runInNewContext(compile('app/page.tsx'),{exports:page,require:name=>name==='react'?hooks:name==='../components/article-list-clear'||name==='../components/article-content-clear'?{default:()=>null}:name==='../components/word-stage-progress'?wordStages:name==='../components/publish-focus'?helper:name==='../components/studio-nav'?nav:name==='../components/upload-progress'?uploadProgress:nativeRequire(name),AbortController,AbortSignal,Response,Date,window:{sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}},fetch:async(url,options)=>{
 if(transportFixture&&transportFixture.method===(options?.method||'GET')){const response=transportFixture;transportFixture=null;assert.equal(url,response.url,'an inert fixture may intercept only its exact requested endpoint');if(response.reject)throw Error(response.reject);return new Response(JSON.stringify(response.body),{status:response.status});}
 assert.equal(url,'/api/articles');assert.equal(options?.method,undefined,'all ordinary list/focus interactions remain read-only');return new Response(JSON.stringify({items:rows,connected:true,pending_total:pendingTotalFixture}));
}});
const focusedSummaries=[];
function render(){
  si=ri=ci=0;
  const tree=page.default();
  // Simulate React committing the actual summary callback refs after the handler render.
  for(const summary of all(tree,'summary')) if(typeof summary.props.ref==='function') summary.props.ref({focus(){focusedSummaries.push(text(summary));}});
  return tree;
}
function listRead(...args){
  // Resolve the real Home list reader by its pagination endpoint, so unrelated
  // useCallback additions cannot silently replace the action under test.
  const readers=callbacks.filter(callback=>String(callback).includes('/api/articles?pending_offset='));
  assert.equal(readers.length,1,'expected exactly one actual Home article-list callback');
  return readers[0](...args);
}
function elements(node,predicate,result=[]){if(!node||typeof node!=='object')return result;if(predicate(node))result.push(node);const children=node.props?.children;for(const child of Array.isArray(children)?children:[children]){if(Array.isArray(child))child.forEach(value=>elements(value,predicate,result));else elements(child,predicate,result);}return result;}
const all=(tree,type)=>elements(tree,node=>node.type===type);
const text=node=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
const current=tree=>all(tree,'details').filter(node=>node.props.className==='publish-fold publish-current-item');
const history=tree=>all(tree,'details').find(node=>node.props.className==='publish-fold publish-history');
const deleteConfirmation=tree=>all(tree,'section').find(node=>node.props.className==='delete-confirmation');
function checkDeleteAria(confirmation){
  assert.ok(confirmation,'the local delete confirmation must be mounted');
  for(const attribute of ['aria-labelledby','aria-describedby']){
    const id=confirmation.props[attribute];assert.ok(id,'the confirmation preserves its accessible description');
    assert.equal(elements(confirmation,node=>node.props?.id===id).length,1,'each aria reference resolves exactly once');
  }
  const fieldLabel=all(confirmation,'label').find(node=>node.props.htmlFor);
  assert.ok(fieldLabel);assert.equal(all(confirmation,'input').filter(node=>node.props.id===fieldLabel.props.htmlFor).length,1,'the existing ID field keeps its label');
  assert.equal(all(confirmation,'button').find(node=>text(node)==='永久删除本站副本').props.disabled,true,'opening a confirmation alone cannot authorize deletion');
}
const saved={id:'00000000-0000-4000-8000-000000000099',title:'历史成稿',state:'completed',has_result:true,toutiao_verified_readback:true,draft_url:syntheticDraftLinks.toutiao,deliveries:[{platform:'zhihu',state:'saved',verified_readback:true,draft_url:syntheticDraftLinks.zhihu}]};
let tree=render();
let html=renderToStaticMarkup(tree);
assert.match(html,/<details class="publish-fold publish-history"><summary>最近文章/);
assert.doesNotMatch(html,/<details[^>]*\sopen[ =>]/);
assert.equal(current(tree).length,0);
rows=[saved,{id:'stuck',title:'历史未完稿',state:'needs_verification'}];await listRead();tree=render();
assert.equal(history(tree).props.open,undefined,'history stays uncontrolled and closed by default');
assert.equal(current(tree).length,0);
assert.equal(focusedSummaries.length,0,'initial and background loads must not request focus');
const viewButton=all(tree,'button').find(node=>text(node)==='在工作区查看');viewButton.props.onClick();tree=render();
assert.equal(current(tree)[0].props.open,true,'manual history selection opens the current work area');
assert.equal(focusedSummaries.length,1,'explicit history action transfers focus to the newly mounted summary');
assert.match(focusedSummaries[0],/本次 · 历史成稿/);
assert.equal(all(tree,'a').filter(node=>node.props.href===`/api/articles/${saved.id}/download`).length,1,'no duplicate article controls or deletion form IDs');
await listRead(true);tree=render();assert.equal(current(tree)[0].props.open,true,'readback of completed article is not closed by refresh');
current(tree)[0].props.onToggle({currentTarget:{open:false}});tree=render();assert.equal(current(tree)[0].props.open,false);
current(tree)[0].props.onToggle({currentTarget:{open:true}});await listRead();tree=render();assert.equal(current(tree)[0].props.open,true);
rows=[{id:'new-a',title:'本次A',state:'processing'},{id:'new-b',title:'本次B',state:'processing'},...rows];await listRead();tree=render();
assert.equal(current(tree).filter(node=>node.props.open).length,3,'parallel current tasks preserve manually reopened history');
rows=rows.map(row=>row.id==='new-a'?{...saved,id:row.id,title:row.title,deliveries:[{...saved.deliveries[0],state:'saving'}]}:row);await listRead();tree=render();
assert.equal(current(tree).find(node=>text(node).includes('本次A')).props.open,true);
rows=rows.map(row=>row.id==='new-a'?{...saved,id:row.id,title:row.title}:row);await listRead();tree=render();
assert.equal(current(tree).find(node=>text(node).includes('本次A')).props.open,false,'completion response folds the current article');
assert.equal(current(tree).find(node=>text(node).includes('本次B')).props.open,true);
rows=rows.map(row=>row.id==='new-b'?{...row,state:'failed',error:'保留错误并等待处理'}:row);await listRead();tree=render();
assert.equal(current(tree).find(node=>text(node).includes('本次B')).props.open,true);
assert.doesNotMatch(renderToStaticMarkup(tree),/保留错误并等待处理/,'an unrecognized raw error is retained server-side, never echoed');
assert.match(renderToStaticMarkup(tree),/详细记录已保留，原始诊断不在页面展示/);
assert.match(text(current(tree).find(node=>text(node).includes('本次B'))),/请让小鱼核对/);
assert.equal(focusedSummaries.length,1,'polls, refreshes, completion and failures never steal focus or repeat the handoff');
rows=[...rows,{id:'older-queued',title:'五篇之后的卡单',state:'queued',notification_state:'delivered',recovery:{unfinished:true,can_notify:true,lease_expires:null}}];await listRead();tree=render();
assert.match(renderToStaticMarkup(tree),/五篇之后的卡单/,'unfinished rows are never sliced to latest five');
const articleCard=(tree,id)=>all(tree,'article').find(node=>text(node).includes(rows.find(row=>row.id===id).title));
assert.equal(all(articleCard(tree,'older-queued'),'button').some(node=>/求助/.test(text(node))),false,'accepted work waits without a second help action');
assert.match(text(articleCard(tree,'older-queued')),/无需再次点击/);
await listRead(true);tree=render();
assert.equal(all(articleCard(tree,'older-queued'),'button').some(node=>/求助/.test(text(node))),false,'refresh preserves waiting from durable server state');
rows=[{id:'first-help',title:'尚未求助稿',state:'uploaded',recovery:{unfinished:true,can_notify:true,can_retry:false}},
 {id:'sending-help',title:'正在通知稿',state:'queued',notification_state:'sending',recovery:{unfinished:true,can_notify:true,can_retry:false,waiting_for_executor:true}},
 {id:'retry-help',title:'真实失败稿',state:'failed',notification_state:'delivered',recovery:{unfinished:true,can_notify:true,can_retry:true}},
 {id:'old-failure',title:'旧错误已重新通知稿',state:'failed',notification_state:'delivered',error:'之前的失败',recovery:{unfinished:true,can_notify:true,can_retry:false,waiting_for_executor:true}},
 {id:'partial-wait',title:'头条完成知乎等待稿',state:'completed',has_result:true,toutiao_verified_readback:true,draft_url:syntheticDraftLinks.toutiao,notification_state:'delivered',deliveries:[{platform:'zhihu',state:'pending'}],recovery:{unfinished:true,can_notify:true,can_retry:false,waiting_for_executor:true}},
 {id:'uncertain-help',title:'通知结果不明稿',state:'queued',notification_state:'unknown',recovery:{unfinished:true,can_notify:true,can_retry:true}},
 {id:'active-fault',title:'有执行者的待核验稿',state:'needs_verification',recovery:{unfinished:true,can_notify:false,can_retry:false,lease_expires:'2099-01-01T00:00:00.000Z'}}];
await listRead();tree=render();
assert.ok(all(articleCard(tree,'first-help'),'button').some(node=>text(node)==='求助小鱼'));
assert.ok(all(articleCard(tree,'retry-help'),'button').some(node=>text(node)==='重试求助'));
assert.ok(all(articleCard(tree,'uncertain-help'),'button').some(node=>text(node)==='重试求助'));
for(const id of ['sending-help','old-failure','partial-wait','active-fault'])assert.equal(all(articleCard(tree,id),'button').some(node=>/求助/.test(text(node))),false,id+' must not request another click');
assert.match(text(articleCard(tree,'active-fault')),/无需等到占用到期/);assert.match(text(articleCard(tree,'active-fault')),/您的明确授权/);
assert.match(text(articleCard(tree,'partial-wait')),/头条.*草稿已保存并验收.*知乎.*等待上传/);
assert.doesNotMatch(renderToStaticMarkup(tree),/请求小鱼继续处理|可以再次请求/);
rows=[{id:'handoff-ui',title:'交接状态测试',state:'needs_verification',has_result:true,draft_url:'https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=123',upload_progress:[{platform:'toutiao',attempt:{state:'draft_observed'},diagnostic:{stage:'chooser_wait',outcome:'failed',cause:'timeout'},diagnostic_superseded:true},{platform:'zhihu',attempt:{state:'reserved'},diagnostic:{stage:'draft_readback',outcome:'failed',cause:'permission_denied'},diagnostic_superseded:false}],deliveries:[{platform:'zhihu',state:'needs_verification',message:'页面检查受工具审批限制，文件尚未提交'}]}];await listRead();tree=render();
const handoffCard=text(articleCard(tree,'handoff-ui'));assert.match(handoffCard,/等待验收确认/);assert.match(handoffCard,/操作未获批准/);assert.match(handoffCard,/请让小鱼核对/);assert.doesNotMatch(handoffCard,/页面检查受工具审批限制，文件尚未提交|平台提示导入失败|文件选择器故障/,'raw diagnostics and unsupported alternative diagnoses stay hidden');
for(const [stage,cause,expected,unexpected] of [['chooser_wait','timeout',/本次操作结果未确认/,/平台提示导入失败/],['file_submission','browser_disconnected',/操作工具暂不可用/,/文件选择器故障/],['file_submission','permission_denied',/操作未获批准/,/等待该操作获准/],['platform_import','platform_rejected',/平台提示导入失败/,/文件选择器故障/]]){
 rows=[{id:'failure-flow',title:'故障下一步',state:'needs_verification',upload_progress:[{platform:'toutiao',attempt:{state:'outcome_unknown'},diagnostic:{stage,outcome:'failed',cause},diagnostic_superseded:false}]}];await listRead();tree=render();const visible=text(articleCard(tree,'failure-flow'));assert.match(visible,expected);assert.match(visible,/请让小鱼核对/);assert.doesNotMatch(visible,unexpected);
}

// Feed probes through the real Home list reader and render all real Word children.
// Closed <details> are still in DOM; none may contain the original diagnostic.
const wordFixture=JSON.parse(fs.readFileSync('evidence/word-progress/v1-partial-fixture.json','utf8'));
rows=diagnosticProbes.map((probe,index)=>{
 const id=`00000000-0000-4000-8000-${String(index+500).padStart(12,'0')}`,progress=structuredClone(wordFixture);progress.target_id=id;progress.execution.reason_text=probe;progress.steps[2].label=probe;progress.steps[2].action=probe;progress.steps[2].counts=null;
 return {id,title:`保密回归 ${index}`,state:'processing',filename:probe,error:probe,has_result:true,draft_url:syntheticDraftLinks.toutiao+'&session=synthetic-secret',word_progress:progress,deliveries:[{platform:'zhihu',state:'needs_verification',message:probe,draft_url:syntheticDraftLinks.zhihu+'?jwt=synthetic-secret'}]};
});
await listRead();tree=render();html=renderToStaticMarkup(tree);
const decodedMarkup=html.replaceAll('&quot;','"').replaceAll('&#x27;',"'").replaceAll('&amp;','&');
for(const probe of diagnosticProbes)assert.ok(!decodedMarkup.includes(probe),'actual Home/Word DOM must not contain any raw probe, including JSON escapes and isolated percent encoding');
assert.doesNotMatch(html,/synthetic-secret|\\u0073ynthetic|unrecognized public diagnostic prose/);
assert.ok(html.includes(hiddenDiagnostic));
assert.equal(all(tree,'a').filter(node=>String(node.props.href).includes('synthetic-secret')).length,0,'unsafe links never become href attributes');
assert.equal(all(tree,'a').filter(node=>String(node.props.href).endsWith('/download')).length,diagnosticProbes.length,'hiding diagnostics preserves every existing Word download');

rows=[{id:'unknown-enum',title:'未知枚举保密回归',state:'credential=synthetic-secret',deliveries:[{platform:'session=synthetic-secret',state:'jwt=synthetic-secret',message:'sig=synthetic-secret',draft_url:syntheticDraftLinks.zhihu+'?access_key=synthetic-secret'}]}];await listRead();tree=render();html=renderToStaticMarkup(tree);assert.doesNotMatch(html,/synthetic-secret/,'unknown machine enums cannot leak through text or data-state attributes');
for(const value of ['__proto__','constructor','toString']){
 rows=[{id:'unknown-prototype',title:'继承属性枚举回归',state:value,deliveries:[{platform:value,state:value,message:'unknown raw diagnostic'}]}];await listRead();tree=render();assert.doesNotThrow(()=>renderToStaticMarkup(tree),'unknown inherited enum names cannot become React objects or functions');assert.match(renderToStaticMarkup(tree),/进度待确认/);
}

rows=[{id:'session=synthetic-secret',title:'未知编号保密回归',state:'uploaded',has_result:true,deletion_supported:true}];await listRead();tree=render();html=renderToStaticMarkup(tree);assert.doesNotMatch(html,/synthetic-secret/,'an unexpected record ID cannot enter download URLs or debug copy');assert.equal(all(tree,'a').filter(node=>String(node.props.href).endsWith('/download')).length,0,'a download href needs a canonical UUID');
const previewDelete=all(tree,'button').find(node=>text(node)==='永久删除');assert.ok(previewDelete,'the existing local delete confirmation remains available');previewDelete.props.onClick();tree=render();html=renderToStaticMarkup(tree);assert.doesNotMatch(html,/synthetic-secret/,'delete confirmation text, IDs and aria references cannot echo an unknown record ID');assert.match(html,/编号未展示/);
checkDeleteAria(deleteConfirmation(tree));all(deleteConfirmation(tree),'button').find(node=>text(node)==='取消').props.onClick();tree=render();assert.equal(deleteConfirmation(tree),undefined,'cancel removes the unknown-ID confirmation without a request');

const deleteId='00000000-0000-4000-8000-000000000777';
rows=[saved,{id:deleteId,title:'合法编号删除确认回归',state:'uploaded',deletion_supported:true}];await listRead();tree=render();
const savedDownload=()=>all(tree,'a').filter(node=>node.props.href===`/api/articles/${saved.id}/download`);
assert.equal(savedDownload().length,1,'the completed Word download remains available beside an uploaded article');
all(articleCard(tree,deleteId),'button').find(node=>text(node)==='永久删除').props.onClick();tree=render();
checkDeleteAria(deleteConfirmation(tree));assert.match(text(deleteConfirmation(tree)),new RegExp(deleteId));assert.equal(savedDownload().length,1,'opening an unrelated delete confirmation preserves the original download href');
all(deleteConfirmation(tree),'button').find(node=>text(node)==='取消').props.onClick();tree=render();assert.equal(deleteConfirmation(tree),undefined,'cancel clears the legal-ID confirmation using only local state');assert.equal(savedDownload().length,1,'cancel preserves the original Word download');

rows=['needs_login','needs_verification','failed'].map((state,index)=>({id:`handling-${index}`,title:`本人处理说明 ${index}`,state,error:'unknown raw diagnostic'}));await listRead();tree=render();
assert.match(text(articleCard(tree,'handling-0')),/请完成本人登录/);
for(const id of ['handling-1','handling-2'])assert.match(text(articleCard(tree,id)),/请让小鱼核对/);
rows=[{id:saved.id,title:'数量字段保密回归',state:'processing',list_section:'work'}];
for(const value of [3,'session=synthetic-secret',-1,1.5,null]){
 pendingTotalFixture=value;await listRead();tree=render();html=renderToStaticMarkup(tree);assert.doesNotMatch(html,/synthetic-secret/,'the real pending_total payload cannot disclose raw text');assert.match(html,value===3?/3 篇待处理/:/待处理数量暂未确认/);
}
pendingTotalFixture=undefined;

for(const probe of diagnosticProbes){
 transportFixture={url:'/api/articles',method:'GET',status:500,body:{error:probe}};await listRead(true);tree=render();html=renderToStaticMarkup(tree);assert.ok(!html.includes(probe));assert.doesNotMatch(html,/synthetic-secret|\\u0073ynthetic|unrecognized public diagnostic prose/,'Home GET errors use fixed display copy');
 await listRead();tree=render();
}
const submitId='00000000-0000-4000-8000-000000000888';
rows=[{id:submitId,title:'提交响应保密回归',state:'uploaded',recovery:{unfinished:true,can_notify:true,can_retry:false}}];await listRead();tree=render();
for(const probe of diagnosticProbes)for(const mode of ['error','raw_state','transport_error']){
 transportFixture={url:`/api/articles/${submitId}/submit`,method:'POST',status:mode==='error'?500:200,body:mode==='error'?{error:probe}:{id:submitId,state:probe,notification:{state:probe}},...(mode==='transport_error'?{reject:probe}:{})};
 const button=all(tree,'button').find(node=>text(node)==='求助小鱼');assert.ok(button);button.props.onClick();for(let turn=0;turn<8;turn++)await new Promise(resolve=>setImmediate(resolve));tree=render();html=renderToStaticMarkup(tree);assert.equal(transportFixture,null,'the real submit handler must consume the exact inert response');assert.ok(!html.replaceAll('&quot;','"').includes(probe));assert.doesNotMatch(html,/synthetic-secret|\\u0073ynthetic|unrecognized public diagnostic prose/,'submit error bodies, unknown result states and thrown errors never become display text');
}
console.log('PASS: actual Home SSR and JSX handlers: native folds, focus, refresh, independent completion and retained actions; closed diagnostic display, official draft links, whole Home/Word DOM credential probes, and explicit handling guidance. Browser visual/keyboard QA remains separately unverified.');
