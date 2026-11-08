import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createMemoryDB} from '../frontend/web/offline/db.mjs';
import {createComposerJournal} from '../frontend/web/local/drafts.mjs';
import {createStandaloneRuntime} from '../frontend/web/local/runtime.mjs';
import {LOCAL_SCOPE} from '../frontend/web/local/api.mjs';
import {installLocalLifecycle} from '../frontend/web/local/lifecycle.mjs';
import {missingLocalCapabilities} from '../frontend/web/local/capabilities.mjs';
import {draftTransforms} from '../scripts/draft-transforms.mjs';
const id = '11111111-1111-4111-8111-111111111111', date = '2026-11-08';
const makeJournal = (db,scope = LOCAL_SCOPE, extra={}) => createComposerJournal({db,scope,...extra});
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
async function finished(lifecycle,id) {
  for(let i=0;i<100 && lifecycle.status(id)==='pending';i++) await sleep(2);
  return lifecycle.status(id);
}
class CustomEvent extends Event { constructor(type,{detail}={}) { super(type); this.detail=detail; } }
class FakeDocument extends EventTarget {
  constructor(fields = []) { super(); this.fields=fields; this.body={inert:false};this.visibilityState='visible'; }
  querySelectorAll(selector) {
    if(selector==='input,textarea')return this.fields.filter(field=>field.tag!=='button'&&field.tag!=='select');
    if(selector==='button,input,textarea,select')return this.fields;
    return [];
  }
}
function field(id,value='',extra={}) { return {id,value,defaultValue:'',type:'text',tag:'input',dataset:{},disabled:false,readOnly:false,...extra}; }
function harness({fields=[],collect=()=>{},flush=async()=>{},timeoutMs=200,getRuntime,ack=true}={}) {
  const window=new EventTarget();window.CustomEvent=CustomEvent;
  const document=new FakeDocument(fields), errors=[];
  const lifecycle=installLocalLifecycle({window,document,getRuntime:getRuntime||(()=>({flushDrafts:flush})),collect:(runtime,detail)=>{
      const result=collect(runtime,detail);if(ack)for(const {field} of detail.editors())detail.protect(field);return result;
    },
    reportError:error=>errors.push(error),timeoutMs});
  return {window,document,lifecycle,errors};
}

test('todo/future drafts reload verbatim with date and scope isolation; no automatic memory fallback',async()=>{
  const db=createMemoryDB(), first=makeJournal(db);await first.initialize();
  const a={draft:''};first.bind(a,'draft','todo',date);a.draft='  未提交\n原文  ';
  await first.set('todo','2026-11-09','另一天');await first.set('future','','未来草稿');await first.flush();
  const second=makeJournal(db);await second.initialize();
  assert.equal(second.read('todo',date),'  未提交\n原文  ');
  assert.equal(second.read('todo','2026-11-09'),'另一天');assert.equal(second.read('future'),'未来草稿');
  const other=makeJournal(db,'local:different');await other.initialize();assert.equal(other.read('todo',date),'');
  assert.throws(()=>makeJournal({}));assert.throws(()=>second.read('todo','2026-02-30'));
});

test('successful todo/future creates atomically consume only the submitted draft and never resurrect on reopen',async()=>{
  for(const kind of ['todo','future']) {
    const db=createMemoryDB(), runtime=createStandaloneRuntime({db});await runtime.composerReady;
    await runtime.composerDrafts.set(kind,kind==='todo'?date:'',' 原文 ');
    const snapshot=runtime.composerDrafts.snapshot(kind,kind==='todo'?date:'');
    const body={id,text:'原文',...(kind==='todo'?{date}:{})};
    const item=await runtime.call(kind==='todo'?'/todos':'/unscheduled-todos',{method:'POST',body,localDraftSnapshot:snapshot});
    assert.equal(item.text,'原文');assert.equal(runtime.composerDrafts.read(kind,kind==='todo'?date:''),'');
    const reopened=createStandaloneRuntime({db});await reopened.composerReady;
    assert.equal(reopened.composerDrafts.read(kind,kind==='todo'?date:''),'');
    assert.equal((await reopened.call(kind==='todo'?'/todos?date='+date:'/unscheduled-todos')).items.length,1);
  }
});

