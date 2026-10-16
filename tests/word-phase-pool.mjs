// Actual TypeScript implementation + SQLite CAS, memory R2 and synthetic bytes.
// No production task, platform, network, image semantic attestation or renderer.
import assert from 'node:assert/strict';
import {randomUUID, webcrypto} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {createSyntheticHarness, barrier, withDeadline} from './word-recovery-harness.mjs';
import {png, docx} from './word-recovery-artifact-fixture.mjs';
import {hash, owner, seed, base, native, operations} from './word-phase-pool-fixture.mjs';

// Forward every crypto primitive unchanged. One real digest may be suspended to
// exercise the actual async boundary before a duplicate native-chunk response.
let digestHook = null;
const raceCrypto = new Proxy(webcrypto, {get(target, key) {
  if (key === 'subtle') return new Proxy(target.subtle, {get(subtle, method) {
    if (method === 'digest') return async (...args) => {
      const result = await subtle.digest(...args), hook = digestHook;
      if (hook && Buffer.from(args[1]).equals(hook.bytes)) { digestHook = null; await hook.action(); }
      return result;
    };
    const value = Reflect.get(subtle, method); return typeof value === 'function' ? value.bind(subtle) : value;
  }});
  const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
}});
const h = createSyntheticHarness({projectRoot: process.cwd(), globals: {crypto: raceCrypto}}), load = h.loader();
const w = load('word-recovery'), p = load('word-progress'), articles = load('article-tools'), local = load('local-word-jobs');
const credentials = load('word-credentials');
const op = operations(w, p);
let passed = 0;
const pass = name => { passed++; console.log(`PASS ${name}`); };
const count = (table, who) => h.sql.prepare(`SELECT COUNT(*) n FROM ${table} WHERE owner=?`).get(who).n;
const expired = () => new Date(Date.now() - 60000).toISOString();
const guard = job => w.wordWriteFence(job.owner, job.target_kind, job.target_id, job.claim_token, job.execution_token);
const scopedGuard = (job, scope) => w.wordWriteFence(job.owner, job.target_kind, job.target_id, job.claim_token, job.execution_token, scope);
const freshExecution = job => ({...job, execution_token: randomUUID(), execution_id: randomUUID(), request_key: randomUUID()});

async function cache(job, kind, bytes, metadata = {}) {
  const asset_id = randomUUID(), a = {...base(job), asset_id};
  await w.checkpointCall(job.owner, 'begin_word_checkpoint', {...a, kind, sha256: hash(bytes), size: bytes.length,
    chunks: Math.ceil(bytes.length / 65536), metadata});
  for (let index = 0; index < Math.ceil(bytes.length / 65536); index++) {
    await w.checkpointCall(job.owner, 'put_word_checkpoint_chunk', {...a, index,
      data_base64: Buffer.from(bytes.slice(index * 65536, (index + 1) * 65536)).toString('base64')});
  }
  await w.checkpointCall(job.owner, 'finalize_word_checkpoint', a);
  return asset_id;
}

