import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {archiveFixture} from './review-archive-fixture.mjs';

const archive = 'review/archive';
const imports = `${archive}/imports`;
const capturedAt = '2026-11-10T01:00:00Z';
const platformId = '9990012345678900001';
const secondPlatformId = '9990012345678900002';
const scope = (changes = {}) => ({account: 'V字', platform: 'toutiao', kind: 'article', collected_at: capturedAt,
  from: null, to: null, ...changes});
const row = (key, id, changes = {}) => ({key, record: {published_title: `合成发布 ${key}`,
  publication_status: 'published', published_at: '2026-11-09T01:00:00Z', ...changes},
refs: [{kind: 'publication', platform_id: id}]});
const page = (changes = {}) => ({run_id: randomUUID(), kind: 'directory', source: 'synthetic-directory',
  source_key: randomUUID(), scope: scope(), page: 1, coverage: {}, rows: [], ...changes});

const preview = (app, body, options = {}) => app.request(`${imports}/preview`, {method: 'POST', body, ...options});
const apply = (app, body, preview_hash, options = {}) => app.request(`${imports}/apply`, {
  method: 'POST', body: {...body, preview_hash}, ...options,
});
const checkpoint = (app, id) => app.request(`${imports}/${id}`);
const directoryDiff = (app, id) => app.request(`${imports}/${id}/reconcile`);

function succeeded(result) {
  assert.ok([200, 201].includes(result.status), JSON.stringify(result));
  return result.data;
}

async function doPage(app, body) {
  const plan = succeeded(await preview(app, body));
  assert.match(plan.preview_hash, /^[0-9a-f]{64}$/);
  const data = succeeded(await apply(app, body, plan.preview_hash));
  return {plan, data};
}

test('V字 import previews without writes, recovers a committed page from its checkpoint, and resumes without duplicates', async t => {
  const app = await archiveFixture(t);
  const first = page({rows: [row('first', platformId, {published_body: '合成导入正文 ONLY_ARCHIVE_DETAIL'})],
    coverage: {last_page: false, whole_scope: true, total_rows: 2}});
  const initialRevision = await app.revision();
  const plan = succeeded(await preview(app, first));
  assert.match(plan.preview_hash, /^[0-9a-f]{64}$/);
  assert.deepEqual(plan.rows.map(({key, action}) => [key, action]), [['first', 'new']]);
  assert.doesNotMatch(JSON.stringify(plan), /ONLY_ARCHIVE_DETAIL/);
  assert.equal(await app.revision(), initialRevision);
  assert.equal((await checkpoint(app, first.run_id)).status, 404);

  const firstCommit = succeeded(await apply(app, first, plan.preview_hash));
  const recovered = succeeded(await checkpoint(app, first.run_id));
  assert.equal(recovered.next_page, 2);
  assert.equal(recovered.closed, false);
  assert.equal(firstCommit.rows[0].status, 'success');
  assert.doesNotMatch(JSON.stringify(recovered), /ONLY_ARCHIVE_DETAIL/);
  const revisionAfterCommit = await app.revision();
  const retry = succeeded(await apply(app, structuredClone(first), plan.preview_hash));
  assert.equal(retry.replayed, true);
  assert.equal(retry.rows[0].item_id, firstCommit.rows[0].item_id);
  assert.equal(await app.revision(), revisionAfterCommit);

  const changed = {...first, rows: [row('first', platformId, {published_title: '同一批次不同内容'})]};
  const conflictingReplay = await apply(app, changed, plan.preview_hash);
  assert.equal(conflictingReplay.status, 409, JSON.stringify(conflictingReplay));
  assert.equal(conflictingReplay.error.code, 'ARCHIVE_IMPORT_PAGE_CONFLICT');

  const skipped = await preview(app, {...first, page: 3, rows: [row('jump-ahead', secondPlatformId)]});
  assert.equal(skipped.status, 409, JSON.stringify(skipped));
  assert.equal(skipped.error.code, 'ARCHIVE_IMPORT_PAGE_ORDER');
  const abandonedIdentity = await preview(app, {...first, run_id: randomUUID()});
  assert.equal(abandonedIdentity.status, 409, JSON.stringify(abandonedIdentity));
  assert.equal(abandonedIdentity.error.code, 'ARCHIVE_IMPORT_RUN_CONFLICT');
  assert.equal(await app.revision(), revisionAfterCommit);

  const second = {...first, page: 2, coverage: {last_page: true, whole_scope: true, total_rows: 2},
    rows: [row('second', secondPlatformId)]};
  const secondPlan = succeeded(await preview(app, second));
  const concurrent = (await Promise.all([apply(app, second, secondPlan.preview_hash), apply(app, second, secondPlan.preview_hash)]))
    .map(succeeded);
  assert.equal(concurrent.filter(result => result.replayed).length, 1);
  const [final] = concurrent;
  assert.equal(concurrent[1].rows[0].item_id, final.rows[0].item_id);
  assert.equal(final.rows[0].status, 'success');
  assert.notEqual(final.rows[0].item_id, firstCommit.rows[0].item_id);
  const completed = succeeded(await checkpoint(app, first.run_id));
  assert.equal(completed.next_page, null);
  assert.equal(completed.closed, true);
  assert.equal(completed.coverage.complete, true, JSON.stringify(completed.coverage));
  const kept = await app.db.prepare('SELECT id FROM matrix_review_archive_items WHERE user_id=? ORDER BY id').bind(app.owner).all();
  assert.deepEqual(kept.results.map(item => item.id), [firstCommit.rows[0].item_id, final.rows[0].item_id].sort());
});

