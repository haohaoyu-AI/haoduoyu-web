// Actual in-memory SQLite integration. All provider/network calls are forbidden.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';


const sql = new DatabaseSync(':memory:'), nativeRequire = createRequire(import.meta.url);
for (const file of fs.readdirSync('drizzle').filter(n => n.endsWith('.sql')).sort()) sql.exec(fs.readFileSync('drizzle/' + file, 'utf8'));
let mockFetch = null;
let provider = 0, dispatches = 0, puts = 0, connected = true, batches = Promise.resolve(), beforeRun = null;
const objects = new Map();
const db = {
 batch(statements) {const task = batches.then(async () => {sql.exec('BEGIN'); try {const results = []; for (const statement of statements) results.push(await statement.run()); sql.exec('COMMIT'); return results;} catch (error) {sql.exec('ROLLBACK'); throw error;}}); batches = task.catch(() => {}); return task;},
 prepare(query) {return {bind: (...args) => ({first: async () => sql.prepare(query).get(...args) || null, all: async () => ({results: sql.prepare(query).all(...args)}), run: async () => {if(beforeRun)await beforeRun(query,args);return {meta: {changes: Number(sql.prepare(query).run(...args).changes)}};}})};},
};
const bucket = {async put(key, bytes) {puts++; objects.set(key, new Uint8Array(bytes));}, async get(key) {const bytes = objects.get(key); return bytes ? {arrayBuffer: async () => bytes.buffer} : null;}};
const globals = {crypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Set, Date, Error, URL, btoa, atob, Request, Response, File, ReadableStream, AbortSignal, setInterval, clearInterval};
const modules = {};
function load(name) {
 if (modules[name]) return modules[name]; const ex = {}; modules[name] = ex;
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/' + name + '.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, {...globals, exports: ex, require: name => name === 'cloudflare:workers' ? {env: {DB: db, BUCKET: bucket, CLAUDE_CONFIG_KEY: btoa('01234567890123456789012345678901')}} : name === './events' ? {readiness: async () => ({connected}), dispatch: async () => {dispatches++; return '事件已送达';}} : name.startsWith('./') ? load(name.slice(2)) : nativeRequire(name), fetch: async (...args) => {if (mockFetch) {return mockFetch(...args);} provider++; throw Error('Network/provider disabled in offline test');}});
 return ex;
}
const flow=load('outline-flow'),cl=load('claude');
const model='claude-opus-5-5',secret='opaque.synthetic.only.provider-key',day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const sources=[{title:'合成事实源1',url:'https://example.com/one',published:day},{title:'合成事实源2',url:'https://example.com/two',published:day}];
const evidence=[{id:'E1',text:'用于离线测试的第一个事实',source_ids:['S1']},{id:'E2',text:'用于离线测试的第二个事实',source_ids:['S2']}];
const outline={core_judgment:'合成主题的核心判断',opening_fact:{text:'用于开头的事实',evidence_ids:['E1']},nodes:[1,2,3].map(i=>({question:'解决问题'+i,new_information:'新增信息'+i,evidence_ids:['E1','E2']})),ending:'具体事实上的结尾',fact_gaps:[]};
const article={title:'合成独立流程正文',paragraphs:Array.from({length:25},(_,i)=>String(i).padStart(2,'0')+'文'.repeat(98))};
let requests=[],reply=outline,stop='end_turn',http=200,echo=null,returnedModel=model;
mockFetch=async(url,opts)=>{if(url.endsWith('/v1/models'))return Response.json({data:[{id:model,max_output_tokens:128000}]});assert.equal(url,'https://app.yylx.io/v1/messages');const body=JSON.parse(opts.body);requests.push(body);assert.equal(body.max_tokens,128000);assert.ok(body.system.includes(load('writing-supplement').effectiveWritingPrompt));return Response.json({model:returnedModel,stop_reason:stop,content:[{type:'text',text:echo||JSON.stringify(reply)}],usage:{input_tokens:1000,output_tokens:5000}}, {status:http});};
async function setup(owner){await cl.configureClaude(owner,{api_key:secret,model,enabled:true,consent:true});}
function createArgs(key=crypto.randomUUID()){return {authorization_key:key,expected_model:model,expected_prompt_version:load('writing-supplement').effectiveWritingStyleVersion,topic:'离线合成影视题',materials:'已经核实的合成事实与限制，不是真实报道，不作为线上材料。'.repeat(8),sources,evidence,confirm:true};}
function executeArgs(run,lease,stage=lease.stage){return {run_id:run.run_id,stage,token:lease.token,expected_model:model,expected_input_sha256:lease.input_sha256,confirm:true};}
async function execute(owner,run,lease){return flow.executeOutlineStage(await flow.prepareOutlineStage(owner,executeArgs(run,lease)));}
function reviewArgs(run,decision='pass'){return {run_id:run.run_id,expected_snapshot_sha256:run.snapshot_sha256,expected_outline_sha256:run.outline_sha256,outline_version:1,actor_id:crypto.randomUUID(),execution_id:crypto.randomUUID(),reviewer_model:'independent-xiaoyu-agent',decision,reason:'已独立核对核心判断、推进、证据和事实缺口',issues:decision==='pass'?[]:['推进需要进一步澄清'],minimal_changes:decision==='pass'?[]:['精确说明新增判断'],confirm:true};}
const controlRoute={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/writing/outline-flow/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{...globals,exports:controlRoute,require:name=>load(name.split('/').at(-1))});
const makeRequest=(action,args,extra={})=>new Request('https://site.test/api/writing/outline-flow',{method:'POST',headers:{'content-type':'application/json',origin:'https://site.test','x-xiaoyu-outline-flow':'1','oai-authenticated-user-id':'controls',...extra},body:JSON.stringify({action,arguments:args})});
async function post(action,args,extra){const response=await controlRoute.POST(makeRequest(action,args,extra));return {status:response.status,headers:response.headers,data:await response.json()};}
sql.exec("CREATE TABLE IF NOT EXISTS workflow_controls(owner TEXT NOT NULL,scope TEXT NOT NULL,run_id TEXT NOT NULL,state TEXT NOT NULL,reason TEXT,created TEXT NOT NULL,updated TEXT NOT NULL,PRIMARY KEY(owner,scope,run_id))");
const stats=()=>JSON.stringify(['outline_flows','outline_flow_stages','claude_attempts','writing_runs','daily_editorial_drafts','manual_writing_batches','articles','article_deliveries'].map(t=>sql.prepare('SELECT * FROM '+t+' ORDER BY 1').all()));

