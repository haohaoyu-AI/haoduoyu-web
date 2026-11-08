// Node memory-DB/synthetic-DOM regression tests, NOT browser/IndexedDB acceptance.
// The handlers and painters below are extracted from the actual original source
// after the exact audited transforms, not replaced by no-op collectors.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {installLocalLifecycle,localEditorPaintValue} from '../frontend/web/local/lifecycle.mjs';
import {draftTransforms} from '../scripts/draft-transforms.mjs';
import {createMemoryDB} from '../frontend/web/offline/db.mjs';
import {createStandaloneRuntime} from '../frontend/web/local/runtime.mjs';

const date='2026-11-08', id='11111111-1111-4111-8111-111111111111';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class CE extends Event {constructor(type,{detail}={}){super(type);this.detail=detail;}}
class Doc extends EventTarget {
  constructor(fields=[]){super();this.fields=fields;this.body={inert:false};this.activeElement=null;this.visibilityState='visible';}
  querySelectorAll(selector){return selector==='input,textarea'||selector==='button,input,textarea,select'?this.fields:[];}
}
const field=(id,value,dataset={})=>({id,value,dataset,defaultValue:'',type:'textarea',readOnly:false,disabled:false,isConnected:true});
async function source(file){let result=await fs.readFile(new URL('../frontend/web/'+file,import.meta.url),'utf8');
  for(const[name,before,after]of draftTransforms)if(name===file)result=result.replace(before,after);return result;}
function between(text,start,end){const offset=text.indexOf(start);assert.ok(offset>=0,start);const stop=text.indexOf(end,offset);assert.ok(stop>offset,end);return text.slice(offset,stop);}
async function finished(h,request='close'){for(let i=0;i<100&&h.api.status(request)==='pending';i++)await sleep(2);return h.api.status(request);}

