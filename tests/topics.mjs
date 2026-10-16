import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { DatabaseSync } from 'node:sqlite';

function compile(file, stubs = {}, globals = {}) {
  const source = fs.readFileSync(file, 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(javascript, {
    exports,
    require: (name) => {
      if (Object.hasOwn(stubs, name)) return stubs[name];
      throw new Error(`Unexpected module in test: ${name}`);
    },
    Response, Request, URL, TextEncoder, TextDecoder, AbortSignal, Intl, Date, console, fetch,
    ...globals,
  }, { filename: file });
  return exports;
}
function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

const radarModule = compile('lib/topic-radar.ts');
const { TopicRadarService, buildTopicCandidates, classifyTopic, normalizeTopic } = radarModule;

// Public endpoints remain a fixed allowlist; a request cannot inject an origin,
// credentials, cookies, or a redirect destination.
let wallClock = Date.parse('2026-10-05T00:00:00.000Z');
const outbound = [];
const hotListService = new TopicRadarService(async (url, init) => {
  outbound.push({ url, init });
  assert.equal(new URL(url).protocol, 'https:');
  assert.equal(init.redirect, 'manual');
  assert.equal(init.headers.Accept, 'application/json');
  assert.equal('Cookie' in init.headers, false);
  assert.equal('Authorization' in init.headers, false);
  if (url === 'https://v2.xxapi.cn/api/weibohot') {
    return jsonResponse({
      data: [{ title: '#《星河新剧》今晚开播#', hot: '8.2万', index: 1, url: 'https://weibo.com/topic/1' }],
      timestamp: wallClock,
    });
  }
  if (url === 'https://v2.xxapi.cn/api/douyinhot') {
    return jsonResponse({ data: [{ word: '《星河新剧》今晚开播', hot_value: 792, position: 1, link: 'https://tracker.example/redirect' }] });
  }
  throw new Error('unexpected source');
}, () => wallClock);

const [weibo, douyin] = await Promise.all([
  hotListService.load(false, 'weibo'),
  hotListService.load(false, 'douyin'),
]);
assert.equal(weibo[0].status, 'ok');
assert.equal(weibo[0].upstream_updated_at, null, 'generic response timestamps are not asserted as ranking freshness');
assert.equal(weibo[0].fetched_at, '2026-10-05T00:00:00.000Z');
assert.equal(weibo[0].items[0].metric, '8.2万');
assert.equal(weibo[0].items[0].rank, 1, 'ordered source position is used when rank is omitted');
assert.equal(normalizeTopic('#《星河新剧》今晚开播#'), '星河新剧今晚开播');
const merged = buildTopicCandidates([weibo[0], douyin[0]]);
assert.equal(merged.length, 1, 'only exact punctuation-normalized topic text merges across platforms');
assert.equal(merged[0].signals.length, 2);
assert.equal(merged[0].signals.find((signal) => signal.platform === 'weibo').url, 'https://weibo.com/topic/1');
assert.equal(merged[0].signals.find((signal) => signal.platform === 'douyin').url, null, 'off-platform URLs are not shown as original hot-topic links');
assert.equal(merged[0].research_state, 'needs_verification');
assert.equal(merged[0].angles.length, 1);
assert.equal(merged[0].angles[0].state, 'unverified_rule_candidate');
assert.match(merged[0].angles[0].question, /星河新剧/);
assert.equal(outbound.length, 2);

// Toutiao's official anonymous endpoint preserves its source order, fixed-top
// rows, heat values, and both article/trending URLs without inventing freshness.
const toutiaoRequests = [];
const toutiaoService = new TopicRadarService(async (url, init) => {
  toutiaoRequests.push({ url, init });
  return jsonResponse({ status: 'success', fixed_top_data: [{ Title: '置顶：电影上映', ClusterIdStr: 'fixed1', Label: '热', HotValue: '置顶', Url: 'https://www.toutiao.com/article/1/' }], data: [
    { Title: '热播剧定档', ClusterIdStr: 'cluster2', HotValue: 9876, Url: 'https://www.toutiao.com/trending/?topic=2' },
    { Title: '话题搜索入口', QueryWord: '话题搜索入口', Label: '新', HotValue: 4321, Url: 'https://www.toutiao.com/search/?keyword=test' },
  ], fixed_top_data: [{ Title: '置顶：电影上映', ClusterIdStr: 'fixed1', Label: '热', HotValue: '置顶', Url: 'https://www.toutiao.com/article/1/' }] });
}, () => wallClock);
const toutiaoBoard = (await toutiaoService.load(false, 'toutiao'))[0];
assert.equal(toutiaoBoard.status, 'ok');
assert.equal(toutiaoBoard.provider, 'toutiao.com');
assert.equal(toutiaoBoard.item_count, 3);
assert.equal(toutiaoBoard.source_count, 3);
assert.equal(toutiaoBoard.items[0].title, '置顶：电影上映');
assert.equal(toutiaoBoard.items[0].label, '置顶 · 热');
assert.equal(toutiaoBoard.items[0].rank, null, 'pinned rows are not assigned a synthetic heat rank');
assert.equal(toutiaoBoard.items[1].title, '热播剧定档');
assert.equal(toutiaoBoard.items[1].rank, 1, 'ordinary Toutiao ranks start at one despite pinned rows');
assert.equal(toutiaoBoard.items[1].metric, '9876');
assert.match(toutiaoBoard.items[1].url, /trending/);
assert.match(toutiaoBoard.items[2].url, /search/);
assert.equal(toutiaoBoard.items[2].label, '新');
assert.equal(toutiaoBoard.items[2].query_word, '话题搜索入口');
assert.equal(toutiaoBoard.upstream_updated_at, null);
assert.equal(toutiaoRequests.length, 1);
assert.equal(toutiaoRequests[0].url, 'https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc');
assert.equal(toutiaoRequests[0].init.headers.Authorization, undefined);
assert.equal(toutiaoRequests[0].init.headers.Cookie, undefined);
let toutiaoAuthCalls = 0;
const toutiaoAuthService = new TopicRadarService(async () => { toutiaoAuthCalls += 1; return new Response('<html>login</html>', { status: 200, headers: { 'content-type': 'text/html' } }); }, () => wallClock);
const toutiaoAuthBlocked = (await toutiaoAuthService.load(false, 'toutiao'))[0];
assert.equal(toutiaoAuthBlocked.status, 'error');
assert.equal(toutiaoAuthBlocked.provider_attempts[0].status, 'auth_required');
assert.equal(toutiaoAuthCalls, 1, 'a login page stops before any fallback is tried');
const toutiaoRedirectCalls = [];
const toutiaoSsoService = new TopicRadarService(async (url) => {
  toutiaoRedirectCalls.push(url);
  if (url.startsWith('https://www.toutiao.com/')) return new Response(null, { status: 302, headers: { location: 'https://sso.toutiao.com/login?token=private' } });
  return jsonResponse({ data: [{ title: 'fallback should not run' }] });
}, () => wallClock);
const toutiaoSsoBlocked = (await toutiaoSsoService.load(false, 'toutiao'))[0];
assert.equal(toutiaoSsoBlocked.status, 'error');
assert.equal(toutiaoSsoBlocked.provider_attempts[0].status, 'auth_required');
assert.equal(toutiaoSsoBlocked.provider_attempts[0].redirect_target, 'https://sso.toutiao.com/login');
assert.equal(JSON.stringify(toutiaoSsoBlocked).includes('token=private'), false);
assert.equal(toutiaoRedirectCalls.length, 1, 'an explicit SSO redirect stops without switching providers');
const longToutiaoService = new TopicRadarService(async () => jsonResponse({ status: 'success', data: Array.from({ length: 205 }, (_, index) => ({ Title: `榜单${index + 1}`, Url: 'https://www.toutiao.com/trending/' })) }), () => wallClock);
const longToutiao = (await longToutiaoService.load(false, 'toutiao'))[0];
assert.equal(longToutiao.source_count, 205);
assert.equal(longToutiao.returned_count, 200);
assert.equal(longToutiao.truncated, true);

const privateLife = classifyTopic('某演员恋情爆料被转发');
assert.ok(privateLife.classification.risk_terms.includes('恋情'));
assert.ok(privateLife.classification.risk_terms.includes('爆料'));
assert.ok(privateLife.categories.includes('明星活动'));
const genericAppearance = classifyTopic('中国代表团亚运闭幕式亮相');
assert.equal(genericAppearance.categories.length, 0, 'a generic appearance at a sports event is not enough to classify entertainment');
assert.equal(genericAppearance.classification.uncertain, true);
const clearDramaTerms = classifyTopic('刘美含买超点发现戏份都被剪');
assert.ok(clearDramaTerms.categories.includes('影视剧'), 'clear drama vocabulary remains a candidate');
assert.equal(clearDramaTerms.classification.uncertain, false);

// Parallel refreshes share one request; the 5-minute cache is public-only and
// provider timestamps never move forward when an old snapshot is reused.
let resolveSlow;
let slowCalls = 0;
const slowService = new TopicRadarService(() => {
  slowCalls += 1;
  return new Promise((resolve) => { resolveSlow = resolve; });
}, () => wallClock);
const pendingOne = slowService.load(false, 'weibo');
const pendingTwo = slowService.load(true, 'weibo');
assert.equal(slowCalls, 1);
resolveSlow(jsonResponse({ data: [{ title: '演员公开作品活动' }] }));
const [slowOne, slowTwo] = await Promise.all([pendingOne, pendingTwo]);
assert.equal(slowOne[0].fetched_at, slowTwo[0].fetched_at);
assert.equal(slowCalls, 1);
const cached = await slowService.load(false, 'weibo');
assert.equal(cached[0].cache_hit, true);
assert.equal(slowCalls, 1);

// Invalid primary shape falls back only to the fixed secondary endpoint.
const fallbackURLs = [];
const fallbackService = new TopicRadarService(async (url) => {
  fallbackURLs.push(url);
  if (url === 'https://v2.xxapi.cn/api/douyinhot') return jsonResponse({ error: 'no list' });
  if (url === 'https://60s.viki.moe/v2/douyin') return jsonResponse({ data: { list: [{ name: '公开演出预告', num: 50 }] } });
  throw new Error('unlisted origin');
}, () => wallClock);
const fallback = await fallbackService.load(false, 'douyin');
assert.equal(fallback[0].status, 'ok');
assert.equal(fallback[0].provider, '60s.viki.moe');
assert.equal(fallback[0].provider_attempts.length, 2);
assert.equal(fallback[0].provider_attempts[0].status, 'invalid_shape');
assert.equal(fallback[0].provider_attempts[0].http_status, 200);
assert.equal(fallback[0].provider_attempts[1].status, 'ok');
assert.deepEqual(fallbackURLs, ['https://v2.xxapi.cn/api/douyinhot', 'https://60s.viki.moe/v2/douyin']);

let blockedCalls = 0;
const blockedService = new TopicRadarService(async (_url, init) => {
  blockedCalls += 1;
  assert.equal(init.redirect, 'manual');
  return new Response('private upstream body', { status: 403 });
}, () => wallClock);
const blocked = (await blockedService.load(false, 'weibo'))[0];
assert.equal(blocked.status, 'error');
assert.equal(JSON.stringify(blocked.provider_attempts.map((attempt) => [attempt.provider, attempt.url, attempt.status, attempt.http_status])), JSON.stringify([
  ['xxapi.cn', 'https://v2.xxapi.cn/api/weibohot', 'http_error', 403],
]));
assert.equal(blockedCalls, 1, '403 blocks stop instead of trying another provider');
assert.equal(JSON.stringify(blocked).includes('private upstream body'), false, 'diagnostics never echo an upstream response body');
const timeoutService = new TopicRadarService(async () => { const error = new Error('do not expose'); error.name = 'TimeoutError'; throw error; }, () => wallClock);
const timed = (await timeoutService.load(false, 'zhihu'))[0];
assert.equal(timed.provider_attempts[0].status, 'timeout');
assert.equal(timed.provider_attempts[0].http_status, null);
const bodyTimeoutService = new TopicRadarService(async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"data":[')); } })), () => wallClock, 10);
const timeoutKeepAlive = setTimeout(() => undefined, 100);
const bodyTimed = (await bodyTimeoutService.load(false, 'zhihu'))[0];
clearTimeout(timeoutKeepAlive);
assert.equal(bodyTimed.status, 'error');
assert.equal(bodyTimed.provider_attempts[0].status, 'timeout', 'the single source deadline also covers a stalled response body');
const redirectModeService = new TopicRadarService(async () => { throw new Error('manual redirect mode unsupported'); }, () => wallClock);
assert.equal((await redirectModeService.load(false, 'zhihu'))[0].provider_attempts[0].status, 'redirect_mode_unsupported');
const invalidJsonService = new TopicRadarService(async () => new Response('<html>do not expose</html>', { status: 200 }), () => wallClock);
assert.equal((await invalidJsonService.load(false, 'zhihu'))[0].provider_attempts[0].status, 'invalid_json');
const invalidItemsService = new TopicRadarService(async () => jsonResponse({ data: [{ rank: 1 }] }), () => wallClock);
assert.equal((await invalidItemsService.load(false, 'zhihu'))[0].provider_attempts[0].status, 'invalid_items');

let sameHostRedirectCalls = [];
const safeRedirectService = new TopicRadarService(async (url, init) => {
  sameHostRedirectCalls.push(url);
  assert.equal(init.redirect, 'manual');
  if (url === 'https://v2.xxapi.cn/api/weibohot') return Response.redirect('https://v2.xxapi.cn/api/public-list?signature=do-not-show', 302);
  if (url === 'https://v2.xxapi.cn/api/public-list?signature=do-not-show') return jsonResponse({ data: [{ title: '公开电影上映', url: 'https://weibo.com/topic/ok' }] });
  throw new Error('unexpected target');
}, () => wallClock);
const safelyRedirected = (await safeRedirectService.load(false, 'weibo'))[0];
assert.equal(safelyRedirected.status, 'ok');
assert.equal(safelyRedirected.provider_attempts.length, 1);
assert.equal(safelyRedirected.provider_attempts[0].redirect_count, 1);
assert.equal(safelyRedirected.provider_attempts[0].redirect_target, 'https://v2.xxapi.cn/api/public-list');
assert.equal(JSON.stringify(safelyRedirected).includes('signature=do-not-show'), false, 'diagnostics omit redirect query strings');
assert.deepEqual(sameHostRedirectCalls, ['https://v2.xxapi.cn/api/weibohot', 'https://v2.xxapi.cn/api/public-list?signature=do-not-show']);

let offHostRedirectCalls = [];
const unsafeRedirectService = new TopicRadarService(async (url, init) => {
  offHostRedirectCalls.push(url);
  assert.equal(init.redirect, 'manual');
  return Response.redirect('https://external.example/path?token=do-not-show', 302);
}, () => wallClock);
const unsafeRedirect = (await unsafeRedirectService.load(false, 'weibo'))[0];
assert.equal(unsafeRedirect.status, 'error');
assert.equal(unsafeRedirect.provider_attempts[0].status, 'redirect_rejected');
assert.equal(unsafeRedirect.provider_attempts[0].http_status, 302);
assert.equal(unsafeRedirect.provider_attempts[0].redirect_target, 'https://external.example/path');
assert.equal(unsafeRedirect.provider_attempts[0].redirect_count, 0);
assert.equal(JSON.stringify(unsafeRedirect).includes('token=do-not-show'), false);
assert.equal(offHostRedirectCalls.length, 2, 'off-provider redirects are never fetched');
for (const location of [
  'http://60s.viki.moe/insecure',
  'https://60s.viki.moe:8443/nonstandard-port',
  'https://127.0.0.1/private',
]) {
  let redirects = 0;
  const rejectedTargetService = new TopicRadarService(async (_url, init) => {
    redirects += 1;
    assert.equal(init.redirect, 'manual');
    return Response.redirect(location, 302);
  }, () => wallClock);
  const rejectedTarget = (await rejectedTargetService.load(false, 'zhihu'))[0];
  assert.equal(rejectedTarget.provider_attempts[0].status, 'redirect_rejected');
  assert.equal(rejectedTarget.provider_attempts[0].http_status, 302);
  assert.equal(redirects, 1, 'non-HTTPS, nonstandard-port, and private-IP redirects are never followed');
}
const redirectLoopURLs = [];
const redirectLoopService = new TopicRadarService(async (url, init) => {
  redirectLoopURLs.push(url);
  assert.equal(init.redirect, 'manual');
  if (url === 'https://60s.viki.moe/v2/zhihu') return Response.redirect('https://60s.viki.moe/v2/redirect-one', 302);
  return Response.redirect('https://60s.viki.moe/v2/redirect-two', 302);
}, () => wallClock);
const redirectLoop = (await redirectLoopService.load(false, 'zhihu'))[0];
assert.equal(redirectLoop.provider_attempts[0].status, 'redirect_rejected');
assert.equal(redirectLoop.provider_attempts[0].http_status, 302);
assert.equal(redirectLoop.provider_attempts[0].redirect_count, 1);
assert.equal(redirectLoop.provider_attempts[0].redirect_target, 'https://60s.viki.moe/v2/redirect-two');
assert.equal(redirectLoopURLs.length, 2, 'a second same-host redirect is reported and not followed');

// Empty, invalid-shape, and failed-source states stay distinct. No stale cache
// is returned after 24 hours, and failures are throttled for 60 seconds.
const emptyService = new TopicRadarService(async () => jsonResponse({ data: [] }), () => wallClock);
assert.equal((await emptyService.load(false, 'zhihu'))[0].status, 'empty');
const invalidServiceCalls = [];
const invalidService = new TopicRadarService(async (url) => {
  invalidServiceCalls.push(url);
  return jsonResponse({ unexpected: true });
}, () => wallClock);
assert.equal((await invalidService.load(false, 'zhihu'))[0].status, 'error');
const callsAfterFirstError = invalidServiceCalls.length;
assert.equal((await invalidService.load(false, 'zhihu'))[0].status, 'error');
assert.equal(invalidServiceCalls.length, callsAfterFirstError, 'a reload within 60 seconds does not retry failed sources');
wallClock += 60_001;
await invalidService.load(false, 'zhihu');
assert.equal(invalidServiceCalls.length, callsAfterFirstError + 1, 'Zhihu has no secondary source');

let sourceState = 'success';
let staleCalls = 0;
const staleService = new TopicRadarService(async (url) => {
  staleCalls += 1;
  if (sourceState === 'fail') throw new Error('offline');
  if (url !== 'https://v2.xxapi.cn/api/weibohot') return jsonResponse({ unexpected: true });
  return jsonResponse({ data: [{ title: '热播剧新剧定档' }] });
}, () => wallClock);
const fresh = await staleService.load(false, 'weibo');
const originalFetchedAt = fresh[0].fetched_at;
wallClock += 60_001;
sourceState = 'fail';
const stale = await staleService.load(true, 'weibo');
assert.equal(stale[0].status, 'stale');
assert.equal(stale[0].fetched_at, originalFetchedAt);
const callCountAfterStale = staleCalls;
wallClock += 5_000;
const staleDuringCooldown = await staleService.load(true, 'weibo');
assert.equal(staleDuringCooldown[0].status, 'stale');
assert.equal(staleDuringCooldown[0].fetched_at, originalFetchedAt);
assert.equal(staleCalls, callCountAfterStale);
wallClock += 24 * 60 * 60 * 1000;
const tooOld = await staleService.load(true, 'weibo');
assert.equal(tooOld[0].status, 'error');
assert.equal(tooOld[0].items.length, 0);
assert.notEqual(tooOld[0].fetched_at, originalFetchedAt);

// D1 history reads are owner-scoped, capped at 50 articles, and distinguish
// active unselected runs from selected-but-unfinished current-day topics.
const sql = new DatabaseSync(':memory:');
for (const filename of fs.readdirSync('drizzle').filter((name) => name.endsWith('.sql')).sort()) {
  sql.exec(fs.readFileSync(`drizzle/${filename}`, 'utf8'));
}
const fakeD1 = {
  prepare: (statement) => ({
    bind: (...values) => ({
      all: async () => ({ results: sql.prepare(statement).all(...values) }),
    }),
  }),
};
const matcher = compile('lib/topic-history-match.ts');
const history = compile('lib/topics-history.ts', { './test-store': { db: () => fakeD1 }, './topic-history-match': matcher });
const shanghaiDay = history.beijingDay(new Date(wallClock));
const date = new Date(wallClock);
function addArticle(id, owner, title, created) {
  sql.prepare('INSERT INTO articles(id,owner,title,filename,source_key,paragraphs,created,state) VALUES(?,?,?,?,?,?,?,?)')
    .run(id, owner, title, `${id}.txt`, `articles/${id}/source`, '[]', created, 'word_ready');
}
function addRun({ id, owner, day = shanghaiDay, writer = 'xiaoyu', runKind = 'daily', state = 'ready', articleId, topic = null, created = date.toISOString() }) {
  sql.prepare('INSERT INTO writing_runs(id,owner,day,writer,run_kind,state,article_id,topic,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(id, owner, day, writer, runKind, state, articleId, topic, created, created);
}
for (let index = 0; index < 50; index += 1) {
  const id = `owner-a-${String(index).padStart(2, '0')}`;
  const created = new Date(wallClock - (index + 1) * 60 * 60 * 1000).toISOString();
  const title = index === 0 ? '《星河新剧》大结局后的关系变化' : `主人公文章 ${index}`;
  addArticle(id, 'owner-a', title, created);
  if (index === 0) addRun({ id: 'owner-a-run-0', owner: 'owner-a', writer: 'claude', runKind: 'workflow_test', articleId: id, topic: '《星河新剧》今晚开播' });
}
addArticle('owner-b-match', 'owner-b', '《星河新剧》又有新节点', date.toISOString());
addRun({ id: 'owner-a-current-topic', owner: 'owner-a', writer: 'claude', runKind: 'sample', state: 'writing', articleId: 'not-written-topic', topic: '《星河新剧》官宣定档调整' });
addRun({ id: 'owner-a-unselected', owner: 'owner-a', writer: 'xiaoyu', runKind: 'daily', state: 'writing', articleId: 'not-written-selected' });
const ownerHistory = await history.readRecentTopicHistory('owner-a', new Date(wallClock));
assert.equal(ownerHistory.count, 50);
assert.equal(ownerHistory.window_complete, false);
assert.equal(ownerHistory.unselected_current_runs, 1);
assert.equal(ownerHistory.unfinished_topic_runs, 1);
assert.equal(ownerHistory.entries.some((entry) => entry.article_id === 'owner-b-match'), false);
assert.equal(ownerHistory.entries.find((entry) => entry.article_id === 'owner-a-01').writer, 'uploaded');
const candidate = {
  id: 'topic', topic: '《星河新剧》官宣今晚开播', title: '《星河新剧》官宣今晚开播', categories: ['影视剧'],
  classification: { mode: 'keyword', matched_terms: ['新剧'], uncertain: false, risk_terms: [] },
  signals: [], history_matches: [], angles: [], research_state: 'needs_verification',
};
const matches = history.findTopicHistoryMatches(candidate, ownerHistory.entries);
assert.ok(matches.some((match) => match.article_id === 'owner-a-00' && match.reason.includes('作品名')));
assert.ok(matches.some((match) => match.article_id === 'not-written-topic' && match.source === 'current_run'));
const celebrityOnly = history.findTopicHistoryMatches({ ...candidate, topic: '王一博', title: '王一博' }, ownerHistory.entries);
assert.equal(celebrityOnly.length, 0, 'a person name alone does not create a history warning');

// The route always requires the trusted owner header, rejects arbitrary filter
// parameters, and marks private responses as uncacheable.
let routeCalls = [];
let holdDouyin = false;
let holdHistory = false;
let releaseDouyin;
let releaseHistory;
let slowBoardSettled = false;
let slowHistorySettled = false;
const fakeResearch = {
  getTopicResearch: async (ownerId, options) => { routeCalls.push({ ownerId, options }); return { version: 'haoduoyu-topics-1', items: [], platforms: [], history: {}, analysis: {} }; },
  getTopicBoard: async (platform, refresh) => { routeCalls.push({ platform, refresh }); if (holdDouyin && platform === 'douyin') await new Promise((resolve) => { releaseDouyin = resolve; }); if (platform === 'douyin') slowBoardSettled = true; return { version: 'haoduoyu-topic-board-1', platform: { platform }, rows: [], candidates: [] }; },
  getTopicHistory: async (ownerId) => { routeCalls.push({ ownerId, view: 'history' }); if (holdHistory) await new Promise((resolve) => { releaseHistory = resolve; }); if (holdHistory) slowHistorySettled = true; return { version: 'haoduoyu-topic-history-1', history: {}, entries: [] }; },
  isTopicBoardPlatform: (value) => ['weibo', 'douyin', 'zhihu', 'toutiao', 'xiaohongshu'].includes(value),
  isTopicPlatform: (value) => ['weibo', 'douyin', 'zhihu', 'toutiao'].includes(value),
};
const api = compile('app/api/topics/route.ts', {
  '../../../lib/topic-candidates': fakeResearch,
  '../../../lib/test-store': { owner: (request) => request.headers.get('oai-authenticated-user-id') },
});
const unauthenticated = await api.GET(new Request('https://site.test/api/topics'));
assert.equal(unauthenticated.status, 401);
assert.match(unauthenticated.headers.get('cache-control'), /private, no-store/);
const invalidFilter = await api.GET(new Request('https://site.test/api/topics?platform=https%3A%2F%2Fevil.test', {
  headers: { 'oai-authenticated-user-id': 'owner-a' },
}));
assert.equal(invalidFilter.status, 400);
assert.equal(routeCalls.length, 0);
const authorized = await api.GET(new Request('https://site.test/api/topics?platform=weibo&refresh=1', {
  headers: { 'oai-authenticated-user-id': 'owner-a' },
}));
assert.equal(authorized.status, 200);
assert.match(authorized.headers.get('cache-control'), /private, no-store/);
assert.equal(routeCalls[0].ownerId, 'owner-a');
assert.equal(JSON.stringify(routeCalls[0].options), JSON.stringify({ refresh: true, platform: 'weibo' }));
const independentBoard = await api.GET(new Request('https://site.test/api/topics?view=platform&platform=toutiao&refresh=1', { headers: { 'oai-authenticated-user-id': 'owner-a' } }));
assert.equal(independentBoard.status, 200);
assert.equal((await independentBoard.json()).version, 'haoduoyu-topic-board-1');
assert.deepEqual(routeCalls[1], { platform: 'toutiao', refresh: true });
const independentHistory = await api.GET(new Request('https://site.test/api/topics?view=history', { headers: { 'oai-authenticated-user-id': 'owner-a' } }));
assert.equal(independentHistory.status, 200);
assert.equal((await independentHistory.json()).version, 'haoduoyu-topic-history-1');
assert.deepEqual(routeCalls[2], { ownerId: 'owner-a', view: 'history' });
holdDouyin = true; holdHistory = true;
const slowBoardRequest = api.GET(new Request('https://site.test/api/topics?view=platform&platform=douyin', { headers: { 'oai-authenticated-user-id': 'owner-a' } }));
const slowHistoryRequest = api.GET(new Request('https://site.test/api/topics?view=history', { headers: { 'oai-authenticated-user-id': 'owner-a' } }));
const fastBoardRequest = api.GET(new Request('https://site.test/api/topics?view=platform&platform=weibo', { headers: { 'oai-authenticated-user-id': 'owner-a' } }));
const fastReturned = await Promise.race([fastBoardRequest.then(() => true), new Promise((resolve) => setTimeout(() => resolve(false), 100))]);
assert.equal(fastReturned, true, 'a fast board completes while another platform and owner history remain pending');
assert.equal(slowBoardSettled, false);
assert.equal(slowHistorySettled, false);
releaseDouyin(); releaseHistory();
await Promise.all([slowBoardRequest, slowHistoryRequest]);

// The existing MCP route exposes the new tool as read-only and checks the
// authenticated owner before calling the same topic-candidate read service.
let mcpRead;
const mcp = compile('app/mcp/route.ts', {
  '../../lib/hot-article-tools': {hotArticleTools:[],hotArticleEvent:{name:'hot_article.research_requested'},hotArticleCall:async()=>({})},
  '../../lib/hot-article-imitation': {HotArticleError:class extends Error{}},
  '../../lib/hot-article-claude': {imitationClaudeSSE:async()=>new Response('unused hot fixture')},
  '../../lib/mcp-sse-probe': compile('lib/mcp-sse-probe.ts'),
  '../../lib/editorial-authority-v3': {editorialAuthorityV3Tools:[],editorialAuthorityV3Call:async()=>({}),editorialAuthorityV3PublicError:()=>''},
  '../../lib/editorial-v3-runtime': {readEditorialV3:async()=>({}),editorialV3PublicError:()=>''},
  '../../lib/daily-editorial-adapter': {dailyEditorialAdapterTools:[],readDailyEditorialAdapter:async()=>({read_only:true})},
  '../../lib/topic-research-tools': {topicResearchTools:[],topicResearchCall:async()=>({}),topicResearchEvent:{name:'topic.research_requested'}},
  '../../lib/topic-research': {TopicResearchError:class extends Error{}},
  '../../lib/editorial-request': {editorialRequestTools:[],editorialRequestCall:async()=>({}),editorialRequestPublicError:()=>'',editorialRequestEvent:{name:'editorial.requested'}},
  '../../lib/editorial-flow': {editorialFlowTools:[],editorialFlowCall:async()=>({}),editorialFlowPublicError:()=>''},
  '../../lib/outline-flow': {outlineFlowTools:[],outlineFlowCall:async()=>({}),outlinePublicError:()=>''},
  '../../lib/daily-editorial-finalize': {dailyEditorialFinalizeTools:[],finalizeVerifiedDailyRevision:async()=>({})},
  '../../lib/prepared-article': {preparedArticleTools:[],registerPreparedArticle:async()=>({})},
  '../../lib/legacy-generation': {retiredGenerationNames:[],legacyGenerationNotice:()=>''},
  '../../lib/text-revision': {textRevisionTools:[],textRevisionCall:async()=>({}),textRevisionPublicError:()=>''},
  '../../lib/stepwise-text': {stepwiseTextTools:[],stepwiseTextCall:async()=>({})},
  '../../lib/stepwise-text-errors': {stepwisePublicError:()=>''},
  '../../lib/manual-errors': {manualPublicError:(_error,fallback)=>fallback},
  '../../lib/manual-claude': {manualClaudeTools:[],manualClaudeCall:async()=>({})},
  '../../lib/workflow-errors': {workflowPublicError:(_error,fallback)=>fallback},
  '../../lib/claude': { claudeTools: [], claudeCall: async () => ({}) },
  '../../lib/writing': { writingTools: [], writingCall: async () => ({}) },
  '../../lib/article-tools': { articleTools: [], articleCall: async () => ({}) },
  '../../lib/article-deletion': { articleDeletionTools: [], articleDeletionCall: async () => ({}), ArticleDeletionError: class extends Error {} },
  '../../lib/events': { subscribe: async () => ({}), unsubscribe: async () => ({}), readiness: async () => ({ connected: false }) },
  '../../lib/test-store': { owner: (request) => request.headers.get('oai-authenticated-user-id'), list: async () => [] },
  '../../lib/topic-candidates': { readTopicCandidateBrief: async (ownerId, args) => { mcpRead = { ownerId, args }; return { items: [] }; } },
}, { console: { info: () => undefined } });
const mcpRequest = (payload, ownerId) => new Request('https://site.test/mcp', {
  method: 'POST', headers: { 'content-type': 'application/json', ...(ownerId ? { 'oai-authenticated-user-id': ownerId } : {}) },
  body: JSON.stringify(payload),
});
const toolListResponse = await mcp.POST(mcpRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' }));
const toolList = await toolListResponse.json();
const topicTool = toolList.result.tools.find((tool) => tool.name === 'read_topic_candidates');
assert.equal(topicTool.annotations.readOnlyHint, true);
assert.equal(topicTool.annotations.destructiveHint, false);
const unauthorizedCall = await mcp.POST(mcpRequest({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'read_topic_candidates' } }));
assert.equal(unauthorizedCall.status, 401);
const authorizedCall = await mcp.POST(mcpRequest({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'read_topic_candidates', arguments: { platform: 'all', category: '电影', limit: 1 } } }, 'owner-a'));
assert.equal(authorizedCall.status, 200);
assert.equal(JSON.stringify(mcpRead), JSON.stringify({ ownerId: 'owner-a', args: { platform: 'all', category: '电影', limit: 1 } }));

console.log('Topics: fixed public endpoints, bounded parsing, cache/throttle/stale/error states, exact topic grouping, owner history, API auth, private caching, and read-only MCP passed (upstreams mocked, not live-verified)');
