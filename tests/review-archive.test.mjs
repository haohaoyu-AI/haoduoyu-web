import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {archiveFixture} from './review-archive-fixture.mjs';

const archive = 'review/archive';
const itemPath = id => `${archive}/items/${id}`;
const make = (app, body) => app.request(`${archive}/items`, {method: 'POST', body});
const detail = (app, id, options) => app.request(itemPath(id), options);
const patch = (app, item, changes, extra = {}) => app.request(itemPath(item.id), {
  method: 'PATCH', body: {expected_version: item.version, changes, ...extra},
});
const act = (app, item, path, body) => app.request(`${itemPath(item.id)}/${path}`, {
  method: 'POST', body: {expected_version: item.version, ...body},
});
const snapshot = (app, id, body) => app.request(`${itemPath(id)}/snapshots`, {method: 'POST', body});

function ok(result) {
  assert.ok([200, 201].includes(result.status), JSON.stringify(result));
  return result.data;
}

const publishedAt = '2026-11-10T01:00:00.000Z';
const draftA = '9990012345678910001';
const draftB = '9990012345678910002';
const privateBody = '仅合成档案正文标记 STATIC_PRIVATE_ANNOTATION_A';
const assetUrl = 'https://example.org/private/cover-fixture.png';

test('archive keeps independent lifecycles and content types, shows undated drafts, and separates private details', async t => {
  const app = await archiveFixture(t);
  const unfinished = ok(await make(app, {kind: 'article', production_status: 'unfinished', publication_status: 'unpublished',
    original_title: '仍在制作的合成稿', original_body: privateBody, images: {total: 1, real: 1, ai: 0,
      assets: [{url: assetUrl, kind: 'real'}]}, field_states: {sample_url: 'none', sample_published_at: 'unverified',
      published_body: 'not_applicable', alternate_titles: 'not_filled'}}));
  const knownDraft = ok(await make(app, {kind: 'article', production_status: 'complete', publication_status: 'pending',
    original_title: '有入箱时间的合成稿', draft_saved_at: '2026-11-10T13:30:00+08:00'}));
  const noDateDraft = ok(await make(app, {kind: 'article', production_status: 'complete', publication_status: 'pending',
    original_title: '没有入箱时间的合成稿'}));
  const scheduled = ok(await make(app, {kind: 'article', production_status: 'complete', publication_status: 'scheduled',
    original_title: '待定时合成稿', scheduled_at: '2026-11-10T18:50:00+08:00'}));
  const unlinked = ok(await make(app, {kind: 'article', production_status: 'complete', publication_status: 'published',
    association_status: 'pending', original_title: '保留的原稿标题', published_title: '最终发布标题', published_at: publishedAt,
    sample_url: 'https://example.org/source/unconfirmed-sample'}));
  const deleted = ok(await make(app, {kind: 'article', publication_status: 'deleted', published_title: '已删除但保留的历史文章',
    published_at: '2026-11-08T01:00:00Z', deleted_at: '2026-11-10T01:00:00Z'}));
  const micro = ok(await make(app, {kind: 'micro', publication_status: 'published', published_title: '独立发布的微头条',
    published_at: publishedAt}));

  const list = ok(await app.request(`${archive}/items`));
  assert.equal(list.items.length, 7);
  assert.doesNotMatch(JSON.stringify(list), /STATIC_PRIVATE_ANNOTATION_A|cover-fixture\.png/);
  const queriedDrafts = ok(await app.request(`${archive}/items?publication_status=pending`));
  assert.deepEqual(queriedDrafts.items.map(item => item.id), [knownDraft.id, noDateDraft.id]);
  const readUnknown = ok(await detail(app, noDateDraft.id));
  assert.equal(readUnknown.draft_saved_at, null);
  assert.equal(readUnknown.published_at, null);
  const byDraftDate = ok(await app.request(`${archive}/items?publication_status=pending&from=2026-11-10&to=2026-11-10`));
  assert.deepEqual(byDraftDate.items.map(item => item.id), [knownDraft.id, noDateDraft.id]);
  assert.equal(ok(await detail(app, scheduled.id)).published_at, null);
  assert.equal(ok(await detail(app, scheduled.id)).scheduled_at, '2026-11-10T10:50:00.000Z');
  const microList = ok(await app.request(`${archive}/items?kind=micro`));
  assert.deepEqual(microList.items.map(item => item.id), [micro.id]);
  const rich = ok(await detail(app, unfinished.id));
  assert.equal(rich.original_body, privateBody);
  assert.equal(rich.images.assets[0].url, assetUrl);
  assert.equal(rich.images.ai, 0);
  assert.deepEqual(rich.field_states, {sample_url: 'none', sample_published_at: 'unverified',
    published_body: 'not_applicable', alternate_titles: 'not_filled'});
  assert.ok([401, 403].includes((await detail(app, unfinished.id, {auth: false})).status));
  const restoredTitles = ok(await detail(app, unlinked.id));
  assert.equal(restoredTitles.original_title, '保留的原稿标题');
  assert.equal(restoredTitles.published_title, '最终发布标题');
  assert.equal(restoredTitles.association_status, 'pending');
  assert.equal(ok(await detail(app, deleted.id)).publication_status, 'deleted');
  const overview = ok(await app.request(`${archive}/overview`));
  assert.equal(overview.counts.published, 3);
  assert.equal(overview.counts.micro, 1);
  assert.equal(overview.counts.pending, 2);
  assert.deepEqual(overview.attribution, {eligible: 0, excluded: 3});
  const completeness = ok(await app.request(`${archive}/completeness`));
  const sampleLinks = completeness.fields.find(field => field.field === 'sample_url');
  assert.equal(sampleLinks.states.none, 1);
  assert.ok(sampleLinks.items.some(item => item.id === unfinished.id && item.state === 'none'));
  const sampleDates = completeness.fields.find(field => field.field === 'sample_published_at');
  assert.ok(sampleDates.items.some(item => item.id === unfinished.id && item.state === 'unverified'));
  assert.ok(completeness.unsupported.includes('automatic_platform_collection'));
  ok(await act(app, restoredTitles, 'association', {status: 'matched', reason: '验核合成样本对应原稿'}));
  const associated = ok(await app.request(`${archive}/overview`));
  assert.equal(associated.counts.published, overview.counts.published);
  assert.deepEqual(associated.attribution, {eligible: 1, excluded: 2});
});

