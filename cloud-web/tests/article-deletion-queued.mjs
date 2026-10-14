import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';

// Run actual deletion, intake/list, claim and notification code against every real migration.
// Only the external event transport, R2 and unrelated output/delivery handlers are simulated.
const nativeRequire = createRequire(import.meta.url);
const sql = new DatabaseSync(':memory:');
for (const file of fs.readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort()) {
  sql.exec(fs.readFileSync(`drizzle/${file}`, 'utf8'));
}
const objects = new Map();
let beforeDeletionBatch = null;
let beforeRun = null;
let beforeList = null;
let beforeDelete = null;
const bucket = {
  async list({ prefix }) {
    if (beforeList) await beforeList(prefix);
    return { objects: [...objects].filter(([key]) => key.startsWith(prefix)).map(([key, bytes]) => ({ key, size: bytes.length })), truncated: false };
  },
  async put(key, bytes) { objects.set(key, bytes); },
  async delete(key) {
    if (beforeDelete) await beforeDelete(key);
    objects.delete(key);
  },
};
const db = {
  prepare(source) {
    return { bind(...values) {
      return { source, values,
        async first() { return sql.prepare(source).get(...values) || null; },
        async all() { return { results: sql.prepare(source).all(...values) }; },
        async run() {
          if (beforeRun) await beforeRun(source, values);
          return { meta: { changes: Number(sql.prepare(source).run(...values).changes) } };
        },
      };
    } };
  },
  async batch(statements) {
    if (beforeDeletionBatch && statements[0].source.includes("SET state='deleting'")) {
      const hook = beforeDeletionBatch; beforeDeletionBatch = null; await hook();
    }
    sql.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map(({ source, values }) => ({ meta: { changes: Number(sql.prepare(source).run(...values).changes) } }));
      sql.exec('COMMIT'); return results;
    } catch (error) { sql.exec('ROLLBACK'); throw error; }
  },
};
let dispatch = async () => '事件已送达';
const emptyTools = { outputRecoveryTools: [], outputRecoveryNames: new Set(), articleClaimRecoveryTools: [], articleClaimRecoveryNames: new Set(), articleUploadTools: [], articleUploadToolNames: new Set() };
const stubs = {
  './article-format': { MAX_FILE: 20_000_000, parseArticle: () => ['测试标题', '人工正文'] },
  './article-deliveries': { deliveryList: async (owner, id) => sql.prepare('SELECT * FROM article_deliveries WHERE owner=? AND article_id=?').all(owner, id) },
  './article-upload-diagnostics': { uploadDiagnosticTool: {}, uploadProgress: async () => ({}) },
  './article-output-recovery': emptyTools,
  './article-claim-recovery': emptyTools,
  './article-upload-attempts': emptyTools,
  './article-file-handoff': {}, './article-manifest': {}, './article-cleanup': {}, './output-format': {},
  './article-state-transitions': {}, './editorial-credential-text': {},
  './events': { readiness: async () => ({ connected: true }), dispatch: (...args) => dispatch(...args) },
  'cloudflare:workers': { env: { DB: db, BUCKET: bucket } },
};
const modules = new Map();
function load(filename) {
  filename = path.normalize(filename);
  if (modules.has(filename)) return modules.get(filename);
  const exports = {}; modules.set(filename, exports);
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, { exports, require: dependency => {
    if (Object.hasOwn(stubs, dependency)) return stubs[dependency];
    if (dependency.startsWith('.')) return load(path.join(path.dirname(filename), dependency + '.ts'));
    return nativeRequire(dependency);
  }, crypto: webcrypto, Date, JSON, Promise, Error, Set, Map, Array, Number, String, RegExp, TextEncoder, TextDecoder, Request, Response, URL });
  return exports;
}
const { deleteArticlePermanently, previewArticleDeletion, articleDeletionTools } = load('lib/article-deletion.ts');
const { articleList, createArticle } = load('lib/articles.ts');
const { articleCall } = load('lib/article-tools.ts');
const { notifyArticle } = load('lib/article-handoff.ts');
const { POST } = load('app/api/articles/[id]/delete/route.ts');
const now = new Date().toISOString();
const future = new Date(Date.now() + 3600000).toISOString();
const past = '2000-01-01T00:00:00.000Z';
const owner = 'owner-a';
let sequence = 0;
function addArticle(overrides = {}) {
  const row = { id: `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`, owner, title: '人工排队稿', state: 'queued', claim_token: null, claim_expires: null, result_key: null, result_meta: null, artifact_manifest: null, draft_url: null, draft_readback: null, ...overrides };
  row.source_key ??= `articles/${row.id}/source`;
  sql.prepare(`INSERT INTO articles(id,owner,title,filename,source_key,paragraphs,created,state,claim_token,claim_expires,result_key,result_meta,artifact_manifest,draft_url,draft_readback)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(row.id, row.owner, row.title, '人工稿.docx', row.source_key, '["人工排队稿","正文"]', now, row.state, row.claim_token, row.claim_expires, row.result_key, row.result_meta, row.artifact_manifest, row.draft_url, row.draft_readback);
  objects.set(row.source_key, Uint8Array.from([1, 2, 3])); return row;
}
function args(row) { return { article_id: row.id, confirm_article_id: row.id, confirm_title: row.title, confirm_permanent: true }; }
function get(row) { return sql.prepare('SELECT * FROM articles WHERE id=?').get(row.id); }
function audit(row) { return sql.prepare('SELECT * FROM article_deletions WHERE id=?').get(row.id); }
async function blocked(row, reason) {
  const before = JSON.stringify(get(row)), keys = [...objects.keys()];
  assert.equal((await previewArticleDeletion(owner, row.id)).deletion_supported, false);
  await assert.rejects(deleteArticlePermanently(owner, args(row)), reason);
  assert.equal(JSON.stringify(get(row)), before); assert.deepEqual([...objects.keys()], keys); assert.equal(audit(row), undefined);
  assert.equal((await articleList(owner, 50, [row.id]))[0].deletion_supported, false);
}
function addAttempt(row, state = 'reserved') {
  sql.prepare(`INSERT INTO article_upload_attempts(id,owner,article_id,platform,target_account,word_sha256,word_size,authorization_kind,claim_hash,preflight,baseline,state,editor_urls,created,updated)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(webcrypto.randomUUID(), owner, row.id, 'toutiao', 'test-account', 'a'.repeat(64), 1, 'manual_task', 'b'.repeat(64), '{}', '{}', state, '[]', now, now);
}
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }

