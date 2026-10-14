// Isolated real workerd D1/R2 races. All records and DOCX bytes are synthetic;
// no website, native Codex, 得到, event delivery or user manuscript is accessed.
import ts from 'typescript';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';
import { zipSync, strToU8 } from 'fflate';
import { Miniflare } from 'miniflare';
import { drizzle } from 'drizzle-orm/d1';
import { migrate } from 'drizzle-orm/d1/migrator';
const require = createRequire(import.meta.url), uuid = () => webcrypto.randomUUID();
const sha = value => createHash('sha256').update(value).digest('hex');
const stamp = () => new Date().toISOString(), future = () => new Date(Date.now() + 3_600_000).toISOString();
let checks = 0, hook = null, beforePut = null, afterPut = null, puts = 0, sourcePuts = 0, eventCalls = 0;
const check = (value, label) => { assert.ok(value, label); checks++; };
const rejects = async (fn, label) => { await assert.rejects(fn, label); checks++; };
const mf = new Miniflare({ cf: false, modules: true, script: 'export default {fetch(){throw Error("NO REMOTE I/O")}}', compatibilityDate: '2026-05-22', d1Databases: { DB: 'synthetic-dedao-purge' }, r2Buckets: ['BUCKET'] });
try {
 const d1 = await mf.getD1Database('DB'), r2 = await mf.getR2Bucket('BUCKET');
 await migrate(drizzle(d1), { migrationsFolder: 'drizzle' });
 await migrate(drizzle(d1), { migrationsFolder: 'drizzle' });
 const runHook = async (sql, phase) => {
  if (hook && hook.phase === phase && hook.test(sql)) { const current = hook; hook = null; await current.fn(); }
 };
 function wrap(raw, sql) {
  return { raw, bind: (...a) => wrap(raw.bind(...a), sql),
   run: async () => { await runHook(sql, 'before'); const result = await raw.run(); await runHook(sql, 'after'); return result; },
   first: async (...a) => { await runHook(sql, 'before'); const result = await raw.first(...a); await runHook(sql, 'after'); return result; },
   all: async (...a) => { await runHook(sql, 'before'); const result = await raw.all(...a); await runHook(sql, 'after'); return result; }
  };
 }
 const wrappedDB = { prepare: sql => wrap(d1.prepare(sql), sql), batch: async statements => {
  await runHook(statements.map(s => s.raw).map(() => 'BATCH').join(' '), 'batch-before');
  return d1.batch(statements.map(s => s.raw));
 } };
 const wrappedR2 = { get: (...a) => r2.get(...a), delete: (...a) => r2.delete(...a), put: async (...a) => {
  puts++; if (a[0].startsWith('articles/')) sourcePuts++;
  if (beforePut) { const fn = beforePut; beforePut = null; await fn(...a); }
  const result = await r2.put(...a);
  if (afterPut) { const fn = afterPut; afterPut = null; await fn(...a); }
  return result;
 } };
 const mocks = { './test-store': { db: () => wrappedDB }, 'cloudflare:workers': { env: { DB: wrappedDB, BUCKET: wrappedR2 } },
  './writing-input': { hashText: async text => sha(text) }, './events': { readiness: async () => ({ connected: true }), dispatchDedao: async () => { eventCalls++; throw Error('NO EVENTS'); } },
  './article-list-policy': {}, './article-output-mode': {}, './article-recovery-view': {}, './article-upload-diagnostics': {}, './article-deliveries': {}, './word-progress': {},
  './article-handoff': { notifyArticle: async () => { throw Error('NO HANDOFF'); }, reconcileArticleHandoff: async () => { throw Error('NO HANDOFF'); } }
 };
 const cache = {};
 function load(name) {
  if (cache[name]) return cache[name]; const out = {}; cache[name] = out;
  const code = ts.transpileModule(fs.readFileSync(`lib/${name}.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports: out, require: name => mocks[name] || (name.startsWith('./') ? load(name.slice(2)) : require(name)), crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, File, Date, Error, URL, Set, Map, atob, btoa, structuredClone, fetch: () => { throw Error('NO REMOTE I/O'); } }); return out;
 }
 const api = load('dedao'), dispatch = load('dedao-dispatch');
 function doc(title) { return zipSync({ '[Content_Types].xml': strToU8('<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'), '_rels/.rels': strToU8('<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'), 'word/document.xml': strToU8(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${title}</w:t></w:r></w:p><w:p><w:r><w:t>Only synthetic bytes.</w:t></w:r></w:p></w:body></w:document>`) }); }
 async function seed({ download = true, current = true, state = 'running' } = {}) {
  const f = { owner: 'SYNTHETIC-PURGE-' + uuid(), batch: uuid(), item: uuid(), article: uuid(), token: uuid(), execution: 'synthetic-exec-' + uuid(), executor: 'synthetic-host', ordinal: 1, title: 'Synthetic purge document', final: 'synthetic-final', action: uuid() };
  f.bytes = doc(f.title); f.metadata = { filename: 'synthetic.docx', path: '/synthetic/synthetic.docx', sha256: sha(f.bytes), size: f.bytes.length, title: f.title, final_version_ref: f.final, browser_session: 'synthetic-browser' };
  f.encoded = JSON.stringify({ ...f.metadata, executor_id: f.executor });
  f.args = { batch_id: f.batch, executor_id: f.executor, execution_id: f.execution, claim_token: f.token, ordinal: f.ordinal };
  f.chunk = { ...f.args, offset: 0, base64: Buffer.from(f.bytes).toString('base64') };
  f.key = `dedao/${f.batch}/1/chunk-0-${sha(f.bytes)}`;
  const at = stamp();
  await d1.batch([
   d1.prepare('INSERT INTO dedao_batches(id,owner,request_key,queue_revision,total,state,current_ordinal,created,updated,started,finished,executor_id,execution_id,claim_hash,lease_until,heartbeat,executor_ended) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(f.batch, f.owner, uuid(), uuid(), 2, state, 1, at, at, at, state === 'completed' ? at : null, f.executor, f.execution, sha(f.token), future(), at, 0),
   d1.prepare("INSERT INTO dedao_batch_runtime(batch_id,owner,runtime,dispatch_mode,safe_boundary,updated) VALUES(?,?,'cli_cdp','fixed',0,?)").bind(f.batch, f.owner, at),
   d1.prepare('INSERT INTO dedao_executors(owner,id,browser_session,capabilities_json,heartbeat,ready) VALUES(?,?,?,?,?,1)').bind(f.owner, f.executor, 'synthetic-browser', '{}', at),
   ...(current ? [d1.prepare('INSERT INTO dedao_items(batch_id,owner,ordinal,id,title,stage,version,final_ref,download_json,article_id,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(f.batch, f.owner, 1, f.item, f.title, download ? 9 : 8, 1, f.final, download ? f.encoded : null, f.article, at, at),
    d1.prepare("INSERT INTO dedao_actions(batch_id,ordinal,action,action_id,state,observation_json,created,updated) VALUES(?,1,'finalize',?,'confirmed','{}',?,?)").bind(f.batch, uuid(), at, at),
    d1.prepare("INSERT INTO dedao_actions(batch_id,ordinal,action,action_id,state,created,updated) VALUES(?,1,'download',?,'reserved',?,?)").bind(f.batch, f.action, at, at)] : [])
  ]);
  return f;
 }
 async function preserved(f) {
  return JSON.stringify(await Promise.all(['dedao_batches', 'dedao_batch_runtime', 'dedao_executors'].map(async t => (await d1.prepare(`SELECT * FROM ${t} WHERE owner=?`).bind(f.owner).all()).results)));
 }
 async function fence(f, { remove = true } = {}) {
  const children = await Promise.all(['dedao_actions', 'dedao_chunks'].map(t => d1.prepare(`SELECT * FROM ${t} WHERE batch_id=? AND ordinal=1`).bind(f.batch).all()));
  const graph = [{ table: 'dedao_items', article_id: f.article, values: [f.batch, 1] }, ...children[0].results.map(r => ({ table: 'dedao_actions', article_id: f.article, values: [f.batch, 1, r.action] })), ...children[1].results.map(r => ({ table: 'dedao_chunks', article_id: f.article, values: [f.batch, 1, r.offset] }))];
  const operation = uuid(), lock = uuid(), at = stamp(), expires = future(), snapshot = JSON.stringify([{ id: f.article, include_dedao_articles: true, dedao_pairs: [{ batch_id: f.batch, ordinal: 1, article_id: f.article }], graph }]);
  await d1.batch([
   d1.prepare("INSERT INTO article_list_deletions(id,owner,scope,request_key,state,snapshot_json,snapshot_sha256,created,expires,confirmed_at,lock_token,lock_expires) VALUES(?,?,'all_articles',?,'deleting',?,?,?,?,?,?,?)").bind(operation, f.owner, uuid(), snapshot, sha(snapshot), at, expires, at, lock, expires),
   d1.prepare("INSERT INTO article_deletions(id,owner,state,started_at,operation_id,lock_token,lock_expires) VALUES(?,?,'deleting',?,?,?,?)").bind(f.article, f.owner, at, operation, lock, expires),
   d1.prepare("INSERT INTO article_content_fences(owner,entity_kind,entity_key,article_id,operation_id,created) VALUES(?,'dedao_items.batch_ordinal',?,?,?,?)").bind(f.owner, JSON.stringify([f.batch, 1]), f.article, operation, at)
  ]);
  if (remove) {
   const objects = await r2.list({ prefix: `dedao/${f.batch}/1/` }); for (const object of objects.objects) await r2.delete(object.key);
   await r2.delete(`articles/${f.article}/source`);
   await d1.batch(['dedao_actions', 'dedao_chunks', 'dedao_items'].map(t => d1.prepare(`DELETE FROM ${t} WHERE batch_id=? AND ordinal=1`).bind(f.batch)));
  }
 }
 {
  const f = await seed(), baseline = await preserved(f); await fence(f);
  const before = puts; await rejects(() => api.uploadDedaoChunk(f.owner, f.chunk), 'deleted pair before put'); check(puts === before, 'deleted pair causes no R2 put');
  check(await preserved(f) === baseline, 'purge preserves batch/runtime/executor bytes');
  const read = await api.readDedao(f.owner, f.batch); check(read.batch.current === null && read.batch.current_record_deleted && !read.batch.can_resume && read.batch.actions.length === 0, 'exact deleted current is content-free readable');
  check(read.batch.executor_ended === 0 && read.batch.native === null && read.batch.state === 'running', 'read never fabricates executor end or batch state');
  check(!JSON.stringify(read.batch).includes(f.title), 'deleted current exposes no title/download/response');
 }
 for (const unknown of [false, true]) {
  const f = await seed(), other = `dedao/${f.batch}/2/chunk-0-${sha('unbound')}`; await r2.put(other, 'unbound');
  beforePut = async () => { await fence(f); }; if (unknown) afterPut = async () => { throw Error('SYNTHETIC put response unknown after stored'); };
  await rejects(() => api.uploadDedaoChunk(f.owner, f.chunk), 'purge finishes while put in flight');
  check(!await r2.get(f.key), `late chunk compensated ${unknown ? 'unknown put response' : 'accepted put'}`);
  check(!!await r2.get(other), 'cleanup keeps unbound other ordinal'); check(!(await d1.prepare('SELECT 1 FROM dedao_chunks WHERE batch_id=?').bind(f.batch).first()), 'late chunk D1 row not recreated');
 }
 {
  const f = await seed(); afterPut = async () => { await fence(f, { remove: false }); };
  await rejects(() => api.uploadDedaoChunk(f.owner, f.chunk), 'atomic insert rejects fenced surviving item');
  check(!await r2.get(f.key), 'guarded insert zero rows compensates exact key');
  await rejects(() => d1.prepare('INSERT INTO dedao_chunks(batch_id,ordinal,offset,size,sha256,object_key) VALUES(?,1,0,?,?,?)').bind(f.batch, f.bytes.length, sha(f.bytes), f.key).run(), '0048 real insert trigger rejects direct late chunk');
 }
 {
  const f = await seed(); hook = { phase: 'after', test: s => s.startsWith('INSERT OR IGNORE INTO dedao_chunks'), fn: () => fence(f) };
  await rejects(() => api.uploadDedaoChunk(f.owner, f.chunk), 'purge after atomic insert before readback'); check(!await r2.get(f.key), 'post-insert purge late bytes absent');
 }
 {
  const f = await seed(); afterPut = async () => { throw Error('SYNTHETIC unknown put without deletion'); };
  await rejects(() => api.uploadDedaoChunk(f.owner, f.chunk), 'unfenced unknown put response'); check(!!await r2.get(f.key), 'unfenced unknown retains canonical bytes');
  check((await api.uploadDedaoChunk(f.owner, f.chunk)).stored, 'same pair retries original bytes');
  const snapshot = await (await r2.get(f.key)).arrayBuffer(); check(sha(new Uint8Array(snapshot)) === sha(f.bytes), 'retained retry bytes exact');
 }
 {
  const f = await seed(); hook = { phase: 'after', test: s => s.startsWith('INSERT OR IGNORE INTO dedao_chunks'), fn: async () => { throw Error('SYNTHETIC D1 response unknown after commit'); } };
  await rejects(() => api.uploadDedaoChunk(f.owner, f.chunk), 'unfenced unknown D1 response'); check(!!await r2.get(f.key), 'unknown committed D1 preserves bytes');
  check((await api.uploadDedaoChunk(f.owner, f.chunk)).duplicate, 'unknown committed retry uses existing exact chunk');
 }
 {
  const f = await seed(); const race = await Promise.allSettled([api.uploadDedaoChunk(f.owner, f.chunk), api.uploadDedaoChunk(f.owner, f.chunk)]);
  check(race.every(r => r.status === 'fulfilled'), 'concurrent canonical same-byte writes succeed'); check(!!await r2.get(f.key), 'legitimate concurrent writer bytes retained');
  check((await d1.prepare('SELECT count(*) AS n FROM dedao_chunks WHERE batch_id=?').bind(f.batch).first()).n === 1, 'concurrent same offset has one D1 identity');
 }
 {
  const f = await seed({ download: false }); hook = { phase: 'batch-before', test: () => true, fn: () => fence(f, { remove: false }) };
  await rejects(() => api.recordDedaoDownload(f.owner, { ...f.args, action_id: f.action, download: f.metadata }), 'late download metadata DB guard');
  const item = await d1.prepare('SELECT download_json,article_id FROM dedao_items WHERE batch_id=?').bind(f.batch).first();
  check(item.download_json === null && item.article_id === f.article, 'late download cannot replace original binding');
  await rejects(() => api.recordDedaoDownload(f.owner, { ...f.args, action_id: f.action, download: f.metadata }), 'fenced cached write entry rejected');
 }
 for (const unknown of [false, true]) {
  const f = await seed(); await api.uploadDedaoChunk(f.owner, f.chunk);
  beforePut = async key => { assert.equal(key, `articles/${f.article}/source`); await fence(f); };
  if (unknown) afterPut = async () => { throw Error('SYNTHETIC source put response unknown'); };
  await rejects(() => api.finalizeDedaoUpload(f.owner, f.args), 'late original article source put');
  check(!await r2.get(`articles/${f.article}/source`), `same-ID source compensated ${unknown ? 'unknown' : 'accepted'}`);
  check(!(await d1.prepare('SELECT 1 FROM articles WHERE owner=?').bind(f.owner).first()), 'late finalize creates no replacement article');
 }
 {
  const f = await seed(); await api.uploadDedaoChunk(f.owner, f.chunk);
  hook = { phase: 'before', test: s => s.startsWith('UPDATE dedao_items AS i SET upload_state'), fn: () => fence(f) };
  await rejects(() => api.finalizeDedaoUpload(f.owner, f.args), 'late finalize after article save before item update');
  check(!(await d1.prepare('SELECT 1 FROM dedao_items WHERE batch_id=?').bind(f.batch).first()), 'finalize guarded update cannot restore item');
  check(!await r2.get(`articles/${f.article}/source`), 'purge source bytes remain absent');
 }
 {
  const f = await seed({ state: 'completed' }), baseline = await preserved(f); await fence(f);
  const read = await api.readDedao(f.owner, f.batch); check(read.batch.completed === 2 && read.batch.state === 'completed', 'real completed batch+finished retains proven total after rows deleted');
  check(read.batch.current_record_deleted && read.batch.current === null && await preserved(f) === baseline, 'completed deletion read is content-free and read-only');
 }
 {
  const f = await seed({ current: false }); await rejects(() => api.readDedao(f.owner, f.batch), 'ordinary missing item without exact fence is not deletion');
  const a = await seed(), b = await seed(); await fence(a); check((await api.uploadDedaoChunk(b.owner, b.chunk)).stored, 'another owner and pair unaffected');
  await rejects(() => api.readDedao(b.owner, a.batch), 'deleted batch remains owner isolated');
 }
 async function queueState(f, state) {
  await d1.prepare('UPDATE dedao_batches SET state=?,claim_hash=NULL,execution_id=NULL,executor_id=NULL,lease_until=NULL,heartbeat=NULL,executor_ended=1 WHERE owner=? AND id=?').bind(state, f.owner, f.batch).run();
  await d1.prepare('UPDATE dedao_batch_runtime SET safe_boundary=1 WHERE owner=? AND batch_id=?').bind(f.owner, f.batch).run();
  return (await d1.prepare('SELECT queue_revision FROM dedao_batches WHERE id=?').bind(f.batch).first()).queue_revision;
 }
 {
  const f = await seed(), revision = await queueState(f, 'paused'), baseline = await preserved(f); await fence(f);
  await rejects(() => api.resumeDedao(f.owner, f.batch), 'deleted current cannot resume');
  await rejects(() => api.reserveDedaoLaunch(f.owner, { ...f.args, launcher_id: 'synthetic-launcher', queue_revision: revision }), 'deleted current cannot reserve launch');
  await rejects(() => api.claimDedao(f.owner, { ...f.args, queue_revision: revision }), 'deleted current cannot claim');
  check(await preserved(f) === baseline, 'deleted current preflight grants leave exact metadata untouched');
 }
 {
  const f = await seed(); await fence(f, { remove: false });
  await rejects(() => api.claimDedao(f.owner, f.args), 'fenced duplicate claim cannot return claimed true');
  check((await api.heartbeatDedao(f.owner, f.args)).renewed, 'original fenced grant heartbeat remains observable');
 }
 {
  const f = await seed(), revision = await queueState(f, 'queued'), baseline = await preserved(f);
  hook = { phase: 'before', test: s => s.startsWith("UPDATE dedao_batches SET state='launching'"), fn: () => fence(f, { remove: false }) };
  const result = await api.reserveDedaoLaunch(f.owner, { ...f.args, launcher_id: 'synthetic-launcher', queue_revision: revision });
  check(!result.reserved, 'reserve preflight-to-update purge race grants no launch'); check(await preserved(f) === baseline, 'reserve race preserves metadata');
 }
 {
  const f = await seed(), revision = await queueState(f, 'queued'), baseline = await preserved(f);
  hook = { phase: 'batch-before', test: () => true, fn: () => fence(f, { remove: false }) };
  const result = await api.claimDedao(f.owner, { ...f.args, queue_revision: revision });
  check(!result.claimed, 'claim preflight-to-CAS purge race grants no execution'); check(await preserved(f) === baseline, 'claim race preserves runtime/executor/batch');
 }
 {
  const f = await seed(); await queueState(f, 'paused'); const baseline = await preserved(f);
  hook = { phase: 'batch-before', test: () => true, fn: () => fence(f, { remove: false }) };
  await rejects(() => api.resumeDedao(f.owner, f.batch), 'resume preflight-to-CAS purge race rejects');
  check(await preserved(f) === baseline, 'resume race keeps original revision/claim/executor/runtime');
  check(!(await d1.prepare('SELECT 1 FROM dedao_wake_outbox WHERE batch_id=?').bind(f.batch).first()), 'failed resume adds no wake record');
 }
 async function nativeQueue(f) {
  const revision = await queueState(f, 'queued');
  await d1.prepare("UPDATE dedao_batch_runtime SET runtime='native_codex',dispatch_mode='dynamic',safe_boundary=1,thread_id=?,session_id=? WHERE owner=? AND batch_id=?").bind(uuid(), uuid(), f.owner, f.batch).run();
  await dispatch.dedaoWakeStatement(f.owner, f.batch, revision, stamp()).run();
  return { batch_id: f.batch, queue_revision: revision, dispatch_key: uuid(), dispatcher_id: 'synthetic-parent', target_environment: 'synthetic-authorized-host', selection_ref: 'synthetic-supported-read', observed_at: stamp() };
 }
 {
  const f = await seed(), a = await nativeQueue(f), baseline = await preserved(f); await fence(f);
  await rejects(() => dispatch.reserveDedaoDispatch(f.owner, a), 'deleted native input cannot grant external create');
  const before = eventCalls; await dispatch.dispatchDedaoWake(f.owner, f.batch, a.queue_revision);
  check(eventCalls === before, 'pending wake never sends after exact input fence');
  check((await dispatch.readDedaoDispatch(f.owner, f.batch)).can_requeue === false, 'native read does not advertise deleted input requeue');
  check(await preserved(f) === baseline, 'native fenced grant/wake keeps metadata');
 }
 {
  const f = await seed(), a = await nativeQueue(f), baseline = await preserved(f);
  hook = { phase: 'before', test: s => s.startsWith('INSERT OR IGNORE INTO dedao_dispatches'), fn: () => fence(f) };
  const result = await dispatch.reserveDedaoDispatch(f.owner, a);
  check(!result.may_create && !result.dispatch, 'native reserve preflight-to-insert purge race grants no create');
  check(await preserved(f) === baseline, 'native reserve race keeps runtime binding');
 }
 {
  const f = await seed(), a = await nativeQueue(f);
  hook = { phase: 'after', test: s => s.startsWith('INSERT OR IGNORE INTO dedao_dispatches'), fn: () => fence(f) };
  const result = await dispatch.reserveDedaoDispatch(f.owner, a);
  check(!result.may_create && result.dispatch.state === 'reserved', 'post-reservation purge never returns create permission');
  check(!(await dispatch.reserveDedaoDispatch(f.owner, a)).may_create, 'same reserved receipt replay has no new create permission');
  const outcome = await dispatch.recordDedaoDispatch(f.owner, { ...a, outcome: 'unknown', observed_at: stamp(), observation_ref: 'synthetic-original-unknown' });
  check(outcome.recorded && outcome.dispatch.state === 'unknown' && !outcome.can_requeue, 'original unknown receipt remains recoverable after purge');
 }
 {
  const f = await seed(), revision = await queueState(f, 'queued'); await fence(f);
  const result = await dispatch.dedaoWakeStatement(f.owner, f.batch, revision, stamp()).run();
  check(!result.meta.changes && !(await d1.prepare('SELECT 1 FROM dedao_wake_outbox WHERE batch_id=?').bind(f.batch).first()), 'new wake insert rejects exact deleted input');
 }
 check(sourcePuts === 3, 'finalize tested actual source bucket puts');
 console.log(`PASS ${checks} isolated real D1/R2 checks: migrations 0000–0048 twice; pre/post-put purge, lost put response, guarded insert, post-insert readback race, unfenced unknown D1/R2 outcomes, canonical concurrency, late download/finalize DB guards, exact deleted-current read and owner isolation. Synthetic hooks arrange timing only; all SQL guards and storage bytes are real. No production or native/browser end-to-end calls.`);
} finally { await mf.dispose(); }