await setup('controls');const args=createArgs('archive-exact-family');
let parent=await flow.createOutlineFlow('controls',args);
const lease=await flow.claimOutlineStage('controls',{run_id:parent.run_id,stage:'outline',expected_snapshot_sha256:parent.snapshot_sha256,confirm:true});
await execute('controls',parent,lease);parent=await flow.readOutlineFlow('controls',{run_id:parent.run_id});
const review=reviewArgs(parent,'revise');await flow.reviewOutlineFlow('controls',review);parent=await flow.readOutlineFlow('controls',{run_id:parent.run_id});
const revisionArgs={run_id:parent.run_id,expected_snapshot_sha256:parent.snapshot_sha256,expected_outline_sha256:parent.outline_sha256,expected_review_sha256:parent.review_sha256,additional_materials:'合成追加材料，已核实，不是真实报道。',additional_sources:[{title:'新增合成证据',url:'https://example.com/three',published:day}],additional_evidence:[{id:'E3',text:'新增离线合成事实',source_ids:['S3']}],confirm:true};
const child=await flow.createOutlineRevision('controls',revisionArgs);
const childLease=await flow.claimOutlineStage('controls',{run_id:child.run_id,stage:'outline',expected_snapshot_sha256:child.snapshot_sha256,confirm:true});
const prepared=await flow.prepareOutlineStage('controls',executeArgs(child,childLease));
const legacyState=stats(),before=requests.length;
assert.equal((await post('archive',{run_id:parent.run_id,confirm:false})).status,400);
await assert.rejects(flow.archiveOutlineFlow('other',{run_id:parent.run_id,confirm:true}));
const archived=await post('archive',{run_id:parent.run_id,reason:'精确离线测试',confirm:true});assert.equal(archived.status,200);assert.equal(archived.data.archived,true);assert.deepEqual(archived.data.affected_run_ids.sort(),[parent.run_id,child.run_id].sort());
assert.equal(sql.prepare("SELECT count(*) n FROM workflow_controls WHERE owner='controls' AND state='archived'").get().n,2);assert.equal(stats(),legacyState,'archiving never changes states, artifacts or paid receipts');
assert.equal((await flow.listOutlineFlows('controls')).items.length,0);assert.equal((await flow.listOutlineFlows('controls',{include_archived:true})).items.length,2);
for(const run of [parent,child])assert.equal((await flow.readOutlineFlow('controls',{run_id:run.run_id})).archived,true);
await assert.rejects(flow.createOutlineFlow('controls',args),/归档/);
await assert.rejects(flow.createOutlineRevision('controls',revisionArgs),/归档/);
await assert.rejects(flow.claimOutlineStage('controls',{run_id:parent.run_id,stage:'outline',expected_snapshot_sha256:parent.snapshot_sha256,confirm:true}),/归档/);
await assert.rejects(flow.prepareOutlineStage('controls',executeArgs(child,childLease)),/归档/);
await assert.rejects(flow.executeOutlineStage(prepared),/归档/);
await assert.rejects(flow.recoverOutlineStage('controls',parent.run_id,'outline'),/归档/);
await assert.rejects(flow.reviewOutlineFlow('controls',review),/归档/);
assert.equal(stats(),legacyState);assert.equal(requests.length,before);assert.equal(dispatches,0);assert.equal(puts,0);
const restored=await post('restore',{run_id:child.run_id,confirm:true});assert.equal(restored.status,200);assert.equal(restored.data.run_id,parent.run_id);assert.equal(restored.data.archived,false);assert.equal(restored.data.automatic_resume,false);assert.equal((await flow.listOutlineFlows('controls')).items.length,2);assert.equal(stats(),legacyState);assert.equal(requests.length,before);
await flow.outlineFlowCall('controls','archive_outline_flow',{run_id:parent.run_id,confirm:true});await flow.outlineFlowCall('controls','restore_outline_flow',{run_id:parent.run_id,confirm:true});assert.equal(stats(),legacyState);assert.equal(requests.length,before);
assert.ok(flow.outlineFlowTools.some(tool=>tool.name==='archive_outline_flow'));assert.ok(flow.outlineFlowTools.some(tool=>tool.name==='restore_outline_flow'));
console.log('PASS exact owner-scoped atomic parent+child archive/restore; default visibility only; cached/idempotent mutations blocked; preserved frozen data and paid receipts; no provider or handoff');

