import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleContentReview} from '../src/content-review.mjs';
import {digest,csrfFor,stable} from '../src/security.mjs';
import {reviewView} from '../src/content-review-validation.mjs';
import {validateReviewAttributionMigrationSource,reviewAttributionMigrationTag} from '../scripts/migration-contract.mjs';

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
  assert.deepEqual(next.data.items.map(row=>row.id).sort(),['next-beijing-midnight','second-real-boundary'].map(name=>ids.get(name)).sort());
  const unchanged=app.sql.prepare('SELECT published_at FROM matrix_review_articles WHERE id=?').get(ids.get('same-instant-offset'));
  assert.equal(unchanged.published_at,'2026-10-27T00:00:00+08:00');
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
  const detail=(await call('articles/'+id)).data;assert.deepEqual(Object.fromEntries(Object.keys(changed.data).map(key=>[key,detail[key]])),changed.data);assert.deepEqual(detail.snapshots,[]);
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

test('review3 additive migration preserves raw legacy rows and nullable fields preserve old hashes',async t=>{
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
  for(const {tag} of journal.entries.slice(0,16))sql.exec(readFileSync(new URL('../drizzle/'+tag+'.sql',import.meta.url),'utf8').replaceAll('--> statement-breakpoint',''));
  const owner=randomUUID(),article=randomUUID(),snapshot=randomUUID(),time='2026-10-30T00:00:00Z';
  sql.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(owner,'legacy','test',time);
  sql.prepare('INSERT INTO matrix_review_articles(user_id,id,title,created_at,updated_at) VALUES(?,?,?,?,?)').run(owner,article,'Legacy raw content',time,time);
  sql.prepare('INSERT INTO matrix_review_snapshots(user_id,id,article_id,snapshot_date,reads) VALUES(?,?,?,?,?)').run(owner,snapshot,article,'2026-10-30',null);
  const oldArticle=sql.prepare('SELECT * FROM matrix_review_articles').get(),oldSnapshot=sql.prepare('SELECT * FROM matrix_review_snapshots').get();
  const legacyHash=(row,kind)=>{
    const view=reviewView(kind,row);for(const key of ['content_hash','playbook_version_used','applied_rule_ids','age_hours','source','reference_article_id','status'])delete view[key];
    return digest(JSON.stringify(stable(view)));
  };
  const hashes=[legacyHash(oldArticle,'articles'),legacyHash(oldSnapshot,'snapshots')];
  const source=readFileSync(new URL('../drizzle/0016_review_attribution.sql',import.meta.url),'utf8');
  const statements=validateReviewAttributionMigrationSource(reviewAttributionMigrationTag,source);assert.equal(statements.length,4);
  for(const statement of statements)sql.exec(statement);
  for(const [kind,old,index] of [['articles',oldArticle,0],['snapshots',oldSnapshot,1]]) {
    const current=sql.prepare('SELECT * FROM matrix_review_'+kind).get();
    assert.deepEqual(Object.fromEntries(Object.keys(old).map(key=>[key,current[key]])),{...old});
    assert.equal(reviewView(kind,current).content_hash,hashes[index]);
  }
  assert.equal(sql.prepare('SELECT playbook_version_used,applied_rule_ids_json FROM matrix_review_articles').get().playbook_version_used,null);
  assert.throws(()=>sql.prepare('UPDATE matrix_review_snapshots SET age_hours=-1').run());
  assert.throws(()=>sql.prepare("UPDATE matrix_review_snapshots SET source='other'").run());
});

