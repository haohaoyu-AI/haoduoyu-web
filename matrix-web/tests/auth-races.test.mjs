import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { openDatabase } from '../src/db.mjs';
import { createUser, hashPassword, checkCsrf } from '../src/auth.mjs';
import { createApplication } from '../src/server.mjs';

const ORIGIN = 'https://matrix.example.test';
const OLD_PASSWORD = 'Test-only-old-password-2026!';
const NEW_PASSWORD = 'Test-only-new-password-2026!';

async function fixture(t, wrapDatabase = db => db) {
  const db = openDatabase(':memory:');
  const user = await createUser(db, 'race-admin', OLD_PASSWORD);
  const server = createApplication({ db: wrapDatabase(db, user), origin: ORIGIN, secureCookies: true });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
    db.close();
  });
  const port = server.address().port;

  async function request(path, { method = 'GET', body, cookie, csrf } = {}) {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const headers = { Origin: ORIGIN };
    if (cookie) headers.Cookie = cookie;
    if (csrf !== undefined) headers['X-CSRF-Token'] = csrf;
    if (payload !== undefined) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    return new Promise((resolve, reject) => {
      // node:http preserves Latin-1 header values so the former UTF-8 length
      // mismatch is exercised through HTTP as well as the function boundary.
      const req = httpRequest({ host: '127.0.0.1', port, path, method, headers }, response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: response.statusCode, headers: response.headers, text, json: JSON.parse(text) });
        });
        response.on('error', reject);
      });
      req.on('error', reject);
      req.end(payload);
    });
  }
  return { db, user, request };
}

test('password rotation while scrypt is pending cannot issue a session using the stale password proof', async t => {
  const replacementHash = await hashPassword(NEW_PASSWORD);
  let rotated = false;
  const app = await fixture(t, (db, user) => ({
    exec: sql => db.exec(sql),
    prepare(sql) {
      const statement = db.prepare(sql);
      if (sql !== 'SELECT * FROM users WHERE username=?') return statement;
      return {
        get(...args) {
          const captured = statement.get(...args);
          if (!rotated) {
            // Reproduce a committed password-change transaction after the login
            // read but before its asynchronous password verification finishes.
            queueMicrotask(() => {
              db.exec('BEGIN IMMEDIATE');
              db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(replacementHash, user.id);
              db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
              db.exec('COMMIT');
              rotated = true;
            });
          }
          return captured;
        },
      };
    },
  }));
  const denied = await app.request('/api/v1/auth/login', {
    method: 'POST', body: { username: 'race-admin', password: OLD_PASSWORD },
  });
  assert.equal(rotated, true, 'The competing password rotation really committed');
  assert.equal(denied.status, 401, denied.text);
  assert.equal(denied.json.error.code, 'INVALID_CREDENTIALS');
  assert.equal(denied.headers['set-cookie'], undefined, 'Stale proof must not issue a session cookie');
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM sessions').get().n, 0);
  assert.equal(app.db.prepare("SELECT count(*) AS n FROM audit WHERE action='auth.login'").get().n, 0);
  assert.match(denied.headers['cache-control'], /no-store/);
  assert.ok(!denied.text.includes(OLD_PASSWORD) && !denied.text.includes(replacementHash));

  const accepted = await app.request('/api/v1/auth/login', {
    method: 'POST', body: { username: 'race-admin', password: NEW_PASSWORD },
  });
  assert.equal(accepted.status, 200, accepted.text);
  const cookie = accepted.headers['set-cookie'][0];
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; SameSite=Strict/);
  assert.match(cookie, /; Secure/);
  assert.match(accepted.headers['cache-control'], /no-store/);
  const me = await app.request('/api/v1/auth/me', { cookie: cookie.split(';')[0] });
  assert.equal(me.status, 200, me.text);
});

test('non-ASCII and malformed CSRF headers return structured 403 without mutation or a timingSafeEqual length exception', async t => {
  const app = await fixture(t);
  const login = await app.request('/api/v1/auth/login', {
    method: 'POST', body: { username: 'race-admin', password: OLD_PASSWORD },
  });
  assert.equal(login.status, 200, login.text);
  const cookie = login.headers['set-cookie'][0].split(';')[0];
  const count = app.db.prepare('SELECT count(*) AS n FROM accounts').get().n;

  for (const csrf of ['é'.repeat(64), 'g'.repeat(64), 'a'.repeat(63), '']) {
    const denied = await app.request('/api/v1/accounts', {
      method: 'POST', cookie, csrf, body: { platform: 'other', name: '必须被拒绝的变更' },
    });
    assert.equal(denied.status, 403, denied.text);
    assert.equal(denied.json.error.code, 'CSRF');
    assert.match(denied.headers['cache-control'], /no-store/);
    assert.equal(app.db.prepare('SELECT count(*) AS n FROM accounts').get().n, count);
  }
  assert.throws(() => checkCsrf({ headers: { origin: ORIGIN, 'x-csrf-token': 'é'.repeat(64) } }, { kind: 'session', token: '0'.repeat(64) }, ORIGIN), error => error.status === 403 && error.code === 'CSRF');

  const accepted = await app.request('/api/v1/accounts', {
    method: 'POST', cookie, csrf: login.json.data.csrfToken,
    body: { platform: 'other', name: '有效 CSRF 的变更' },
  });
  assert.equal(accepted.status, 201, accepted.text);
});
