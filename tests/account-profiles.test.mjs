import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAccountProfile} from '../src/account-profiles.mjs';
import {fixture} from './harness.mjs';
import {createRecords} from '../src/records.mjs';
import {storeFor} from '../src/storage.mjs';

const zhihu = 'https://www.zhihu.com/people/synthetic-account';
const post = (app, body, headers = {}) => app.request('/api/v1/accounts', {method: 'POST', session: app.session, body, headers});
const count = async (app, table) => (await app.db.prepare(`SELECT count(*) AS n FROM matrix_${table}`).first()).n;
async function setup(t) {
  const app = await fixture(t);
  app.session = await app.login();
  return app;
}

test('profile normalization identifies only known public homepage paths and strips tracking', () => {
  assert.deepEqual(normalizeAccountProfile(' http://zhihu.com/people/synthetic-account/answers?utm_source=test#top '), {
    platform: 'zhihu', profile_url: zhihu, platform_identity: 'zhihu:people:synthetic-account'
  });
  assert.equal(normalizeAccountProfile('https://www.zhihu.com/org/synthetic-org/').platform_identity, 'zhihu:org:synthetic-org');
  const numeric = normalizeAccountProfile('https://m.toutiao.com/c/user/123456789/?source=synthetic');
  assert.equal(numeric.profile_url, 'https://www.toutiao.com/user/123456789/');
  assert.equal(numeric.platform_identity, normalizeAccountProfile('https://www.toutiao.com/user/profile/123456789/').platform_identity);
  assert.equal(normalizeAccountProfile('https://www.toutiao.com/c/user/token/MS4wLjABAAAA_SYNTHETIC/').platform_identity,
    'toutiao:token:MS4wLjABAAAA_SYNTHETIC');
  const wechat = normalizeAccountProfile('https://mp.weixin.qq.com/mp/profile_ext?action=home&__biz=MzAxMDAwMDAwMA%3D%3D&scene=124#wechat_redirect');
  assert.equal(wechat.platform, 'wechat');
  assert.equal(wechat.profile_url, 'https://mp.weixin.qq.com/mp/profile_ext?action=home&__biz=MzAxMDAwMDAwMA%3D%3D');
});

test('Toutiao padded public profile tokens normalize literal and encoded padding to one identity', () => {
  const plain = normalizeAccountProfile('https://www.toutiao.com/c/user/token/SYNTHETIC_token-123=/?');
  const encoded = normalizeAccountProfile('https://m.toutiao.com/c/user/token/SYNTHETIC_token-123%3d/?source=synthetic');
  assert.deepEqual(plain, encoded);
  assert.equal(plain.profile_url, 'https://www.toutiao.com/c/user/token/SYNTHETIC_token-123=/');
  assert.equal(plain.platform_identity, 'toutiao:token:SYNTHETIC_token-123=');
  assert.equal(normalizeAccountProfile('https://www.toutiao.com/c/user/token/SYNTHETIC_token-123%3D%3d/').platform_identity,
    'toutiao:token:SYNTHETIC_token-123==');
  for (const token of ['SYNTHETIC=token', 'SYNTHETIC===', 'SYNTHETIC%2ftoken', 'SYNTHETIC%3Ftoken']) {
    assert.throws(() => normalizeAccountProfile('https://www.toutiao.com/c/user/token/' + token + '/'),
      error => error.status === 400 && error.code === 'VALIDATION_ERROR');
  }
});

test('creating a padded Toutiao profile reuses the same account for encoded padding', async t => {
  const app = await setup(t), original = await count(app, 'accounts');
  const base = 'https://www.toutiao.com/c/user/token/SYNTHETIC_token-123';
  const created = await post(app, {name: '合成头条主页', profile_url: base + '=/'});
  assert.equal(created.status, 201, created.text);
  const duplicate = await post(app, {name: '不重复创建', profile_url: base + '%3D/?source=synthetic'});
  assert.equal(duplicate.status, 200, duplicate.text);
  assert.equal(duplicate.data.profile_reused, true);
  assert.equal(duplicate.data.id, created.data.id);
  assert.equal(await count(app, 'accounts'), original + 1);
  assert.equal(await count(app, 'account_profiles'), 1);
});