test('snapshot history appends multiple observations on one day and protects both zeros and unknowns', async t => {
  const app = await archiveFixture(t);
  const published = ok(await make(app, {kind: 'article', publication_status: 'published', association_status: 'pending',
    original_title: '已发布仍待关联', published_title: '合成发布标题', published_at: publishedAt}));
  const first = {id: randomUUID(), source: 'synthetic-history', source_key: 'reading-one', observed_at: '2026-11-10T08:12:00+08:00',
    metrics: {reads: 0, impressions: null, ctr: 0}};
  const second = {...first, id: randomUUID(), source_key: 'reading-two', observed_at: '2026-11-10T15:00:00+08:00',
    metrics: {reads: 340, impressions: 1900, ctr: 17, likes: 4, works_share_count: 2}};
  const validFirst = {...first, observed_at: '2026-11-10T11:12:00+08:00'};
  const baseline = await app.revision();
  const beforePublication = await snapshot(app, published.id, first);
  assert.equal(beforePublication.status, 400, JSON.stringify(beforePublication));
  assert.equal(await app.revision(), baseline);
  ok(await snapshot(app, published.id, validFirst));
  ok(await snapshot(app, published.id, second));
  const after = await app.revision();
  const identicalReplay = await snapshot(app, published.id, validFirst);
  assert.equal(identicalReplay.status, 200, JSON.stringify(identicalReplay));
  assert.equal(await app.revision(), after);
  const conflictingReplay = await snapshot(app, published.id, {...second, metrics: {...second.metrics, reads: 333}});
  assert.equal(conflictingReplay.status, 409, JSON.stringify(conflictingReplay));
  const fakeTime = await snapshot(app, published.id, {...second, id: randomUUID(), source_key: 'date-only', observed_at: '2026-11-10'});
  assert.equal(fakeTime.status, 400, JSON.stringify(fakeTime));
  const raw = (await app.db.prepare(`SELECT id,observed_at,metrics_json FROM matrix_review_archive_snapshots
    WHERE user_id=? AND item_id=? ORDER BY observed_at`).bind(app.owner, published.id).all()).results;
  assert.deepEqual(raw.map(entry => [entry.id, entry.observed_at, JSON.parse(entry.metrics_json)]), [
    [first.id, '2026-11-10T03:12:00.000Z', first.metrics], [second.id, '2026-11-10T07:00:00.000Z', second.metrics],
  ]);
  const publishedReadback = ok(await detail(app, published.id));
  assert.equal(publishedReadback.association_status, 'pending');
  assert.deepEqual(publishedReadback.snapshots.map(entry => entry.id).sort(), [first.id, second.id].sort());
  const overview = ok(await app.request(`${archive}/overview`));
  assert.deepEqual(overview.metrics.reads, {value: 340, known: 1, unknown: 0});
  assert.deepEqual(overview.attribution, {eligible: 0, excluded: 1});
  const saved = ok(await patch(app, publishedReadback, {publication_status: 'deleted', deleted_at: '2026-11-12T02:00:00Z'}));
  assert.equal(saved.publication_status, 'deleted');
  const archiveReadback = ok(await detail(app, published.id));
  assert.deepEqual(archiveReadback.snapshots, publishedReadback.snapshots);
  assert.equal(ok(await app.request(`${archive}/overview`)).counts.published, 1);
});

