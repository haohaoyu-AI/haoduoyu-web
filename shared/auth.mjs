import { fail } from '../src/lib/errors.mjs';
export { fail } from '../src/lib/errors.mjs';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export const digest = value => createHash('sha256').update(value).digest('hex');
export const csrfFor = token => digest('matrix-csrf:' + token);
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