// A child-only pause still fences the whole exact family, but remains visible.
const control=(id,state='paused',reason='独立暂停原因')=>sql.prepare('INSERT INTO workflow_controls(owner,scope,run_id,state,reason,created,updated) VALUES(?,?,?,?,?,?,?) ON CONFLICT(owner,scope,run_id) DO UPDATE SET state=excluded.state,reason=excluded.reason').run('controls','outline_flow',id,state,reason,day,day);
for(const target of [parent.run_id,child.run_id]){
 control(target);assert.equal((await flow.listOutlineFlows('controls')).items.length,2);
 for(const id of [parent.run_id,child.run_id]){const read=await flow.readOutlineFlow('controls',{run_id:id});assert.equal(read.paused,true);assert.equal(read.archived,false);assert.equal(read.mutation_allowed,false);await assert.rejects(flow.assertOutlineWorkflowMutable('controls',id),/暂停/);}
 await assert.rejects(flow.prepareOutlineStage('controls',executeArgs(child,childLease)),/暂停/);await assert.rejects(flow.executeOutlineStage(prepared),/暂停/);await assert.rejects(flow.createOutlineRevision('controls',revisionArgs),/暂停/);await assert.rejects(flow.reviewOutlineFlow('controls',review),/暂停/);await assert.rejects(flow.recoverOutlineStage('controls',parent.run_id,'outline'),/暂停/);
 await flow.archiveOutlineFlow('controls',{run_id:child.run_id,confirm:true});await flow.archiveOutlineFlow('controls',{run_id:parent.run_id,confirm:true});await flow.restoreOutlineFlow('controls',{run_id:parent.run_id,confirm:true});
 const restoredPause=sql.prepare('SELECT state,reason FROM workflow_controls WHERE owner=? AND run_id=?').get('controls',target);assert.equal(restoredPause.state,'paused');assert.equal(restoredPause.reason,'独立暂停原因');assert.equal((await flow.readOutlineFlow('controls',{run_id:child.run_id})).paused,true);
 sql.prepare('DELETE FROM workflow_controls WHERE owner=?').run('controls');
}
assert.equal(stats(),legacyState);assert.equal(requests.length,before);
// Cross-owner controls cannot hide or pause somebody else’s family.
sql.prepare('INSERT INTO workflow_controls(owner,scope,run_id,state,reason,created,updated) VALUES(?,?,?,?,?,?,?)').run('other','outline_flow',parent.run_id,'archived','foreign owner',day,day);assert.equal((await flow.listOutlineFlows('controls')).items.length,2);assert.equal((await flow.readOutlineFlow('controls',{run_id:parent.run_id})).archived,false);
// Any failure while the child archive row is inserted rolls the whole family back.
sql.exec(`CREATE TRIGGER reject_archive_child BEFORE INSERT ON workflow_controls WHEN NEW.owner='controls' AND NEW.run_id='${child.run_id}' BEGIN SELECT RAISE(ABORT,'offline forced archive failure'); END;`);
await assert.rejects(flow.archiveOutlineFlow('controls',{run_id:parent.run_id,confirm:true}));assert.equal(sql.prepare("SELECT count(*) n FROM workflow_controls WHERE owner='controls'").get().n,0);assert.equal(stats(),legacyState);sql.exec('DROP TRIGGER reject_archive_child');
console.log('PASS parent/child pause fences, paused restore preservation, owner isolation and all-or-nothing family rollback; no automatic resumption');

