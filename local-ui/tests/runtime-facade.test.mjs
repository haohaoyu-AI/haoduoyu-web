import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryDB} from '../frontend/web/offline/db.mjs';
import {createStandaloneRuntime} from '../frontend/web/local/runtime.mjs';
import {LOCAL_SCOPE,LOCAL_OWNER_ID} from '../frontend/web/local/api.mjs';
const id='11111111-1111-4111-8111-111111111111';

test('local identity and readiness need no server, queue or online grant',async()=>{
  const runtime=createStandaloneRuntime({db:createMemoryDB()});
  const me=await runtime.call('/auth/me');
  assert.equal(me.id,LOCAL_OWNER_ID); assert.equal(me.localOnly,true);
  assert.equal(runtime.state.scope,LOCAL_SCOPE);
  assert.equal(runtime.state.localOnly,true);
  assert.deepEqual(await runtime.queue(),{operations:[],conflicts:[]});
  assert.equal((await runtime.sync()).phase,'local');
  assert.equal(typeof runtime.start(),'function');
});
test('synthetic draft persists across facade recreation in original durable journal',async()=>{
  const db=createMemoryDB(), first=createStandaloneRuntime({db});
  await first.retainDrafts([{kind:'note_entry',id,category:'life',date:'2026-11-08',draft:'草稿原文\n第二行',
    version:0,dirty:true,phase:'dirty',labels:[],labelKnown:true}]);
  await first.flushDrafts();
  const second=createStandaloneRuntime({db});
  assert.equal((await second.retainedDrafts('note_entry'))[0].draft,'草稿原文\n第二行');
  assert.equal((await second.retainedDraftRecords('note_entry'))[0].scope,LOCAL_SCOPE);
});
test('cancelled work is rejected before any local transaction',async()=>{
  const db=createMemoryDB(), runtime=createStandaloneRuntime({db});
  const controller=new AbortController();controller.abort();
  await assert.rejects(runtime.call('/todos',{method:'POST',body:{id,date:'2026-11-08',text:'must not save'},signal:controller.signal}),{name:'AbortError'});
  assert.equal((await runtime.call('/todos?date=2026-11-08')).items.length,0);
});
test('legacy remote/admin path fails closed, never fetches or claims a save',async()=>{
  const runtime=createStandaloneRuntime({db:createMemoryDB()});
  const old=globalThis.fetch; let attempts=0;
  globalThis.fetch=()=>{attempts++;throw new Error('unexpectednetwork');};
  try {
    await assert.rejects(runtime.call('/auth/login',{method:'POST',body:{username:'synthetic',password:'never transmit'}}));
    await assert.rejects(runtime.call('/unknown'));
    assert.equal(attempts,0);
  } finally {globalThis.fetch=old;}
});
