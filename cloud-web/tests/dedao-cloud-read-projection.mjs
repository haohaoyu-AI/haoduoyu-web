// Actual cloud/read/credential modules and all migrations on isolated SQLite.
// Read projection only: no actor, subscription changes, R2, provider or network.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {createSyntheticHarness, sha256} from './word-recovery-harness.mjs';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
let h;
h = createSyntheticHarness({projectRoot, mocks: {
  './test-store': {db: () => h.d1},
  './articles': {bucket: () => h.bucket},
}});
const cloud = h.loader()('dedao-cloud');
const stamp = '2026-10-14T00:00:00.000Z';
const snapshot = () => JSON.stringify(h.sql.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all()
  .map(({name}) => [name, h.sql.prepare('SELECT * FROM "' + name.replaceAll('"', '""') + '"').all()]));
function article(owner, state, error = null, claim = null) {
  const id = randomUUID();
  h.sql.prepare('INSERT INTO articles(id,owner,title,filename,source_key,paragraphs,created,state,error,claim_token,claim_expires) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, owner, 'OFFLINE PRIVATE TITLE', 'offline.docx', `articles/${id}/source`, '["OFFLINE PRIVATE BODY"]', stamp,
      state, error, claim, claim ? '2099-01-01T00:00:00.000Z' : null);
  return id;
}
function task(owner, articleId = null, claim = null) {
  const id = randomUUID();
  h.sql.prepare('INSERT INTO dedao_cloud_requests(id,owner,request_key,state,conversation_url,article_id,dispatch_state,created,updated,claim_hash,execution_id,claim_expires) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, owner, randomUUID(), articleId ? 'processing' : 'queued', cloud.cloudConversation, articleId, 'accepted', stamp, stamp,
      claim ? sha256(claim) : null, claim ? 'OFFLINE-EXECUTION-FIXTURE' : null, claim ? '2099-01-01T00:00:00.000Z' : null);
  if (claim) h.sql.prepare('INSERT INTO article_claim_credential_hashes(owner,sha256,created) VALUES(?,?,?)').run(owner, sha256(claim), stamp);
  return id;
}
function delivery(owner, articleId, platform, state, message = null, claim = null, updated = stamp) {
  h.sql.prepare('INSERT INTO article_deliveries(id,owner,article_id,platform,state,message,claim_token,updated) VALUES(?,?,?,?,?,?,?,?)')
    .run(randomUUID(), owner, articleId, platform, state, message, claim, updated);
}
async function read(owner, taskId, module = cloud) {
  const before = snapshot(), result = await module.readCloudDedao(owner, taskId);
  assert.equal(snapshot(), before, 'the projection writes no table or credential');
  assert.equal(h.externalCalls, 0); assert.equal(h.objects.size, 0);
  return result;
}