test('duplicate references, version checks and in-place association corrections retain an audit trail', async t => {
  const app = await archiveFixture(t);
  const created = ok(await make(app, {kind: 'article', publication_status: 'pending', original_title: '同一原稿的多个草稿编号'}));
  ok(await act(app, created, 'references', {ref: {kind: 'draft', platform_id: draftA, role: 'primary', title: '主要草稿'}}));
  const withPrimary = ok(await detail(app, created.id));
  assert.equal(withPrimary.refs.find(ref => ref.platform_id === draftA).role, 'primary');
  const stale = await act(app, created, 'references', {ref: {kind: 'draft', platform_id: draftB, role: 'duplicate'}});
  assert.equal(stale.status, 409, JSON.stringify(stale));
  ok(await act(app, withPrimary, 'references', {ref: {kind: 'draft', platform_id: draftB, role: 'duplicate', title: '重复草稿'}}));
  const withDuplicates = ok(await detail(app, created.id));
  assert.deepEqual(withDuplicates.refs.map(ref => [ref.platform_id, ref.role]).sort(), [[draftA, 'primary'], [draftB, 'duplicate']]);
  const other = ok(await make(app, {kind: 'micro', original_title: '独立微头条草稿', publication_status: 'pending'}));
  const duplicateIdentity = await act(app, other, 'references', {ref: {kind: 'draft', platform_id: draftA, role: 'primary'}});
  assert.equal(duplicateIdentity.status, 409, JSON.stringify(duplicateIdentity));
  const nextPrimary = withDuplicates.refs.find(ref => ref.platform_id === draftB);
  ok(await act(app, withDuplicates, 'references', {ref: {id: nextPrimary.id, kind: 'draft', platform_id: draftB,
    role: 'primary', title: nextPrimary.title}, reason: '合成主要版本更正'}));
  const reassigned = ok(await detail(app, created.id));
  assert.deepEqual(reassigned.refs.map(ref => [ref.platform_id, ref.role]).sort(), [[draftA, 'duplicate'], [draftB, 'primary']]);
  ok(await act(app, reassigned, 'association', {status: 'matched', reason: '合成证据人工核对'}));
  const matched = ok(await detail(app, created.id));
  assert.equal(matched.association_status, 'matched');
  ok(await act(app, matched, 'association', {status: 'pending', reason: '合成关联纠错'}));
  const corrected = ok(await detail(app, created.id));
  assert.equal(corrected.association_status, 'pending');
  assert.deepEqual(corrected.refs, reassigned.refs);
  assert.equal(corrected.publication_status, 'pending');
  const events = (await app.db.prepare(`SELECT version,action,details_json FROM matrix_review_archive_events
    WHERE user_id=? AND entity_id=? ORDER BY version`).bind(app.owner, created.id).all()).results;
  assert.ok(events.some(event => event.details_json.includes('合成证据人工核对')));
  assert.ok(events.some(event => event.details_json.includes('合成关联纠错')));
});

