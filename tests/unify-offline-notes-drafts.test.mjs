import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createMemoryDB} from '../web/offline/db.mjs';
import {createDraftJournal} from '../web/offline/drafts.mjs';
import {createEntryRecoveryGuard} from '../web/offline/retained-drafts.mjs';
import {createNoteEntriesStore} from '../web/core/note-entries-state.mjs';

const scope = 'a'.repeat(64), date = '2026-10-26';
const draft = (kind = 'note_entry') => ({kind, id: randomUUID(), category: 'work', date, draft: '中文合成中',
  version: 0, serverText: '', contentHash: '', dirty: true, phase: 'dirty', pending: null});
test('unchanged recovered drafts do not multiply across tabs but edits and lost source remain safe',async()=>{
  const db=createMemoryDB(), original=createDraftJournal({db,getScope:()=>scope,draftOwner:'original'});
  const row={...draft(),labels:['工作'],labelKnown:true};await original.capture([row]);
  const source=(await original.records('note_entry'))[0];
  for(const owner of ['second','third','fourth']) {
    const journal=createDraftJournal({db,getScope:()=>scope,draftOwner:owner});
    const item={...source.data,phase:'error'},guard=createEntryRecoveryGuard(['draft','labels','version','pending','phase']);
    guard.remember(item,source);
    await journal.capture([{...item,recoveryProof:guard.proof(item)}]);
  }
  assert.equal((await original.records('note_entry')).length,1);
  const changed=createDraftJournal({db,getScope:()=>scope,draftOwner:'edited'}),item={...source.data,phase:'error'};
  const guard=createEntryRecoveryGuard(['draft','labels','version','pending','phase']);guard.remember(item,source);
  item.draft='用户在新标签编辑后的内容';assert.equal(guard.proof(item),null);
  await changed.capture([item]);assert.equal((await original.records('note_entry')).length,2);
  assert.ok((await original.list('note_entry')).some(value=>value.draft===row.draft));
  const lost=createDraftJournal({db,getScope:()=>scope,draftOwner:'source-lost'}),restored={...source.data,phase:'error'};
  const lostGuard=createEntryRecoveryGuard(['draft','labels','version','pending','phase']);lostGuard.remember(restored,source);
  await db.transaction(['meta'],'readwrite',tx=>tx.delete('meta',source.key));
  await lost.capture([{...restored,recoveryProof:lostGuard.proof(restored)}]);
  assert.ok((await lost.list('note_entry')).some(value=>value.draft===row.draft));
  assert.deepEqual(await db.transaction(['outbox'],'readonly',tx=>tx.getAll('outbox')),[]);
});
test('recovery proof cannot suppress a changed source or a different pending operation',async()=>{
  const db=createMemoryDB(),one=createDraftJournal({db,getScope:()=>scope,draftOwner:'one'}),two=createDraftJournal({db,getScope:()=>scope,draftOwner:'two'});
  const row={...draft(),labels:['工作']};await one.capture([row]);const source=(await one.records('note_entry'))[0];
  await one.capture([{...row,draft:'原来源后来发生了变化'}]);
  await two.capture([{...row,recoveryProof:{key:source.key,write_id:source.write_id}}]);
  assert.deepEqual(new Set((await two.list('note_entry')).map(value=>value.draft)),new Set([row.draft,'原来源后来发生了变化']));
  const three=createDraftJournal({db,getScope:()=>scope,draftOwner:'three'}),fresh=(await two.records('note_entry')).find(x=>x.data.draft===row.draft);
  const pending={kind:'put',version:0,text:row.draft,saveId:randomUUID(),uncertain:true};
  await three.capture([{...row,pending,recoveryProof:{key:fresh.key,write_id:fresh.write_id}}]);
  assert.ok((await three.list('note_entry')).some(value=>value.pending?.saveId===pending.saveId));
});
test('restoring an unchanged pending operation and older baseline does not add another copy',async()=>{
  const db=createMemoryDB(),one=createDraftJournal({db,getScope:()=>scope,draftOwner:'one'}),two=createDraftJournal({db,getScope:()=>scope,draftOwner:'two'});
  const row={...draft(),category:'life',labels:['生活'],labelKnown:true,version:3,serverText:'旧版',contentHash:'hash',phase:'unknown',
    pending:{kind:'put',version:3,saveId:randomUUID(),text:'中文合成中'}};
  await one.capture([row]);const source=(await one.records('note_entry'))[0];
  const store=createNoteEntriesStore({category:'life',manualSave:true,multiLabels:true});
  const item=store.restoreDraft(row),guard=createEntryRecoveryGuard(['draft','labels','version','pending','phase','recoveredBaseline']);
  guard.remember(item,source);await two.capture([{...item,kind:'note_entry',recoveryProof:guard.proof(item)}]);
  assert.equal((await one.records('note_entry')).length,1);
  assert.deepEqual((await one.records('note_entry'))[0].data,row);
  assert.equal(item.pending.saveId,row.pending.saveId);
});
test('composition draft persistence stores no outbox operation and survives a new journal instance in its original date/category', async () => {
  const db = createMemoryDB(), row = draft();
  const create = () => createDraftJournal({db, getScope: () => scope, getGeneration: () => 0});
  await create().capture([row]); assert.deepEqual(await create().list('note_entry'), [row]);
  assert.deepEqual(await db.transaction(['outbox'], 'readonly', tx => tx.getAll('outbox')), []);
  assert.deepEqual(await createDraftJournal({db, getScope: () => 'b'.repeat(64)}).list('note_entry'), []);
});
test('durably queued notes may retire their input journal while an unresolved legacy draft is never silently cleared', async () => {
  const db = createMemoryDB(), journal = createDraftJournal({db, getScope: () => scope, getGeneration: () => 0});
  const note = draft(), legacy = draft('legacy'); await journal.capture([note, legacy]);
  await journal.capture([{...note, dirty: false, phase: 'queued'}, {...legacy, dirty: false, phase: 'saved'}]);
  assert.deepEqual(await journal.list('note_entry'), []); assert.deepEqual(await journal.list('legacy'), [legacy]);
});
test('unknown original attempts retain the same payload/save id and cannot persist runtime credentials', async () => {
  const db = createMemoryDB(), journal = createDraftJournal({db, getScope: () => scope, getGeneration: () => 0});
  const row = {...draft(), phase: 'unknown', pending: {kind: 'put', version: 0, text: '原提交', saveId: randomUUID(), uncertain: true}};
  await journal.capture([row]); assert.deepEqual((await journal.list('note_entry'))[0].pending, row.pending);
  await assert.rejects(journal.capture([{...row, pending: {...row.pending, csrfToken: 'must-not-store'}}]), /Credentials/);
  assert.equal((await journal.list('note_entry'))[0].pending.saveId, row.pending.saveId);
});
test('scope changes during a journal transaction abort the whole capture rather than binding old text to a new identity', async () => {
  const base = createMemoryDB(); let owner = scope;
  const db = {transaction: (stores, mode, callback) => base.transaction(stores, mode, async tx => {
    const result = await callback({...tx, put: async (...args) => { await tx.put(...args); owner = 'b'.repeat(64); }});
    return result;
  })};
  const journal = createDraftJournal({db, getScope: () => owner, getGeneration: () => 0});
  await assert.rejects(journal.capture([draft()]), error => error.code === 'OFFLINE_SCOPE_CHANGED');
  assert.deepEqual(await base.transaction(['meta'], 'readonly', tx => tx.getAll('meta')), []);
});
test('two tabs retain independent unsubmitted drafts of the same entry and cleaning one never deletes the other text', async () => {
  const db = createMemoryDB(), one = createDraftJournal({db, getScope: () => scope, draftOwner: 'one'});
  const two = createDraftJournal({db, getScope: () => scope, draftOwner: 'two'}), row = draft();
  await one.capture([row]); await two.capture([{...row, draft: '第二页独立的中文稿'}]);
  assert.equal((await one.list('note_entry')).length, 2);
  await one.capture([{...row, dirty: false, phase: 'queued'}]);
  assert.equal((await two.list('note_entry'))[0].draft, '第二页独立的中文稿');
});
test('flush waits for the actual in-flight local transaction and propagates a failed write without a network attempt', async () => {
  const base = createMemoryDB(); let release;
  const gate = new Promise(resolve => { release = resolve; });
  const journal = createDraftJournal({db: {transaction: async (...args) => { await gate; return base.transaction(...args); }},
    getScope: () => scope});
  let finished = false; const write = journal.capture([draft()]); const flush = journal.flush().then(() => { finished = true; });
  await Promise.resolve(); assert.equal(finished, false); release(); await write; await flush; assert.equal(finished, true);
  const broken = createDraftJournal({db: {transaction: async () => { throw new Error('synthetic quota failure'); }}, getScope: () => scope});
  const failed = broken.capture([draft()]); failed.catch(() => {});
  await assert.rejects(broken.flush(), /quota/);
});

test('unsubmitted custom label and original uncertain request survive journal restoration', async () => {
  const db = createMemoryDB(), row = {...draft(), category:'life', label:'兴趣', phase:'unknown',
    pending:{kind:'put',version:0,text:'原内容',label:'兴趣',saveId:randomUUID(),uncertain:true}};
  const journal = () => createDraftJournal({db, getScope: () => scope});
  await journal().capture([row]); const restored = (await journal().list('note_entry'))[0];
  assert.equal(restored.label,'兴趣'); assert.equal(restored.pending.label,'兴趣');
  assert.equal(restored.pending.saveId,row.pending.saveId);
  assert.deepEqual(await db.transaction(['outbox'],'readonly',tx=>tx.getAll('outbox')),[]);
});
