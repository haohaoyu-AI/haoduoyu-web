import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export const digest = value => createHash('sha256').update(value).digest('hex');
export const csrfFor = token => digest('matrix-csrf:' + token);
export const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const options = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256)
    throw fail(400, 'INVALID_PASSWORD', '密码需要 12 至 256 个字符');
}
export async function hashPassword(password) {
  validatePassword(password);
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64, options);
  return 'scrypt$32768$8$1$' + salt + '$' + hash.toString('hex');
}
export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 256) return false;
  const parts = String(encoded).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const hash = await scrypt(password, parts[4], 64, options);
  const expected = Buffer.from(parts[5], 'hex');
  return expected.length === hash.length && timingSafeEqual(hash, expected);
}
export async function createUser(db, username, password) {
  if (typeof username !== 'string' || !/^[a-zA-Z0-9_.@-]{3,80}$/.test(username))
    throw fail(400, 'INVALID_USERNAME', '账号需要 3 至 80 个字母、数字或 . _ @ -');
  const passwordHash = await hashPassword(password);
  const id = randomUUID();
  db.prepare('INSERT INTO users(id,username,password_hash,created_at) VALUES(?,?,?,?)')
    .run(id, username, passwordHash, new Date().toISOString());
  return { id, username };
}
export function sessionCookie(req) {
  const pairs = (req.headers.cookie || '').split(';').map(v => v.trim());
  const raw = pairs.find(v => v.startsWith('matrix_session='))?.slice(15);
  return raw && /^[a-f0-9]{64}$/.test(raw) ? raw : null;
}
export function authenticate(db, req) {
  const authorization = req.headers.authorization;
  if (authorization) {
    const match = /^Bearer (hdy_[a-f0-9]{64})$/.exec(authorization);
    if (!match) throw fail(401, 'UNAUTHORIZED', '授权凭证无效');
    const row = db.prepare('SELECT * FROM api_keys WHERE token_hash=? AND revoked_at IS NULL').get(digest(match[1]));
    if (!row) throw fail(401, 'UNAUTHORIZED', '授权凭证无效或已撤销');
    db.prepare('UPDATE api_keys SET last_used_at=? WHERE id=?').run(new Date().toISOString(), row.id);
    return { actor: 'key:' + row.id, kind: 'key', scope: JSON.parse(row.account_ids_json), permissions: JSON.parse(row.permissions_json) };
  }
  const token = sessionCookie(req);
  if (token) {
    const row = db.prepare('SELECT u.id,u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?')
      .get(digest(token), new Date().toISOString());
    if (row) return { actor: 'user:' + row.id, kind: 'session', scope: null, permissions: ['read','write'], ...row, token };
  }
  throw fail(401, 'UNAUTHORIZED', '请先登录');
}
export function createSession(db, userId) {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 7 * 86400000).toISOString();
  db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(new Date().toISOString());
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(digest(token), userId, expires);
  return token;
}
export function audit(db, actor, action, id = null, detail = {}) {
  db.prepare('INSERT INTO audit(id,actor,action,entity_id,detail_json,created_at) VALUES(?,?,?,?,?,?)')
    .run(randomUUID(), actor, action, id, JSON.stringify(detail), new Date().toISOString());
}
export function checkOrigin(req, origin) {
  if (req.headers.origin !== origin) throw fail(403, 'CSRF', '请求来源校验失败，请刷新后重试');
}
export function checkCsrf(req, actor, origin) {
  if (actor.kind !== 'session') return;
  checkOrigin(req, origin);
  const received = req.headers['x-csrf-token'];
  const expected = csrfFor(actor.token);
  if (typeof received !== 'string' || !/^[a-f0-9]{64}$/.test(received) ||
      !timingSafeEqual(Buffer.from(received), Buffer.from(expected)))
    throw fail(403, 'CSRF', '安全校验已失效，请刷新后重试');
}