test('newer edits, including text changed away and back, are not cleared by an older create',async()=>{
  const db=createMemoryDB(), runtime=createStandaloneRuntime({db});await runtime.composerReady;
  await runtime.composerDrafts.set('todo',date,'旧输入');const old=runtime.composerDrafts.snapshot('todo',date);
  await runtime.composerDrafts.set('todo',date,'新输入');await runtime.composerDrafts.set('todo',date,'旧输入');
  await runtime.call('/todos',{method:'POST',body:{id,date,text:'旧输入'},localDraftSnapshot:old});
  assert.equal(runtime.composerDrafts.read('todo',date),'旧输入');assert.equal(runtime.composerDrafts.unchangedSince(old),false);
  const reopened=makeJournal(db);await reopened.initialize();assert.equal(reopened.read('todo',date),'旧输入');
});

test('validation failure and transaction abort preserve draft and do not create an item',async()=>{
  const base=createMemoryDB();let failCommit=false;
  const db={transaction:(names,mode,fn)=>base.transaction(names,mode,async tx=>{
    const value=await fn(tx);if(failCommit&&names.includes('entities')&&mode==='readwrite')throw new Error('synthetic abort');return value;
  })};
  const runtime=createStandaloneRuntime({db});await runtime.composerReady;
  await runtime.composerDrafts.set('todo',date,'保留');const snapshot=runtime.composerDrafts.snapshot('todo',date);
  await assert.rejects(runtime.call('/todos',{method:'POST',body:{id,date,text:'不匹配'},localDraftSnapshot:snapshot}));
  failCommit=true;
  await assert.rejects(runtime.call('/todos',{method:'POST',body:{id,date,text:'保留'},localDraftSnapshot:snapshot}));
  failCommit=false;
  assert.equal((await runtime.call('/todos?date='+date)).items.length,0);
  const reopened=makeJournal(db);await reopened.initialize();assert.equal(reopened.read('todo',date),'保留');
});

test('forged JSON snapshots cannot clear drafts; direct JSON callback is ignored',async()=>{
  const runtime=createStandaloneRuntime({db:createMemoryDB()});await runtime.composerReady;
  await runtime.composerDrafts.set('future','','保留');
  const snapshot=runtime.composerDrafts.snapshot('future');
  await assert.rejects(runtime.call('/unscheduled-todos',{method:'POST',body:{id,text:'保留'},localDraftSnapshot:{...snapshot}}));
  assert.equal(runtime.composerDrafts.read('future'),'保留');
  await runtime.call('/unscheduled-todos',{method:'POST',body:{id,text:'保留'},localDraftCommit:{kind:'not executable'}});
  assert.equal(runtime.composerDrafts.read('future'),'保留');
});

test('quota failure remains visible and blocks successful flush until a verified rewrite',async()=>{
  const base=createMemoryDB();let quota=true;const errors=[];
  const db={transaction:(names,mode,fn)=>{if(quota&&mode==='readwrite')return Promise.reject(new Error('QuotaExceededError'));return base.transaction(names,mode,fn);}};
  const journal=makeJournal(db,LOCAL_SCOPE,{onError:error=>errors.push(error)});await journal.initialize();
  await assert.rejects(journal.set('future','','不要丢'));await assert.rejects(journal.flush());
  assert.equal(journal.read('future'),'不要丢');assert.equal(errors.length,1);
  quota=false;await journal.set('future','','不要丢');await journal.flush();
  assert.equal((await base.transaction(['meta'],'readonly',tx=>tx.getAll('meta')))[0].text,'不要丢');
});

test('readback corruption is failure, never a successful write acknowledgement',async()=>{
  const base=createMemoryDB();let corrupt=false;
  const db={transaction:(names,mode,fn)=>base.transaction(names,mode,tx=>fn({...tx,get:async(...args)=>{
    const row=await tx.get(...args);return corrupt&&row?{...row,text:'synthetic mismatch'}:row;
  }}))};
  const journal=makeJournal(db);await journal.initialize();corrupt=true;
  await assert.rejects(journal.set('todo',date,'当前编辑器'));await assert.rejects(journal.flush());
  assert.equal(journal.read('todo',date),'当前编辑器');
});

