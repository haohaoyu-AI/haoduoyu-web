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
let provider = 0, dispatches = 0, puts = 0, connected = true, batches = Promise.resolve();
const objects = new Map();
const db = {
 batch(statements) {const task = batches.then(async () => {sql.exec('BEGIN'); try {const results = []; for (const statement of statements) results.push(await statement.run()); sql.exec('COMMIT'); return results;} catch (error) {sql.exec('ROLLBACK'); throw error;}}); batches = task.catch(() => {}); return task;},
 prepare(query) {return {bind: (...args) => ({first: async () => sql.prepare(query).get(...args) || null, all: async () => ({results: sql.prepare(query).all(...args)}), run: async () => {return {meta: {changes: Number(sql.prepare(query).run(...args).changes)}};}})};},
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
const stats=()=>JSON.stringify(['outline_flows','outline_flow_stages','claude_attempts','writing_runs','daily_editorial_drafts','manual_writing_batches','articles','article_deliveries'].map(t=>sql.prepare('SELECT * FROM '+t+' ORDER BY 1').all()));
await setup('controls');const empty=stats(),args=createArgs('web-controls-unique');
for(const [headers,status] of [[{'oai-authenticated-user-id':''},401],[{origin:''},403],[{origin:'https://evil.test'},403],[{'x-xiaoyu-outline-flow':''},403],[{'content-type':'text/plain'},415]]){const r=await post('create',args,headers);assert.equal(r.status,status);assert.equal(stats(),empty);assert.equal(requests.length,0);}
let bodyReads=0;const authFailure=await controlRoute.POST({url:'https://site.test/api/writing/outline-flow',headers:new Headers(),get body(){bodyReads++;throw Error(secret);}});assert.equal(authFailure.status,401);assert.equal(bodyReads,0);
for(const [action,value] of [['create',{...args,owner:'other'}],['create',{...args,confirm:false}],['create',{...args,materials:secret.repeat(8)}],['arbitrary',{}],['claim_stage',{run_id:crypto.randomUUID(),stage:'body',confirm:true}]]){const r=await post(action,value);assert.equal(r.status,400);assert.ok(!JSON.stringify(r.data).includes(secret));assert.equal(stats(),empty);assert.equal(requests.length,0);}
const headers={'content-type':'application/json',origin:'https://site.test','x-xiaoyu-outline-flow':'1','oai-authenticated-user-id':'controls'};
for(const body of ['{"secret":"'+secret+'",',JSON.stringify({action:'create',arguments:args,owner:'other'}),JSON.stringify({action:'create',arguments:args})+' '.repeat(120000)]){const r=await controlRoute.POST(new Request('https://site.test/api/writing/outline-flow',{method:'POST',headers,body}));assert.ok([400,413].includes(r.status));assert.ok(!(await r.text()).includes(secret));assert.equal(stats(),empty);}
const oversize=await controlRoute.POST(new Request('https://site.test/api/writing/outline-flow',{method:'POST',headers,body:'汉'.repeat(40001)}));assert.equal(oversize.status,413);assert.equal(stats(),empty);
const utf8=await controlRoute.POST(new Request('https://site.test/api/writing/outline-flow',{method:'POST',headers,body:new Uint8Array([0xff])}));assert.equal(utf8.status,400);assert.equal(stats(),empty);
const created=await post('create',args);assert.equal(created.status,200);assert.equal(created.headers.get('cache-control'),'private, no-store');assert.deepEqual(Object.keys(created.data).sort(),['action','created','run_id','state']);assert.equal(created.data.created,true);assert.equal(requests.length,0);
const duplicate=await post('create',args);assert.equal(duplicate.data.created,false);assert.equal(duplicate.data.run_id,created.data.run_id);assert.equal(requests.length,0);
let run=await flow.readOutlineFlow('controls',{run_id:created.data.run_id});const claimArgs=stage=>({run_id:run.run_id,stage,expected_snapshot_sha256:run.snapshot_sha256,confirm:true});
assert.equal((await post('claim_stage',claimArgs('body'))).status,400);assert.equal((await post('review',reviewArgs(run))).status,400);assert.equal(requests.length,0);
const pair=await Promise.all([post('claim_stage',claimArgs('outline')),post('claim_stage',claimArgs('outline'))]);const won=pair.find(x=>x.data.claimed).data,lost=pair.find(x=>!x.data.claimed).data;assert.ok(won.token);assert.ok(won.input_sha256);assert.ok(!('token' in lost));assert.ok(!('input' in won));assert.equal(requests.length,0);
const claimed=await post('claim_stage',claimArgs('outline'));assert.equal(claimed.data.claimed,false);assert.ok(!('token' in claimed.data));
assert.equal((await post('claim_stage',claimArgs('outline'),{'oai-authenticated-user-id':'other'})).status,400);assert.equal((await post('recover_completed',{run_id:run.run_id,stage:'outline',confirm:true})).status,400);assert.equal(requests.length,0);
await execute('controls',run,won);assert.equal(requests.length,1);run=await flow.readOutlineFlow('controls',{run_id:run.run_id});
const forged=await post('review',{...reviewArgs(run),expected_outline_sha256:'0'.repeat(64)});assert.equal(forged.status,400);assert.equal((await post('claim_stage',claimArgs('body'))).status,400);assert.equal(requests.length,1);
const actualReview=reviewArgs(run),approved=await post('review',actualReview);assert.equal(approved.status,200);assert.equal(approved.data.state,'approved');assert.ok(!JSON.stringify(approved.data).includes(won.token));assert.ok(!('snapshot' in approved.data));assert.equal(requests.length,1);
const recovered=await post('recover_completed',{run_id:run.run_id,stage:'outline',confirm:true});assert.equal(recovered.status,200);assert.equal(requests.length,1);assert.ok(!('token' in recovered.data));
const bodyClaim=await post('claim_stage',claimArgs('body'));assert.equal(bodyClaim.status,200);assert.equal(bodyClaim.data.claimed,true);assert.equal(requests.length,1);
const participants=Object.fromEntries(['review','rewrite','verify'].map(stage=>[stage,{actor_id:crypto.randomUUID(),model:'actual-independent-'+stage}]));const revisionArgs={run_id:run.run_id,writer_actor_id:crypto.randomUUID(),writer_execution_id:crypto.randomUUID(),participants,expected_prompt_version:run.snapshot.prompt_version,confirm:true};assert.equal((await post('create_revision',revisionArgs)).status,400);assert.equal(requests.length,1);
reply=article;await execute('controls',run,bodyClaim.data);assert.equal(requests.length,2);
const revision=await post('create_revision',revisionArgs);assert.equal(revision.status,200);assert.equal(revision.data.created,true);assert.equal(revision.data.run_id,run.run_id);assert.ok(revision.data.flow_id);assert.deepEqual(Object.keys(revision.data).sort(),['action','created','current_phase','flow_id','run_id']);assert.equal(requests.length,2);assert.equal(dispatches,0);assert.equal(puts,0);
assert.equal((await post('create_revision',{...revisionArgs,participants:{...participants,review:{...participants.review,actor_id:revisionArgs.writer_actor_id}}})).status,400);assert.equal(requests.length,2);
for(const response of [created,duplicate,approved,recovered,revision]){assert.ok(!JSON.stringify(response.data).includes(won.token));assert.ok(!JSON.stringify(response.data).includes(bodyClaim.data.token));assert.ok(!JSON.stringify(response.data).includes(secret));}
const readonly=await controlRoute.GET(new Request('https://site.test/api/writing/outline-flow?run_id='+run.run_id,{headers:{'oai-authenticated-user-id':'controls'}}));const read=await readonly.json();assert.ok(!JSON.stringify(read).includes(won.token));assert.ok(!JSON.stringify(read).includes(bodyClaim.data.token));assert.equal(requests.length,2);assert.equal(provider,0);
console.log('PASS actual webpage POST guards: owner/origin/header/content-type/120000 UTF8 bytes/strict envelope/action args/confirmation; credential-safe failures, no identity injection');
console.log('PASS same service gates: controls never generate; outline/body atomic claims yield token once, review exact hash required, recover only completed cache, body requires pass, revision requires actual stored initial and independent participant identities');
console.log('PASS minimal response contracts: no full result or prompts exposed; only winning claim has volatile token; read/other actions never return it; two explicit mock executions, zero real provider/online/artifact/event changes');