// Real failed body state and exact paid response remain readable byte-for-byte.
async function fresh(key){const args=createArgs(key),run=await flow.createOutlineFlow('controls',args);return {args,run};}
const {run:failedRun}=await fresh('failed-body-preservation');let failedLease=await flow.claimOutlineStage('controls',{run_id:failedRun.run_id,stage:'outline',expected_snapshot_sha256:failedRun.snapshot_sha256,confirm:true});reply=outline;await execute('controls',failedRun,failedLease);
let failedRead=await flow.readOutlineFlow('controls',{run_id:failedRun.run_id});await flow.reviewOutlineFlow('controls',reviewArgs(failedRead));failedRead=await flow.readOutlineFlow('controls',{run_id:failedRun.run_id});
const bodyLease=await flow.claimOutlineStage('controls',{run_id:failedRun.run_id,stage:'body',expected_snapshot_sha256:failedRun.snapshot_sha256,confirm:true});reply=article;stop='max_tokens';await execute('controls',failedRun,bodyLease);stop='end_turn';
const failedBefore=stats(),paidBefore=JSON.stringify(sql.prepare("SELECT * FROM claude_attempts WHERE id=?").get(`outline_flow:controls:${failedRun.run_id}:body`)),failedCalls=requests.length;
await flow.archiveOutlineFlow('controls',{run_id:failedRun.run_id,confirm:true});failedRead=await flow.readOutlineFlow('controls',{run_id:failedRun.run_id});assert.equal(failedRead.state,'body_failed');assert.equal(failedRead.archived,true);assert.equal(failedRead.stages.body.state,'failed');assert.equal(failedRead.stages.body.result.usage.output_tokens,5000);assert.equal(stats(),failedBefore);assert.equal(JSON.stringify(sql.prepare('SELECT * FROM claude_attempts WHERE id=?').get(`outline_flow:controls:${failedRun.run_id}:body`)),paidBefore);
await assert.rejects(flow.prepareOutlineStage('controls',executeArgs(failedRun,bodyLease)),/归档/);await assert.rejects(flow.recoverOutlineStage('controls',failedRun.run_id,'body'),/归档/);await flow.restoreOutlineFlow('controls',{run_id:failedRun.run_id,confirm:true});assert.equal(stats(),failedBefore);assert.equal(requests.length,failedCalls);assert.equal((await flow.readOutlineFlow('controls',{run_id:failedRun.run_id})).state,'body_failed');
console.log('PASS body_failed and immutable paid usage/diagnostic receipt preserved by archive and restore; no failed request retry');

