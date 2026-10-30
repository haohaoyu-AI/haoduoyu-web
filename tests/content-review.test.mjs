import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleContentReview} from '../src/content-review.mjs';
import {digest,csrfFor} from '../src/security.mjs';

function fixture(t) {
  const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');t.after(()=>sql.close());
  const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
  for(const {tag} of journal.entries)for(const statement of readFileSync(new URL('../drizzle/'+tag+'.sql',import.meta.url),'utf8').split('--> statement-breakpoint').map(value=>value.trim()).filter(Boolean))sql.exec(statement);
  const db={prepare(text){let values=[];return {bind(...args){values=args;return this;},async first(){return sql.prepare(text).get(...values)||null;},async all(){return {results:sql.prepare(text).all(...values)};},async run(){const result=sql.prepare(text).run(...values);return {meta:{changes:Number(result.changes)}};}};},async batch(statements){sql.exec('BEGIN');try{for(const statement of statements)await statement.run();sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}}};
  const owner=randomUUID(),token=randomBytes(32).toString('hex'),origin='http://localhost';
  sql.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(owner,'owner','synthetic',new Date().toISOString());
  sql.prepare('INSERT INTO matrix_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(digest(token),owner,new Date(Date.now()+60000).toISOString());
  sql.exec('INSERT INTO matrix_control(id,initialized) VALUES(1,1)');
  const env={DAILY_NOTES_OWNER_ID:owner,PUBLIC_BUSINESS_MODE:'1'},publicHeaders={Origin:origin,'X-Public-Business':'1'};
  async function call(path,method='GET',data,headers=publicHeaders,settings=env) {
    const h=new Headers(headers);if(data!==undefined)h.set('Content-Type','application/json');
    const request=new Request(origin+'/api/v1/review/'+path,{method,headers:h,body:data===undefined?undefined:JSON.stringify(data)});
    try{const response=await handleContentReview(db,request,new URL(request.url).pathname.slice('/api/v1'.length),settings,origin);return {status:response.status,...await response.json()};}
    catch(error){if(!error.status)throw error;return {status:error.status,error:{code:error.code,message:error.message}};}
  }
  return {db,sql,owner,token,env,origin,call,publicHeaders,auth:{...publicHeaders,Cookie:'matrix_session='+token,'X-CSRF-Token':csrfFor(token)}};
}

test('review article date filters use Beijing days before pagination and retain date-only semantics',async t=>{
  const app=fixture(t),time='2026-10-30T00:00:00.000Z',ids=new Map();
  const insert=app.sql.prepare('INSERT INTO matrix_review_articles(user_id,id,account,platform,title,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)');
  function seed(name,published) {
    const id=randomUUID();ids.set(name,id);insert.run(app.owner,id,'V字','toutiao',name,published,time,time);
  }
  seed('before-midnight','2026-10-26T15:59:59Z');
  seed('beijing-midnight','2026-10-26T16:00:00Z');
  seed('same-instant-offset','2026-10-27T00:00:00+08:00');
  seed('late-utc-publication','2026-10-26T20:05:00Z');
  seed('date-only','2026-10-27');
  seed('last-beijing-second','2026-10-27T15:59:59Z');
  seed('next-beijing-midnight','2026-10-27T16:00:00Z');
  seed('second-real-boundary','2026-10-27T22:09:00Z');
  seed('beijing-morning','2026-10-27T23:13:00.000Z');
  seed('beijing-evening-offset','2026-10-28T18:00:00+08:00');
  seed('unknown',null);seed('invalid','unknown');seed('invalid-date','2026-02-30');
  seed('invalid-timestamp','2026-02-30T20:05:00Z');seed('no-offset','2026-10-26T20:05:00');
  // More than a page of newer, out-of-range records proves filtering precedes paging.
  for(let i=0;i<105;i++)seed('newer-'+i,'2026-11-01T00:00:00Z');
  const query='articles?account='+encodeURIComponent('V字')+'&from=2026-10-27&to=2026-10-27';
  const selected=await app.call(query);assert.equal(selected.status,200);assert.equal(selected.data.has_more,false);
  const expected=['beijing-midnight','same-instant-offset','late-utc-publication','date-only','last-beijing-second'].map(name=>ids.get(name)).sort();
  assert.deepEqual(selected.data.items.map(row=>row.id).sort(),expected);
  const offset=await app.call(query+'&offset=1');assert.deepEqual(offset.data.items.map(row=>row.id),selected.data.items.slice(1).map(row=>row.id));
  const next=await app.call('articles?account='+encodeURIComponent('V字')+'&from=2026-10-28&to=2026-10-28');
  assert.deepEqual(next.data.items.map(row=>row.id).sort(),['next-beijing-midnight','second-real-boundary','beijing-morning','beijing-evening-offset'].map(name=>ids.get(name)).sort());
  const unchanged=app.sql.prepare('SELECT published_at FROM matrix_review_articles WHERE id=?').get(ids.get('same-instant-offset'));
  assert.equal(unchanged.published_at,'2026-10-27T00:00:00+08:00');
});

test('a full legacy write still round-trips and a 07:13 Beijing instant groups on that day',async t=>{
  const {call}=fixture(t),article=randomUUID(),snapshot=randomUUID(),report=randomUUID(),book=randomUUID();
  const articleBody={account:'V字',platform:'toutiao',platform_article_id:null,title:'完整旧载荷',url:'https://example.com/a',
    published_at:'2026-10-28T07:13:00+08:00',topic_category:'剧评',title_pattern:'追问',sample_title:null,sample_url:null,
    image_count:null,source_chat:null};
  const created=await call('articles/'+article,'PUT',articleBody);
  assert.equal(created.status,201);
  assert.equal(created.data.published_at,'2026-10-27T23:13:00.000Z');
  assert.equal(created.data.image_count,null);
  const snapBody={article_id:article,snapshot_date:'2026-10-28',impressions:null,fan_impressions:null,reads:100,fan_reads:null,
    ctr:5.5,completion_rate:null,avg_read_seconds:null,likes:null,comments:null,reposts:null,shares:null,favorites:null,revenue:null,
    traffic_sources:null,completion_curve:null,audience:null};
  assert.equal((await call('snapshots/'+snapshot,'PUT',snapBody)).status,201);
  const reportBody={account:'V字',period_type:'daily',period_start:'2026-10-28',period_end:'2026-10-28',
    verdicts:{[article]:{verdict:'爆',reason:'一句原因'}},findings:{verified:[],overturned:[]},summary_md:'一句结论',metrics:{},playbook_version:null};
  assert.equal((await call('reports/'+report,'PUT',reportBody)).status,201);
  const bookBody={account:'V字',version:3,published_on:'2026-10-28',content_md:'',rules:[],changelog_md:'',sent_to_gemini_at:null};
  assert.equal((await call('playbooks/'+book,'PUT',bookBody)).status,201);
  const patched=await call('snapshots/'+snapshot,'PATCH',{expected_hash:(await call('snapshots/'+snapshot)).data.content_hash,reads:101});
  assert.equal(patched.status,200);
  assert.equal(patched.data.reads,101);
  assert.equal(patched.data.impressions,null);
  const day=await call('articles?account='+encodeURIComponent('V字')+'&from=2026-10-28&to=2026-10-28');
  assert.equal(day.data.items.some(row=>row.id===article),true);
  const previous=await call('articles?account='+encodeURIComponent('V字')+'&from=2026-10-27&to=2026-10-27');
  assert.equal(previous.data.items.some(row=>row.id===article),false);
  assert.equal((await call('articles/'+article,'PUT',articleBody)).status,200);
});

test('review public access is route-local; supplied credentials and owner-session CSRF stay strict',async t=>{
  const app=fixture(t),id=randomUUID();
  for(const kind of ['articles','snapshots','reports','playbooks'])assert.deepEqual((await app.call(kind)).data.items,[]);
  assert.equal((await app.call('articles','GET',undefined,{}, {...app.env,PUBLIC_BUSINESS_MODE:'0'})).status,401);
  for(const headers of [{Authorization:''},{Authorization:'Bearer invalid'},{Cookie:'matrix_session=invalid'},{Cookie:'matrix_session='+randomBytes(32).toString('hex')}]) {
    assert.equal((await app.call('articles','GET',undefined,headers)).status,401);
    assert.equal((await app.call('articles/'+id,'PUT',{title:'synthetic'}, {...app.publicHeaders,...headers})).status,401);
  }
  for(const headers of [{},{Origin:app.origin},{...app.publicHeaders,Origin:'https://wrong.invalid'}])assert.equal((await app.call('articles/'+id,'PUT',{title:'synthetic'},headers)).status,403);
  assert.equal((await app.call('articles/'+id,'PUT',{title:'synthetic'},{...app.auth,'X-CSRF-Token':'wrong'})).status,403);
  const foreign=randomUUID(),foreignToken=randomBytes(32).toString('hex');
  app.sql.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(foreign,'foreign','synthetic',new Date().toISOString());
  app.sql.prepare('INSERT INTO matrix_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(digest(foreignToken),foreign,new Date(Date.now()+60000).toISOString());
  assert.equal((await app.call('articles','GET',undefined,{Cookie:'matrix_session='+foreignToken})).status,403);
  const key='hdy_'+randomBytes(32).toString('hex');
  app.sql.prepare('INSERT INTO matrix_api_keys(id,name,token_hash,account_ids_json,permissions_json,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),'synthetic',digest(key),'[]','["read","write"]',new Date().toISOString());
  assert.equal((await app.call('articles','GET',undefined,{Authorization:'Bearer '+key})).status,403);
  assert.equal((await app.call('articles/'+id,'PUT',{title:'owner'},app.auth)).status,201);
});

test('review articles support UUID replay, natural uniqueness, true missing values, and conditional PATCH',async t=>{
  const {call}=fixture(t),id=randomUUID(),body={title:'Synthetic article',platform_article_id:'synthetic-platform-id',published_at:'2026-10-30'};
  const created=await call('articles/'+id,'PUT',body);assert.equal(created.status,201);assert.equal(created.data.account,'V字');assert.equal(created.data.image_count,null);
  assert.deepEqual((await call('articles/'+id,'PUT',body)).data,created.data);
  assert.equal((await call('articles/'+id,'PUT',{...body,title:'other'})).error.code,'IDEMPOTENCY_CONFLICT');
  const duplicate=await call('articles/'+randomUUID(),'PUT',body);assert.equal(duplicate.status,409);assert.equal(duplicate.error.existing_id,id);
  const unchanged=await call('articles/'+id,'PATCH',{expected_hash:created.data.content_hash,title:body.title});assert.deepEqual(unchanged.data,created.data);
  const changed=await call('articles/'+id,'PATCH',{expected_hash:created.data.content_hash,title:'Changed'});assert.equal(changed.status,200);assert.notEqual(changed.data.content_hash,created.data.content_hash);
  assert.equal((await call('articles/'+id,'PATCH',{expected_hash:created.data.content_hash,title:'Stale'})).error.code,'VERSION_CONFLICT');
  assert.deepEqual((await call('articles/'+id)).data,changed.data);
  for(const data of [{title:'x',unknown:true},{title:'x',image_count:-1},{title:'x',image_count:1.5},{title:'x',url:'javascript:alert(1)'},{title:'x',published_at:'2026-02-30'}])assert.equal((await call('articles/'+randomUUID(),'PUT',data)).status,400);
});

test('review list pagination preserves a chosen revision and rejects ambiguous filters',async t=>{
  const app=fixture(t),time=new Date().toISOString();
  for(let index=0;index<102;index++)app.sql.prepare('INSERT INTO matrix_review_articles(user_id,id,title,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(app.owner,randomUUID(),'Synthetic '+index,'2026-10-30',time,time);
  const first=await app.call('articles?account='+encodeURIComponent('V字')+'&from=2026-10-30&to=2026-10-30');assert.equal(first.data.items.length,100);assert.equal(first.data.has_more,true);
  const second=await app.call('articles?offset=100&read_revision='+first.data.read_revision);assert.equal(second.data.items.length,2);assert.equal(second.data.has_more,false);
  const ids=new Set([...first.data.items,...second.data.items].map(item=>item.id));assert.equal(ids.size,102);
  await app.call('articles/'+randomUUID(),'PUT',{title:'Later'});
  assert.equal((await app.call('articles?offset=100&read_revision='+first.data.read_revision)).error.code,'READ_REVISION_CHANGED');
  for(const query of ['offset=-1','offset=0&offset=1','read_revision=x','from=2026-10-31&to=2026-10-30','account=','unknown=1'])assert.equal((await app.call('articles?'+query)).status,400);
});

test('review snapshot batch returns per-item results, protects uniqueness, and preserves null metrics',async t=>{
  const {call}=fixture(t),article_id=randomUUID(),id=randomUUID();await call('articles/'+article_id,'PUT',{title:'Synthetic batch parent'});
  const body={id,article_id,snapshot_date:'2026-10-30',reads:40,ctr:2.5};
  const result=await call('snapshots:batch','PUT',{items:[body,{...body},{...body,id:randomUUID()},{id:randomUUID(),article_id,snapshot_date:'bad'},{id:randomUUID(),article_id:randomUUID(),snapshot_date:'2026-10-30'}]});
  assert.deepEqual(result.data.items.map(item=>item.status),[201,200,409,400,404]);
  assert.equal(result.data.items[0].data.impressions,null);assert.equal(result.data.items[0].data.revenue,null);assert.equal(result.data.items[2].error.existing_id,id);
  assert.equal((await call('snapshots?article_id='+article_id)).data.items.length,1);
  assert.equal((await call('snapshots:batch','PUT',{items:[]})).status,400);
  assert.equal((await call('snapshots:batch','PUT',{items:Array.from({length:201},()=>body)})).status,400);
  const snapshot=(await call('snapshots/'+id)).data;
  assert.equal((await call('snapshots/'+id,'PATCH',{expected_hash:snapshot.content_hash,reads:41})).status,200);
  assert.equal((await call('snapshots/'+randomUUID(),'PUT',{article_id,snapshot_date:'2026-10-29',ctr:101})).status,400);
});

test('review snapshot account filter joins only owner articles and combines with article_id',async t=>{
  const app=fixture(t),first=randomUUID(),second=randomUUID(),snapshot=randomUUID();
  await app.call('articles/'+first,'PUT',{title:'Synthetic V article',account:'V字'});
  await app.call('articles/'+second,'PUT',{title:'Synthetic other account article',account:'other'});
  await app.call('snapshots/'+snapshot,'PUT',{article_id:first,snapshot_date:'2026-10-30'});
  await app.call('snapshots/'+randomUUID(),'PUT',{article_id:second,snapshot_date:'2026-10-30'});
  const v=(await app.call('snapshots?account='+encodeURIComponent('V字'))).data.items;
  assert.deepEqual(v.map(row=>row.id),[snapshot]);
  assert.equal((await app.call('snapshots?account=other&article_id='+first)).data.items.length,0);
  assert.equal((await app.call('snapshots?account=other&article_id='+second)).data.items.length,1);
  const foreign=randomUUID(),time=new Date().toISOString();
  app.sql.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(foreign,'foreign-filter','synthetic',time);
  // The same article UUID in another owner must not influence this owner's filter.
  app.sql.prepare('INSERT INTO matrix_review_articles(user_id,id,account,title,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(foreign,second,'V字','Foreign synthetic canary',time,time);
  const isolated=(await app.call('snapshots?account='+encodeURIComponent('V字'))).data.items;
  assert.deepEqual(isolated.map(row=>row.id),[snapshot]);
  assert.equal((await app.call('snapshots?account=')).status,400);
  assert.equal((await app.call('snapshots?account=V&account=other')).status,400);
});

test('review custom conflict response retains the worker request trace',async t=>{
  const app=fixture(t),body={title:'Synthetic trace',platform_article_id:'trace-unique'};
  await app.call('articles/'+randomUUID(),'PUT',body);
  const id=randomUUID(),route='/review/articles/'+id,rid=randomUUID();
  const request=new Request(app.origin+'/api/v1'+route,{method:'PUT',headers:{...app.publicHeaders,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const response=await handleContentReview(app.db,request,route,app.env,app.origin,undefined,{rid});
  assert.equal(response.status,409);assert.equal((await response.json()).request_id,rid);
});

test('review report and playbook CRUD preserve rule evidence and enforce natural keys',async t=>{
  const {call}=fixture(t),article=randomUUID();
  const resources={
    reports:{account:'V字',period_type:'weekly',period_start:'2026-10-23',period_end:'2026-10-29',verdicts:{[article]:{verdict:'中',reason:'Synthetic evidence'}},findings:{verified:[{rule_id:'title-1',reason:'Synthetic verification'}],overturned:[]}},
    playbooks:{version:1,published_on:'2026-10-30',rules:[{rule_id:'title-1',section:'title',text:'Synthetic rule'}]},
  };
  for(const [kind,body] of Object.entries(resources)) {
    const id=randomUUID(),created=await call(kind+'/'+id,'PUT',body);assert.equal(created.status,201);
    assert.deepEqual((await call(kind+'/'+id,'PUT',body)).data,created.data);
    const duplicate=await call(kind+'/'+randomUUID(),'PUT',body);assert.equal(duplicate.error.existing_id,id);
    const field=kind==='reports'?'summary_md':'changelog_md',updated=await call(kind+'/'+id,'PATCH',{expected_hash:created.data.content_hash,[field]:'Synthetic update'});assert.equal(updated.status,200);
    const payload={expected_hash:updated.data.content_hash,save_id:randomUUID()};
    assert.equal((await call(kind+'/'+id,'DELETE',payload)).data.deleted,true);assert.equal((await call(kind+'/'+id,'DELETE',payload)).status,200);
    assert.equal((await call(kind+'/'+id,'PUT',body)).error.code,'REVIEW_DELETED');
  }
  assert.equal((await call('reports/'+randomUUID(),'PUT',{...resources.reports,findings:{verified:[{text:'missing rule id'}],overturned:[]}})).status,400);
});

test('review permanent article deletion requires explicit cascade and tombstones every child atomically',async t=>{
  const app=fixture(t),article=randomUUID(),snapshot=randomUUID(),body={title:'Synthetic cascade parent'};
  const row=(await app.call('articles/'+article,'PUT',body)).data;
  const child={article_id:article,snapshot_date:'2026-10-30',reads:10};await app.call('snapshots/'+snapshot,'PUT',child);
  const payload={expected_hash:row.content_hash,save_id:randomUUID()};
  const conflict=await app.call('articles/'+article,'DELETE',payload);assert.equal(conflict.error.code,'ARTICLE_HAS_SNAPSHOTS');assert.equal(conflict.error.snapshot_count,1);
  assert.equal((await app.call('articles/'+article,'DELETE',{...payload,expected_hash:'0'.repeat(64),cascade_snapshots:true})).error.code,'VERSION_CONFLICT');
  const deleted=await app.call('articles/'+article,'DELETE',{...payload,cascade_snapshots:true});assert.deepEqual(deleted.data,{deleted:true,id:article,deleted_snapshots:1});
  assert.deepEqual((await app.call('articles/'+article,'DELETE',{...payload,cascade_snapshots:true})).data,deleted.data);
  assert.equal((await app.call('articles/'+article,'PUT',body)).error.code,'REVIEW_DELETED');
  assert.equal((await app.call('snapshots/'+snapshot,'PUT',child)).error.code,'REVIEW_DELETED');
  assert.equal((await app.call('snapshots/'+snapshot)).status,404);
  const receipts=app.sql.prepare('SELECT response_json FROM matrix_idempotency').all();assert.ok(!JSON.stringify(receipts).includes(body.title));
});

test('review cascade failure rolls back parent, child, receipts and tombstones',async t=>{
  const app=fixture(t),article=randomUUID(),snapshot=randomUUID();
  const row=(await app.call('articles/'+article,'PUT',{title:'Synthetic rollback'})).data;
  await app.call('snapshots/'+snapshot,'PUT',{article_id:article,snapshot_date:'2026-10-30'});
  const batch=app.db.batch;app.db.batch=statements=>batch([...statements,{run:async()=>{throw new Error('synthetic transaction failure');}}]);
  await assert.rejects(app.call('articles/'+article,'DELETE',{expected_hash:row.content_hash,save_id:randomUUID(),cascade_snapshots:true}),/synthetic transaction failure/);
  assert.equal((await app.call('articles/'+article)).status,200);assert.equal((await app.call('snapshots/'+snapshot)).status,200);
  assert.equal(app.sql.prepare('SELECT count(*) AS n FROM matrix_idempotency').get().n,0);
});

test('review public rejected writes consume the existing bounded request limit',async t=>{
  const app=fixture(t);
  for(let index=0;index<60;index++)assert.equal((await app.call('articles/'+randomUUID(),'PUT',{unknown:true})).status,400);
  const limited=await app.call('articles/'+randomUUID(),'PUT',{title:'Limited'});assert.equal(limited.status,429);assert.equal(limited.error.code,'REVIEW_RATE_LIMIT');
  assert.equal((await app.call('articles/'+randomUUID(),'PUT',{title:'Owner still available'},app.auth)).status,201);
});
