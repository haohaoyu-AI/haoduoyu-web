// Execute the real component's hooks and handlers; only modal paint and transport are isolated.
// This is not a browser or production data acceptance test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
const native=createRequire(import.meta.url);
const js=ts.transpileModule(fs.readFileSync('components/article-content-clear.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const ids=Array.from({length:50},(_,i)=>uuid(i+1));
const base={operation_id:uuid(99),owner:'ISOLATED-OWNER',scope:'all_articles',state:'previewed',snapshot_sha256:'a'.repeat(64),count:50,article_count:47,prior_deleted_count:3,file_count:238,bytes:12345,content_deleted:false,remaining_object_count:238,remaining_content_rows:85,retained_metadata:'只留无正文的防重放和执行安全标记',file_scope:'本站原文、Word、正文历史；外部附件不在范围内',external_execution_note:'未证明外部执行者退出',items:ids.map((article_id,i)=>({article_id,title:i<47?`隔离文章 ${i+1}`:undefined,state:i<47?'word_ready':'deleted'}))};
const done={...base,state:'deleted',content_deleted:true,remaining_object_count:0,remaining_content_rows:0};
const all=(root,type)=>{const out=[];function walk(n){if(Array.isArray(n)){n.forEach(walk);return;}if(!n?.props)return;if(n.type===type)out.push(n);walk(n.props.children);}walk(root);return out;};
const text=n=>Array.isArray(n)?n.map(text).join(''):typeof n==='string'||typeof n==='number'?String(n):n?.props?text(n.props.children):'';
const button=(tree,label)=>all(tree,'button').find(b=>text(b)===label);
const key='xiaoyu:all-article-delete:v1';
function harness({storage=new Map(),transport}={}){
 const states=[],refs=[],effects=[],calls=[],deleted=[];let si=0,ri=0;
 const hooks={useState(initial){const i=si++;if(!(i in states))states[i]=initial;return[states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];},useRef(initial){return refs[ri++]??={current:initial};},useEffect(fn){effects.push(fn);}};
 const modal=Object.fromEntries(['AlertDialog','AlertDialogContent','AlertDialogTitle','AlertDialogDescription','AlertDialogFooter','AlertDialogCancel'].map(name=>[name,()=>null]));
 const ex={};
 const fetch=async(url,options)=>{const call={url,options,body:options?.body?JSON.parse(options.body):null};calls.push(call);return transport(url,options,calls);};
 vm.runInNewContext(js,{exports:ex,require:n=>n==='react'?hooks:n==='./ui/alert-dialog'?modal:native(n),sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},crypto:webcrypto,AbortSignal,Error,JSON,Set,fetch,setTimeout,clearTimeout});
 const props={disabled:false,onDeleted:values=>deleted.push(Array.from(values))};
 function render(){si=ri=0;return ex.default(props);}const tree=render();effects.splice(0).forEach(fn=>fn());
 return{render,tree,calls,deleted,props,storage,modal};
}
const response=(value,status=200)=>new Response(JSON.stringify(value),{status});
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
async function click(h,label){const b=button(h.render(),label);assert.ok(b,`missing button: ${label}`);b.props.onClick();await settle();}
function acknowledge(h){const checkbox=all(h.render(),'input').find(x=>x.props.type==='checkbox');assert.ok(checkbox);checkbox.props.onChange({target:{checked:true}});h.render();}
let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack);}}