// A request already in flight may finish its paid receipt, but cannot revive state.
const {run:inflight}=await fresh('inflight-receipt');const inflightLease=await flow.claimOutlineStage('controls',{run_id:inflight.run_id,stage:'outline',expected_snapshot_sha256:inflight.snapshot_sha256,confirm:true});const inflightPrepared=await flow.prepareOutlineStage('controls',executeArgs(inflight,inflightLease));
const originalFetch=mockFetch;let release,started;const start=new Promise(resolve=>{started=resolve;});mockFetch=async(url,opts)=>{if(url.endsWith('/v1/messages')){started();await new Promise(resolve=>{release=resolve;});}return originalFetch(url,opts);};reply=outline;
const running=flow.executeOutlineStage(inflightPrepared);await start;await flow.archiveOutlineFlow('controls',{run_id:inflight.run_id,confirm:true});release();const terminal=await running;mockFetch=originalFetch;assert.equal(terminal.saved,false);
let inRead=await flow.readOutlineFlow('controls',{run_id:inflight.run_id});assert.equal(inRead.archived,true);assert.equal(inRead.state,'outline_pending');assert.equal(inRead.outline,null);assert.equal(inRead.stages.outline.state,'completed');assert.equal(inRead.stages.outline.result.usage.output_tokens,5000);const inflightCalls=requests.length;
await assert.rejects(flow.recoverOutlineStage('controls',inflight.run_id,'outline'),/归档/);await assert.rejects(flow.executeOutlineStage(inflightPrepared),/归档/);await flow.restoreOutlineFlow('controls',{run_id:inflight.run_id,confirm:true});inRead=await flow.readOutlineFlow('controls',{run_id:inflight.run_id});assert.equal(inRead.outline,null);assert.equal(inRead.state,'outline_pending');assert.equal(requests.length,inflightCalls);await flow.recoverOutlineStage('controls',inflight.run_id,'outline');assert.equal((await flow.readOutlineFlow('controls',{run_id:inflight.run_id})).state,'outline_review_pending');assert.equal(requests.length,inflightCalls);
console.log('PASS in-flight actual paid receipt retained after archive while state/cache recovery is fenced; restore only reveals, separately confirmed recovery is provider-free');

