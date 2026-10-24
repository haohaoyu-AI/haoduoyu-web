import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './harness.mjs';
import {readBusinessSnapshot,snapshotHash,snapshotDate,emptySnapshot} from '../src/business-snapshot.mjs';

test('business snapshot is date/owner/account scoped, paged beyond 200 and excludes deleted/security data',async t=>{
  const app=await fixture(t),session=await app.login();
  const owner=(await app.request('/api/v1/auth/me',{session})).data.id,other=randomUUID();
  await app.db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) SELECT ?,?,password_hash,created_at FROM matrix_users LIMIT 1')
    .bind(other,'synthetic-other-'+other).run();
  const date='2026-10-24',stamp='2026-10-24T00:00:00.000Z';
  for(const [user,text,deleted] of [[owner,'PUBLIC-DAY',null],[owner,'DELETED-CANARY',stamp],[other,'OTHER-USER-CANARY',null]])
    await app.db.prepare('INSERT INTO matrix_todos(user_id,id,date,text,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?)')
      .bind(user,randomUUID(),date,text,stamp,stamp,deleted).run();
  for(let offset=0;offset<205;offset+=40)await app.db.batch(Array.from({length:Math.min(40,205-offset)},(_,i)=>
    app.db.prepare('INSERT INTO matrix_articles(id,account_id,title,url,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
      .bind(randomUUID(),'toutiao-haoduoyu','Article '+(offset+i),'https://example.invalid/'+randomUUID(),stamp,stamp,stamp)));
  await app.db.prepare('INSERT INTO matrix_articles(id,account_id,title,url,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
    .bind(randomUUID(),'zhihu-haoduoyu','OTHER-ACCOUNT-CANARY','https://example.invalid/hidden',stamp,stamp,stamp).run();
  const snapshot=await readBusinessSnapshot(app.db,{date,ownerId:owner,accountIds:['toutiao-haoduoyu']});
  assert.equal(snapshot.todos.length,1);assert.equal(snapshot.articles.length,205);assert.equal(snapshot.accounts.length,1);
  const serialized=JSON.stringify(snapshot);
  for(const marker of ['DELETED-CANARY','OTHER-USER-CANARY','OTHER-ACCOUNT-CANARY','password_hash','token_hash','matrix_session','user_id'])
    assert.ok(!serialized.includes(marker),marker);
  const reordered={...snapshot,generated_at:'2099-01-01T00:00:00.000Z',articles:[...snapshot.articles].reverse()};
  assert.equal(snapshotHash(reordered),snapshot.content_hash);
  reordered.todos=[{...snapshot.todos[0],completed:1}];assert.notEqual(snapshotHash(reordered),snapshot.content_hash);
  await assert.rejects(readBusinessSnapshot(app.db,{date,ownerId:owner,accountIds:['toutiao-haoduoyu']},{maxRows:10}),e=>e.code==='SNAPSHOT_LIMIT');
});

test('Beijing day windows use as_of/date and include linked older articles without inventing metrics',async t=>{
  const app=await fixture(t),session=await app.login(),owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const article=randomUUID(),stamp='2026-10-20T00:00:00.000Z';
  await app.db.prepare('INSERT INTO matrix_articles(id,account_id,title,url,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
    .bind(article,'toutiao-haoduoyu','Older article','https://example.invalid/older',stamp,stamp,stamp).run();
  for(const asOf of ['2026-10-23T15:59:59.000Z','2026-10-23T16:00:00.000Z','2026-10-24T16:00:00.000Z'])
    await app.db.prepare('INSERT INTO matrix_observations(id,article_id,as_of,collected_at,kind,metrics_json,source,note,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .bind(randomUUID(),article,asOf,asOf,'latest','{"reads":0}','synthetic','',asOf).run();
  const snapshot=await readBusinessSnapshot(app.db,{date:'2026-10-24',ownerId:owner,accountIds:['toutiao-haoduoyu']});
  assert.equal(snapshot.observations.length,1);assert.equal(snapshot.articles.length,1);
  assert.equal(snapshot.observations[0].as_of,'2026-10-23T16:00:00.000Z');
  assert.deepEqual(snapshot.observations[0].metrics,{reads:0});
  assert.equal(snapshot.daily_metrics.length,0);
  assert.equal(emptySnapshot(snapshot),false);
  const empty=await readBusinessSnapshot(app.db,{date:'2026-10-01',ownerId:owner,accountIds:['toutiao-haoduoyu']});
  assert.equal(emptySnapshot(empty),true,'account/template framework does not manufacture dated content');
  for(const invalid of ['2026-02-30','0000-01-01','2026-1-01',undefined])assert.throws(()=>snapshotDate(invalid));
});
