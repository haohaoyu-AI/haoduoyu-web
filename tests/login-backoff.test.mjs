import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
import {fixture, USERNAME, PASSWORD} from './harness.mjs';
import {digest} from '../shared/auth.mjs';
import {throttleLogin, recordLoginFailure} from '../src/security.mjs';
import {LOGIN_FAILURE_PREFIX, loginFailureDelay, loginRemainingWait, loginWindowWait,
  trustedLoginPeer, rejectLogin, loginRetryAfter} from '../src/lib/login-backoff.mjs';
import {countingDb} from './counting-d1.mjs';

async function login(app, {ip = '192.0.2.10', trusted = true, username = USERNAME, password = 'synthetic-wrong-password', db = app.db} = {}) {
  const response = await worker.fetch(new Request(app.origin + '/api/v1/auth/login', {method: 'POST',
    headers: {Origin: app.origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip},
    body: JSON.stringify({username, password})}), {DB: db, SITE_ORIGIN: app.origin,
    ...(trusted ? {TRUST_CF_CONNECTING_IP: '1'} : {})});
  const json = await response.json();return {response, json};
}
test('synthetic trusted-source fifth password failure starts a two-second backoff', async t => {
  const app = await fixture(t);
  for (let i = 1; i <= 5; i++) {
    const {response, json} = await login(app);
    assert.equal(response.status, i < 5 ? 401 : 429, 'failure ' + i);
    assert.equal(json.request_id, response.headers.get('X-Request-Id'));
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    if (i === 5) {assert.equal(json.error.code, 'RATE_LIMITED');assert.equal(response.headers.get('Retry-After'), '2');}
  }
  t.diagnostic('Synthetic flag/header only: this is not proof of the production forwarding contract.');
});

const failureBucket = (ip = '192.0.2.10', username = USERNAME) => LOGIN_FAILURE_PREFIX + digest(JSON.stringify([ip, username]));
const rowFor = (app, bucket = failureBucket()) => app.db.prepare('SELECT * FROM matrix_login_attempts WHERE bucket=?').bind(bucket).first();
async function seed(app, bucket, attempts, stamp) {
  await app.db.prepare('INSERT OR REPLACE INTO matrix_login_attempts(bucket,attempts,window_start) VALUES(?,?,?)')
    .bind(bucket, attempts, stamp).run();
}
function clock(t) {
  const original = Date.now;let value = original();Date.now = () => value;
  t.after(() => {Date.now = original;});return {now: () => value, advance: n => {value += n;}};
}

test('backoff arithmetic fixes exact boundaries, inactivity reset, malformed and future metadata', () => {
  assert.deepEqual(Array.from({length: 16}, (_, n) => loginFailureDelay(n)),
    [0, 0, 0, 0, 0, 2, 4, 8, 16, 32, 64, 128, 256, 512, 900, 900]);
  const stamp = 2000000, row = {attempts: 5, window_start: stamp};
  for (const [elapsed, wait] of [[0, 2], [1, 2], [1000, 1], [1999, 1], [2000, 0], [2001, 0]])
    assert.equal(loginRemainingWait(row, stamp + elapsed), wait);
  assert.equal(loginRemainingWait({attempts: 14, window_start: stamp}, stamp + 899999), 1);
  assert.equal(loginRemainingWait({attempts: 14, window_start: stamp}, stamp + 900000), 0);
  assert.equal(loginRemainingWait({attempts: 14, window_start: stamp + 9999999}, stamp), 900);
  for (const attempts of [NaN, Infinity, -1, 1.5, '5']) assert.equal(loginFailureDelay(attempts), 900);
  assert.equal(loginRemainingWait({attempts: 5, window_start: null}, stamp), 900);
  assert.equal(loginWindowWait(stamp, stamp + 900000), 1, 'original aggregate window resets strictly after its boundary');
});

test('trust requires the exact opt-in and a valid canonical IP, never forwarding aliases', () => {
  const request = ip => new Request('http://localhost', {headers: {'CF-Connecting-IP': ip, 'X-Forwarded-For': '192.0.2.99'}});
  for (const flag of [undefined, '', '0', true, 1]) assert.equal(trustedLoginPeer(request('192.0.2.1'), {TRUST_CF_CONNECTING_IP: flag}), null);
  for (const ip of ['', 'unknown', '192.0.2.1, 192.0.2.2', '192.0.2.1:80', '::ffff:invalid'])
    assert.equal(trustedLoginPeer(request(ip), {TRUST_CF_CONNECTING_IP: '1'}), null);
  assert.equal(trustedLoginPeer(request('2001:0db8:0000:0000:0000:0000:0000:0001'), {TRUST_CF_CONNECTING_IP: '1'}), '2001:db8::1');
  assert.equal(trustedLoginPeer(request('::ffff:192.0.2.1'), {TRUST_CF_CONNECTING_IP: '1'}), '::ffff:c000:201');
});