test('a closed partial window and rejected records never prove full sync or erase items absent from a directory', async t => {
  const app = await archiveFixture(t);
  const first = await doPage(app, page({scope: scope({kind: 'micro'}), rows: [row('micro', platformId)],
    coverage: {last_page: true, whole_scope: true, total_rows: 1}}));
  const existing = await doPage(app, page({rows: [row('outside-window', secondPlatformId, {published_at: '2026-10-01T01:00:00Z'})],
    coverage: {last_page: true, whole_scope: true, total_rows: 1}}));
  const partial = page({scope: scope({from: '2026-11-01', to: '2026-11-09'}),
    coverage: {last_page: true, whole_scope: false, total_rows: 2},
    rows: [row('wrong-kind', platformId), {key: 'missing-identity'}]});
  const {plan, data} = await doPage(app, partial);
  assert.deepEqual(plan.rows.map(item => [item.key, item.action]), [['wrong-kind', 'conflict'], ['missing-identity', 'unrecognized']]);
  assert.deepEqual(data.rows.map(item => item.status), ['failure', 'omission']);
  const check = succeeded(await checkpoint(app, partial.run_id));
  assert.equal(check.closed, true);
  assert.equal(check.coverage.complete, false);
  const diff = succeeded(await directoryDiff(app, partial.run_id));
  assert.equal(diff.site_only_assessed, false);
  assert.deepEqual(diff.site_only, []);
  const rows = (await app.db.prepare('SELECT id,kind,publication_status FROM matrix_review_archive_items WHERE user_id=?').bind(app.owner).all()).results;
  assert.deepEqual(rows.sort((a,b) => a.kind.localeCompare(b.kind)), [
    {id: existing.data.rows[0].item_id, kind: 'article', publication_status: 'published'},
    {id: first.data.rows[0].item_id, kind: 'micro', publication_status: 'published'},
  ]);
  const verified = page({rows: [row('seen-now', '9990012345678900003')],
    coverage: {last_page: true, whole_scope: true, total_rows: 1}});
  await doPage(app, verified);
  const verifiedDiff = succeeded(await directoryDiff(app, verified.run_id));
  assert.equal(verifiedDiff.site_only_assessed, true);
  assert.deepEqual(verifiedDiff.site_only, [{platform_id: secondPlatformId, item_id: existing.data.rows[0].item_id}]);
  const untouched = await app.db.prepare('SELECT publication_status FROM matrix_review_archive_items WHERE user_id=? AND id=?')
    .bind(app.owner, existing.data.rows[0].item_id).first();
  assert.equal(untouched.publication_status, 'published');
});