await test('exact full snapshot shows owner, 47 live articles, 3 prior-deleted identities and all 50 targets; product checkbox required',async()=>{
 const h=harness({transport:async()=>response(base)});await click(h,'永久清空全部文章');const tree=h.render();
 assert.match(text(tree),/ISOLATED-OWNER/);assert.match(text(tree),/47 篇文章/);assert.match(text(tree),/3 篇此前删除/);assert.match(text(tree),/50 项/);assert.equal(all(tree,'li').length,50);assert.match(text(tree),/238 个本站文件/);assert.match(text(tree),/12345 字节/);assert.match(text(tree),/不可恢复/);assert.match(text(tree),/Library 和电脑目录保留/);
 assert.equal(button(tree,'确认永久删除全部范围').props.disabled,true);await click(h,'确认永久删除全部范围');assert.equal(h.calls.length,1);assert.equal(h.calls[0].body.action,'preview');assert.ok(h.calls[0].body.request_key);assert.equal(h.deleted.length,0);
});
await test('confirm uses owner/fingerprint/all exact IDs and requires an independent no-store GET before success',async()=>{
 let release;const pending=new Promise(resolve=>release=resolve);
 const h=harness({transport:async(url,options)=>{if(!options?.method){await pending;return response(done);}return response(JSON.parse(options.body).action==='preview'?base:done);}});
 await click(h,'永久清空全部文章');acknowledge(h);await click(h,'确认永久删除全部范围');
 assert.equal(h.deleted.length,0,'successful POST alone must never mean cleanup success');const confirm=h.calls.find(c=>c.body?.action==='confirm');assert.deepEqual(confirm.body.confirm_ids,ids);assert.equal(confirm.body.confirm_owner,base.owner);assert.equal(confirm.body.confirm_scope,'all_articles');assert.equal(confirm.body.snapshot_sha256,base.snapshot_sha256);assert.equal(confirm.body.confirm_permanent,true);
 assert.equal(h.calls.at(-1).options.method,undefined);assert.equal(h.calls.at(-1).options.cache,'no-store');assert.match(h.calls.at(-1).url,new RegExp(base.operation_id));release();await settle();assert.deepEqual(h.deleted,[ids]);assert.match(text(h.render()),/已独立确认清除 47 篇/);assert.match(text(h.render()),/无正文/);
});
await test('state deleted with content_deleted false and content_deleted true with state deleting both remain incomplete',async()=>{
 for(const readback of [{...done,content_deleted:false,remaining_object_count:1},{...done,state:'deleting',resume_required:false}]){
  const h=harness({transport:async(url,options)=>response(!options?.method?readback:JSON.parse(options.body).action==='preview'?base:done)});await click(h,'永久清空全部文章');acknowledge(h);await click(h,'确认永久删除全部范围');assert.equal(h.deleted.length,0);assert.ok(h.storage.has(key));assert.doesNotMatch(text(h.render()),/已独立确认清除/);
 }
});
await test('lost preview response reads exact original request key; lost confirmed response reads exact original operation and never creates a new scope',async()=>{
 let saved=base;
 const h=harness({transport:async(url,options)=>{if(options?.method){const body=JSON.parse(options.body);if(body.action==='preview')throw Error('lost preview reply');saved=done;throw Error('lost confirmation reply');}return response(saved);}});
 await click(h,'永久清空全部文章');assert.equal(h.calls.length,2);assert.match(h.calls[1].url,new RegExp(h.calls[0].body.request_key));acknowledge(h);await click(h,'确认永久删除全部范围');assert.equal(h.calls.filter(c=>c.options?.method==='POST').length,2);assert.match(h.calls.at(-1).url,new RegExp(base.operation_id));assert.deepEqual(h.deleted,[ids]);
});
await test('definitive missing unconfirmed preview releases only that request key; known confirmed operation 404 remains recoverable',async()=>{
 let first=true;
 const h=harness({transport:async(url,options)=>{if(!options?.method)return response({error:'未找到原操作'},404);if(first){first=false;throw Error('not persisted');}return response(base);}});
 await click(h,'永久清空全部文章');assert.equal(h.deleted.length,0);assert.equal(h.storage.has(key),false,'an unconfirmed preview proven absent must allow a fresh preview');assert.ok(button(h.render(),'永久清空全部文章'));
 await click(h,'永久清空全部文章');assert.equal(h.storage.has(key),true);await click(h,'回读全部清理结果');assert.equal(h.storage.has(key),true,'a known operation must never lose its recovery identity on 404');assert.equal(h.calls.filter(c=>c.body?.action==='confirm').length,0);
});
await test('unknown confirmation never automatically repeats mutation; refresh first reads same operation and then continues its frozen scope',async()=>{
 let state={...base,state:'deleting',resume_required:false},fail=true;
 const transport=async(url,options)=>{if(!options?.method)return response(state);const b=JSON.parse(options.body);if(b.action==='preview')return response(base);if(fail){fail=false;throw Error('confirmation transport interrupted');}state=done;return response(done);};
 const h=harness({transport});await click(h,'永久清空全部文章');acknowledge(h);await click(h,'确认永久删除全部范围');assert.equal(h.deleted.length,0);assert.equal(h.calls.filter(c=>c.body?.action==='confirm').length,1);
 const reload=harness({storage:h.storage,transport});await settle();assert.equal(reload.calls.length,0);await click(reload,'回读全部清理结果');assert.match(reload.calls[0].url,new RegExp(base.operation_id));assert.equal(reload.calls.filter(c=>c.options?.method==='POST').length,0);assert.equal(button(reload.render(),'继续原永久清理操作').props.disabled,true);acknowledge(reload);await click(reload,'继续原永久清理操作');const confirm=reload.calls.find(c=>c.body?.action==='confirm');assert.deepEqual(confirm.body.confirm_ids,ids);assert.equal(confirm.body.snapshot_sha256,base.snapshot_sha256);assert.deepEqual(reload.deleted,[ids]);
});
await test('bounded eight-article batches resume only original operation under the same product authorization and independent reads',async()=>{
 let confirms=0;
 const h=harness({transport:async(url,options)=>{if(!options?.method)return response(confirms>=6?done:{...base,state:confirms?'deleting':'previewed',resume_required:confirms>0,remaining_content_rows:Math.max(0,47-confirms*8)});const body=JSON.parse(options.body);if(body.action==='preview')return response(base);confirms++;return response(confirms>=6?done:{...base,state:'deleting',resume_required:true});}});
 await click(h,'永久清空全部文章');acknowledge(h);await click(h,'确认永久删除全部范围');
 assert.equal(confirms,6,'successful bounded batches must continue without six separate owner confirmations');assert.deepEqual(h.deleted,[ids]);assert.equal(h.calls.filter(c=>c.body?.action==='preview').length,1);assert.equal(h.calls.filter(c=>!c.options?.method).length,6);for(const c of h.calls.filter(c=>c.body?.action==='confirm')){assert.equal(c.body.operation_id,base.operation_id);assert.deepEqual(c.body.confirm_ids,ids);assert.equal(c.body.snapshot_sha256,base.snapshot_sha256);}
});
await test('residual cleanup keeps same operation through reload and requires existing fixed-scope confirmation',async()=>{
 let state={...base,state:'needs_verification',remaining_object_count:1};
 const transport=async(url,options)=>{if(!options?.method)return response(state);const b=JSON.parse(options.body);if(b.action==='preview')return response(state);state=done;return response(done);};
 const h=harness({transport});await click(h,'永久清空全部文章');assert.equal(h.deleted.length,0);assert.equal(h.calls.filter(c=>c.body?.action==='confirm').length,0);const reload=harness({storage:h.storage,transport});await settle();await click(reload,'回读全部清理结果');assert.match(text(reload.render()),/续接原操作，范围保持不变/);acknowledge(reload);await click(reload,'继续原永久清理操作');assert.deepEqual(reload.deleted,[ids]);assert.equal(reload.calls.filter(c=>c.body?.action==='preview').length,0);
});
await test('double click is locked before first async request finishes; disabled cannot mutate; modal close resets checkbox',async()=>{
 let release,confirmed=false;const waiting=new Promise(resolve=>release=resolve);
 const h=harness({transport:async(url,options)=>{if(!options?.method)return response(confirmed?done:base);const b=JSON.parse(options.body);if(b.action==='preview')return response(base);await waiting;confirmed=true;return response(done);}});
 h.props.disabled=true;await click(h,'永久清空全部文章');assert.equal(h.calls.length,0);h.props.disabled=false;await click(h,'永久清空全部文章');acknowledge(h);let tree=h.render();all(tree,h.modal.AlertDialog)[0].props.onOpenChange(false);h.render();assert.equal(button(h.render(),'确认永久删除全部范围').props.disabled,true);await click(h,'回读全部清理结果');acknowledge(h);tree=h.render();const clicker=button(tree,'确认永久删除全部范围');clicker.props.onClick();clicker.props.onClick();await settle();assert.equal(h.calls.filter(c=>c.body?.action==='confirm').length,1);release();await settle();assert.deepEqual(h.deleted,[ids]);
});
await test('a continuation response for another operation, owner, snapshot or ordered ID set is rejected before success or scope replacement',async()=>{
 for(const altered of [{...done,operation_id:uuid(100)},{...done,owner:'OTHER-OWNER'},{...done,snapshot_sha256:'b'.repeat(64)},{...done,items:[...done.items].reverse()}]){
  const h=harness({transport:async(url,options)=>response(!options?.method?altered:JSON.parse(options.body).action==='preview'?base:done)});await click(h,'永久清空全部文章');acknowledge(h);await click(h,'确认永久删除全部范围');assert.equal(h.deleted.length,0,'a mismatched destructive snapshot must not be accepted');const stored=JSON.parse(h.storage.get(key));assert.equal(stored.operation_id,base.operation_id);assert.match(text(h.render()),/核验|不匹配|范围/);
 }
});
await test('completion preserves a last-operation read but allows a fresh preview; late residual read does not create another preview',async()=>{
 let state=base;
 const transport=async(url,options)=>{if(!options?.method)return response(state);const b=JSON.parse(options.body);if(b.action==='confirm'){state=done;return response(done);}return response({...base,operation_id:uuid(101)});};
 // Keep first operation stable to isolate last-read/fresh-preview behavior.
 const first=harness({transport:async(url,options)=>{if(!options?.method)return response(state);const b=JSON.parse(options.body);if(b.action==='confirm')state=done;return response(state);}});await click(first,'永久清空全部文章');acknowledge(first);await click(first,'确认永久删除全部范围');assert.ok(button(first.render(),'回读上次全部清理'));assert.ok(button(first.render(),'永久清空全部文章'));assert.equal(first.storage.has(key),false);assert.ok(first.storage.has(`${key}:last`));
 const reload=harness({storage:first.storage,transport});await settle();await click(reload,'永久清空全部文章');assert.equal(reload.calls[0].body.action,'preview');assert.notEqual(reload.calls[0].body.request_key,JSON.parse(first.storage.get(`${key}:last`)).request_key);
 const after=harness({storage:new Map([[`${key}:last`,first.storage.get(`${key}:last`)]]),transport:async()=>response({...done,state:'needs_verification',content_deleted:false,remaining_object_count:1})});await settle();await click(after,'回读上次全部清理');assert.match(after.calls[0].url,new RegExp(base.operation_id));assert.equal(after.calls.filter(c=>c.options?.method==='POST').length,0);assert.equal(after.deleted.length,0);assert.ok(after.storage.has(key));
});
await test('expired or changed unconfirmed preview is abandoned atomically and independently read before a fresh scope and checkbox',async()=>{
 for(const reason of ['原预览已过期','原快照内容已变化']){
  let saved=base,previews=0;const replacement={...base,operation_id:uuid(102),snapshot_sha256:'b'.repeat(64),count:51,article_count:48,items:[...base.items,{article_id:uuid(51),title:'新增合成目标'}]};
  const h=harness({transport:async(url,options)=>{if(!options?.method)return response(saved);const b=JSON.parse(options.body);if(b.action==='preview'){previews++;saved=previews===1?base:replacement;return response(saved);}if(b.action==='confirm')return response({error:reason},409);assert.equal(b.action,'abandon_preview');assert.equal(b.operation_id,base.operation_id);saved={...base,state:'cancelled'};return response(saved);}});
  await click(h,'永久清空全部文章');const originalKey=h.calls[0].body.request_key;acknowledge(h);await click(h,'确认永久删除全部范围');assert.equal(h.deleted.length,0);assert.match(text(h.render()),new RegExp(reason));assert.equal(JSON.parse(h.storage.get(key)).operation_id,base.operation_id);
  await click(h,'重新核对清理范围');assert.equal(previews,2);const abandonIndex=h.calls.findIndex(c=>c.body?.action==='abandon_preview'),newPreviewIndex=h.calls.findLastIndex(c=>c.body?.action==='preview');assert.equal(h.calls[abandonIndex+1].options.method,undefined);assert.match(h.calls[abandonIndex+1].url,new RegExp(base.operation_id));assert.ok(newPreviewIndex>abandonIndex+1);assert.notEqual(h.calls[newPreviewIndex].body.request_key,originalKey);assert.equal(JSON.parse(h.storage.get(key)).operation_id,replacement.operation_id);assert.match(text(h.render()),/51 项/);assert.equal(button(h.render(),'确认永久删除全部范围').props.disabled,true);assert.equal(all(h.render(),'input')[0].props.checked,false);assert.equal(h.calls.filter(c=>c.body?.action==='confirm').length,1);
 }
});
await test('lost abandon response uses GET only for recovery and cannot replace a scope while cancellation remains unknown',async()=>{
 let readFailure=false;
 const h=harness({transport:async(url,options)=>{if(!options?.method){if(readFailure)throw Error('cancel read unknown');return response(base);}const b=JSON.parse(options.body);if(b.action==='preview')return response(base);assert.equal(b.action,'abandon_preview');readFailure=true;throw Error('cancel reply lost');}});
 await click(h,'永久清空全部文章');const original=JSON.parse(h.storage.get(key));await click(h,'重新核对清理范围');assert.equal(h.calls.filter(c=>c.body?.action==='abandon_preview').length,1);assert.equal(h.calls.filter(c=>c.body?.action==='preview').length,1);assert.equal(h.calls.at(-1).options.method,undefined);assert.equal(JSON.parse(h.storage.get(key)).operation_id,original.operation_id);assert.equal(h.deleted.length,0);
 // A later explicit read proving cancelled permits a new preview, without re-confirming deletion.
 let saved={...base,state:'cancelled'},previews=0;const recovered=harness({storage:h.storage,transport:async(url,options)=>{if(!options?.method)return response(saved);const b=JSON.parse(options.body);if(b.action==='abandon_preview')return response(saved);assert.equal(b.action,'preview');previews++;saved={...base,operation_id:uuid(103)};return response(saved);}});await settle();await click(recovered,'回读全部清理结果');assert.equal(button(recovered.render(),'继续原永久清理操作').props.disabled,true);await click(recovered,'重新核对清理范围');assert.equal(previews,1);assert.equal(recovered.calls.filter(c=>c.body?.action==='confirm').length,0);assert.equal(button(recovered.render(),'确认永久删除全部范围').props.disabled,true);
});
await test('lost abandon response followed by proven cancellation recovers with reads and only one original abandon mutation',async()=>{
 let saved=base,previews=0;
 const h=harness({transport:async(url,options)=>{if(!options?.method)return response(saved);const b=JSON.parse(options.body);if(b.action==='preview'){saved=++previews===1?base:{...base,operation_id:uuid(104)};return response(saved);}assert.equal(b.action,'abandon_preview');saved={...base,state:'cancelled'};throw Error('cancel reply lost');}});
 await click(h,'永久清空全部文章');await click(h,'重新核对清理范围');assert.equal(previews,2);assert.equal(h.calls.filter(c=>c.body?.action==='abandon_preview').length,1);const at=h.calls.findIndex(c=>c.body?.action==='abandon_preview');assert.equal(h.calls[at+1].options.method,undefined);assert.match(h.calls[at+1].url,new RegExp(base.operation_id));assert.equal(h.deleted.length,0);assert.equal(button(h.render(),'确认永久删除全部范围').props.disabled,true);
});
await test('cancel acknowledgement POST alone cannot clear the original handle or establish a new preview',async()=>{
 const h=harness({transport:async(url,options)=>{if(!options?.method)return response(base);const b=JSON.parse(options.body);return response(b.action==='abandon_preview'?{...base,state:'cancelled'}:base);}});await click(h,'永久清空全部文章');const original=JSON.parse(h.storage.get(key));await click(h,'重新核对清理范围');assert.equal(h.calls.filter(c=>c.body?.action==='preview').length,1);assert.equal(h.calls.filter(c=>!c.options?.method).length,1);assert.equal(JSON.parse(h.storage.get(key)).operation_id,original.operation_id);assert.match(text(h.render()),/未确认已放弃/);assert.equal(h.deleted.length,0);
});
await test('concurrent confirmation winning atomic abandon keeps original confirmed/unknown handle and cannot widen scope',async()=>{
 const h=harness({transport:async(url,options)=>{if(!options?.method)return response({...base,state:'deleting',resume_required:false});const b=JSON.parse(options.body);if(b.action==='preview')return response(base);assert.equal(b.action,'abandon_preview');return response({error:'原操作已确认，无法放弃'},409);}});await click(h,'永久清空全部文章');await click(h,'重新核对清理范围');assert.equal(h.calls.filter(c=>c.body?.action==='preview').length,1);assert.equal(JSON.parse(h.storage.get(key)).operation_id,base.operation_id);assert.equal(button(h.render(),'重新核对清理范围'),undefined);assert.ok(button(h.render(),'继续原永久清理操作'));assert.equal(h.deleted.length,0);assert.match(text(h.render()),/已确认/);
});
await test('completed original scope is read-only and reports two newer pending articles without including or deleting them',async()=>{
 const outside=[uuid(201),uuid(202)],oldHandle={request_key:uuid(200),operation_id:base.operation_id,owner:base.owner,snapshot_sha256:base.snapshot_sha256,article_ids:ids};
 const oldDone={...done,all_owner_articles_empty:false,current_owner_article_count:2,new_article_count:2};
 const fresh={...base,operation_id:uuid(203),snapshot_sha256:'b'.repeat(64),count:2,article_count:2,prior_deleted_count:0,items:outside.map(article_id=>({article_id,title:'范围冻结后新增的合成待处理文章',state:'queued'}))};
 const h=harness({storage:new Map([[`${key}:last`,JSON.stringify(oldHandle)]]),transport:async(url,options)=>{if(!options?.method)return response(oldDone);assert.equal(JSON.parse(options.body).action,'preview');return response(fresh);}});
 await settle();await click(h,'回读上次全部清理');await click(h,'回读上次全部清理');assert.equal(h.calls.length,2);assert.ok(h.calls.every(c=>!c.options?.method));assert.deepEqual(h.deleted,[ids]);const status=all(h.render(),'p').find(x=>x.props.role==='status');assert.match(text(status),/本站另有 2 篇不在原确认范围的文章/);assert.match(text(status),/请重新核对范围/);assert.doesNotMatch(text(status),/全部清零|网站已清零/);assert.equal(all(h.render(),h.modal.AlertDialog)[0].props.open,false);
 await click(h,'永久清空全部文章');assert.equal(h.calls.filter(c=>c.body?.action==='preview').length,1);assert.equal(h.calls.filter(c=>c.body?.action==='confirm').length,0);assert.equal(button(h.render(),'确认永久删除全部范围').props.disabled,true);assert.equal(all(h.render(),'input')[0].props.checked,false);assert.deepEqual(h.deleted,[ids]);assert.deepEqual(JSON.parse(h.storage.get(key)).article_ids,outside);
});
await test('collapsed successful scope cleanup still explicitly reports four retained upstream Dedao copies',async()=>{
 const result={...done,all_owner_articles_empty:true,current_owner_article_count:0,new_article_count:0,excluded_dedao_article_count:4,dedao_scope:'关联得到任务的上游副本保留'};
 const h=harness({transport:async(url,options)=>response(!options?.method?result:JSON.parse(options.body).action==='preview'?{...base,excluded_dedao_article_count:4,dedao_scope:result.dedao_scope}:result)});await click(h,'永久清空全部文章');acknowledge(h);await click(h,'确认永久删除全部范围');assert.deepEqual(h.deleted,[ids]);assert.equal(all(h.render(),h.modal.AlertDialog)[0].props.open,false);const status=all(h.render(),'p').find(x=>x.props.role==='status');assert.match(text(status),/已独立确认清除 47 篇本站文章及确认范围内的文件和正文历史/);assert.match(text(status),/仍保留 4 篇关联得到任务的上游副本/);assert.doesNotMatch(text(status),/全部记录.*清零|全部副本.*清除|网站已清零/);assert.equal(h.calls.filter(c=>c.body?.action==='confirm').length,1);assert.equal(h.calls.filter(c=>!c.options?.method).length,1);
});
await test('fresh scope includes four website Dedao copies and success never says they were retained',async()=>{
 const p={...base,include_dedao_articles:true,included_dedao_article_count:4,excluded_dedao_article_count:0};
 const result={...p,...done,include_dedao_articles:true,included_dedao_article_count:4,excluded_dedao_article_count:0,all_owner_articles_empty:true,current_owner_article_count:0};
 const h=harness({transport:async(url,options)=>response(!options?.method?result:JSON.parse(options.body).action==='preview'?p:result)});
 await click(h,'永久清空全部文章');assert.match(text(h.render()),/包括 4 篇文章关联的本站得到副本/);assert.match(text(h.render()),/得到外站/);
 acknowledge(h);await click(h,'确认永久删除全部范围');const status=all(h.render(),'p').find(x=>x.props.role==='status');assert.match(text(status),/已包含 4 篇文章关联的本站得到副本/);assert.doesNotMatch(text(status),/仍保留 4|本站另有 0/);
 assert.deepEqual(h.deleted,[ids]);assert.equal(h.calls.filter(c=>c.body?.action==='confirm').length,1);assert.equal(h.calls.filter(c=>!c.options?.method).length,1);
});
console.log(`${passed} passed, ${failed} failed actual full-article purge UI interaction/recovery scenarios; no production I/O.`);
if(failed)process.exitCode=1;
