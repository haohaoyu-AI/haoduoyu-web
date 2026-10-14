import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash, randomUUID} from 'node:crypto';

export const lifecycleEvents = new Set(['Stop', 'Interrupt', 'SessionEnd', 'UserPromptSubmit']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const defaultStateRoot = () => path.join(os.homedir(), '.haoduoyu-dedao-native');
export function stateDirectory(threadId) {
  if (!uuid.test(threadId || '')) throw Error('Native thread identity is missing');
  return path.join(defaultStateRoot(), threadId);
}
export function validateEndpoint(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !['haoduoyu.xyz', 'xiaoyu-event-test.haohaoyu202409.chatgpt.site'].includes(url.hostname) || url.pathname !== '/api/dedao/native' || url.port || url.username || url.password || url.search || url.hash) throw Error('Native bridge endpoint is not approved');
  return url.href;
}
export function validateBinding(value) {
  if (!value || !uuid.test(value.thread_id || '') || value.session_id !== value.thread_id || value.executor_id !== `native-codex:${value.thread_id}` || !uuid.test(value.turn_id || '')) throw Error('Native bridge identity does not match a real bound thread');
  return {thread_id: value.thread_id, session_id: value.session_id, executor_id: value.executor_id, turn_id: value.turn_id};
}
export async function atomicJson(file, data) {
  await fs.mkdir(path.dirname(file), {recursive: true, mode: 0o700});
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await fs.open(temporary, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(data)); await handle.sync(); } finally { await handle.close(); }
  await fs.rename(temporary, file);
}
export async function readJson(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }
export function normalizeHook(input, binding, {eventId = randomUUID(), now = new Date()} = {}) {
  const identity = validateBinding(binding);
  if (!input || !lifecycleEvents.has(input.hook_event_name) || input.session_id !== identity.session_id || input.agent_id) throw Error('Hook event does not belong to this native main thread');
  const turnId = input.turn_id || (input.hook_event_name === 'SessionEnd' ? identity.turn_id : null);
  if (!uuid.test(turnId || '') || !uuid.test(eventId)) throw Error('Real native turn identity is missing');
  // SessionEnd has no turn_id in the supported schema. Its association is the
  // last actual turn observed through bind/UserPromptSubmit, never a generated id.
  return {event: input.hook_event_name, event_id: eventId, session_id: identity.session_id, thread_id: identity.thread_id, turn_id: turnId, observed_at: now.toISOString(), source: 'hook'};
}
export async function queueHook(folder, input) {
  const binding = await readJson(path.join(folder, 'binding.json'));
  const event = normalizeHook(input, binding);
  const file = path.join(folder, 'outbox', `${event.event_id}.json`);
  await atomicJson(file, {version: 1, operation: 'lifecycle', args: event});
  if (event.event === 'UserPromptSubmit') await atomicJson(path.join(folder, 'binding.json'), {...validateBinding(binding), turn_id: event.turn_id});
  return event;
}
async function lockOutbox(folder) {
  const file = path.join(folder, 'flush.lock');
  for (let attempt = 0; attempt < 2; attempt++) try {
    const handle = await fs.open(file, 'wx', 0o600);
    await handle.writeFile(JSON.stringify({pid: process.pid, created_at: new Date().toISOString()}));
    await handle.close();
    return async () => { await fs.unlink(file); };
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    // This is a receipt transmitter lock, never a Codex executor lock. Its dead
    // process permits only resending the same persisted lifecycle event.
    const original = await fs.readFile(file, 'utf8');
    let owner; try { owner = JSON.parse(original); } catch { throw Error('Native outbox owner is unknown; preserve pending events'); }
    if (!Number.isInteger(owner.pid) || owner.pid < 1) throw Error('Native outbox owner is unknown; preserve pending events');
    try { process.kill(owner.pid, 0); throw Error('Native outbox is already held; preserve pending events'); } catch (probe) { if (probe.code !== 'ESRCH') throw probe; }
    if (await fs.readFile(file, 'utf8') !== original) throw Error('Native outbox owner changed; preserve pending events');
    await fs.unlink(file);
  }
  throw Error('Native outbox lock could not be acquired');
}
export async function callNative(secret, operation, args, {fetchImpl = fetch, timeoutMs = 10000} = {}) {
  validateBinding(secret);
  const endpoint = validateEndpoint(secret.endpoint);
  if (typeof secret.credential !== 'string' || secret.credential.length < 16 || !Number.isFinite(Date.parse(secret.expires_at)) || Date.parse(secret.expires_at) <= Date.now()) throw Error('Native bridge credential is expired; reconnect through the authorized MCP');
  let response;
  try {
    const headers = {'Content-Type': 'application/json', Authorization: `Bearer ${secret.credential}`};
    if (typeof secret.siwc_bypass_bearer_token === 'string' && secret.siwc_bypass_bearer_token.length) headers['OAI-Sites-Authorization'] = `Bearer ${secret.siwc_bypass_bearer_token}`;
    response = await fetchImpl(endpoint, {method: 'POST', redirect: 'error', headers, body: JSON.stringify({operation, args}), signal: AbortSignal.timeout(timeoutMs)});
  } catch { throw Error('Native bridge result is unknown; keep the same event receipt'); }
  if (!response.ok) throw Error(`Native bridge did not acknowledge the event (HTTP ${response.status})`);
  let result;
  try { result = await response.json(); } catch { throw Error('Native bridge receipt is unreadable; keep the same event'); }
  if (result?.error || result?.ok === false || result?.isError === true) throw Error('Native bridge did not accept this event; inspect its server record');
  return result;
}
export async function flushPending(folder, {readSecret, fetchImpl, timeoutMs, maximum = 1} = {}) {
  const release = await lockOutbox(folder);
  try {
    const secret = await readSecret(path.join(folder, 'vault.json'));
    const binding = validateBinding(await readJson(path.join(folder, 'binding.json')));
    const original = validateBinding(secret);
    if (original.thread_id !== binding.thread_id) throw Error('Local native identity changed; inspect the original binding');
    let names;
    try { names = (await fs.readdir(path.join(folder, 'outbox'))).filter(name => uuid.test(name.replace(/\.json$/, '')) && name.endsWith('.json')); } catch (error) { if (error.code === 'ENOENT') return {acknowledged: 0}; throw error; }
    const records = await Promise.all(names.map(async name => ({name, record: await readJson(path.join(folder, 'outbox', name))})));
    records.sort((a, b) => String(a.record.args.observed_at).localeCompare(String(b.record.args.observed_at)) || a.name.localeCompare(b.name));
    let acknowledged = 0;
    for (const {name, record} of records.slice(0, maximum)) {
      const e = record.args;
      if (record.operation !== 'lifecycle' || e.source !== 'hook' || e.session_id !== binding.session_id || e.thread_id !== binding.thread_id || !lifecycleEvents.has(e.event) || !uuid.test(e.event_id) || name !== `${e.event_id}.json` || !uuid.test(e.turn_id)) throw Error('Pending native event identity is invalid; preserve it for inspection');
      const result = await callNative(secret, 'lifecycle', e, {fetchImpl, timeoutMs});
      if (result.event_id && result.event_id !== e.event_id) throw Error('Native event receipt belongs to a different event');
      // Store only the receipt identity, never server response text or secrets.
      await atomicJson(path.join(folder, 'receipts', name), {event_id: e.event_id, event: e.event, turn_id: e.turn_id, acknowledged_at: new Date().toISOString()});
      await fs.unlink(path.join(folder, 'outbox', name));
      acknowledged++;
    }
    return {acknowledged};
  } finally { await release(); }
}
export const configSha256 = text => createHash('sha256').update(text).digest('hex');