test('only private metadata on canonical rate errors changes Retry-After', () => {
  let error;try {rejectLogin(2);} catch (value) {error = value;}
  assert.equal(error.status, 429);assert.equal(error.code, 'RATE_LIMITED');
  assert.equal(error.message, '尝试次数过多，请稍后再试');assert.equal(loginRetryAfter(error), 2);
  assert.equal(loginRetryAfter({get retryAfter() {throw Error('must not read');}}), 900);
  for (const value of [null, undefined, 42, 'synthetic']) assert.equal(loginRetryAfter(value), 900);
  let other;try {rejectLogin(0);} catch (value) {other = value;}
  assert.notEqual(error, other);assert.equal(loginRetryAfter(other), 900);assert.equal(loginRetryAfter(error), 2);
});

test('cooldown skips password lookup and does not extend failures; actual failures double up to 15 minutes', async t => {
  const app = await fixture(t), time = clock(t);
  await seed(app, failureBucket(), 4, time.now());
  for (const attempt of [5, 6, 7, 8, 9, 10, 11, 12, 13, 14]) {
    const fail = await login(app), delay = loginFailureDelay(attempt);
    assert.equal(fail.response.status, 429);assert.equal(fail.response.headers.get('Retry-After'), String(delay));
    const previous = await rowFor(app), revision = await app.db.prepare('SELECT revision FROM matrix_control').first();
    const db = countingDb(app.db), blocked = await login(app, {password: PASSWORD, db});
    assert.equal(blocked.response.status, 429);assert.equal(blocked.response.headers.get('Retry-After'), String(delay));
    assert.ok(!db.entries.some(row => /FROM matrix_users\b/.test(row.sql)), 'no user lookup before cooldown expires');
    assert.deepEqual(await rowFor(app), previous);assert.deepEqual(await app.db.prepare('SELECT revision FROM matrix_control').first(), revision);
    assert.equal(previous.attempts, attempt);assert.equal(previous.window_start, time.now());
    if (attempt < 14) time.advance(delay * 1000);
  }
  time.advance(900000);
  const reset = await login(app);assert.equal(reset.response.status, 401);assert.equal((await rowFor(app)).attempts, 1);
  assert.equal((await rowFor(app, 'ip:' + digest('192.0.2.10'))).attempts, 3,
    'aggregate window preserves its original strict-after boundary; the two previous attempts remain at exactly 15 minutes');
});

test('50 synthetic attacker peers cannot lock the administrator on another trusted peer', async t => {
  const app = await fixture(t);
  for (let n = 1; n <= 50; n++) assert.equal((await login(app, {ip: '198.51.100.' + n})).response.status, 401);
  const success = await login(app, {ip: '203.0.113.10', password: PASSWORD});assert.equal(success.response.status, 200);
  const cookie = success.response.headers.get('Set-Cookie').split(';')[0];
  const me = await app.request('/api/v1/auth/me', {headers: {Cookie: cookie}});
  assert.equal(me.status, 200);assert.equal(me.data.username, USERNAME);
  assert.equal((await app.db.prepare('SELECT count(*) AS n FROM matrix_login_attempts WHERE bucket LIKE ?').bind(LOGIN_FAILURE_PREFIX + '%').first()).n, 50);
  t.diagnostic('Synthetic configured trust only; this does not verify production header provenance.');
});

test('untrusted and invalid sources retain the original shared ten-attempt fallback', async t => {
  const app = await fixture(t);
  for (let n = 1; n <= 10; n++) {
    const result = await login(app, {ip: '198.51.100.' + n, trusted: false});assert.equal(result.response.status, 401);
  }
  const blocked = await login(app, {ip: 'invalid', password: PASSWORD});
  assert.equal(blocked.response.status, 429);assert.equal(blocked.response.headers.get('Retry-After'), '900');
  assert.equal(await rowFor(app), null);
  assert.equal((await rowFor(app, digest('shared-unverified-edge:' + USERNAME))).attempts, 11);
});

