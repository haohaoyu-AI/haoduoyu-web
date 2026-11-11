import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';
import {digest} from '../src/security.mjs';
import {handleNoteMonth,noteMonthQueries,noteMonthSources} from '../src/note-month.mjs';

async function setup(t) {
  const app=await fixture(t),session=await app.login();
  const owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const env={DB:app.db,SITE_ORIGIN:app.origin,DAILY_NOTES_OWNER_ID:owner,PUBLIC_BUSINESS_MODE:'1',PUBLIC_BUSINESS_USER_ID:owner,
    PUBLIC_BUSINESS_ACCOUNT_IDS:'["toutiao-haoduoyu"]'};
  async function call(path,{method='GET',headers={}}={}) {
    const response=await worker.fetch(new Request(app.origin+'/api/v1/note-entries/month'+path,{method,headers:{Origin:app.origin,...headers}}),env);
    return {status:response.status,...await response.json()};
  }
  return {...app,owner,call};
}
const time='2026-10-28T08:00:00.000Z';
test('month projects all four sources for the configured owner, preserving true timestamps and labels',async t=>{
  const app=await setup(t),other=randomUUID(),id=randomUUID(),otherId=randomUUID(),workId=randomUUID();
  await app.db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) SELECT ?,?,password_hash,created_at FROM matrix_users WHERE id=?')
    .bind(other,'synthetic-other-'+other,app.owner).run();
  const statements=[];
  for(const [table,owner,date,text] of [
    ['matrix_daily_notes',app.owner,'2026-10-02','旧生活'],['matrix_daily_work_notes',app.owner,'2026-10-02','旧工作'],
    ['matrix_daily_notes',app.owner,'2026-11-01','下月'],['matrix_daily_notes',other,'2026-10-02','其他用户'],
    ['matrix_daily_notes',app.owner,'2026-10-03','']])
    statements.push(app.db.prepare('INSERT INTO '+table+'(user_id,date,text,version,change_seq,created_at,updated_at) VALUES(?,?,?,1,1,?,?)').bind(owner,date,text,time,time));
  for(const [owner,entryId,category,date,text] of [[app.owner,id,'life','2026-10-02','带标签'],
    [app.owner,workId,'work','2026-10-31','新工作'],[other,otherId,'life','2026-10-02','其他正文']])
    statements.push(app.db.prepare('INSERT INTO matrix_note_entries(user_id,id,category,date,text,version,change_seq,created_at,updated_at) VALUES(?,?,?,?,?,1,1,?,?)')
      .bind(owner,entryId,category,date,text,time,time));
  statements.push(app.db.prepare('INSERT INTO matrix_note_labels(user_id,name,created_at) VALUES(?,?,?)').bind(app.owner,'兴趣',time));
  statements.push(app.db.prepare('INSERT INTO matrix_note_entry_labels(user_id,entry_id,label) VALUES(?,?,?)').bind(app.owner,id,'兴趣'));
  await app.db.batch(statements);
  const r=await app.call('?month=2026-10');
  assert.equal(r.status,200);assert.equal(r.data.complete,true);assert.equal(r.data.labels_version,1);
  assert.deepEqual(r.data.days.map(day=>day.date),['2026-10-02','2026-10-31']);
  const items=r.data.days.flatMap(day=>day.items);
  assert.equal(items.length,4);assert.ok(!JSON.stringify(items).includes('其他'));assert.ok(!JSON.stringify(items).includes('下月'));
  const legacy=items.find(item=>item.entity_id==='legacy-life:2026-10-02');
  assert.equal(legacy.text,'旧生活');assert.equal(legacy.created_at,null);assert.equal(legacy.updated_at,time);assert.equal(legacy.label,null);
  const tagged=items.find(item=>item.entity_id==='note-entry:'+id);
  assert.equal(tagged.text,'带标签');assert.equal(tagged.label,'兴趣');assert.equal(tagged.created_at,time);
  const work=items.find(item=>item.entity_id==='note-entry:'+workId);assert.equal(work.category,'work');assert.equal(work.label,null);
  assert.deepEqual((await app.call('?month=2026-09')).data.days,[]);
  for(const query of ['', '?month=2026-13','?month=0000-01','?month=2026-10&month=2026-11','?month=2026-10&owner='+other])
    assert.equal((await app.call(query)).status,400);
  assert.equal((await app.call('?month=2026-10',{method:'POST'})).status,405);
  const token=randomBytes(32).toString('hex');
  await app.db.prepare('INSERT INTO matrix_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)')
    .bind(digest(token),other,new Date(Date.now()+86400000).toISOString()).run();
  const foreign=await app.call('?month=2026-10',{headers:{Cookie:'matrix_session='+token}});
  assert.equal(foreign.status,200);assert.deepEqual(foreign.data,r.data);
});