async function setup({mainText='旧值最后一字',floatingText=null,flushFailure=false,timeoutMs=200,runtimeGate=null,compose=false,futureText=null}={}){
  const window=new EventTarget();window.CustomEvent=CE;
  const note=field('entry-'+id,mainText,{noteEntryEditor:id,category:'life',composing:String(compose)});
  const todo=field('todo-text','待办最后一字');todo.type='text';todo.form={dataset:{date}};
  const future=futureText===null?null:field('todo-future-text',futureText);
  if(future)future.type='text';
  const document=new Doc([todo,note,...(future?[future]:[])]), root={inert:false,querySelectorAll:selector=>selector==='[data-note-entry-editor],#notes-editor'?[note]:[],querySelector:()=>note};
  const pipField=floatingText===null?null:field('',floatingText),pipDocument=pipField?new Doc([pipField]):null;
  const entry={id,date,category:'life',draft:'旧值',dirty:true,canEdit:true,labels:[],labelComplete:true};
  const db=createMemoryDB(),runtime=createStandaloneRuntime({db});await runtime.composerReady;
  const stored=[],errors=[];let owner='owner',fail=flushFailure,notesPaused=0,notesResumed=0;
  const store={edit:(key,text,options)=>{assert.equal(key,id);entry.draft=text;stored.push({key,text,options});paintMain();paintFloating();},
    pauseAutosave:()=>{notesPaused++;return()=>{notesResumed++;};}};
  const notesSource=await source('daily-notes-controller.mjs');
  const noteHandlers=between(notesSource,"  window.addEventListener('haoduoyu:capture-current-editors'",'  onOfflineRuntime(offline => {');
  const floatingHelper=between(notesSource,'export function captureLocalFloatingNote','export function floatingNotesSnapshot').replace('export function','function');
  const context=vm.createContext({window,document:{querySelector:()=>root},notesIdentity:'owner',notesIdentityNow:()=>owner,
    entryStores:new Map([['life',store]]),notesStores:new Map(),notesRefreshPaused:false,
    getOfflineRuntime:()=>({flushDrafts:async()=>{if(fail)throw new Error('synthetic durable failure');}}),
    captureNotesDrafts:async()=>{},paintDailyNotesPage:()=>{paintMain();paintFloating();},
    floatingNoteCategory:'life',floatingNoteId:id,floatingNoteDate:date,selectedFloatingEntry:()=>entry});
  vm.runInContext(noteHandlers+floatingHelper+';globalThis.captureFloating=captureLocalFloatingNote;',context);
  const mainPainterSource=between(await source('pages/daily-notes.mjs'),'function paintEditorValue(editor, text) {','export function paintDailyNotes(');
  const mainPainter=vm.createContext({document,localEditorPaintValue,Math});vm.runInContext(mainPainterSource+';globalThis.paint=paintEditorValue;',mainPainter);
  function paintMain(){mainPainter.paint(note,entry.draft);}
  const node=()=>({append(){},dataset:{}});
  if(pipDocument){pipDocument.hasFocus=()=>false;pipDocument.createDocumentFragment=node;}
  const view=pipField?{doc:pipDocument,notesInput:pipField,
    noteList:{replaceChildren(){}},newNote:{},labels:{},options:{querySelectorAll:()=>[],replaceChildren(){}},send:{},check:{},retry:{},noteMessage:{}}:null;
  const floatingPainterSource=between(await source('floating-workbench.mjs'),'function paintNotes(view) {','function bindOfflineStatus');
  const floatingPainter=vm.createContext({floatingNotesSnapshot:()=>({item:entry,page:{loaded:true,canEdit:true},labelsVerified:true,labels:[],entries:[]}),node,localEditorPaintValue,Intl,Date,JSON,Set});
  vm.runInContext(floatingPainterSource+';globalThis.paint=paintNotes;',floatingPainter);
  function paintFloating(){if(view)floatingPainter.paint(view);}
  if(pipField){
    const floatingHandlers=between(await source('floating-workbench.mjs'),'  const captureCurrent = event => {','  const reset =');
    const floatingContext=vm.createContext({window,active:()=>true,view,tab:'notes',composing:false,
      captureLocalFloatingNote:context.captureFloating,floatingNotesSnapshot:()=>({item:entry}),
      editFloatingNote(){throw new Error('local close must not reread floating DOM');},paint:paintFloating});
    vm.runInContext(floatingHandlers+";window.addEventListener('haoduoyu:before-refresh',beforeRefresh);",floatingContext);
  }
  // Exact original inputTodo -> notifyTodoChanges -> both actual painters.
  const todosSource=await source('pages/todos.mjs');
  const inputSource=between(todosSource,'function inputTodo(target) {','function showTodoFailure(');
  const notifySource=between(todosSource,'function notifyTodoChanges() {','function todoCalendarMonth(');
  const todoContext=vm.createContext({validTodoDate:value=>value===date,todoDay:()=>({set draft(text){void runtime.composerDrafts.set('todo',date,text);}}),
    todoObservers:new Set([()=>{paintMain();paintFloating();}])});
  vm.runInContext(inputSource+notifySource+';globalThis.inputTodo=inputTodo;',todoContext);
  const mainSource=await fs.readFile(new URL('../frontend/web/local/main.mjs',import.meta.url),'utf8');
  const mainCapture=between(mainSource,'  capture(detail) {','  reportError:').trim().replace(/^capture\(detail\)/,'function capture(detail)').replace(/,\s*$/,'');
  const futureSource=between(await source('pages/unscheduled-todos.mjs'),'export function inputUnscheduledTodo(el) {','function moved(').replace('export function','function');
  const futureContext=vm.createContext({current:()=>({set draft(text){void runtime.composerDrafts.set('future','',text);}})});
  vm.runInContext(futureSource+';globalThis.input=inputUnscheduledTodo;',futureContext);
  const collectorContext=vm.createContext({todoOwner:()=>owner,validTodoDate:value=>value===date,inputTodo:todoContext.inputTodo,inputUnscheduledTodo:futureContext.input});
  vm.runInContext(mainCapture+';globalThis.capture=capture;',collectorContext);
  const api=installLocalLifecycle({window,document,capture:collectorContext.capture,
    getReadyRuntime:()=>runtime,getRuntime:async()=>{if(runtimeGate)await runtimeGate;return {composerDrafts:runtime.composerDrafts,flushDrafts:async()=>{if(fail)throw new Error('synthetic durable failure');await runtime.flushDrafts();}};},
    timeoutMs,reportError:error=>errors.push(error)});
  return {api,window,document,note,todo,future,pipField,pipDocument,entry,stored,errors,runtime,db,context,
    paintMain,paintFloating,setOwner:value=>{owner=value;},setFailure:value=>{fail=value;},counts:()=>({notesPaused,notesResumed})};
}

