import { fixture as workerFixture } from './harness.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const ORIGIN = 'http://localhost';
const PASSWORD = 'Integration-only-password-2026!';
const NEW_PASSWORD = 'Changed-integration-password-2026!';

function isoAgo(hours) {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

function beijingDate(daysAgo = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(Date.now() - daysAgo * 86_400_000));
  const get = type => parts.find(part => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

async function fixture(t) {
  const {request: workerRequest} = await workerFixture(t);
  async function request(path, { method = 'GET', body, session, token, headers = {} } = {}) {
    return workerRequest(path,{method,body,session,token,headers});
  }

  async function login(password = PASSWORD) {
    const result = await request('/api/v1/auth/login', {
      method: 'POST', body: { username: 'synthetic-admin', password },
    });
    assert.equal(result.status, 200, result.text);
    const cookie = result.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie, 'Login returns a session cookie');
    const me = await request('/api/v1/auth/me', { headers: { Cookie: cookie } });
    assert.equal(me.status, 200, me.text);
    assert.equal(me.data.username, 'synthetic-admin');
    assert.ok(me.data.csrfToken);
    return { cookie, csrfToken: me.data.csrfToken };
  }

  async function accounts(session) {
    const result = await request('/api/v1/accounts', { session });
    assert.equal(result.status, 200, result.text);
    assert.ok(result.data.length >= 3, 'Initial platform account configuration exists');
    return result.data;
  }

  async function article(session, accountId, overrides = {}) {
    const input = {
      account_id: accountId,
      title: '一次独立发布的真实结构测试',
      url: `https://example.test/articles/${crypto.randomUUID()}`,
      published_at: isoAgo(24),
      started_at: isoAgo(25),
      production_mode: 'manual',
      ...overrides,
    };
    const result = await request('/api/v1/articles', { method: 'POST', session, body: input });
    assert.ok([200, 201].includes(result.status), result.text);
    assert.ok(result.data.id);
    return { input, record: result.data };
  }

  async function key(session, accountIds, permissions = ['read', 'write']) {
    const result = await request('/api/v1/api-keys', {
      method: 'POST', session,
      body: { name: 'Grok integration test', account_ids: accountIds, permissions },
    });
    assert.ok([200, 201].includes(result.status), result.text);
    assert.ok(result.data.id);
    assert.ok(result.data.token);
    return result.data;
  }

  return { request, login, accounts, article, key, databasePath:'/tmp/matrix-synthetic-private.sqlite' };
}

function assertInvalid(result) {
  assert.ok([400, 422].includes(result.status), `Expected invalid input rejection: ${result.status} ${result.text}`);
  assert.ok(result.json?.error?.code, 'Validation errors use the structured JSON error contract');
}

test('business records, exports and writes require authentication', async t => {
  const app = await fixture(t);
  for (const path of ['/accounts', '/articles', '/observations', '/daily-metrics', '/dashboard', '/api-keys', '/audit', '/export']) {
    const response = await app.request(`/api/v1${path}`);
    assert.equal(response.status, 401, `${path}: ${response.text}`);
  }
  const write = await app.request('/api/v1/articles', { method: 'POST', body: {} });
  assert.equal(write.status, 401, write.text);
});

test('administrator login and writes enforce same origin and the session CSRF token', async t => {
  const app = await fixture(t);
  const foreignLogin = await app.request('/api/v1/auth/login', {
    method: 'POST', body: { username: 'synthetic-admin', password: PASSWORD },
    headers: { Origin: 'https://foreign.example' },
  });
  assert.equal(foreignLogin.status, 403, foreignLogin.text);
  const session = await app.login();
  const body = { platform: 'other', name: '可新增的未来账号' };
  for (const headers of [
    { Cookie: session.cookie },
    { Cookie: session.cookie, 'X-CSRF-Token': 'incorrect' },
    { Cookie: session.cookie, 'X-CSRF-Token': session.csrfToken, Origin: 'https://foreign.example' },
  ]) {
    const denied = await app.request('/api/v1/accounts', { method: 'POST', body, headers });
    assert.equal(denied.status, 403, denied.text);
  }
  const created = await app.request('/api/v1/accounts', { method: 'POST', body, session });
  assert.ok([200, 201].includes(created.status), created.text);
  const updated = await app.request(`/api/v1/accounts/${created.data.id}`, {
    method: 'PUT', session, body: { name: '改名后的账号', active: false },
  });
  assert.equal(updated.status, 200, updated.text);
  const listed = await app.request('/api/v1/accounts', { session });
  const account = listed.data.find(item => item.id === created.data.id);
  assert.equal(account.name, '改名后的账号');
  assert.equal(Boolean(account.active), false);
});

test('manual recording and Grok API updates operate on the same article without changing production mode', async t => {
  const app = await fixture(t);
  const session = await app.login();
  const [account] = await app.accounts(session);
  const { record } = await app.article(session, account.id);
  const credential = await app.key(session, [account.id]);
  const asOf = isoAgo(1);
  const observed = await app.request('/api/v1/observations', {
    method: 'POST', token: credential.token,
    body: { article_id: record.id, as_of: asOf, kind: 'd1', metrics: { reads: 123, likes: 0 }, source: 'Grok Bot' },
  });
  assert.ok([200, 201].includes(observed.status), observed.text);
  // An old report arriving late must not replace the more recent actual data.
  const late = await app.request('/api/v1/observations', {
    method: 'POST', token: credential.token,
    body: { article_id: record.id, as_of: isoAgo(3), kind: 'latest', metrics: { reads: 50 }, source: 'Grok Bot' },
  });
  assert.ok([200, 201].includes(late.status), late.text);
  const detail = await app.request(`/api/v1/articles/${record.id}`, { session });
  assert.equal(detail.status, 200, detail.text);
  assert.equal(detail.data.production_mode, 'manual');
  assert.equal(detail.data.latest_metrics.reads, 123);
  assert.equal(detail.data.latest_metrics.likes, 0);
  assert.equal(new Date(detail.data.latest_as_of).getTime(), new Date(asOf).getTime());
  assert.equal(detail.data.observations.length, 2);
  assert.ok(detail.data.observations.every(item => item.source === 'Grok Bot'));
});

test('scoped API keys cannot escape account permissions or manage administrators', async t => {
  const app = await fixture(t);
  const session = await app.login();
  const [allowed, other] = await app.accounts(session);
  const privateArticle = await app.article(session, other.id);
  const credential = await app.key(session, [allowed.id]);
  const accounts = await app.request('/api/v1/accounts', { token: credential.token });
  assert.equal(accounts.status, 200, accounts.text);
  assert.deepEqual(accounts.data.map(item => item.id), [allowed.id]);
  const crossAccount = await app.request('/api/v1/articles', {
    method: 'POST', token: credential.token,
    body: { ...privateArticle.input, url: 'https://example.test/forbidden-copy' },
  });
  assert.equal(crossAccount.status, 403, crossAccount.text);
  for (const path of [
    `/api/v1/articles?account_id=${other.id}`,
    `/api/v1/articles/${privateArticle.record.id}`,
    `/api/v1/dashboard?account_id=${other.id}`,
    `/api/v1/observations?article_id=${privateArticle.record.id}`,
    '/api/v1/api-keys', '/api/v1/audit', '/api/v1/export',
  ]) {
    const denied = await app.request(path, { token: credential.token });
    assert.equal(denied.status, 403, `${path}: ${denied.text}`);
  }
  for (const [path, method, body] of [
    ['/api/v1/observations', 'POST', {
      article_id: privateArticle.record.id, as_of: isoAgo(1), kind: 'latest', metrics: { reads: 1 }, source: 'Grok Bot',
    }],
    ['/api/v1/daily-metrics', 'POST', {
      account_id: other.id, date: beijingDate(), metrics: { reads: 1 }, source: 'Grok Bot',
    }],
    ['/api/v1/accounts', 'POST', { name: 'Unauthorized', platform: 'other' }],
    ['/api/v1/api-keys', 'POST', { name: 'Unauthorized', account_ids: [other.id], permissions: ['read'] }],
    ['/api/v1/auth/password', 'PUT', { currentPassword: PASSWORD, newPassword: NEW_PASSWORD }],
  ]) {
    const denied = await app.request(path, { method, body, token: credential.token });
    assert.equal(denied.status, 403, `${path}: ${denied.text}`);
  }
});

test('read-only keys reject writes, metadata omits secrets, and revocation takes effect', async t => {
  const app = await fixture(t);
  const session = await app.login();
  const [account] = await app.accounts(session);
  const credential = await app.key(session, [account.id], ['read']);
  const before = await app.request('/api/v1/articles', { token: credential.token });
  assert.equal(before.status, 200, before.text);
  const denied = await app.request('/api/v1/articles', { method: 'POST', token: credential.token, body: {} });
  assert.equal(denied.status, 403, denied.text);
  const list = await app.request('/api/v1/api-keys', { session });
  assert.equal(list.status, 200, list.text);
  assert.ok(!list.text.includes(credential.token), 'Listing credentials cannot recover issued tokens');
  assert.ok(!list.text.includes('token_hash'), 'Credential hashes are private implementation data');
  const revoked = await app.request(`/api/v1/api-keys/${credential.id}`, { method: 'DELETE', session });
  assert.ok([200, 204].includes(revoked.status), revoked.text);
  const after = await app.request('/api/v1/articles', { token: credential.token });
  assert.equal(after.status, 401, after.text);
});

test('idempotent retries return one article and reject a changed request under the same key', async t => {
  const app = await fixture(t);
  const session = await app.login();
  const [account] = await app.accounts(session);
  const credential = await app.key(session, [account.id]);
  const body = {
    account_id: account.id, title: '唯一的幂等请求', url: 'https://example.test/idempotent',
    published_at: isoAgo(1), production_mode: 'automatic',
  };
  const options = { method: 'POST', token: credential.token, headers: { 'Idempotency-Key': 'grok-article-unique-1' }, body };
  const first = await app.request('/api/v1/articles', options);
  assert.ok([200, 201].includes(first.status), first.text);
  const retry = await app.request('/api/v1/articles', options);
  assert.equal(retry.status, first.status, retry.text);
  assert.equal(retry.data.id, first.data.id);
  const changed = await app.request('/api/v1/articles', { ...options, body: { ...body, title: '不同的内容' } });
  assert.equal(changed.status, 409, changed.text);
  const listed = await app.request('/api/v1/articles?q=' + encodeURIComponent(body.title), { session });
  assert.equal(listed.status, 200, listed.text);
  assert.equal(listed.data.length, 1);
});

test('article versions prevent a stale writer from silently replacing a newer edit', async t => {
  const app = await fixture(t);
  const session = await app.login();
  const [account] = await app.accounts(session);
  const { input, record } = await app.article(session, account.id);
  const newer = await app.request(`/api/v1/articles/${record.id}`, {
    method: 'PUT', session, body: { ...input, title: '人工更新后的标题', version: record.version },
  });
  assert.equal(newer.status, 200, newer.text);
  const stale = await app.request(`/api/v1/articles/${record.id}`, {
    method: 'PUT', session, body: { ...input, title: '过期的 AI 更新', version: record.version },
  });
  assert.equal(stale.status, 409, stale.text);
  const detail = await app.request(`/api/v1/articles/${record.id}`, { session });
  assert.equal(detail.data.title, '人工更新后的标题');
  assert.ok(detail.data.version > record.version);
});

test('invalid calendar dates, reversed duration and invalid metric values are rejected', async t => {
  const app = await fixture(t);
  const session = await app.login();
  const [account] = await app.accounts(session);
  const { input, record } = await app.article(session, account.id);
  for (const change of [
    { published_at: 'not-a-date' },
    { published_at: '2026-02-30T12:00:00+08:00', started_at: null },
    { started_at: isoAgo(1), published_at: isoAgo(2) },
  ]) {
    assertInvalid(await app.request('/api/v1/articles', {
      method: 'POST', session, body: { ...input, url: `https://example.test/${crypto.randomUUID()}`, ...change },
    }));
  }
  for (const metrics of [{ reads: -1 }, { likes: 'many' }, { comments: null }, { reads: 1.5 }]) {
    assertInvalid(await app.request('/api/v1/observations', {
      method: 'POST', session,
      body: { article_id: record.id, as_of: isoAgo(1), kind: 'latest', metrics, source: 'Grok Bot' },
    }));
  }
  assertInvalid(await app.request('/api/v1/daily-metrics', {
    method: 'POST', session,
    body: { account_id: account.id, date: '2026-02-30', metrics: { reads: 1 }, source: 'Grok Bot' },
  }));
});

test('three-day effects include old articles, exclude cumulative snapshots and avoid account/detail double counting', async t => {
  const app = await fixture(t);
  const session = await app.login();
  const [account, missingAccount] = await app.accounts(session);
  const { record } = await app.article(session, account.id, { published_at: isoAgo(24 * 30), started_at: null });
  const snapshot = await app.request('/api/v1/observations', {
    method: 'POST', session,
    body: { article_id: record.id, as_of: isoAgo(1), kind: 'latest', metrics: { reads: 9000 }, source: 'Grok Bot' },
  });
  assert.ok([200, 201].includes(snapshot.status), snapshot.text);
  for (const [date, reads] of [[beijingDate(1), 10], [beijingDate(), 20]]) {
    const daily = await app.request('/api/v1/daily-metrics', {
      method: 'POST', session,
      body: { account_id: account.id, article_id: record.id, date, metrics: { reads }, source: 'Grok Bot' },
    });
    assert.ok([200, 201].includes(daily.status), daily.text);
  }
  const dashboard = await app.request('/api/v1/dashboard', { session });
  assert.equal(dashboard.status, 200, dashboard.text);
  assert.equal(dashboard.data.window.timezone, 'Asia/Shanghai');
  assert.equal(dashboard.data.window.from, beijingDate(2));
  assert.equal(dashboard.data.window.to, beijingDate());
  assert.equal(dashboard.data.window.todayIncomplete, true);
  const summary = dashboard.data.accounts.find(item => item.id === account.id);
  assert.equal(summary.period_metrics.reads, 30, 'Old articles contribute actual daily values; cumulative 9000 does not');
  const missing = dashboard.data.accounts.find(item => item.id === missingAccount.id);
  assert.ok(missing.period_metrics?.reads == null, 'Uncollected values must not be fabricated as zero');
  assert.ok(summary.coverage, 'Article-derived account totals expose their coverage');

  const overall = await app.request('/api/v1/daily-metrics', {
    method: 'POST', session,
    body: { account_id: account.id, date: beijingDate(1), metrics: { reads: 100 }, source: 'Platform overall' },
  });
  assert.ok([200, 201].includes(overall.status), overall.text);
  const after = await app.request('/api/v1/dashboard', { session });
  assert.equal(after.data.accounts.find(item => item.id === account.id).period_metrics.reads, 120,
    'One account-day overall record replaces, rather than adds to, its article detail');
  // Retrying a day's feed updates that day's record instead of adding another daily value.
  const retried = await app.request('/api/v1/daily-metrics', {
    method: 'POST', session,
    body: { account_id: account.id, date: beijingDate(1), metrics: { reads: 100 }, source: 'Platform overall' },
  });
  assert.ok([200, 201].includes(retried.status), retried.text);
  const final = await app.request('/api/v1/dashboard', { session });
  assert.equal(final.data.accounts.find(item => item.id === account.id).period_metrics.reads, 120);
});

test('changing the password expires every existing session and permits only the new password', async t => {
  const app = await fixture(t);
  const first = await app.login();
  const second = await app.login();
  const changed = await app.request('/api/v1/auth/password', {
    method: 'PUT', session: first, body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
  });
  assert.equal(changed.status, 200, changed.text);
  for (const session of [first, second]) {
    const denied = await app.request('/api/v1/auth/me', { session });
    assert.equal(denied.status, 401, denied.text);
  }
  const oldLogin = await app.request('/api/v1/auth/login', {
    method: 'POST', body: { username: 'synthetic-admin', password: PASSWORD },
  });
  assert.equal(oldLogin.status, 401, oldLogin.text);
  await app.login(NEW_PASSWORD);
});

test('static requests cannot expose application source or the private database through traversal', async t => {
  const app = await fixture(t);
  for (const path of [
    '/src/auth.mjs', '/src/db.mjs', '/private.sqlite',
    '/..%2fsrc%2fauth.mjs', '/%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    `/%2e%2e%2f%2e%2e%2f%2e%2e${app.databasePath.replaceAll('/', '%2f')}`,
  ]) {
    const response = await app.request(path);
    assert.ok([400, 404].includes(response.status), `${path}: ${response.status}`);
    assert.ok(!response.text.includes('SQLite format 3'));
    assert.ok(!response.text.includes('password_hash'));
    assert.ok(!response.text.includes('root:x:0:0:'));
  }
});

test('CSV export neutralizes spreadsheet formulas supplied as article titles', async t => {
  const app = await fixture(t);
  const session = await app.login();
  const [account] = await app.accounts(session);
  for (const title of ['=1+1', '+SUM(1)', '-SUM(1)', '@SUM(1)']) {
    await app.article(session, account.id, { title });
  }
  const exported = await app.request('/api/v1/export', { session });
  assert.equal(exported.status, 200, exported.text);
  assert.match(exported.headers.get('content-type'), /text\/csv/);
  for (const title of ['=1+1', '+SUM(1)', '-SUM(1)', '@SUM(1)']) {
    assert.ok(exported.text.includes(`'${title}`) || exported.text.includes(`\t${title}`),
      `Spreadsheet formula must be exported as inert text: ${title}`);
  }
});
