// Isolated real SQL and production modules; no private fixture, browser or platform I/O.
// IDs/status text/counters mirror parent-reported scenarios. observed_at is a TEST clock,
// not a claim of genuine platform collection time or production data import.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
const native=createRequire(import.meta.url),sql=new DatabaseSync(':memory:');
for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+file,'utf8'));
const db={prepare(query){let values=[];return {bind(...args){values=args;return this;},async first(){return sql.prepare(query).get(...values)||null;},async all(){return {results:sql.prepare(query).all(...values)};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...values).changes)}};}};}};
const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInNewContext(code,{exports,require:name=>name==='cloudflare:workers'?{env:{DB:db}}:name==='./test-store'?{db:()=>db}:name.startsWith('.')?load(path.resolve(path.dirname(file),name+(name.includes('article-metrics')?'.tsx':'.ts'))):native(name),crypto,TextEncoder,Uint8Array,URL,Intl,Date,Error,Set,Map,Response,Request,console,fetch:()=>{throw Error('NO REMOTE I/O');}});return exports;}
const history=load('lib/article-history.ts'),tools=load('lib/article-data-tools.ts'),Component=load('components/article-metrics-observation.tsx').default;
const React=native('react'),{renderToStaticMarkup}=native('react-dom/server'),owner='PUBLICATION-OFFLINE-OWNER',now=new Date().toISOString(),uid=()=>crypto.randomUUID();
const scheduledIds=['7695864232457404928','7696007800149688882','7695943511517987363','7696029958137512486'];
const base=id=>({platform:'toutiao',publication:{article_id:id,status:'scheduled',status_source:'creator_work_management',status_text:'定时发布中',time_status:'unknown',time_sources:[]},published_at:null,published_url:`https://www.toutiao.com/article/${id}/`,observed_at:now,platform_data_through:null,window_start:null,window_end:null,exposures:null,reads:null,comments:null,likes:null,unavailable_reason:null,evidence_reference:'OFFLINE-parent-scenario-TEST-clock'});
function seed(id){const row={platforms:{toutiao:{draft_id:id}}};sql.prepare('INSERT INTO article_history(owner,history_key,record_json,evidence_sha256,completed_at,created) VALUES(?,?,?,?,?,?)').run(owner,'scenario:'+id,JSON.stringify(row),'0'.repeat(64),now,now);}
for(const id of scheduledIds){
 seed(id);const o=history.normalizeMetrics(base(id)),snapshot=history.metricsSnapshotKind(o);assert.equal(snapshot.state,'scheduled');assert.equal(snapshot.due_at,null);assert.equal(snapshot.public_verified,false);
 const args={history_key:'scenario:'+id,request_key:uid(),observation:o};await history.recordMetrics(owner,args);await history.recordMetrics(owner,args);
 assert.equal(sql.prepare('SELECT published_at FROM article_metrics_observations WHERE request_key=?').get(args.request_key).published_at,null);
 assert.throws(()=>history.normalizeMetrics({...o,publication:{...o.publication,status:'published'}}),/不能记为已发布/);
 assert.throws(()=>history.normalizeMetrics({...o,published_at:'2026-10-12T00:00:00Z'}),/不得指定发布时间/);
 assert.throws(()=>history.normalizeMetrics({...o,reads:26}),/尚未明确公开发布/);
 const html=renderToStaticMarkup(React.createElement(Component,{observation:{...o,snapshot}}));assert.match(html,/定时预览页面/);assert.doesNotMatch(html,/头条公开文章|当时累计|24小时区间：/);
}
assert.equal(sql.prepare('SELECT count(*) AS n FROM article_metrics_observations').get().n,4);
const id='7696037584476160562';seed(id);
const conflict={...base(id),publication:{...base(id).publication,status:'published',status_text:'已发布 已推送',time_status:'time_conflict',time_sources:[{source:'creator_work_management',raw_text:'10-12 23:46',timezone:null,normalized_at:null},{source:'article_page',raw_text:'2026-10-13 14:46',timezone:null,normalized_at:null}]},exposures:6258,reads:26,comments:0,likes:0};
const c=history.normalizeMetrics(conflict),cs=history.metricsSnapshotKind(c);assert.equal(cs.state,'time_conflict');assert.equal(cs.due_at,null);assert.equal(cs.public_verified,true);
const args={history_key:'scenario:'+id,request_key:uid(),observation:c};await history.recordMetrics(owner,args);const stored=JSON.parse(sql.prepare('SELECT payload FROM article_metrics_observations WHERE request_key=?').get(args.request_key).payload).observation;
assert.equal(stored.published_at,null);assert.deepEqual(stored.publication.time_sources,conflict.publication.time_sources);assert.equal(stored.exposures,6258);assert.equal(stored.reads,26);
assert.throws(()=>history.normalizeMetrics({...conflict,published_at:'2026-10-12T15:46:00Z'}),/不得指定发布时间/);
assert.throws(()=>history.normalizeMetrics({...conflict,window_start:'2026-10-12T15:46:00Z',window_end:'2026-10-13T15:46:00Z'}),/不得指定发布时间/);
for(const source of ['profile_visibility','article_page_visibility'])assert.throws(()=>history.normalizeMetrics({...conflict,publication:{...conflict.publication,status_source:source}}),/页面可读或主页出现/);
assert.throws(()=>history.normalizeMetrics({...conflict,publication:{...conflict.publication,status_text:'已发布后改为私人草稿'}}),/不能记为已发布/);
assert.throws(()=>history.normalizeMetrics({...conflict,publication:{...conflict.publication,article_id:scheduledIds[0]}}),/精确文章ID/);
assert.throws(()=>history.normalizeMetrics({...conflict,publication:undefined}),/明确的平台发布状态/);
assert.equal(history.metricsSnapshotKind({...conflict,publication:undefined}).state,'publication_unverified','older observations without platform status fail closed');
const html=renderToStaticMarkup(React.createElement(Component,{observation:{...c,snapshot:cs}}));assert.match(html,/头条公开文章/);assert.match(html,/时间来源冲突/);assert.match(html,/10-12 23:46/);assert.match(html,/2026-10-13 14:46/);assert.match(html,/时区未核验/);assert.match(html,/当时累计：展现 6258 \/ 阅读 26/);assert.doesNotMatch(html,/24小时区间：/);
const published=new Date(Date.now()-48*3600000).toISOString(),due=new Date(Date.parse(published)+86400000).toISOString();
const verified={...conflict,published_at:published,publication:{...conflict.publication,time_status:'verified',time_sources:[{source:'creator_work_management',raw_text:'OFFLINE verified timezone time',timezone:'Etc/UTC',normalized_at:published}]},platform_data_through:due,window_start:published,window_end:due};
assert.equal(history.metricsSnapshotKind(verified).state,'exact_24h');assert.equal(history.metricsSnapshotKind({...verified,window_start:null,window_end:null}).state,'late_cumulative');
assert.throws(()=>history.normalizeMetrics({...verified,publication:{...verified.publication,time_sources:[{...verified.publication.time_sources[0],timezone:null}]}}),/时区存在冲突/);
assert.throws(()=>history.normalizeMetrics({...verified,publication:{...verified.publication,time_sources:[...verified.publication.time_sources,{source:'article_page',raw_text:'OFFLINE conflict',timezone:'Etc/UTC',normalized_at:due}]}}),/时区存在冲突/);
await assert.rejects(history.recordMetrics(owner,{history_key:'scenario:'+scheduledIds[0],request_key:uid(),observation:c}),/ID与原私人草稿不符/);
await assert.rejects(history.recordMetrics('OTHER',args),/本人精确历史文章/);
await assert.rejects(history.recordMetrics(owner,{...args,observation:{...c,reads:99}}),/同一次指标采集不能更改/);
assert.throws(()=>sql.prepare("UPDATE article_metrics_observations SET payload='{}'").run(),/immutable_article_metrics/);
const metricTool=tools.articleDataTools.find(t=>t.name==='record_article_metrics_observation');assert.ok(metricTool.inputSchema.properties.observation.required.includes('publication'));assert.deepEqual(Array.from(metricTool.inputSchema.properties.observation.properties.published_at.type),['string','null']);
assert.equal(sql.prepare('SELECT count(*) AS n FROM event_subscriptions').get().n,0);assert.equal(sql.prepare('SELECT count(*) AS n FROM articles').get().n,0);sql.close();
console.log('PASS real isolated SQLite: 4 scheduled exact IDs not published; explicit published/time_conflict retains 6258/26/0/0 as cumulative with no due; URL/profile/legacy fail closed; matching IDs, raw time sources, verified 24h, owner/idempotency/immutable rows and actual rendered UI. ZERO platform I/O, production writes or schedule changes.');
