import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createMemoryDB} from '../web/offline/db.mjs';
import {createDraftJournal} from '../web/offline/drafts.mjs';
import {createNoteEntriesStore} from '../web/core/note-entries-state.mjs';
import {dailyNotesToday} from '../web/core/daily-notes-state.mjs';

const scope='a'.repeat(64), today=dailyNotesToday();
const previous=new Date(Date.parse(today+'T00:00:00Z')-86400000).toISOString().slice(0,10);
const row=id=>({kind:'note_entry',id,category:'life',date:today,draft:'synthetic draft',dirty:true,phase:'dirty'});
test('confirmed deletion clears only matching entry drafts across tabs and keeps other entries',async()=>{
 const db=createMemoryDB(), a=createDraftJournal({db,getScope:()=>scope,draftOwner:'a'}), b=createDraftJournal({db,getScope:()=>scope,draftOwner:'b'}), x=row(randomUUID()), y=row(randomUUID());
 await a.capture([x,y]); await b.capture([{...x,draft:'second tab'}, {...y,draft:'other second tab'}]);
 await a.capture([{...x,draft:'',dirty:false,phase:'saved',deleted:true}]);
 const retained=await a.list('note_entry'); assert.equal(retained.length,2); assert.ok(retained.every(v=>v.id===y.id));
});
test('only today can start; deletion of unsaved entry emits a targeted deletion marker',async()=>{
 const changes=[], store=createNoteEntriesStore({category:'life',manualSave:true,uuid:randomUUID,
  load:async date=>({category:'life',date,can_edit:true,entries:[]}), onChange:()=>changes.push([...store.entries.values()].map(x=>({...x}))) });
 await store.read(previous); assert.equal(store.start(previous),undefined);
 await store.read(today); const item=store.start(today); assert.ok(item); store.edit(item.id,'synthetic'); await store.deleteEntry(item.id);
 assert.equal(store.entry(item.id),undefined); assert.ok(changes.some(list=>list.some(x=>x.id===item.id&&x.deleted&&!x.dirty)));
});
