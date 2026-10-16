import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {invalidOutlines} from './fixtures/writing-outline.mjs';

const nativeRequire=createRequire(import.meta.url),sql=new DatabaseSync(':memory:');
for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
const db={prepare:s=>({bind:(...v)=>({first:async()=>sql.prepare(s).get(...v)||null,all:async()=>({results:sql.prepare(s).all(...v)}),run:async()=>({meta:{changes:Number(sql.prepare(s).run(...v).changes)}})})})};
let providerCalls=0;
const modules={},globals={crypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Set,Error,URL,btoa,atob,Date,File,ReadableStream,Request,Response,AbortSignal};
function load(name){
 if(modules[name])return modules[name];
 const ex={};modules[name]=ex;
 const js=ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(js,{...globals,exports:ex,require:n=>n==='cloudflare:workers'?{env:{DB:db}}:n==='./events'?{readiness:async()=>({connected:false}),dispatch:async()=>{throw Error('Unexpected dispatch');}}:n.startsWith('./')?load(n.slice(2)):nativeRequire(n),fetch:()=>{providerCalls++;throw Error('No provider/network allowed');}});
 return ex;
}
const guidance=load('writing-outline-template'),fixed=load('writing-fixed-references'),writing=load('writing');
const {writingOutlineTemplate:template,writingOutlineHelp:help,writingOutlineError:publicError}=guidance;
assert.throws(()=>fixed.normalizeWritingOutline(template,true),/框架/);
const replacement={
 '热榜平台':'离线合成榜单（只作测试）','热榜原始HTTPS链接':'https://example.com/trend',
 'YYYY-MM-DD HH:mm（时区）':'2026-10-05 08:00（北京时间）','可见排名或访问缺口':'合成记录第8位，未访问真实榜单',
 '标题方向':'从影院场次变化看实际观众选择的证据','核心判断与读者问题':'场次增长只说明供给变动，读者问题是入场人数能否同时支撑观众偏好的变化',
 '开头钩子与必要背景':'以合成影院公告增加两场放映的具体动作作钩子，交代四场改为六场的同一观察窗口',
 '第一节小标题':'增加场次先说明了什么','第一节目标字数':'1100',
 '第一节核实事实与来源链接或序号':'来源一的合成影院公告在相同统计窗口记录场次从四场到六场，https://example.com/one',
 '第一节新增信息与判断推进':'先把供给变化与观众选择分开，场次本身不能推出口碑，留下入场人数能否跟进的问题',
 '开头与第一节的衔接':'接住开头提出的排片增长问题，先限定公告所能证明的范围',
 '第二节小标题':'观众留下的那张票','第二节目标字数':'1050',
 '第二节核实事实与来源链接或序号':'来源二的合成售票记录同时列出可售座位与入场人数，两项口径一致，https://example.com/two',
 '第二节新增信息与判断推进':'用相同窗口的实际入场证据回应排片等于受欢迎的看法，进一步区分供给和需求',
 '第一节与第二节的衔接':'从上一节留下的观众是否跟进的问题，转到第二份合成记录的入场数字',
 '旧认识、新认识及转弯的事实依据':'旧认识只看场次，新认识同时看人数与座位，转弯来自来源二记录的同窗口数据',
 '结尾的具体画面动作或数字':'回到影院公告新增两场放映与售票记录入场人数的具体对比，回答实际选择是否跟进',
};
const filled=template.replace(/\[待填写：([^\]]+)\]/g,(_,key)=>{assert.ok(key in replacement,key);return replacement[key];});
assert.equal(fixed.normalizeWritingOutline(filled,true),filled);
assert.throws(()=>fixed.normalizeWritingOutline(filled.replace(replacement['标题方向'],'[待填写：标题方向]'),true),/框架/);
for(const outline of invalidOutlines)assert.throws(()=>fixed.normalizeWritingOutline(outline,true),/框架/);
assert.equal(load('manual-errors').manualPublicError(Error(publicError)),publicError);
assert.equal(load('manual-errors').manualPublicError(Error('SQL PRIVATE_SENTINEL'),'固定回退'),'固定回退');
assert.equal(createHash('sha256').update(fixed.proseReference).digest('hex'),'17cbbf7a9a522df31ccb9d9ca80b6b757f9a31e2788ff8ccbef3a7773dd583eb');
assert.equal(fixed.conciseWritingStyle.length,280);
assert.equal(/^\s*import\s/m.test(fs.readFileSync('lib/writing-outline-template.ts','utf8')),false);
assert.equal(/孙杨|肖战|猪景房/.test(template),false);
const brief=await writing.writingCall('guidance-owner','read_writing_brief',{});
assert.equal(brief.outline_template,template);assert.equal(brief.outline_help,help);
assert.equal(writing.writingTools.find(t=>t.name==='prepare_writing_input').inputSchema.properties.outline.description.includes(template),true);
const manualSchema=writing.writingTools.find(t=>t.name==='create_manual_writing_batch').inputSchema.properties;
for(const writer of ['xiaoyu','claude'])assert.equal(manualSchema[writer].properties.outline.description.includes(template),true);