function interruptCommit(db) {
  return {
    prepare: db.prepare.bind(db),
    batch: statements => db.batch([...statements, db.prepare('SELECT * FROM synthetic_archive_commit_failure')]),
    ...(typeof db.withSession === 'function' ? {withSession: argumentsToPass => interruptCommit(db.withSession(argumentsToPass))} : {}),
  };
}

test('interrupted D1 commit rolls back both page and archive rows and the original request can resume', async t => {
  const app = await archiveFixture(t);
  const body = page({rows: [row('retryable', platformId)], coverage: {last_page: true, whole_scope: true, total_rows: 1}});
  const plan = succeeded(await preview(app, body));
  const revisionBefore = await app.revision();
  const fail = await apply(app, body, plan.preview_hash, {environment: {...app.env, DB: interruptCommit(app.db)}});
  assert.equal(fail.status, 500, JSON.stringify(fail));
  assert.equal(await app.revision(), revisionBefore);
  assert.equal((await checkpoint(app, body.run_id)).status, 404);
  const existing = await app.db.prepare('SELECT count(*) AS count FROM matrix_review_archive_items WHERE user_id=?').bind(app.owner).first();
  assert.equal(existing.count, 0);
  const result = succeeded(await apply(app, body, plan.preview_hash));
  assert.equal(result.rows[0].status, 'success');
});

test('V字 import requires its owner and rejects account or platform scope changes before persistence', async t => {
  const app = await archiveFixture(t);
  const body = page({rows: [row('in-scope', platformId)]});
  const boundary = await app.revision();
  assert.ok([401, 403].includes((await preview(app, body, {auth: false})).status));
  for (const extra of [{account: 'Z极客'}, {platform: 'zhihu'}]) {
    const invalid = await preview(app, {...body, scope: scope(extra)});
    assert.equal(invalid.status, 400, JSON.stringify(invalid));
  }
  assert.equal(await app.revision(), boundary);
  assert.equal((await checkpoint(app, body.run_id)).status, 404);
});

