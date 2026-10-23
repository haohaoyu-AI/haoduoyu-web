import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, request } from 'node:http';
import { openDatabase } from '../src/db.mjs';
import { digest } from '../src/auth.mjs';
import { createApplication } from '../src/server.mjs';

const origin = 'https://matrix.example.test';
async function fixture(t, trustedProxies) {
  const db = openDatabase(':memory:');
  const app = createApplication({ db, origin, trustedProxies });
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  // A real HTTP forwarding hop. localAddress models two clients without
  // accepting a client-supplied header as the proxy's source of truth.
  const proxy = createServer((incoming, outgoing) => {
    const upstream = request({
      hostname: '127.0.0.1', port: app.address().port, path: incoming.url, method: incoming.method,
      headers: { ...incoming.headers, 'x-forwarded-for': incoming.socket.remoteAddress },
    }, response => {
      outgoing.writeHead(response.statusCode, response.headers);
      response.pipe(outgoing);
    });
    upstream.on('error', () => { outgoing.writeHead(502); outgoing.end(); });
    incoming.pipe(upstream);
  });
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  t.after(async () => {
    for (const server of [proxy, app]) {
      await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    }
    db.close();
  });
  function login({ throughProxy = true, client = '127.0.0.2', forwarded, username = 'missing' } = {}) {
    return new Promise((resolve, reject) => {
      const headers = { origin, 'content-type': 'application/json' };
      if (forwarded !== undefined) headers['x-forwarded-for'] = forwarded;
      const req = request({
        hostname: '127.0.0.1', localAddress: client,
        port: (throughProxy ? proxy : app).address().port,
        path: '/api/v1/auth/login', method: 'POST', headers,
      }, response => {
        response.resume();
        response.on('end', () => resolve({ status: response.statusCode, headers: response.headers }));
      });
      req.on('error', reject);
      req.end(JSON.stringify({ username, password: 'Synthetic-invalid-password' }));
    });
  }
  function limit(ip, username = 'missing', attempts = 10, age = 0) {
    const bucket = username === null ? 'ip:' + digest(ip) : digest(ip + ':' + username);
    db.prepare('INSERT INTO login_attempts VALUES(?,?,?)').run(bucket, attempts, Date.now() - age);
  }
  return { db, login, limit };
}

test('a trusted HTTP proxy keeps per-user and aggregate login limits isolated by client IP', async t => {
  const app = await fixture(t, '127.0.0.1');
  app.limit('127.0.0.2');
  const limited = await app.login();
  assert.equal(limited.status, 429);
  assert.equal(limited.headers['retry-after'], '900');
  assert.equal((await app.login({ client: '127.0.0.3' })).status, 401);
  app.limit('127.0.0.4', null, 100);
  assert.equal((await app.login({ client: '127.0.0.4', username: 'another' })).status, 429);
  assert.equal((await app.login({ client: '127.0.0.5', username: 'another' })).status, 401);
});

test('ten actual failed logins through one proxy throttle only that client and username', async t => {
  const app = await fixture(t, '127.0.0.1');
  for (let attempt = 0; attempt < 10; attempt++) assert.equal((await app.login()).status, 401);
  assert.equal((await app.login()).status, 429);
  assert.equal((await app.login({ client: '127.0.0.3' })).status, 401);
  assert.equal((await app.login({ username: 'different' })).status, 401);
});

test('forwarded headers are ignored by default and from any untrusted socket peer', async t => {
  for (const trusted of [undefined, '127.0.0.1']) {
    const app = await fixture(t, trusted);
    app.limit('127.0.0.2');
    for (const forwarded of ['198.51.100.1', '198.51.100.2']) {
      assert.equal((await app.login({ throughProxy: false, forwarded })).status, 429);
    }
  }
});

test('forwarding chains stop at the nearest untrusted hop and canonicalize IP spellings', async t => {
  const app = await fixture(t, '127.0.0.0/8,2001:db8:1234::/48');
  app.limit('198.51.100.8');
  assert.equal((await app.login({ throughProxy: false, forwarded: '203.0.113.9, 198.51.100.8, 2001:db8:1234::1' })).status, 429);
  app.limit('2001:db8::1');
  assert.equal((await app.login({ throughProxy: false, forwarded: '2001:0db8:0:0:0:0:0:1' })).status, 429);
  app.limit('192.0.2.8');
  assert.equal((await app.login({ throughProxy: false, forwarded: '::ffff:192.0.2.8' })).status, 429);
});

test('malformed forwarding chains cannot supply a different rate-limit identity', async t => {
  const app = await fixture(t, '127.0.0.1');
  for (const forwarded of ['unknown', '198.51.100.1, unknown', '198.51.100.1,,127.0.0.1', '[2001:db8::1]:1234', Array(34).fill('127.0.0.1').join(',')]) {
    assert.equal((await app.login({ client: '127.0.0.1', throughProxy: false, forwarded })).status, 400);
  }
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM login_attempts').get().n, 0);
});

test('expired client buckets are cleared without disabling the next window', async t => {
  const app = await fixture(t, '127.0.0.1');
  app.limit('127.0.0.2', 'missing', 10, 901000);
  app.limit('127.0.0.2', null, 100, 901000);
  assert.equal((await app.login()).status, 401);
  assert.equal(app.db.prepare('SELECT attempts FROM login_attempts WHERE bucket=?').get('ip:' + digest('127.0.0.2')).attempts, 1);
});

test('unsafe or invalid trusted proxy configuration fails at startup', () => {
  const db = openDatabase(':memory:');
  try {
    for (const trustedProxies of ['*', 'true', '0.0.0.0/0', '::/0', 'localhost', '127.0.0.1/33', '2001:db8::/129', '127.0.0.1,', '127.0.0.1/abc']) {
      assert.throws(() => createApplication({ db, origin, trustedProxies }), /TRUSTED_PROXIES/);
    }
  } finally { db.close(); }
});
