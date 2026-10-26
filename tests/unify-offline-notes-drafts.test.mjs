import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createMemoryDB} from '../web/offline/db.mjs';
import {createDraftJournal} from '../web/offline/drafts.mjs';

const scope = 'a'.repeat(64), date = '2026-10-26';
const draft = (kind = 'note_entry') => ({kind, id: randomUUID(), category: 'work', date, draft: '中文合成中',
  version: 0, serverText: '', contentHash: '', dirty: true, phase: 'dirty', pending: null});
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