test('IPv6 spelling aliases share the same failure bucket and the IP cap still covers all usernames', async t => {
  const app = await fixture(t), time = clock(t), ip = '2001:db8::1';
  await seed(app, failureBucket(ip), 5, time.now());
  const blocked = await login(app, {ip: '2001:0db8:0:0:0:0:0:1'});assert.equal(blocked.response.status, 429);
  assert.equal(blocked.response.headers.get('Retry-After'), '2');
  const otherUser = await login(app, {ip, username: 'synthetic-other-user'});assert.equal(otherUser.response.status, 401);
  await seed(app, 'ip:' + digest(ip), 99, time.now());
  assert.equal((await login(app, {ip, username: 'synthetic-attempt-100'})).response.status, 401);
  const cap = await login(app, {ip, username: 'synthetic-attempt-101'});assert.equal(cap.response.status, 429);
  assert.equal(cap.response.headers.get('Retry-After'), '900');
  time.advance(900001);assert.equal((await login(app, {ip, password: PASSWORD})).response.status, 200);
});

test('atomic concurrent failure recording loses no counts; cooldown requests still count against IP attempts', async t => {
  const app = await fixture(t);clock(t);
  const outcomes = await Promise.allSettled(Array.from({length: 8}, () => recordLoginFailure(app.db, failureBucket())));
  assert.equal(outcomes.filter(row => row.status === 'fulfilled').length, 4);
  assert.deepEqual(outcomes.filter(row => row.status === 'rejected').map(row => loginRetryAfter(row.reason)).sort((a, b) => a - b), [2, 4, 8, 16]);
  assert.equal((await rowFor(app)).attempts, 8);
  const request = new Request(app.origin, {headers: {'CF-Connecting-IP': '192.0.2.10'}});
  for (let n = 0; n < 2; n++) await assert.rejects(throttleLogin(app.db, USERNAME, request, {TRUST_CF_CONNECTING_IP: '1'}), {status: 429});
  assert.equal((await rowFor(app)).attempts, 8);
  assert.equal((await rowFor(app, 'ip:' + digest('192.0.2.10'))).attempts, 2);
});

test('successful auth commits clear only their pair; failed commits roll back session, revision and bucket deletion', async t => {
  const app = await fixture(t), time = clock(t);
  await seed(app, failureBucket(), 4, time.now());await seed(app, failureBucket('192.0.2.11'), 4, time.now());
  const before = await rowFor(app), control = await app.db.prepare('SELECT revision FROM matrix_control').first();
  await app.db.prepare("CREATE TRIGGER synthetic_backoff_fail BEFORE INSERT ON matrix_audit WHEN NEW.action='auth.login' BEGIN SELECT RAISE(ABORT,'synthetic login transaction failure'); END").run();
  const original = console.error, logs = [];console.error = line => logs.push(line);t.after(() => {console.error = original;});
  const failed = await login(app, {password: PASSWORD});assert.equal(failed.response.status, 500);
  assert.deepEqual(await rowFor(app), before);assert.deepEqual(await app.db.prepare('SELECT revision FROM matrix_control').first(), control);
  assert.equal((await app.db.prepare('SELECT count(*) AS n FROM matrix_sessions').first()).n, 0);
  assert.equal(logs.length, 1);assert.equal(JSON.parse(logs[0]).rid, failed.json.request_id);
  assert.ok(!logs[0].includes('synthetic login transaction failure'));
  await app.db.prepare('DROP TRIGGER synthetic_backoff_fail').run();
  const success = await login(app, {password: PASSWORD});assert.equal(success.response.status, 200);
  assert.equal(await rowFor(app), null);assert.equal((await rowFor(app, failureBucket('192.0.2.11'))).attempts, 4);
  assert.equal((await app.db.prepare('SELECT revision FROM matrix_control').first()).revision, control.revision + 1);
});

test('unknown users take the same failed-verification backoff path without creating a session', async t => {
  const app = await fixture(t), username = 'synthetic-no-such-user';
  await seed(app, failureBucket('192.0.2.10', username), 4, Date.now());
  const result = await login(app, {username});assert.equal(result.response.status, 429);
  assert.equal(result.response.headers.get('Retry-After'), '2');assert.equal((await app.db.prepare('SELECT count(*) AS n FROM matrix_sessions').first()).n, 0);
});

test('a failed failure-counter write remains a controlled single-log 500 with no session or secret reflection in the log', async t => {
  const app = await fixture(t), canary = 'synthetic-counter-private-canary';
  const db = countingDb(app.db, {before(sql) {if (/RETURNING attempts,window_start$/.test(sql)) throw Error(canary);}});
  const original = console.error, logs = [];console.error = line => logs.push(line);t.after(() => {console.error = original;});
  const result = await login(app, {db});assert.equal(result.response.status, 500);
  assert.equal(logs.length, 1);assert.equal(JSON.parse(logs[0]).rid, result.json.request_id);assert.ok(!logs[0].includes(canary));
  assert.equal(await rowFor(app), null);assert.equal((await app.db.prepare('SELECT count(*) AS n FROM matrix_sessions').first()).n, 0);
});

