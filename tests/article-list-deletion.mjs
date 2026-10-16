import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';

// Run actual deletion, intake/list, claim and notification code against every real migration.
// Only the external event transport, R2 and unrelated output/delivery handlers are simulated.
const nativeRequire = createRequire(import.meta.url);
const sql = new DatabaseSync(':memory:');
for (const file of fs.readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort()) {
  sql.exec(fs.readFileSync(`drizzle/${file}`, 'utf8'));
}
const objects = new Map();
let beforeDeletionBatch = null;
let beforeRun = null;
let beforeList = null;
let beforeDelete = null;
const bucket = {
  async head(key) {const bytes=objects.get(key);return bytes?{size:bytes.length,etag:Array.from(bytes).join('-')}:null;},
  async list({ prefix }) {
    if (beforeList) await beforeList(prefix);
    return { objects: [...objects].filter(([key]) => key.startsWith(prefix)).map(([key, bytes]) => ({ key, size: bytes.length })), truncated: false };
  },
  async put(key, bytes) { objects.set(key, bytes); },
  async delete(key) {
    if (beforeDelete) await beforeDelete(key);
    objects.delete(key);
  },
};
const db = {
  prepare(source) {
    return { bind(...values) {
      return { source, values,
        async first() { return sql.prepare(source).get(...values) || null; },
        async all() { return { results: sql.prepare(source).all(...values) }; },
        async run() {
          if (beforeRun) await beforeRun(source, values);
          return { meta: { changes: Number(sql.prepare(source).run(...values).changes) } };
        },
      };
    } };
  },
  async batch(statements) {
    if (beforeDeletionBatch && statements[0].source.includes("state='deleting'")) {
      const hook = beforeDeletionBatch; beforeDeletionBatch = null; await hook();
    }
    sql.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map(({ source, values }) => ({ meta: { changes: Number(sql.prepare(source).run(...values).changes) } }));
      sql.exec('COMMIT'); return results;
    } catch (error) { sql.exec('ROLLBACK'); throw error; }
  },
};
let dispatch = async () => '事件已送达';
const emptyTools = { outputRecoveryTools: [], outputRecoveryNames: new Set(), articleClaimRecoveryTools: [], articleClaimRecoveryNames: new Set(), articleUploadTools: [], articleUploadToolNames: new Set() };
const stubs = {
  './article-format': { MAX_FILE: 20_000_000, parseArticle: () => ['测试标题', '人工正文'] },
  './article-deliveries': { deliveryList: async (owner, id) => sql.prepare('SELECT * FROM article_deliveries WHERE owner=? AND article_id=?').all(owner, id) },
  './article-upload-diagnostics': { uploadDiagnosticTool: {}, uploadProgress: async () => ({}) },
  './article-output-recovery': emptyTools,
  './article-claim-recovery': emptyTools,
  './article-upload-attempts': emptyTools,
  './article-file-handoff': {}, './article-manifest': {}, './article-cleanup': {}, './output-format': {},
  './article-state-transitions': {}, './editorial-credential-text': {},
  './events': { readiness: async () => ({ connected: true }), dispatch: (...args) => dispatch(...args) },
  'cloudflare:workers': { env: { DB: db, BUCKET: bucket } },
};
const modules = new Map();
function load(filename) {
  filename = path.normalize(filename);
  if (modules.has(filename)) return modules.get(filename);
  const exports = {}; modules.set(filename, exports);
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, { exports, require: dependency => {
    if (Object.hasOwn(stubs, dependency)) return stubs[dependency];
    if (dependency.startsWith('.')) return load(path.join(path.dirname(filename), dependency + '.ts'));
    return nativeRequire(dependency);
  }, crypto: webcrypto, Date, JSON, Promise, Error, Set, Map, Array, Number, String, RegExp, TextEncoder, TextDecoder, Request, Response, URL });
  return exports;
}
const {previewListDeletion,confirmListDeletion,readListDeletion}=load('lib/article-list-deletion.ts');
const {articleWorklist,articleList}=load('lib/articles.ts');
const {articleCall}=load('lib/article-tools.ts');
const route=load('app/api/articles/list-delete/route.ts');
const policy=load('lib/article-list-policy.ts');
const now=()=>new Date().toISOString(), future=()=>new Date(Date.now()+3600_000).toISOString();
const past='2000-01-01T00:00:00.000Z';
let cases=0,seq=0;
const uuid=()=>webcrypto.randomUUID();
function insert(table,row){const names=Object.keys(row);sql.prepare(`INSERT INTO ${table}(${names.join(',')}) VALUES(${names.map(()=>'?').join(',')})`).run(...names.map(k=>row[k]));return row;}
function add(owner,override={}){const id=uuid();const row={id,owner,title:'隔离文章'+(++seq),filename:'test.docx',source_key:`articles/${id}/source`,paragraphs:JSON.stringify(['标题','BODY_SECRET_'+id]),state:'uploaded',created:new Date(Date.now()+seq).toISOString(),...override};insert('articles',row);objects.set(row.source_key,Uint8Array.from([1,2,seq%255]));return row;}
const get=r=>sql.prepare('SELECT * FROM articles WHERE owner=? AND id=?').get(r.owner,r.id);
const marks=r=>sql.prepare('SELECT * FROM article_deletions WHERE owner=? AND id=?').get(r.owner,r.id);
const ids=(owner,scope)=>sql.prepare(`SELECT id FROM articles WHERE owner=? AND ${policy.listScopeSql(scope)} AND ${policy.visibleArticleSql()} AND NOT ${policy.protectedArticleSql()} ORDER BY created DESC,id DESC LIMIT 5`).all(owner).map(r=>r.id);
const preview=(owner,scope='publish',key=uuid())=>previewListDeletion(owner,scope,key,ids(owner,scope));
const args=view=>({operation_id:view.operation_id,confirm_owner:view.owner,confirm_scope:view.scope,confirm_ids:view.items.map(r=>r.article_id),snapshot_sha256:view.snapshot_sha256,confirm_permanent:true});
function delivery(row,override={}){return insert('article_deliveries',{id:uuid(),owner:row.owner,article_id:row.id,platform:'zhihu',state:'saved',draft_url:'https://example.test/private',readback:JSON.stringify({body:'BODY_SECRET_'+row.id}),updated:now(),...override});}
function writing(row,override={}){return insert('writing_runs',{id:uuid(),owner:row.owner,article_id:row.id,day:'2026-10-08',writer:'xiaoyu',run_kind:'daily:'+uuid(),state:'text_saved',token:uuid(),expires:future(),sources:'[]',input_snapshot:JSON.stringify({body:'BODY_SECRET_'+row.id}),created:now(),updated:now(),...override});}
function completed(owner){const row=add(owner,{state:'completed',draft_url:'https://example.test/toutiao',claim_token:uuid(),claim_expires:past});const key=`articles/${row.id}/result-${'a'.repeat(64)}.docx`;sql.prepare('UPDATE articles SET result_key=?,result_meta=?,artifact_manifest=? WHERE id=?').run(key,JSON.stringify({output_id:uuid(),parts:[],size:3,sha256:'a'.repeat(64)}),JSON.stringify({body:'BODY_SECRET_'+row.id}),row.id);objects.set(key,Uint8Array.from([4,5,6]));delivery(row);return row;}
async function test(name,fn){await fn();cases++;console.log('PASS '+name);}
await test('preview reads exact owner / scope / last-five ID and R2 identity without deleting or copying bodies',async()=>{
 const owner='preview';const rows=Array.from({length:7},()=>add(owner));const work=add(owner,{state:'queued'});const before=JSON.stringify(sql.prepare('SELECT * FROM articles WHERE owner=?').all(owner)),keys=[...objects.keys()];const p=await preview(owner);
 assert.equal(p.count,5);assert.equal(p.file_count,5);assert.ok(p.items.every(r=>r.files[0].key===`articles/${r.article_id}/source`));assert.equal(p.owner,owner);assert.equal(p.scope,'publish');
 assert.equal(JSON.stringify(sql.prepare('SELECT * FROM articles WHERE owner=?').all(owner)),before);assert.deepEqual([...objects.keys()],keys);
 assert.ok(get(work));assert.ok(get(rows[0]));const stored=sql.prepare('SELECT snapshot_json FROM article_list_deletions WHERE id=?').get(p.operation_id).snapshot_json;assert.doesNotMatch(stored,/BODY_SECRET/);
 await assert.rejects(previewListDeletion(owner,'publish',uuid(),[rows[0].id]),/列表已变化/);
});
await test('explicit second confirmation and owner / scope / ID / snapshot equality required',async()=>{
 const r=add('confirmation'),p=await preview(r.owner);for(const patch of [{confirm_permanent:false},{confirm_owner:'other'},{confirm_scope:'writing'},{confirm_ids:[uuid()]},{snapshot_sha256:'f'.repeat(64)}])await assert.rejects(confirmListDeletion(r.owner,{...args(p),...patch}));
 await assert.rejects(readListDeletion('other',p.operation_id),/无权访问/);await assert.rejects(confirmListDeletion('other',args(p)));assert.ok(get(r));assert.ok(objects.has(r.source_key));
});
await test('clean only snapshotted recent five; newly added, queued, cross-owner and writing-list articles survive',async()=>{
 const owner='exact';const rows=Array.from({length:6},()=>add(owner));const p=await preview(owner);const late=add(owner),active=add(owner,{state:'processing',claim_token:uuid(),claim_expires:future()}),queued=add(owner,{state:'queued'}),other=add('other-owner');const generated=add(owner,{state:'text_saved'});writing(generated);
 const out=await confirmListDeletion(owner,args(p));assert.equal(out.content_deleted,true);assert.equal(out.count,5);for(const item of p.items){assert.equal(sql.prepare('SELECT 1 FROM articles WHERE id=?').get(item.article_id),undefined);assert.equal(objects.has(`articles/${item.article_id}/source`),false);}
 for(const r of [rows[0],late,active,queued,other,generated])assert.ok(get(r));assert.deepEqual(ids(owner,'writing'),[generated.id]);const again=await confirmListDeletion(owner,args(p));assert.equal(again.state,'deleted');assert.ok(get(late));assert.equal((await readListDeletion(owner,p.operation_id)).items[0].files.length,p.items[0].files.length);
});
await test('completed Toutiao alone is work; independent destination, queued, malformed/live claim, incomplete output and writing stages protected',async()=>{
 const owner='protected';const kept=[add(owner,{state:'queued'}),add(owner,{state:'processing'}),add(owner,{state:'completed',draft_url:'https://example.test'}),add(owner,{state:'failed',claim_token:uuid(),claim_expires:'not-a-date'}),add(owner,{state:'failed',claim_token:uuid(),claim_expires:future()}),add(owner,{state:'failed',result_meta:'{}'})];
 const d=completed(owner);sql.prepare("UPDATE article_deliveries SET state='pending' WHERE article_id=?").run(d.id);kept.push(d);
 const w=add(owner,{state:'text_saved'});writing(w,{state:'writing'});kept.push(w);
 const o=add(owner,{state:'text_saved'});insert('outline_flows',{id:uuid(),owner,article_id:o.id,authorization_key:uuid(),snapshot:'{}',snapshot_sha256:'a'.repeat(64),state:'approved',expires:future(),created:now(),updated:now()});kept.push(o);
 const work=await articleWorklist(owner);assert.ok(work.items.every(r=>r.list_section==='work'));assert.equal(work.pending_total,7);
 await assert.rejects(preview(owner),/没有可清空/);await assert.rejects(preview(owner,'writing'),/没有可清空/);for(const r of kept){assert.ok(get(r));assert.equal(marks(r),undefined);}
});
await test('atomic transaction aborts ALL targets when a genuine claim wins immediately before the fence',async()=>{
 const owner='claim-race';const r=add(owner,{state:'failed'}),sibling=add(owner),p=await preview(owner);let claim;
 beforeDeletionBatch=async()=>{claim=await articleCall(owner,'claim_article',{article_id:r.id});};
 await assert.rejects(confirmListDeletion(owner,args(p)),/进入处理|状态已变化/);assert.equal(claim.claimed,true);assert.equal(get(r).claim_token,claim.claim_token);assert.equal(get(sibling).state,'uploaded');assert.equal(marks(sibling),undefined);assert.equal(objects.has(sibling.source_key),true);assert.equal((await readListDeletion(owner,p.operation_id)).state,'previewed');
});
await test('atomic protection catches a queued platform delivery and writing flow inserted after preflight',async()=>{
 for(const dependency of ['delivery','flow']){const owner='dependent-'+dependency,r=completed(owner),p=await preview(owner);beforeDeletionBatch=async()=>{if(dependency==='delivery')delivery(r,{platform:'toutiao',state:'saving',claim_token:uuid(),claim_expires:future()});else insert('editorial_flows',{id:uuid(),owner,article_id:r.id,authorization_key:uuid(),snapshot:'{}',snapshot_sha256:'a'.repeat(64),state:'body',expires:future(),created:now(),updated:now()});};
 await assert.rejects(confirmListDeletion(owner,args(p)));assert.ok(get(r));assert.equal(marks(r),undefined);assert.equal(objects.has(r.source_key),true);}
});
await test('duplicate simultaneous confirmations share exactly one operation/lease and never select a later article',async()=>{
 const owner='double';const r=completed(owner),p=await preview(owner),late=add(owner);const attempts=await Promise.allSettled([confirmListDeletion(owner,args(p)),confirmListDeletion(owner,args(p))]);assert.ok(attempts.some(r=>r.status==='fulfilled'));assert.equal((await readListDeletion(owner,p.operation_id)).state,'deleted');assert.equal(get(r),undefined);assert.ok(get(late));
});
await test('partial R2 failure retains fenced content, readback and same-operation exact-file continuation',async()=>{
 const owner='partial',r=completed(owner),p=await preview(owner);let n=0;beforeDelete=async()=>{if(++n===2)throw Error('simulated file failure');};await assert.rejects(confirmListDeletion(owner,args(p)),/simulated file failure/);beforeDelete=null;
 assert.equal(get(r).state,'deleting');assert.equal((await readListDeletion(owner,p.operation_id)).state,'deleting');assert.equal(marks(r).state,'deleting');const late=add(owner);const out=await confirmListDeletion(owner,args(p));assert.equal(out.state,'deleted');assert.ok(get(late));assert.equal(get(r),undefined);assert.equal([...objects.keys()].filter(key=>key.startsWith(`articles/${r.id}/`)).length,0);
});
await test('file replacement or a newly appeared object cannot expand original confirmed scope',async()=>{
 const owner='new-object',r=completed(owner),p=await preview(owner);beforeDelete=async()=>{throw Error('interrupt before deletion');};await assert.rejects(confirmListDeletion(owner,args(p)));beforeDelete=null;
 const key=`articles/${r.id}/result-${'b'.repeat(64)}.docx`;objects.set(key,Uint8Array.from([7]));await assert.rejects(confirmListDeletion(owner,args(p)),/原快照/);assert.equal(objects.has(key),true);
 objects.delete(key);const original=objects.get(r.source_key);objects.set(r.source_key,Uint8Array.from([9,9,9]));await assert.rejects(confirmListDeletion(owner,args(p)),/原快照/);assert.ok(objects.has(r.source_key));objects.set(r.source_key,original);assert.equal((await confirmListDeletion(owner,args(p))).state,'deleted');
});
await test('writing original/Word/draft readbacks, initial and stage/provider bodies purged; quota identities and other owner unchanged',async()=>{
 const owner='content',r=add(owner,{state:'text_saved'}),w=writing(r),other=add('content-other',{state:'text_saved'});writing(other);const otherBefore=JSON.stringify(get(other));
 const flow=insert('editorial_runs_v3',{id:uuid(),owner,authority_id:uuid(),request_key:uuid(),run_kind:'daily',day:'2026-10-08',writer:'xiaoyu',state:'text_saved',article_id:r.id,input_json:'{"body":"BODY_SECRET_input"}',input_sha256:'a'.repeat(64),snapshot_json:'{"body":"BODY_SECRET_snapshot"}',snapshot_sha256:'a'.repeat(64),expires:future(),created:now(),updated:now()});
 const receipt=uuid();insert('claude_attempts',{id:receipt,owner,day:'2026-10-08',state:'completed',response:'{"text":"BODY_SECRET_provider"}',created:now()});
 insert('editorial_stages_v3',{id:uuid(),owner,run_id:flow.id,stage:'body',round:0,sequence:1,token:uuid(),input_json:'{"article":"BODY_SECRET_input"}',input_sha256:'a'.repeat(64),state:'completed',artifact_json:'{"paragraphs":["BODY_SECRET_stage"]}',receipt_id:receipt,created:now(),updated:now()});
 insert('daily_editorial_drafts',{run_id:w.id,owner,article_id:r.id,writer:'xiaoyu',day:w.day,input_snapshot:'{"body":"BODY_SECRET_initial_input"}',initial_json:'{"title":"BODY_SECRET_initial"}',initial_sha256:'a'.repeat(64),initial_source:'agent',provider_attempt_id:receipt,created:now()});
 const p=await preview(owner,'writing');assert.equal(p.count,1);assert.equal((await confirmListDeletion(owner,args(p))).content_deleted,true);assert.equal(get(r),undefined);assert.equal(JSON.stringify(get(other)),otherBefore);const quota=sql.prepare('SELECT * FROM writing_runs WHERE id=?').get(w.id);assert.equal(quota.state,'permanently_deleted');assert.equal(quota.day,w.day);
 for(const table of ['writing_runs','daily_editorial_drafts','editorial_runs_v3','editorial_stages_v3','claude_attempts','article_list_deletions'])assert.doesNotMatch(JSON.stringify(sql.prepare(`SELECT * FROM ${table} WHERE owner=?`).all(owner)),/BODY_SECRET/);
 assert.equal((await articleList(owner,50,[r.id])).length,0);assert.equal((await articleWorklist(owner)).items.length,0);
});
await test('unknown preview and confirmation responses recovered via original request key and operation ID, no mutation on GET',async()=>{
 const owner='unknown',r=add(owner),key=uuid();const p=await preview(owner,'publish',key);const newer=add(owner);const again=await previewListDeletion(owner,'publish',key,[newer.id]);assert.equal(again.operation_id,p.operation_id);assert.equal(again.items[0].article_id,r.id);
 const read=await route.GET(new Request(`https://site.test/api/articles/list-delete?request_key=${key}`,{headers:{'oai-authenticated-user-id':owner}}));assert.equal(read.status,200);assert.equal((await read.json()).operation_id,p.operation_id);await confirmListDeletion(owner,args(p));
 const done=await route.GET(new Request(`https://site.test/api/articles/list-delete?operation_id=${p.operation_id}`,{headers:{'oai-authenticated-user-id':owner}}));assert.equal((await done.json()).state,'deleted');assert.ok(get(newer));
});
await test('HTTP auth/origin/header/format/stream-boundary gate precedes all destructive service calls',async()=>{
 const send=(body,headers={})=>route.POST(new Request('https://site.test/api/articles/list-delete',{method:'POST',headers:{origin:'https://site.test','x-xiaoyu-list-delete':'1','content-type':'application/json','oai-authenticated-user-id':'http',...headers},body:typeof body==='string'?body:JSON.stringify(body)}));
 assert.equal((await send({}, {'oai-authenticated-user-id':''})).status,401);assert.equal((await send({}, {origin:'https://evil.test'})).status,403);assert.equal((await send({}, {'x-xiaoyu-list-delete':''})).status,403);assert.equal((await send({}, {'content-type':'text/plain'})).status,415);assert.equal((await send('x'.repeat(9000))).status,413);assert.equal((await send({action:'confirm',extra:1})).status,400);
 const r=add('http');const p=await (await send({action:'preview',scope:'publish',request_key:uuid(),article_ids:ids('http','publish')})).json();assert.ok(get(r));const confirmed=await send({action:'confirm',...args(p)});assert.equal(confirmed.status,200);assert.equal((await confirmed.json()).content_deleted,true);
});
await test('writing work and V3 tasks page independently of exact latest-five non-executing articles',async()=>{
 const owner='writing-pages';const recent=Array.from({length:6},()=>{const r=add(owner,{state:'text_saved'});writing(r);return r;});
 const works=Array.from({length:31},()=>{const r=add(owner,{state:'text_saved'});writing(r,{state:'writing'});return r;});
 const v3=insert('editorial_runs_v3',{id:uuid(),owner,authority_id:uuid(),request_key:uuid(),run_kind:'daily',day:'2026-10-08',writer:'xiaoyu',state:'body',article_id:uuid(),input_json:'{}',input_sha256:'a'.repeat(64),snapshot_json:'{"topic":"V3未保存稿"}',snapshot_sha256:'a'.repeat(64),expires:future(),created:now(),updated:now()});
 const {writingStudioList}=load('lib/writing-studio-list.ts');const first=await writingStudioList(owner);assert.equal(first.pending_total,32);assert.equal(first.next_offset,25);assert.equal(first.items.filter(r=>r.list_section==='recent').length,5);
 const second=await writingStudioList(owner,25);assert.equal(second.next_offset,null);assert.equal(second.items.length,7);assert.equal(second.items.filter(r=>r.list_section==='recent').length,0);const combined=[...first.items,...second.items];
 assert.ok(combined.some(r=>r.article_id===v3.article_id&&r.list_section==='work'));for(const r of works)assert.ok(combined.some(item=>item.article_id===r.id&&item.list_section==='work'));assert.ok(!combined.some(r=>r.article_id===recent[0].id));
 const p=await previewListDeletion(owner,'writing',uuid(),first.items.filter(r=>r.list_section==='recent').map(r=>r.article_id));assert.equal(p.count,5);assert.ok(p.items.every(r=>recent.slice(1).some(old=>old.id===r.article_id)));
});
await test('durable accepted/unknown handoffs remain waiting work even before queued-state reconciliation',async()=>{
 const owner='notification-wait';const r=add(owner);insert('article_handoffs',{id:uuid(),owner,article_id:r.id,event_id:uuid(),state:'delivered',created:now(),updated:now(),expires:future()});
 assert.equal(ids(owner,'publish').length,0);assert.equal((await articleWorklist(owner)).pending_total,1);await assert.rejects(preview(owner),/没有可清空/);
 const race=add('notification-race'),p=await preview(race.owner);beforeDeletionBatch=async()=>insert('article_handoffs',{id:uuid(),owner:race.owner,article_id:race.id,event_id:uuid(),state:'unknown',created:now(),updated:now(),expires:future()});
 await assert.rejects(confirmListDeletion(race.owner,args(p)),/状态已变化/);assert.ok(get(race));assert.equal(marks(race),undefined);
});
await test('all real immutable writing source-key namespaces are previewed and removed',async()=>{
 for(const prefix of ['writing','editorial','editorial-v2','editorial-v3']){const owner='source-prefix-'+prefix,id=uuid(),r=add(owner,{id,state:'text_saved',source_key:`articles/${id}/${prefix}-${'a'.repeat(64)}.txt`});writing(r);const p=await preview(owner,'writing');assert.equal(p.file_count,1);assert.equal((await confirmListDeletion(owner,args(p))).content_deleted,true);assert.equal(objects.has(r.source_key),false);}
});
await test('historical exact owner/day/run-kind receipts scrubbed; unrelated author/day/scope preserved',async()=>{
 for(const [kind,prefixes] of [['daily',['']],['workflow_test',['workflow-test:','workflow-test-retry:','workflow-test-extended:']],['workflow_rewrite_v2',['workflow-rewrite-v2:','workflow-rewrite-v2-confirmed-retry:']]]){
  const owner='legacy-'+kind,r=add(owner,{state:'text_saved'}),w=writing(r,{writer:'claude',run_kind:kind});const receipts=prefixes.map(prefix=>insert('claude_attempts',{id:`${prefix}${owner}:${w.day}`,owner,day:w.day,state:'completed',response:'{"text":"BODY_SECRET_LEGACY","partial_text":"BODY_SECRET_PARTIAL"}',created:now()}));
  const unrelated=insert('claude_attempts',{id:`workflow-test:${owner}:2026-01-01`,owner,day:'2026-01-01',state:'completed',response:'{"text":"UNRELATED_TEST"}',created:now()});
  const p=await preview(owner,'writing');assert.equal((await confirmListDeletion(owner,args(p))).content_deleted,true);for(const receipt of receipts)assert.equal(sql.prepare('SELECT response FROM claude_attempts WHERE id=?').get(receipt.id).response,'{}');assert.equal(sql.prepare('SELECT response FROM claude_attempts WHERE id=?').get(unrelated.id).response,unrelated.response);
 }
 const owner='legacy-other-author',r=add(owner,{state:'text_saved'}),w=writing(r,{writer:'xiaoyu',run_kind:'workflow_test'}),receipt=insert('claude_attempts',{id:`workflow-test:${owner}:${w.day}`,owner,day:w.day,state:'completed',response:'{"text":"OTHER_AUTHOR_TEST"}',created:now()});await confirmListDeletion(owner,args(await preview(owner,'writing')));assert.equal(sql.prepare('SELECT response FROM claude_attempts WHERE id=?').get(receipt.id).response,receipt.response);
});
await test('historical requested receipt protects current work and aborts all targets atomically after preflight',async()=>{
 for(const mode of ['before','race']){const owner='legacy-active-'+mode,r=add(owner,{state:'text_saved'}),w=writing(r,{writer:'claude',run_kind:'workflow_test'}),sibling=add(owner,{state:'text_saved'});writing(sibling);const reserve=()=>insert('claude_attempts',{id:`workflow-test-retry:${owner}:${w.day}`,owner,day:w.day,state:'requested',response:null,created:now()});
  if(mode==='before'){reserve();assert.ok(!ids(owner,'writing').includes(r.id));assert.ok((await load('lib/writing-studio-list.ts').writingStudioList(owner)).items.some(item=>item.article_id===r.id&&item.list_section==='work'));}
  else{const p=await preview(owner,'writing');beforeDeletionBatch=reserve;await assert.rejects(confirmListDeletion(owner,args(p)),/状态已变化/);assert.equal(marks(r),undefined);assert.equal(marks(sibling),undefined);assert.ok(objects.has(r.source_key));}
 }
});
await test('actual delivery claim cannot create an orphan after deletion; winning delivery claim protects all targets',async()=>{
 stubs['./article-upload-attempts'].uploadAttempts=async()=>[];
 stubs['./article-deliveries'].deliveryCall=load('lib/article-deliveries.ts').deliveryCall;
 const seed=owner=>{const id=uuid();return add(owner,{id,source_key:`articles/${id}/source`,state:'failed',result_key:`articles/${id}/result-${'a'.repeat(64)}.docx`});};
 const r=seed('delivery-late'),p=await preview(r.owner);let entered,release;const paused=new Promise(resolve=>entered=resolve),resume=new Promise(resolve=>release=resolve);
 beforeRun=async source=>{if(source.startsWith('INSERT OR IGNORE INTO article_deliveries')){beforeRun=null;entered();await resume;}};
 const claim=articleCall(r.owner,'claim_article_delivery',{article_id:r.id,platform:'zhihu'});await paused;assert.equal((await confirmListDeletion(r.owner,args(p))).content_deleted,true);release();await assert.rejects(claim,/changed/);assert.equal(sql.prepare('SELECT 1 FROM article_deliveries WHERE article_id=?').get(r.id),undefined);
 const winning=seed('delivery-first'),sibling=add(winning.owner),first=await preview(winning.owner);beforeDeletionBatch=async()=>assert.equal((await articleCall(winning.owner,'claim_article_delivery',{article_id:winning.id,platform:'zhihu'})).claimed,true);await assert.rejects(confirmListDeletion(winning.owner,args(first)),/状态已变化/);assert.ok(get(winning));assert.ok(get(sibling));assert.equal(marks(sibling),undefined);
});
await test('completed operation cleans only exact original residuals after explicit confirmation; unknown or changed bytes remain',async()=>{
 const r=completed('residual'),p=await preview(r.owner),original=new Uint8Array(objects.get(r.source_key));await confirmListDeletion(r.owner,args(p));objects.set(r.source_key,original);const late=add(r.owner);assert.equal((await readListDeletion(r.owner,p.operation_id)).state,'needs_verification');assert.ok(objects.has(r.source_key),'GET never cleans');await assert.rejects(confirmListDeletion(r.owner,{...args(p),confirm_permanent:false}));assert.ok(objects.has(r.source_key));assert.equal((await confirmListDeletion(r.owner,args(p))).content_deleted,true);assert.equal(objects.has(r.source_key),false);assert.ok(get(late));
 objects.set(r.source_key,Uint8Array.from([8,8]));await assert.rejects(confirmListDeletion(r.owner,args(p)),/原确认快照/);assert.equal(objects.has(r.source_key),true);assert.equal((await readListDeletion(r.owner,p.operation_id)).content_deleted,false);objects.set(r.source_key,original);const unknown=`articles/${r.id}/result-${'e'.repeat(64)}.docx`;objects.set(unknown,Uint8Array.from([5]));await assert.rejects(confirmListDeletion(r.owner,args(p)),/原确认快照/);assert.ok(objects.has(r.source_key));assert.ok(objects.has(unknown));assert.ok(get(late));objects.delete(unknown);assert.equal((await confirmListDeletion(r.owner,args(p))).content_deleted,true);
});
console.log(`PASS ${cases} isolated list-clear integration scenarios using all real Drizzle migrations / actual SQL transaction fences / original R2 cleanup validation. Production/network/providers/platforms/Library calls=0.`);
