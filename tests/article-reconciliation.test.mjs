import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';
import {countingDb} from './counting-d1.mjs';
import {reconcileArticles,readArticleReconciliation} from '../src/article-reconciliation.mjs';
import {renderReconciliation} from '../web/pages/article-reconciliation.mjs';
const row=(id,series_no,status='draft_saved',slot='gzh')=>({id,series_no,status,slot,run_date:null,writer:null,
  title:'保险第200篇不是编号依据',sample:null,missing_fields:['run_date','writer'],warnings:[],has_pending_verify:null,verify_state:'unknown'});
test('actual reconciliation preserves unknowns, distinct numbers, duplicate IDs and bounded gap ranges without a target',()=>{
  const empty=reconcileArticles([]);assert.equal(empty.insurance.highest,null);assert.equal(empty.schedule.expected,null);
  const value=reconcileArticles([row('a',4),row('b',4,'published'),row('c',8,null),row('d',200,'failed','tt1'),row('e',null,null)]);
  assert.equal(value.total,5);assert.equal(value.counts.published,1);assert.equal(value.counts.unknown,2);
  assert.equal(value.insurance.unique_count,2);assert.equal(value.insurance.highest,8);assert.equal(value.insurance.recorded,4);
  assert.deepEqual(value.insurance.duplicate_numbers,[{number:4,article_ids:['a','b']}]);
  assert.deepEqual(value.insurance.observed_gap_ranges,[{from:5,to:7}]);assert.equal(value.insurance.target,null);
  assert.equal(value.insurance.sample_mapping,'unknown');assert.deepEqual(value.dates,[{date:null,count:5}]);
});
test('reconciliation rendering escapes all user text and never invents schedule values or title-derived series',()=>{
  const data=reconcileArticles([{...row('a',null),title:'<img src=x onerror=alert(1)>',sample:{ref:'<script>danger</script>'}}]);
  const html=renderReconciliation(data);assert.ok(!html.includes('<img'));assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;img'));assert.ok(html.includes('应产出：未配置'));assert.ok(html.includes('样本编号映射：未知'));
  assert.ok(renderReconciliation(reconcileArticles([])).includes('没有符合条件'));assert.throws(()=>renderReconciliation({complete:false}));
});
test('API scans complete pages in one consistent read, retains nulls and isolates account-scoped keys and public scope',async t=>{
  const app=await fixture(t),session=await app.login(),owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  for(let offset=0;offset<205;offset+=40)await app.db.batch(Array.from({length:Math.min(40,205-offset)},(_,i)=>
    app.db.prepare('INSERT INTO matrix_articles(id,account_id,title,status,slot,run_date,series_no,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .bind(randomUUID(),'toutiao-haoduoyu','Actual '+(offset+i),i===0?null:'draft_saved','gzh',i===0?null:new Date(Date.UTC(2025,0,1+offset+i)).toISOString().slice(0,10),
        offset+i+1,'2026-10-24T00:00:00Z','2026-10-24T00:00:00Z')));
  await app.db.prepare('INSERT INTO matrix_articles(id,account_id,title,created_at,updated_at) VALUES(?,?,?,?,?)')
    .bind(randomUUID(),'zhihu-haoduoyu','PRIVATE-ACCOUNT-CANARY','2026-10-24T00:00:00Z','2026-10-24T00:00:00Z').run();
  const env={DB:app.db,SITE_ORIGIN:app.origin,PUBLIC_BUSINESS_MODE:'1',PUBLIC_BUSINESS_USER_ID:owner,
    PUBLIC_BUSINESS_ACCOUNT_IDS:'["toutiao-haoduoyu"]'};
  async function read(settings=env,headers={},hooks={}) {
    const db=countingDb(app.db,hooks),response=await worker.fetch(new Request(app.origin+'/api/v1/article-reconciliation',{headers}),{...settings,DB:db});
    const text=await response.text();assert.ok(db.entries.filter(entry=>/^\s*(UPDATE|INSERT|DELETE)/i.test(entry.sql)).every(entry=>
      /^UPDATE matrix_api_keys SET last_used_at=/.test(entry.sql)),'only existing key usage metadata may write');return {response,text,data:JSON.parse(text).data,db};
  }
  const publicResult=await read();assert.equal(publicResult.response.status,200);assert.equal(publicResult.data.total,205);
  assert.ok(!publicResult.text.includes('PRIVATE-ACCOUNT-CANARY'));assert.ok(publicResult.data.counts.unknown>0);
  assert.equal((await read(env,{Cookie:session.cookie})).data.total,206);
  const key=await app.request('/api/v1/api-keys',{method:'POST',session,body:{name:'synthetic-reconciliation-reader',
    account_ids:['toutiao-haoduoyu'],permissions:['read']}});
  assert.equal(key.status,201);assert.equal((await read({...env,PUBLIC_BUSINESS_MODE:'0'},{Authorization:'Bearer '+key.data.token})).data.total,205);
  assert.equal((await read({...env,PUBLIC_BUSINESS_MODE:'0'})).response.status,401);
  let changed=false;const retried=await read(env,{}, {async after(sql) {
    if(changed||!/FROM matrix_articles a/.test(sql))return;changed=true;
    await app.db.batch([app.db.prepare("UPDATE matrix_articles SET title='after concurrent edit' WHERE account_id='toutiao-haoduoyu'"),
      app.db.prepare('UPDATE matrix_control SET revision=revision+1 WHERE id=1')]);
  }});
  assert.ok(changed);assert.ok(retried.data.rows.every(item=>item.title==='after concurrent edit'));
  const invalid=await worker.fetch(new Request(app.origin+'/api/v1/article-reconciliation?date=2026-10-24'),env);assert.equal(invalid.status,400);
});
test('over-budget complete reads fail rather than presenting a partial ledger',async()=>{
  const store={all:async()=>Array.from({length:200},()=>({id:randomUUID(),title:'x'.repeat(10000),status:null}))};
  await assert.rejects(readArticleReconciliation(store,{},null),error=>error.status===413);
});
test('todo, notes, memo, schema, snapshot and glass stylesheet bytes stay equal to current production',async()=>{
  const files=['public/glass.css','public/style.css','public/memos.css','src/snapshot.mjs','src/snapshot-projection.mjs','src/daily-notes.mjs','src/memos.mjs'];
  files.push(...execFileSync('git',['ls-tree','-r','--name-only','9c9fb40','db','drizzle'],{encoding:'utf8'}).trim().split('\n'));
  for(const file of files)assert.deepEqual(await readFile(new URL('../'+file,import.meta.url)),execFileSync('git',['show','9c9fb40:'+file]));
});

test('new UI and API projections reject changed additions and preserve the complete preceding contract',async()=>{
  const {projectReconciliation}=await import('./reconciliation-ui-projection.mjs');
  const {reconciliationDocumentSpec}=await import('./article-pipeline-projection.mjs');
  const file='web/pages/article-reconciliation.mjs',source=await readFile(new URL('../'+file,import.meta.url),'utf8');
  assert.equal(projectReconciliation(file,source),'');assert.throws(()=>projectReconciliation(file,source+'\nconst unauthorized=1;'));
  const spec=JSON.parse(await readFile(new URL('../public/openapi.json',import.meta.url),'utf8'));
  assert.deepEqual(reconciliationDocumentSpec(spec),JSON.parse(execFileSync('git',['show','9c9fb40:public/openapi.json'],{encoding:'utf8'})));
  spec.paths['/api/v1/article-reconciliation'].get.summary='unauthorized';assert.throws(()=>reconciliationDocumentSpec(spec));
});
