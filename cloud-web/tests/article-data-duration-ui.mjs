// Render the actual history page with synthetic records. No production/history import,
// browser, database, platform collection or schedule operations take place.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {renderToStaticMarkup} from 'react-dom/server';
const native=createRequire(import.meta.url);
const code=ts.transpileModule(fs.readFileSync('app/article-data/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function renderTiming(timing){
 const record={history_key:'synthetic-timing',title:'合成用时验收',topic_label:'合成选题',mode:'manual_word_only',completed_at:'2026-10-13T12:00:00.000Z',status:'word_delivered',platforms:{toutiao:{draft_url:null,status:'not_requested'},zhihu:{draft_url:null,status:'not_requested'}},observations:[],timing};
 const history={owner_scope:'synthetic-owner',items:[record],next_offset:null,summary:{processed:1,full_auto:0,semi_auto:1,private_drafts:0},notice:'合成记录'};
 let slot=0;const hooks={useState:initial=>[slot++===0?history:initial,()=>{}],useRef:initial=>({current:initial}),useCallback:fn=>fn,useEffect:()=>{}};
 const exports={};vm.runInNewContext(code,{exports,require:name=>name==='react'?hooks:name==='react/jsx-runtime'?native(name):{default:()=>null},Date,Intl,Array,Map,Set});
 const html=renderToStaticMarkup(exports.default());
 return html.match(/<td data-label="(?:耗时|实际用时)">([\s\S]*?)<\/td>/)?.[1];
}
assert.equal(renderTiming({elapsed_seconds:90,request_to_completion_seconds:180}),'1分30秒','elapsed duration must not borrow the request timer label');
assert.equal(renderTiming({writing_to_completion_seconds:90,request_to_completion_seconds:180}),'1分30秒（写作至完成）','the selected writing duration retains its own range');
assert.equal(renderTiming({request_to_completion_seconds:180}),'3分0秒（请求至完成，含等待）');
assert.equal(renderTiming({scheduled_to_completion_seconds:300}),'5分0秒（计划至完成，含等待）','scheduled elapsed time must not pretend to be active execution time');
assert.equal(renderTiming({elapsed_seconds:0,basis:'executor_report'}),'0分0秒（执行者记录）');
assert.equal(renderTiming({elapsed_seconds:91,precision:'approximate',basis:'source_upload_to_verified_drafts'}),'约 1分31秒（上传原稿至草稿验收）');
assert.equal(renderTiming({writing_to_completion_seconds_range:[90,150]}),'1–3分钟（写作至完成）');
assert.equal(renderTiming({}),'未记录');
assert.equal(renderTiming(undefined),'未记录');
assert.equal(renderTiming({elapsed_seconds:-1}),'未记录');
assert.equal(renderTiming({writing_to_completion_seconds_range:[150,90]}),'未记录');
assert.equal(renderTiming({writing_to_completion_seconds_range:['unknown',150]}),'未记录');
console.log('PASS 12 actual ArticleDataPage timing cases: selected timer basis, explicit waiting range, zero/approximate/range/unknown/invalid; no production or platform I/O.');