test('A: actual inputTodo notification cannot erase an unreported floating tail before its captured collection',async()=>{
  const h=await setup({floatingText:'旧值最后一字'});
  assert.equal(h.api.requestFlush('close'),'pending');assert.equal(h.pipField.disabled,true);
  assert.equal(await finished(h),'complete');
  assert.equal(h.pipField.value,'旧值最后一字');assert.equal(h.note.value,'旧值最后一字');
  assert.ok(h.stored.length>=2);assert.ok(h.stored.every(row=>row.text==='旧值最后一字'));
  const reopen=createStandaloneRuntime({db:h.db});await reopen.composerReady;assert.equal(reopen.composerDrafts.read('todo',date),'待办最后一字');
  assert.equal(h.document.body.inert,true);assert.equal(h.pipDocument.body.inert,true);h.api.resume('close');
});

test('B: original main painter in a queued microtask cannot erase tail across the awaited-runtime gap (no popup)',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve);const h=await setup({runtimeGate:gate});
  h.api.requestFlush('close');queueMicrotask(()=>h.paintMain());await sleep(2);
  assert.equal(h.note.value,'旧值最后一字');assert.equal(h.stored.length,0);release();
  assert.equal(await finished(h),'complete');assert.equal(h.stored[0].text,'旧值最后一字');h.api.resume('close');
});

test('same-entity main/floating divergence fails before any edit and both values survive repeated late original paints',async()=>{
  const h=await setup({mainText:'主文末字',floatingText:'浮窗末字'});
  assert.equal(h.api.requestFlush('close'),'failed');assert.equal(h.stored.length,0);assert.match(h.errors[0].message,/原文不同/);
  for(let i=0;i<3;i++){h.entry.draft='异步旧文本';h.paintFloating();h.paintMain();await sleep(1);}
  assert.equal(h.note.value,'主文末字');assert.equal(h.pipField.value,'浮窗末字');
  assert.equal(h.api.requestFlush('retry'),'failed');assert.equal(h.stored.length,0);
  h.api.resume('close');h.paintMain();h.paintFloating();assert.equal(h.note.value,'主文末字');assert.equal(h.pipField.value,'浮窗末字');
});

test('real user reconciliation retires per-editor recovery guards and permits a fresh close',async()=>{
  const h=await setup({mainText:'主文',floatingText:'浮窗'});h.api.requestFlush('first');
  // Fake DOM does not implement bubbling; target the same beforeinput event path.
  for(const [doc,input]of [[h.document,h.note],[h.pipDocument,h.pipField]]){
    const event=new Event('beforeinput');Object.defineProperty(event,'target',{value:input});doc.dispatchEvent(event);input.value='核对后两份相同';
  }
  assert.equal(h.api.requestFlush('close'),'pending');assert.equal(await finished(h),'complete');
  assert.ok(h.stored.every(row=>row.text==='核对后两份相同'));h.api.resume('close');
});

test('failed durable close resumes controllers and preserves both raw editors through bidirectional repaint, then retries',async()=>{
  const h=await setup({floatingText:'旧值最后一字',flushFailure:true});h.api.requestFlush('bad');
  assert.equal(await finished(h,'bad'),'failed');assert.equal(h.note.readOnly,false);assert.equal(h.pipField.disabled,false);
  assert.deepEqual(h.counts(),{notesPaused:1,notesResumed:1});
  h.entry.draft='迟到旧响应';h.paintMain();h.paintFloating();assert.equal(h.note.value,'旧值最后一字');assert.equal(h.pipField.value,'旧值最后一字');
  h.setFailure(false);h.api.requestFlush('close');assert.equal(await finished(h),'complete');h.api.resume('close');
});

test('cancel before runtime readiness forbids later collection; a new request owns its own newer snapshot',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve),h=await setup({runtimeGate:gate});
  h.api.requestFlush('cancelled');assert.equal(h.api.resume('cancelled'),'unknown');
  h.note.value='取消后新输入';h.todo.value='新待办';h.api.requestFlush('close');release();
  assert.equal(await finished(h),'complete');assert.equal(h.api.status('cancelled'),'unknown');
  assert.ok(h.stored.every(row=>row.text==='取消后新输入'));assert.equal(h.runtime.composerDrafts.read('todo',date),'新待办');h.api.resume('close');
});