test('review3 stable creation aliases and nullable attribution validate without changing canonical hashes',async t=>{
  const app=fixture(t),article=randomUUID(),body={id:article,title:'Attribution',playbook_version_used:2,applied_rule_ids:['title-2']};
  const created=await app.call('articles','POST',body);assert.equal(created.status,201);
  assert.equal((await app.call('articles','POST',body)).data.content_hash,created.data.content_hash);
  const detail=(await app.call('articles/'+article)).data;assert.equal(detail.content_hash,created.data.content_hash);assert.deepEqual(detail.applied_rule_ids,['title-2']);
  assert.equal((await app.call('articles','POST',{title:'Missing stable id'})).status,400);
  for(const values of [{playbook_version_used:0},{playbook_version_used:1.2},{applied_rule_ids:['x','x']},{applied_rule_ids:[7]}])assert.equal((await app.call('articles','POST',{id:randomUUID(),title:'Bad',...values})).status,400);
  const playbook=randomUUID(),playbookBody={id:playbook,version:2,published_on:'2026-10-30',rules:[{rule_id:'title-2',section:'title',text:'A rule'}]};
  assert.equal((await app.call('playbooks/2','PUT',playbookBody)).status,201);
  assert.equal((await app.call('playbooks/2','PUT',playbookBody)).status,200);
  assert.equal((await app.call('playbooks/3','PUT',playbookBody)).status,400);
  assert.deepEqual((await app.call('articles/'+article)).data.applied_rules.map(rule=>rule.status),['candidate']);
  const snap=randomUUID(),snapBody={article_id:article,snapshot_date:'2026-10-30',age_hours:24,source:'toutiao_excel',reads:100};
  const saved=await app.call('snapshots/'+snap,'PUT',snapBody);assert.equal(saved.status,201);assert.equal((await app.call('snapshots/'+snap)).data.content_hash,saved.data.content_hash);
  for(const values of [{age_hours:-1},{age_hours:1.2},{source:'other'}])assert.equal((await app.call('snapshots/'+randomUUID(),'PUT',{...snapBody,snapshot_date:'2026-10-29',...values})).status,400);
  const legacy=randomUUID(),legacySaved=(await app.call('articles/'+legacy,'PUT',{title:'Legacy hash'})).data;
  const {playbook_version_used,applied_rule_ids,reference_article_id,content_hash,...old}=legacySaved;
  assert.equal(content_hash,digest(JSON.stringify(stable(old))));
  assert.equal((await app.call('articles/'+legacy,'PUT',{title:'Legacy hash'})).status,200);
  assert.equal((await app.call('articles/'+legacy,'PATCH',{expected_hash:content_hash,title:'Old client update'})).status,200);
  assert.equal((await app.call('articles/'+article,'PUT',{title:'Attribution'})).error.code,'IDEMPOTENCY_CONFLICT');
});

test('review3 rule PATCH scopes playbook and atomically replays receipts while GET defaults stay read-only',async t=>{
  const app=fixture(t),id=randomUUID(),support=randomUUID();
  const rule={rule_id:'same-rule',section:'title',text:'Original rule'};
  const creation={account:'review3',version:1,published_on:'2026-10-30',rules:[rule]};
  const created=(await app.call('playbooks/'+id,'PUT',creation)).data;
  const before=app.sql.prepare('SELECT rules_json FROM matrix_review_playbooks WHERE id=?').get(id).rules_json;
  const get=(await app.call('playbooks/'+id)).data;assert.equal(get.rules[0].status,'candidate');assert.equal(get.content_hash,created.content_hash);
  assert.equal((await app.call('playbooks/'+id,'PUT',creation)).data.content_hash,created.content_hash);
  assert.equal((await app.call('playbooks/'+id,'PUT',{...creation,rules:get.rules})).data.content_hash,created.content_hash);
  assert.equal((await app.call('playbooks/'+id,'PATCH',{expected_hash:get.content_hash,rules:get.rules})).data.content_hash,created.content_hash);
  assert.equal(app.sql.prepare('SELECT rules_json FROM matrix_review_playbooks WHERE id=?').get(id).rules_json,before);
  const payload={account:'review3',playbook_id:id,expected_hash:created.content_hash,save_id:randomUUID(),status:'trial',support_ids:[support],counter_ids:[],trials:1,evidence:{metric:'reads_24h',with_median:100,without_median:null,n_with:1,n_without:0}};
  const changed=await app.call('rules/same-rule','PATCH',payload);assert.equal(changed.status,200);assert.equal(changed.data.rules[0].status,'trial');
  assert.equal((await app.call('playbooks/'+id)).data.content_hash,changed.data.content_hash);
  const next=await app.call('rules/same-rule','PATCH',{...payload,save_id:randomUUID(),expected_hash:changed.data.content_hash,status:'kept'});assert.equal(next.status,200);
  assert.deepEqual((await app.call('rules/same-rule','PATCH',payload)).data,changed.data);
  assert.equal((await app.call('rules/another-rule','PATCH',payload)).error.code,'IDEMPOTENCY_CONFLICT');
  assert.equal((await app.call('rules/same-rule','PATCH',{...payload,save_id:randomUUID()})).error.code,'VERSION_CONFLICT');
  assert.equal((await app.call('rules/same-rule','PATCH',{...payload,save_id:randomUUID(),account:'wrong'})).status,404);
  for(const change of [{text:'forbidden'},{status:'unknown'},{trials:-1},{support_ids:[support,support]},{evidence:{metric:'reads'}}])assert.equal((await app.call('rules/same-rule','PATCH',{...payload,...change,save_id:randomUUID()})).status,400);
  const raw=app.sql.prepare('SELECT rules_json FROM matrix_review_playbooks WHERE id=?').get(id).rules_json;
  const batch=app.db.batch;app.db.batch=statements=>batch([...statements,{run:async()=>{throw new Error('rule rollback');}}]);
  await assert.rejects(app.call('rules/same-rule','PATCH',{...payload,save_id:randomUUID(),expected_hash:next.data.content_hash,status:'hold'}),/rule rollback/);
  assert.equal(app.sql.prepare('SELECT rules_json FROM matrix_review_playbooks WHERE id=?').get(id).rules_json,raw);
});