try {
  const upgrade = createSyntheticHarness({projectRoot: process.cwd(), migrate: false});
  try {
    for (const file of fs.readdirSync('drizzle').filter(name => name.endsWith('.sql') && Number(name.slice(0, 4)) <= 42).sort()) {
      upgrade.sql.exec(fs.readFileSync(path.join('drizzle', file), 'utf8'));
    }
    const old = await seed(upgrade.d1, owner('migration-upgrade')), stamp = new Date().toISOString(), lease = new Date(Date.now() + 600000).toISOString();
    const binding = JSON.stringify({contract_version: 1, synthetic_binding: 'preserve exact historical bytes'});
    upgrade.sql.prepare("INSERT INTO word_recovery(owner,target_kind,target_id,input_sha256,claim_hash,version,epoch,desired,execution_id,request_key,token_hash,lease_until,heartbeat_at,status,reason,retry_count,legacy_output_binding,updated) VALUES(?,'article',?,?,?,7,1,'run',?,?,?,?,?,'running','none',0,?,?)")
      .run(old.owner, old.target_id, old.input_sha256, hash(old.claim_token), old.execution_id, old.request_key,
        hash(old.execution_token), lease, stamp, binding, stamp);
    upgrade.sql.prepare('INSERT INTO word_execution_receipts(owner,request_key,target_kind,target_id,input_sha256,claim_hash,token_hash,execution_id,epoch,created) VALUES(?,?,?,?,?,?,?,?,1,?)')
      .run(old.owner, old.request_key, 'article', old.target_id, old.input_sha256, hash(old.claim_token), hash(old.execution_token), old.execution_id, stamp);
    const oldControl = upgrade.sql.prepare('SELECT * FROM word_recovery WHERE owner=?').get(old.owner);
    const oldReceipt = upgrade.sql.prepare('SELECT * FROM word_execution_receipts WHERE owner=?').get(old.owner);
    upgrade.sql.exec(fs.readFileSync('drizzle/0043_word_phase_pools.sql', 'utf8'));
    const newControl = upgrade.sql.prepare('SELECT * FROM word_recovery WHERE owner=?').get(old.owner);
    const newReceipt = upgrade.sql.prepare('SELECT * FROM word_execution_receipts WHERE owner=?').get(old.owner);
    for (const key of Object.keys(oldControl)) assert.equal(newControl[key], oldControl[key]);
    for (const key of Object.keys(oldReceipt)) assert.equal(newReceipt[key], oldReceipt[key]);
    assert.equal(newControl.execution_scope, 'heavy'); assert.equal(newReceipt.execution_scope, 'heavy');
    assert.equal(newReceipt.operation, 'acquire');
    assert.throws(() => upgrade.sql.prepare("UPDATE word_recovery SET legacy_output_binding='changed' WHERE owner=?").run(old.owner));
    assert.throws(() => upgrade.sql.prepare("UPDATE word_execution_receipts SET execution_id='changed' WHERE owner=?").run(old.owner));
    const upgradeLoad = upgrade.loader(), upgradeOp = operations(upgradeLoad('word-recovery'), upgradeLoad('word-progress'));
    assert.equal((await upgradeOp.acquire(old)).duplicate, true);
    const change = await upgradeOp.transitionArgs(old, 'prepare'), converted = await upgradeOp.transition(old, change);
    assert.equal(converted.acquired, true);
    assert.equal(upgrade.sql.prepare('SELECT COUNT(*) n FROM word_execution_requests WHERE owner=?').get(old.owner).n, 1);
    upgrade.sql.prepare('DELETE FROM articles WHERE owner=? AND id=?').run(old.owner, old.target_id);
    for (const table of ['word_recovery', 'word_execution_receipts', 'word_execution_queue', 'word_execution_requests']) {
      assert.equal(upgrade.sql.prepare(`SELECT COUNT(*) n FROM ${table} WHERE owner=?`).get(old.owner).n, 0);
    }
    assert.equal(upgrade.externalCalls, 0);
    pass('0042-to-0043 migration preserves all existing control/receipt/binding bytes, default heavy, immutability and deletion cleanup');
  } finally { upgrade.close(); }

  const who = owner('capacity'), jobs = await Promise.all(Array.from({length: 8}, () => seed(h.d1, who)));
  const acquired = await Promise.all(jobs.map(job => op.acquire(job, 'prepare')));
  assert.equal(acquired.filter(x => x.acquired).length, 7);
  const winners = jobs.filter((_, i) => acquired[i].acquired), queued = jobs.find((_, i) => !acquired[i].acquired);
  assert.ok(queued);
  const queuedResult = acquired[jobs.indexOf(queued)];
  assert.equal(queuedResult.queued, true); assert.equal(queuedResult.new_execution_grant, false);
  assert.equal(h.sql.prepare('SELECT token_hash FROM word_recovery WHERE owner=? AND target_id=?').get(who, queued.target_id).token_hash, null);
  const qr = await op.receipt(queued);
  assert.equal(qr.recorded, false); assert.equal(qr.queued, true); assert.equal(qr.applicable, false);
  assert.equal(qr.request_state, 'queued'); assert.equal(qr.new_execution_grant, false);
  assert.equal(qr.queue_reason, 'total_capacity');
  pass('eight simultaneous preparation acquisitions yield seven grants; eighth is durable queued with no token grant');

  const repeated = await Promise.all(Array.from({length: 8}, () => op.acquire(queued, 'prepare')));
  assert.ok(repeated.every(x => !x.acquired && x.queued && !x.new_execution_grant));
  assert.equal(count('word_execution_queue', who), 1);
  await assert.rejects(op.acquire({...queued, execution_token: randomUUID()}, 'prepare'));
  await assert.rejects(op.acquire({...queued, request_key: winners[0].request_key}, 'prepare'));
  pass('queued acquisition replay is one immutable request; key/token or target conflicts are rejected');

  const a = winners[0], image = png(), word = docx(image), metadata = {
    source_url: 'https://images.example.org/synthetic.png', source_title: 'Synthetic fixture', after_paragraph: 1};
  await scopedGuard(a, 'prepare');
  await assert.rejects(guard(a));
  await assert.rejects(w.declareImageFloor(a.owner, {...base(a), minimum_images: 1}));
  await assert.rejects(w.checkpointCall(a.owner, 'begin_word_checkpoint', {...base(a), asset_id: randomUUID(), kind: 'image',
    sha256: hash(image), size: image.length, chunks: 1, metadata}));
  await assert.rejects(w.checkpointCall(a.owner, 'begin_word_checkpoint', {...base(a), asset_id: randomUUID(), kind: 'word',
    sha256: hash(word), size: word.length, chunks: 1, metadata: {}}));
  await assert.rejects(w.recordImageResult(a.owner, {...base(a), candidate_id: randomUUID(), source_url: metadata.source_url,
    source_title: metadata.source_title, outcome: 'ready', reason: 'none', asset_id: randomUUID()}));
  const n = native(a);
  await assert.rejects(articles.articleCall(a.owner, 'record_article_images', {...n, images: [{...metadata, sha256: hash(image)}]}));
  await assert.rejects(articles.articleCall(a.owner, 'begin_article_output', {...n, size: word.length, sha256: hash(word), chunks: 1}));
  await assert.rejects(articles.articleCall(a.owner, 'put_article_output_chunk', {...n, output_id: randomUUID(), index: 0,
    data_base64: Buffer.from(word).toString('base64')}));
  await assert.rejects(articles.articleCall(a.owner, 'finalize_article_output', {...n, output_id: randomUUID()}));
  assert.equal(count('word_checkpoints', who), 0);
  assert.equal(h.sql.prepare('SELECT artifact_manifest,result_meta,result_key FROM articles WHERE id=?').get(a.target_id).artifact_manifest, null);
  assert.equal(h.objects.size, 0);
  pass('preparation lease refuses heavy fence, image floor, checkpoints, ready image, image plan and all native Word writes');

  await op.progress(a, 'read_source', 'completed', {action: 'read_frozen_source', reason: 'none'});
  const collect = await op.progress(a, 'collect_images', 'running', {action: 'search_public_images', reason: 'none',
    candidate_urls: ['https://images.example.org/one.png', 'https://images.example.org/two.png']});
  const duplicateProgress = await Promise.all(Array.from({length: 12}, () => p.recordWordProgress(a.owner, collect.event)));
  assert.ok(duplicateProgress.every(x => x.duplicate));
  let progress = await p.readWordProgress(a.owner, a.target_kind, a.target_id);
  assert.equal(progress.version, 2); assert.equal(progress.steps[1].counts.completed, 2);
  const failedCandidate = {...base(a), candidate_id: randomUUID(), source_url: 'https://images.example.org/denied.png',
    source_title: 'Synthetic rejected image', outcome: 'download_failed', reason: 'http_403'};
  await w.recordImageResult(a.owner, failedCandidate);
  assert.equal((await w.recordImageResult(a.owner, failedCandidate)).duplicate, true);
  assert.equal(count('word_image_candidates', who), 1);
  pass('preparation source/search and failed candidate persist; twelve duplicate events never increase real counts');

  for (const [stage, action] of [['confirm_images', 'filter_images'], ['generate_word', 'build_docx'],
    ['inspect_pages', 'render_pages'], ['save_final', 'upload_output']]) {
    await assert.rejects(op.progress(a, stage, 'running', {action, reason: 'none'}));
  }
  assert.equal((await p.readWordProgress(a.owner, a.target_kind, a.target_id)).version, 2);
  pass('preparation cannot report image determination, Word generation, page inspection or final-save stage');

  const t1 = await op.transitionArgs(a, 'heavy'), beforeTransition = await op.view(a);
  const h1 = await op.transition(a, t1);
  assert.equal(h1.acquired, true); assert.equal(h1.transitioned, true);
  assert.equal(h1.epoch, beforeTransition.epoch + 1); assert.equal(h1.recovery.version, beforeTransition.version + 1);
  const oldToken = a.execution_token, oldFence = await scopedGuard(winners[1], 'prepare');
  op.adoptTransition(a, t1, h1);
  await assert.rejects(scopedGuard({...a, execution_token: oldToken}, 'prepare'));
  await guard(a);
  const h2args = await op.transitionArgs(winners[1], 'heavy'), h2 = await op.transition(winners[1], h2args);
  op.adoptTransition(winners[1], h2args, h2);
  assert.equal(h.sql.prepare("UPDATE articles SET error='late' WHERE owner=? AND id=?" + oldFence).run(who, winners[1].target_id).changes, 0);
  const awaiting = winners[2], t3 = await op.transitionArgs(awaiting, 'heavy'), beforeQueue = await op.view(awaiting);
  const h3 = await op.transition(awaiting, t3);
  assert.equal(h3.acquired, false); assert.equal(h3.queued, true); assert.equal(h3.new_execution_grant, false);
  const afterQueue = await op.view(awaiting);
  assert.equal(afterQueue.version, beforeQueue.version); assert.ok(afterQueue.queue_revision > beforeQueue.queue_revision);
  assert.equal((await op.transition(awaiting, t3)).new_execution_grant, false);
  assert.equal((await op.view(awaiting)).queue_revision, afterQueue.queue_revision);
  await scopedGuard(awaiting, 'prepare');
  await assert.rejects(guard({...awaiting, execution_token: t3.next_execution_token}));
  assert.equal((await op.receipt(awaiting, t3.request_key)).queued, true);
  assert.equal((await op.receipt(awaiting, t3.request_key)).queue_reason, 'heavy_capacity');
  progress = await p.readWordProgress(a.owner, a.target_kind, a.target_id);
  assert.equal(progress.version, 2); assert.equal(progress.steps[0].state, 'completed');
  assert.equal(progress.steps[1].counts.completed, 2);
  pass('two heavy grants rotate token/epoch/version; third transition queues without revoking preparation or source/search evidence');

  await op.progress(awaiting, 'read_source', 'completed', {action: 'read_frozen_source', reason: 'none'});
  await op.progress(awaiting, 'collect_images', 'waiting', {action: 'search_public_images', reason: 'waiting_for_images',
    candidate_urls: ['https://images.example.org/queued.png']});
  const sameBefore = await p.readWordProgress(awaiting.owner, awaiting.target_kind, awaiting.target_id);
  await op.intent(a, 'paused');
  const retry = await op.transition(awaiting, t3);
  assert.equal(retry.acquired, true); op.adoptTransition(awaiting, t3, retry);
  const sameAfter = await p.readWordProgress(awaiting.owner, awaiting.target_kind, awaiting.target_id);
  assert.equal(sameAfter.target_id, sameBefore.target_id); assert.equal(sameAfter.input_sha256, sameBefore.input_sha256);
  assert.equal(sameAfter.version, sameBefore.version); assert.equal(sameAfter.steps[1].counts.completed, 1);
  const replay = await op.transition(awaiting, t3);
  assert.equal(replay.duplicate, true); assert.equal(replay.new_execution_grant, false);
  await assert.rejects(op.transition(awaiting, {...t3, next_execution_token: randomUUID()}));
  pass('heavy release resumes same queued conversion key and same article/hash/evidence; replay grants no second lease');

  const defaultOwner = owner('legacy'), defaultJobs = await Promise.all(Array.from({length: 3}, () => seed(h.d1, defaultOwner)));
  const defaults = await Promise.all(defaultJobs.map(job => op.acquire(job)));
  assert.equal(defaults.filter(x => x.acquired).length, 2); assert.equal(defaults.filter(x => !x.acquired && x.queued).length, 1);
  const defaultWinner = defaultJobs.find((_, index) => defaults[index].acquired), defaultQueued = defaultJobs.find((_, index) => !defaults[index].acquired);
  const defaultRow = h.sql.prepare('SELECT execution_scope FROM word_recovery WHERE owner=? AND target_id=?').get(defaultOwner, defaultWinner.target_id);
  assert.equal(defaultRow.execution_scope, 'heavy');
  await assert.rejects(op.acquire({...defaultQueued, execution_scope: 'unbounded'}));
  assert.equal(count('word_execution_receipts', defaultOwner), 2);
  pass('omitted acquisition scope remains heavy and capped at two; unknown scope is rejected');

  const invalidTransition = await seed(h.d1, owner('invalid-transition')); await op.acquire(invalidTransition, 'prepare');
  const validChange = await op.transitionArgs(invalidTransition, 'heavy');
  for (const patch of [{execution_id: randomUUID()}, {claim_token: randomUUID()}, {input_sha256: hash('other synthetic source')},
    {epoch: validChange.epoch + 1}, {expected_version: validChange.expected_version + 1},
    {next_execution_token: invalidTransition.execution_token}, {execution_scope: 'prepare'}]) {
    await assert.rejects(op.transition(invalidTransition, {...validChange, ...patch}));
  }
  assert.equal((await op.view(invalidTransition)).resource_class, 'prepare');
  assert.equal(count('word_execution_receipts', invalidTransition.owner), 1);
  const unknownReceipt = await op.receipt(invalidTransition, randomUUID());
  assert.equal(unknownReceipt.recorded, false); assert.equal(unknownReceipt.queued, false);
  assert.equal(unknownReceipt.request_state, 'not_recorded');
  pass('conversion requires matching executor/claim/source/current epoch/version, fresh token and changed scope; unknown receipt grants nothing');

  const sharedOwner = owner('shared'), sharedArticle = await seed(h.d1, sharedOwner), sharedLocal = await seed(h.d1, sharedOwner, 'local_word');
  assert.equal((await op.acquire(sharedArticle, 'heavy')).acquired, true);
  assert.equal((await op.acquire(sharedLocal, 'heavy')).acquired, true);
  const sharedThird = await seed(h.d1, sharedOwner, 'local_word');
  assert.equal((await op.acquire(sharedThird, 'heavy')).acquired, false);
  const otherOwner = owner('isolated'), other = await Promise.all(Array.from({length: 2}, () => seed(h.d1, otherOwner)));
  assert.ok((await Promise.all(other.map(job => op.acquire(job, 'heavy')))).every(x => x.acquired));
  await assert.rejects(w.wordRecoveryCall(otherOwner, 'read_word_recovery', {target_kind: 'article', target_id: sharedArticle.target_id}));
  pass('article/local Word share heavy capacity while another owner has independent bounded grants and cannot read foreign task');

  const totalOwner = owner('total-reason'), onlyPreparation = await Promise.all(Array.from({length: 7}, () => seed(h.d1, totalOwner)));
  await Promise.all(onlyPreparation.map(job => op.acquire(job, 'prepare')));
  const totalBlocked = await seed(h.d1, totalOwner), totalQueue = await op.acquire(totalBlocked, 'heavy');
  assert.equal(totalQueue.acquired, false); assert.equal(totalQueue.queued, true);
  assert.equal((await op.receipt(totalBlocked)).queue_reason, 'total_capacity');
  assert.equal((await op.view(totalBlocked)).queue_reason, 'total_capacity');
  assert.equal(h.sql.prepare("SELECT COUNT(*) n FROM word_recovery WHERE owner=? AND token_hash IS NOT NULL AND execution_scope='heavy'").get(totalOwner).n, 0);
  await op.intent(onlyPreparation[0], 'paused');
  assert.equal((await op.acquire(totalBlocked, 'heavy')).acquired, true);
  pass('heavy request with zero heavy occupancy truthfully queues for total seven-task capacity and resumes when one preparation releases');

  const lostQueue = await seed(h.d1, totalOwner);
  h.on({method: 'batch', phase: 'after', action: () => { throw Error('SYNTHETIC_QUEUE_REPLY_LOST'); }});
  await assert.rejects(op.acquire(lostQueue, 'heavy'));
  const unknownQueueReceipt = await op.receipt(lostQueue), queuedView = await op.view(lostQueue);
  assert.equal(unknownQueueReceipt.recorded, false); assert.equal(unknownQueueReceipt.queued, true);
  assert.equal(unknownQueueReceipt.new_execution_grant, false);
  const queueReplay = await op.acquire(lostQueue, 'heavy');
  assert.equal(queueReplay.acquired, false); assert.equal(queueReplay.duplicate, true); assert.equal(queueReplay.new_execution_grant, false);
  assert.equal((await op.view(lostQueue)).queue_revision, queuedView.queue_revision);
  pass('lost queue reply reads exact durable non-grant receipt; duplicate retry leaves monotonic queue revision unchanged');

  const localPrep = await seed(h.d1, owner('local-prepare'), 'local_word'); await op.acquire(localPrep, 'prepare');
  await op.progress(localPrep, 'read_source', 'completed', {action: 'read_frozen_source', reason: 'none'});
  await op.progress(localPrep, 'collect_images', 'running', {action: 'search_public_images', reason: 'none'});
  await assert.rejects(local.localWordCall(localPrep.owner, 'record_local_word_images', {...native(localPrep), images: [{...metadata, sha256: hash(image)}]}));
  await assert.rejects(local.localWordCall(localPrep.owner, 'begin_local_word_output', {...native(localPrep), size: word.length, sha256: hash(word), chunks: 1}));
  await assert.rejects(local.localWordCall(localPrep.owner, 'put_local_word_output_chunk', {...native(localPrep), output_id: randomUUID(), index: 0, data_base64: Buffer.from(word).toString('base64')}));
  await assert.rejects(local.localWordCall(localPrep.owner, 'finalize_local_word_output', {...native(localPrep), output_id: randomUUID(), execution: {
    executor: 'xiaoyu_agent', execution_id: localPrep.execution_id, model: 'synthetic-test', rendered_pages: 1, verification_summary: 'synthetic only'}}));
  assert.equal(h.sql.prepare('SELECT output_meta,result_key FROM local_word_jobs WHERE id=?').get(localPrep.target_id).output_meta, null);
  pass('local Word preparation supports source/search but cannot write image plan, native Word chunks or completion');

  const lost = await seed(h.d1, owner('lost-acquire'));
  h.on({method: 'batch', phase: 'after', action: () => { throw Error('SYNTHETIC_ACQUIRE_REPLY_LOST'); }});
  await assert.rejects(op.acquire(lost, 'prepare'));
  const lostReceipt = await op.receipt(lost);
  assert.equal(lostReceipt.recorded, true); assert.equal(lostReceipt.applicable, true);
  const recovered = await op.acquire(lost, 'prepare');
  assert.equal(recovered.duplicate, true); assert.equal(recovered.new_execution_grant, false);
  assert.equal(count('word_execution_receipts', lost.owner), 1);
  pass('unknown acquisition reply is read from durable receipt and reused without a new grant');

  const lostT = await op.transitionArgs(lost, 'heavy'), lostBefore = await op.view(lost);
  h.on({method: 'batch', phase: 'after', action: () => { throw Error('SYNTHETIC_TRANSITION_REPLY_LOST'); }});
  await assert.rejects(op.transition(lost, lostT));
  const transitionReceipt = await op.receipt(lost, lostT.request_key);
  assert.equal(transitionReceipt.recorded, true); assert.equal(transitionReceipt.applicable, true);
  const transitionReplay = await op.transition(lost, lostT);
  assert.equal(transitionReplay.duplicate, true); assert.equal(transitionReplay.new_execution_grant, false);
  assert.equal((await op.view(lost)).epoch, lostBefore.epoch + 1);
  await assert.rejects(guard(lost));
  op.adoptTransition(lost, lostT, transitionReplay); await guard(lost);
  pass('unknown conversion reply has durable new-scope receipt; retry preserves one epoch increment and fences old token');

  const race = await seed(h.d1, owner('transition-race')); await op.acquire(race, 'prepare');
  const raceBefore = await op.view(race), racers = await Promise.all([op.transitionArgs(race, 'heavy'), op.transitionArgs(race, 'heavy')]);
  const gate = barrier(2);
  const removeRace = h.on({method: 'batch', once: false, action: () => gate.arrive()});
  const concurrent = racers.map(args => op.transition(race, args));
  await withDeadline(gate.ready); removeRace(); gate.release();
  const results = await withDeadline(Promise.allSettled(concurrent));
  assert.equal(results.filter(x => x.status === 'fulfilled' && x.value.acquired).length, 1);
  assert.equal((await op.view(race)).epoch, raceBefore.epoch + 1);
  assert.equal(count('word_execution_receipts', race.owner), 2);
  pass('two different transition keys racing the same epoch/version produce exactly one new execution grant');

  const progressRace = await seed(h.d1, owner('progress-race')); await op.acquire(progressRace, 'prepare');
  const firstEvent = {...base(progressRace), expected_version: 0, event_id: randomUUID(), stage: 'read_source', state: 'completed',
    observation: {action: 'read_frozen_source', reason: 'none'}};
  const pgate = barrier(2), remove = h.on({method: 'run', once: false, match: 'INSERT OR IGNORE INTO word_progress_events', action: () => pgate.arrive()});
  const events = [firstEvent, {...firstEvent, event_id: randomUUID()}].map(event => p.recordWordProgress(progressRace.owner, event));
  await withDeadline(pgate.ready); remove(); pgate.release();
  const eventResults = await withDeadline(Promise.allSettled(events));
  assert.equal(eventResults.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal((await p.readWordProgress(progressRace.owner, 'article', progressRace.target_id)).version, 1);
  await op.progress(progressRace, 'collect_images', 'running', {action: 'search_public_images', reason: 'none'});
  await assert.rejects(p.recordWordProgress(progressRace.owner, {...firstEvent, expected_version: 2, event_id: randomUUID()}));
  pass('distinct same-version progress CAS has one winner and later out-of-order source stage is rejected');

  const failOwner = owner('failure'), failing = await seed(h.d1, failOwner), unaffected = await seed(h.d1, failOwner);
  await op.acquire(failing, 'prepare'); await op.acquire(unaffected, 'prepare');
  await op.progress(failing, 'read_source', 'completed', {action: 'read_frozen_source', reason: 'none'});
  const failureVersion = (await op.view(failing)).version;
  await w.wordRecoveryCall(failing.owner, 'report_word_interruption', {...base(failing), request_key: randomUUID(),
    epoch: (await op.view(failing)).epoch, reason: 'http_403'});
  assert.equal((await op.view(failing)).status, 'blocked'); assert.equal((await op.view(failing)).version, failureVersion + 1);
  await op.progress(unaffected, 'read_source', 'completed', {action: 'read_frozen_source', reason: 'none'});
  assert.equal((await op.view(unaffected)).status, 'running');
  assert.equal((await p.readWordProgress(failing.owner, 'article', failing.target_id)).steps[0].state, 'completed');
  const newJob = await seed(h.d1, failOwner); assert.equal((await op.acquire(newJob, 'prepare')).acquired, true);
  pass('one dependency interruption releases only its own lease; other task progresses and confirmed source survives');

  await op.intent(failing, 'paused'); await op.intent(failing, 'run');
  const resumedFailure = freshExecution(failing); await op.acquire(resumedFailure, 'prepare');
  await op.progress(resumedFailure, 'collect_images', 'waiting', {action: 'search_public_images', reason: 'waiting_for_images'});
  assert.equal((await p.readWordProgress(failing.owner, 'article', failing.target_id)).steps[0].state, 'completed');
  await assert.rejects(scopedGuard(failing, 'prepare'));
  assert.equal((await op.view(unaffected)).status, 'running');
  pass('explicit same-task failure continuation uses a new execution token and advances from preserved confirmed stage');

  const paused = await seed(h.d1, owner('controls')); await op.acquire(paused, 'prepare');
  const pauseFence = await scopedGuard(paused, 'prepare'); await op.intent(paused, 'paused');
  assert.equal(h.sql.prepare("UPDATE articles SET error='late' WHERE owner=? AND id=?" + pauseFence).run(paused.owner, paused.target_id).changes, 0);
  assert.equal((await op.receipt(paused)).applicable, false);
  await assert.rejects(op.acquire(freshExecution(paused), 'prepare'));
  await op.intent(paused, 'run'); await assert.rejects(op.acquire(paused, 'prepare'));
  const resumed = freshExecution(paused); assert.equal((await op.acquire(resumed, 'prepare')).acquired, true);
  await op.intent(resumed, 'cancelled'); await assert.rejects(op.acquire(freshExecution(resumed), 'prepare'));
  pass('pause/cancel and continue persist intent; pre-pause SQL and old token remain fenced');

  const changed = await seed(h.d1, owner('source-change')); await op.acquire(changed, 'prepare');
  const changedFence = await scopedGuard(changed, 'prepare');
  h.sql.prepare('UPDATE articles SET paragraphs=? WHERE id=?').run(JSON.stringify(['Synthetic changed title', 'Synthetic body']), changed.target_id);
  assert.equal(h.sql.prepare("UPDATE articles SET error='late' WHERE id=?" + changedFence).run(changed.target_id).changes, 0);
  assert.equal((await op.receipt(changed)).applicable, false);
  await assert.rejects(op.acquire(freshExecution(changed), 'prepare'));
  await assert.rejects(op.progress(changed, 'read_source', 'completed', {action: 'read_frozen_source', reason: 'none'}));
  const stale = await seed(h.d1, owner('expired-claim')); await op.acquire(stale, 'prepare');
  h.sql.prepare('UPDATE articles SET claim_expires=? WHERE id=?').run(expired(), stale.target_id);
  await assert.rejects(op.transition(stale, await op.transitionArgs(stale, 'heavy')));
  await assert.rejects(op.progress(stale, 'read_source', 'completed', {action: 'read_frozen_source', reason: 'none'}));
  assert.equal((await op.receipt(stale)).applicable, false);
  pass('changed frozen source and expired claim reject acquisition, progress, transition and late SQL/read applicability');

  const heartbeat = await seed(h.d1, owner('heartbeat')); const hbGrant = await op.acquire(heartbeat, 'prepare');
  const hbBefore = await p.readWordProgress(heartbeat.owner, 'article', heartbeat.target_id);
  const hb = await w.wordRecoveryCall(heartbeat.owner, 'heartbeat_word_execution', {...base(heartbeat),
    request_key: randomUUID(), epoch: hbGrant.epoch});
  assert.equal(hb.progress_advanced, false); assert.equal(hb.recovery.resource_class, 'prepare');
  assert.equal((await p.readWordProgress(heartbeat.owner, 'article', heartbeat.target_id)).version, hbBefore.version);
  pass('heartbeat preserves preparation scope and never advances stages or observation counts');

  const secretOwner = owner('pending-credentials'), secretHeavy = await Promise.all(Array.from({length: 2}, () => seed(h.d1, secretOwner)));
  await Promise.all(secretHeavy.map(job => op.acquire(job, 'heavy')));
  const secretPrep = await seed(h.d1, secretOwner); await op.acquire(secretPrep, 'prepare');
  const pendingArgs = await op.transitionArgs(secretPrep, 'heavy');
  assert.equal((await op.transition(secretPrep, pendingArgs)).queued, true);
  const representations = token => [token, [...token].map(c => `%${c.charCodeAt(0).toString(16)}`).join(''),
    [...token].map(c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`).join('')];
  for (const token of [pendingArgs.next_execution_token, pendingArgs.execution_token]) for (const value of representations(token)) {
    await assert.rejects(credentials.assertWordCredentialFree(secretOwner, {source_title: value}));
    const redacted = await credentials.redactWordCredentialText(secretOwner, {source_title: value});
    assert.equal(redacted.source_title, credentials.WORD_CREDENTIAL_REDACTED);
  }
  await assert.rejects(w.recordImageResult(secretOwner, {...base(secretPrep), candidate_id: randomUUID(),
    source_url: 'https://images.example.org/pending-credential.png', source_title: pendingArgs.next_execution_token,
    outcome: 'download_failed', reason: 'http_403'}));
  await assert.rejects(w.recordImageResult(secretOwner, {...base(secretPrep), candidate_id: pendingArgs.next_execution_token,
    source_url: 'https://images.example.org/pending-identity.png', source_title: 'Synthetic forbidden identity',
    outcome: 'download_failed', reason: 'http_403'}));
  const pollution = randomUUID();
  h.sql.prepare("INSERT INTO word_image_candidates(owner,target_kind,target_id,candidate_id,input_sha256,source_url,source_title,outcome,reason,replacement_for,asset_id,payload_sha256,created) VALUES(?,'article',?,?,?,?,?,'download_failed','http_403',NULL,NULL,?,?)")
    .run(secretOwner, secretPrep.target_id, pollution, secretPrep.input_sha256,
      'https://images.example.org/historical-pollution.png', pendingArgs.next_execution_token, hash('synthetic pollution'), new Date().toISOString());
  const publicRead = JSON.stringify(await op.read(secretPrep));
  assert.equal(publicRead.includes(pendingArgs.next_execution_token), false);
  assert.equal(publicRead.includes(pendingArgs.execution_token), false);
  pass('pending transition token and old token are refused raw/percent/JSON-escaped in text/ID and hidden in public historical projection');

  await op.intent(secretPrep, 'paused');
  await assert.rejects(credentials.assertWordCredentialFree(secretOwner, {source_title: pendingArgs.next_execution_token}));
  await op.intent(secretPrep, 'run');
  await assert.rejects(op.acquire({...freshExecution(secretPrep), execution_token: pendingArgs.next_execution_token}, 'prepare'));
  assert.equal((await op.view(secretPrep)).status, 'await_executor');
  assert.equal((await op.receipt(secretPrep, pendingArgs.request_key)).applicable, false);
  pass('invalidating a pending queue retains credential history; its never-granted token cannot become a fresh grant');

  const duplicateCheckpoint = await seed(h.d1, owner('checkpoint-late')); await op.acquire(duplicateCheckpoint, 'heavy');
  const duplicateAsset = await cache(duplicateCheckpoint, 'image', image, metadata);
  const downgrade = async job => {
    const change = await op.transitionArgs(job, 'prepare'), result = await op.transition(job, change);
    assert.equal(result.acquired, true); op.adoptTransition(job, change, result);
  };
  h.on({method: 'first', phase: 'after', match: context => context.source.includes('SELECT * FROM word_checkpoints')
    && context.values.includes(duplicateAsset), action: () => downgrade(duplicateCheckpoint)});
  await assert.rejects(w.checkpointCall(duplicateCheckpoint.owner, 'begin_word_checkpoint', {...base(duplicateCheckpoint),
    asset_id: duplicateAsset, kind: 'image', sha256: hash(image), size: image.length, chunks: 1, metadata}));
  assert.equal((await op.view(duplicateCheckpoint)).resource_class, 'prepare');
  assert.equal(h.sql.prepare('SELECT state FROM word_checkpoints WHERE asset_id=?').get(duplicateAsset).state, 'ready');
  pass('duplicate checkpoint declaration cannot return accepted success after scope changes during its actual DB read');

  for (const kind of ['article', 'local_word']) {
    const planJob = await seed(h.d1, owner(`plan-late-${kind}`), kind); await op.acquire(planJob, 'heavy');
    await cache(planJob, 'image', image, metadata);
    const call = kind === 'article' ? articles.articleCall : local.localWordCall;
    const planName = kind === 'article' ? 'record_article_images' : 'record_local_word_images';
    const planArgs = {...native(planJob), images: [{...metadata, sha256: hash(image)}]};
    await call(planJob.owner, planName, planArgs);
    h.on({method: 'first', phase: 'after', match: context => context.source.includes('SELECT metadata_json,verification_json FROM word_checkpoints')
      && context.values.includes(planJob.target_id), action: () => downgrade(planJob)});
    await assert.rejects(call(planJob.owner, planName, planArgs));
    assert.equal((await op.view(planJob)).resource_class, 'prepare');
    assert.equal(h.sql.prepare(`SELECT artifact_manifest FROM ${kind === 'article' ? 'articles' : 'local_word_jobs'} WHERE id=?`)
      .get(planJob.target_id).artifact_manifest.includes(hash(image)), true);
  }
  pass('article and local image-plan duplicate responses recheck heavy permission after actual asynchronous cache validation');

  for (const kind of ['article', 'local_word']) {
    const chunkJob = await seed(h.d1, owner(`chunk-late-${kind}`), kind); await op.acquire(chunkJob, 'heavy');
    await cache(chunkJob, 'image', image, metadata);
    const call = kind === 'article' ? articles.articleCall : local.localWordCall;
    const prefix = kind === 'article' ? 'article' : 'local_word';
    await call(chunkJob.owner, `record_${prefix}_images`, {...native(chunkJob), images: [{...metadata, sha256: hash(image)}]});
    await cache(chunkJob, 'word', word);
    const declaration = await call(chunkJob.owner, `begin_${prefix}_output`, {...native(chunkJob), size: word.length, sha256: hash(word), chunks: 1});
    const chunk = {...native(chunkJob), output_id: declaration.output_id, index: 0, data_base64: Buffer.from(word).toString('base64')};
    await call(chunkJob.owner, `put_${prefix}_output_chunk`, chunk);
    digestHook = {bytes: Buffer.from(word), action: () => downgrade(chunkJob)};
    await assert.rejects(call(chunkJob.owner, `put_${prefix}_output_chunk`, chunk));
    assert.equal(digestHook, null);
    assert.equal((await op.view(chunkJob)).resource_class, 'prepare');
    const table = kind === 'article' ? 'articles' : 'local_word_jobs', field = kind === 'article' ? 'result_meta' : 'output_meta';
    assert.equal(JSON.parse(h.sql.prepare(`SELECT ${field} meta FROM ${table} WHERE id=?`).get(chunkJob.target_id).meta).parts.length, 1);
  }
  pass('article/local native duplicate chunks refuse success after token/scope rotation across a real SHA digest boundary');

  const artifact = await seed(h.d1, owner('artifact')); await op.acquire(artifact, 'prepare');
  await op.progress(artifact, 'read_source', 'completed', {action: 'read_frozen_source', reason: 'none'});
  await op.progress(artifact, 'collect_images', 'completed', {action: 'search_public_images', reason: 'none', candidate_urls: [metadata.source_url]});
  const artifactArgs = await op.transitionArgs(artifact, 'heavy'), artifactGrant = await op.transition(artifact, artifactArgs);
  op.adoptTransition(artifact, artifactArgs, artifactGrant);
  await w.declareImageFloor(artifact.owner, {...base(artifact), minimum_images: 1});
  const asset = await cache(artifact, 'image', image, metadata);
  await w.recordImageResult(artifact.owner, {...base(artifact), candidate_id: randomUUID(), source_url: metadata.source_url,
    source_title: metadata.source_title, outcome: 'ready', reason: 'none', asset_id: asset});
  await articles.articleCall(artifact.owner, 'record_article_images', {...native(artifact), images: [{...metadata, sha256: hash(image)}]});
  await op.progress(artifact, 'confirm_images', 'completed', {action: 'place_images', reason: 'none',
    inspected_images: [{sha256: hash(image), width: 1, height: 1, after_paragraph: 1}], images_total: 1});
  await cache(artifact, 'word', word);
  const output = await articles.articleCall(artifact.owner, 'begin_article_output', {...native(artifact), size: word.length, sha256: hash(word), chunks: 1});
  await articles.articleCall(artifact.owner, 'put_article_output_chunk', {...native(artifact), output_id: output.output_id, index: 0,
    data_base64: Buffer.from(word).toString('base64')});
  await articles.articleCall(artifact.owner, 'finalize_article_output', {...native(artifact), output_id: output.output_id});
  const saved = await p.readWordProgress(artifact.owner, 'article', artifact.target_id);
  assert.equal(saved.save.independently_confirmed, true); assert.equal(saved.save.desktop_saved, null);
  assert.equal(saved.output.sha256, hash(word)); assert.equal(saved.steps[5].state, 'completed');
  await assert.rejects(op.acquire(freshExecution(artifact), 'heavy'));
  await assert.rejects(op.intent(artifact, 'run'));
  await assert.rejects(op.progress(artifact, 'save_final', 'running', {action: 'upload_output', reason: 'none'}));
  pass('prepare-to-heavy preserves source/search and supports real synthetic PNG/DOCX native finalize/readback; saved task is read-only');

  assert.equal(h.externalCalls, 0);
  console.log(`RESULT ${passed} groups PASS; actual SQLite CAS + actual TS + synthetic PNG/DOCX, zero external calls, no rendering or production concurrency claim`);
} finally { h.close(); }