function route(file){
 const ex={};const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(js,{...globals,exports:ex,require:n=>n.endsWith('/test-store')?{db:()=>db,owner:r=>r.headers.get('test-owner')||null}:n.includes('/lib/')?load(n.split('/').at(-1)):nativeRequire(n)});
 return ex;
}
const manualRoute=route('app/api/writing/manual/route.ts'),listRoute=route('app/api/writing/route.ts');
const get=url=>new Request('https://example.com'+url,{headers:{'test-owner':'guidance-owner'}});
for(const [module,url] of [[manualRoute,'/api/writing/manual'],[listRoute,'/api/writing']]){
 const response=await module.GET(get(url));assert.equal(response.status,200);
 const body=await response.json();assert.equal(body.outline_template,template);assert.equal(body.outline_help,help);
}
sql.prepare('INSERT INTO claude_settings(owner,model,secret,enabled,updated) VALUES(?,?,?,?,?)').run('guidance-owner','claude-test','offline-unused','1',new Date().toISOString());
const topic={topic:'离线合成排片证据',materials:'这是明确标注的合成公开资料，只用于结构测试，场次、入场人数和座位口径分别记录，不访问网站或模型。'.repeat(4),outline:filled,sources:[{title:'合成公告记录',url:'https://example.com/one',published:'2026-10-05'},{title:'合成售票记录',url:'https://example.com/two',published:'2026-10-05'}]};
const input={confirm:true,xiaoyu:topic,claude:{...topic,topic:'独立合成观众证据'},expected_model:'claude-test',expected_prompt_version:load('writing-supplement').effectiveWritingStyleVersion};
const post=input=>new Request('https://example.com/api/writing/manual',{method:'POST',headers:{origin:'https://example.com','x-xiaoyu-manual-writing':'1','test-owner':'guidance-owner'},body:JSON.stringify({action:'create',input})});
for(const writer of ['xiaoyu','claude']){
 const invalid={...input,[writer]:{...input[writer],outline:template}};
 const response=await manualRoute.POST(post(invalid));assert.equal(response.status,400);assert.equal((await response.json()).error,publicError);
 assert.equal(sql.prepare('SELECT count(*) n FROM manual_writing_batches').get().n,0);assert.equal(providerCalls,0);
}
const response=await manualRoute.POST(post(input));assert.equal(response.status,200);assert.equal((await response.json()).result.created,true);assert.equal(providerCalls,0);

// Render both forms against read-only mock state so the actual placeholder and help are checked.
function renderPage(file){
 const ex={},mockReact={...React,useState:value=>[value===null?{batch:{},result:null,model:'claude-test',enabled:true,prompt_version:'test'}:value,()=>{}],useRef:value=>({current:value}),useCallback:f=>f,useEffect:()=>{}};
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(js,{...globals,exports:ex,require:n=>n==='react'?mockReact:n.endsWith('/writing-outline-template')?guidance:n.endsWith('/daily-run-stream')?{}:nativeRequire(n)});
 return renderToStaticMarkup(React.createElement(ex.default));
}
for(const page of ['app/writing/daily-run/page.tsx','app/writing/manual-run/page.tsx']){
 const source=fs.readFileSync(page,'utf8');assert.equal(source.includes("from '../../../lib/writing-outline-template'"),true);assert.equal(source.includes('writing-fixed-references'),false);
 const html=renderPage(page);assert.equal(html.includes('placeholder="'+template+'"'),true);assert.equal(html.includes(help),true);
}
console.log('Canonical template rejects placeholders, accepts filled synthetic evidence, preserves prompt bytes, appears identically in brief/tool schemas/APIs/rendered forms; both manual writer routes show exact fixed outline error with zero provider calls');