test('review3 article verdict filtering runs before page and overview preserves revision',async t=>{
  const app=fixture(t),time='2026-10-30T00:00:00Z';
  const insert=app.sql.prepare('INSERT INTO matrix_review_articles(user_id,id,account,title,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)');
  for(let i=0;i<102;i++)insert.run(app.owner,randomUUID(),'filter-test','Pending '+i,'2026-10-30',time,time);
  const article=randomUUID();insert.run(app.owner,article,'filter-test','Selected','2026-10-29',time,time);
  app.sql.prepare('INSERT INTO matrix_review_snapshots(user_id,id,article_id,snapshot_date,age_hours,reads) VALUES(?,?,?,?,?,?)').run(app.owner,randomUUID(),article,'2026-10-30',24,1500);
  const selected=await app.call('articles?account=filter-test&verdict='+encodeURIComponent('爆')+'&page=1');
  assert.equal(selected.status,200);assert.deepEqual(selected.data.items.map(row=>row.id),[article]);assert.equal(selected.data.total,1);assert.equal(selected.data.has_more,false);
  const pending=await app.call('articles?account=filter-test&verdict=pending&page=2');assert.equal(pending.data.items.length,2);
  for(const query of ['page=0','page=1&offset=0','verdict=unknown'])assert.equal((await app.call('articles?'+query)).status,400);
  const overview=await app.call('overview?account=filter-test&range=7d');assert.equal(overview.status,200);assert.equal(overview.data.read_revision,selected.data.read_revision);
  for(const key of ['count','hit_rate','miss_rate','ctr_median']) {
    assert.equal(overview.data.cards[key],overview.data.current[key]);assert.equal(overview.data.cards[key+'_prev_delta'],overview.data.changes[key].delta);assert.equal(overview.data.cards.each_prev_delta[key],overview.data.changes[key].delta);
  }
  assert.equal((await app.call('overview?account=filter-test&week=invalid')).status,400);
  assert.equal(overview.data.trend.length,7);assert.equal((await app.call('overview?account=filter-test&range=30d')).data.trend.length,30);
});