test('later directory capture publishes the existing same-ID draft and historical metric imports never rewrite a captured sample', async t => {
  const app = await archiveFixture(t);
  const draftInput = {key: 'draft-original', record: {original_title: '合成草稿标题', publication_status: 'pending',
    draft_saved_at: '2026-11-08T13:00:00+08:00', sample_title: '真实已知的合成样本', sample_url: 'https://example.org/source/sample'},
  refs: [{kind: 'draft', platform_id: platformId, role: 'primary'}]};
  const draft = await doPage(app, page({kind: 'drafts', rows: [draftInput]}));
  const itemId = draft.data.rows[0].item_id;
  const published = await doPage(app, page({rows: [row('changed-title', platformId, {published_title: '发布时完全修改的标题'})]}));
  assert.equal(published.data.rows[0].item_id, itemId);
  const itemPath = `${archive}/items/${itemId}`;
  const linked = succeeded(await app.request(itemPath));
  assert.equal(linked.original_title, draftInput.record.original_title);
  assert.equal(linked.published_title, '发布时完全修改的标题');
  assert.equal(linked.publication_status, 'published');
  assert.equal(linked.association_status, 'matched');
  assert.equal(linked.sample_url, draftInput.record.sample_url);
  assert.deepEqual(linked.refs.map(ref => [ref.kind, ref.platform_id]).sort(), [['draft', platformId], ['publication', platformId]]);
  const evidence = linked.history.find(event => event.details.match?.kind === 'id')?.details.match;
  assert.equal(evidence?.confidence, 'exact');
  assert.equal(evidence?.evidence.draft_reference, true);

  const metricSource = 'synthetic-captured-historical';
  const snapshots = [
    {id: randomUUID(), source_key: 'hour-five', observed_at: '2026-11-09T06:00:00Z', metrics: {reads: 0, ctr: null}},
    {id: randomUUID(), source_key: 'hour-six', observed_at: '2026-11-09T07:00:00Z', metrics: {reads: 100, impressions: 480, ctr: 20}},
  ];
  const observations = snapshots.map((snapshot, index) => ({key: `capture-${index}`, item_id: itemId,
    refs: [{kind: 'publication', platform_id: platformId}], snapshot}));
  const captured = await doPage(app, page({kind: 'metrics', source: metricSource, rows: observations}));
  assert.deepEqual(captured.data.rows.map(entry => entry.status), ['success', 'success']);
  const afterMetrics = succeeded(await app.request(itemPath));
  assert.equal(afterMetrics.version, linked.version + 1);
  assert.deepEqual(afterMetrics.history.find(event => event.version === afterMetrics.version).details.snapshot_ids, snapshots.map(reading => reading.id));
  const staleEdit = await app.request(itemPath, {method:'PATCH',body:{expected_version:linked.version,changes:{source_note:'过期编辑'}}});
  assert.equal(staleEdit.status,409);
  assert.equal(staleEdit.error.code,'VERSION_CONFLICT');
  const refsOnly = await doPage(app, page({kind:'drafts', rows:[{key:'duplicate-ref',item_id:itemId,
    refs:[{kind:'draft',role:'duplicate',platform_id:secondPlatformId}]}]}));
  assert.equal(refsOnly.data.rows[0].status,'success');
  const afterReference = succeeded(await app.request(itemPath));
  assert.equal(afterReference.version,afterMetrics.version+1);
  const refId = afterReference.refs.find(ref=>ref.platform_id===secondPlatformId).id;
  assert.deepEqual(afterReference.history.find(event=>event.version===afterReference.version).details.reference_ids,[refId]);
  const conflictingReading = {...observations[1], snapshot: {...snapshots[1], metrics: {reads: 300}}};
  const conflict = await doPage(app, page({kind: 'metrics', source: metricSource, rows: [conflictingReading]}));
  assert.deepEqual(conflict.data.rows.map(entry => entry.status), ['failure']);
  for (const [source_key, observed_at] of [['before-publication', '2026-11-08T01:00:00Z'], ['after-capture', '2026-11-10T12:00:00Z']]) {
    const impossible = {...observations[0], snapshot: {...snapshots[0], id: randomUUID(), source_key, observed_at}};
    const rejected = await doPage(app, page({kind: 'metrics', source: metricSource, rows: [impossible]}));
    assert.ok(['failure', 'omission'].includes(rejected.data.rows[0].status), JSON.stringify(rejected));
  }
  const history = succeeded(await app.request(itemPath)).snapshots;
  assert.deepEqual(history.map(entry => [entry.id, entry.metrics]).reverse(), snapshots.map(entry => [entry.id, entry.metrics]));
  assert.equal(succeeded(await app.request(`${archive}/overview`)).counts.published, 1);
});

test('metric imports reject snapshots for unpublished or unverified items and preserve archive values', async t => {
  const app = await archiveFixture(t);
  const published = await doPage(app,page({rows:[row('published-with-missing-reading',platformId)]}));
  const targets = [];
  for(const publication_status of ['pending','unknown']) {
    const item=succeeded(await app.request(`${archive}/items`,{method:'POST',
      body:{kind:'article',original_title:`合成待核稿 ${publication_status}`,publication_status}}));
    targets.push(item);
  }
  const metrics=page({kind:'metrics',rows:targets.map((item,index)=>({key:`wrong-${index}`,item_id:item.id,
    ...(index===1?{record:{publication_status:'published'}}:{}),
    snapshot:{source_key:`unverified-${index}`,observed_at:'2026-11-09T06:00:00Z',metrics:{reads:0}}}))});
  const origin=await app.revision();
  const plan=succeeded(await preview(app,metrics));
  assert.equal(await app.revision(),origin);
  assert.deepEqual(plan.rows.map(({action,code})=>[action,code]),Array(2).fill(['conflict','ARCHIVE_IMPORT_SNAPSHOT_NOT_PUBLISHED']));
  const applied=succeeded(await apply(app,metrics,plan.preview_hash));
  assert.deepEqual(applied.rows.map(entry=>entry.status),['failure','failure']);
  for(const item of targets) {
    const readBack=succeeded(await app.request(`${archive}/items/${item.id}`));
    assert.equal(readBack.version,item.version);
    assert.equal(readBack.publication_status,item.publication_status);
    assert.deepEqual(readBack.snapshots,[]);
  }
  const untouched=succeeded(await app.request(`${archive}/items/${published.data.rows[0].item_id}`));
  assert.deepEqual(untouched.snapshots,[]);
  assert.deepEqual(succeeded(await app.request(`${archive}/overview`)).metrics.reads,{value:null,known:0,unknown:1});
});