test('confirmed merge groups two archive rows without deleting either history and can be corrected in place', async t => {
  const app = await archiveFixture(t);
  const originals = [];
  for (const title of ['选定主要标题', '需要合并的重复标题']) {
    originals.push(ok(await make(app, {kind: 'article', publication_status: 'published', published_title: title, published_at: publishedAt})));
  }
  const [primary, duplicate] = originals;
  const readings = originals.map(({id}, index) => ({id: randomUUID(), source: 'synthetic-merge-history', source_key: id,
    observed_at: `2026-11-${11 + index}T01:00:00Z`, metrics: {reads: 110 + index, ctr: 7 + index}}));
  for (const [index, item] of originals.entries()) ok(await snapshot(app, item.id, readings[index]));
  const [currentPrimary, currentDuplicate] = await Promise.all(originals.map(async ({id}) => ok(await detail(app, id))));
  assert.equal(ok(await app.request(`${archive}/overview`)).counts.published, 2);
  ok(await act(app, currentPrimary, 'merge', {other_id: duplicate.id, other_version: currentDuplicate.version,
    action: 'merge', reason: '两份合成记录对应同一主要版本'}));
  const combined = ok(await detail(app, primary.id));
  assert.equal(combined.published_title, primary.published_title);
  assert.deepEqual(combined.snapshots.map(item => item.id).sort(), readings.map(item => item.id).sort());
  assert.equal(ok(await app.request(`${archive}/overview`)).counts.published, 1);
  const grouped = (await app.db.prepare('SELECT id,merged_into,version FROM matrix_review_archive_items WHERE user_id=? ORDER BY id')
    .bind(app.owner).all()).results;
  assert.deepEqual(grouped.map(item => item.id), originals.map(item => item.id).sort());
  const alias = grouped.find(item => item.id === duplicate.id);
  assert.equal(alias.merged_into, primary.id);
  ok(await act(app, combined, 'merge', {other_id: duplicate.id, other_version: alias.version,
    action: 'unmerge', reason: '确认两篇为独立的合成记录'}));
  const updated = await Promise.all(originals.map(async ({id}) => ok(await detail(app, id))));
  assert.deepEqual(updated.map(item => item.snapshots.map(snap => snap.id)), readings.map(item => [item.id]));
  assert.deepEqual(updated.map(item => item.published_title), originals.map(item => item.published_title));
  assert.equal(ok(await app.request(`${archive}/overview`)).counts.published, 2);
});

test('manual references and merges preserve independent publication identities', async t => {
  const app = await archiveFixture(t);
  const unverified=await make(app,{kind:'article',association_status:'matched',original_title:'没有关联证据'});
  assert.equal(unverified.status,400,JSON.stringify(unverified));
  const original = ok(await make(app, {kind:'article',publication_status:'pending',original_title:'原稿编号待核'}));
  const first = ok(await make(app, {kind:'article',publication_status:'published',published_at:publishedAt,published_title:'已发布甲'}));
  const second = ok(await make(app, {kind:'article',publication_status:'published',published_at:publishedAt,published_title:'已发布乙'}));
  ok(await act(app,original,'references',{ref:{kind:'draft',platform_id:draftA}}));
  const duplicate = await act(app,first,'references',{ref:{kind:'publication',platform_id:draftA}});
  assert.equal(duplicate.status,409,JSON.stringify(duplicate));
  ok(await act(app,first,'references',{ref:{kind:'publication',platform_id:'9990012345678910003'}}));
  ok(await act(app,second,'references',{ref:{kind:'publication',platform_id:'9990012345678910004'}}));
  const currentFirst = ok(await detail(app,first.id));
  const currentSecond = ok(await detail(app,second.id));
  const revision = await app.revision();
  const conflict = await act(app,currentFirst,'merge',{other_id:second.id,other_version:currentSecond.version,
    action:'merge',reason:'合成例验证需先核对'});
  assert.equal(conflict.status,409,JSON.stringify(conflict));
  assert.equal(await app.revision(),revision);
  assert.equal(ok(await app.request(`${archive}/overview`)).counts.published,2);
  const currentOriginal = ok(await detail(app,original.id));
  ok(await act(app,currentOriginal,'merge',{other_id:first.id,other_version:currentFirst.version,
    action:'merge',reason:'合成例确认两个版本属于一篇'}));
  assert.equal(ok(await detail(app,original.id)).publication_status,'pending');
  assert.equal(ok(await app.request(`${archive}/overview`)).counts.published,2);
});