test('profile validation rejects unsafe URLs, hostname tricks, articles, dashboard URLs and platform mismatch', () => {
  for (const input of [null, 1, {}, '', 'javascript:alert(1)', 'data:text/html,profile', 'file:///tmp/profile',
    '//www.zhihu.com/people/a', 'https://user:pass@www.zhihu.com/people/a', 'https://www.zhihu.com:444/people/a',
    'https://www.zhihu.com.evil.invalid/people/a', 'https://evil.invalid/?url=https://www.zhihu.com/people/a',
    'https://127.0.0.1/people/a', 'https://[::1]/people/a', 'https://www.zhihu.com/question/123/answer/456',
    'https://zhuanlan.zhihu.com/p/123', 'https://www.toutiao.com/article/123/', 'https://mp.weixin.qq.com/s/article',
    'https://mp.weixin.qq.com/', 'https://mp.weixin.qq.com/cgi-bin/home', 'https://www.zhihu.com/people/a\n',
    'https://www.zhihu.com\\@evil.invalid/people/a', 'https://www.zhihu.com/people/a%2Fb',
    'https://mp.weixin.qq.com/mp/profile_ext?action=home&action=home&__biz=AAAA',
    'https://mp.weixin.qq.com/mp/profile_ext?action=home&__biz=AAAA&__biz=BBBB']) {
    assert.throws(() => normalizeAccountProfile(input), error => error.status === 400 && error.code === 'VALIDATION_ERROR', String(input));
  }
  assert.throws(() => normalizeAccountProfile(zhihu, 'toutiao'), /所选平台不一致/);
});

test('optional profile creates an account without changing legacy account reads and duplicate URL reuses its identity', async t => {
  const app = await setup(t), original = await count(app, 'accounts');
  const created = await post(app, {name: '合成主页账号', profile_url: zhihu});
  assert.equal(created.status, 201, created.text);
  assert.equal(created.data.platform, 'zhihu');
  assert.equal(created.data.profile_url, zhihu);
  const replay = await post(app, {name: '不会另建的名字', platform: 'zhihu', profile_url: zhihu + '/answers?source=duplicate'});
  assert.equal(replay.status, 200, replay.text);
  assert.equal(replay.data.profile_reused, true);
  assert.equal(replay.data.id, created.data.id);
  assert.equal(replay.data.name, '合成主页账号');
  assert.equal(await count(app, 'accounts'), original + 1);
  assert.equal(await count(app, 'account_profiles'), 1);
  const legacy = (await app.request('/api/v1/accounts', {session: app.session})).data.find(row => row.id === created.data.id);
  assert.deepEqual(Object.keys(legacy), ['id', 'platform', 'name', 'active', 'created_at']);
  const profiles = await app.request('/api/v1/account-profiles', {session: app.session});
  assert.equal(profiles.status, 200, profiles.text);
  assert.equal(profiles.data[0].account_id, created.data.id);
  assert.equal(profiles.data[0].profile_url, zhihu);
});

test('legacy writes omit profile fields, profile edits persist, and blank profile detaches without losing account', async t => {
  const app = await setup(t);
  const legacy = await post(app, {name: '合成旧接口', platform: 'zhihu'});
  assert.equal(legacy.status, 201, legacy.text);
  assert.deepEqual(Object.keys(legacy.data), ['id', 'platform', 'name', 'active', 'created_at']);
  const update = body => app.request('/api/v1/accounts/' + legacy.data.id, {method: 'PUT', session: app.session, body});
  const linked = await update({name: '合成旧接口', profile_url: zhihu});
  assert.equal(linked.status, 200, linked.text);
  assert.equal(linked.data.profile_url, zhihu);
  const oldUpdate = await update({name: '合成改名', active: false});
  assert.equal(oldUpdate.status, 200, oldUpdate.text);
  assert.equal(Object.hasOwn(oldUpdate.data, 'profile_url'), false);
  assert.equal(await count(app, 'account_profiles'), 1);
  const detached = await update({profile_url: ''});
  assert.equal(detached.status, 200, detached.text);
  assert.equal(detached.data.profile_url, null);
  assert.equal(await count(app, 'account_profiles'), 0);
  assert.equal((await app.request('/api/v1/accounts', {session: app.session})).data.find(row => row.id === legacy.data.id).name, '合成改名');
});

