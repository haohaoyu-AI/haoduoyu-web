import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleMemos} from '../src/memos.mjs';
import {digest,csrfFor} from '../src/security.mjs';

test('clear requires owner, protects the confirmed complete range, and prevents offline resurrection',async ()=>{
  const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
  for(const name of ['0000_lively_stellaris','0006_long_term_memos'])
    for(const stmt of readFileSync(new URL('../drizzle/'+name+'.sql',import.meta.url),'utf8').split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean))sql.exec(stmt);
  const db={prepare(text){let values=[];return {bind(...v){values=v;return this},async first(){return sql.prepare(text).get(...values)||null},async all(){return {results:sql.prepare(text).all(...values)}},async run(){return {meta:{changes:Number(sql.prepare(text).run(...values).changes)}}}}},async batch(statements){sql.exec('BEGIN');try{for(const s of statements)await s.run();sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}}};
  const owner=randomUUID(),token=randomBytes(32).toString('hex'),origin='http://localhost';
  sql.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(owner,'synthetic-owner','hash',new Date().toISOString());
  sql.prepare('INSERT INTO matrix_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(digest(token),owner,new Date(Date.now()+86400000).toISOString());
  sql.exec('INSERT INTO matrix_control(id,revision,initialized) VALUES(1,1,1)');
  const session={cookie:'matrix_session='+token,csrfToken:csrfFor(token)};
  const env={MEMOS_OWNER_ID:owner,PUBLIC_BUSINESS_MODE:'1'};
  async function call(route,method='GET',body,auth=true) {
    const h={'Content-Type':'application/json',Origin:origin,'X-Public-Business':'1'};
    if(auth) {h.Cookie=session.cookie;h['X-CSRF-Token']=session.csrfToken;}
    const req=new Request(origin+route,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});
    return (await (await handleMemos(db,req,route,env,origin)).json()).data;
  }
  const gid=randomUUID(),nid=randomUUID(),keepG=randomUUID(),keepN=randomUUID();
  const save=()=>randomUUID(), group=title=>({title,position:0,version:0,save_id:save()});
  const note=g=>({group_id:g,title:'Synthetic note',body:'Synthetic body',position:0,version:0,save_id:save()});
  await call('/memos/groups/'+gid,'PUT',group('Synthetic group'));
  const originalNote=note(gid);await call('/memos/notes/'+nid,'PUT',originalNote);
  await call('/memos/groups/'+keepG,'PUT',group('Keep'));
  await call('/memos/notes/'+keepN,'PUT',note(keepG));
  await call('/memos/groups/'+gid,'DELETE',{version:1,save_id:save(),confirm_title:'Synthetic group',confirm_note_count:1});
  const intent={groups:[{id:gid,version:2}],notes:[{id:nid,version:1}],save_id:save()};
  await assert.rejects(call('/memos/trash/clear','POST',intent,false),e=>e.status===403&&e.code==='MEMO_PURGE_LOGIN_REQUIRED');
  await assert.rejects(call('/memos/trash/clear','POST',{...intent,notes:[]}),e=>e.status===409&&e.code==='VERSION_CONFLICT');
  assert.equal((await call('/memos/notes/'+nid)).body,'Synthetic body');
  const result=await call('/memos/trash/clear','POST',intent);
  assert.deepEqual(result,{cleared:true,groups:1,notes:1});
  assert.deepEqual(await call('/memos/trash/clear','POST',intent),result);
  await assert.rejects(call('/memos/notes/'+nid,'PUT',originalNote),e=>e.status===409&&e.code==='MEMO_PERMANENTLY_DELETED');
  await assert.rejects(call('/memos/groups/'+gid,'PUT',group('Again')),e=>e.status===409&&e.code==='MEMO_PERMANENTLY_DELETED');
  assert.equal((await call('/memos/notes/'+keepN)).body,'Synthetic body');
});
