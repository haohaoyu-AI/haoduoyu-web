import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createMemoryDB,entityKey} from '../web/offline/db.mjs';
import {createNotesCache} from '../web/offline/notes.mjs';
import {createOfflineRuntime as b242Runtime} from './fixtures/b242-offline-runtime.mjs';
const owner='a'.repeat(64),date='2026-10-28',stamp='2026-10-28T01:00:00.000Z';
const path='/note-entries?category=life&date='+date;
function row() {return {id:randomUUID(),category:'life',date,text:'合成',version:1,change_seq:1,created_at:stamp,updated_at:stamp,
  deleted_at:null,deleted:false,can_edit:true,content_hash:'b'.repeat(64),labels_version:1,label:'兴趣'};}
const list=value=>({category:'life',date,can_edit:true,labels_version:1,entries:[value]});
const entities=db=>db.transaction(['entities'],'readonly',tx=>tx.getAll('entities'));
test('missing or invalid negotiated labels, identity and version fail before cache writes',async()=>{
  const db=createMemoryDB(),cache=createNotesCache({db,getScope:()=>owner,labelsV1:true}),base=row();
  for(const candidate of [(()=>{const v={...base};delete v.label;return v;})(),{...base,labels_version:2},
    {...base,id:'bad'},{...base,version:0},{...base,label:'工作'},{...base,category:'work',label:'兴趣'}]) {
    await assert.rejects(cache.write(path,null,list(candidate)));assert.deepEqual(await entities(db),[]);
  }
  await assert.rejects(cache.write(path,null,{...list(base),labels_version:undefined}));assert.deepEqual(await entities(db),[]);
});
test('label evidence and its server row commit together, preserve older versions, and reject contradictory same-version data',async()=>{
  const db=createMemoryDB(),cache=createNotesCache({db,getScope:()=>owner,labelsV1:true}),base=row();
  await cache.write(path,null,list(base));let stored=(await entities(db))[0];
  assert.deepEqual(stored.label_evidence,{version:1,category:'life',date,created_at:stamp,label:'兴趣'});
  await assert.rejects(cache.write(path,null,list({...base,label:'其他'})),e=>e.code==='OFFLINE_CACHE_CHANGED');
  assert.deepEqual((await entities(db))[0],stored);
  await cache.write(path,null,list({...base,version:2,change_seq:2,text:'新版'}));stored=(await entities(db))[0];
  assert.equal(stored.label_evidence.version,2);assert.equal(stored.label_evidence.label,'兴趣');
  await assert.rejects(cache.write(path,null,list(base)),e=>e.code==='OFFLINE_CACHE_CHANGED');
  assert.equal((await entities(db))[0].label_evidence.version,2);
});
test('scope change and transaction failure roll back label evidence and entity together',async()=>{
  for(const mode of ['scope','storage']) {
    const db=createMemoryDB();let scope=owner;
    const wrapper={transaction(stores,access,fn){return db.transaction(stores,access,async tx=>{
      const put=tx.put;tx.put=async(store,value)=>{await put(store,value);if(mode==='scope')scope='c'.repeat(64);
        else if(store==='meta')throw new Error('synthetic quota');};return fn(tx);
    });}};
    const cache=createNotesCache({db:wrapper,getScope:()=>scope,labelsV1:true});
    await assert.rejects(cache.write(path,null,list(row())));assert.deepEqual(await entities(db),[]);
  }
});
test('real b242 runtime may overwrite server fields but cannot erase the verified label evidence',async t=>{
  const db=createMemoryDB(),base=row(),cache=createNotesCache({db,getScope:()=>owner,labelsV1:true});
  await cache.write(path,null,list(base));
  const legacy={...base};delete legacy.labels_version;delete legacy.label;
  const old=b242Runtime({db,request:async requestPath=>{
    if(requestPath==='/auth/me')return {id:'synthetic',username:'Synthetic'};
    if(requestPath==='/workbench-snapshot/index')return {scope_id:owner,complete:true,projection:'current'};
    if(requestPath===path)return {category:'life',date,can_edit:true,entries:[legacy]};
    throw new Error('unexpected request');
  }});t.after(()=>old.stop());
  await old.call('/auth/me');await old.call(path);
  const stored=await db.transaction(['entities'],'readonly',tx=>tx.get('entities',entityKey(owner,'note-entry:'+base.id)));
  assert.equal(stored.server.label,undefined);assert.equal(stored.label_evidence.label,'兴趣');
  const projected=await cache.read(path);assert.equal(projected.data.entries[0].label,'兴趣');
  assert.equal(projected.data.entries[0].labels_version,1);
});

test('concurrent real b242 reads and new label-aware reads retain one authoritative proof',async t=>{
  const db=createMemoryDB(),base=row(),cache=createNotesCache({db,getScope:()=>owner,labelsV1:true});
  const legacy={...base};delete legacy.labels_version;delete legacy.label;
  const old=b242Runtime({db,request:async requestPath=>{
    if(requestPath==='/auth/me')return {id:'synthetic',username:'Synthetic'};
    if(requestPath==='/workbench-snapshot/index')return {scope_id:owner,complete:true,projection:'current'};
    if(requestPath===path)return {category:'life',date,can_edit:true,entries:[legacy]};
    throw new Error('unexpected request');
  }});t.after(()=>old.stop());await old.call('/auth/me');
  await Promise.all([old.call(path),cache.write(path,null,list(base))]);
  const saved=await db.transaction(['entities'],'readonly',tx=>tx.get('entities',entityKey(owner,'note-entry:'+base.id)));
  assert.deepEqual(saved.label_evidence,{version:1,category:'life',date,created_at:stamp,label:'兴趣'});
  assert.equal((await cache.read(path)).data.entries[0].label,'兴趣');
});