test('lifecycle collects raw editors and all waitUntil writes before completing; remains locked until resume',async()=>{
  const db=createMemoryDB(), journal=makeJournal(db);await journal.initialize();
  const input=field('todo-text','尚未派发 input 的内容');let notesWritten=false, release;
  const pending=new Promise(resolve=>{release=()=>{notesWritten=true;resolve();};});
  const h=harness({fields:[input],collect:()=>journal.set('todo',date,input.value),flush:()=>journal.flush()});
  let resumed=0;
  h.window.addEventListener('haoduoyu:before-refresh',event=>{
    event.detail.waitUntil(pending);event.detail.onFailure(()=>{resumed++;});
  });
  assert.equal(h.lifecycle.requestFlush('close-1'),'pending');assert.equal(input.disabled,true);assert.equal(h.document.body.inert,true);
  await sleep(5);assert.equal(h.lifecycle.status('close-1'),'pending');assert.equal(notesWritten,false);
  release();assert.equal(await finished(h.lifecycle,'close-1'),'complete');assert.equal(resumed,0);assert.equal(input.disabled,true);
  const reopened=makeJournal(db);await reopened.initialize();assert.equal(reopened.read('todo',date),input.value);
  assert.equal(h.lifecycle.resume('close-1'),'unknown');assert.equal(input.disabled,false);assert.equal(h.document.body.inert,false);assert.equal(resumed,1);
  assert.equal(h.lifecycle.status('close-1'),'unknown');assert.equal(h.lifecycle.status('not-requested'),'unknown');
});

test('collector/final flush errors restore controls and invoke controller resumes automatically',async()=>{
  for(const failure of ['collect','waitUntil','flush']) {
    const input=field('memo-body','仍在编辑',{tag:'textarea'});const h=harness({fields:[input],
      collect:()=>{if(failure==='collect')throw new Error('collector failed');},
      flush:async()=>{if(failure==='flush')throw new Error('flush failed');}});
    let resumed=0;
    h.window.addEventListener('haoduoyu:before-refresh',event=>{
      event.detail.onFailure(()=>resumed++);if(failure==='waitUntil')event.detail.waitUntil(Promise.reject(new Error('notes failed')));
    });
    h.lifecycle.requestFlush(failure);assert.equal(await finished(h.lifecycle,failure),'failed');
    assert.equal(input.disabled,false);assert.equal(input.readOnly,false);assert.equal(h.document.body.inert,false);
    assert.equal(resumed,failure==='collect'?0:1);assert.equal(h.errors.length,1);
  }
});

test('timeout/unknown are not success and a late write cannot produce a stale success or relock controls',async()=>{
  let resolve;const pending=new Promise(r=>resolve=r);const input=field('todo-future-text','草稿');
  const h=harness({fields:[input],flush:()=>pending,timeoutMs:10});h.lifecycle.requestFlush('timeout');
  assert.equal(await finished(h.lifecycle,'timeout'),'failed');assert.equal(input.disabled,false);
  resolve();await sleep(5);assert.equal(h.lifecycle.status('timeout'),'failed');assert.equal(input.disabled,false);
  assert.equal(h.lifecycle.requestFlush('timeout'),'failed'); // no replay of an existing request id
});

test('unsupported transient editor blocks close with exact field scope, preserving inputs',async()=>{
  const input=field('todo-template-edit-text','未提交修改');const h=harness({fields:[input]});h.lifecycle.requestFlush('unsupported');
  assert.equal(await finished(h.lifecycle,'unsupported'),'failed');assert.equal(input.value,'未提交修改');assert.equal(input.disabled,false);
  assert.match(h.errors[0].message,/todo-template-edit-text/);
});

test('Android pause and hidden lifecycle flush raw values then resume instead of leaving permanent locks',async()=>{
  for(const event of ['pause','hidden']) {
    let captured='';const input=field('todo-future-text','后台前的原文');const h=harness({fields:[input],collect:()=>{captured=input.value;}});
    if(event==='pause')h.window.dispatchEvent(new Event('haoduoyu:local-background'));
    else {h.document.visibilityState='hidden';h.document.dispatchEvent(new Event('visibilitychange'));}
    for(let i=0;i<30&&(captured!==input.value||input.disabled);i++)await sleep(2);
    assert.equal(captured,input.value);assert.equal(input.disabled,false);assert.equal(h.document.body.inert,false);
  }
});