try {
  await test('owner_scope is stable, opaque, account-specific and present before any task', async () => {
    const owner = 'OFFLINE-PROJECTION-OWNER', other = 'OFFLINE-PROJECTION-OTHER';
    const initial = await read(owner), expected = sha256('dedao-cloud-owner:' + owner);
    assert.equal(initial.owner_scope, expected); assert.equal(initial.task, null); assert.match(expected, /^[0-9a-f]{64}$/);
    const id = task(owner), exact = await read(owner, id);
    assert.equal(exact.owner_scope, expected); assert.equal(exact.task.downstream_status, 'not_bound');
    assert.equal((await read(owner, id, h.loader()('dedao-cloud'))).owner_scope, expected);
    assert.notEqual((await read(other)).owner_scope, expected);
    assert.ok(!JSON.stringify(exact).includes(owner)); assert.equal(exact.task.private_drafts_complete, false);
    await assert.rejects(read(other, id), /本人云端任务/);
  });

  for (const state of ['needs_login', 'failed', 'needs_verification']) {
    await test(`persisted ${state} is projected without changing orchestration or completion`, async () => {
      const owner = 'OFFLINE-PROJECTION-' + state, error = 'OFFLINE genuine persisted ' + state + ' detail';
      const id = article(owner, state, error), request = task(owner, id), view = await read(owner, request);
      assert.equal(view.task.state, 'processing'); assert.equal(view.task.article_state, state);
      assert.equal(view.task.article_error, error); assert.equal(view.task.downstream_status, 'available');
      assert.equal(view.task.private_drafts_complete, false); assert.deepEqual([...view.task.deliveries], []);
      assert.equal(view.task.writing_executor_registered, false); assert.equal(view.task.writer_ended, false);
    });
  }

  await test('same-owner latest-per-platform deliveries are bounded and exclude unrelated or foreign rows', async () => {
    const owner = 'OFFLINE-PROJECTION-DELIVERY', id = article(owner, 'word_ready'), request = task(owner, id);
    delivery(owner, id, 'toutiao', 'needs_login', 'OFFLINE Toutiao login required');
    delivery(owner, id, 'zhihu', 'saving', 'OFFLINE older status', null, '2026-10-13T00:00:00.000Z');
    delivery(owner, id, 'zhihu', 'needs_verification', 'OFFLINE Zhihu original draft needs checking');
    delivery(owner, id, 'baijiahao', 'failed', 'OFFLINE unrelated platform');
    delivery('OFFLINE-FOREIGN-DELIVERY', id, 'zhihu', 'saved', 'OFFLINE foreign private message');
    const view = await read(owner, request);
    assert.equal(view.task.article_state, 'word_ready'); assert.equal(view.task.private_drafts_complete, false);
    assert.deepEqual(JSON.parse(JSON.stringify(view.task.deliveries)), [
      {platform: 'toutiao', state: 'needs_login', message: 'OFFLINE Toutiao login required'},
      {platform: 'zhihu', state: 'needs_verification', message: 'OFFLINE Zhihu original draft needs checking'},
    ]);
    assert.ok(!JSON.stringify(view).includes('older status')); assert.ok(!JSON.stringify(view).includes('foreign private'));
    assert.ok(!JSON.stringify(view).includes('unrelated platform'));
    assert.deepEqual(Object.keys(view.task.deliveries[0]).sort(), ['message', 'platform', 'state']);
  });

  await test('foreign or missing bound article metadata is unavailable and discloses no private detail', async () => {
    const owner = 'OFFLINE-PROJECTION-BOUND', foreignId = article('OFFLINE-FOREIGN-ARTICLE', 'failed', 'OFFLINE FOREIGN PRIVATE ERROR');
    for (const id of [foreignId, randomUUID()]) {
      // Fixture-only invalid historical binding; no bind/claim authorization is granted.
      const request = task(owner + id, id), view = await read(owner + id, request);
      assert.equal(view.task.downstream_status, 'unavailable'); assert.equal(view.task.article_state, null);
      assert.equal(view.task.article_error, null); assert.equal(view.task.private_drafts_complete, false);
      assert.deepEqual([...view.task.deliveries], []); assert.ok(!JSON.stringify(view).includes('FOREIGN PRIVATE ERROR'));
    }
  });

  await test('optional metadata read failure reports unavailable without failing or modifying the cloud task', async () => {
    const owner = 'OFFLINE-PROJECTION-READ-FAULT', id = article(owner, 'failed', 'OFFLINE normal persisted error'), request = task(owner, id);
    h.on({method: 'first', match: 'SELECT state,error,claim_token FROM articles', action: () => { throw Error('OFFLINE PRIVATE SQL DETAIL'); }});
    const view = await read(owner, request);
    assert.equal(view.task.state, 'processing'); assert.equal(view.task.downstream_status, 'unavailable');
    assert.equal(view.task.article_state, null); assert.equal(view.task.article_error, null);
    assert.ok(!JSON.stringify(view).includes('PRIVATE SQL DETAIL'));
    assert.equal((await read(owner, request)).task.article_state, 'failed');
  });

  await test('optional delivery metadata failure reports unavailable and preserves the original holder', async () => {
    const owner = 'OFFLINE-PROJECTION-DELIVERY-FAULT', token = randomUUID(), id = article(owner, 'needs_login'), request = task(owner, id, token);
    delivery(owner, id, 'zhihu', 'failed', 'OFFLINE persisted platform failure');
    h.on({method: 'all', match: 'FROM article_deliveries d WHERE d.owner=?', action: () => { throw Error('OFFLINE PRIVATE DELIVERY SQL DETAIL'); }});
    const view = await read(owner, request);
    assert.equal(view.task.id, request); assert.equal(view.task.downstream_status, 'unavailable');
    assert.equal(view.task.writing_executor_registered, true); assert.equal(view.task.state, 'processing');
    assert.ok(!JSON.stringify(view).includes('PRIVATE DELIVERY SQL DETAIL'));
    assert.equal((await read(owner, request)).task.deliveries[0].state, 'failed');
  });

  await test('credential lookup failure hides unverified text and preserves readable status', async () => {
    const owner = 'OFFLINE-PROJECTION-CREDENTIAL-FAULT', candidate = randomUUID();
    const id = article(owner, 'failed', 'OFFLINE unverified detail ' + candidate), request = task(owner, id);
    h.on({method: 'all', match: 'WITH candidates(digest)', action: () => { throw Error('OFFLINE PRIVATE CREDENTIAL SQL DETAIL'); }});
    const view = await read(owner, request);
    assert.equal(view.task.article_state, 'failed'); assert.equal(view.task.downstream_status, 'available');
    assert.equal(view.task.article_error, '敏感内容已隐藏'); assert.equal(view.task.private_drafts_complete, false);
    assert.ok(!JSON.stringify(view).includes(candidate)); assert.ok(!JSON.stringify(view).includes('PRIVATE CREDENTIAL SQL DETAIL'));
  });

  await test('current article/delivery and remembered cloud credentials are redacted, including encoded forms', async () => {
    const owner = 'OFFLINE-PROJECTION-CREDENTIALS', articleToken = randomUUID(), deliveryToken = randomUUID(), cloudToken = randomUUID();
    const encoded = cloudToken.replaceAll('-', '%2D');
    const id = article(owner, 'needs_login', 'OFFLINE error ' + articleToken + ' ' + encoded, articleToken), request = task(owner, id, cloudToken);
    delivery(owner, id, 'zhihu', 'failed', 'OFFLINE delivery ' + deliveryToken, deliveryToken);
    const view = await read(owner, request), serialized = JSON.stringify(view);
    assert.equal(view.task.article_error, '敏感内容已隐藏'); assert.equal(view.task.deliveries[0].message, '敏感内容已隐藏');
    for (const secret of [articleToken, deliveryToken, cloudToken, encoded, sha256(cloudToken)]) assert.ok(!serialized.includes(secret));
    for (const field of ['claim_token', 'claim_hash', 'claim_expires', 'execution_id', 'source_key', 'paragraphs', 'filename', 'draft_url'])
      assert.equal(Object.hasOwn(view.task, field), false);
  });

  await test('provider credentials and oversized errors never appear as truncated credential fragments', async () => {
    const owner = 'OFFLINE-PROJECTION-BOUND-TEXT', apiKey = 'sk-ant-' + 'x'.repeat(32);
    const id = article(owner, 'failed', 'OFFLINE provider error ' + apiKey), request = task(owner, id);
    delivery(owner, id, 'zhihu', 'failed', 'OFFLINE-OVERSIZE-' + 'z'.repeat(700));
    for (const secret of [apiKey, apiKey.replaceAll('-', '%2D'), apiKey.replaceAll('-', '\\u002d'),
      'access_token=' + 'q'.repeat(32), 'secret%3D' + 'r'.repeat(32)]) {
      h.sql.prepare('UPDATE articles SET error=? WHERE owner=? AND id=?').run('OFFLINE provider error ' + secret, owner, id);
      const view = await read(owner, request);
      assert.equal(view.task.article_error, '敏感内容已隐藏'); assert.equal(view.task.deliveries[0].message, '详细状态请查看原文章任务');
      assert.ok(!JSON.stringify(view).includes(secret)); assert.ok(!JSON.stringify(view).includes('OFFLINE-OVERSIZE-'));
    }
  });

  await test('unknown stored state projects unknown rather than arbitrary metadata', async () => {
    const owner = 'OFFLINE-PROJECTION-STATE', secret = 'OFFLINE PRIVATE UNRECOGNIZED STATE';
    const id = article(owner, secret), request = task(owner, id); delivery(owner, id, 'zhihu', secret);
    const view = await read(owner, request);
    assert.equal(view.task.article_state, 'unknown'); assert.equal(view.task.deliveries[0].state, 'unknown');
    assert.ok(!JSON.stringify(view).includes(secret)); assert.equal(view.task.private_drafts_complete, false);
  });

  await test('saved downstream labels cannot invent verified Word/private drafts or permit finishing', async () => {
    const owner = 'OFFLINE-PROJECTION-FINISH', token = randomUUID(), id = article(owner, 'completed'), request = task(owner, id, token);
    delivery(owner, id, 'zhihu', 'saved', 'OFFLINE saved label without real receipt');
    const before = snapshot(), view = await read(owner, request);
    assert.equal(view.task.article_state, 'completed'); assert.equal(view.task.deliveries[0].state, 'saved');
    assert.equal(view.task.state, 'processing'); assert.equal(view.task.private_drafts_complete, false);
    await assert.rejects(cloud.finishCloudDedao(owner, {task_id: request, claim_token: token, execution_id: 'OFFLINE-EXECUTION-FIXTURE',
      all_writer_actions_settled: true, end_reference: 'OFFLINE-END-ATTESTATION'}), /两平台私人草稿仍未完成/);
    assert.equal(snapshot(), before); assert.equal(h.externalCalls, 0);
  });
} finally { h.close(); }