const tool = articleDeletionTools.find(item => item.name === 'delete_article_permanently');
assert.equal(Array.from(tool.inputSchema.required).join(','), 'article_id,confirm_article_id,confirm_title,confirm_permanent');
assert.equal(tool.annotations.destructiveHint, true); assert.equal(tool.inputSchema.properties.confirm_permanent.const, true);
const target = addArticle(), neighbour = addArticle({ title: target.title });
assert.equal((await previewArticleDeletion(owner, target.id)).deletion_supported, true);
assert.equal((await articleList(owner, 50, [target.id]))[0].deletion_supported, true);
await assert.rejects(deleteArticlePermanently('owner-b', args(target)), /不存在或无权访问/);
await assert.rejects(previewArticleDeletion('owner-b', target.id), /不存在或无权访问/);
await assert.rejects(deleteArticlePermanently(owner, { ...args(target), confirm_title: '相似标题' }), /标题已变化/);
await assert.rejects(deleteArticlePermanently(owner, { ...args(target), confirm_article_id: neighbour.id }), /确认永久删除/);
await assert.rejects(deleteArticlePermanently(owner, { ...args(target), confirm_permanent: false }), /确认永久删除/);
assert.equal(get(target).state, 'queued'); assert.equal(audit(target), undefined);
assert.equal((await deleteArticlePermanently(owner, args(target))).files_deleted, 1);
assert.equal(get(target), undefined); assert.equal(audit(target).state, 'deleted');
assert.equal(objects.has(target.source_key), false); assert.equal(objects.has(neighbour.source_key), true); assert.equal(get(neighbour).state, 'queued');
assert.equal((await deleteArticlePermanently(owner, args(target))).already_deleted, true);
assert.equal((await previewArticleDeletion(owner, target.id)).deleted, true);
console.log('PASS queued no-claim exact-ID/title/permanent deletion; owner isolation, same-title neighbour and idempotent tombstone');

for (const fields of [
  { claim_token: 'live', claim_expires: future }, { claim_token: 'expired', claim_expires: past },
  { claim_token: 'unknown', claim_expires: null }, { claim_token: 'invalid', claim_expires: 'invalid-date' },
  { claim_token: '', claim_expires: past }, { claim_expires: future }, { claim_expires: past },
  { state: 'processing' }, { state: 'processing', claim_token: 'expired', claim_expires: past }, { state: 'toutiao_saving' },
]) await blocked(addArticle(fields), /仍在处理中/);
for (const fields of [
  { result_key: 'result' }, { result_meta: '{}' }, { artifact_manifest: '{}' }, { draft_url: 'https://example.com' }, { draft_readback: '{}' },
]) await blocked(addArticle(fields), /已生成或准备/);
await blocked(addArticle({ source_key: 'other/article/source' }), /人工上传的原始文件/);
console.log('PASS every queued claim trace, active processing, output, manifest, draft receipt and non-manual source blocked');