test('every build-time adapter matches exactly one original source location and changes no original source',async()=>{
  const root=new URL('../frontend/web/',import.meta.url), transformed=new Map();
  for(const [file,before,after]of draftTransforms) {
    const source=transformed.get(file)??await fs.readFile(new URL(file,root),'utf8');
    assert.equal(source.split(before).length-1,1,file+' adapter must be unique');transformed.set(file,source.replace(before,after));
  }
  assert.match(transformed.get('daily-notes-controller.mjs'),/for \(const field of root\?\.querySelectorAll/);
  assert.match(transformed.get('floating-workbench.mjs'),/haoduoyu:capture-current-editors/);
});

test('old WebView capability checks fail explicitly without semantic polyfills',()=>{
  assert.ok(missingLocalCapabilities({}).includes('String.isWellFormed'));
  const environment={indexedDB:{open(){}},structuredClone(){},crypto:{randomUUID(){},subtle:{digest(){}}},String,Object};
  assert.deepEqual(missingLocalCapabilities(environment),[]);
  assert.ok(missingLocalCapabilities({...environment,String:{prototype:{}}}).includes('String.isWellFormed'));
});


test('an editable supported DOM field without an active collector cannot receive a close acknowledgement',async()=>{
  const input=field('memo-body','raw editor is not queued',{tag:'textarea'});const h=harness({fields:[input],ack:false});
  h.lifecycle.requestFlush('missing-collector');assert.equal(await finished(h.lifecycle,'missing-collector'),'failed');
  assert.match(h.errors[0].message,/memo-body/);assert.equal(input.disabled,false);
});

test('floating document joins the lock and stays protected until explicit host resume',async()=>{
  const pipField=field('floating-raw','floating draft',{tag:'textarea'}),pipDocument=new FakeDocument([pipField]);
  const h=harness();h.window.addEventListener('haoduoyu:capture-current-editors',event=>{event.detail.captureDocument(pipDocument,[pipField]);event.detail.protect(pipField);});
  h.lifecycle.requestFlush('with-pip');assert.equal(await finished(h.lifecycle,'with-pip'),'complete');
  assert.equal(pipDocument.body.inert,true);assert.equal(pipField.disabled,true);
  h.lifecycle.resume('with-pip');assert.equal(pipDocument.body.inert,false);assert.equal(pipField.disabled,false);
});

test('actual original memo refresh handler reads raw title/body, waits durable writes and restores state',async()=>{
  let source=await fs.readFile(new URL('../frontend/web/memos-controller.mjs',import.meta.url),'utf8');
  for(const[file,before,after]of draftTransforms)if(file==='memos-controller.mjs')source=source.replace(before,after);
  source=source.slice(source.indexOf('function captureLocalMemos(event)'),source.indexOf('function registerEvents()'));
  const title=field('memo-title','unreported title'),body=field('memo-body','unreported body',{tag:'textarea'});
  const h=harness({fields:[title,body],ack:false});let paused=0,resumed=0,written=false,release;
  const durable=new Promise(resolve=>release=()=>{written=true;resolve();}), edits=[];
  const root={inert:false,querySelectorAll:selector=>selector==='#memo-title,#memo-body'?[title,body]:[]};
  const document={querySelector:selector=>selector==='#memos'?root:null,activeElement:null};
  const store={state:{canEdit:true},pauseAutosave(){paused++;return()=>resumed++;},edit:(key,value)=>edits.push([key,value]),flushDrafts:()=>durable};
  const context=vm.createContext({memoIdentity:'local',currentIdentity:()=> 'local',memoStore:store,document,
    memoRefreshPaused:false,memoRefreshReady:false,paintMemosPage(){},refreshDurableMemos(){}});
  vm.runInContext(source+';globalThis.handler=preserveMemosBeforeRefresh;globalThis.capture=captureLocalMemos;',context);
  h.window.addEventListener('haoduoyu:capture-current-editors',context.capture);
  h.window.addEventListener('haoduoyu:before-refresh',context.handler);h.lifecycle.requestFlush('real-memos');
  await sleep(3);assert.deepEqual(edits,[['title','unreported title'],['body','unreported body']]);assert.equal(paused,1);
  assert.equal(h.lifecycle.status('real-memos'),'pending');assert.equal(written,false);release();
  assert.equal(await finished(h.lifecycle,'real-memos'),'complete');assert.equal(context.memoRefreshReady,true);assert.equal(body.readOnly,true);
  h.lifecycle.resume('real-memos');assert.equal(resumed,1);assert.equal(context.memoRefreshPaused,false);assert.equal(body.readOnly,false);
});

test('actual patched original notes handler collects legacy and entry raw DOM before journal flush',async()=>{
  let source=await fs.readFile(new URL('../frontend/web/daily-notes-controller.mjs',import.meta.url),'utf8');
  for(const[file,before,after]of draftTransforms)if(file==='daily-notes-controller.mjs')source=source.replace(before,after);
  const start=source.indexOf("  window.addEventListener('haoduoyu:capture-current-editors'");
  source=source.slice(start,source.indexOf('  onOfflineRuntime(offline => {',start));
  const note=field('entry-test','unreported note',{tag:'textarea',dataset:{category:'life',noteEntryEditor:id}});
  const legacy=field('notes-editor','legacy raw',{tag:'textarea',dataset:{category:'life',date},readOnly:true});
  const h=harness({fields:[note,legacy],ack:false});const edits=[],captured=[];let resumed=0;
  const root={inert:false,querySelectorAll:selector=>selector==='[data-note-entry-editor],#notes-editor'?[note,legacy]:[],querySelector:()=>note};
  const entries={pauseAutosave:()=>()=>resumed++,edit:(...args)=>edits.push(['entry',...args])};
  const notes={edit:(...args)=>edits.push(['legacy',...args])};
  const context=vm.createContext({window:h.window,document:{querySelector:()=>root},notesIdentity:'local',notesIdentityNow:()=> 'local',
    entryStores:new Map([['life',entries]]),notesStores:new Map([['life',notes]]),notesRefreshPaused:false,
    getOfflineRuntime:()=>({flushDrafts:async()=>{captured.push('flushed');}}),
    captureNotesDrafts:async(...args)=>captured.push(args[2]),paintDailyNotesPage(){}});
  vm.runInContext(source,context);h.lifecycle.requestFlush('real-notes');
  assert.equal(await finished(h.lifecycle,'real-notes'),'complete');assert.equal(edits.length,2);
  assert.deepEqual(edits.map(row=>row.slice(0,3)),[['entry',id,'unreported note'],['legacy',date,'legacy raw']]);
  assert.deepEqual(captured,['life','flushed']);assert.equal(note.readOnly,true);h.lifecycle.resume('real-notes');
  assert.equal(resumed,1);assert.equal(context.notesRefreshPaused,false);assert.equal(note.readOnly,false);
});

test('failed create retries retain the original request snapshot and cannot consume newer same-text revisions',async()=>{
  for(const kind of ['todo','future']) {
    const base=createMemoryDB();let abort=true;
    const db={transaction:(names,mode,fn)=>base.transaction(names,mode,async tx=>{
      const result=await fn(tx);if(abort&&mode==='readwrite'&&names.includes('entities'))throw new Error('synthetic failed create');return result;
    })};
    const runtime=createStandaloneRuntime({db});await runtime.composerReady;
    const identity=kind==='todo'?date:'',url=kind==='todo'?'/todos':'/unscheduled-todos';
    await runtime.composerDrafts.set(kind,identity,'同样文字');
    const request={id,text:'同样文字',...(kind==='todo'?{date}:{})};
    const original=runtime.composerDrafts.requestSnapshot(request,kind,identity);
    await assert.rejects(runtime.call(url,{method:'POST',body:request,localDraftSnapshot:original}));
    await runtime.composerDrafts.set(kind,identity,'新编辑中');await runtime.composerDrafts.set(kind,identity,'同样文字');
    const retry=runtime.composerDrafts.requestSnapshot(request,kind,identity);
    assert.equal(retry,original);abort=false;
    await runtime.call(url,{method:'POST',body:request,localDraftSnapshot:retry});
    assert.equal(runtime.composerDrafts.read(kind,identity),'同样文字');
    assert.equal(runtime.composerDrafts.unchangedSince(retry),false);
    const reopened=makeJournal(db);await reopened.initialize();assert.equal(reopened.read(kind,identity),'同样文字');
    assert.equal((await runtime.call(kind==='todo'?'/todos?date='+date:url)).items.length,1);
    request.id='22222222-2222-4222-8222-222222222222';assert.throws(()=>runtime.composerDrafts.requestSnapshot(request,kind,identity));
    request.id=id;request.text='mutated payload';assert.throws(()=>runtime.composerDrafts.requestSnapshot(request,kind,identity));
  }
});

test('an old successful create receipt replay does not consume a newer composer with identical text',async()=>{
  for(const kind of ['todo','future']) {
    const db=createMemoryDB(),runtime=createStandaloneRuntime({db});await runtime.composerReady;
    const identity=kind==='todo'?date:'',url=kind==='todo'?'/todos':'/unscheduled-todos';
    await runtime.composerDrafts.set(kind,identity,'再次输入相同内容');
    const request={id,text:'再次输入相同内容',...(kind==='todo'?{date}:{})};
    const original=runtime.composerDrafts.requestSnapshot(request,kind,identity);
    await runtime.call(url,{method:'POST',body:request,localDraftSnapshot:original});
    await runtime.composerDrafts.set(kind,identity,'再次输入相同内容');
    assert.equal(runtime.composerDrafts.requestSnapshot(request,kind,identity),original);
    await runtime.call(url,{method:'POST',body:request,localDraftSnapshot:original});
    assert.equal(runtime.composerDrafts.read(kind,identity),'再次输入相同内容');
    assert.equal(runtime.composerDrafts.unchangedSince(original),false);
    const reopened=makeJournal(db);await reopened.initialize();assert.equal(reopened.read(kind,identity),'再次输入相同内容');
    assert.equal((await runtime.call(kind==='todo'?'/todos?date='+date:url)).items.length,1);
  }
});

test('typing during an in-flight create transaction wins over its older draft acknowledgement',async()=>{
  const base=createMemoryDB();let release,enter,gateNext=false;
  const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve);
  const db={transaction:(names,mode,fn)=>base.transaction(names,mode,async tx=>{
    if(gateNext&&mode==='readwrite'&&names.includes('entities')){gateNext=false;enter();await gate;}
    return fn(tx);
  })};
  const runtime=createStandaloneRuntime({db});await runtime.composerReady;
  await runtime.composerDrafts.set('todo',date,'原提交');
  const request={id,date,text:'原提交'},original=runtime.composerDrafts.requestSnapshot(request,'todo',date);
  gateNext=true;const pending=runtime.call('/todos',{method:'POST',body:request,localDraftSnapshot:original});
  await entered;
  const typed=runtime.composerDrafts.set('todo',date,'稍后新输入'); // deliberately do not await behind gated transaction
  release();await pending;await typed;await runtime.flushDrafts();
  assert.equal(runtime.composerDrafts.read('todo',date),'稍后新输入');
  assert.equal(runtime.composerDrafts.unchangedSince(original),false);
  const reopened=makeJournal(db);await reopened.initialize();assert.equal(reopened.read('todo',date),'稍后新输入');
});

