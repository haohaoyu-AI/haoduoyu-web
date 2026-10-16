// Real isolated local workerd D1 SQL/transactions with actual TypeScript modules.
// Synthetic records only. No production, external network, R2 workload or rendering.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Miniflare} from 'miniflare';
import {drizzle} from 'drizzle-orm/d1';
import {migrate} from 'drizzle-orm/d1/migrator';
import {createSyntheticHarness} from './word-recovery-harness.mjs';
import {hash, owner, seed, base, operations} from './word-phase-pool-fixture.mjs';

const mf = new Miniflare({cf: false, modules: true,
  script: 'export default {fetch(){return new Response("SYNTHETIC PHASE POOL D1")}}',
  compatibilityDate: '2026-05-22', d1Databases: {DB: 'synthetic-word-phase-pool-d1'}});
const h = createSyntheticHarness({projectRoot: process.cwd(), migrate: false});
let passed = 0;
const pass = name => { passed++; console.log(`PASS ${name}`); };

try {
  const d1 = await mf.getD1Database('DB');
  await migrate(drizzle(d1), {migrationsFolder: 'drizzle'});
  await migrate(drizzle(d1), {migrationsFolder: 'drizzle'});
  h.env.DB = d1;
  const load = h.loader(), w = load('word-recovery'), p = load('word-progress'), op = operations(w, p);
  const count = async (table, who) => (await d1.prepare(`SELECT COUNT(*) n FROM ${table} WHERE owner=?`).bind(who).first()).n;
  const active = async who => d1.prepare("SELECT COUNT(*) n,SUM(CASE WHEN execution_scope='heavy' THEN 1 ELSE 0 END) heavy FROM word_recovery WHERE owner=? AND token_hash IS NOT NULL AND status='running' AND desired='run' AND lease_until>strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(who).first();
  assert.ok((await d1.prepare('PRAGMA table_info(word_recovery)').all()).results.some(x => x.name === 'execution_scope'));
  assert.ok((await d1.prepare('PRAGMA table_info(word_execution_queue)').all()).results.length > 0);
  pass('all production migrations apply and rerun safely in real isolated workerd D1');

  const who = owner('real-capacity'), jobs = await Promise.all(Array.from({length: 8}, () => seed(d1, who)));
  const acquired = await Promise.all(jobs.map(job => op.acquire(job, 'prepare')));
  assert.equal(acquired.filter(x => x.acquired).length, 7);
  assert.equal((await active(who)).n, 7);
  const winners = jobs.filter((_, i) => acquired[i].acquired), queued = jobs.find((_, i) => !acquired[i].acquired);
  assert.ok(queued);
  const pending = await op.receipt(queued);
  assert.equal(pending.recorded, false); assert.equal(pending.queued, true); assert.equal(pending.applicable, false);
  assert.equal(pending.request_state, 'queued'); assert.equal(pending.new_execution_grant, false);
  assert.equal(pending.queue_reason, 'total_capacity');
  assert.equal((await d1.prepare('SELECT token_hash FROM word_recovery WHERE owner=? AND target_id=?').bind(who, queued.target_id).first()).token_hash, null);
  pass('eight concurrent D1 preparation CAS operations grant exactly seven; eighth queue has no applicable receipt/token grant');

  const first = winners[0], duplicate = await Promise.all(Array.from({length: 12}, () => op.acquire(first, 'prepare')));
  assert.ok(duplicate.every(x => x.duplicate && !x.new_execution_grant));
  assert.equal((await d1.prepare('SELECT COUNT(*) n FROM word_execution_receipts WHERE owner=? AND request_key=?').bind(who, first.request_key).first()).n, 1);
  const queueDuplicate = await Promise.all(Array.from({length: 12}, () => op.acquire(queued, 'prepare')));
  assert.ok(queueDuplicate.every(x => !x.acquired && x.queued && !x.new_execution_grant));
  assert.equal(await count('word_execution_queue', who), 1);
  await assert.rejects(op.acquire({...queued, execution_token: randomUUID()}, 'prepare'));
  pass('twelve simultaneous active and queued duplicate wakes each reuse one durable request; conflict cannot replace request');

  const transitions = await Promise.all(winners.map(job => op.transitionArgs(job, 'heavy')));
  const conversions = await Promise.all(winners.map((job, index) => op.transition(job, transitions[index])));
  assert.equal(conversions.filter(x => x.acquired).length, 2);
  assert.equal(conversions.filter(x => !x.acquired && x.queued).length, 5);
  assert.equal((await active(who)).n, 7); assert.equal((await active(who)).heavy, 2);
  const heavy = winners.filter((_, i) => conversions[i].acquired);
  for (let index = 0; index < winners.length; index++) {
    if (conversions[index].acquired) op.adoptTransition(winners[index], transitions[index], conversions[index]);
    else {
      await w.wordWriteFence(who, 'article', winners[index].target_id, winners[index].claim_token, winners[index].execution_token, 'prepare');
      await assert.rejects(w.wordWriteFence(who, 'article', winners[index].target_id, winners[index].claim_token, transitions[index].next_execution_token));
    }
  }
  pass('seven simultaneous D1 conversions grant exactly two heavy slots; five retain preparation lease and queue without a heavy grant');

  const queuedIndex = conversions.findIndex(x => !x.acquired), awaiting = winners[queuedIndex], qargs = transitions[queuedIndex];
  const queueBeforeReplay = await op.view(awaiting);
  assert.ok(queueBeforeReplay.queue_revision > 0);
  assert.equal((await op.transition(awaiting, qargs)).new_execution_grant, false);
  assert.equal((await op.view(awaiting)).queue_revision, queueBeforeReplay.queue_revision);
  await op.progress(awaiting, 'read_source', 'completed', {action: 'read_frozen_source', reason: 'none'});
  await op.progress(awaiting, 'collect_images', 'waiting', {action: 'search_public_images', reason: 'waiting_for_images',
    candidate_urls: ['https://images.example.org/real-d1-fixture.png']});
  const preserved = await p.readWordProgress(who, 'article', awaiting.target_id), beforeScope = await op.view(awaiting);
  await op.intent(heavy[0], 'paused');
  const released = await op.transition(awaiting, qargs);
  assert.equal(released.acquired, true); assert.equal(released.epoch, beforeScope.epoch + 1);
  op.adoptTransition(awaiting, qargs, released);
  const after = await p.readWordProgress(who, 'article', awaiting.target_id);
  assert.equal(after.target_id, preserved.target_id); assert.equal(after.input_sha256, preserved.input_sha256);
  assert.equal(after.version, preserved.version); assert.equal(after.steps[1].counts.completed, 1);
  const replay = await op.transition(awaiting, qargs);
  assert.equal(replay.duplicate, true); assert.equal(replay.new_execution_grant, false);
  assert.equal((await active(who)).heavy, 2);
  pass('same-key conversion after real D1 release preserves same ID/source/counts and grants one new epoch exactly once');

  const eighth = await op.acquire(queued, 'prepare');
  assert.equal(eighth.acquired, true); assert.equal(eighth.new_execution_grant, true);
  assert.equal((await active(who)).n, 7);
  assert.equal((await op.receipt(queued)).applicable, true);
  pass('queued eighth acquisition reuses original key after total-capacity release and becomes one applicable grant');

  const mixedOwner = owner('real-mixed'), mixedArticle = await seed(d1, mixedOwner), mixedLocal = await seed(d1, mixedOwner, 'local_word');
  assert.equal((await op.acquire(mixedArticle, 'heavy')).acquired, true);
  assert.equal((await op.acquire(mixedLocal, 'heavy')).acquired, true);
  const third = await seed(d1, mixedOwner, 'local_word');
  assert.equal((await op.acquire(third, 'heavy')).acquired, false);
  assert.equal((await active(mixedOwner)).heavy, 2);
  const isolatedOwner = owner('real-other-owner'), isolated = await Promise.all(Array.from({length: 2}, () => seed(d1, isolatedOwner)));
  assert.ok((await Promise.all(isolated.map(job => op.acquire(job, 'heavy')))).every(x => x.acquired));
  await assert.rejects(w.wordRecoveryCall(isolatedOwner, 'read_word_recovery', {target_kind: 'article', target_id: mixedArticle.target_id}));
  pass('real D1 article/local jobs share two heavy slots; another owner retains independent bounded capacity and isolation');

  const totalOwner = owner('real-total-reason'), prepOnly = await Promise.all(Array.from({length: 7}, () => seed(d1, totalOwner)));
  assert.ok((await Promise.all(prepOnly.map(job => op.acquire(job, 'prepare')))).every(x => x.acquired));
  const totalBlocked = await seed(d1, totalOwner), totalResult = await op.acquire(totalBlocked, 'heavy');
  assert.equal(totalResult.acquired, false); assert.equal(totalResult.queued, true);
  assert.equal((await op.receipt(totalBlocked)).queue_reason, 'total_capacity');
  assert.equal((await op.view(totalBlocked)).queue_reason, 'total_capacity');
  assert.equal((await active(totalOwner)).heavy, 0);
  await op.intent(prepOnly[0], 'paused');
  assert.equal((await op.acquire(totalBlocked, 'heavy')).acquired, true);
  assert.equal((await active(totalOwner)).n, 7); assert.equal((await active(totalOwner)).heavy, 1);
  pass('real D1 heavy request with zero heavy slots used reports total-capacity wait and acquires after a preparation release');

  const legacyOwner = owner('real-legacy'), legacy = await seed(d1, legacyOwner), stamp = new Date().toISOString(), until = new Date(Date.now() + 600000).toISOString();
  await d1.prepare("INSERT INTO word_recovery(owner,target_kind,target_id,input_sha256,claim_hash,version,epoch,desired,execution_id,request_key,token_hash,lease_until,heartbeat_at,status,reason,retry_count,updated) VALUES(?,?,?,?,?,1,1,'run',?,?,?,?,?,'running','none',0,?)")
    .bind(legacyOwner, 'article', legacy.target_id, legacy.input_sha256, hash(legacy.claim_token), legacy.execution_id,
      legacy.request_key, hash(legacy.execution_token), until, stamp, stamp).run();
  await d1.prepare('INSERT INTO word_execution_receipts(owner,request_key,target_kind,target_id,input_sha256,claim_hash,token_hash,execution_id,epoch,created) VALUES(?,?,?,?,?,?,?,?,1,?)')
    .bind(legacyOwner, legacy.request_key, 'article', legacy.target_id, legacy.input_sha256, hash(legacy.claim_token),
      hash(legacy.execution_token), legacy.execution_id, stamp).run();
  assert.equal((await op.view(legacy)).resource_class, 'heavy'); assert.equal((await op.receipt(legacy)).applicable, true);
  const oldSecond = await seed(d1, legacyOwner), oldThird = await seed(d1, legacyOwner);
  assert.equal((await op.acquire(oldSecond)).acquired, true); assert.equal((await op.acquire(oldThird)).acquired, false);
  assert.equal((await active(legacyOwner)).heavy, 2);
  pass('pre-pool-shaped rows/receipts and scope-omitted calls default to heavy and consume the original two-slot bound');

  const failureOwner = owner('real-failure'), failed = await seed(d1, failureOwner), unaffected = await seed(d1, failureOwner);
  await op.acquire(failed, 'prepare'); await op.acquire(unaffected, 'prepare');
  await op.progress(failed, 'read_source', 'completed', {action: 'read_frozen_source', reason: 'none'});
  await w.wordRecoveryCall(failed.owner, 'report_word_interruption', {...base(failed), request_key: randomUUID(),
    epoch: (await op.view(failed)).epoch, reason: 'http_403'});
  await op.progress(unaffected, 'read_source', 'completed', {action: 'read_frozen_source', reason: 'none'});
  assert.equal((await op.view(failed)).status, 'blocked'); assert.equal((await op.view(unaffected)).status, 'running');
  assert.equal((await p.readWordProgress(failed.owner, 'article', failed.target_id)).steps[0].state, 'completed');
  assert.equal((await active(failureOwner)).n, 1);
  pass('real D1 interruption affects only one task/slot, preserving its confirmed source and other executor progress');

  const fencing = await seed(d1, owner('real-fencing')); await op.acquire(fencing, 'prepare');
  const issuedFence = await w.wordWriteFence(fencing.owner, 'article', fencing.target_id, fencing.claim_token, fencing.execution_token, 'prepare');
  const t = await op.transitionArgs(fencing, 'heavy'), tg = await op.transition(fencing, t);
  assert.equal((await d1.prepare("UPDATE articles SET error='stale' WHERE owner=? AND id=?" + issuedFence).bind(fencing.owner, fencing.target_id).run()).meta.changes, 0);
  await assert.rejects(w.wordWriteFence(fencing.owner, 'article', fencing.target_id, fencing.claim_token, fencing.execution_token, 'prepare'));
  op.adoptTransition(fencing, t, tg);
  const currentFence = await w.wordWriteFence(fencing.owner, 'article', fencing.target_id, fencing.claim_token, fencing.execution_token);
  await op.intent(fencing, 'paused');
  assert.equal((await d1.prepare("UPDATE articles SET error='late' WHERE owner=? AND id=?" + currentFence).bind(fencing.owner, fencing.target_id).run()).meta.changes, 0);
  assert.equal((await op.receipt(fencing)).applicable, false);
  await assert.rejects(op.acquire({...fencing, request_key: randomUUID(), execution_id: randomUUID(), execution_token: randomUUID()}, 'heavy'));
  pass('real D1 previously issued scope fence fails after token rotation and after pause; old receipt cannot revive');

  const race = await seed(d1, owner('real-transition-race')); await op.acquire(race, 'prepare');
  const raceBefore = await op.view(race), racers = await Promise.all([op.transitionArgs(race, 'heavy'), op.transitionArgs(race, 'heavy')]);
  const raceResults = await Promise.allSettled(racers.map(args => op.transition(race, args)));
  assert.equal(raceResults.filter(x => x.status === 'fulfilled' && x.value.acquired).length, 1);
  assert.equal((await op.view(race)).epoch, raceBefore.epoch + 1);
  assert.equal(await count('word_execution_receipts', race.owner), 2);
  assert.equal((await active(race.owner)).n, 1);
  pass('two simultaneous D1 conversion keys against one epoch/version have one winner and one immutable new receipt');

  const progressJob = await seed(d1, owner('real-progress')); await op.acquire(progressJob, 'prepare');
  const event = {...base(progressJob), expected_version: 0, event_id: randomUUID(), stage: 'read_source', state: 'completed',
    observation: {action: 'read_frozen_source', reason: 'none'}};
  const concurrentEvents = await Promise.allSettled([event, {...event, event_id: randomUUID()}].map(e => p.recordWordProgress(progressJob.owner, e)));
  assert.equal(concurrentEvents.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal((await p.readWordProgress(progressJob.owner, 'article', progressJob.target_id)).version, 1);
  const collection = await op.progress(progressJob, 'collect_images', 'running', {action: 'search_public_images', reason: 'none',
    candidate_urls: ['https://images.example.org/real-count.png']});
  const duplicates = await Promise.all(Array.from({length: 10}, () => p.recordWordProgress(progressJob.owner, collection.event)));
  assert.ok(duplicates.every(x => x.duplicate));
  assert.equal((await p.readWordProgress(progressJob.owner, 'article', progressJob.target_id)).steps[1].counts.completed, 1);
  for (const [stage, action] of [['confirm_images', 'filter_images'], ['generate_word', 'build_docx'], ['inspect_pages', 'render_pages'], ['save_final', 'upload_output']]) {
    await assert.rejects(op.progress(progressJob, stage, 'running', {action, reason: 'none'}));
  }
  pass('real D1 source-event CAS and ten search duplicates preserve counts; preparation never reports heavy stages');

  const source = await seed(d1, owner('real-source-change')); await op.acquire(source, 'prepare');
  const sourceFence = await w.wordWriteFence(source.owner, 'article', source.target_id, source.claim_token, source.execution_token, 'prepare');
  await d1.prepare('UPDATE articles SET paragraphs=? WHERE id=?').bind(JSON.stringify(['Changed synthetic source']), source.target_id).run();
  assert.equal((await d1.prepare("UPDATE articles SET error='late' WHERE id=?" + sourceFence).bind(source.target_id).run()).meta.changes, 0);
  assert.equal((await op.receipt(source)).applicable, false);
  await assert.rejects(op.progress(source, 'read_source', 'completed', {action: 'read_frozen_source', reason: 'none'}));
  const expired = await seed(d1, owner('real-expired')); await op.acquire(expired, 'prepare');
  await d1.prepare('UPDATE articles SET claim_expires=? WHERE id=?').bind(new Date(Date.now() - 60000).toISOString(), expired.target_id).run();
  await assert.rejects(op.transition(expired, await op.transitionArgs(expired, 'heavy')));
  assert.equal((await op.receipt(expired)).applicable, false);
  pass('real D1 frozen-source mutation and claim expiry reject late SQL, progress, conversion and receipt applicability');

  const completed = await seed(d1, owner('real-completed'));
  await d1.prepare("UPDATE articles SET state='word_ready',result_key=? WHERE id=?").bind(`articles/${completed.target_id}/synthetic-final.docx`, completed.target_id).run();
  await assert.rejects(op.acquire(completed, 'prepare'));
  await assert.rejects(w.setWordIntent(completed.owner, {target_kind: 'article', target_id: completed.target_id,
    input_sha256: completed.input_sha256, expected_version: 0, intent: 'run'}));
  assert.equal(await count('word_execution_receipts', completed.owner), 0);
  pass('completed native-output record is read-only and cannot acquire a new preparation or heavy execution');

  assert.equal(h.externalCalls, 0);
  console.log(`RESULT ${passed} groups PASS; actual isolated workerd D1, synthetic inputs only, zero external calls, no production/resource-load assertion`);
} finally { h.close(); await mf.dispose(); }