test('month exceeds byte or row budget with explicit error, never partial success',async t=>{
  const app=await setup(t);
  await app.db.prepare('INSERT INTO matrix_daily_notes(user_id,date,text,version,change_seq,created_at,updated_at) VALUES(?,?,?,1,1,?,?)')
    .bind(app.owner,'2026-02-02','a'.repeat(1048577),time,time).run();
  const bytes=await app.call('?month=2026-02');assert.equal(bytes.status,413);assert.equal(bytes.error.code,'NOTES_MONTH_LIMIT');assert.equal(bytes.data,undefined);
  await app.db.prepare(`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<2001)
    INSERT INTO matrix_note_entries(user_id,id,category,date,text,version,change_seq,created_at,updated_at)
    SELECT ?,printf('00000000-0000-0000-0000-%012d',x),CASE WHEN x<=1001 THEN 'life' ELSE 'work' END,'2026-03-01','x',1,1,?,? FROM n`).bind(app.owner,time,time).run();
  const rows=await app.call('?month=2026-03');assert.equal(rows.status,413);assert.equal(rows.error.code,'NOTES_MONTH_LIMIT');assert.equal(rows.data,undefined);
  await app.db.prepare('DELETE FROM matrix_note_entries WHERE user_id=? AND id=?')
    .bind(app.owner,'00000000-0000-0000-0000-000000002001').run();
  const full=await app.call('?month=2026-03');assert.equal(full.status,200);assert.equal(full.data.complete,true);
  assert.equal(full.data.days[0].items.length,2000);
  assert.equal(full.data.days[0].items.filter(item=>item.category==='life').length,1001);
  assert.equal(full.data.days[0].items.filter(item=>item.category==='work').length,999);
});

test('month source statistics and row reads use bounded owner, category and date index ranges',async t=>{
  const app=await setup(t);
  for(const source of noteMonthSources)for(const sql of Object.values(noteMonthQueries(source))) {
    const args=[app.owner,...(source.legacy?[]:[source.category]),'2026-10-01','2026-10-31',2001];
    const plan=(await app.db.prepare('EXPLAIN QUERY PLAN '+sql).bind(...args).all()).results.map(row=>row.detail).join('\n');
    const index=source.legacy?'sqlite_autoindex_'+source.table+'_1':'matrix_note_entry_day';
    assert.ok(plan.includes('USING INDEX '+index),plan);
    assert.match(plan,/user_id=\?/);
    if(!source.legacy)assert.match(plan,/category=\?/);
    assert.match(plan,/date>\?/);assert.match(plan,/date<\?/);
  }
});

test('revision changes during month projection cause a full consistent retry',async t=>{
  const app=await setup(t),id=randomUUID();
  await app.db.prepare('INSERT INTO matrix_note_entries(user_id,id,category,date,text,version,change_seq,created_at,updated_at) VALUES(?,?,?,?,?,1,1,?,?)')
    .bind(app.owner,id,'life','2026-10-20','修改前',time,time).run();
  let injected=false,statistics=0;
  const db={prepare(sql) {
    const stmt=app.db.prepare(sql);
    function wrapped(statement) {return {
      bind:(...args)=>wrapped(statement.bind(...args)),
      all:(...args)=>statement.all(...args),
      async first(...args) {
        const value=await statement.first(...args);
        if(sql.includes('coalesce(sum(length(CAST(text AS BLOB)))')) {
          statistics++;
          if(!injected) {
            injected=true;
            await app.db.batch([
              app.db.prepare('UPDATE matrix_note_entries SET text=?,version=version+1 WHERE user_id=? AND id=?').bind('修改后',app.owner,id),
              app.db.prepare('UPDATE matrix_control SET revision=revision+1 WHERE id=1')
            ]);
          }
        }
        return value;
      }
    };}
    return wrapped(stmt);
  }};
  const response=await handleNoteMonth(db,new Request(app.origin+'/api/v1/note-entries/month?month=2026-10'),app.owner);
  assert.equal(response.status,200);const result=await response.json();
  assert.equal(result.data.days[0].items[0].text,'修改后');assert.ok(statistics>=5,'the four source statistics must be repeated after a revision change');
});