test('real original date/month navigation markup and programmatic painting do not block an otherwise empty close',async()=>{
  const {renderDailyNotes}=await import('../frontend/web/pages/daily-notes.mjs');
  const {renderNotesMonthMarkup}=await import('../frontend/web/notes-month-controller.mjs');
  const {renderWorkReminders,paintWorkReminders}=await import('../frontend/web/pages/work-reminders.mjs');
  const originalNotes=renderDailyNotes(),originalMonth=renderNotesMonthMarkup(),originalReminders=renderWorkReminders();
  const fromMarkup=(markup,id,type,scope)=>{
    const tag=markup.match(new RegExp('<input[^>]*id="'+id+'"[^>]*>'))?.[0];
    assert.ok(tag,'original markup contains '+id);assert.match(tag,new RegExp('type="'+type+'"'));assert.doesNotMatch(tag,/\bvalue=/);
    return field(id,'',{type,closest:selector=>selector===scope?{}:null});
  };
  const notesDate=fromMarkup(originalNotes,'notes-date','date','#daily-notes');
  const historyMonth=fromMarkup(originalNotes,'notes-history-month','month','#daily-notes');
  const month=fromMarkup(originalMonth,'notes-month-input','month','#notes-month-panel');
  const reminderDate=fromMarkup(originalReminders,'reminder-date','date','#work-reminders');
  // Run the actual original top-level note painter with secondary visual painters stubbed.
  const notesSource=await fs.readFile(new URL('../frontend/web/pages/daily-notes.mjs',import.meta.url),'utf8');
  const painter=notesSource.slice(notesSource.indexOf('export function paintNoteEntries')).replace('export function','function');
  const nodes=new Map([['#notes-date',notesDate]]);
  const root={dataset:{},querySelector:selector=>{
    if(!nodes.has(selector))nodes.set(selector,{dataset:{},children:[],append(){}});return nodes.get(selector);
  }};
  const context=vm.createContext({root,store:{entry:()=>null},current:{date,ids:[],loaded:true,canEdit:true,error:''},legacy:{version:0},
    dailyNotesToday:()=>date,paintActiveEditor(){},paintLegacySummary(){},paintOtherLegacy(){},paintRetainedDrafts(){},
    retainedLegacy:()=>false,noteDraftNeedsAttention:()=>false});
  vm.runInContext(painter+';paintNoteEntries(root,store,current,legacy);',context);
  assert.equal(notesDate.value,date);assert.equal(notesDate.defaultValue,'');
  const controller=await fs.readFile(new URL('../frontend/web/daily-notes-controller.mjs',import.meta.url),'utf8');
  const historyAssignment=controller.match(/root\.querySelector\('#notes-history-month'\)\.value = month;/)?.[0];assert.ok(historyAssignment);
  vm.runInNewContext(historyAssignment,{root:{querySelector:()=>historyMonth},month:'2026-11'});
  const monthSource=await fs.readFile(new URL('../frontend/web/notes-month-controller.mjs',import.meta.url),'utf8');
  const monthAssignment=monthSource.match(/find\('#notes-month-input'\)\.value=month;/)?.[0];assert.ok(monthAssignment);
  vm.runInNewContext(monthAssignment,{find:()=>month,month:'2026-11'});
  const previousDocument=globalThis.document;
  globalThis.document={activeElement:null,querySelector:()=>({querySelector:selector=>selector==='#reminder-date'?reminderDate:{}})};
  try{paintWorkReminders({date,items:[]});}finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
  assert.equal(reminderDate.value,date);assert.equal(reminderDate.defaultValue,'');
  const h=harness({fields:[notesDate,historyMonth,month,reminderDate]});h.lifecycle.requestFlush('painted-navigation');
  assert.equal(await finished(h.lifecycle,'painted-navigation'),'complete');h.lifecycle.resume('painted-navigation');
});