// A competing archive arriving after preflight is checked inside mutation SQL.
const {run:claimRace}=await fresh('atomic-claim-race');let fired=false;beforeRun=async(query)=>{if(!fired&&query.startsWith('INSERT OR IGNORE INTO outline_flow_stages')){fired=true;control(claimRace.run_id,'archived');}};
await assert.rejects(flow.claimOutlineStage('controls',{run_id:claimRace.run_id,stage:'outline',expected_snapshot_sha256:claimRace.snapshot_sha256,confirm:true}),/归档/);beforeRun=null;assert.equal(sql.prepare('SELECT count(*) n FROM outline_flow_stages WHERE run_id=?').get(claimRace.run_id).n,0);assert.equal(fired,true);
const {run:approveRace}=await fresh('atomic-approval-race');const approveLease=await flow.claimOutlineStage('controls',{run_id:approveRace.run_id,stage:'outline',expected_snapshot_sha256:approveRace.snapshot_sha256,confirm:true});await execute('controls',approveRace,approveLease);const ready=await flow.readOutlineFlow('controls',{run_id:approveRace.run_id});fired=false;beforeRun=async(query)=>{if(!fired&&query.startsWith('UPDATE outline_flows SET state=?,review_json')){fired=true;control(approveRace.run_id,'archived');}};
await assert.rejects(flow.reviewOutlineFlow('controls',reviewArgs(ready)));beforeRun=null;assert.equal(fired,true);const untouched=sql.prepare('SELECT state,review_json,writing_input FROM outline_flows WHERE id=?').get(approveRace.run_id);assert.equal(untouched.state,'outline_review_pending');assert.equal(untouched.review_json,null);assert.equal(untouched.writing_input,null);
assert.equal(dispatches,0);assert.equal(puts,0);assert.equal(provider,0);
console.log('PASS atomic SQL claim/approval fences reject archive-after-read races; all network calls explicitly local mocked, zero real provider/files/events');

// Reuse the existing isolated React hook harness for offline page controls.
const uiPrelude=fs.readFileSync('tests/outline-flow-controls.mjs','utf8').split('// Rendering is inert;')[0].replace(/^import .*;\n/gm,'').replace('const nativeRequire=createRequire(import.meta.url);','');
await vm.runInNewContext('(async()=>{'+uiPrelude+`
 const initial=snapshot('outline_pending','claimed'),archived={...initial,archived:true,paused:false,mutation_allowed:false};
 const h=harness(initial),archiveForm=h.form('归档本批次及修订');h.submit('归档本批次及修订',{},archiveForm);assert.equal(h.requests.length,0);
 let resolve;h.reply=({options})=>options.method==='POST'?new Promise(done=>{resolve=done;}):ok(archived);
 h.submit('归档本批次及修订',{confirm:'on',reason:'精确页面归档'},archiveForm);h.submit('归档本批次及修订',{confirm:'on'},archiveForm);await drain();assert.equal(postRequests(h).length,1);assert.deepEqual(postRequests(h)[0].payload,{action:'archive',arguments:{run_id:run,reason:'精确页面归档',confirm:true}});
 resolve(ok({run_id:run,affected_run_ids:[run,other],archived:true,automatic_resume:false}));await drain();assert.match(h.html(),/本批次及修订已归档/);assert.match(h.html(),/恢复可见不会自动继续生成/);
 for(const label of ['认领本阶段','执行本阶段','从已存结果恢复阶段'])assert.equal(h.find('button',node=>textOf(node)===label).props.disabled,true);
 h.submit('认领本阶段');h.submit('执行本阶段');h.submit('从已存结果恢复阶段');await drain();assert.equal(postRequests(h).length,1);
 const details=h.nodes().filter(node=>node.type==='details');assert.ok(details.length>=2);assert.ok(details.every(node=>node.props.open===undefined),'all detail sections preserve existing native collapsed state');
 h.reply=({options})=>options.method==='POST'?ok({run_id:run,affected_run_ids:[run,other],archived:false,automatic_resume:false}):ok(initial);h.submit('恢复可见（不自动继续）',{});await drain();assert.equal(postRequests(h).length,1);
 h.submit('恢复可见（不自动继续）',{confirm:'on'});await drain();assert.equal(postRequests(h).length,2);assert.equal(postRequests(h)[1].payload.action,'restore');assert.equal(h.find('button',node=>textOf(node)==='执行本阶段').props.disabled,true,'restore does not reconstruct or reuse a lease');assert.ok(!h.requests.some(request=>request.url==='/api/claude/outline-run'));
 const paused=harness({...snapshot('outline_review_pending','completed'),paused:true,mutation_allowed:false});assert.equal(paused.find('button',node=>textOf(node)==='提交独立框架审核').props.disabled,true);assert.equal(paused.find('button',node=>textOf(node)==='从已存结果恢复阶段').props.disabled,true);
 assert.ok(!h.html().includes(token));assert.ok(!JSON.stringify(h.state()).includes(token));
})()`,{fs,vm,ts,assert,nativeRequire,renderToStaticMarkup:nativeRequire('react-dom/server').renderToStaticMarkup,TextEncoder,setImmediate});
console.log('PASS page archive/restore explicit consent and double-submit lock; paused/archived actions disabled, collapsed details unchanged, restored visibility never recreates a lease or calls provider');