test('timeout before readiness restores inputs; late runtime cannot collect or upgrade failure to success',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve),h=await setup({runtimeGate:gate,timeoutMs:10});
  h.api.requestFlush('close');assert.equal(await finished(h),'failed');assert.equal(h.note.readOnly,false);release();await sleep(5);
  h.paintMain();assert.equal(h.note.value,'旧值最后一字');assert.equal(h.stored.length,0);assert.equal(h.api.status('close'),'failed');
});

test('owner change during runtime wait fails without applying captured values to the replacement owner',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve),h=await setup({runtimeGate:gate});
  h.api.requestFlush('close');h.setOwner('replacement-owner');release();assert.equal(await finished(h),'failed');
  assert.equal(h.stored.length,0);assert.equal(h.runtime.composerDrafts.read('todo',date),'');
});

test('note navigation or form date mutation during runtime wait cannot redirect a snapshot to a new entity',async()=>{
  for(const mutate of [h=>{h.note.dataset.noteEntryEditor='22222222-2222-4222-8222-222222222222';},h=>{h.todo.form.dataset.date='2026-11-09';}]){
    let release;const gate=new Promise(resolve=>release=resolve),h=await setup({runtimeGate:gate});h.api.requestFlush('close');mutate(h);release();
    assert.equal(await finished(h),'failed');assert.equal(h.stored.length,0);assert.equal(h.runtime.composerDrafts.read('todo',date),'');
  }
});

test('IME composition status is captured before disabling and fails closed without applying an edit',async()=>{
  const h=await setup({compose:true});assert.equal(h.api.requestFlush('close'),'failed');assert.equal(h.stored.length,0);
  assert.equal(h.note.value,'旧值最后一字');assert.equal(h.note.disabled,false);assert.match(h.errors[0].message,/输入尚未完成/);
});

test('unknown private form fields block close but their raw value never enters the supported snapshot registry',async()=>{
  const h=await setup();const secret=field('account-password','synthetic-not-a-real-password');secret.type='password';h.document.fields.push(secret);
  let snapshots;h.window.addEventListener('haoduoyu:capture-current-editors',event=>{snapshots=event.detail.editors();});
  assert.equal(h.api.requestFlush('close'),'failed');assert.ok(snapshots.every(row=>row.field!==secret));
  assert.equal(h.stored.length,0);assert.equal(secret.value,'synthetic-not-a-real-password');assert.doesNotMatch(h.errors[0].message,/synthetic-not-a-real-password/);
});

test('a detached original editor fails closed without restoring old text into its replacement entity',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve),h=await setup({runtimeGate:gate});
  h.api.requestFlush('close');const replacement=field('entry-other','新实体自己的内容',{noteEntryEditor:'other',category:'life'});
  h.note.isConnected=false;h.document.fields=[h.todo,replacement];release();
  assert.equal(await finished(h),'failed');assert.equal(h.stored.length,0);assert.equal(replacement.value,'新实体自己的内容');
  assert.match(h.errors[0].message,/内存快照|新的未采集输入/);assert.doesNotMatch(h.errors[0].message,/两份输入已保留/);
});

test('new uncollected business input during runtime wait blocks acknowledgement even without changing old editors',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve),h=await setup({runtimeGate:gate});h.api.requestFlush('close');
  h.document.fields.push(field('new-business','尚未采集'));release();assert.equal(await finished(h),'failed');assert.equal(h.stored.length,0);
});

test('a successful close cancelled by its host does not reinsert a composer already atomically consumed by an in-flight create',async()=>{
  const h=await setup();h.api.requestFlush('close');assert.equal(await finished(h),'complete');
  const snapshot=h.runtime.composerDrafts.snapshot('todo',date);
  await h.runtime.call('/todos',{method:'POST',body:{id,date,text:'待办最后一字'},localDraftSnapshot:snapshot});
  // No painter is needed for resume to reconcile the atomically consumed value.
  assert.equal(h.todo.value,'待办最后一字');
  // No test-driven repaint or value assignment after the real resume call.
  h.api.resume('close');
  assert.equal(h.todo.value,'');assert.equal(h.runtime.composerDrafts.read('todo',date),'');
  h.api.requestFlush('second-close');assert.equal(await finished(h,'second-close'),'complete');
  assert.equal(h.runtime.composerDrafts.read('todo',date),'');h.api.resume('second-close');
});

