import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {digest,csrfFor,stable} from '../../src/security.mjs';
import {handleTodos} from '../../src/todos.mjs';
import {handleMemos} from '../../src/memos.mjs';
import {handleNoteEntries} from '../../src/note-entries.mjs';
import {handleDailyNotes} from '../../src/daily-notes.mjs';
import {handleWorkbenchSnapshot} from '../../src/workbench-snapshot.mjs';

const ORIGIN='https://haoduoyu.invalid',DATE='2026-10-24',STAMP=DATE+'T01:02:03.000Z';
const OWNER='10000000-0000-4000-8000-000000000001',OTHER='20000000-0000-4000-8000-000000000002';
const TOKEN='a'.repeat(64),FOREIGN_TOKEN='b'.repeat(64);
const wireId=()=>randomUUID();
const expected=(status,code)=>error=>error.status===status&&(!code||error.code===code);

// Runs real handlers and real migrations against SQLite, with D1's atomic batch
// boundary. No HTTP listener, dependency installation, network or live records.
function fixture(t) {
  const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());
  for(const name of readdirSync(new URL('../../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())
    sqlite.exec(readFileSync(new URL('../../drizzle/'+name,import.meta.url),'utf8'));
  const insert=(table,row)=>{
    const keys=Object.keys(row);
    sqlite.prepare(`INSERT INTO matrix_${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...keys.map(k=>row[k]));
  };
  for(const [id,token]of [[OWNER,TOKEN],[OTHER,FOREIGN_TOKEN]]) {
    insert('users',{id,username:id,password_hash:'synthetic-not-a-password',created_at:STAMP});
    insert('sessions',{token_hash:digest(token),user_id:id,expires_at:'2099-01-01T00:00:00.000Z'});
  }
  insert('control',{id:1,initialized:1});
  insert('accounts',{id:'android-contract',name:'Contract',platform:'synthetic',created_at:STAMP});
  const prepare=(sql,args=[])=>({sql,args,
    bind(...next){return prepare(sql,next);},
    async all(){const results=sqlite.prepare(sql).all(...args);return {results,meta:{rows_read:results.length,rows_written:0}};},
    async first(column){const row=sqlite.prepare(sql).get(...args)??null;return column===undefined?row:row?.[column]??null;},
    async run(){const result=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:result.changes}};}
  });
  let batches=0,loseNextCommit=false;
  const db={prepare,
    async batch(statements){
      batches++;sqlite.exec('BEGIN');
      try {
        const results=[];
        for(const statement of statements)results.push(await statement.run());
        sqlite.exec('COMMIT');
        if(loseNextCommit){loseNextCommit=false;throw Error('synthetic response lost after durable commit');}
        return results;
      }catch(error){if(sqlite.isTransaction)sqlite.exec('ROLLBACK');throw error;}
    }
  };
  const env={SITE_ORIGIN:ORIGIN,PUBLIC_BUSINESS_MODE:'0',PUBLIC_BUSINESS_USER_ID:OWNER,
    PUBLIC_BUSINESS_ACCOUNT_IDS:'["android-contract"]',DAILY_NOTES_OWNER_ID:OWNER,MEMOS_OWNER_ID:OWNER};
  async function call(path,{method='GET',body,token=TOKEN,settings=env}={}) {
    const headers=new Headers({'Cookie':'matrix_session='+token});
    if(body!==undefined)headers.set('Content-Type','application/json');
    if(!['GET','HEAD'].includes(method)){headers.set('Origin',ORIGIN);headers.set('X-CSRF-Token',csrfFor(token));}
    const request=new Request(ORIGIN+'/api/v1'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
    const route=path.split('?')[0];let response;
    if(route.startsWith('/workbench-snapshot'))response=await handleWorkbenchSnapshot(db,request,route,settings);
    else if(route.startsWith('/note-entries'))response=await handleNoteEntries(db,request,route,settings,ORIGIN);
    else if(route.startsWith('/daily-notes'))response=await handleDailyNotes(db,request,route,settings,ORIGIN);
    else if(route.startsWith('/memos'))response=await handleMemos(db,request,route,settings,ORIGIN);
    else if(route.startsWith('/todos'))response=await handleTodos(db,request,route,ORIGIN);
    else throw Error('Unexpected fixture route');
    return {status:response.status,...await response.json()};
  }
  return {sqlite,db,insert,env,call,get batches(){return batches;},loseCommit(){loseNextCommit=true;}};
}
const noteBody=(text,version=0,category='life')=>({category,date:DATE,text,version,save_id:wireId()});
const groupBody=(version=0)=>({title:'Native offline',position:0,version,save_id:wireId()});
const memoBody=(group_id,body,version=0)=>({title:'Native memo',position:0,group_id,body,version,save_id:wireId()});

test('Android note wire contract recovers a durable lost acknowledgement and preserves later web edits',async t=>{
  const f=fixture(t),id=wireId(),body=noteBody('local draft committed once');
  f.loseCommit();
  await assert.rejects(f.call('/note-entries/'+id,{method:'PUT',body}),/response lost after durable commit/);
  assert.equal(f.batches,1,'transport failure must not cause an automatic unknown-result write retry');
  const receipt=(await f.call('/note-entries/operations/'+body.save_id)).data;
  assert.equal(receipt.found,true);assert.equal(receipt.id,id);assert.equal(receipt.version,1);
  const replay=(await f.call('/note-entries/'+id,{method:'PUT',body})).data;
  assert.equal(replay.version,1);assert.equal(f.batches,1,'exact save_id retry is a replay, not another mutation');
  await f.call('/note-entries/'+id,{method:'PUT',body:noteBody('newer website text',1)});
  await assert.rejects(f.call('/note-entries/'+id,{method:'PUT',body}),expected(409,'VERSION_CONFLICT'));
  assert.equal((await f.call('/note-entries/operations/'+body.save_id)).data.version,1,
    'operation receipt still proves the old operation even when current row is newer');
  assert.equal((await f.call('/note-entries/'+id)).data.text,'newer website text');
});

test('Android todo wire contract uses exact UUID creation, CAS completion and durable tombstones',async t=>{
  const f=fixture(t),id=wireId(),body={id,date:DATE,text:'native todo'};
  const create=await f.call('/todos',{method:'POST',body});assert.equal(create.status,201);assert.equal(create.data.version,1);
  assert.equal((await f.call('/todos',{method:'POST',body})).data.version,1);
  await assert.rejects(f.call('/todos',{method:'POST',body:{...body,text:'different'}}),expected(409,'IDEMPOTENCY_CONFLICT'));
  assert.equal((await f.call('/todos/'+id,{method:'PATCH',body:{completed:true,version:1}})).data.version,2);
  await assert.rejects(f.call('/todos/'+id,{method:'PATCH',body:{completed:true,version:1}}),expected(409,'VERSION_CONFLICT'));
  const observed=(await f.call('/todos?date='+DATE)).data.items.find(row=>row.id===id);
  assert.equal(observed.version,2);assert.equal(observed.completed,true);
  const deletion={date:DATE,version:2};
  const removed=(await f.call('/todos/'+id,{method:'DELETE',body:deletion})).data;
  assert.equal(removed.version,3);assert.ok(removed.deleted_at);
  assert.equal((await f.call('/todos/'+id,{method:'DELETE',body:deletion})).data.version,3);
  await assert.rejects(f.call('/todos',{method:'POST',body}),expected(410,'TODO_DELETED'));
  const manifest=(await f.call('/workbench-snapshot/index')).data;
  assert.ok(manifest.entities.find(row=>row.entity_id==='todo:'+id).deleted_at);
});

test('Android snapshot contract carries tombstones whose content changes without child version changes',async t=>{
  const f=fixture(t),gid=wireId(),nid=wireId();
  await f.call('/memos/groups/'+gid,{method:'PUT',body:groupBody()});
  const firstBody=memoBody(gid,'memo survives local conflict archive');
  await f.call('/memos/notes/'+nid,{method:'PUT',body:firstBody});
  const first=(await f.call('/workbench-snapshot?date='+DATE)).data;
  const firstChild=first.data.memos.find(row=>row.source_id===nid);
  assert.equal(firstChild.version,1);assert.equal(firstChild.deleted_at,null);
  await f.call('/memos/groups/'+gid,{method:'DELETE',body:{version:1,save_id:wireId(),confirm_title:'Native offline',confirm_note_count:1}});
  const removed=(await f.call('/workbench-snapshot?date='+DATE)).data;
  const child=removed.data.memos.find(row=>row.source_id===nid);
  assert.equal(child.version,1,'parent deletion does not increment child source version');
  assert.ok(child.deleted_at);assert.notEqual(child.content_hash,firstChild.content_hash);
  assert.equal(Object.hasOwn(child,'body'),false);assert.equal(child.group_id,gid);
  await assert.rejects(f.call('/memos/notes/'+nid,{method:'PUT',body:memoBody(gid,'offline late write',1)}),expected(409,'MEMO_GROUP_UNAVAILABLE'));
  await f.call('/memos/groups/'+gid+'/restore',{method:'POST',body:{version:2,save_id:wireId()}});
  const restored=(await f.call('/workbench-snapshot?date='+DATE)).data.data.memos.find(row=>row.source_id===nid);
  assert.equal(restored.version,1);assert.equal(restored.body,firstBody.body);
  assert.equal(restored.content_hash,firstChild.content_hash);
});

test('Android scope binding cannot infer write permission or merge legacy notes with UUID entries',async t=>{
  const f=fixture(t),id=wireId();
  await f.call('/daily-notes/'+DATE+'?category=life',{method:'PUT',body:{text:'legacy entry',version:0,save_id:wireId()}});
  const text='same day / Unicode 中文 🐟 \u2028 next\nline';
  await f.call('/note-entries/'+id,{method:'PUT',body:noteBody(text)});
  const index=(await f.call('/workbench-snapshot/index')).data;
  const daily=(await f.call('/workbench-snapshot?date='+DATE)).data;
  assert.equal(daily.complete,true);assert.equal(daily.snapshot_format,'haoduoyu-workbench-snapshot-v1');
  assert.deepEqual(daily.entities,index.entities);assert.equal(daily.manifest_hash,index.manifest_hash);
  assert.equal(daily.date_content_hash,index.dates.find(row=>row.date===DATE).content_hash);
  assert.deepEqual(new Set(daily.data.life_notes.map(row=>row.entity_id)),new Set(['legacy-life:'+DATE,'note-entry:'+id]));
  const row=daily.data.life_notes.find(row=>row.source_id===id),unsigned={...row};delete unsigned.content_hash;
  assert.equal(row.content_hash,digest(JSON.stringify(stable(unsigned))));
  await assert.rejects(f.call('/workbench-snapshot/index',{token:FOREIGN_TOKEN}),expected(403,'FORBIDDEN'));
  const changedEnv={...f.env,DAILY_NOTES_OWNER_ID:OTHER,MEMOS_OWNER_ID:OTHER};
  const changed=(await f.call('/workbench-snapshot/index',{settings:changedEnv})).data;
  assert.notEqual(changed.scope_id,index.scope_id,'same business login with changed note ownership is a new source scope');
  await assert.rejects(f.call('/note-entries/'+id,{settings:changedEnv}),expected(404,'NOT_FOUND'));
  await assert.rejects(f.call('/note-entries/'+wireId(),{method:'PUT',body:noteBody('wrong owner'),settings:changedEnv}),expected(403,'FORBIDDEN'));
  if(process.env.WRITE_ANDROID_CONTRACT_FIXTURE==='1') {
    const output=new URL('../app/src/test/resources/workbench-contract.json',import.meta.url);
    mkdirSync(new URL('.',output),{recursive:true});
    writeFileSync(output,JSON.stringify({index,daily},null,2)+'\n');
  }
});
