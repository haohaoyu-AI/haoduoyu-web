import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';

const nativeRequire = createRequire(import.meta.url);
const sql = new DatabaseSync(':memory:');
for (const file of fs.readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort()) {
  sql.exec(fs.readFileSync(`drizzle/${file}`, 'utf8'));
}

const objects = new Map();
let failDeleteAt = 0;
let deleteCalls = 0;
let listCalls = 0;
let injectOnListCall = 0;
let injectedKey = '';
const bucket = {
  async list({ prefix, cursor, limit = 1000 }) {
    listCalls++;
    if (injectOnListCall === listCalls) objects.set(injectedKey, Uint8Array.from([8]));
    const keys = [...objects.keys()].filter(key => key.startsWith(prefix)).sort();
    const offset = cursor ? Number(cursor) : 0;
    const page = keys.slice(offset, offset + limit).map(key => ({ key, size: objects.get(key).length }));
    const next = offset + page.length;
    return { objects: page, truncated: next < keys.length, ...(next < keys.length ? { cursor: String(next) } : {}) };
  },
  async delete(key) {
    deleteCalls++;
    if (failDeleteAt && deleteCalls === failDeleteAt) throw new Error('simulated object store failure');
    objects.delete(key);
  },
};

const db = {
  prepare(source) {
    return {
      bind(...values) {
        return {
          async first() { return sql.prepare(source).get(...values) || null; },
          async all() { return { results: sql.prepare(source).all(...values) }; },
          async run() { return { meta: { changes: Number(sql.prepare(source).run(...values).changes) } }; },
        };
      },
    };
  },
  async batch(statements) {
    sql.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map(statement => {
        const result = sql.prepare(statement.source).run(...statement.values);
        return { meta: { changes: Number(result.changes) } };
      });
      sql.exec('COMMIT');
      return results;
    } catch (error) {
      sql.exec('ROLLBACK');
      throw error;
    }
  },
};

// Retain SQL and bindings so batch() can model the D1 transaction used by deletion.
const prepare = db.prepare.bind(db);
db.prepare = source => {
  const statement = prepare(source);
  const bind = statement.bind.bind(statement);
  statement.bind = (...values) => Object.assign(bind(...values), { source, values });
  return statement;
};

const modules = {};
function load(name) {
  if (modules[name]) return modules[name];
  const exports = {};
  modules[name] = exports;
  const source = fs.readFileSync(`lib/${name}.ts`, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, {
    exports,
    require: dependency => {
      if (dependency === './test-store') return { db: () => db };
      if (dependency === './articles') return { bucket: () => bucket };
      if (dependency === './article-upload-diagnostics') return {uploadProgress:async()=>[]};
      if (dependency === './article-deliveries') return { deliveryList: async () => [] };
      if (dependency === './article-format') return { parseArticle: () => [], MAX_FILE: 20_000_000 };
      if (dependency === 'cloudflare:workers') return { env: { DB: db, BUCKET: bucket } };
      if(dependency.startsWith('./') && fs.existsSync(`lib/${dependency.slice(2)}.ts`)) return load(dependency.slice(2));
      return nativeRequire(dependency);
    },
    crypto: webcrypto,
    Date, JSON, Promise, Error, Set, Map, Array, Number, String, RegExp, TextEncoder, TextDecoder, URL,
  });
  return exports;
}

const { deleteArticlePermanently, previewArticleDeletion, articleDeletionTools } = load('article-deletion');
const articles = load('articles');
const deletionTool = articleDeletionTools.find(tool => tool.name === 'delete_article_permanently');
assert.equal(deletionTool.annotations.destructiveHint, true);
assert.equal(Array.from(deletionTool.inputSchema.required).join(','), 'article_id,confirm_article_id,confirm_title,confirm_permanent');
assert.equal(deletionTool.inputSchema.properties.confirm_permanent.const, true);
const now = new Date().toISOString();
const oldId = 'bf193e00-c221-4032-807f-f6e9e3bc9b38';
const sameTitleNewId = '0d84a0a2-96ae-43ee-9700-427925a4725a';
const title = '169块金牌盖不住一块短板，央媒急了，三大球的病根不在教练';
const sourceKey = `articles/${oldId}/source`;