test('future composer successful resume reads its current journal without a manual repaint and does not resurrect on another close',async()=>{
  const h=await setup({futureText:'未来已提交'});h.api.requestFlush('close');assert.equal(await finished(h),'complete');
  const snapshot=h.runtime.composerDrafts.snapshot('future');
  await h.runtime.call('/unscheduled-todos',{method:'POST',body:{id,text:'未来已提交'},localDraftSnapshot:snapshot});
  assert.equal(h.future.value,'未来已提交');
  h.api.resume('close');assert.equal(h.future.value,'');assert.equal(h.runtime.composerDrafts.read('future'),'');
  h.api.requestFlush('second-close');assert.equal(await finished(h,'second-close'),'complete');
  assert.equal(h.runtime.composerDrafts.read('future'),'');h.api.resume('second-close');
});

test('successful resume never assigns an old journal value after composer owner, date, or DOM identity changed',async()=>{
  for(const change of [h=>h.setOwner('next-owner'),h=>{h.todo.form.dataset.date='2026-11-09';},h=>{h.todo.isConnected=false;}]){
    const h=await setup();h.api.requestFlush('close');assert.equal(await finished(h),'complete');
    h.todo.value='新实体自己的原文';change(h);h.api.resume('close');assert.equal(h.todo.value,'新实体自己的原文');
  }
});

test('actual note and floating resume callbacks repaint current bound store text without any test repaint after resume',async()=>{
  const h=await setup({floatingText:'旧值最后一字'});h.api.requestFlush('close');assert.equal(await finished(h),'complete');
  h.entry.draft='保存后的当前原文';h.paintMain();h.paintFloating();
  assert.equal(h.note.value,'旧值最后一字');assert.equal(h.pipField.value,'旧值最后一字');
  h.api.resume('close');assert.equal(h.note.value,'保存后的当前原文');assert.equal(h.pipField.value,'保存后的当前原文');
});

async function setupMemo(){
  const window=new EventTarget();window.CustomEvent=CE;
  const title=field('memo-title','原始标题'),body=field('memo-body','原始正文'),document=new Doc([title,body]);
  const nodes=new Map([['#memo-title',title],['#memo-body',body]]),node=()=>({setAttribute(){}});
  const root={inert:false,querySelectorAll:selector=>selector==='#memo-title,#memo-body'?[title,body]:[],querySelector:selector=>{
    if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector);
  }};
  const item={id,title:'旧标题',body:'旧正文',dirty:true},edits=[],errors=[];
  let owner='memo-owner';
  const store={state:{canEdit:true,noteId:id,groups:[]},drafts:new Map([[id,item]]),
    pauseAutosave:()=>()=>{},edit:(key,value)=>{item[key]=value;edits.push([key,value]);},flushDrafts:async()=>{}};
  const painter=between(await source('pages/memos.mjs'),'function paintDocument(root, store) {','export function paintMemos(');
  const painterContext=vm.createContext({localEditorPaintValue,paintEditedTime(){}});
  vm.runInContext(painter+';globalThis.paint=paintDocument;',painterContext);
  const handlers=between(await source('memos-controller.mjs'),'function captureLocalMemos(event) {','function registerEvents()');
  const context=vm.createContext({memoIdentity:'memo-owner',currentIdentity:()=>owner,memoStore:store,
    document:{querySelector:()=>root,activeElement:null},memoRefreshPaused:false,memoRefreshReady:false,
    paintMemosPage:()=>painterContext.paint(root,store),refreshDurableMemos(){}});
  vm.runInContext(handlers+';globalThis.capture=captureLocalMemos;globalThis.preserve=preserveMemosBeforeRefresh;',context);
  window.addEventListener('haoduoyu:capture-current-editors',context.capture);
  window.addEventListener('haoduoyu:before-refresh',context.preserve);
  const api=installLocalLifecycle({window,document,getRuntime:()=>({flushDrafts:async()=>{}}),reportError:error=>errors.push(error)});
  return {api,title,body,item,store,edits,errors,paint:()=>painterContext.paint(root,store),setOwner:value=>{owner=value;}};
}

