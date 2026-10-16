// Actual component hooks and handlers, with only modal paint and transport mocked.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
const native=createRequire(import.meta.url);
const js=ts.transpileModule(fs.readFileSync('components/article-list-clear.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const valid='00000000-0000-4000-8000-000000000001',newId='00000000-0000-4000-8000-000000000002';
const base={operation_id:'00000000-0000-4000-8000-000000000099',owner:'ISOLATED-OWNER',scope:'publish',state:'previewed',snapshot_sha256:'a'.repeat(64),count:1,file_count:1,bytes:3,file_scope:'本站原文、Word；外部附件不在范围内',retained_metadata:'删除完成后只留技术元数据',items:[{article_id:valid,title:'隔离稿',state:'previewed',files:[{key:`articles/${valid}/source`,size:3}]}]};
const all=(root,type)=>{const out=[];function walk(n){if(Array.isArray(n)){n.forEach(walk);return;}if(!n?.props)return;if(n.type===type)out.push(n);walk(n.props.children);}walk(root);return out;};
const text=n=>Array.isArray(n)?n.map(text).join(''):typeof n==='string'||typeof n==='number'?String(n):n?.props?text(n.props.children):'';
const button=(tree,label)=>all(tree,'button').find(b=>text(b)===label);
let cases=0;
function harness({scope='publish',storage=new Map(),transport}={}){
 const states=[],refs=[],effects=[],calls=[],deleted=[];let si=0,ri=0;
 const hooks={useState(initial){const i=si++;if(!(i in states))states[i]=initial;return[states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];},useRef(initial){return refs[ri++]??={current:initial};},useEffect(fn){effects.push(fn);}};
 const modal=Object.fromEntries(['AlertDialog','AlertDialogContent','AlertDialogTitle','AlertDialogDescription','AlertDialogFooter','AlertDialogCancel'].map(name=>[name,()=>null]));
 const ex={};const fetch=async(url,options)=>{calls.push({url,options,body:options?.body?JSON.parse(options.body):null});return transport(url,options,calls);};
 vm.runInNewContext(js,{exports:ex,require:n=>n==='react'?hooks:n==='./ui/alert-dialog'?modal:native(n),sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},crypto:webcrypto,AbortSignal,Error,JSON,Set,fetch});
 const props={scope,articleIds:[valid],disabled:false,onDeleted:ids=>deleted.push(ids)};
 function render(){si=ri=0;return ex.default(props);}const tree=render();effects.splice(0).forEach(fn=>fn());
 return{render,tree,calls,deleted,props,storage};
}
const response=(value,status=200)=>new Response(JSON.stringify(value),{status});
async function test(name,fn){await fn();cases++;console.log('PASS '+name);}
await test('preview shows exact owner/scope/IDs/count/files; checkbox and separate confirmation required; props/new records never widen snapshot',async()=>{
 let release;const waiting=new Promise(r=>release=r);
 const h=harness({transport:async(url,options)=>{const body=JSON.parse(options?.body||'{}');if(body.action==='preview')return response(base);if(body.action==='confirm'){await waiting;return response({...base,state:'deleted'});}throw Error('unexpected');}});
 assert.equal(button(h.tree,'一键清空最近文章').props.disabled,false);await button(h.tree,'一键清空最近文章').props.onClick();let tree=h.render();assert.equal(h.calls.length,1);assert.equal(h.calls[0].body.action,'preview');assert.match(text(tree),/ISOLATED-OWNER/);assert.match(text(tree),new RegExp(valid));assert.match(text(tree),/1 篇/);assert.match(text(tree),/1 个文件/);assert.match(text(tree),/不可恢复/);assert.equal(button(tree,'确认永久删除上述快照').props.disabled,true);
 all(tree,'input')[0].props.onChange({target:{checked:true}});h.props.articleIds=[newId];tree=h.render();const first=button(tree,'确认永久删除上述快照').props.onClick();const second=button(tree,'确认永久删除上述快照').props.onClick();assert.equal(h.calls.length,2);assert.deepEqual(h.calls[1].body.confirm_ids,[valid]);assert.equal(h.calls[1].body.confirm_owner,base.owner);assert.equal(h.calls[1].body.snapshot_sha256,base.snapshot_sha256);release();await Promise.all([first,second]);tree=h.render();assert.equal(h.deleted.length,1);assert.deepEqual(h.deleted[0],[valid]);assert.match(text(tree),/技术元数据/);
});
await test('lost preview response reads same request key, lost confirmed response reads same operation, no extra mutation or expansion',async()=>{
 let saved;
 const h=harness({transport:async(url,options)=>{const body=JSON.parse(options?.body||'{}');if(body.action==='preview'){saved=base;throw Error('lost preview reply');}if(body.action==='confirm'){saved={...base,state:'deleted'};throw Error('lost confirmation reply');}assert.match(url,/request_key=|operation_id=/);return response(saved);}});
 await button(h.tree,'一键清空最近文章').props.onClick();let tree=h.render();assert.equal(h.calls[0].body.action,'preview');assert.equal(h.calls[1].options.method,undefined);assert.match(h.calls[1].url,new RegExp(h.calls[0].body.request_key));all(tree,'input')[0].props.onChange({target:{checked:true}});h.props.articleIds=[newId];tree=h.render();await button(tree,'确认永久删除上述快照').props.onClick();assert.equal(h.calls.filter(c=>c.options?.method==='POST').length,2);assert.match(h.calls.at(-1).url,new RegExp(base.operation_id));assert.equal(h.deleted.length,1);
});
await test('partial file failure preserves original operation through reload; continuation keeps original IDs',async()=>{
 let saved=base,n=0;
 const transport=async(url,options)=>{const body=JSON.parse(options?.body||'{}');if(body.action==='preview')return response(base);if(body.action==='confirm'){if(++n===1){saved={...base,state:'deleting'};return response({error:'部分文件未完成'},503);}saved={...base,state:'deleted'};return response(saved);}return response(saved);};
 const h=harness({transport});await button(h.tree,'一键清空最近文章').props.onClick();let tree=h.render();all(tree,'input')[0].props.onChange({target:{checked:true}});await button(h.render(),'确认永久删除上述快照').props.onClick();assert.equal(h.deleted.length,0);assert.equal(h.storage.size,1);
 const reload=harness({storage:h.storage,transport});await Promise.resolve();reload.props.articleIds=[newId];await button(reload.render(),'回读原清空操作').props.onClick();tree=reload.render();assert.match(text(tree),/只处理原快照/);all(tree,'input')[0].props.onChange({target:{checked:true}});await button(reload.render(),'确认继续原操作').props.onClick();assert.deepEqual(reload.calls.find(c=>c.body?.action==='confirm').body.confirm_ids,[valid]);assert.equal(reload.deleted.length,1);
});
await test('definitive preview refusal allows fresh user preview, explicit unconfirmed cancellation performs no deletion',async()=>{
 let reject=true;
 const h=harness({transport:async(url,options)=>{const b=JSON.parse(options.body);if(reject){reject=false;return response({error:'列表已变化'},409);}return response({...base,state:b.action==='cancel'?'cancelled':'previewed'});}});
 await button(h.tree,'一键清空最近文章').props.onClick();let tree=h.render();assert.equal(h.storage.size,0);assert.match(text(tree),/列表已变化/);await button(tree,'一键清空最近文章').props.onClick();tree=h.render();await button(tree,'取消未确认预览').props.onClick();assert.equal(h.deleted.length,0);assert.equal(h.storage.size,0);assert.equal(h.calls.filter(c=>c.body?.action==='confirm').length,0);
});
await test('writing button uses its own scope; disabled and empty list cannot initiate mutation through normal click',async()=>{
 const h=harness({scope:'writing',transport:async()=>response({...base,scope:'writing'})});h.props.disabled=true;let tree=h.render();assert.equal(button(tree,'一键清空最近文章').props.disabled,true);await button(tree,'一键清空最近文章').props.onClick();assert.equal(h.calls.length,0);h.props.disabled=false;await button(h.render(),'一键清空最近文章').props.onClick();assert.equal(h.calls[0].body.scope,'writing');assert.match(text(h.render()),/写作台/);
});
await test('lost unsaved preview followed by definitive 404 releases preview only; confirmed recovery ID remains on 404',async()=>{
 let first=true;
 const h=harness({transport:async(url,options)=>{if(!options?.method)return response({error:'未找到原操作'},404);if(first){first=false;throw Error('request lost before persistence');}return response(base);}});
 await button(h.tree,'一键清空最近文章').props.onClick();assert.equal(h.storage.size,0);assert.equal(h.deleted.length,0);assert.match(text(h.render()),/可以重新预览/);
 await button(h.render(),'一键清空最近文章').props.onClick();assert.equal(h.storage.size,1);assert.equal(h.calls.filter(c=>c.body?.action==='confirm').length,0);
 await button(h.render(),'回读原清空操作').props.onClick();assert.equal(h.storage.size,1,'known operation must retain recovery identity even if current account cannot read it');
});
await test('residual state is truthful and cleanup requires explicit confirmation of the same operation',async()=>{
 const h=harness({transport:async(url,options)=>{const b=JSON.parse(options?.body||'{}');return response({...base,state:b.action==='confirm'?'deleted':'needs_verification'});}});await button(h.tree,'一键清空最近文章').props.onClick();let tree=h.render();assert.match(text(tree),/尚未确认清净/);assert.equal(h.deleted.length,0);assert.equal(button(tree,'确认清理原快照残留').props.disabled,true);all(tree,'input')[0].props.onChange({target:{checked:true}});await button(h.render(),'确认清理原快照残留').props.onClick();assert.equal(h.calls[1].body.operation_id,base.operation_id);assert.deepEqual(h.calls[1].body.confirm_ids,[valid]);assert.equal(h.deleted.length,1);
});
await test('completed-operation readback remains available after reload without blocking a fresh preview',async()=>{
 let state='previewed';const transport=async(url,options)=>{const b=JSON.parse(options?.body||'{}');if(b.action==='confirm')state='deleted';return response({...base,state});};
 const h=harness({transport});await button(h.tree,'一键清空最近文章').props.onClick();all(h.render(),'input')[0].props.onChange({target:{checked:true}});await button(h.render(),'确认永久删除上述快照').props.onClick();assert.ok(button(h.render(),'回读上次清空结果'));assert.ok(button(h.render(),'一键清空最近文章'));state='needs_verification';const reload=harness({transport,storage:h.storage});await Promise.resolve();await button(reload.render(),'回读上次清空结果').props.onClick();assert.match(text(reload.render()),/尚未确认清净/);assert.match(reload.calls[0].url,new RegExp(base.operation_id));assert.equal(reload.calls.filter(c=>c.options?.method==='POST').length,0);assert.equal(reload.deleted.length,0);
});
console.log(`PASS ${cases} actual list-clear component interaction/recovery scenarios; no browser or production I/O.`);
