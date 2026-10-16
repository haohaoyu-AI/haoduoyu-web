// Isolated feasibility probe, never a deployable application.
// The harness supplies an ephemeral D1 binding; there is no Sites manifest.
import { randomBytes, randomUUID, pbkdf2Sync } from 'node:crypto';
import { hashPassword, verifyPassword, digest, csrfFor } from '../src/auth.mjs';

const fail = (status, code) => Object.assign(new Error(code), { status, code });
const q = (db, sql, ...args) => db.prepare(sql).bind(...args);
const stamp = () => new Date().toISOString();
const dummy = 'scrypt$32768$8$1$00112233445566778899aabbccddeeff$' + '00'.repeat(64);
const stable = v => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
const audit = (db, actor, action, id) => q(db,
  'INSERT INTO matrix_audit VALUES(?,?,?,?,?,?)', randomUUID(), actor, action, id, '{}', stamp());
// A zero-row CAS is not a SQL error. This CHECK converts it into a batch rollback.
const guard = db => q(db, 'INSERT INTO matrix_probe_guards VALUES(?,changes())', randomUUID());
const cookie = token => `matrix_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${token ? 604800 : 0}`;

async function session(db, request) {
  const token = /(?:^|;\s*)matrix_session=([a-f0-9]{64})(?:;|$)/.exec(request.headers.get('cookie') || '')?.[1];
  if (!token) throw fail(401, 'UNAUTHORIZED');
  const user = await q(db, 'SELECT u.id,u.username FROM matrix_sessions s JOIN matrix_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?', digest(token), stamp()).first();
  if (!user) throw fail(401, 'UNAUTHORIZED');
  return { ...user, token, actor: 'user:' + user.id };
}
function originCheck(request, env) {
  if (request.headers.get('origin') !== env.SITE_ORIGIN) throw fail(403, 'CSRF');
}
function csrfCheck(request, env, actor) {
  originCheck(request, env);
  if (request.headers.get('x-csrf-token') !== csrfFor(actor.token)) throw fail(403, 'CSRF');
}
async function loginProof(db, user, proof) {
  const token = randomBytes(32).toString('hex');
  try {
    await db.batch([
      q(db, 'INSERT INTO matrix_sessions(token_hash,user_id,expires_at) SELECT ?,id,? FROM matrix_users WHERE id=? AND password_hash=?', digest(token), new Date(Date.now()+604800000).toISOString(), user.id, proof),
      guard(db), audit(db, 'user:' + user.id, 'auth.login', user.id),
    ]);
  } catch (e) {
    if (String(e).includes('CHECK constraint failed')) throw fail(401, 'STALE_PASSWORD_PROOF');
    throw e;
  }
  return token;
}

