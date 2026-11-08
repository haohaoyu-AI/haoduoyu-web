// Standalone storage only. This namespace is deliberately unrelated to website caches.
export const LOCAL_DATABASE_NAME = 'haoduoyu-standalone-local-v1';
export const LOCAL_OWNER_ID = '00000000-0000-4000-8000-000000000001';
export const LOCAL_SCOPE = 'local:v1:' + LOCAL_OWNER_ID;
export const fail = (status, code, message) => Object.assign(new Error(message), {status, code, localNotSaved: true});
export const invalid = (message = '本机请求字段无效，未保存。') => fail(400, 'VALIDATION_ERROR', message);
export const unsupported = () => fail(501, 'LOCAL_NOT_IMPLEMENTED', '此功能尚未实现本机操作，未访问网站或更改数据。');
export const clone = value => structuredClone(value);
export function idOf(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)) throw invalid('记录标识必须为有效 UUID。');
  return value.toLowerCase();
}
export function versionOf(value, minimum = 1) {
  if (!Number.isSafeInteger(value) || value < minimum || value >= Number.MAX_SAFE_INTEGER) throw invalid('记录版本无效。');
  return value;
}
export function dateOf(value) {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) throw invalid('日期无效。');
  const date = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw invalid('日期无效。');
  return value;
}
export const beijingDay = at => new Date(at + 8 * 3600000).toISOString().slice(0, 10);
export function plain(value) {
  return typeof value === 'string' && value.isWellFormed() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
}
export function textOf(value, max = 500) {
  if (!plain(value) || !value.trim() || value.length > max) throw invalid('内容须为 1–' + max + ' 个字符。');
  return value.trim();
}
export function bodyText(value) {
  if (!plain(value)) throw invalid('正文必须是有效纯文字。');
  const text = value.replace(/\r\n?/g, '\n');
  if (new TextEncoder().encode(text).length > 65536) throw fail(413, 'TEXT_TOO_LARGE', '正文最多 64 KiB，未保存。');
  return text;
}
export function exact(body, names) {
  if (!body || Object.getPrototypeOf(body) !== Object.prototype || Object.keys(body).sort().join(',') !== [...names].sort().join(',')) throw invalid();
}
export function queryOnly(query, names = []) {
  if ([...query.keys()].some(key => !names.includes(key) || query.getAll(key).length !== 1)) throw invalid('查询参数无效。');
}
export function currentVersion(row, version, {allowMissing = false, allowDeleted = false} = {}) {
  if (!row && !allowMissing) throw fail(404, 'NOT_FOUND', '本机记录不存在。');
  if ((row?.version || 0) !== version) throw fail(409, 'VERSION_CONFLICT', '本机记录已有新版本，请重新读取，草稿仍保留。');
  if (row?.deleted_at && !allowDeleted) throw fail(409, 'RECORD_DELETED', '记录已移入回收站，请先恢复。');
}
export const canonical = value => JSON.stringify(sortData(value));
function sortData(value) {
  if (Array.isArray(value)) return value.map(sortData);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortData(value[key])]));
  return value;
}
export async function digest(value) {
  const bytes = new TextEncoder().encode(canonical(value));
  const result = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(result)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export const byCreated = (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