test('actual memo resume handler repaints current store title and body instead of its guarded raw or a late proposal',async()=>{
  const h=await setupMemo();h.api.requestFlush('close');assert.equal(await finished(h),'complete');
  h.item.title='保存后的标题';h.item.body='保存后的正文';h.paint();assert.equal(h.title.value,'原始标题');assert.equal(h.body.value,'原始正文');
  h.api.resume('close');assert.equal(h.title.value,'保存后的标题');assert.equal(h.body.value,'保存后的正文');
  assert.equal(h.errors.length,0);
  h.api.requestFlush('second-close');assert.equal(await finished(h,'second-close'),'complete');
  assert.deepEqual(h.edits.slice(-2),[['title','保存后的标题'],['body','保存后的正文']]);h.api.resume('second-close');
});

test('actual memo successful resume does not paste old captured title/body into a newly selected note or owner',async()=>{
  for(const changeOwner of [false,true]){
    const h=await setupMemo();h.api.requestFlush('close');assert.equal(await finished(h),'complete');
    const next='22222222-2222-4222-8222-222222222222';
    h.store.drafts.set(next,{id:next,title:'另一篇标题',body:'另一篇正文'});h.store.state.noteId=next;
    h.title.value='另一篇标题';h.body.value='另一篇正文';if(changeOwner)h.setOwner('next-owner');
    h.api.resume('close');assert.equal(h.title.value,'另一篇标题');assert.equal(h.body.value,'另一篇正文');
  }
});

function composerFor(h,kind){return {field:kind==='todo'?h.todo:h.future,identity:kind==='todo'?date:'',url:kind==='todo'?'/todos':'/unscheduled-todos'};}
async function consume(h,kind,capability){
  const {url}=composerFor(h,kind);
  await h.runtime.call(url,{method:'POST',body:{id,text:capability.text.trim(),...(kind==='todo'?{date}:{})},localDraftSnapshot:capability});
}

test('precisely consumed todo/future raw is not resurrected when another note flush fails and close is retried',async()=>{
  for(const kind of ['todo','future']){
    const h=await setup({futureText:kind==='future'?'未来提交后失败':null}),{field,identity}=composerFor(h,kind);
    let release,otherFails=true;const otherWrite=new Promise(resolve=>release=resolve);
    h.window.addEventListener('haoduoyu:before-refresh',event=>{if(otherFails)event.detail.waitUntil(otherWrite.then(()=>{throw new Error('other note write failed');}));});
    h.api.requestFlush('failed-close');
    for(let i=0;i<100&&h.counts().notesPaused===0;i++)await sleep(1);
    const cap=h.runtime.composerDrafts.snapshot(kind,identity);assert.equal(cap.text,field.value);
    await consume(h,kind,cap);assert.equal(h.runtime.composerDrafts.wasConsumed(cap),true);
    release();assert.equal(await finished(h,'failed-close'),'failed');
    assert.equal(field.value,'');assert.equal(h.runtime.composerDrafts.read(kind,identity),'');assert.equal(h.note.value,'旧值最后一字');
    otherFails=false;h.api.requestFlush('retry');assert.equal(await finished(h,'retry'),'complete');
    assert.equal(h.runtime.composerDrafts.read(kind,identity),'');h.api.resume('retry');
  }
});

test('consume during awaited runtime uses the capture-time exact revision and cannot be re-journaled by later stage.apply',async()=>{
  for(const kind of ['todo','future']){
    let release;const ready=new Promise(resolve=>release=resolve),h=await setup({runtimeGate:ready,futureText:kind==='future'?'等待时消费':null});
    const {field,identity}=composerFor(h,kind);await h.runtime.composerDrafts.set(kind,identity,field.value);
    const cap=h.runtime.composerDrafts.snapshot(kind,identity);h.api.requestFlush('close');
    await consume(h,kind,cap);h.setFailure(true);release();assert.equal(await finished(h),'failed');
    assert.equal(h.runtime.composerDrafts.read(kind,identity),'');assert.equal(field.value,'');
    h.setFailure(false);h.api.requestFlush('retry');assert.equal(await finished(h,'retry'),'complete');
    assert.equal(h.runtime.composerDrafts.read(kind,identity),'');h.api.resume('retry');
  }
});