async function handle(request, env) {
  // Deliberately requires a harness-only flag and a synthetic hostname.
  const url = new URL(request.url);
  if (env.SYNTHETIC_ONLY !== 'yes' || url.hostname !== 'matrix-probe.invalid') return new Response('Probe disabled', { status: 503 });
  const db = env.MATRIX_PROBE_DB;
  if (url.pathname === '/health') return Response.json({ data: { status: 'ok', synthetic: true } });
  if (url.pathname === '/__probe/crypto') {
    const input = await request.json();
    const started = performance.now();
    const workerHash = await hashPassword(input.password);
    const hashMs = performance.now() - started;
    const verifyStart = performance.now();
    const correct = await verifyPassword(input.password, input.nodeHash);
    const verifyMs = performance.now() - verifyStart;
    const incorrect = await verifyPassword(input.password + 'wrong', input.nodeHash);
    const pbkdf2 = [];
    for (const iterations of [100000, 600000]) {
      const start = performance.now();
      try {
        const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(input.password), 'PBKDF2', false, ['deriveBits']);
        const bits = await crypto.subtle.deriveBits({ name:'PBKDF2', hash:'SHA-256', salt:new Uint8Array(16), iterations }, key, 256);
        pbkdf2.push({ iterations, supported:true, bytes:bits.byteLength, elapsedMs:performance.now()-start });
      } catch(e) { pbkdf2.push({ iterations, supported:false, error:e.message }); }
    }
    let nodePbkdf2;
    try { nodePbkdf2 = { supported:true, bytes:pbkdf2Sync(input.password, 'synthetic-salt', 600000, 32, 'sha256').length }; }
    catch(e) { nodePbkdf2 = { supported:false, error:e.message }; }
    return Response.json({ correct, incorrect, workerHash, hashMs, verifyMs, pbkdf2, nodePbkdf2 });
  }
  if (url.pathname === '/__probe/login-proof') {
    const input = await request.json();
    const token = await loginProof(db, { id:input.id }, input.proof);
    return Response.json({ accepted:!!token });
  }
  if (url.pathname === '/api/v1/auth/login' && request.method === 'POST') {
    originCheck(request, env);
    const input = await request.json();
    const user = await q(db, 'SELECT * FROM matrix_users WHERE username=?', input.username).first();
    const valid = await verifyPassword(input.password, user?.password_hash || dummy);
    if (!user || !valid) throw fail(401, 'INVALID_CREDENTIALS');
    const token = await loginProof(db, user, user.password_hash);
    return Response.json({ data:{ username:user.username, csrfToken:csrfFor(token) } }, { headers:{ 'Set-Cookie':cookie(token) } });
  }
  const actor = await session(db, request);
  if (['POST','PUT','DELETE'].includes(request.method)) csrfCheck(request, env, actor);
  if (url.pathname === '/api/v1/auth/me') return Response.json({ data:{ username:actor.username, csrfToken:csrfFor(actor.token) } });
  if (url.pathname === '/api/v1/auth/logout') {
    await q(db, 'DELETE FROM matrix_sessions WHERE token_hash=?', digest(actor.token)).run();
    return Response.json({ data:{ logged_out:true } }, { headers:{ 'Set-Cookie':cookie('') } });
  }
  if (url.pathname === '/api/v1/auth/password' && request.method === 'PUT') {
    const input = await request.json();
    const user = await q(db, 'SELECT password_hash FROM matrix_users WHERE id=?', actor.id).first();
    if (!await verifyPassword(input.currentPassword, user.password_hash)) throw fail(403, 'INVALID_CREDENTIALS');
    const nextHash = await hashPassword(input.newPassword);
    try {
      await db.batch([
        q(db, 'UPDATE matrix_users SET password_hash=? WHERE id=? AND password_hash=? AND EXISTS(SELECT 1 FROM matrix_sessions WHERE token_hash=? AND expires_at>?)', nextHash, actor.id, user.password_hash, digest(actor.token), stamp()),
        guard(db), q(db, 'DELETE FROM matrix_sessions WHERE user_id=?', actor.id), audit(db, actor.actor, 'auth.password_changed', actor.id),
      ]);
    } catch(e) {
      if (String(e).includes('CHECK constraint failed')) throw fail(409, 'CONFLICT');
      throw e;
    }
    return Response.json({ data:{ changed:true } }, { headers:{ 'Set-Cookie':cookie('') } });
  }
  if (url.pathname === '/api/v1/articles' && request.method === 'POST') {
    const input = await request.json(), key = request.headers.get('idempotency-key');
    if (!key) throw fail(400, 'PROBE_REQUIRES_IDEMPOTENCY_KEY');
    const requestHash = digest(request.method + ':' + url.pathname + ':' + JSON.stringify(stable(input)));
    const id = randomUUID(), now = stamp();
    const result = { id, title:input.title, version:1 };
    try {
      await db.batch([
        q(db, 'INSERT INTO matrix_idempotency VALUES(?,?,?,?,?,?)', actor.actor, key, requestHash, JSON.stringify(result), 201, now),
        q(db, 'INSERT INTO matrix_articles(id,account_id,title,url,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)', id, input.account_id, input.title, input.url, now, now, now),
        audit(db, actor.actor, 'article.created', id),
      ]);
    } catch(e) {
      // No preflight read; only replay a committed winner after a failed atomic batch.
      const saved = await q(db, 'SELECT * FROM matrix_idempotency WHERE actor=? AND key=?', actor.actor, key).first();
      if (saved) {
        if (saved.request_hash !== requestHash) throw fail(409, 'IDEMPOTENCY_CONFLICT');
        return Response.json({ data:JSON.parse(saved.response_json) }, { status:saved.status });
      }
      if (String(e).includes('constraint failed')) throw fail(409, 'CONSTRAINT');
      throw e;
    }
    return Response.json({ data:result }, { status:201 });
  }
  return new Response('Unknown probe route', { status:404 });
}
export default {
  async fetch(request, env) {
    let response;
    try { response = await handle(request, env); }
    catch(e) { response = Response.json({ error:{ code:e.code || 'PROBE_ERROR', message:e.message } }, { status:e.status || 500 }); }
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    return response;
  },
};
