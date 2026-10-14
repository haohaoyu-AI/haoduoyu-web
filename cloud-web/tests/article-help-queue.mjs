import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';

// Real migrations, queue acquisition, ordinary claim and permanent deletion code.
// All IDs, owners, files and leases below are fresh synthetic fixtures in memory.
// The serialized SQLite transaction models D1 batch atomicity. External transport,
// providers and unrelated output handlers are blocked or inert; no production I/O.
const nativeRequire = createRequire(import.meta.url);
const sql = new DatabaseSync(':memory:');
for (const file of fs.readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort()) {
  sql.exec(fs.readFileSync(`drizzle/${file}`, 'utf8'));
}
let tick = Date.parse('2030-01-02T03:04:05.000Z');
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [tick])); }
  static now() { return tick; }
}
const now = () => new Clock().toISOString();
const future = () => new Clock(tick + 3600000).toISOString();
const past = '2000-01-01T00:00:00.000Z';
const random = () => webcrypto.randomUUID();
const hash = async value => Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(value))).toString('hex');
let batchTail = Promise.resolve(), beforeBatch = null, beforeFirst = null, failBatchIndex = -1;
let databaseWrites = 0, networkCalls = 0, eventCalls = 0, providerCalls = 0;
const objects = new Map();
const bucket = {
  async list({ prefix }) { return { objects: [...objects].filter(([key]) => key.startsWith(prefix)).map(([key, bytes]) => ({ key, size: bytes.length })), truncated: false }; },
  async put() { providerCalls++; throw Error('Unexpected output/provider operation'); },
  async delete(key) { objects.delete(key); },
};
function execute(source, values) {
  const statement = sql.prepare(source);
  if (statement.columns().length) return { results: statement.all(...values), meta: { changes: 0 } };
  databaseWrites++;
  return { meta: { changes: Number(statement.run(...values).changes) } };
}
const db = {
  prepare(source) {
    return { bind(...values) { return {
      source, values,
      async first() {
        if (beforeFirst) await beforeFirst(source, values);
        return sql.prepare(source).get(...values) || null;
      },
      async all() { return { results: sql.prepare(source).all(...values) }; },
      async run() { return execute(source, values); },
    }; } };
  },
  async batch(statements) {
    // Barriers represent another completed request immediately before this
    // transaction. Run them before reserving the serialized transaction slot:
    // a real competing request may itself use an atomic D1 batch.
    const hook = beforeBatch; beforeBatch = null;
    if (hook) await hook(statements);
    const run = batchTail.then(() => {
      const fault = failBatchIndex; failBatchIndex = -1;
      sql.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map(({ source, values }, index) => {
          if (index === fault) throw Error('Synthetic transaction fault');
          return execute(source, values);
        });
        sql.exec('COMMIT'); return results;
      } catch (error) { sql.exec('ROLLBACK'); throw error; }
    });
    batchTail = run.catch(() => {});
    return run;
  },
};
const emptyTools = { outputRecoveryTools: [], outputRecoveryNames: new Set(), articleClaimRecoveryTools: [], articleClaimRecoveryNames: new Set(), articleUploadTools: [], articleUploadToolNames: new Set() };
const stubs = {
  'cloudflare:workers': { env: { DB: db, BUCKET: bucket } },
  './article-format': { MAX_FILE: 20_000_000, parseArticle: () => ['隔离合成标题', '隔离合成正文'] },
  './article-deliveries': { deliveryList: async (owner, id) => sql.prepare('SELECT * FROM article_deliveries WHERE owner=? AND article_id=?').all(owner, id) },
  './article-upload-diagnostics': { uploadDiagnosticTool: {}, uploadProgress: async () => ({}) },
  './article-output-recovery': emptyTools,
  './article-claim-recovery': emptyTools,
  './article-upload-attempts': emptyTools,
  './article-recovery-view': { articleContinuation: () => ({}), articleRecoveryView: () => ({}), executionRecoveryGuidance: () => ({}) },
  './article-file-handoff': {}, './article-manifest': {}, './article-cleanup': {}, './output-format': {},
  './article-state-transitions': {}, './editorial-credential-text': {},
  './events': { readiness: async () => { eventCalls++; throw Error('Unexpected event readiness'); }, dispatch: async () => { eventCalls++; throw Error('Unexpected event dispatch'); } },
};
const modules = new Map();
function load(filename) {
  filename = path.normalize(filename);
  if (modules.has(filename)) return modules.get(filename);
  const exports = {}; modules.set(filename, exports);
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, {
    exports, require: dependency => {
      if (Object.hasOwn(stubs, dependency)) return stubs[dependency];
      if (dependency.endsWith('?raw') || dependency.startsWith('../') && dependency.endsWith('.js')) {
        const source = path.resolve(path.dirname(filename), dependency.replace(/\?raw$/, ''));
        assert.ok(source.startsWith(path.resolve('scripts/browser-upload') + path.sep), 'only actual upload contract sources may be loaded');
        return dependency.endsWith('?raw') ? {__esModule: true, default: fs.readFileSync(source, 'utf8')} : nativeRequire(source);
      }
      if (dependency.startsWith('.')) return load(path.join(path.dirname(filename), `${dependency}.ts`));
      return nativeRequire(dependency);
    },
    crypto: webcrypto, Date: Clock, JSON, Promise, Error, Set, Map, Array, Number, String, RegExp,
    TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Request, Response, URL, btoa, atob,
    setTimeout, clearTimeout, AbortSignal, structuredClone, File, ReadableStream,
    fetch: async () => { networkCalls++; throw Error('Production network is disabled in this test'); },
    console: { log() { throw Error('Unexpected module log'); }, error() { throw Error('Unexpected module log'); }, warn() { throw Error('Unexpected module log'); } },
  }, { filename });
  return exports;
}
const { articleHelpQueueTools, articleHelpQueueCall } = load('lib/article-help-queue.ts');
const { articleCall } = load('lib/article-tools.ts');
const { deleteArticlePermanently } = load('lib/article-deletion.ts');
const claim = (owner, key = random()) => articleHelpQueueCall(owner, 'claim_next_article_help', { request_key: key });
const read = (owner, key) => articleHelpQueueCall(owner, 'read_article_help_claim', { request_key: key });
const get = row => sql.prepare('SELECT * FROM articles WHERE id=?').get(row.id);
const receipt = (owner, key) => sql.prepare('SELECT * FROM article_help_queue_claims WHERE owner=? AND request_key=?').get(owner, key.toLowerCase());
const origins = row => sql.prepare("SELECT * FROM word_claim_origins WHERE owner=? AND target_kind='article' AND target_id=?").all(row.owner, row.id);
const ownerFor = () => `synthetic-owner-${random()}`;
let cases = 0;
// Credential assertions compare booleans so assertion failures never print tokens.
function sameToken(a, b, message = 'The original lease must be retained') { assert.equal(!!a && a === b, true, message); }
function noToken(result) { assert.equal(result.claimed, false); assert.equal(Object.hasOwn(result, 'claim_token'), false); }
async function assertFreshOrigin(row, result, proofReference) {
  const records = origins(row), sha = await hash(result.claim_token.toLowerCase());
  assert.equal(records.length, 1, 'Only one actual fresh claim may have an origin');
  assert.equal(records[0].claim_hash === sha, true);
  assert.equal(records[0].origin, 'fresh_claim');
  assert.equal(records[0].proof_reference, proofReference);
  assert.equal(get(row).word_claim_origin_hash === sha, true);
  assert.equal(JSON.stringify(records).includes(result.claim_token), false);
  if (Object.hasOwn(result, 'word_execution_granted')) assert.equal(result.word_execution_granted, false);
  else assert.match(result.processing_policy.word_execution, /Main claim only.*acquire_word_execution must confirm an actual grant/);
}
function addHandoff(row, overrides = {}) {
  const id = random();
  const handoff = { id, owner: row.owner, article_id: row.id, event_id: `article_wake_${id}`, state: 'delivered', created: now(), updated: now(), expires: past, ...overrides };
  sql.prepare('INSERT INTO article_handoffs(id,owner,article_id,event_id,state,created,updated,expires) VALUES(?,?,?,?,?,?,?,?)').run(...['id', 'owner', 'article_id', 'event_id', 'state', 'created', 'updated', 'expires'].map(key => handoff[key]));
  return handoff;
}
function addArticle(overrides = {}, withHandoff = true) {
  const id = random();
  const row = { id, owner: ownerFor(), title: '隔离合成标题', filename: 'synthetic.txt', source_key: `articles/${id}/source`, paragraphs: '["隔离合成标题","隔离合成正文"]', created: now(), state: 'queued', claim_token: null, claim_expires: null, result_key: null, result_meta: null, artifact_manifest: null, draft_url: null, draft_readback: null, upload_guard_version: 0, ...overrides };
  const fields = Object.keys(row);
  sql.prepare(`INSERT INTO articles(${fields.join(',')}) VALUES(${fields.map(() => '?').join(',')})`).run(...fields.map(key => row[key]));
  objects.set(row.source_key, Uint8Array.from([1, 2, 3]));
  row.handoff = withHandoff ? addHandoff(row) : null;
  return row;
}
function update(row, fields) {
  sql.prepare(`UPDATE articles SET ${Object.keys(fields).map(key => `${key}=?`).join(',')} WHERE id=?`).run(...Object.values(fields), row.id);
}
function addRelated(row, table, state = 'failed', relatedOwner = row.owner) {
  if (table === 'writing_runs') {
    sql.prepare('INSERT INTO writing_runs(id,owner,day,writer,run_kind,state,article_id,created,updated) VALUES(?,?,?,?,?,?,?,?,?)').run(random(), relatedOwner, '2030-01-02', 'xiaoyu', random(), state, row.id, now(), now());
  } else if (['editorial_flows', 'outline_flows'].includes(table)) {
    sql.prepare(`INSERT INTO ${table}(id,owner,authorization_key,article_id,snapshot,snapshot_sha256,state,expires,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(random(), relatedOwner, random(), row.id, '{}', 'a'.repeat(64), state, future(), now(), now());
  } else if (table === 'editorial_runs_v3') {
    sql.prepare('INSERT INTO editorial_runs_v3(id,owner,authority_id,request_key,run_kind,day,writer,input_json,input_sha256,snapshot_json,snapshot_sha256,state,article_id,expires,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(random(), relatedOwner, random(), random(), 'daily', '2030-01-02', 'xiaoyu', '{}', 'a'.repeat(64), '{}', 'a'.repeat(64), state, row.id, future(), now(), now());
  } else if (table === 'article_deletions') {
    sql.prepare('INSERT INTO article_deletions(id,owner,state,started_at,lock_token,lock_expires) VALUES(?,?,?,?,?,?)').run(row.id, relatedOwner, 'deleting', now(), random(), future());
  } else if (table === 'article_deliveries') {
    sql.prepare('INSERT INTO article_deliveries(id,owner,article_id,platform,state,updated) VALUES(?,?,?,?,?,?)').run(random(), relatedOwner, row.id, 'zhihu', state, now());
  } else if (table === 'article_upload_attempts') {
    sql.prepare('INSERT INTO article_upload_attempts(id,owner,article_id,platform,target_account,word_sha256,word_size,authorization_kind,claim_hash,preflight,baseline,state,editor_urls,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(random(), relatedOwner, row.id, 'toutiao', 'synthetic-account', 'a'.repeat(64), 1, 'manual_task', 'b'.repeat(64), '{}', '{}', state, '[]', now(), now());
  } else if (table === 'article_upload_diagnostics') {
    sql.prepare('INSERT INTO article_upload_diagnostics(id,owner,article_id,platform,executor_id,stage,outcome,cause,observed_at,created) VALUES(?,?,?,?,?,?,?,?,?,?)').run(random(), relatedOwner, row.id, 'toutiao', random(), 'file_handoff', 'started', 'none', now(), now());
  } else if (table === 'article_output_restarts') {
    sql.prepare('INSERT INTO article_output_restarts(id,owner,article_id,previous_output_id,previous_meta,new_output_id,reason,created) VALUES(?,?,?,?,?,?,?,?)').run(random(), relatedOwner, row.id, random(), '{}', random(), 'synthetic invalid output', now());
  } else throw Error('Unknown synthetic relation');
}
async function expectExcluded(row) {
  const before = JSON.stringify(get(row));
  const result = await claim(row.owner);
  noToken(result); assert.equal(result.status, 'empty');
  assert.equal(JSON.stringify(get(row)) === before, true, 'Excluded business rows must remain unchanged');
  assert.equal(origins(row).length, 0, 'Excluded or historical records cannot acquire fresh origin proof');
  cases++;
}

assert.equal(articleHelpQueueTools.length, 2);
for (const [index, name] of ['claim_next_article_help', 'read_article_help_claim'].entries()) {
  const tool = articleHelpQueueTools[index];
  assert.equal(tool.name, name);
  assert.equal(tool.inputSchema.properties.request_key.type, 'string');
  assert.equal(tool.inputSchema.properties.request_key.format, 'uuid');
  assert.equal(Array.from(tool.inputSchema.required).join(','), 'request_key');
  assert.equal(Object.keys(tool.inputSchema.properties).join(','), 'request_key');
  assert.equal(tool.inputSchema.additionalProperties, false);
  assert.equal(tool.annotations.readOnlyHint, index === 1);
}
const writesBeforeInvalid = databaseWrites;
for (const args of [null, [], {}, { request_key: '' }, { request_key: 'latest' }, { request_key: random(), article_id: random() }, { request_key: 1 }, { request_key: { toString: random } }]) {
  await assert.rejects(articleHelpQueueCall(ownerFor(), 'claim_next_article_help', args));
}
await assert.rejects(articleHelpQueueCall('', 'claim_next_article_help', { request_key: random() }));
await assert.rejects(articleHelpQueueCall(ownerFor(), 'unknown', { request_key: random() }));
assert.equal(databaseWrites, writesBeforeInvalid);
cases++;

// Handoff order is stable and independent of article recency or notification TTL.
const orderedOwner = ownerFor();
const newestArticle = addArticle({ owner: orderedOwner, created: '2040-01-01T00:00:00.000Z' }, false);
const oldestArticle = addArticle({ owner: orderedOwner, created: '2000-01-01T00:00:00.000Z' }, false);
const tieArticle = addArticle({ owner: orderedOwner }, false);
const ids = [random(), random()].sort();
newestArticle.handoff = addHandoff(newestArticle, { id: ids[0], event_id: `article_wake_${ids[0]}`, created: '2020-01-01T00:00:00.000Z', state: 'sending' });
tieArticle.handoff = addHandoff(tieArticle, { id: ids[1], event_id: `article_wake_${ids[1]}`, created: '2020-01-01T00:00:00.000Z', state: 'unknown' });
oldestArticle.handoff = addHandoff(oldestArticle, { created: '2021-01-01T00:00:00.000Z' });
addHandoff(newestArticle, { created: '2022-01-01T00:00:00.000Z' });
for (const row of [newestArticle, tieArticle, oldestArticle]) {
  const key = random(), result = await claim(orderedOwner, key);
  assert.equal(result.claimed, true); assert.equal(result.article_id, row.id);
  assert.equal(result.handoff_id, row.handoff.id); assert.equal(result.event_id, row.handoff.event_id);
  assert.equal(result.data.article_id, row.id); assert.equal(result.source, 'persisted_article_help_queue');
  assert.equal(result.original_event_injection_restored, false); assert.equal(result.dispatch_performed, false);
  assert.equal(result.execute_import, false); assert.equal(result.new_platform_upload_allowed, false);
  assert.equal(result.claim_acquired_now, true); assert.equal(result.new_execution_grant, true);
  assert.equal(result.processing_policy.public_publication_allowed, false);
  assert.equal(result.processing_policy.recommended_word_max_bytes, 14000000);
  assert.equal(Date.parse(result.expires), tick + 6 * 3600000);
  assert.equal(get(row).state, 'processing'); sameToken(result.claim_token, get(row).claim_token);
  const stored = receipt(orderedOwner, key), sha = await hash(result.claim_token.toLowerCase());
  assert.equal(stored.claim_hash === sha, true); assert.equal(Object.hasOwn(stored, 'claim_token'), false);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM article_claim_credential_hashes WHERE owner=? AND sha256=?').get(orderedOwner, sha).n, 1);
  await assertFreshOrigin(row, result, 'article_help_queue_claim:' + await hash(key));
  cases++;
}
noToken(await claim(orderedOwner)); // A second handoff cannot acquire the same article again.

// Replay, uppercase normalization and lost-response read preserve only one lease.
const replayRow = addArticle(), replayKey = random();
const initial = await claim(replayRow.owner, replayKey.toUpperCase());
const writesBeforeRead = databaseWrites;
const recovered = await read(replayRow.owner, replayKey);
sameToken(initial.claim_token, recovered.claim_token); assert.equal(recovered.article_id, replayRow.id);
assert.equal(recovered.claim_acquired_now, false); assert.equal(recovered.new_execution_grant, false);
assert.equal(recovered.same_claim_recovery, true); assert.equal(databaseWrites, writesBeforeRead);
const replayed = await claim(replayRow.owner, replayKey);
sameToken(initial.claim_token, replayed.claim_token); assert.equal(replayed.new_execution_grant, false);
assert.equal(sql.prepare('SELECT count(*) AS n FROM article_help_queue_claims WHERE owner=? AND request_key=?').get(replayRow.owner, replayKey).n, 1);
await assertFreshOrigin(replayRow, replayed, 'article_help_queue_claim:' + await hash(replayKey));
assert.throws(() => sql.prepare('UPDATE article_help_queue_claims SET article_id=NULL WHERE owner=? AND request_key=?').run(replayRow.owner, replayKey), /article_help_queue_frozen/);
assert.throws(() => sql.prepare('UPDATE word_claim_origins SET proof_reference=? WHERE owner=? AND target_id=?').run('changed', replayRow.owner, replayRow.id), /immutable_word_claim_origin/);
cases++;

const emptyOwner = ownerFor(), emptyKey = random();
const missingWrites = databaseWrites, missing = await read(emptyOwner, emptyKey);
noToken(missing); assert.equal(missing.status, 'not_recorded'); assert.equal(missing.retry_same_request_key, true);
assert.equal(databaseWrites, missingWrites); assert.equal(receipt(emptyOwner, emptyKey), undefined);
noToken(await claim(emptyOwner, emptyKey));
const waiting = addArticle({ owner: emptyOwner });
for (const result of [await claim(emptyOwner, emptyKey), await read(emptyOwner, emptyKey)]) {
  noToken(result); assert.equal(result.status, 'empty'); assert.equal(result.retry_same_request_key, false);
}
assert.equal(get(waiting).state, 'queued'); assert.equal(receipt(emptyOwner, emptyKey).article_id, null);
assert.equal((await claim(emptyOwner, random())).article_id, waiting.id);
const missingOwner = ownerFor(), notYetKey = random();
noToken(await read(missingOwner, notYetKey));
const notYetRow = addArticle({ owner: missingOwner });
assert.equal((await claim(missingOwner, notYetKey)).article_id, notYetRow.id);
const ownerIsolationRow = addArticle();
assert.equal((await claim(ownerIsolationRow.owner, replayKey)).article_id, ownerIsolationRow.id);
noToken(await read(ownerFor(), replayKey));
cases++;

const sameKeyRow = addArticle(), sameKey = random();
const sameResults = await Promise.all(Array.from({ length: 12 }, () => claim(sameKeyRow.owner, sameKey)));
assert.equal(sameResults.every(result => result.claimed && result.article_id === sameKeyRow.id), true);
for (const result of sameResults) sameToken(result.claim_token, sameResults[0].claim_token);
assert.equal(sameResults.filter(result => result.claim_acquired_now).length, 1);
assert.equal(sameResults.filter(result => result.new_execution_grant).length, 1);
assert.equal(sql.prepare('SELECT count(*) AS n FROM article_help_queue_claims WHERE owner=?').get(sameKeyRow.owner).n, 1);
await assertFreshOrigin(sameKeyRow, sameResults[0], 'article_help_queue_claim:' + await hash(sameKey));
const differentOwner = ownerFor(), differentRows = Array.from({ length: 3 }, () => addArticle({ owner: differentOwner }));
const differentResults = await Promise.all(Array.from({ length: 5 }, () => claim(differentOwner)));
assert.equal(differentResults.filter(result => result.claimed).length, 3);
assert.equal(new Set(differentResults.filter(result => result.claimed).map(result => result.article_id)).size, 3);
assert.equal(differentRows.every(row => get(row).state === 'processing'), true);
for (const row of differentRows) assert.equal(origins(row).length, 1);
differentResults.filter(result => !result.claimed).forEach(noToken);
const sole = addArticle(), soleKeys = [random(), random()];
const soleResults = await Promise.all(soleKeys.map(key => claim(sole.owner, key)));
assert.equal(soleResults.filter(result => result.claimed).length, 1);
noToken(await claim(sole.owner, soleKeys[soleResults.findIndex(result => !result.claimed)]));
cases++;

for (const state of ['uploaded', 'failed', 'processing', 'word_ready', 'toutiao_saving', 'needs_login', 'needs_verification', 'completed', 'text_saved', 'deleting']) {
  await expectExcluded(addArticle({ state }));
}
for (const fields of [
  { claim_token: random() }, { claim_token: '' }, { claim_token: random(), claim_expires: past },
  { claim_expires: past }, { claim_expires: future() }, { claim_expires: 'invalid-date' },
  { result_key: 'synthetic-output' }, { result_meta: '{}' }, { artifact_manifest: '{}' },
  { artifact_manifest: '{"output_mode":"text_only"}' }, { draft_url: 'https://example.invalid/synthetic' }, { draft_readback: '{}' },
  { source_key: `generated/${random()}` }, { paragraphs: 'not json' }, { paragraphs: '{}' }, { paragraphs: '[]' }, { upload_guard_version: 1 },
]) await expectExcluded(addArticle(fields));
await expectExcluded(addArticle({}, false));
const foreignHandoff = addArticle({}, false); addHandoff(foreignHandoff, { owner: ownerFor() }); await expectExcluded(foreignHandoff);
const otherOwnerRow = addArticle(), ownEmptyOwner = ownerFor(); noToken(await claim(ownEmptyOwner)); assert.equal(get(otherOwnerRow).state, 'queued');
for (const state of ['reserved', 'outcome_unknown', 'draft_observed', 'verified']) {
  const row = addArticle(); addRelated(row, 'article_upload_attempts', state); await expectExcluded(row);
}
for (const state of ['pending', 'saving', 'failed', 'saved']) {
  const row = addArticle(); addRelated(row, 'article_deliveries', state); await expectExcluded(row);
}
for (const table of ['writing_runs', 'editorial_runs_v3', 'editorial_flows', 'outline_flows', 'article_deletions', 'article_upload_diagnostics', 'article_output_restarts']) {
  const row = addArticle(); addRelated(row, table); await expectExcluded(row);
}
// Inconsistent foreign-owner lineage still blocks this exact article, failing closed.
for (const table of ['writing_runs', 'editorial_flows', 'outline_flows', 'article_deliveries', 'article_deletions']) {
  const row = addArticle(); addRelated(row, table, 'failed', ownerFor()); await expectExcluded(row);
}

// Existing work can be read by its own original lease, never renewed by this queue.
for (const mode of ['expired', 'replaced', 'completed', 'deleted', 'deletion_fenced', 'text_only', 'noncanonical', 'generated']) {
  const row = addArticle(), key = random(), original = await claim(row.owner, key);
  const later = addArticle({ owner: row.owner });
  if (mode === 'expired') update(row, { claim_expires: now() });
  if (mode === 'replaced') update(row, { claim_token: random() });
  if (mode === 'completed') update(row, { state: 'completed' });
  if (mode === 'deleted') sql.prepare('DELETE FROM articles WHERE id=?').run(row.id);
  if (mode === 'deletion_fenced') addRelated(row, 'article_deletions');
  if (mode === 'text_only') update(row, { artifact_manifest: '{"output_mode":"text_only"}' });
  if (mode === 'noncanonical') update(row, { source_key: `generated/${random()}` });
  if (mode === 'generated') addRelated(row, 'outline_flows');
  const before = databaseWrites;
  for (const result of [await read(row.owner, key), await claim(row.owner, key)]) {
    noToken(result); assert.equal(result.article_id, row.id); assert.equal(result.status, 'claim_unavailable');
    assert.equal(result.new_execution_grant, false);
  }
  assert.equal(databaseWrites, before); assert.equal(get(later).state, 'queued');
  assert.equal(receipt(row.owner, key).claim_hash === await hash(original.claim_token.toLowerCase()), true);
  cases++;
}
for (const state of ['word_ready', 'toutiao_saving', 'needs_login', 'needs_verification', 'failed']) {
  const row = addArticle(), key = random(), original = await claim(row.owner, key);
  update(row, { state, result_key: 'synthetic-existing-word', artifact_manifest: '{"output_mode":"illustrated_word"}' });
  const result = await read(row.owner, key); sameToken(result.claim_token, original.claim_token);
  assert.equal(result.has_word, true); assert.equal(result.new_execution_grant, false);
  cases++;
}

// A replacement between hash verification and the final conditional read stays private.
const changing = addArticle(), changingKey = random(); await claim(changing.owner, changingKey);
let changedDuringRead = false;
beforeFirst = async (source, values) => {
  if (source.includes('SELECT state,claim_token,claim_expires,result_key FROM articles a') && values[0] === changing.id) {
    beforeFirst = null; changedDuringRead = true; update(changing, { claim_token: random() });
  }
};
noToken(await read(changing.owner, changingKey)); assert.equal(changedDuringRead, true);
cases++;

// The final snapshot must remain date-valid and live after an awaited database read.
for (const mode of ['invalid-expiry-during-read', 'clock-expiry-during-read']) {
  const row = addArticle(), key = random(), clockBefore = tick;
  await claim(row.owner, key);
  let changed = false;
  beforeFirst = async (source, values) => {
    if (source.includes('SELECT state,claim_token,claim_expires,result_key FROM articles a') && values[0] === row.id) {
      beforeFirst = null; changed = true;
      if (mode === 'invalid-expiry-during-read') update(row, { claim_expires: 'zzz-invalid-date' });
      else tick += 7 * 3600000;
    }
  };
  try { noToken(await read(row.owner, key)); assert.equal(changed, true); }
  finally { tick = clockBefore; beforeFirst = null; }
  cases++;
}

// Actual ordinary claim wins before the queue transaction, or loses to its live lease.
const ordinaryFirst = addArticle(); let ordinaryResult, directCasObserved = false;
beforeBatch = async statements => {
  assert.ok(statements.some(({ source }) => source.includes("UPDATE articles AS a SET state='processing'") && source.includes('word_claim_origin_hash=?')));
  beforeBatch = async competingStatements => {
    assert.equal(competingStatements.length, 2);
    assert.ok(competingStatements[0].source.startsWith('UPDATE articles SET state=?,claim_token=?,claim_expires=?,word_claim_origin_hash=?'));
    assert.ok(competingStatements[0].source.includes('AND claim_token IS NULL AND claim_expires IS NULL AND result_key IS NULL AND result_meta IS NULL'));
    assert.ok(competingStatements[1].source.startsWith('INSERT OR IGNORE INTO word_claim_origins'));
    directCasObserved = true;
  };
  ordinaryResult = await articleCall(ordinaryFirst.owner, 'claim_article', { article_id: ordinaryFirst.id });
};
noToken(await claim(ordinaryFirst.owner)); assert.equal(ordinaryResult.claimed, true);
assert.equal(directCasObserved, true, 'The competing ordinary request must execute its actual fresh claim CAS batch');
sameToken(get(ordinaryFirst).claim_token, ordinaryResult.claim_token);
await assertFreshOrigin(ordinaryFirst, ordinaryResult, 'claim_article_fresh');
const queueFirst = addArticle(), queueResult = await claim(queueFirst.owner);
assert.equal((await articleCall(queueFirst.owner, 'claim_article', { article_id: queueFirst.id })).claimed, false);
sameToken(get(queueFirst).claim_token, queueResult.claim_token);
assert.equal(origins(queueFirst).length, 1);
for (let iteration = 0; iteration < 8; iteration++) {
  const row = addArticle();
  const [queued, ordinary] = await Promise.all([claim(row.owner), articleCall(row.owner, 'claim_article', { article_id: row.id })]);
  assert.equal(Number(queued.claimed) + Number(ordinary.claimed), 1);
  sameToken(get(row).claim_token, (queued.claimed ? queued : ordinary).claim_token);
  assert.equal(origins(row).length, 1, 'The losing CAS must never insert a second origin');
}
cases++;

const deleteArgs = row => ({ article_id: row.id, confirm_article_id: row.id, confirm_title: row.title, confirm_permanent: true });
const deletionFirst = addArticle(); await deleteArticlePermanently(deletionFirst.owner, deleteArgs(deletionFirst));
noToken(await claim(deletionFirst.owner)); assert.equal(get(deletionFirst), undefined);
const deletionBlocked = addArticle(); const liveQueue = await claim(deletionBlocked.owner);
await assert.rejects(deleteArticlePermanently(deletionBlocked.owner, deleteArgs(deletionBlocked)));
sameToken(get(deletionBlocked).claim_token, liveQueue.claim_token); assert.equal(objects.has(deletionBlocked.source_key), true);
for (let iteration = 0; iteration < 8; iteration++) {
  const row = addArticle();
  const [queued, deletion] = await Promise.allSettled([claim(row.owner), deleteArticlePermanently(row.owner, deleteArgs(row))]);
  assert.equal(queued.status, 'fulfilled');
  if (queued.value.claimed) {
    assert.equal(deletion.status, 'rejected'); sameToken(get(row).claim_token, queued.value.claim_token);
    assert.equal(objects.has(row.source_key), true);
  } else {
    noToken(queued.value); assert.equal(deletion.status, 'fulfilled'); assert.equal(get(row), undefined);
    assert.equal(objects.has(row.source_key), false);
  }
}
// Deterministic deletion fence appearing immediately before batch is rechecked.
const deletingDuringBatch = addArticle();
beforeBatch = async () => { update(deletingDuringBatch, { state: 'deleting' }); addRelated(deletingDuringBatch, 'article_deletions'); };
noToken(await claim(deletingDuringBatch.owner)); assert.equal(get(deletingDuringBatch).state, 'deleting');
cases++;

// A failure after the actual native lease and origin INSERT rolls back the
// entire batch, including the immutable identity, origin and native binding.
const rolledBack = addArticle(), rollbackKey = random();
beforeBatch = async statements => {
  assert.ok(statements[2].source.startsWith('UPDATE articles AS a'));
  assert.ok(statements[3].source.startsWith('INSERT OR IGNORE INTO word_claim_origins'));
  assert.ok(statements[4].source.includes('article_claim_credential_hashes'));
};
failBatchIndex = 4;
await assert.rejects(claim(rolledBack.owner, rollbackKey), /Synthetic transaction fault/);
assert.equal(receipt(rolledBack.owner, rollbackKey), undefined);
assert.equal(get(rolledBack).state, 'queued'); assert.equal(get(rolledBack).claim_token, null);
assert.equal(get(rolledBack).word_claim_origin_hash, null); assert.equal(origins(rolledBack).length, 0);
assert.equal(sql.prepare('SELECT count(*) AS n FROM article_claim_credential_hashes WHERE owner=?').get(rolledBack.owner).n, 0);
const absentAfterFault = await read(rolledBack.owner, rollbackKey);
noToken(absentAfterFault); assert.equal(absentAfterFault.retry_same_request_key, true);
const retried = await claim(rolledBack.owner, rollbackKey);
assert.equal(retried.article_id, rolledBack.id);
await assertFreshOrigin(rolledBack, retried, 'article_help_queue_claim:' + await hash(rollbackKey));
const lost = addArticle(), lostKey = random();
await claim(lost.owner, lostKey); // Deliberately discard the original response.
const lostWrites = databaseWrites, regained = await read(lost.owner, lostKey);
assert.equal(regained.claimed, true); sameToken(regained.claim_token, get(lost).claim_token);
assert.equal(regained.new_execution_grant, false); assert.equal(databaseWrites, lostWrites);
cases++;

assert.equal(networkCalls, 0); assert.equal(eventCalls, 0); assert.equal(providerCalls, 0);
sql.close();
console.log(`PASS article help queue: ${cases} isolated eligibility/recovery cases on real Node SQLite/current TypeScript/full current migrations, stable oldest handoff, atomic same/different request races, actual ordinary claim batch/deletion races, immutable one-time fresh origins/native hash binding, full lease/receipt/origin rollback and lost-response recovery; zero network/events/providers`);