test('a homepage URL alone creates a provisional account and duplicate URLs reuse it', async t => {
  const app = await setup(t), original = await count(app, 'accounts');
  const created = await post(app, {profile_url: zhihu});
  assert.equal(created.status, 201, created.text);
  assert.equal(created.data.platform, 'zhihu');
  assert.match(created.data.name, /^主页标识 /);
  const duplicate = await post(app, {profile_url: zhihu + '/answers?utm_source=test'});
  assert.equal(duplicate.status, 200, duplicate.text);
  assert.equal(duplicate.data.id, created.data.id);
  assert.equal(duplicate.data.profile_reused, true);
  assert.equal(await count(app, 'accounts'), original + 1);
});

test('profile validation failures commit no account, audit or receipt', async t => {
  const app = await setup(t), accounts = await count(app, 'accounts'), audit = await count(app, 'audit');
  for (const body of [{name: '失败', profile_url: 'https://evil.invalid/private'},
    {name: '失败', platform: 'toutiao', profile_url: zhihu}]) {
    const failed = await post(app, body, {'Idempotency-Key': 'failed-profile-' + JSON.stringify(body).length});
    assert.equal(failed.status, 400, failed.text);
  }
  assert.equal(await count(app, 'accounts'), accounts);
  assert.equal(await count(app, 'audit'), audit);
  assert.equal(await count(app, 'idempotency'), 0);
});

test('scoped profile reads exclude other accounts and a duplicate outside scope reveals no account identity', async t => {
  const app = await setup(t);
  const created = await post(app, {name: 'PRIVATE-PROFILE-NAME-CANARY', profile_url: zhihu});
  assert.equal(created.status, 201, created.text);
  const key = await app.request('/api/v1/api-keys', {method: 'POST', session: app.session,
    body: {name: '合成隔离只读', account_ids: ['toutiao-haoduoyu'], permissions: ['read']}});
  assert.equal(key.status, 201, key.text);
  const scoped = await app.request('/api/v1/account-profiles', {token: key.data.token});
  assert.equal(scoped.status, 200, scoped.text);
  assert.deepEqual(scoped.data, []);
  const store = storeFor(app.db);
  await assert.rejects(createRecords(store).createAccount({name: '重复', profile_url: zhihu}, ['toutiao-haoduoyu']), error =>
    error.status === 409 && error.code === 'ACCOUNT_PROFILE_EXISTS' && !error.message.includes('CANARY') && !error.message.includes(created.data.id));
  assert.equal(store.pending.length, 0);
});

test('profile listing fails explicitly at the bounded limit instead of silently dropping accounts', async () => {
  let query;
  const records = createRecords({async all(sql, ...args) {query = {sql, args};return Array.from({length: 1001}, () => ({}));}});
  await assert.rejects(records.listAccountProfiles(['allowed-account']), error => error.code === 'PROFILE_LIMIT_EXCEEDED');
  assert.match(query.sql, /LIMIT 1001$/);
  assert.deepEqual(query.args, ['["allowed-account"]']);
});

test('account profile retries stay atomic and replay the same receipt during concurrent creation', async t => {
  const app = await setup(t), accounts = await count(app, 'accounts');
  const body = {name: '合成并发主页', profile_url: zhihu};
  const responses = await Promise.all(Array.from({length: 8}, () => post(app, body, {'Idempotency-Key': 'profile-concurrent'})));
  assert.equal(new Set(responses.map(row => JSON.stringify(row.data))).size, 1);
  for (const response of responses) assert.equal(response.status, 201, response.text);
  assert.equal(await count(app, 'accounts'), accounts + 1);
  assert.equal(await count(app, 'account_profiles'), 1);
  assert.equal(await count(app, 'idempotency'), 1);
});
