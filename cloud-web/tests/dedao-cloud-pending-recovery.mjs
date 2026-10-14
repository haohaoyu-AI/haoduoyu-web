// Real production TypeScript and all unchanged migrations on isolated SQLite.
// The only fetch implementation is an in-process signed-webhook receipt fixture.
// No Site, provider, 得到 browser, platform draft, schedule or network is changed.
import assert from 'node:assert/strict';
import {createHmac, randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {barrier, createSyntheticHarness, sha256, withDeadline} from './word-recovery-harness.mjs';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const owner = 'OFFLINE-CLOUD-OWNER';
const callback = 'https://callback.example.com/offline-cloud-receipt';
const secretBytes = Buffer.alloc(32, 84);
const chosenRead = "WHERE owner=? AND (request_key=? OR state<>'completed')";
const sendCas = "SET dispatch_state='sending'";
const receiptWrite = 'SET dispatch_state=?,updated=?';

function fixture() {
  const requests = [];
  let h, transport = async () => new Response('OFFLINE RECEIPT', {status: 200});
  h = createSyntheticHarness({projectRoot, mocks: {
    './test-store': {db: () => h.d1},
    './articles': {bucket: () => h.bucket},
    './writing-input': {hashText: async value => sha256(value)},
  }, globals: {Response, Request, AbortSignal, AbortController,
    console: {info() {}},
    fetch: async (url, options) => {
      assert.equal(url, callback, 'only the offline callback can be invoked');
      assert.equal(options.method, 'POST');
      assert.equal(options.redirect, 'manual');
      const event = JSON.parse(options.body);
      assert.equal(event.name, 'dedao.cloud_requested');
      assert.deepEqual(Object.keys(event.data), ['task_id']);
      assert.equal(event.eventId, 'dedao_evt_' + event.data.task_id);
      assert.equal(event.cursor, null);
      assert.equal(options.headers['webhook-id'], event.eventId);
      const timestamp = options.headers['webhook-timestamp'];
      assert.equal(options.headers['webhook-signature'], 'v1,' + createHmac('sha256', secretBytes)
        .update(`${event.eventId}.${timestamp}.${options.body}`).digest('base64'));
      const persisted = h.sql.prepare('SELECT * FROM dedao_cloud_requests WHERE id=?').get(event.data.task_id);
      assert.equal(persisted.dispatch_state, 'sending', 'the real CAS precedes the callback');
      assert.equal(event.timestamp, persisted.created, 'recovery retains the original timestamp');
      const receipt = {owner: persisted.owner, id: event.data.task_id, created: event.timestamp};
      requests.push(receipt);
      return transport(receipt);
    },
  }});
  function connect(who = owner, name = 'dedao.cloud_requested') {
    const id = 'sub_' + sha256(who + ':' + name);
    h.sql.prepare('INSERT OR REPLACE INTO event_subscriptions(id,owner,callback,secret,expires,active,generation,event_name) VALUES(?,?,?,?,?,?,?,?)')
      .run(id, who, callback, 'whsec_' + secretBytes.toString('base64'), '2099-01-01T00:00:00.000Z', 'active', 'OFFLINE-GENERATION', name);
    return id;
  }
  connect(); connect(owner, 'article.submitted');
  connect(owner, 'dedao.writing_requested'); connect(owner, 'test.created');
  const unrelated = () => JSON.stringify(h.sql.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name<>'dedao_cloud_requests' ORDER BY name").all()
    .map(({name}) => [name, h.sql.prepare('SELECT * FROM "' + name.replaceAll('"', '""') + '"').all()]));
  const unchanged = unrelated();
  const freshCloud = () => h.loader()('dedao-cloud');
  const cloud = freshCloud();
  const task = (who = owner) => h.sql.prepare('SELECT * FROM dedao_cloud_requests WHERE owner=? ORDER BY created DESC LIMIT 1').get(who);
  const total = (who = owner) => h.sql.prepare('SELECT count(*) n FROM dedao_cloud_requests WHERE owner=?').get(who).n;
  const start = (key, who = owner, module = cloud) => module.startCloudDedao(who, {request_key: key});
  const seed = ({who = owner, key = randomUUID(), state = 'queued', dispatch = 'pending', claim = null} = {}) => {
    const id = randomUUID(), created = '2026-10-13T20:00:00.000Z';
    h.sql.prepare('INSERT INTO dedao_cloud_requests(id,owner,request_key,state,conversation_url,dispatch_state,created,updated,claim_hash,claim_expires,execution_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, who, key, state, cloud.cloudConversation, dispatch, created, created, claim,
        claim ? '2000-01-01T00:00:00.000Z' : null, claim ? 'OFFLINE-EXECUTOR-FIXTURE' : null);
    return task(who);
  };
  return {...h, requests, cloud, freshCloud, start, task, total, seed, connect,
    setTransport(fn) { transport = fn; },
    assertUnrelatedUnchanged() { assert.equal(unrelated(), unchanged); assert.equal(h.externalCalls, 0); },
  };
}

async function scenario(name, action) {
  await test(name, async () => {
    const f = fixture();
    try { await action(f); f.assertUnrelatedUnchanged(); }
    finally { f.close(); }
  });
}

for (const phase of ['before', 'after']) for (const retry of ['same key', 'new key']) {
  await scenario(`chosen read ${phase} fault: ${retry} recovers the original pending task`, async f => {
    const key = randomUUID();
    f.on({method: 'first', phase, match: chosenRead, action: () => { throw Error('OFFLINE_CHOSEN_READ_FAULT'); }});
    await assert.rejects(f.start(key), /OFFLINE_CHOSEN_READ_FAULT/);
    const saved = f.task();
    assert.equal(saved.state, 'queued'); assert.equal(saved.dispatch_state, 'pending'); assert.equal(saved.claim_hash, null);
    assert.equal(f.requests.length, 0);
    const recovered = await f.start(retry === 'same key' ? key : randomUUID(), owner, f.freshCloud());
    assert.equal(recovered.task.id, saved.id); assert.equal(recovered.task.request_key, key);
    assert.equal(recovered.task.created, saved.created); assert.equal(recovered.task.dispatch_state, 'accepted');
    if (retry === 'new key') assert.equal(recovered.reused, true);
    assert.equal(recovered.task.state, 'queued'); assert.equal(recovered.task.writing_executor_registered, false);
    assert.equal(recovered.task.private_drafts_complete, false); assert.equal(recovered.instructions.private_drafts_only, true);
    assert.equal(f.requests.length, 1); assert.equal(f.total(), 1);
    await f.start(key); await f.start(randomUUID()); assert.equal(f.requests.length, 1);
  });
}

await scenario('lost insert receipt leaves one recoverable pending task', async f => {
  const key = randomUUID();
  f.on({method: 'run', phase: 'after', match: 'INSERT OR IGNORE INTO dedao_cloud_requests', action: () => { throw Error('OFFLINE_INSERT_RECEIPT_LOST'); }});
  await assert.rejects(f.start(key), /OFFLINE_INSERT_RECEIPT_LOST/);
  const saved = f.task(); assert.equal(saved.dispatch_state, 'pending');
  assert.equal((await f.start(key, owner, f.freshCloud())).task.id, saved.id);
  assert.equal(f.requests.length, 1); assert.equal(f.total(), 1);
});

for (const retry of ['same key', 'new key']) {
  await scenario(`SQLite abort before sending CAS: ${retry} recovers only after the fault ends`, async f => {
    f.sql.exec("CREATE TEMP TRIGGER offline_pending_abort BEFORE UPDATE OF dispatch_state ON dedao_cloud_requests WHEN NEW.dispatch_state='sending' BEGIN SELECT RAISE(ABORT,'OFFLINE_PENDING_CAS_FAULT'); END;");
    const key = randomUUID(); await assert.rejects(f.start(key), /OFFLINE_PENDING_CAS_FAULT/);
    const saved = f.task(); assert.equal(saved.dispatch_state, 'pending'); assert.equal(f.requests.length, 0);
    f.sql.exec('DROP TRIGGER offline_pending_abort');
    assert.equal((await f.start(retry === 'same key' ? key : randomUUID(), owner, f.freshCloud())).task.id, saved.id);
    assert.equal(f.requests.length, 1); assert.equal(f.total(), 1);
  });
}

for (const name of ['dedao.cloud_requested', 'article.submitted']) {
  await scenario(`pending retry requires the original normal ${name} connection`, async f => {
    const saved = f.seed();
    f.sql.prepare('UPDATE event_subscriptions SET active=? WHERE owner=? AND event_name=?').run('inactive', owner, name);
    const before = JSON.stringify(f.task());
    await assert.rejects(f.start(saved.request_key), /云端自动成文尚未连接.*原任务保留/);
    await assert.rejects(f.start(randomUUID()), /云端自动成文尚未连接.*原任务保留/);
    assert.equal(JSON.stringify(f.task()), before); assert.equal(f.requests.length, 0); assert.equal(f.total(), 1);
    f.sql.prepare('UPDATE event_subscriptions SET active=? WHERE owner=? AND event_name=?').run('active', owner, name);
    assert.equal((await f.start(saved.request_key)).task.id, saved.id); assert.equal(f.requests.length, 1);
  });
  await scenario(`pending retry retains pending on ${name} readiness read failure`, async f => {
    const saved = f.seed(), before = JSON.stringify(saved);
    f.on({method: 'first', match: statement => statement.source.includes('FROM event_subscriptions') && statement.values[3] === name,
      action: () => { throw Error('OFFLINE_READY_READ_FAULT'); }});
    await assert.rejects(f.start(saved.request_key), /OFFLINE_READY_READ_FAULT/);
    assert.equal(JSON.stringify(f.task()), before); assert.equal(f.requests.length, 0);
    assert.equal((await f.start(randomUUID())).task.id, saved.id); assert.equal(f.requests.length, 1); assert.equal(f.total(), 1);
  });
}

await scenario('readCloudDedao stays read-only for an undispatched pending task', async f => {
  const saved = f.seed(), before = JSON.stringify(saved);
  assert.equal((await f.cloud.readCloudDedao(owner)).task.id, saved.id);
  assert.equal((await f.cloud.readCloudDedao(owner, saved.id)).task.id, saved.id);
  assert.equal(JSON.stringify(f.task()), before); assert.equal(f.requests.length, 0);
});

for (const seeded of [
  {state: 'queued', dispatch: 'sending'}, {state: 'queued', dispatch: 'unknown'}, {state: 'queued', dispatch: 'accepted'},
  {state: 'queued', claim: 'OFFLINE-EXPIRED-CLAIM-HASH'},
  {state: 'writing'}, {state: 'writing', claim: 'OFFLINE-EXPIRED-CLAIM-HASH'},
  {state: 'processing'}, {state: 'processing', claim: 'OFFLINE-EXPIRED-CLAIM-HASH'},
  {state: 'completed'},
]) {
  await scenario(`no retransmit/reset for ${JSON.stringify(seeded)}`, async f => {
    const saved = f.seed(seeded), before = JSON.stringify(saved);
    let readyReads = 0;
    f.on({method: 'first', once: false, match: 'SELECT count(*) AS n FROM event_subscriptions', action: () => { readyReads++; }});
    for (const active of ['active', 'inactive']) {
      f.sql.prepare('UPDATE event_subscriptions SET active=? WHERE owner=? AND event_name IN (?,?)')
        .run(active, owner, 'dedao.cloud_requested', 'article.submitted');
      for (const key of [saved.request_key, ...(saved.state === 'completed' ? [] : [randomUUID()])]) {
        const readsBefore = readyReads, view = await f.start(key, owner, f.freshCloud());
        assert.equal(view.task.id, saved.id); assert.equal(view.connection.ready, active === 'active');
        assert.equal(readyReads - readsBefore, 2, 'protected states perform only the original read-only connection queries');
      }
    }
    f.sql.prepare('UPDATE event_subscriptions SET active=? WHERE owner=? AND event_name IN (?,?)')
      .run('active', owner, 'dedao.cloud_requested', 'article.submitted');
    assert.equal(JSON.stringify(f.task()), before); assert.equal(f.requests.length, 0); assert.equal(f.total(), 1);
  });
}

for (const phase of ['before', 'after']) {
  await scenario(`sending CAS ${phase === 'before' ? 'abort' : 'lost receipt'} never releases an uncertain dispatch`, async f => {
    const key = randomUUID();
    f.on({method: 'run', phase, match: sendCas, action: () => { throw Error('OFFLINE_SEND_CAS_FAULT'); }});
    await assert.rejects(f.start(key), /OFFLINE_SEND_CAS_FAULT/);
    const saved = f.task(); assert.equal(f.requests.length, 0);
    assert.equal(saved.dispatch_state, phase === 'before' ? 'pending' : 'sending');
    const retried = await f.start(key, owner, f.freshCloud()); assert.equal(retried.task.id, saved.id);
    assert.equal(f.requests.length, phase === 'before' ? 1 : 0); assert.equal(f.total(), 1);
    if (phase === 'after') assert.deepEqual(f.task(), saved);
  });
}

await scenario('accepted callback plus SQLite receipt abort remains sending and never retransmits', async f => {
  f.sql.exec("CREATE TEMP TRIGGER offline_receipt_abort BEFORE UPDATE OF dispatch_state ON dedao_cloud_requests WHEN OLD.dispatch_state='sending' AND NEW.dispatch_state<>'sending' BEGIN SELECT RAISE(ABORT,'OFFLINE_DISPATCH_RECEIPT_FAULT'); END;");
  const key = randomUUID(); await assert.rejects(f.start(key), /OFFLINE_DISPATCH_RECEIPT_FAULT/);
  const saved = f.task(); assert.equal(saved.dispatch_state, 'sending'); assert.equal(f.requests.length, 1);
  f.sql.exec('DROP TRIGGER offline_receipt_abort');
  await f.start(key, owner, f.freshCloud()); await f.start(randomUUID());
  assert.deepEqual(f.task(), saved); assert.equal(f.requests.length, 1); assert.equal(f.total(), 1);
});

await scenario('accepted receipt lost after persistence recovers the same task without another callback', async f => {
  const key = randomUUID();
  f.on({method: 'run', phase: 'after', match: receiptWrite, action: () => { throw Error('OFFLINE_ACCEPTED_RECEIPT_LOST'); }});
  await assert.rejects(f.start(key), /OFFLINE_ACCEPTED_RECEIPT_LOST/);
  const saved = f.task(); assert.equal(saved.dispatch_state, 'accepted');
  assert.equal((await f.start(key, owner, f.freshCloud())).task.id, saved.id);
  await f.start(randomUUID()); assert.deepEqual(f.task(), saved); assert.equal(f.requests.length, 1);
});

await scenario('final response read loss recovers the accepted original task', async f => {
  const key = randomUUID();
  f.on({method: 'first', match: 'FROM dedao_cloud_requests WHERE owner=? AND id=?', action: () => { throw Error('OFFLINE_FINAL_READ_FAULT'); }});
  await assert.rejects(f.start(key), /OFFLINE_FINAL_READ_FAULT/);
  const saved = f.task(); assert.equal(saved.dispatch_state, 'accepted');
  assert.equal((await f.start(key, owner, f.freshCloud())).task.id, saved.id);
  assert.equal(f.requests.length, 1); assert.equal(f.total(), 1);
});

for (const outcome of ['lost callback receipt', 'HTTP 503']) {
  await scenario(`${outcome} stays unknown and never retransmits`, async f => {
    f.setTransport(async () => {
      if (outcome === 'lost callback receipt') throw Error('OFFLINE_CALLBACK_RECEIPT_LOST');
      return new Response('OFFLINE FAILURE', {status: 503});
    });
    const key = randomUUID(), view = await f.start(key), saved = f.task();
    assert.equal(view.task.dispatch_state, 'unknown'); assert.equal(view.task.state, 'queued');
    await f.start(key, owner, f.freshCloud()); await f.start(randomUUID());
    assert.deepEqual(f.task(), saved); assert.equal(f.requests.length, 1); assert.equal(f.total(), 1);
  });
}

for (const existing of [true, false]) {
  await scenario(`${existing ? 'pending recovery' : 'fresh create'}: 16 concurrent same/new keys send one original event`, async f => {
    const original = existing ? f.seed() : null, key = original?.request_key || randomUUID();
    const gate = barrier(); f.setTransport(async () => { await gate.arrive(); return new Response('OFFLINE RECEIPT', {status: 200}); });
    const attempts = Array.from({length: 16}, (_, i) => f.start(i % 2 ? randomUUID() : key, owner, f.freshCloud()));
    await withDeadline(gate.ready, 10000);
    const sending = f.task(); assert.equal(sending.dispatch_state, 'sending'); assert.equal(f.total(), 1);
    const during = await f.start(key); assert.equal(during.task.id, sending.id); assert.equal(during.task.dispatch_state, 'sending');
    assert.equal(f.requests.length, 1); gate.release();
    const views = await withDeadline(Promise.all(attempts), 10000);
    assert.ok(views.every(view => view.task.id === sending.id));
    assert.equal(f.task().dispatch_state, 'accepted'); assert.equal(f.requests.length, 1); assert.equal(f.total(), 1);
    if (original) { assert.equal(sending.id, original.id); assert.equal(sending.created, original.created); assert.equal(sending.request_key, key); }
  });
}

for (const change of [
  {state: 'queued', claim: 'OFFLINE-LATE-CLAIM-HASH'}, {state: 'writing', claim: 'OFFLINE-LATE-CLAIM-HASH'},
  {state: 'processing', claim: 'OFFLINE-LATE-CLAIM-HASH'}, {state: 'queued', dispatch: 'unknown'},
]) {
  await scenario(`real CAS fences a stale pending snapshot after ${JSON.stringify(change)}`, async f => {
    const saved = f.seed();
    let fenced;
    f.on({method: 'run', match: sendCas, action: () => {
      f.sql.prepare('UPDATE dedao_cloud_requests SET state=?,claim_hash=?,dispatch_state=? WHERE owner=? AND id=?')
        .run(change.state, change.claim || null, change.dispatch || 'pending', owner, saved.id);
      fenced = f.task();
    }});
    const view = await f.start(saved.request_key);
    assert.equal(view.task.id, saved.id); assert.deepEqual(f.task(), fenced); assert.equal(f.requests.length, 0);
    await f.start(randomUUID()); assert.deepEqual(f.task(), fenced); assert.equal(f.requests.length, 0);
  });
}

await scenario('owner isolation with the same request key retains each original task', async f => {
  const other = 'OFFLINE-CLOUD-OTHER', key = randomUUID();
  const saved = f.seed({key}); f.connect(other); f.connect(other, 'article.submitted');
  const subscriptions = JSON.stringify(f.sql.prepare('SELECT * FROM event_subscriptions ORDER BY id').all());
  const otherView = await f.start(key, other); assert.notEqual(otherView.task.id, saved.id);
  assert.equal(f.task().dispatch_state, 'pending'); assert.equal(f.requests.length, 1); assert.equal(f.requests[0].owner, other);
  await assert.rejects(f.cloud.readCloudDedao(other, saved.id), /本人云端任务/);
  const recovered = await f.start(key); assert.equal(recovered.task.id, saved.id);
  assert.equal(f.requests.length, 2); assert.equal(f.total(), 1); assert.equal(f.total(other), 1);
  assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM event_subscriptions ORDER BY id').all()), subscriptions);
  // The additional owner's explicit fixture subscriptions are the sole intentional unrelated-row delta.
  f.sql.prepare('DELETE FROM event_subscriptions WHERE owner=?').run(other);
});
