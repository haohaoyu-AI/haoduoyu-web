import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createMemoryDB} from '../web/offline/db.mjs';
import {createDraftJournal} from '../web/offline/drafts.mjs';
const scope='a'.repeat(64), id=randomUUID();
const row=(text)=>({kind:'note_entry',id,category:'life',date:'2026-11-04',draft:text,labels:['生活'],dirty:true,phase:'dirty',version:1});
test('explicit deletion removes just the chosen snapshot, retaining identical and different copies',async()=>{
 const db=createMemoryDB(),a=createDraftJournal({db,getScope:()=>scope,draftOwner:'a'}),b=createDraftJournal({db,getScope:()=>scope,draftOwner:'b'}),c=createDraftJournal({db,getScope:()=>scope,draftOwner:'c'});
 await a.capture([row('same')]);await b.capture([row('same')]);await c.capture([row('different')]);
 const entries=await a.records('note_entry'), target=entries.find(x=>x.draft_owner==='a');
 await a.discardSelected(target);const left=await a.records('note_entry');assert.equal(left.length,2);assert.deepEqual(left.map(x=>x.data.draft).sort(),['different','same']);
});
test('changed snapshot and different account are never removed',async()=>{
 const db=createMemoryDB();let owner=scope;const journal=createDraftJournal({db,getScope:()=>owner,draftOwner:'a'});
 await journal.capture([row('old')]);const snap=(await journal.records('note_entry'))[0];await journal.capture([row('new')]);
 await assert.rejects(journal.discardSelected(snap));assert.equal((await journal.list('note_entry'))[0].draft,'new');
 const current=(await journal.records('note_entry'))[0];owner='b'.repeat(64);await assert.rejects(journal.discardSelected(current));
 owner=scope;assert.equal((await journal.list('note_entry'))[0].draft,'new');
});
