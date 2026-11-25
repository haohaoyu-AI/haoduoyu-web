import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';
import {reviewOverviewMetrics} from '../web/core/review-overview-metrics.mjs';

async function setup(t) {
  const app = await fixture(t);
  const session = await app.login();
  const owner = (await app.request('/api/v1/auth/me', {session})).data.id;
  const env = {DB: app.db, SITE_ORIGIN: app.origin, DAILY_NOTES_OWNER_ID: owner, PUBLIC_BUSINESS_MODE: '1'};
  async function review(path, {method = 'GET', body, auth = true} = {}) {
    const headers = new Headers();
    if (auth) {
      headers.set('Cookie', session.cookie);
      headers.set('X-CSRF-Token', session.csrfToken);
    }
    if (body !== undefined) {
      headers.set('Content-Type', 'application/json');
      headers.set('Origin', app.origin);
      headers.set('X-Public-Business', '1');
    }
    const response = await worker.fetch(new Request(`${app.origin}/api/v1/review/${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    }), env);
    return {status: response.status, ...await response.json()};
  }
  return {review, db: app.db, owner};
}

const account = 'V字';
const byAccount = `account=${encodeURIComponent(account)}`;
const publicationTime = '2026-10-11T09:00:00+08:00';
const draftPlatformId = '9876543210123456701';
const publicationPlatformId = '9876543210123456702';
const sample = {sample_title: '合成样本标题', sample_url: 'https://example.org/benchmark/12'};
const sharedPassages = [
  '研究团队给石墨转轴加装八角形陶瓷轴承，并把红外测温探头放在机壳背面的回流口。',
  '复验期间陈小青逐次记录了夹具偏心量，直到工作台连续运转七个小时仍保持稳定。',
  '第三轮样机利用分层绕组降低线圈温度，原本被锁死的电路调试窗口重新开放。',
];
const evidence = {
  body: sharedPassages.join('\n\n'),
  source_urls: ['https://example.org/research/18', 'https://example.org/project/72', 'https://example.org/field-notes/4'],
  people: ['陈小青'], events: ['石墨转轴耐久复验'], numbers: ['25.2%', '20平方米'],
};
const draftBody = (extra = {}) => ({
  id: randomUUID(), account, platform_article_id: draftPlatformId, title: '合成原稿标题',
  alternate_titles: ['候选甲', '候选乙', '候选丙', '候选丁'], draft_saved_at: '2026-10-10T18:00:00+08:00',
  ...sample, ...extra,
});
const publicationBody = (extra = {}) => ({
  id: randomUUID(), account, platform_article_id: publicationPlatformId,
  title: '临时选定的全新合成发布标题', published_at: publicationTime,
  url: `https://www.toutiao.com/article/${publicationPlatformId}/`, ...extra,
});
const snapshotBody = (extra = {}) => ({
  id: randomUUID(), snapshot_date: '2026-10-12', reads: 640, ctr: 8, source: 'toutiao_excel', age_hours: 24, ...extra,
});

async function savedDraft(app, extra) {
  const result = await app.review('drafts', {method: 'POST', body: draftBody(extra)});
  assert.equal(result.status, 201, JSON.stringify(result));
  assert.equal(result.data.publish_status, 'pending');
  return result.data;
}

async function reviewState(app) {
  const [articleList, snapshotList] = await Promise.all([
    app.review(`articles?${byAccount}`), app.review(`snapshots?${byAccount}`),
  ]);
  assert.equal(articleList.status, 200);
  assert.equal(snapshotList.status, 200);
  const data = {articles: articleList.data.items, snapshots: snapshotList.data.items};
  return {data, stats: reviewOverviewMetrics(data, {account, range: '30d', now: '2026-10-14T00:00:00Z'})};
}

test('same scoped platform ID survives a complete title change and concurrent sync counts one article', async t => {
  const app = await setup(t);
  const draft = await savedDraft(app);
  const otherAccount = await savedDraft(app, {account: 'Z极客'});
  const body = publicationBody({platform_article_id: draftPlatformId,
    url: `https://www.toutiao.com/article/${draftPlatformId}/`, snapshot: snapshotBody()});
  const sync = () => app.review('publications', {method: 'POST', body});

  const results = await Promise.all([sync(), sync(), sync()]);
  for (const result of results) {
    assert.equal(result.status, 200, JSON.stringify(result));
    assert.equal(result.data.id, draft.id);
    assert.equal(result.data.publish_status, 'published');
    assert.equal(result.data.title, body.title);
    assert.equal(result.data.sample_title, sample.sample_title);
    assert.equal(result.data.sample_url, sample.sample_url);
    assert.equal(result.data.snapshot.id, body.snapshot.id);
  }
  const delayedDraft = await app.review('drafts', {method: 'POST', body: draftBody({id: draft.id, title: '过期草稿标题'})});
  assert.equal(delayedDraft.status, 200, JSON.stringify(delayedDraft));
  assert.equal(delayedDraft.data.publish_status, 'published');
  const {data, stats} = await reviewState(app);
  assert.deepEqual(data.articles.map(row => row.id), [draft.id]);
  assert.equal(data.articles[0].original_draft_title, draft.title);
  assert.equal(data.articles[0].title, body.title);
  assert.deepEqual(data.snapshots.map(row => [row.id, row.article_id]), [[body.snapshot.id, draft.id]]);
  assert.equal(stats.count, 1);
  assert.equal(stats.unmatchedCount, 0);
  assert.equal(stats.readsMedian, body.snapshot.reads);
  assert.equal((await app.review(`articles/${otherAccount.id}`)).data.publish_status, 'pending');
});

test('different IDs link when distinctive passages and independent evidence agree', async t => {
  const app = await setup(t);
  const draft = await savedDraft(app, {match_evidence: evidence});
  const body = publicationBody({match_evidence: {
    ...evidence, body: ['这是正式发布时重写的开头。', ...sharedPassages].join('\n\n'),
  }});
  const result = await app.review('publications', {method: 'POST', body});
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.equal(result.data.id, draft.id);
  assert.equal(result.data.publish_status, 'published');
  assert.equal(result.data.platform_article_id, publicationPlatformId);
  assert.equal(result.data.title, body.title);
  assert.equal(result.data.published_at, '2026-10-11T01:00:00.000Z');
  assert.equal(result.data.sample_url, sample.sample_url);
  const {data, stats} = await reviewState(app);
  assert.equal(data.articles[0].original_draft_title, draft.title);
  assert.equal(stats.count, 1);
  assert.equal(stats.unmatchedCount, 0);
});

test('missing platform ID still links and replays a corroborated publication once', async t => {
  const app = await setup(t);
  const draft = await savedDraft(app, {match_evidence: evidence});
  const body = publicationBody({platform_article_id: null, url: 'https://example.org/published/edited-story',
    match_evidence: evidence, snapshot: snapshotBody()});
  for (let index = 0; index < 2; index++) {
    const result = await app.review('publications', {method: 'POST', body});
    assert.equal(result.status, 200, JSON.stringify(result));
    assert.equal(result.data.id, draft.id);
    assert.equal(result.data.publish_status, 'published');
    assert.equal(result.data.snapshot.id, body.snapshot.id);
  }
  const {data, stats} = await reviewState(app);
  assert.deepEqual(data.articles.map(row => row.id), [draft.id]);
  assert.deepEqual(data.snapshots.map(row => row.id), [body.snapshot.id]);
  assert.equal(stats.count, 1);
});

test('the same topic and sample cannot override different substantive passages', async t => {
  const app = await setup(t);
  const draft = await savedDraft(app, {match_evidence: evidence});
  const body = publicationBody({...sample, title: draft.title, match_evidence: {...evidence, body: [
    '陈小青带队走访停产矿区后提交了志愿服务报告，重点记录老职工退休后的文化活动。',
    '图书室搬进由运输车库改造的新楼，周末借阅的第一批读者来自旁边的三所乡村小学。',
    '新的储物柜由附近造纸厂捐赠，旧柜则转给食堂继续使用。',
  ].join('\n\n')}});
  const result = await app.review('publications', {method: 'POST', body});
  assert.equal(result.status, 201, JSON.stringify(result));
  assert.equal(result.data.publish_status, 'unmatched');
  assert.notEqual(result.data.id, draft.id);
  const {data, stats} = await reviewState(app);
  assert.deepEqual(data.articles.map(row => row.publish_status).sort(), ['pending', 'unmatched']);
  assert.equal(stats.count, 0);
  assert.equal(stats.unmatchedCount, 1);
});

const applyReconciliation = (app, body, auth = true) => app.review('publications/reconcile', {method: 'POST', body, auth});
const article = (app, id) => app.review(`articles/${id}`);
const patchArticle = (app, row, changes) => app.review(`articles/${row.id}`, {
  method: 'PATCH', body: {expected_hash: row.content_hash, ...changes},
});

test('backfilled evidence can reconcile an existing unmatched row without losing either UUID or newer snapshots', async t => {
  const app = await setup(t);
  const draft = await savedDraft(app);
  const history = [snapshotBody(), snapshotBody({snapshot_date: '2026-10-13', reads: 1490, ctr: 11, age_hours: 48})];
  const publication = publicationBody({match_evidence: evidence, snapshot: history[0]});
  const initial = await app.review('publications', {method: 'POST', body: publication});
  assert.equal(initial.status, 201, JSON.stringify(initial));
  assert.equal(initial.data.publish_status, 'unmatched');
  const unmatched = initial.data;
  const createdLater = await app.review(`snapshots/${history[1].id}`, {method: 'PUT', body: {
    ...Object.fromEntries(Object.entries(history[1]).filter(([key]) => key !== 'id')), article_id: unmatched.id,
  }});
  assert.equal(createdLater.status, 201, JSON.stringify(createdLater));
  const backfilled = await app.review('drafts', {method: 'POST', body: draftBody({id: draft.id, match_evidence: evidence})});
  assert.equal(backfilled.status, 200, JSON.stringify(backfilled));
  assert.equal(backfilled.data.publish_status, 'pending');
  const before = await reviewState(app);
  assert.equal(before.stats.count, 0);
  assert.equal(before.stats.unmatchedCount, 1);
  const request = {article_id: unmatched.id, expected_hash: unmatched.content_hash, draft_id: draft.id};
  const preview = await applyReconciliation(app, request);
  assert.equal(preview.status, 200, JSON.stringify(preview));
  assert.deepEqual(await reviewState(app), before);

  const results = await Promise.all([applyReconciliation(app, {...request, apply: true}),
    applyReconciliation(app, {...request, apply: true})]);
  for (const result of results) assert.equal(result.status, 200, JSON.stringify(result));
  const resynced = await app.review('publications', {method: 'POST', body: publication});
  assert.equal(resynced.status, 200, JSON.stringify(resynced));
  assert.equal(resynced.data.id, draft.id);
  assert.equal(resynced.data.snapshot.id, history[0].id);
  const canonical = (await article(app, draft.id)).data;
  const alias = (await article(app, unmatched.id)).data;
  assert.equal(canonical.id, draft.id);
  assert.equal(alias.id, draft.id);
  assert.equal(canonical.original_draft_title, draft.title);
  assert.equal(canonical.title, publication.title);
  assert.equal(canonical.publish_status, 'published');
  assert.equal(canonical.sample_url, sample.sample_url);
  assert.equal(canonical.published_at, unmatched.published_at);
  const after = await reviewState(app);
  const historyFields = ({id, snapshot_date, reads, ctr, age_hours, source}) => ({id, snapshot_date, reads, ctr, age_hours, source});
  assert.deepEqual(after.data.articles.map(row => row.id), [draft.id]);
  assert.deepEqual(canonical.snapshots.map(historyFields), history);
  assert.deepEqual(after.data.snapshots.map(historyFields).reverse(), history);
  assert.equal(after.stats.count, 1);
  assert.equal(after.stats.unmatchedCount, 0);
  assert.equal(after.stats.readsMedian, history[0].reads);
  const persisted = await app.db.prepare('SELECT id FROM matrix_review_articles WHERE user_id=? ORDER BY id').bind(app.owner).all();
  assert.deepEqual(persisted.results.map(row => row.id), [draft.id, unmatched.id].sort());
});

test('in-place repair of a single unmatched record needs current hash, exact external ID and owner session', async t => {
  const app = await setup(t);
  await savedDraft(app, {platform_article_id: '9876543210123456799', title: '其他合成待发布'});
  const snapshot = snapshotBody({reads: 1430, ctr: 15});
  const publication = publicationBody({snapshot});
  const inserted = await app.review('publications', {method: 'POST', body: publication});
  assert.equal(inserted.status, 201, JSON.stringify(inserted));
  assert.equal(inserted.data.publish_status, 'unmatched');
  const edited = await patchArticle(app, inserted.data, {...sample, image_count: 4});
  assert.equal(edited.status, 200, JSON.stringify(edited));
  const draft = {sample_url: sample.sample_url, platform_article_id: publication.platform_article_id, title: '外部核对过的原稿标题'};
  const request = {article_id: inserted.data.id, expected_hash: edited.data.content_hash, draft};
  const stale = await applyReconciliation(app, {...request, expected_hash: inserted.data.content_hash, apply: true});
  assert.equal(stale.status, 409, JSON.stringify(stale));
  const otherId = await applyReconciliation(app, {...request, draft: {...draft, platform_article_id: draftPlatformId}, apply: true});
  assert.ok([400, 409].includes(otherId.status), JSON.stringify(otherId));
  const anonymous = await applyReconciliation(app, {...request, apply: true}, false);
  assert.ok([401, 403].includes(anonymous.status), JSON.stringify(anonymous));
  const before = (await article(app, inserted.data.id)).data;
  assert.equal(before.publish_status, 'unmatched');
  const dryRun = await applyReconciliation(app, request);
  assert.equal(dryRun.status, 200, JSON.stringify(dryRun));
  assert.deepEqual((await article(app, inserted.data.id)).data, before);
  const applied = await applyReconciliation(app, {...request, apply: true});
  assert.equal(applied.status, 200, JSON.stringify(applied));
  const target = (await article(app, inserted.data.id)).data;
  assert.equal(target.id, inserted.data.id);
  assert.equal(target.publish_status, 'published');
  assert.equal(target.original_draft_title, draft.title);
  for (const field of ['title', 'url', 'published_at', 'platform_article_id', 'sample_url', 'sample_title', 'image_count', 'snapshots']) {
    assert.deepEqual(target[field], before[field], field);
  }
  const {stats} = await reviewState(app);
  assert.equal(stats.count, 1);
  assert.equal(stats.unmatchedCount, 0);
});

test('two different same-day snapshots stop an association without changing either history', async t => {
  const app = await setup(t);
  const draft = await savedDraft(app);
  const snapshot = snapshotBody();
  const publication = publicationBody({match_evidence: evidence, snapshot});
  const unmatched = await app.review('publications', {method: 'POST', body: publication});
  assert.equal(unmatched.status, 201, JSON.stringify(unmatched));
  assert.equal(unmatched.data.publish_status, 'unmatched');
  const draftSnapshotId = randomUUID();
  const draftSnapshot = await app.review(`snapshots/${draftSnapshotId}`, {method: 'PUT', body: {
    article_id: draft.id, snapshot_date: snapshot.snapshot_date, reads: 711, ctr: 12,
  }});
  assert.equal(draftSnapshot.status, 201, JSON.stringify(draftSnapshot));
  const backfilled = await app.review('drafts', {method: 'POST', body: draftBody({id: draft.id, match_evidence: evidence})});
  assert.equal(backfilled.status, 200, JSON.stringify(backfilled));
  const before = await reviewState(app);
  const result = await applyReconciliation(app, {
    article_id: unmatched.data.id, expected_hash: unmatched.data.content_hash, draft_id: draft.id, apply: true,
  });
  assert.equal(result.status, 409, JSON.stringify(result));
  assert.equal(result.error.code, 'REVIEW_SNAPSHOT_CONFLICT');
  assert.deepEqual(await reviewState(app), before);
});

test('oversized or malformed match evidence is rejected before any review write', async t => {
  const app = await setup(t);
  const before = await reviewState(app);
  const excessiveSources = Array.from({length: 17}, (_, index) => `https://example.org/research/${index}`);
  const invalidEvidence = [{body: '长'.repeat(16_001)}, {source_urls: excessiveSources},
    {source_urls: ['mailto:someone@example.org']}, {cover_fingerprint: 'the-file-name.jpg'}, {unknown: true}];
  for (const match_evidence of invalidEvidence) {
    const response = await app.review('drafts', {method: 'POST', body: draftBody({match_evidence})});
    assert.equal(response.status, 400, JSON.stringify(response));
    assert.equal(response.error.code, 'VALIDATION_ERROR');
  }
  assert.deepEqual(await reviewState(app), before);
});

test('multiple credible drafts stay pending and a repeated publication remains one unmatched record', async t => {
  const app = await setup(t);
  const first = await savedDraft(app, {match_evidence: evidence});
  const second = await savedDraft(app, {
    platform_article_id: '9876543210123456703', title: '第三个合成标题', match_evidence: evidence,
  });
  const body = publicationBody({title: first.title, match_evidence: evidence, snapshot: snapshotBody()});
  const initial = await app.review('publications', {method: 'POST', body});
  assert.equal(initial.status, 201, JSON.stringify(initial));
  assert.equal(initial.data.publish_status, 'unmatched');
  const replay = await app.review('publications', {method: 'POST', body});
  assert.equal(replay.status, 200, JSON.stringify(replay));
  assert.equal(replay.data.id, initial.data.id);
  assert.equal(replay.data.publish_status, 'unmatched');
  const {data, stats} = await reviewState(app);
  assert.deepEqual(data.articles.filter(row => row.publish_status === 'pending').map(row => row.id).sort(),
    [first.id, second.id].sort());
  assert.deepEqual(data.articles.filter(row => row.publish_status === 'unmatched').map(row => row.id), [initial.data.id]);
  assert.equal(data.snapshots.length, 1);
  assert.equal(stats.count, 0);
  assert.equal(stats.unmatchedCount, 1);
});
