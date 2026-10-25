// Phase 2A boundary only: schema support does not enable draft APIs or nullable
// article statistics. No overview/list/index/due-review request is made here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './harness.mjs';

const base = '/api/v1/articles';
const pipelineMetadata = {
  slot: 'zh1', run_dir: 'synthetic/phase2a', run_date: '2001-01-01', series_no: 1,
  writer: 'human', illustrator: 'codex', sample_json: '{"source":"synthetic"}',
  char_count: 1200, subheading_count: 2, image_count: 1, cover_desc: '合成封面说明',
  draft_ref_json: '{"ref":"synthetic-only"}', timings_json: '{"write_ms":10}',
  reruns_json: '{"attempts":1}', blockers_json: '[{"kind":"synthetic"}]',
  verify_items_json: '[{"item":"synthetic"}]',
};
const logicalMetadata = {
  sample: {source: 'synthetic'}, draft_ref: {ref: 'synthetic-only'},
  timings: {write_ms: 10}, reruns: {attempts: 1},
  blockers: [{kind: 'synthetic'}], verify_items: [{item: 'synthetic'}],
};

async function setup(t) {
  const app = await fixture(t), session = await app.login();
  const accounts = await app.request('/api/v1/accounts', {session});
  assert.equal(accounts.status, 200);
  const accountId = accounts.data[0].id;
  const input = (extra = {}) => ({
    account_id: accountId, title: '合成旧发布 API 边界',
    url: 'https://example.invalid/phase2a/' + randomUUID(),
    published_at: '2001-01-01T00:00:00Z', production_mode: 'manual', ...extra,
  });
  const create = body => app.request(base, {method: 'POST', session, body});
  const update = (id, body) => app.request(base + '/' + id, {method: 'PUT', session, body});
  const stored = id => app.db.prepare('SELECT * FROM matrix_articles WHERE id=?').bind(id).first();
  const snapshot = async () => ({
    rows: (await app.db.prepare('SELECT * FROM matrix_articles ORDER BY id').all()).results,
    revision: (await app.db.prepare('SELECT revision FROM matrix_control WHERE id=1').first()).revision,
    audit: (await app.db.prepare('SELECT count(*) AS n FROM matrix_audit').first()).n,
    idempotency: (await app.db.prepare('SELECT count(*) AS n FROM matrix_idempotency').first()).n,
  });
  return {...app, session, accountId, input, create, update, stored, snapshot};
}

function rejected(response, label) {
  assert.equal(response.status, 400, label + ': normal article API must reject pending pipeline input');
  assert.equal(response.json?.error?.code, 'VALIDATION_ERROR', label);
  assert.equal(Object.hasOwn(response.json || {}, 'data'), false, label);
}

test('legacy article POST omission and explicit published still create actual published rows', async t => {
  const app = await setup(t);
  for (const extra of [{}, {status: 'published'}]) {
    const input = app.input(extra), result = await app.create(input);
    assert.equal(result.status, 201, result.text);
    assert.equal(typeof result.data.id, 'string');
    // Phase 2A deliberately makes no new POST-response-field assertion.
    const row = await app.stored(result.data.id);
    assert.equal(row.status, 'published');
    assert.equal(row.url, input.url);
    assert.equal(row.published_at, new Date(input.published_at).toISOString());
    assert.equal(row.version, 1);
  }
});

test('legacy published PUT without status and with explicit published keeps its state and stored metadata', async t => {
  const app = await setup(t), created = await app.create(app.input());
  assert.equal(created.status, 201, created.text);
  const id = created.data.id;
  await app.db.prepare('UPDATE matrix_articles SET writer=?,slot=? WHERE id=?').bind('human', 'zh1', id).run();
  const before = await app.stored(id);
  const first = await app.update(id, {version: 1, title: '旧接口继续修改已发布记录'});
  assert.equal(first.status, 200, first.text);
  const second = await app.update(id, {version: 2, status: 'published', summary: '已发布概况'});
  assert.equal(second.status, 200, second.text);
  const after = await app.stored(id);
  assert.equal(after.status, 'published');
  assert.equal(after.version, 3);
  assert.equal(after.url, before.url);
  assert.equal(after.published_at, before.published_at);
  assert.equal(after.writer, 'human');
  assert.equal(after.slot, 'zh1');
});