test('adopting a V字 legacy record preserves date-only source history and leaves other accounts outside the archive', async t => {
  const app = await archiveFixture(t);
  const legacyId = randomUUID();
  const anotherAccount = randomUUID();
  const snapshotId = randomUUID();
  const benchmarkAccount = randomUUID();
  const sampleId = randomUUID();
  const sampleUrl = 'https://example.org/source/legacy-sample';
  ok(await app.request(`review/benchmark-accounts/${benchmarkAccount}`, {method: 'PUT',
    body: {account: 'V字', platform: 'toutiao', name: '合成对标账号'}}));
  ok(await app.request(`review/benchmark-articles/${sampleId}`, {method: 'PUT', body: {
    benchmark_account_id: benchmarkAccount, title: '合成对标文章', published_at: '2026-11-07', url: sampleUrl,
  }}));
  const legacyFields = {title: '既有合成发布记录', platform_article_id: '9990012345678990001',
    publish_status: 'unmatched', published_at: '2026-11-08'};
  ok(await app.request(`review/articles/${legacyId}`, {method: 'PUT', body: {...legacyFields, account: 'V字',
    reference_article_id: sampleId, sample_title: '合成对标文章', sample_url: sampleUrl}}));
  ok(await app.request(`review/articles/${anotherAccount}`, {method: 'PUT', body: {...legacyFields, account: 'Z极客'}}));
  ok(await app.request(`review/snapshots/${snapshotId}`, {method: 'PUT', body: {article_id: legacyId,
    snapshot_date: '2026-11-09', reads: 502, impressions: null, ctr: 12, source: 'toutiao_excel'}}));
  const oldList = ok(await app.request(`${archive}/legacy`));
  assert.deepEqual(oldList.items.map(row => row.legacy_id), [legacyId]);
  const prior = oldList.items[0];
  assert.equal(prior.kind, null);
  assert.equal(prior.publication_status, 'published');
  assert.equal(prior.association_status, 'pending');
  assert.equal(prior.published_at, '2026-11-08');
  assert.equal(prior.sample_reference_id, sampleId);
  const outOfScope = await make(app, {kind: 'article', legacy_id: anotherAccount});
  assert.equal(outOfScope.status, 404, JSON.stringify(outOfScope));
  const linked = ok(await make(app, {kind: 'article', legacy_id: legacyId, publication_status: 'published',
    association_status: 'pending', published_title: prior.published_title, published_at: prior.published_at,
    sample_reference_id: prior.sample_reference_id, sample_title: prior.sample_title, sample_url: prior.sample_url}));
  const adopted = ok(await detail(app, linked.id));
  assert.equal(adopted.sample.id, sampleId);
  assert.equal(adopted.sample.url, sampleUrl);
  assert.equal(adopted.sample.published_at, '2026-11-07');
  assert.equal(adopted.snapshots.length, 1);
  const [observed] = adopted.snapshots;
  assert.equal(observed.id, snapshotId);
  assert.equal(observed.observed_at, null);
  assert.equal(observed.observed_date, '2026-11-09');
  assert.equal(observed.metrics.reads, 502);
  assert.equal(observed.metrics.impressions, null);
  assert.equal(observed.legacy_source, 'toutiao_excel');
  const oldDetail = ok(await app.request(`review/articles/${legacyId}`));
  assert.equal(oldDetail.publish_status, 'unmatched');
  const [legacySnapshot] = oldDetail.snapshots;
  assert.equal(legacySnapshot.id, snapshotId);
  const oldSnapshotPath = `review/snapshots/${snapshotId}`;
  const revisionBefore = await app.revision();
  const guarded = await Promise.all([
    app.request(oldSnapshotPath, {method: 'PATCH', body: {expected_hash: legacySnapshot.content_hash, reads: 35}}),
    app.request(oldSnapshotPath, {method: 'DELETE', body: {expected_hash: legacySnapshot.content_hash, save_id: randomUUID()}}),
    app.request(`review/articles/${legacyId}`, {method: 'DELETE', body: {expected_hash: oldDetail.content_hash,
      save_id: randomUUID(), cascade_snapshots: true}}),
  ]);
  for (const response of guarded) assert.equal(response.status, 409, JSON.stringify(response));
  assert.equal(await app.revision(), revisionBefore);
  assert.deepEqual(ok(await detail(app, linked.id)).snapshots, adopted.snapshots);
});