test('real loopback workerd HTTP preserves trace IDs, no-store, failure codes and the two-second header', async t => {
  const app = await fixture(t, {trustConnectingIp: true}), url = await app.mf.ready;
  for (let n = 1; n <= 5; n++) {
    const response = await fetch(new URL('/api/v1/auth/login', url), {method: 'POST', headers: {
      Origin: app.origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.99'},
      body: JSON.stringify({username: USERNAME, password: 'synthetic-wrong-password'})});
    const body = await response.json();assert.equal(response.status, n < 5 ? 401 : 429);
    assert.equal(body.request_id, response.headers.get('X-Request-Id'));assert.equal(response.headers.get('Cache-Control'), 'no-store');
    if (n === 5) assert.equal(response.headers.get('Retry-After'), '2');
  }
  t.diagnostic('Real local HTTP and workerd; synthetic trust setting, not a production ingress attestation.');
});

test('adversarial IPv6 and colon-username tuples cannot lock an administrator on another peer', async t => {
  const app = await fixture(t), attackerIp = '2001:db8::1', adminIp = '2001:db8::1:a', attackerUser = 'a:' + USERNAME;
  assert.equal(digest(attackerIp + ':' + attackerUser), digest(adminIp + ':' + USERNAME), 'old delimiter encoding demonstrably collides');
  for (let n = 1; n <= 5; n++) assert.equal((await login(app, {ip: attackerIp, username: attackerUser})).response.status, n < 5 ? 401 : 429);
  const admin = await login(app, {ip: adminIp, password: PASSWORD});
  assert.equal(admin.response.status, 200, 'another valid IPv6 peer must not inherit the attacker failure bucket');
  assert.equal((await app.db.prepare('SELECT count(*) AS n FROM matrix_sessions').first()).n, 1);
});

test('aggregate IP window keeps the exact legacy 900000/900001 millisecond boundary', async t => {
  const app = await fixture(t), time = clock(t), ip = '192.0.2.10', bucket = 'ip:' + digest(ip);
  await seed(app, bucket, 100, time.now());
  const request = new Request(app.origin, {headers: {'CF-Connecting-IP': ip}});
  time.advance(900000);
  await assert.rejects(throttleLogin(app.db, USERNAME, request, {TRUST_CF_CONNECTING_IP: '1'}), error =>
    error.status === 429 && loginRetryAfter(error) === 1);
  assert.equal((await rowFor(app, bucket)).attempts, 101);
  time.advance(1);
  assert.equal(await throttleLogin(app.db, USERNAME, request, {TRUST_CF_CONNECTING_IP: '1'}), failureBucket());
  assert.equal((await rowFor(app, bucket)).attempts, 1);
});

test('50 concurrent real workerd HTTP logins account for in-flight failures and enforce the published cooldown', {timeout: 90000}, async t => {
  const app = await fixture(t, {trustConnectingIp: true}), url = await app.mf.ready;
  async function attempt() {
    const response = await fetch(new URL('/api/v1/auth/login', url), {method: 'POST', signal: AbortSignal.timeout(60000), headers: {
      Origin: app.origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.77'},
      body: JSON.stringify({username: USERNAME, password: 'synthetic-wrong-password'})});
    const body = await response.json();assert.equal(body.request_id, response.headers.get('X-Request-Id'));
    return {status: response.status, wait: response.headers.get('Retry-After'), id: body.request_id};
  }
  const results = await Promise.all(Array.from({length: 50}, attempt));
  assert.equal(results.filter(row => row.status === 401).length, 4);
  assert.equal(results.filter(row => row.status === 429).length, 46);
  assert.equal(new Set(results.map(row => row.id)).size, 50);
  const failures = (await app.db.prepare('SELECT * FROM matrix_login_attempts WHERE bucket LIKE ?').bind(LOGIN_FAILURE_PREFIX + '%').all()).results;
  assert.equal(failures.length, 1);const before = failures[0];
  assert.ok(before.attempts >= 5 && before.attempts <= 50);
  const blocked = await attempt();assert.equal(blocked.status, 429);assert.ok(Number(blocked.wait) >= 1 && Number(blocked.wait) <= 900);
  assert.deepEqual(await rowFor(app, before.bucket), before, 'after a published cooldown, another HTTP request does not run failed verification');
  t.diagnostic(JSON.stringify({concurrent_http_requests: 50, invalid_credentials_401: 4, rate_limited_429: 46,
    completed_failed_verifications: before.attempts, rejected_before_verification: 50 - before.attempts}));
  t.diagnostic('In-flight verification is not serialized. This measures local workerd/D1 with synthetic trust, not production provenance.');
});