test('a later cumulative export leaves the missed day empty and keeps an article absent from that export published', async t => {
  const app = await archiveFixture(t);
  const directory = await doPage(app, page({rows: [row('captured-article', platformId), row('absent-article', secondPlatformId)]}));
  const [captured, absent] = directory.data.rows;
  const articleDetail = async item => succeeded(await app.request(`${archive}/items/${item.item_id}`));
  const laterReading = {id: randomUUID(), source_key: 'later-reading',
    observed_at: '2026-11-10T08:30:00+08:00', metrics: {reads: 410}};
  const exportBatch = {kind: 'metrics', source: 'synthetic-cumulative-export',
    coverage: {last_page: true, whole_scope: true, total_rows: 1}, rows: [{key: 'actual-next-day-reading',
      item_id: captured.item_id, refs: [{kind: 'publication', platform_id: platformId}], snapshot: laterReading}]};
  const missed = await doPage(app, page({...exportBatch, scope: scope({from: '2026-11-09', to: '2026-11-09'})}));
  assert.deepEqual(missed.data.rows.map(({status, code}) => [status, code]), [['failure', 'ARCHIVE_IMPORT_OUTSIDE_WINDOW']]);
  assert.deepEqual((await articleDetail(captured)).snapshots, []);

  const actual = page({...exportBatch, scope: scope({from: '2026-11-10', to: '2026-11-10'})});
  const saved = await doPage(app, actual);
  assert.equal(saved.data.rows[0].status, 'success');
  assert.equal(saved.data.coverage.complete, true);
  const history = (await articleDetail(captured)).snapshots;
  assert.deepEqual(history.map(({id, observed_at, metrics}) => [id, observed_at, metrics]), [
    [laterReading.id, '2026-11-10T00:30:00.000Z', {reads: 410}],
  ]);
  const diff = succeeded(await directoryDiff(app, actual.run_id));
  assert.equal(diff.site_only_assessed, false);
  assert.deepEqual(diff.site_only, []);
  const omitted = await articleDetail(absent);
  assert.equal(omitted.publication_status, 'published');
  assert.deepEqual(omitted.snapshots, []);
  const overview = succeeded(await app.request(`${archive}/overview`));
  assert.equal(overview.counts.published, 2);
  assert.deepEqual(overview.metrics.reads, {value: 410, known: 1, unknown: 1});
});

test('a stale preview detects an intervening owner correction and importing again preserves that value', async t => {
  const app = await archiveFixture(t);
  const start = row('owner-corrected-item', platformId);
  const applied = await doPage(app, page({rows: [start]}));
  const itemPath = `${archive}/items/${applied.data.rows[0].item_id}`;
  const incoming = page({rows: [row('fill-sample', platformId, {published_title: start.record.published_title,
    sample_title: '导入方样本标题'})]});
  const initial = succeeded(await preview(app, incoming));
  assert.equal(initial.rows[0].action, 'update');
  const item = succeeded(await app.request(itemPath));
  succeeded(await app.request(itemPath, {method: 'PATCH', body: {expected_version: item.version,
    changes: {sample_title: '主人核实的合成样本'}, verify: ['sample_title']}}));
  const afterCorrection = await app.revision();
  const stale = await apply(app, incoming, initial.preview_hash);
  assert.equal(stale.status, 409, JSON.stringify(stale));
  assert.equal(stale.error.code, 'ARCHIVE_IMPORT_PREVIEW_CHANGED');
  assert.equal(await app.revision(), afterCorrection);
  assert.equal((await checkpoint(app, incoming.run_id)).status, 404);
  const refreshed = await doPage(app, incoming);
  assert.equal(refreshed.plan.rows[0].action, 'conflict');
  assert.equal(refreshed.data.rows[0].status, 'failure');
  assert.equal(succeeded(await app.request(itemPath)).sample_title, '主人核实的合成样本');
});

