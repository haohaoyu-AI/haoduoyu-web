import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
import {renderToStaticMarkup} from 'react-dom/server';

const nativeRequire=createRequire(import.meta.url);
const source=fs.readFileSync('components/outline-run.tsx','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
let selected=null,index=0,effects=0;
const exports={};
const forbidden=()=>{effects++;throw Error('Diagnostic rendering must remain offline and read-only');};
vm.runInNewContext(compiled,{exports,require:name=>name==='react'?{useState:initial=>[index++===1?selected:initial,forbidden],useRef:initial=>({current:initial})}:name==='./daily-run-stream'?{readDailyNdjson:forbidden}:nativeRequire(name),fetch:forbidden,sessionStorage:{setItem:forbidden},localStorage:{setItem:forbidden},Set});
const display=exports.outlineAttemptDiagnostics;
const fields=['http_status','code','media_type','response_bytes','stop_reason','message_stop_received','elapsed_ms'];
const safe={http_status:200,code:'outline_stream_incomplete',media_type:'text/event-stream',response_bytes:43210,stop_reason:'end_turn',message_stop_received:false,elapsed_ms:299001};
const values=diagnostic=>Object.fromEntries(display(diagnostic).map(row=>[row.key,row.value]));
assert.deepEqual(Object.keys(values(safe)),fields,'only seven explicit fields are rendered');
assert.deepEqual(values(safe),{http_status:'200',code:'outline_stream_incomplete',media_type:'text/event-stream',response_bytes:'43210',stop_reason:'end_turn',message_stop_received:'否',elapsed_ms:'299001'});
assert.equal(values({...safe,message_stop_received:true}).message_stop_received,'是');
assert.equal(values({...safe,response_bytes:0,elapsed_ms:0}).response_bytes,'0');
assert.equal(values({...safe,response_bytes:0,elapsed_ms:0}).elapsed_ms,'0');
for(const input of [undefined,null,false,524,'raw provider text',[]])assert.equal(display(input),null);
assert.ok(Object.values(values({})).every(value=>value==='未记录'));
assert.ok(Object.values(values(Object.fromEntries(fields.map(key=>[key,null])))).every(value=>value==='未记录'));
for(const code of ['upstream_http_error','upstream_parameters_rejected','output_truncated','stop_reason_unknown','missing_text','outline_unexpected_origin','outline_empty_body','outline_response_too_large','outline_body_interrupted','outline_invalid_stream','outline_stream_error','outline_stream_incomplete','outline_stream_event_too_large','outline_unsupported_media_type','outline_invalid_utf8','unsafe_response','timeout','aborted','invalid_response_json','request_failed'])assert.equal(values({code}).code,code);

// Provider-controlled strings, nested objects and extra keys never appear in the diagnostic panel.
const secrets=['Bearer PRIVATE_HEADER_SENTINEL','44444444-4444-4444-8444-444444444444','<script>PRIVATE_SCRIPT_SENTINEL</script>','sk-PRIVATE_KEY_SENTINEL'];
for(const secret of secrets){
 for(const field of fields){
  for(const injected of [secret,{value:secret},[secret]]){
   const rows=display({...safe,[field]:injected,raw_response:secret,headers:{authorization:secret},token:secret,error:secret,nested:{value:secret}});
   assert.ok(!JSON.stringify(rows).includes(secret));
   assert.equal(rows.find(row=>row.key===field).value,'未识别或已隐藏');
  }
 }
}
for(const field of ['response_bytes','elapsed_ms'])for(const bad of [-1,1.5,Infinity,NaN,Number.MAX_SAFE_INTEGER+1,true])assert.equal(values({[field]:bad})[field],'未识别或已隐藏');
for(const bad of [0,99,600,200.5,'524',true])assert.equal(values({http_status:bad}).http_status,'未识别或已隐藏');
for(const status of [100,200,400,524,599])assert.equal(values({http_status:status}).http_status,String(status));
assert.ok(Object.values(values(Object.create(safe))).every(value=>value==='未记录'),'inherited fields are excluded');

function render(outlineResult,bodyResult,state='outline_failed'){
 index=0;selected={run_id:'safe-run',state,snapshot_sha256:'safe-hash',snapshot:{model:'claude-test',prompt_version:'test',capability:{max_output_tokens:128000}},outline:null,review:null,stages:{outline:{state:'failed',result:outlineResult},body:{state:'completed',result:bodyResult}}};
 return renderToStaticMarkup(exports.default());
}
const full=render({error:'安全失败提示',partial_text:'框架部分文本',diagnostic:{...safe,http_status:524,code:'upstream_http_error',media_type:'text/html',raw_response:secrets[0],headers:{authorization:secrets[1]},token:secrets[2]}},{text:'正文完成文本',diagnostic:{...safe,code:undefined,message_stop_received:true}});
assert.equal((full.match(/本次请求诊断（只读）/g)||[]).length,2,'both outline and body attempt diagnostics are visible');
for(const text of ['HTTP 状态','524','upstream_http_error','text/html','response_bytes','stop_reason','message_stop_received','elapsed_ms','框架部分文本','正文完成文本','安全失败提示','缺失不代表请求未发生'])assert.ok(full.includes(text),text);
for(const secret of secrets)assert.ok(!full.includes(secret));
const old=render({text:'旧结果',diagnostic:{http_status:200}},{text:'无诊断的旧正文'});
assert.equal((old.match(/本次请求诊断（只读）/g)||[]).length,1);
assert.equal((old.match(/未记录/g)||[]).length,6,'missing stream fields stay unknown for historical JSON attempts');
assert.equal((render({text:'旧结果'},{text:'旧正文'}).match(/本次请求诊断（只读）/g)||[]).length,0);
assert.equal(effects,0,'rendering does not fetch, mutate state, persist or generate');
const diagnosticsSource=source.slice(source.indexOf('// Diagnostics are display-only.'),source.indexOf("type Action='"));
assert.doesNotMatch(diagnosticsSource,/fetch\(|readDailyNdjson|JSON\.stringify|localStorage|sessionStorage|<button|<form|onClick|onSubmit|useState|useEffect/,'diagnostics introduce no action, serialization or state machinery');
console.log('PASS outline diagnostics: seven safe fields; stream + HTTP524 + historical results; hostile values hidden; zero network, storage or state changes');
