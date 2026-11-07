import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';
import {createMemoryDB} from '../web/offline/db.mjs';
import {createOfflineRuntime} from '../web/offline/runtime.mjs';
import {beijingDay} from '../src/lib/time.mjs';

async function setup(t) {
  const app=await fixture(t,{migrationCount:9}),session=await app.login();
  for(const name of ['0009_unscheduled_todos.sql','0010_note_labels.sql']) {
    const sql=await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8');
    await app.db.batch(sql.split('--> statement-breakpoint').map(s=>app.db.prepare(s.trim())));
  }
  const owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const env={DB:app.db,SITE_ORIGIN:app.origin,PUBLIC_BUSINESS_MODE:'0',PUBLIC_BUSINESS_USER_ID:owner,
    PUBLIC_BUSINESS_ACCOUNT_IDS:'[]',DAILY_NOTES_OWNER_ID:owner,MEMOS_OWNER_ID:owner};
  const db=createMemoryDB(),calls=[],state={online:true,lost:false,time:Date.now()};
  const request=async(path,opts={})=>{
    if(!state.online)throw Object.assign(new Error('offline'),{code:'NETWORK_UNAVAILABLE'});
    const method=opts.method||'GET',headers={Cookie:session.cookie,'X-CSRF-Token':session.csrfToken,Origin:app.origin,...opts.headers};
    if(opts.body!==undefined)headers['Content-Type']='application/json';
    calls.push({path,method,body:structuredClone(opts.body)});
    const response=await worker.fetch(new Request(app.origin+'/api/v1'+path,{method,headers,
      ...(opts.body!==undefined?{body:JSON.stringify(opts.body)}:{})}),env);
    const value=await response.json();
    if(!response.ok)throw Object.assign(new Error(value.error.message),{status:response.status,code:value.error.code});
    if(state.lost&&method==='PUT'&&path.startsWith('/note-entries/')) {
      state.lost=false;throw Object.assign(new Error('response lost'),{code:'NETWORK_UNAVAILABLE'});
    }
    return value.data;
  };
  const runtime=createOfflineRuntime({db,request,now:()=>state.time,online:()=>state.online});
  t.after(()=>runtime.stop());await runtime.call('/auth/me');
  const date=beijingDay(state.time);await runtime.call('/note-entries?category=life&date='+date);
  return {app,runtime,request,state,calls,date};
}
test('real Worker labelled create survives offline and a lost acknowledgement without duplicate writes',async t=>{
  const f=await setup(t),id=randomUUID(),save_id=randomUUID(),path='/note-entries/'+id;
  f.state.online=false;const local=await f.runtime.call(path,{method:'PUT',body:{category:'life',date:f.date,text:'合成离线记录',version:0,save_id,label:'兴趣'}});
  assert.equal(local.label,'兴趣');assert.equal(local.content_hash,undefined);
  f.state.online=true;f.state.lost=true;await f.runtime.sync();
  assert.equal((await f.runtime.queue()).operations[0].status,'unknown');f.state.time+=10000;await f.runtime.sync();
  assert.equal((await f.runtime.queue()).operations.length,0);
  const remote=await f.request(path,{headers:{'X-Note-Labels-Version':'1'}});
  assert.equal(remote.label,'兴趣');assert.equal(remote.labels_version,1);assert.equal(remote.version,1);
  assert.equal(f.calls.filter(c=>c.path===path&&c.method==='PUT').length,1);
  assert.equal(f.calls.filter(c=>c.path==='/note-entries/operations/'+save_id).length,1);
});

test('real Worker labeled conflict saves both versions with a fresh UUID and retains the label',async t=>{
  const f=await setup(t),id=randomUUID(),path='/note-entries/'+id,headers={'X-Note-Labels-Version':'1'};
  await f.request(path,{method:'PUT',headers,body:{category:'life',date:f.date,text:'原文',version:0,save_id:randomUUID(),label:'兴趣'}});
  await f.runtime.call('/note-entries?category=life&date='+f.date);f.state.online=false;
  await f.runtime.call(path,{method:'PUT',body:{category:'life',date:f.date,text:'本机编辑',version:1,save_id:randomUUID()}});
  f.state.online=true;await f.request(path,{method:'PUT',headers,body:{category:'life',date:f.date,text:'线上编辑',version:1,save_id:randomUUID()}});
  await f.runtime.sync();const conflict=(await f.runtime.queue()).conflicts[0];assert.ok(conflict);
  const result=await f.runtime.resolve(conflict.key,'keep-both',{copyConfirmed:true});
  const copy=(await f.runtime.queue()).operations.find(x=>x.resolution_id===result.resolution.id);
  assert.equal(copy.protocol,5);assert.equal(copy.body.label,'兴趣');assert.notEqual(copy.source_id,id);
  await f.runtime.sync();const original=await f.request(path,{headers}),cloned=await f.request('/note-entries/'+copy.source_id,{headers});
  assert.equal(original.text,'线上编辑');assert.equal(cloned.text,'本机编辑');assert.equal(cloned.label,'兴趣');
});