test('an unreported raw tail different from the consumed capture-time journal revision is preserved on failure and retry',async()=>{
  for(const kind of ['todo','future']){
    let release;const ready=new Promise(resolve=>release=resolve),h=await setup({runtimeGate:ready,futureText:kind==='future'?'旧提交最后一字':null});
    const {field,identity}=composerFor(h,kind);field.value='旧提交最后一字';await h.runtime.composerDrafts.set(kind,identity,'旧提交');
    const old=h.runtime.composerDrafts.snapshot(kind,identity);h.api.requestFlush('close');await consume(h,kind,old);h.setFailure(true);release();
    assert.equal(await finished(h),'failed');assert.equal(field.value,'旧提交最后一字');assert.equal(h.runtime.composerDrafts.read(kind,identity),'旧提交最后一字');
    assert.equal(h.runtime.composerDrafts.wasConsumed(old),false);
    h.setFailure(false);h.api.requestFlush('retry');assert.equal(await finished(h,'retry'),'complete');
    assert.equal(h.runtime.composerDrafts.read(kind,identity),'旧提交最后一字');h.api.resume('retry');
  }
});

test('a newer same-text composer revision invalidates the old consumption proof and survives failed close recovery',async()=>{
  for(const kind of ['todo','future']){
    const h=await setup({futureText:kind==='future'?'同字新revision':null}),{field,identity}=composerFor(h,kind);
    let release;const otherWrite=new Promise(resolve=>release=resolve);
    h.window.addEventListener('haoduoyu:before-refresh',event=>event.detail.waitUntil(otherWrite.then(()=>{throw new Error('other note failed');})));
    h.api.requestFlush('close');for(let i=0;i<100&&h.counts().notesPaused===0;i++)await sleep(1);
    const original=h.runtime.composerDrafts.snapshot(kind,identity);await consume(h,kind,original);
    await h.runtime.composerDrafts.set(kind,identity,'另一修订');await h.runtime.composerDrafts.set(kind,identity,original.text);
    const newer=h.runtime.composerDrafts.snapshot(kind,identity);assert.notEqual(newer.writeId,original.writeId);
    assert.equal(h.runtime.composerDrafts.wasConsumed(original),false);assert.equal(h.runtime.composerDrafts.wasConsumed({...original}),false);
    release();assert.equal(await finished(h),'failed');assert.equal(field.value,original.text);
    assert.equal(h.runtime.composerDrafts.read(kind,identity),original.text);assert.equal(h.runtime.composerDrafts.snapshot(kind,identity).writeId,newer.writeId);
  }
});

test('consumption after a failed request keeps exact proof for a retry even when no original painter runs between requests',async()=>{
  for(const kind of ['todo','future']){
    const h=await setup({flushFailure:true,futureText:kind==='future'?'失败后才消费':null}),{field,identity}=composerFor(h,kind);
    h.api.requestFlush('failed-close');assert.equal(await finished(h,'failed-close'),'failed');
    const original=h.runtime.composerDrafts.snapshot(kind,identity);await consume(h,kind,original);
    // No painter or manual DOM mutation: the failed raw guard still displays
    // old text. The next close must inherit only its proven exact consumption.
    assert.equal(field.value,original.text);h.setFailure(false);h.api.requestFlush('retry');
    assert.equal(await finished(h,'retry'),'complete');assert.equal(h.runtime.composerDrafts.read(kind,identity),'');
    h.api.resume('retry');assert.equal(field.value,'');
  }
});

test('a configured capture-time runtime that is not ready refuses nonempty composers instead of guessing a consume proof',async()=>{
  const input=field('todo-text','尚未确认的原文');input.form={dataset:{date}};
  const document=new Doc([input]),window=new EventTarget();window.CustomEvent=CE;
  let runtimeCalls=0;const errors=[];
  const api=installLocalLifecycle({window,document,getReadyRuntime:()=>null,getRuntime:()=>{runtimeCalls++;},reportError:error=>errors.push(error)});
  assert.equal(api.requestFlush('close'),'failed');assert.equal(input.value,'尚未确认的原文');assert.equal(runtimeCalls,0);
  assert.match(errors[0].message,/尚未就绪/);
});
