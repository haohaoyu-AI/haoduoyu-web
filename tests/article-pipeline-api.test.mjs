// Real built Worker + isolated Miniflare D1. No remote requests or migration fallback.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';

const published='2026-10-01T01:00:00.000Z',asOf='2026-10-02T01:00:00.000Z';
const account='toutiao-haoduoyu',otherAccount='zhihu-haoduoyu';
const jsonFields=['sample','draft_ref','timings','reruns','blockers','verify_items'];
const pipelineFields=['status','slot','run_dir','run_date','series_no','writer','illustrator','sample',
  'char_count','subheading_count','image_count','cover_desc','draft_ref','timings','reruns','blockers','verify_items'];
const legacy=(extra={})=>({account_id:account,title:'合成已发布 '+randomUUID(),url:'https://example.invalid/pipeline/'+randomUUID(),published_at:published,...extra});
const draft=(extra={})=>({account_id:account,title:'合成草稿 '+randomUUID(),status:'draft_saved',...extra});
function fields() {
  return {status:'draft_saved',slot:'gzh',run_dir:'Synthetic_2026/Run_'+randomUUID(),run_date:'2026-10-01',series_no:109,
    writer:'dedao',illustrator:'codex',char_count:2560,subheading_count:4,image_count:3,cover_desc:'合成封面说明',
    sample:{pgc_id:'9007199254740993123456789',future_key:{enabled:true,score:0}},
    draft_ref:{pgc_id:'9007199254740993123456789',editor_url:'https://example.invalid/editor',unrecognized_but_valid:{x:'保留'}},
    timings:{draft:{seconds:0},future_step:{elapsed:17}},reruns:{draft:0,illustration:{attempts:2}},
    blockers:[{kind:'source',message:'合成待核验',future_key:{id:'01'}}],verify_items:[{key:'quote',ok:false,unknown:'保留'}]};
}
async function setup(t) {
  const journal=JSON.parse(await readFile(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
  assert.equal(journal.entries.length,9,'The active journal retains the reviewed article migration and additive workbench migration');
  assert.equal(journal.entries[5].tag,'0005_article_pipeline');
  assert.equal(journal.entries[8].tag,'0008_workbench_updates');
  const app=await fixture(t),session=await app.login();
  const owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const columns=(await app.db.prepare('PRAGMA table_info(matrix_articles)').all()).results.map(x=>x.name);
  assert.ok(columns.includes('status'),'active journal must supply the pipeline schema');
  const env={DB:app.db,SITE_ORIGIN:app.origin,DAILY_NOTES_OWNER_ID:owner};
  async function api(path,{method='GET',body,token,anonymous=false,headers={},settings=env}={}) {
    const h=new Headers(headers);
    if(!anonymous&&!token){h.set('Cookie',session.cookie);h.set('X-CSRF-Token',session.csrfToken);}
    if(token)h.set('Authorization','Bearer '+token);
    if(body!==undefined)h.set('Content-Type','application/json');
    if(!['GET','HEAD'].includes(method)&&!h.has('Origin'))h.set('Origin',app.origin);
    const response=await worker.fetch(new Request(app.origin+'/api/v1'+path,{method,headers:h,
      body:body===undefined?undefined:JSON.stringify(body)}),settings);
    const text=await response.text();let json;try{json=JSON.parse(text);}catch{}
    return {status:response.status,headers:response.headers,json,data:json?.data,meta:json?.meta,text};
  }
  async function create(body,options={}) {
    const result=await api('/articles',{method:'POST',body,...options});assert.equal(result.status,201,result.text);return result.data;
  }
  return {...app,session,owner,env,api,create};
}
const ids=rows=>rows.map(row=>row.id);
const count=async db=>(await db.prepare('SELECT count(*) AS n FROM matrix_articles').first()).n;

test('extreme JSON nesting returns validation error before hashing or serialization and never writes',async t=>{
  const app=await setup(t),before=await count(app.db),deep='{"x":'.repeat(10000)+'0'+'}'.repeat(10000);
  for(const name of ['sample','ignored_unknown_field']) {
    const response=await worker.fetch(new Request(app.origin+'/api/v1/articles',{method:'POST',headers:{
      'Content-Type':'application/json',Cookie:app.session.cookie,'X-CSRF-Token':app.session.csrfToken,Origin:app.origin,
    },body:'{"account_id":"'+account+'","title":"Synthetic deep","status":"draft_saved","'+name+'":'+deep+'}'}),app.env);
    assert.equal(response.status,400,await response.clone().text());
    assert.equal((await response.json()).error.code,'VALIDATION_ERROR');
  }
  assert.equal(await count(app.db),before);
});

test('legacy dashboard excludes restored draft/null article metrics and keeps account-wide daily data',async t=>{
  const app=await setup(t),pub=await app.create(legacy()),hidden=await app.create(draft());
  const date=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
  const metric=await app.api('/daily-metrics',{method:'POST',body:{account_id:account,article_id:pub.id,date,metrics:{reads:5},source:'synthetic'}});
  assert.equal(metric.status,201,metric.text);
  const before=await app.api('/dashboard?account_id='+account);
  for(const status of ['draft_saved',null]) {
    await app.db.prepare('UPDATE matrix_articles SET status=? WHERE id=?').bind(status,hidden.id).run();
    await app.db.prepare('INSERT INTO matrix_daily_metrics(id,account_id,article_id,date,metrics_json,source,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at')
      .bind('synthetic-restored-draft-day',account,hidden.id,date,'{"reads":888888}','synthetic restore','2099-01-01T00:00:00.000Z').run();
    const after=await app.api('/dashboard?account_id='+account);
    assert.equal(after.status,200,after.text);assert.deepEqual(after.data,before.data);
  }
  const overall=await app.api('/daily-metrics',{method:'POST',body:{account_id:account,date,metrics:{reads:7},source:'synthetic'}});
  assert.equal(overall.status,201,overall.text);
  const after=await app.api('/dashboard?account_id='+account);
  assert.equal(after.data.accounts.find(row=>row.id===account).period_metrics.reads,7);
});

test('a nullable legacy publication date stays safe across detail, sorting and all derived views',async t=>{
  const app=await setup(t),a=await app.create(legacy()),b=await app.create(legacy());
  for(const row of [a,b]) {
    const observation=await app.api('/observations',{method:'POST',body:{article_id:row.id,as_of:asOf,collected_at:asOf,kind:'latest',metrics:{reads:5},source:'synthetic'}});
    assert.equal(observation.status,201,observation.text);
  }
  await app.db.prepare('UPDATE matrix_articles SET published_at=NULL,url=NULL WHERE id=?').bind(a.id).run();
  for(const path of ['/articles/'+a.id,'/articles?sort=published_at&order=asc','/articles?sort=published_at&order=desc',
    '/dashboard','/overview','/overview?period=7d','/due-reviews']) {
    const result=await app.api(path);assert.equal(result.status,200,path+': '+result.text);
    if(path.startsWith('/articles?'))assert.equal(result.data.at(-1).id,a.id);
  }
  const detail=await app.api('/articles/'+a.id);
  assert.equal(detail.data.duration_seconds,null);assert.equal(detail.data.date_status,'unverified');
});

test('legacy POST remains published with real supplied URL/time; explicit null or invalid lifecycle states never default',async t=>{
  const app=await setup(t),body=legacy(),created=await app.create(body);
  assert.equal(created.status,'published');assert.equal(created.url,body.url);assert.equal(created.published_at,published);
  for(const value of [{account_id:account,title:'缺URL'},legacy({url:null}),legacy({published_at:null}),
    legacy({status:null}),legacy({status:''}),legacy({status:'all'}),legacy({status:'unknown'})]) {
    const result=await app.api('/articles',{method:'POST',body:value});assert.equal(result.status,400,result.text);
  }
  assert.equal(await count(app.db),1);
  const read=await app.api('/articles/'+created.id);assert.equal(read.status,200);assert.equal(read.data.status,'published');
});

test('explicit pipeline creation defaults draft_saved and all nonpublished statuses store null publication fields without placeholders',async t=>{
  const app=await setup(t);
  const implicit=await app.create({account_id:account,title:'明确流水线字段',writer:'gemini_web'});
  assert.equal(implicit.status,'draft_saved');assert.equal(implicit.url,null);assert.equal(implicit.published_at,null);
  for(const status of ['drafting','illustrated','draft_saved','failed']) {
    const created=await app.create(draft({status,url:null,published_at:null}));
    assert.equal(created.status,status);assert.equal(created.url,null);assert.equal(created.published_at,null);
    const row=await app.db.prepare('SELECT status,url,published_at FROM matrix_articles WHERE id=?').bind(created.id).first();
    assert.deepEqual(row,{status,url:null,published_at:null});
    const read=await app.api('/articles/'+created.id);assert.equal(read.status,200);assert.equal(read.data.published_at,null);
  }
  for(const body of [draft({url:'https://example.invalid/actually-published'}),draft({published_at:published}),
    draft({status:'published'}),legacy({status:'published',url:'draft://not-public'}),legacy({status:'published',published_at:null})])
    assert.equal((await app.api('/articles',{method:'POST',body})).status,400);
});

test('all 17 logical pipeline fields round-trip without flattening JSON, numeric coercion of PGC IDs or raw storage columns',async t=>{
  const app=await setup(t),expected=fields(),created=await app.create(draft(expected));
  assert.equal(pipelineFields.length,17);
  const detail=await app.api('/articles/'+created.id);assert.equal(detail.status,200);
  for(const key of pipelineFields) {
    assert.deepEqual(created[key],expected[key],key+' create');assert.deepEqual(detail.data[key],expected[key],key+' detail');
  }
  assert.equal(typeof detail.data.draft_ref.pgc_id,'string');assert.equal(detail.data.draft_ref.pgc_id,'9007199254740993123456789');
  for(const key of jsonFields)assert.equal(Object.hasOwn(detail.data,key+'_json'),false,key+' storage field must not leak');
  const stored=await app.db.prepare('SELECT sample_json,draft_ref_json,timings_json,reruns_json,blockers_json,verify_items_json FROM matrix_articles WHERE id=?').bind(created.id).first();
  for(const key of jsonFields)assert.deepEqual(JSON.parse(stored[key+'_json']),expected[key]);
});

test('PUT omission preserves lifecycle and JSON; explicit objects replace whole fields; CAS/idempotency prevent stale overwrite',async t=>{
  const app=await setup(t),expected=fields(),created=await app.create(draft(expected));
  const changed=await app.api('/articles/'+created.id,{method:'PUT',body:{version:1,title:'仅改标题'}});
  assert.equal(changed.status,200,changed.text);assert.equal(changed.data.version,2);
  for(const key of pipelineFields)assert.deepEqual(changed.data[key],expected[key],key+' retained');
  const key='synthetic-pipeline-'+randomUUID(),replacement={version:2,timings:{only_new_step:{seconds:2}},sample:{only_new_key:'whole-field'}};
  const first=await app.api('/articles/'+created.id,{method:'PUT',body:replacement,headers:{'Idempotency-Key':key}});
  assert.equal(first.status,200,first.text);assert.deepEqual(first.data.timings,replacement.timings);assert.deepEqual(first.data.sample,replacement.sample);
  assert.equal(Object.hasOwn(first.data.timings,'draft'),false);
  assert.deepEqual(first.data.reruns,expected.reruns);assert.equal(first.data.status,'draft_saved');
  const before=(await app.db.prepare('SELECT revision FROM matrix_control WHERE id=1').first()).revision;
  const replay=await app.api('/articles/'+created.id,{method:'PUT',body:replacement,headers:{'Idempotency-Key':key}});
  assert.equal(replay.status,200,replay.text);assert.deepEqual(replay.data,first.data);
  assert.equal((await app.db.prepare('SELECT revision FROM matrix_control WHERE id=1').first()).revision,before);
  assert.equal((await app.api('/articles/'+created.id,{method:'PUT',body:{version:1,title:'不可覆盖'}})).status,409);
  assert.equal((await app.api('/articles/'+created.id,{method:'PUT',body:{...replacement,sample:{different:true}},headers:{'Idempotency-Key':key}})).status,409);
  assert.equal((await app.api('/articles/'+created.id,{method:'PUT',body:{version:3,status:null}})).status,400);
  const current=(await app.api('/articles/'+created.id)).data;
  assert.equal(current.version,3);assert.deepEqual(current.sample,replacement.sample);
});

test('JSON storage names, pollution, invalid container/depth/size and invalid typed fields fail before persistence',async t=>{
  const app=await setup(t),created=await app.create(draft());
  for(const field of jsonFields)for(const method of ['POST','PUT']) {
    const result=await app.api(method==='POST'?'/articles':'/articles/'+created.id,{method,
      body:method==='POST'?draft({[field+'_json']:'{}'}):{version:1,[field+'_json']:'{}'}});
    assert.equal(result.status,400,field+' '+method+': '+result.text);
  }
  let deep={value:'end'};for(let i=0;i<32;i++)deep={nested:deep};
  const bad=[{sample:[]},{draft_ref:[]},{timings:[]},{reruns:[]},{blockers:{}},{verify_items:{}},{blockers:[null]},{verify_items:['not-an-object']},
    {sample:JSON.parse('{"__proto__":{"polluted":true}}')},{sample:{nested:{constructor:{prototype:{polluted:true}}}}},
    {sample:deep},{sample:{blob:'x'.repeat(200000)}},{sample:{a:'x'.repeat(40000)},timings:{b:'x'.repeat(40000)}},
    {draft_ref:{pgc_id:9007199254740992}},{series_no:0},{series_no:'109'},{char_count:-1},{image_count:1.2},
    {subheading_count:Number.MAX_SAFE_INTEGER+1},{slot:'gzh/109'},{writer:'arbitrary'},{illustrator:'arbitrary'}];
  for(const value of bad) {
    const result=await app.api('/articles',{method:'POST',body:draft(value)});
    assert.ok([400,413].includes(result.status),'expected validation failure: '+Object.keys(value).join(',')+': '+result.text);
  }
  assert.equal({}.polluted,undefined);assert.equal(await count(app.db),1);
});

test('draft article-level metrics are rejected, account daily remains valid, and published transitions enforce URL/time and existing metrics',async t=>{
  const app=await setup(t),created=await app.create(draft());
  const observation={article_id:created.id,kind:'latest',as_of:asOf,metrics:{reads:0},source:'synthetic'};
  const daily={account_id:account,article_id:created.id,date:'2026-10-02',metrics:{reads:0},source:'synthetic'};
  for(const [path,body] of [['/observations',observation],['/daily-metrics',daily]])
    assert.ok([400,409].includes((await app.api(path,{method:'POST',body})).status),path+' must reject draft metrics');
  assert.equal((await app.api('/daily-metrics',{method:'POST',body:{...daily,article_id:null}})).status,201);
  assert.equal((await app.api('/articles/'+created.id,{method:'PUT',body:{version:1,status:'published'}})).status,400);
  const promoted=await app.api('/articles/'+created.id,{method:'PUT',body:{version:1,status:'published',url:'https://example.invalid/promoted/'+randomUUID(),published_at:published}});
  assert.equal(promoted.status,200,promoted.text);assert.equal(promoted.data.version,2);
  assert.equal((await app.api('/observations',{method:'POST',body:observation})).status,201);
  assert.equal((await app.api('/daily-metrics',{method:'POST',body:daily})).status,201);
  assert.equal((await app.api('/articles/'+created.id,{method:'PUT',body:{version:2,status:'draft_saved',url:null,published_at:null}})).status,409);
  const plain=await app.create(legacy());
  const demoted=await app.api('/articles/'+plain.id,{method:'PUT',body:{version:1,status:'drafting',url:null,published_at:null}});
  assert.equal(demoted.status,200,demoted.text);assert.equal(demoted.data.url,null);assert.equal(demoted.data.published_at,null);
});

test('default article lists/index/statistics include only published; explicit states include drafts and SQL-null status is never published',async t=>{
  const app=await setup(t),created=await app.create(legacy());
  const paths=['/dashboard','/overview?period=30d','/due-reviews'],before={};
  for(const path of paths){const result=await app.api(path);assert.equal(result.status,200,result.text);before[path]=result.data;}
  const drafts=new Map();
  for(const status of ['drafting','illustrated','draft_saved','failed'])drafts.set(status,await app.create(draft({status})));
  await app.db.prepare('INSERT INTO matrix_articles(id,account_id,title,url,published_at,created_at,updated_at,status) VALUES(?,?,?,?,?,?,?,NULL)')
    .bind('synthetic-null-lifecycle',account,'NULL状态不能当published','https://example.invalid/null-lifecycle',published,published,published).run();
  await app.db.prepare('UPDATE matrix_control SET revision=revision+1 WHERE id=1').run();
  for(const path of ['/articles','/articles?page=1&page_size=2','/articles?fields=index']) {
    const result=await app.api(path);assert.equal(result.status,200,result.text);assert.deepEqual(ids(result.data),[created.id]);
    assert.equal(result.meta.total,1);
    if(path.includes('fields=index'))assert.deepEqual(Object.keys(result.data[0]).sort(),['account_id','id','platform','published_at','title']);
  }
  for(const [status,item] of drafts)for(const index of ['', '&fields=index']) {
    const result=await app.api('/articles?status='+status+index);assert.equal(result.status,200,result.text);assert.deepEqual(ids(result.data),[item.id]);
    assert.equal(result.data[0].published_at,null);
  }
  const publishedList=await app.api('/articles?status=published');assert.deepEqual(ids(publishedList.data),[created.id]);
  for(const status of ['all','null','unknown',''])assert.equal((await app.api('/articles?status='+status)).status,400);
  assert.equal((await app.api('/articles?status=draft_saved&status=published')).status,400,'duplicate lifecycle selectors must not be silently collapsed');
  for(const path of paths){const after=await app.api(path);assert.equal(after.status,200,after.text);assert.deepEqual(after.data,before[path],path+' must exclude drafts and null lifecycle');}
});

test('nullable draft publication sort is stable and metric NULL values remain last for ascending and descending pages',async t=>{
  const app=await setup(t),drafts=[];
  for(let i=0;i<3;i++)drafts.push(await app.create(draft()));
  const stable=ids(drafts).sort();
  for(const order of ['asc','desc'])for(const fields of ['', '&fields=index']) {
    const first=await app.api('/articles?status=draft_saved&sort=published_at&order='+order+'&page=1&page_size=2'+fields);
    const second=await app.api('/articles?status=draft_saved&sort=published_at&order='+order+'&page=2&page_size=2'+fields);
    assert.equal(first.status,200,first.text);assert.equal(second.status,200,second.text);
    assert.deepEqual([...ids(first.data),...ids(second.data)],stable);
  }
  const zero=await app.create(legacy({title:'真实零',published_at:'2026-10-01T01:00:00.000Z'}));
  const positive=await app.create(legacy({title:'正值',published_at:'2026-10-01T02:00:00.000Z'}));
  const missing=await app.create(legacy({title:'缺失',published_at:'2026-10-01T03:00:00.000Z'}));
  for(const [item,reads] of [[zero,0],[positive,10]])assert.equal((await app.api('/observations',{method:'POST',body:{article_id:item.id,kind:'latest',as_of:asOf,metrics:{reads},source:'synthetic'}})).status,201);
  for(const [order,expected] of [['asc',[zero.id,positive.id,missing.id]],['desc',[positive.id,zero.id,missing.id]]]) {
    const result=await app.api('/articles?sort=reads&order='+order+'&page_size=10');
    assert.equal(result.status,200,result.text);assert.deepEqual(ids(result.data),expected);
  }
});

test('pipeline CRUD preserves Bearer account scope, public anonymous business rules, and todo APIs and approved public-note access',async t=>{
  const app=await setup(t),allowed=await app.create(draft()),outside=await app.create(draft({account_id:otherAccount}));
  const issued=await app.api('/api-keys',{method:'POST',body:{name:'synthetic-pipeline-writer',account_ids:[account],permissions:['read','write']}});
  assert.equal(issued.status,201);const token=issued.data.token;
  const list=await app.api('/articles?status=draft_saved',{token});assert.deepEqual(ids(list.data),[allowed.id]);
  assert.equal((await app.api('/articles/'+outside.id,{token})).status,403);
  assert.equal((await app.api('/articles/'+outside.id,{token,method:'PUT',body:{version:1,title:'不可覆盖'}})).status,403);
  assert.equal((await app.api('/articles',{token,method:'POST',body:draft({account_id:otherAccount})})).status,403);
  const publicEnv={...app.env,PUBLIC_BUSINESS_MODE:'1',PUBLIC_BUSINESS_USER_ID:app.owner,PUBLIC_BUSINESS_ACCOUNT_IDS:JSON.stringify([account])};
  const pub={anonymous:true,settings:publicEnv,headers:{'X-Public-Business':'1'}};
  const anonymous=await app.api('/articles',{...pub,method:'POST',body:draft({title:'已授权匿名草稿'})});assert.equal(anonymous.status,201,anonymous.text);
  const publicList=await app.api('/articles?status=draft_saved',pub);
  assert.deepEqual(new Set(ids(publicList.data)),new Set([allowed.id,anonymous.data.id]));
  assert.equal((await app.api('/articles/'+outside.id,pub)).status,404);
  assert.equal((await app.api('/articles',{...pub,method:'POST',body:draft({account_id:otherAccount})})).status,404);
  const noOrigin=await app.api('/articles',{...pub,method:'POST',body:draft(),headers:{Origin:'https://foreign.invalid','X-Public-Business':'1'}});
  assert.equal(noOrigin.status,403);
  const todo=await app.api('/todos',{...pub,method:'POST',body:{id:randomUUID(),date:'2026-10-24',text:'原待办仍允许匿名写'}});assert.equal(todo.status,201,todo.text);
  assert.equal((await app.api('/todos?date=2026-10-24',pub)).status,200);
  const note=await app.api('/daily-notes/2026-10-24',{method:'PUT',body:{text:'碎碎念仍为私有写',version:0,save_id:randomUUID()}});assert.equal(note.status,200,note.text);
  assert.equal((await app.api('/daily-notes?date=2026-10-24',pub)).data.text,'碎碎念仍为私有写');
  assert.equal((await app.api('/daily-notes/2026-10-24',{...pub,method:'PUT',body:{text:'已授权匿名编辑',version:1,save_id:randomUUID()}})).status,200);
});