test('normal article POST and PUT reject explicit null and every non-published lifecycle without writes', async t => {
  const app = await setup(t), created = await app.create(app.input());
  assert.equal(created.status, 201, created.text);
  const before = await app.snapshot();
  for (const status of [null, 'drafting', 'illustrated', 'draft_saved', 'failed', '', 'PUBLISHED', false, 0, {}, []]) {
    const label = 'status=' + JSON.stringify(status);
    rejected(await app.create(app.input({status})), 'POST ' + label);
    rejected(await app.update(created.data.id, {version: 1, status}), 'PUT ' + label);
  }
  assert.deepEqual(await app.snapshot(), before);
});

test('normal article APIs reject reserved stored and logical pipeline fields even when their value is null', async t => {
  const app = await setup(t), created = await app.create(app.input());
  assert.equal(created.status, 201, created.text);
  const before = await app.snapshot();
  // This independent list locks the exact Phase 2A boundary; it is not derived
  // from the implementation guard and cannot silently shrink with that guard.
  assert.equal(Object.keys(pipelineMetadata).length, 16);
  assert.equal(Object.keys(logicalMetadata).length, 6);
  for (const [field, example] of Object.entries({...pipelineMetadata, ...logicalMetadata})) {
    for (const supplied of [null, example]) {
      rejected(await app.create(app.input({[field]: supplied})), 'POST ' + field);
      rejected(await app.update(created.data.id, {version: 1, [field]: supplied}), 'PUT ' + field);
    }
  }
  assert.deepEqual(await app.snapshot(), before);
});

test('legacy article creation still rejects absent, null or empty publication fields instead of making drafts', async t => {
  const app = await setup(t), before = await app.snapshot();
  const cases = [
    input => {delete input.url;},
    input => {delete input.published_at;},
    input => {delete input.url; delete input.published_at;},
    input => {input.url = null;},
    input => {input.published_at = null;},
    input => {input.url = ''; input.published_at = '';},
  ];
  for (const change of cases) {
    const input = app.input(); change(input);
    const result = await app.create(input);
    assert.equal(result.status, 400, result.text);
    assert.equal(result.json?.error?.code, 'VALIDATION_ERROR');
  }
  assert.deepEqual(await app.snapshot(), before);
});

test('schema-only nullable lifecycle and draft rows cannot be silently published through legacy PUT', async t => {
  const app = await setup(t);
  const ids = [];
  for (const status of [null, 'drafting', 'illustrated', 'draft_saved', 'failed']) {
    const id = randomUUID(); ids.push(id);
    await app.db.prepare(
      'INSERT INTO matrix_articles(id,account_id,title,url,published_at,status,version,created_at,updated_at) ' +
      'VALUES(?,?,?,NULL,NULL,?,1,?,?)'
    ).bind(id, app.accountId, '合成 schema-only 草稿', status,
      '2001-01-01T00:00:00.000Z', '2001-01-01T00:00:00.000Z').run();
    const row = await app.stored(id);
    assert.equal(row.status, status);
    assert.equal(row.url, null);
    assert.equal(row.published_at, null);
  }
  const before = await app.snapshot();
  for (const id of ids) {
    for (const extra of [{}, {status: 'published'}]) {
      const response = await app.update(id, app.input({version: 1, ...extra}));
      assert.ok([400, 409].includes(response.status), response.text);
      assert.equal(Object.hasOwn(response.json || {}, 'data'), false);
    }
  }
  assert.deepEqual(await app.snapshot(), before);
  // Null/date/statistics handling belongs to Phase 2B. A successful SQL insert
  // is not evidence that overview, index, period, due-reviews or snapshots work.
});