// Legacy independent editorial stages and finalize also fence read-then-archive races.
const rev=load('text-revision'),final=load('daily-editorial-finalize'),writing=load('writing');
const {run:editorialRace}=await fresh('legacy-editorial-atomic-races');reply=outline;const erOutline=await flow.claimOutlineStage('controls',{run_id:editorialRace.run_id,stage:'outline',expected_snapshot_sha256:editorialRace.snapshot_sha256,confirm:true});await execute('controls',editorialRace,erOutline);const erRead=await flow.readOutlineFlow('controls',{run_id:editorialRace.run_id});await flow.reviewOutlineFlow('controls',reviewArgs(erRead));const erBody=await flow.claimOutlineStage('controls',{run_id:editorialRace.run_id,stage:'body',expected_snapshot_sha256:editorialRace.snapshot_sha256,confirm:true});reply=article;await execute('controls',editorialRace,erBody);const erRequests=requests.length;
const participants=Object.fromEntries(['review','rewrite','verify'].map(stage=>[stage,{actor_id:crypto.randomUUID(),model:'independent-'+stage}]));const erCreate={run_id:editorialRace.run_id,writer_actor_id:crypto.randomUUID(),writer_execution_id:crypto.randomUUID(),participants,expected_prompt_version:erRead.snapshot.prompt_version,confirm:true};
fired=false;beforeRun=async(query)=>{if(!fired&&query.startsWith('INSERT OR IGNORE INTO manual_writing_batches')){fired=true;control(editorialRace.run_id,'archived');}};await assert.rejects(rev.createOutlineTextRevision('controls',erCreate));beforeRun=null;assert.equal(fired,true);assert.equal(sql.prepare("SELECT count(*) n FROM manual_writing_batches WHERE authorization_key LIKE ?").get('%'+editorialRace.run_id).n,0);await flow.restoreOutlineFlow('controls',{run_id:editorialRace.run_id,confirm:true});
const erRevision=await rev.createOutlineTextRevision('controls',erCreate),erClaim={flow_id:erRevision.flow_id,stage:'review',expected_version:1,expected_model:participants.review.model,expected_prompt_version:erRead.snapshot.prompt_version,confirm:true};
fired=false;beforeRun=async(query)=>{if(!fired&&query.startsWith('INSERT OR IGNORE INTO writing_runs')&&query.includes('revision_claimed')){fired=true;control(editorialRace.run_id,'archived');}};await assert.rejects(rev.claimTextRevisionStage('controls',erClaim));beforeRun=null;assert.equal(fired,true);assert.equal(sql.prepare('SELECT count(*) n FROM writing_runs WHERE run_kind=?').get('text_revision:'+erRevision.flow_id+':review').n,0);await flow.restoreOutlineFlow('controls',{run_id:editorialRace.run_id,confirm:true});
let erLease=await rev.claimTextRevisionStage('controls',erClaim);const erSave=(stage,lease,report)=>({flow_id:erRevision.flow_id,stage,item_id:lease.item_id,token:lease.token,execution_id:crypto.randomUUID(),actor_id:participants[stage].actor_id,expected_model:participants[stage].model,expected_version:lease.prompts.input_version,expected_prompt_version:erRead.snapshot.prompt_version,input_sha256:lease.prompts.input_sha256,raw_result:JSON.stringify(report),confirm:true});const erReviewSave=erSave('review',erLease,{status:'completed',issues:[]});
fired=false;beforeRun=async(query)=>{if(!fired&&query.startsWith('UPDATE claude_attempts SET response=')&&query.includes('revision_claimed')){fired=true;control(editorialRace.run_id,'archived');}};await assert.rejects(rev.saveTextRevisionStage('controls',erReviewSave));beforeRun=null;assert.equal(fired,true);assert.equal(JSON.parse(sql.prepare('SELECT response FROM claude_attempts WHERE id=?').get('text_revision:controls:'+erRevision.flow_id).response).text_revision.results.review,undefined);await flow.restoreOutlineFlow('controls',{run_id:editorialRace.run_id,confirm:true});await rev.saveTextRevisionStage('controls',erReviewSave);
for(const stage of ['rewrite','verify']){erLease=await rev.claimTextRevisionStage('controls',{...erClaim,stage,expected_version:stage==='verify'?2:1,expected_model:participants[stage].model});await rev.saveTextRevisionStage('controls',erSave(stage,erLease,stage==='rewrite'?{status:'completed',article,changes:[]}:{status:'completed',passed:true,checks:[],remaining_problems:[]}));}
const erVerified=await rev.readTextRevision('controls',{flow_id:erRevision.flow_id}),erFinal={flow_id:erRevision.flow_id,expected_body_sha256:erVerified.rewritten_version.body_sha256,confirm:true};fired=false;beforeRun=async(query)=>{if(!fired&&query.startsWith('INSERT OR IGNORE INTO articles')){fired=true;control(editorialRace.run_id,'archived');}};await assert.rejects(final.finalizeVerifiedDailyRevision('controls',erFinal));beforeRun=null;assert.equal(fired,true);assert.equal(sql.prepare('SELECT count(*) n FROM articles WHERE id=?').get(editorialRace.article_id).n,0);assert.equal(sql.prepare('SELECT final_sha256 FROM daily_editorial_drafts WHERE article_id=?').get(editorialRace.article_id).final_sha256,null);assert.equal(sql.prepare('SELECT state FROM outline_flows WHERE id=?').get(editorialRace.run_id).state,'body_review_pending');assert.equal(dispatches,0);await flow.restoreOutlineFlow('controls',{run_id:editorialRace.run_id,confirm:true});
connected=false;await final.finalizeVerifiedDailyRevision('controls',erFinal);connected=true;control(editorialRace.run_id,'archived');
const terminalBytes=JSON.stringify(sql.prepare('SELECT * FROM writing_runs WHERE run_kind=?').get('outline_flow:'+editorialRace.run_id));const terminalArticle=JSON.stringify(sql.prepare('SELECT * FROM articles WHERE id=?').get(editorialRace.article_id));
const textRead=await writing.writingCall('controls','submit_writing_article',{day,writer:'claude',run_kind:'outline_flow:'+editorialRace.run_id});assert.equal(textRead.read_only,true);assert.equal(textRead.state,'text_saved');assert.equal(dispatches,0);assert.equal(JSON.stringify(sql.prepare('SELECT * FROM writing_runs WHERE run_kind=?').get('outline_flow:'+editorialRace.run_id)),terminalBytes);assert.equal(JSON.stringify(sql.prepare('SELECT * FROM articles WHERE id=?').get(editorialRace.article_id)),terminalArticle);assert.equal(requests.length,erRequests);assert.equal(provider,0);
console.log('PASS legacy revision create/claim/save, final article/freeze transaction and image dispatch claim all reject archive-after-read races; old content/provider receipts unchanged, no new request or event');