test('the navigation exemption does not permit unknown business dates/numbers or a navigation-ID lookalike outside its original scope',async()=>{
  for(const input of [
    field('business-due-date',date,{type:'date'}),
    field('business-amount','500',{type:'number',defaultValue:'500'}),
    field('notes-date',date,{type:'date',closest:()=>null}),
    field('',date,{type:'date',dataset:{futureDateId:id},defaultValue:date}),
  ]) {
    const h=harness({fields:[input]});h.lifecycle.requestFlush('unknown-business');
    assert.equal(await finished(h.lifecycle,'unknown-business'),'failed');assert.equal(input.disabled,false);
  }
});


test('monotonic composer revisions remain distinct even with a deterministic test UUID generator and reopen',async()=>{
  const db=createMemoryDB(),journal=makeJournal(db,LOCAL_SCOPE,{uuid:()=>id});await journal.initialize();
  await journal.set('todo',date,'same');const first=journal.snapshot('todo',date);
  await journal.set('todo',date,'other');await journal.set('todo',date,'same');
  assert.equal(journal.matches(first),false);assert.notEqual(journal.snapshot('todo',date).writeId,first.writeId);
  await journal.flush();const reopened=makeJournal(db,LOCAL_SCOPE,{uuid:()=>id});await reopened.initialize();
  const before=reopened.snapshot('todo',date);await reopened.set('todo',date,'other');await reopened.set('todo',date,'same');
  assert.equal(reopened.matches(before),false);
});