test('an identified publication stays countable when two distinct drafts share its content evidence', async t => {
  const app = await archiveFixture(t);
  const body = [
    '工厂试验台在复验阶段更换陶瓷轴承，三号传感器在下午第一次测得回流口温度恢复到规定范围。',
    '后续检查记录了电机绕组和绝缘层的组装顺序，两位值班技师分别测量了固定夹具的偏心量。',
  ].join('\n\n');
  const sources = [{title: '合成复核报告', url: 'https://example.org/archive-fixture-report'},
    {title: '合成原始记录', url: 'https://example.org/archive-fixture-register'}];
  const drafts = [];
  for (const label of ['甲', '乙']) {
    drafts.push(succeeded(await app.request(`${archive}/items`, {
      method: 'POST', body: {kind: 'article', original_title: '候选'+label, publication_status: 'pending', original_body: body, sources},
    })));
  }
  const incoming = page({rows: [row('independent-publication', platformId, {published_body: body, sources})],
    coverage: {last_page: true, whole_scope: true, total_rows: 1}});
  const archived = (await doPage(app, incoming)).data.rows[0];
  assert.equal(archived.action, 'new');
  assert.equal(archived.status, 'success');
  assert.deepEqual(archived.match.candidates, drafts.map(item => item.id).sort());
  const published = succeeded(await app.request(`${archive}/items/${archived.item_id}`));
  assert.deepEqual([published.publication_status,published.association_status], ['published','ambiguous']);
  for (const draft of drafts)
    assert.equal(succeeded(await app.request(`${archive}/items/${draft.id}`)).publication_status, 'pending');
  assert.equal(succeeded(await app.request(`${archive}/overview`)).counts.published, 1);
  const replayedSource = await doPage(app, {...incoming,run_id:randomUUID(),source_key:randomUUID()});
  assert.equal(replayedSource.data.rows[0].item_id, archived.item_id);
  assert.equal(replayedSource.data.rows[0].action, 'unchanged');
});

test('a verified legacy import inherits its platform identity and prevents a later catalog duplicate', async t => {
  const app = await archiveFixture(t);
  const legacyId = randomUUID();
  const knownTime = '2026-11-09T01:00:00Z';
  const knownTitle = '合成本地旧档案发布稿';
  const legacy = succeeded(await app.request(`review/articles/${legacyId}`, {method: 'PUT',
    body: {account: 'V字', platform: 'toutiao', title: knownTitle, platform_article_id: platformId, published_at: knownTime},
  }));
  assert.equal(legacy.id, legacyId);
  const fromLegacy = await doPage(app, page({rows: [{key: 'linked-legacy-record',
    record: {legacy_id: legacyId, published_title: knownTitle, published_at: knownTime},
    snapshot:{source_key:'verified-legacy-reading',observed_at:'2026-11-09T06:00:00Z',metrics:{reads:20}}}]}));
  const itemId = fromLegacy.data.rows[0].item_id;
  assert.equal(fromLegacy.data.rows[0].status, 'success');
  const archived = succeeded(await app.request(`${archive}/items/${itemId}`));
  assert.deepEqual(archived.refs.map(entry=>[entry.kind,entry.platform_id]), [['publication',platformId]]);
  assert.equal(archived.publication_status,'published');
  assert.equal(archived.snapshots[0].metrics.reads,20);
  const directory = await doPage(app, page({rows: [row('catalog-replay',platformId,{published_title:knownTitle})]}));
  assert.equal(directory.data.rows[0].action, 'unchanged');
  assert.equal(directory.data.rows[0].item_id, itemId);
  const conflicting = await doPage(app, page({rows: [row('different-id',secondPlatformId,
    {legacy_id:legacyId,published_title:knownTitle})]}));
  assert.equal(conflicting.data.rows[0].status, 'failure');
  assert.equal(conflicting.data.rows[0].code, 'ARCHIVE_IMPORT_LEGACY_ID_CONFLICT');
  assert.equal(succeeded(await app.request(`${archive}/overview`)).counts.published, 1);
});
