import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createMemoryDB, entityKey} from '../web/offline/db.mjs';
import {createNoteLabelMeta} from '../web/offline/note-label-meta.mjs';
import {createOfflineRuntime} from '../web/offline/runtime.mjs';

const scope = 'a'.repeat(64), otherScope = 'b'.repeat(64), date = '2026-10-28';
const note = () => ({id:randomUUID(),category:'life',date,text:'合成内容',version:1,change_seq:1,
  deleted:false,deleted_at:null,can_edit:true,created_at:'2026-10-28T01:00:00Z',
  updated_at:'2026-10-28T01:00:00Z',content_hash:'c'.repeat(64)});
const verified = (row,label) => ({...row,labels_version:1,label});

test('the real b242 runtime can overwrite an old projection without erasing independently confirmed label evidence', async t => {
  const db = createMemoryDB(), row = note(), labelMeta = createNoteLabelMeta({db,getScope:()=>scope});
  const path = '/note-entries?category=life&date=' + date;
  const request = async p => {
    if (p === '/auth/me') return {id:'synthetic',username:'synthetic'};
    if (p === '/workbench-snapshot/index') return {scope_id:scope,complete:true,projection:'current'};
    if (p === path) return {category:'life',date,can_edit:true,entries:[row]};
    throw new Error('unexpected request '+p);
  };
  const old = createOfflineRuntime({db,request,online:()=>true}); t.after(()=>old.stop());
  await old.call('/auth/me');
  const [response] = await Promise.all([old.call(path),labelMeta.confirm(verified(row,'兴趣'))]);
  assert.equal(response.entries[0].label,undefined);
  const entity = await db.transaction(['entities'],'readonly',tx=>tx.get('entities',entityKey(scope,'note-entry:'+row.id)));
  assert.equal(entity.server.label,undefined);
  assert.deepEqual(await labelMeta.lookup(entity.server),{known:true,label:'兴趣',display:'兴趣'});
  assert.deepEqual(await labelMeta.lookup({...entity.server,version:2}),{known:false});
  assert.deepEqual(await labelMeta.lookup(entity.server),{known:true,label:'兴趣',display:'兴趣'});
});

test('only explicit live-protocol label evidence can confirm a category and versions cannot regress', async () => {
  const db=createMemoryDB(), row=note(), registry=createNoteLabelMeta({db,getScope:()=>scope});
  assert.deepEqual(await registry.lookup(row),{known:false});
  await assert.rejects(registry.confirm(row),e=>e.code==='OFFLINE_NOTE_LABEL_UNKNOWN');
  await assert.rejects(registry.confirm({...row,label:null}),e=>e.code==='OFFLINE_NOTE_LABEL_UNKNOWN');
  await assert.rejects(registry.confirm({...verified(row,'兴趣'),content_hash:undefined}),e=>e.code==='OFFLINE_NOTE_LABEL_UNKNOWN');
  await assert.rejects(registry.confirm({...verified(row,'兴趣'),date:'2026-02-30'}),e=>e.code==='OFFLINE_NOTE_LABEL_UNKNOWN');
  await registry.confirm(verified(row,null));
  assert.deepEqual(await registry.lookup(row),{known:true,label:null,display:'生活'});
  await assert.rejects(registry.confirm(verified(row,'兴趣')),e=>e.code==='OFFLINE_NOTE_LABEL_UNKNOWN');
  await registry.confirm(verified({...row,version:2},'兴趣'));
  await assert.rejects(registry.confirm(verified(row,null)),e=>e.code==='OFFLINE_NOTE_LABEL_UNKNOWN');
  assert.deepEqual(await registry.lookup(row),{known:false});
  assert.deepEqual(await registry.lookup({...row,version:2}),{known:true,label:'兴趣',display:'兴趣'});
  await assert.rejects(registry.confirm(verified({...row,version:3,category:'work'},'兴趣')),e=>e.code==='OFFLINE_NOTE_LABEL_UNKNOWN');
});

test('identity and scope mismatches fail closed and transactional failure retains prior metadata', async () => {
  const db=createMemoryDB(), row=note(), registry=createNoteLabelMeta({db,getScope:()=>scope});
  await registry.confirm(verified(row,'兴趣'));
  const other=createNoteLabelMeta({db,getScope:()=>otherScope});
  assert.deepEqual(await other.lookup(row),{known:false});
  assert.deepEqual(await registry.lookup({...row,created_at:'2026-10-28T02:00:00Z'}),{known:false});
  assert.deepEqual(await registry.lookup({...row,category:'work'}),{known:false});
  await assert.rejects(db.transaction(['meta'],'readwrite',async tx=>{
    const owner=registry.capture();await registry.confirmInTransaction(tx,verified({...row,version:2},null),owner);
    throw new Error('synthetic transaction abort');
  }),/synthetic transaction abort/);
  assert.deepEqual(await registry.lookup(row),{known:true,label:'兴趣',display:'兴趣'});
});

test('changing scope inside a transaction aborts instead of leaking or saving evidence', async () => {
  const db=createMemoryDB(), row=note(); let current=scope;
  const registry=createNoteLabelMeta({db,getScope:()=>current});
  await assert.rejects(db.transaction(['meta'],'readwrite',async tx=>{
    const owner=registry.capture();current=otherScope;
    await registry.confirmInTransaction(tx,verified(row,'兴趣'),owner);
  }),e=>e.code==='OFFLINE_NOTE_LABEL_UNKNOWN');
  current=scope;assert.deepEqual(await registry.lookup(row),{known:false});
});
