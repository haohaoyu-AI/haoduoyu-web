import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryDB} from '../web/offline/db.mjs';
import {createOfflineRuntime} from '../web/offline/runtime.mjs';
import {projectWorkbenchSnapshot} from '../src/workbench-snapshot.mjs';
import {snapshotBudget} from '../src/snapshot-budget.mjs';

const scope='d'.repeat(64);
const empty=version=>Object.fromEntries(['todos','life_notes','work_notes','work_reminders','memo_groups','memos',
  ...(version===2?['unscheduled_todos','note_labels']:[])].map(key=>[key,[]]));
function projected(path,scope_id) {
  const url=new URL(path,'http://x'),version=url.searchParams.get('version')==='2'?2:1;
  return projectWorkbenchSnapshot(empty(version),{scope_id,generated_at:'2026-11-13T01:00:00Z',
    date:url.searchParams.get('date'),...(version===2?{version}:{})},snapshotBudget());
}
function setup(t,{scopeRoute=true,reuse=30000,selected=()=>scope}={}) {
  const clock={now:1000},calls=[];
  const app=createOfflineRuntime({db:createMemoryDB(),now:()=>clock.now,online:()=>true,scopeProbe:true,scopeReuseMs:reuse,
    request:async (path)=>{
      calls.push(path);
      if(path==='/auth/me')return {id:'public',username:'public',publicBusiness:true};
      if(path==='/workbench-snapshot/scope'&&!scopeRoute)throw Object.assign(new Error('not found'),{status:404});
      if(path==='/workbench-snapshot/scope')return {scope_id:selected(),complete:true,projection:'current'};
      if(path.startsWith('/workbench-snapshot'))return projected(path,selected());
      if(path==='/accounts')return [];
      throw new Error('unexpected '+path);
    }});
  t.after(()=>app.stop());
  const probes=()=>calls.filter(path=>path.startsWith('/workbench-snapshot')).length;
  return {app,clock,calls,probes};
}

test('the production runtime checks scope with the small endpoint and reuses it for 30 seconds',async t=>{
  const {app,clock,calls,probes}=setup(t);
  await app.call('/auth/me');
  assert.ok(calls.includes('/workbench-snapshot/scope'));assert.ok(!calls.includes('/workbench-snapshot/index'));
  const afterLogin=probes();
  await app.call('/accounts');clock.now+=10000;await app.call('/accounts');
  assert.equal(probes(),afterLogin,'reads within 30s reuse the fresh scope check');
  clock.now+=25000;await app.call('/accounts');
  assert.equal(probes(),afterLogin+1,'a stale check is repeated before the read');
});

test('invalidation and a changed scope are never covered by reuse',async t=>{
  let current=scope;const {app,clock,probes}=setup(t,{selected:()=>current});
  await app.call('/auth/me');await app.call('/accounts');
  await app.invalidate();const before=probes();
  await app.call('/auth/me');assert.ok(probes()>before,'sign-out forces a new scope check');
  current='e'.repeat(64);clock.now+=31000;
  await assert.rejects(app.call('/accounts'),error=>error.code==='OFFLINE_SCOPE_CHANGED','a server-side change is caught once the window ends');
});

test('a server without the scope endpoint falls back to the full index',async t=>{
  const {app,calls}=setup(t,{scopeRoute:false});
  await app.call('/auth/me');await app.call('/accounts');
  assert.ok(calls.includes('/workbench-snapshot/index'));
});

test('runtimes without the option keep checking the index every time',async t=>{
  const {app,clock,calls}=setup(t,{reuse:0});
  await app.call('/auth/me');const before=calls.length;
  await app.call('/accounts');clock.now+=1000;await app.call('/accounts');
  assert.equal(calls.slice(before).filter(path=>path.startsWith('/workbench-snapshot')).length,2);
});

test('a queued save right after a check does not sign in again before sending',async t=>{
  const {app,clock,calls}=setup(t);
  await app.call('/auth/me');const before=calls.length;
  await app.sync();
  assert.equal(calls.slice(before).filter(path=>path==='/auth/me').length,0,'recent check reused by sync');
  clock.now+=31000;await app.sync();
  assert.ok(calls.slice(before).includes('/auth/me'),'an older check is redone in full');
});

test('quick saves share one full refresh; a later sync refreshes again',async t=>{
  const {app,clock,calls}=setup(t);
  await app.call('/auth/me');
  const pulls=()=>calls.filter(path=>path.startsWith('/workbench-snapshot/index')).length;
  await app.sync();const first=pulls();assert.ok(first>=1,'first sync refreshes');assert.equal(app.state.error,null);
  clock.now+=5000;await app.sync();assert.equal(pulls(),first,'a sync moments later skips the full refresh');
  clock.now+=31000;await app.sync();assert.ok(pulls()>first,'the refresh resumes after the window');
  await app.invalidate();await app.call('/auth/me');const after=pulls();await app.sync();
  assert.ok(pulls()>after,'a new sign-in always refreshes');
});