test('review3 daily summaries are at most two sentences and historical three_day remains editable',async t=>{
  const app=fixture(t),body={period_type:'daily',period_start:'2026-10-29',period_end:'2026-10-29',verdicts:{},summary_md:'第一句。第二句！'};
  assert.equal((await app.call('reports/'+randomUUID(),'PUT',body)).status,201);
  assert.equal((await app.call('reports/'+randomUUID(),'PUT',{...body,period_start:'2026-10-28',summary_md:'一。二。三。'})).status,400);
  assert.equal((await app.call('reports/'+randomUUID(),'PUT',{...body,period_type:'three_day'})).status,400);
  const id=randomUUID(),time='2026-10-30T00:00:00Z';
  app.sql.prepare('INSERT INTO matrix_review_reports(user_id,id,account,period_type,period_start,period_end,findings_json,summary_md,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(app.owner,id,'historical','three_day','2026-10-20','2026-10-22','{"verified":[],"overturned":[]}','Historical summary',time);
  const get=await app.call('reports/'+id);assert.equal(get.status,200);assert.equal((await app.call('reports/'+id,'PATCH',{expected_hash:get.data.content_hash,summary_md:'Historical corrected'})).status,200);
  const daily=randomUUID();app.sql.prepare('INSERT INTO matrix_review_reports(user_id,id,account,period_type,period_start,period_end,findings_json,summary_md,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(app.owner,daily,'historical','daily','2026-10-20','2026-10-20','{"verified":[],"overturned":[]}','一。二。三。',time);
  const legacy=(await app.call('reports/'+daily)).data;
  assert.equal((await app.call('reports/'+daily,'PATCH',{expected_hash:legacy.content_hash,playbook_version:1})).status,200);
});

test('review3 extended rule checks are inert metadata and evidence fields reject malformed values',async t=>{
  const {call}=fixture(t),base={version:1,published_on:'2026-10-30'},rule={rule_id:'check-1',section:'checklist',text:'Inspect evidence'};
  for(const [index,check] of ['manual',{type:'manual'},{type:'regex',value:'['},{type:'regex',value:'(a+)+$'}].entries()) {
    const result=await call('playbooks/'+randomUUID(),'PUT',{...base,version:index+1,rules:[{...rule,check,status:'candidate',support_ids:[],counter_ids:[],trials:0,evidence:{metric:'ctr',with_median:0,without_median:2.5,n_with:0,n_without:1}}]});
    assert.equal(result.status,201);assert.deepEqual(result.data.rules[0].check,check);
  }
  for(const changes of [{check:{type:'shell',value:'x'}},{check:{type:'regex',value:''}},{check:{type:'manual',extra:true}},{support_ids:['not-uuid']},{counter_ids:[randomUUID(),1]},{evidence:{metric:'reads',with_median:-1,without_median:null,n_with:0,n_without:0}},{evidence:{metric:'reads',with_median:0,without_median:0,n_with:1.5,n_without:0}},{trials:null}]) {
    assert.equal((await call('playbooks/'+randomUUID(),'PUT',{...base,version:100,rules:[{...rule,...changes}]})).status,400);
  }
});

test('review 1.2 legacy playbook status is derived without changing historical hashes',async t=>{
  const app=fixture(t),id='8f553af0-302a-45fb-9fde-16d6d537c888',other=randomUUID(),time='2026-10-30T00:00:00Z';
  const insert=app.sql.prepare('INSERT INTO matrix_review_playbooks(user_id,id,account,version,published_on,rules_json,created_at) VALUES(?,?,?,?,?,?,?)');
  insert.run(app.owner,id,'V字',2,'2026-10-30',JSON.stringify([{rule_id:'test',section:'title',text:'rule'}]),time);
  insert.run(app.owner,other,'V字',1,'2026-10-29','[]',time);
  const raw=app.sql.prepare('SELECT * FROM matrix_review_playbooks WHERE id=?').get(id),view=reviewView('playbooks',raw);
  const {content_hash,status,...old}=view;assert.equal(content_hash,digest(JSON.stringify(stable(old))));
  const draft=(await app.call('playbooks/'+id)).data,active=(await app.call('playbooks/'+other)).data;
  assert.equal(draft.status,'draft');assert.equal(active.status,'active');assert.equal(draft.content_hash,content_hash);
  assert.equal(app.sql.prepare('SELECT status FROM matrix_review_playbooks WHERE id=?').get(id).status,null);
  const echo=await app.call('playbooks/'+other,'PUT',{account:'V字',version:1,published_on:'2026-10-29',status:'active'});
  assert.equal(echo.status,200);assert.equal(echo.data.content_hash,active.content_hash);
  assert.equal(app.sql.prepare('SELECT status FROM matrix_review_playbooks WHERE id=?').get(other).status,null);
  const rule=await app.call('rules/test','PATCH',{account:'V字',playbook_id:id,expected_hash:content_hash,save_id:randomUUID(),evidence_note:'佐证'});
  assert.equal(rule.status,200);assert.equal(rule.data.rules[0].evidence_note,'佐证');
  assert.equal((await app.call('playbooks/'+id)).data.content_hash,rule.data.content_hash);
  const tooLong=await app.call('rules/test','PATCH',{account:'V字',playbook_id:id,expected_hash:rule.data.content_hash,save_id:randomUUID(),evidence_note:'中'.repeat(667)});
  assert.equal(tooLong.status,400);
  const enabled=await app.call('playbooks/'+id,'PATCH',{expected_hash:rule.data.content_hash,status:'active'});
  assert.equal(enabled.status,200);assert.equal(enabled.data.status,'active');assert.notEqual(enabled.data.content_hash,rule.data.content_hash);
  assert.equal((await app.call('playbooks/'+id)).data.content_hash,enabled.data.content_hash);
});

test('review reference checks account ownership and derives reverse links without changing fallback fields',async t=>{
  const app=fixture(t),account=randomUUID(),reference=randomUUID(),article=randomUUID(),foreign=randomUUID();
  assert.equal((await app.call('benchmark-accounts/'+account,'PUT',{account:'V字',platform:'toutiao',name:'reference'})).status,201);
  const ref=(await app.call('benchmark-articles/'+reference,'PUT',{benchmark_account_id:account,title:'sample',url:'https://example.com/sample',reads:123})).data;
  const own=(await app.call('articles/'+article,'PUT',{title:'own',reference_article_id:reference,sample_title:'fallback',sample_url:'https://example.com/fallback'})).data;
  assert.equal(own.sample_title,'fallback');assert.equal(own.sample_url,'https://example.com/fallback');
  assert.deepEqual((await app.call('benchmark-articles/'+reference)).data.used_by_article_ids,[article]);
  assert.equal((await app.call('articles/'+foreign,'PUT',{title:'wrong account',account:'other',reference_article_id:reference})).status,404);
  assert.equal((await app.call('articles/'+article,'PATCH',{expected_hash:own.content_hash,account:'other'})).status,404);
  const current=(await app.call('benchmark-articles/'+reference)).data;
  assert.notEqual(ref.content_hash,current.content_hash);
  assert.equal((await app.call('benchmark-articles/'+reference,'DELETE',{expected_hash:current.content_hash,save_id:randomUUID()})).status,409);
  const cleared=(await app.call('articles/'+article,'PATCH',{expected_hash:own.content_hash,reference_article_id:null})).data;
  assert.equal(cleared.sample_title,'fallback');assert.deepEqual((await app.call('benchmark-articles/'+reference)).data.used_by_article_ids,[]);
});

test('playbook writes preserve legacy raw rules while reads add display defaults',async t=>{
  const app=fixture(t),id=randomUUID(),rule={rule_id:'raw-rule',section:'title',text:'Unchanged raw rule'};
  const body={account:'write-shape',version:1,published_on:'2026-10-30',rules:[rule]};
  const created=await app.call('playbooks/'+id,'PUT',body);
  assert.deepEqual(created.data.rules,[rule]);assert.equal(created.data.status,'active');
  const replay=await app.call('playbooks/'+id,'PUT',body);assert.deepEqual(replay.data.rules,[rule]);
  const unchanged=await app.call('playbooks/'+id,'PATCH',{expected_hash:created.data.content_hash,changelog_md:''});assert.deepEqual(unchanged.data.rules,[rule]);
  const changed=await app.call('playbooks/'+id,'PATCH',{expected_hash:created.data.content_hash,changelog_md:'change'});assert.deepEqual(changed.data.rules,[rule]);
  assert.equal((await app.call('playbooks/'+id)).data.rules[0].status,'candidate');
});
