import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {renderToStaticMarkup} from 'react-dom/server';
const nativeRequire=createRequire(import.meta.url),source=fs.readFileSync('components/outline-run.tsx','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
let selected=null,index=0;const exports={};
vm.runInNewContext(compiled,{exports,require:name=>name==='react'?{useState:initial=>[index++===1?selected:initial,()=>{}],useRef:initial=>({current:initial})}:name==='./daily-run-stream'?{readDailyNdjson:()=>{throw Error('No network in rendering test');}}:nativeRequire(name),Set});
const display=exports.outlineHandoffDisplay;
assert.equal(display({state:'outline_pending'}),null);
for(const state of ['final_saved','finalized']){
 const waiting=display({state,pipeline_state:'dispatching',resume_action:'read_only',handoff_error:'只读等待'});assert.match(waiting.status,/正在进行或待核验/);assert.match(waiting.next,/只读刷新/);assert.ok(!waiting.status.includes('已交接'));assert.equal(waiting.error,'只读等待');
 assert.match(display({state,pipeline_state:'dispatching',resume_action:'finalize_verified'}).next,/只读刷新/);
 const retry=display({state,pipeline_state:'needs_connection',resume_action:'finalize_verified',handoff_error:'连接待恢复'});assert.match(retry.status,/待恢复/);assert.match(retry.next,/恢复同一成稿/);assert.equal(retry.error,'连接待恢复');
 assert.match(display({state,pipeline_state:'needs_connection',resume_action:'read_only'}).next,/只读刷新/);
 const submitted=display({state,pipeline_state:'submitted',resume_action:'read_only'});assert.equal(submitted.status,'复核成稿已交接');assert.match(submitted.next,/只读查看交接结果/);
 assert.match(display({state}).status,/状态待核验/);
}
function render(pipeline_state,resume_action,handoff_error=null){index=0;selected={run_id:'safe-run',state:'final_saved',pipeline_state,resume_action,handoff_error,snapshot:{model:'claude-test',prompt_version:'test',capability:{max_output_tokens:128000}},outline:null,review:null,stages:{outline:{state:'completed'},body:{state:'completed'}}};return renderToStaticMarkup(exports.default());}
const waitingHtml=render('dispatching','read_only','交接正在进行');assert.match(waitingHtml,/只读刷新状态/);assert.ok(!waitingHtml.includes('图文交接待恢复'));assert.ok(!waitingHtml.includes('复核成稿已交接'));
const recoveryHtml=render('needs_connection','finalize_verified','连接暂不可用');assert.match(recoveryHtml,/连接暂不可用/);assert.match(recoveryHtml,/恢复同一成稿/);
assert.match(render('submitted','read_only'),/复核成稿已交接/);
const escaped=render('needs_connection','read_only','<script>unsafe</script>');assert.ok(!escaped.includes('<script>unsafe</script>'));assert.match(escaped,/&lt;script&gt;/);
console.log('PASS helper handoff render: submitted success only; dispatching read-only wait; needs_connection server-directed recovery; unknown safe read-only; handoff error escaped; zero network');
