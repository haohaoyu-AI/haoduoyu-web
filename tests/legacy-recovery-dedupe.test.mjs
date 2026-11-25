import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryDB} from '../web/offline/db.mjs';
import {createDraftJournal} from '../web/offline/drafts.mjs';
import {createLegacyRecoveryGuard} from '../web/offline/retained-drafts.mjs';
test('restoring a legacy draft never creates an extra snapshot and deleting it does not recreate it',async()=>{
 const db=createMemoryDB(),scope='a'.repeat(64), original=createDraftJournal({db,getScope:()=>scope,draftOwner:'old'}),newTab=createDraftJournal({db,getScope:()=>scope,draftOwner:'new'});
 const row={kind:'legacy',category:'life',date:'2026-10-26',draft:'synthetic',dirty:true,phase:'error',pending:null,remote:null};
 await original.capture([row]);const guard=createLegacyRecoveryGuard(),item={...row};guard.remember(item);
 const capture=()=>newTab.capture(guard.unchanged(item)?[]:[{...item}]);
 await capture();await capture();assert.equal((await newTab.records('legacy')).length,1);
 const selected=(await newTab.records('legacy'))[0];await newTab.discardSelected(selected);await capture();assert.equal((await newTab.records('legacy')).length,0);
 item.draft='different synthetic work';await capture();assert.equal((await newTab.records('legacy')).length,1);
});
test('changed pending or remote evidence is not silently suppressed',()=>{
 const guard=createLegacyRecoveryGuard(),item={draft:'synthetic',pending:null,remote:null};guard.remember(item);
 assert.equal(guard.unchanged(item),true);item.pending={kind:'put'};assert.equal(guard.unchanged(item),false);
 item.pending=null;item.remote={version:2};assert.equal(guard.unchanged(item),false);
});