for (const state of ['reserved', 'outcome_unknown', 'draft_observed', 'verified']) {
  const row = addArticle(); addAttempt(row, state); await blocked(row, /平台上传尝试/);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM article_upload_attempts WHERE article_id=?').get(row.id).n, 1);
}
const delivery = addArticle();
sql.prepare('INSERT INTO article_deliveries(id,owner,article_id,platform,state,updated) VALUES(?,?,?,?,?,?)').run('delivery-test', owner, delivery.id, 'zhihu', 'failed', now);
await blocked(delivery, /平台交付记录/);
const writing = addArticle();
sql.prepare('INSERT INTO writing_runs(id,owner,day,writer,run_kind,state,article_id,created,updated) VALUES(?,?,?,?,?,?,?,?,?)').run('writing-test', owner, '2026-10-08', 'xiaoyu', 'daily', 'failed', writing.id, now, now);
await blocked(writing, /写作配额或生成记录/);
for (const table of ['editorial_flows', 'outline_flows']) {
  const row = addArticle();
  sql.prepare(`INSERT INTO ${table}(id,owner,authorization_key,article_id,snapshot,snapshot_sha256,state,expires,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(table, owner, table, row.id, '{}', 'a'.repeat(64), 'failed', future, now, now);
  await blocked(row, /关联生成记录/);
}
const generated = addArticle();
sql.prepare('INSERT INTO editorial_runs_v3(id,owner,authority_id,request_key,run_kind,day,writer,input_json,input_sha256,snapshot_json,snapshot_sha256,state,article_id,expires,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('generated-test', owner, 'authority', 'request', 'daily', '2026-10-08', 'xiaoyu', '{}', 'a'.repeat(64), '{}', 'a'.repeat(64), 'failed', generated.id, future, now, now);
await blocked(generated, /关联生成记录/);
console.log('PASS all upload-attempt states, delivery and writing/editorial/outline lineage blocked; audit and quotas retained');

const temporary = addArticle();
const temporaryKey = `articles/${temporary.id}/output/${webcrypto.randomUUID()}/0-${'a'.repeat(64)}`;
objects.set(temporaryKey, Uint8Array.from([4]));
assert.equal((await previewArticleDeletion(owner, temporary.id)).deletion_supported, false);
await assert.rejects(deleteArticlePermanently(owner, args(temporary)), /成稿或临时处理文件/);
assert.equal(objects.has(temporary.source_key), true); assert.equal(objects.has(temporaryKey), true); assert.equal(audit(temporary), undefined);
const unsafe = addArticle(); objects.set(`articles/${unsafe.id}/unknown`, Uint8Array.from([5]));
assert.equal((await previewArticleDeletion(owner, unsafe.id)).deletion_supported, false);
await assert.rejects(deleteArticlePermanently(owner, args(unsafe)), /无法确认归属/);
assert.equal(objects.has(unsafe.source_key), true);
console.log('PASS preview and execution both reject R2-only temporary outputs and unsafe same-prefix keys');

const claimedFirst = addArticle(); let claimResult;
beforeDeletionBatch = async () => { claimResult = await articleCall(owner, 'claim_article', { article_id: claimedFirst.id }); };
await assert.rejects(deleteArticlePermanently(owner, args(claimedFirst)), /仍在处理中/);
assert.equal(claimResult.claimed, true); assert.equal(get(claimedFirst).state, 'processing'); assert.equal(audit(claimedFirst), undefined); assert.equal(objects.has(claimedFirst.source_key), true);
const deletedFirst = addArticle(), claimReached = deferred(), releaseClaim = deferred();
beforeRun = async source => {
  if (source.includes('INSERT OR IGNORE INTO article_claim_credential_hashes')) { beforeRun = null; claimReached.resolve(); await releaseClaim.promise; }
};
const lateClaim = articleCall(owner, 'claim_article', { article_id: deletedFirst.id });
await claimReached.promise;
assert.equal((await deleteArticlePermanently(owner, args(deletedFirst))).deleted, true);
releaseClaim.resolve(); assert.equal((await lateClaim).claimed, false);
assert.equal(get(deletedFirst), undefined); assert.equal(audit(deletedFirst).state, 'deleted'); assert.equal(objects.has(deletedFirst.source_key), false);
console.log('PASS actual claim/delete races in both orders: exactly one state CAS winner and no resurrection');

for (const dependency of ['upload', 'manifest', 'claim', 'source']) {
  const row = addArticle();
  beforeDeletionBatch = async () => {
    if (dependency === 'upload') addAttempt(row);
    if (dependency === 'manifest') sql.prepare('UPDATE articles SET artifact_manifest=? WHERE id=?').run('{}', row.id);
    if (dependency === 'claim') sql.prepare('UPDATE articles SET claim_token=?,claim_expires=? WHERE id=?').run('late-invalid', 'invalid-date', row.id);
    if (dependency === 'source') sql.prepare('UPDATE articles SET source_key=? WHERE id=?').run('other/source', row.id);
  };
  await assert.rejects(deleteArticlePermanently(owner, args(row)));
  assert.equal(audit(row), undefined); assert.equal(objects.has(row.source_key), true); assert.equal(get(row).state, 'queued');
}
console.log('PASS atomic fence rejects dependencies, invalid claims and source changes appearing after preflight');

const lateNotify = addArticle({ state: 'uploaded' }), dispatchReached = deferred(), releaseDispatch = deferred();
dispatch = async () => { dispatchReached.resolve(); await releaseDispatch.promise; return '事件已送达'; };
const notifying = notifyArticle(owner, lateNotify.id); await dispatchReached.promise;
assert.equal(get(lateNotify).state, 'queued');
assert.equal((await deleteArticlePermanently(owner, args(lateNotify))).deleted, true);
releaseDispatch.resolve(); await notifying;
assert.equal(get(lateNotify), undefined); assert.equal(audit(lateNotify).state, 'deleted');
assert.equal(sql.prepare('SELECT state FROM article_handoffs WHERE article_id=?').get(lateNotify.id).state, 'delivered');
await assert.rejects(articleCall(owner, 'claim_article', { article_id: lateNotify.id }), /没有找到此任务/);
await assert.rejects(notifyArticle(owner, lateNotify.id), /没有找到此任务/);
assert.equal(objects.has(lateNotify.source_key), false);
console.log('PASS actual late notification updates only retained handoff audit; no article recreation or late claim');

const retry = addArticle(); beforeDelete = async () => { beforeDelete = null; throw Error('simulated R2 failure'); };
await assert.rejects(deleteArticlePermanently(owner, args(retry)), /simulated R2 failure/);
assert.equal(get(retry).state, 'deleting'); assert.equal(audit(retry).lock_token, null); assert.equal(objects.has(retry.source_key), true);
await assert.rejects(articleCall(owner, 'claim_article', { article_id: retry.id }), /没有找到此任务/);
assert.equal((await deleteArticlePermanently(owner, args(retry))).deleted, true);
const race = addArticle();
const outcomes = await Promise.allSettled([deleteArticlePermanently(owner, args(race)), deleteArticlePermanently(owner, args(race))]);
assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1); assert.equal(audit(race).state, 'deleted');
console.log('PASS R2 failure leaves resumable deleting fence; duplicate deletes have one durable lease');

const routed = addArticle();
const request = (changes = {}, auth = owner, origin = 'https://test.example', upload = '1') => new Request(`https://test.example/api/articles/${routed.id}/delete`, { method: 'POST', headers: { ...(auth ? { 'oai-authenticated-user-id': auth } : {}), origin, 'x-xiaoyu-upload': upload, 'content-type': 'application/json' }, body: JSON.stringify({ ...args(routed), ...changes }) });
assert.equal((await POST(request({}, null), { params: { id: routed.id } })).status, 401);
assert.equal((await POST(request({}, owner, 'https://evil.example'), { params: { id: routed.id } })).status, 403);
assert.equal((await POST(request({}, owner, 'https://test.example', '0'), { params: { id: routed.id } })).status, 403);
assert.equal((await POST(request({ article_id: neighbour.id }), { params: { id: routed.id } })).status, 400);
assert.equal((await POST(request({}, 'owner-b'), { params: { id: routed.id } })).status, 404);
assert.equal((await POST(request({ confirm_title: '错误' }), { params: { id: routed.id } })).status, 409);
assert.equal(objects.has(routed.source_key), true);
assert.equal((await POST(request(), { params: Promise.resolve({ id: routed.id }) })).status, 200);
assert.equal(get(routed), undefined);
console.log('PASS unchanged HTTP route auth, same-origin/header, path ID, owner and exact title checks');

const manual = await createArticle(owner, new File(['正文'], 'intake.txt'));
assert.equal(manual.state, 'uploaded'); assert.equal((await previewArticleDeletion(owner, manual.id)).deletion_supported, true);
assert.equal((await deleteArticlePermanently(owner, { article_id: manual.id, confirm_article_id: manual.id, confirm_title: manual.title, confirm_permanent: true })).deleted, true);
const failed = addArticle({ state: 'failed', claim_token: 'finished', claim_expires: past });
assert.equal((await deleteArticlePermanently(owner, args(failed))).deleted, true);
console.log('PASS existing uploaded intake and expired failed-claim deletion retained; all queued regressions passed');