function addArticle({ id, owner = 'owner-a', state = 'failed', claimToken = 'finished-claim', claimExpires = '2000-01-01T00:00:00.000Z', customTitle = title, source = `articles/${id}/source`, result = null, resultMeta = null }) {
  sql.prepare(`INSERT INTO articles(id,owner,title,filename,source_key,paragraphs,created,state,claim_token,claim_expires,result_key,result_meta)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, owner, customTitle, `${id}.docx`, source, JSON.stringify([customTitle, '正文']), now, state, claimToken, claimExpires, result, resultMeta);
}
function addObject(key, bytes = [1, 2, 3]) { objects.set(key, Uint8Array.from(bytes)); }
function confirmation(id, currentTitle = title) { return { article_id: id, confirm_article_id: id, confirm_title: currentTitle, confirm_permanent: true }; }

// The old uploaded target has no output/manifest/delivery/write-run links; same-title replacement is active and untouched.
addArticle({ id: oldId, state: 'failed' });
addArticle({ id: sameTitleNewId, state: 'processing', claimToken: 'new-active-claim', claimExpires: new Date(Date.now() + 60000).toISOString() });
addObject(sourceKey);
addObject(`articles/${sameTitleNewId}/source`, [9]);
sql.prepare(`INSERT INTO writing_runs(id,owner,day,writer,run_kind,state,article_id,created,updated) VALUES(?,?,?,?,?,?,?,?,?)`).run('new-run', 'owner-a', '2026-10-05', 'claude', 'daily', 'writing', sameTitleNewId, now, now);

const listedArticles = await articles.articleList('owner-a', 50);
assert.equal(listedArticles.find(item => item.id === oldId).deletion_supported, true);
assert.equal(listedArticles.find(item => item.id === sameTitleNewId).deletion_supported, false);

const beforeObjects = objects.size;
await assert.rejects(deleteArticlePermanently('owner-a', { ...confirmation(oldId), confirm_permanent: false }), /确认永久删除/);
await assert.rejects(deleteArticlePermanently('owner-a', { ...confirmation(oldId), confirm_article_id: sameTitleNewId }), /确认永久删除/);
await assert.rejects(deleteArticlePermanently('owner-a', confirmation(oldId, '相似但不相同')) , /标题已变化/);
await assert.rejects(deleteArticlePermanently('owner-b', confirmation(oldId)), /不存在或无权访问/);
assert.equal(objects.size, beforeObjects);
assert.equal((await articles.article('owner-a', oldId)).state, 'failed');

const preview = await previewArticleDeletion('owner-a', oldId);
assert.equal(preview.article_id, oldId);
assert.equal(preview.title, title);
assert.equal(preview.deletion_supported, true);
assert.equal(preview.delivery_records, 0);
assert.equal(preview.writing_runs, 0);
await assert.rejects(previewArticleDeletion('owner-b', oldId), /不存在或无权访问/);

const deleted = await deleteArticlePermanently('owner-a', confirmation(oldId));
assert.deepEqual({ id: deleted.article_id, deleted: deleted.deleted, count: deleted.files_deleted, deliveries: deleted.delivery_records_removed, runs: deleted.writing_runs_removed },
  { id: oldId, deleted: true, count: 1, deliveries: 0, runs: 0 });
assert.equal(objects.size, beforeObjects - 1);
assert.equal(objects.has(`articles/${sameTitleNewId}/source`), true);
assert.equal(sql.prepare('SELECT count(*) AS n FROM articles WHERE id=?').get(oldId).n, 0);
assert.equal(sql.prepare('SELECT count(*) AS n FROM article_deliveries WHERE article_id=?').get(oldId).n, 0);
assert.equal(sql.prepare('SELECT count(*) AS n FROM writing_runs WHERE article_id=?').get(oldId).n, 0);
assert.equal(sql.prepare('SELECT count(*) AS n FROM articles WHERE id=? AND title=?').get(sameTitleNewId, title).n, 1);
assert.equal(sql.prepare('SELECT state FROM writing_runs WHERE article_id=?').get(sameTitleNewId).state, 'writing');
assert.equal(sql.prepare('SELECT state,lock_token FROM article_deletions WHERE id=? AND owner=?').get(oldId, 'owner-a').state, 'deleted');
await assert.rejects(articles.article('owner-a', oldId), /没有找到此任务/);
addObject(sourceKey, [4]);
const incompletePreview = await previewArticleDeletion('owner-a', oldId);
assert.equal(incompletePreview.deleted, false);
assert.equal(incompletePreview.remaining_object_count, 1);
const retryAfterCommit = await deleteArticlePermanently('owner-a', confirmation(oldId));
assert.equal(retryAfterCommit.already_deleted, true);
assert.equal(retryAfterCommit.files_deleted, 1);
assert.equal(objects.has(sourceKey), false);
const completePreview = await previewArticleDeletion('owner-a', oldId);
assert.equal(completePreview.deleted, true);
assert.equal(completePreview.remaining_object_count, 0);
console.log('Exact-ID deletion removed only the confirmed unprocessed upload; no writing/quota rows were deleted and the same-title active replacement remained intact');

// Active article/delivery/writing work blocks before the deletion fence and leaves data untouched.
const processingId = '45208aca-1e4a-46df-bf9f-9bb17f0a27df';
addArticle({ id: processingId, state: 'processing', claimToken: 'live', claimExpires: new Date(Date.now() + 60000).toISOString() });
addObject(`articles/${processingId}/source`);
await assert.rejects(deleteArticlePermanently('owner-a', confirmation(processingId)), /仍在处理中/);
assert.equal(sql.prepare('SELECT state FROM articles WHERE id=?').get(processingId).state, 'processing');
assert.equal(objects.has(`articles/${processingId}/source`), true);

const deliveryId = '110e8400-e29b-41d4-a716-446655440000';
addArticle({ id: deliveryId, state: 'failed', claimToken: null, claimExpires: null });
addObject(`articles/${deliveryId}/source`);
sql.prepare(`INSERT INTO article_deliveries(id,owner,article_id,platform,state,claim_token,claim_expires,updated) VALUES(?,?,?,?,?,?,?,?)`).run(`${deliveryId}:zhihu`, 'owner-a', deliveryId, 'zhihu', 'needs_verification', 'active-delivery-lease', new Date(Date.now() + 60_000).toISOString(), now);
await assert.rejects(deleteArticlePermanently('owner-a', confirmation(deliveryId)), /已有平台交付记录/);
assert.equal(sql.prepare('SELECT state FROM articles WHERE id=?').get(deliveryId).state, 'failed');

const writingId = '7b7c2fd1-173a-4b76-96ba-829c5109c66d';
addArticle({ id: writingId, state: 'failed', claimToken: null, claimExpires: null });
addObject(`articles/${writingId}/source`);
sql.prepare(`INSERT INTO writing_runs(id,owner,day,writer,run_kind,state,article_id,created,updated) VALUES(?,?,?,?,?,?,?,?,?)`).run('active-run', 'owner-a', '2026-10-05', 'xiaoyu', 'workflow_test', 'writing', writingId, now, now);
await assert.rejects(deleteArticlePermanently('owner-a', confirmation(writingId)), /关联写作配额或生成记录/);
assert.equal(objects.has(`articles/${writingId}/source`), true);
console.log('Active processing, any platform-delivery row, and any writing-run/quota association block this narrow upload-only deletion');

// Output metadata and generated-text parts are never eligible for this upload-only path.
const outputIdCase = 'c15ae2d5-0a3f-44d4-8ab7-7841f32c88e0';
const outputCase = 'f7b5e06a-5264-4490-9e30-c9e8f74531cf';
const outputPart = `articles/${outputCase}/output/${outputIdCase}/0-${'e'.repeat(64)}`;
addArticle({ id: outputCase, state: 'failed', resultMeta: JSON.stringify({ output_id: outputIdCase, parts: [{ key: outputPart }] }) });
addObject(`articles/${outputCase}/source`); addObject(outputPart);
await assert.rejects(deleteArticlePermanently('owner-a', confirmation(outputCase)), /已生成或准备/);
assert.equal(sql.prepare('SELECT state FROM articles WHERE id=?').get(outputCase).state, 'failed');
assert.equal(objects.has(outputPart), true);

// Keep generated-attempt/quota rows and their unique writing slot intact.
const generatedId = '4c8185f1-3c81-4320-a218-0ed6c4b32db5';
addArticle({ id: generatedId, state: 'failed' });
addObject(`articles/${generatedId}/source`);
sql.prepare(`INSERT INTO writing_runs(id,owner,day,writer,run_kind,state,article_id,created,updated) VALUES(?,?,?,?,?,?,?,?,?)`).run('generated-run', 'owner-a', '2026-10-06', 'claude', 'daily', 'failed', generatedId, now, now);
sql.prepare(`INSERT INTO claude_attempts(id,owner,day,state,response,created) VALUES(?,?,?,?,?,?)`).run('owner-a:2026-10-06', 'owner-a', '2026-10-06', 'completed', JSON.stringify({ text: 'generated content' }), now);
await assert.rejects(deleteArticlePermanently('owner-a', confirmation(generatedId)), /关联写作配额或生成记录/);
assert.equal(sql.prepare('SELECT count(*) AS n FROM writing_runs WHERE article_id=?').get(generatedId).n, 1);
assert.equal(sql.prepare('SELECT response FROM claude_attempts WHERE id=?').get('owner-a:2026-10-06').response, JSON.stringify({ text: 'generated content' }));
assert.equal(objects.has(`articles/${generatedId}/source`), true);

// A transient object-store failure is visible and leaves a fenced, retryable record rather than success.
const retryId = '8f3d9fbd-f140-43d9-8bda-637560600505';
addArticle({ id: retryId, state: 'failed', claimToken: null, claimExpires: null });
addObject(`articles/${retryId}/source`, [1]);
deleteCalls = 0; failDeleteAt = 1;
await assert.rejects(deleteArticlePermanently('owner-a', confirmation(retryId)), /simulated object store failure/);
failDeleteAt = 0;
assert.equal(sql.prepare('SELECT state FROM articles WHERE id=?').get(retryId).state, 'deleting');
assert.equal(sql.prepare('SELECT state,lock_token FROM article_deletions WHERE id=?').get(retryId).state, 'deleting');
assert.equal(sql.prepare('SELECT count(*) AS n FROM articles WHERE id=?').get(retryId).n, 1);
const recovered = await deleteArticlePermanently('owner-a', confirmation(retryId));
assert.equal(recovered.deleted, true);
assert.equal(objects.has(`articles/${retryId}/source`), false);
console.log('R2 failure did not report success; same-ID retry resumed and verified the exact uploaded-source prefix empty');

// A newly appearing same-prefix object is rejected at the deletion pass, never deleted as collateral.
const lateObjectId = 'a73a73a7-1fa0-4c11-9a83-10dc4305aa10';
const lateSourceKey = `articles/${lateObjectId}/source`;
const lateUnexpectedKey = `articles/${lateObjectId}/result-${'f'.repeat(64)}.docx`;
addArticle({ id: lateObjectId, state: 'uploaded', claimToken: null, claimExpires: null });
addObject(lateSourceKey);
listCalls = 0; injectOnListCall = 3; injectedKey = lateUnexpectedKey;
await assert.rejects(deleteArticlePermanently('owner-a', confirmation(lateObjectId)), /非原始上传文件/);
injectOnListCall = 0;
assert.equal(objects.has(lateSourceKey), true);
assert.equal(objects.has(lateUnexpectedKey), true);
assert.equal(sql.prepare('SELECT state FROM articles WHERE id=?').get(lateObjectId).state, 'deleting');
objects.delete(lateUnexpectedKey);
assert.equal((await deleteArticlePermanently('owner-a', confirmation(lateObjectId))).deleted, true);
assert.equal(objects.has(lateSourceKey), false);
console.log('Per-pass R2 key check rejects a late non-source object without deleting either key; same-ID retry completes after the unexpected object is resolved');

// Two simultaneous submissions get only one durable deletion lease.
const raceId = 'c80d07f4-8382-4e08-9ec0-26204418d8fb';
addArticle({ id: raceId, state: 'uploaded', claimToken: null, claimExpires: null });
addObject(`articles/${raceId}/source`);
const race = await Promise.allSettled([
  deleteArticlePermanently('owner-a', confirmation(raceId)),
  deleteArticlePermanently('owner-a', confirmation(raceId)),
]);
assert.equal(race.filter(item => item.status === 'fulfilled').length, 1);
assert.equal(race.filter(item => item.status === 'rejected').length, 1);
assert.equal(sql.prepare('SELECT state FROM article_deletions WHERE id=?').get(raceId).state, 'deleted');
console.log('Concurrent duplicate confirmations are fenced by one deletion lease');
