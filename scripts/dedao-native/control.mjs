import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID, createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {nativeCall, recordActualCurrentTurn} from './client.mjs';
import {readSecret, writeSecret} from './vault.mjs';
import {stateDirectory, validateBinding} from './runtime.mjs';
import {readPrivateJsonLine} from './read-private-input.mjs';

const aliases = {officialobs: 'native_lifecycle_observation', safeboundary: 'safe_boundary', begin: 'begin_dedao_action', confirm: 'confirm_dedao_action', progress: 'record_dedao_progress', download: 'record_dedao_download', finalize: 'finalize_dedao_word_upload', submit: 'submit_dedao_item', pause: 'pause_dedao_batch'};
const supported = new Set(['bind', 'refresh', 'read', 'claim', 'heartbeat', 'safe_boundary', 'native_lifecycle_observation', 'begin_dedao_action', 'confirm_dedao_action', 'record_dedao_progress', 'record_dedao_download', 'upload_dedao_word_chunk', 'finalize_dedao_word_upload', 'submit_dedao_item', 'pause_dedao_batch', 'uploadfile']);
const actionOperations = new Set(['heartbeat', 'begin_dedao_action', 'confirm_dedao_action', 'record_dedao_progress', 'record_dedao_download', 'upload_dedao_word_chunk', 'finalize_dedao_word_upload', 'submit_dedao_item', 'pause_dedao_batch', 'uploadfile']);
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function publicResult(value) {
  if (Array.isArray(value)) return value.map(publicResult);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !/credential|token|authorization|base64|ciphertext|claim_hash/i.test(key)).map(([key, item]) => [key, publicResult(item)]));
  return value;
}
export function publicDiagnostic(error) {
  const input = error?.nativeDiagnostic;
  const categories = new Set(['timeout', 'transport_unknown', 'http_rejected', 'response_unreadable', 'application_rejected', 'preflight_rejected']);
  return {
    category: categories.has(input?.category) ? input.category : 'preflight_rejected',
    status: Number.isInteger(input?.status) && input.status >= 100 && input.status <= 599 ? input.status : null,
    elapsed_ms: Number.isFinite(input?.elapsed_ms) && input.elapsed_ms >= 0 ? Math.round(input.elapsed_ms) : null,
    content_type: ['application/json', 'application/problem+json', 'text/html', 'text/plain', 'application/octet-stream'].includes(input?.content_type) ? input.content_type : null,
  };
}
async function main() {
  const input = await readPrivateJsonLine();
  const actual = validateBinding({thread_id: input.thread_id, session_id: input.session_id, turn_id: input.turn_id, executor_id: `native-codex:${input.thread_id}`});
  const folder = stateDirectory(actual.thread_id);
  await recordActualCurrentTurn(folder, actual);
  const operation = aliases[input.operation] || input.operation;
  if (!supported.has(operation)) throw Error('Unsupported native API operation');
  const args = {...input.args};
  if ('claim_token' in args || 'credential' in args || 'execution_id' in args || 'executor_id' in args) throw Error('Private execution identity is injected locally');
  const call = (name, values) => nativeCall(folder, name, values);
  let execution, file;
  if (operation === 'claim' || actionOperations.has(operation)) {
    if (!uuid.test(args.batch_id || '')) throw Error('Exact batch ID is required');
    file = path.join(folder, 'executions', `${args.batch_id}.vault.json`);
    try { execution = await readSecret(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (operation === 'claim') {
      if (!execution || execution.turn_id !== actual.turn_id || execution.queue_revision !== args.queue_revision) {
        if (execution) {
          const view = await call('read', {batch_id: args.batch_id});
          if (view.batch?.state !== 'queued' || view.batch.queue_revision !== args.queue_revision || view.batch.native?.safe_boundary !== true) throw Error('Original execution must be reconciled before a new claim');
        }
        execution = {...actual, batch_id: args.batch_id, execution_id: `native-turn:${actual.turn_id}`, queue_revision: args.queue_revision, claim_token: randomUUID()};
        // The original private token is durable before any claim request. An
        // unknown result reuses it, never allocates a second execution.
        await writeSecret(file, execution);
      }
    } else if (!execution || execution.thread_id !== actual.thread_id || execution.session_id !== actual.session_id || execution.turn_id !== actual.turn_id) throw Error('No matching protected claim for this actual turn');
    Object.assign(args, {claim_token: execution.claim_token, execution_id: execution.execution_id});
  }
  let result;
  if (operation === 'uploadfile') {
    const filename = input.filepath;
    if (typeof filename !== 'string' || !path.isAbsolute(filename)) throw Error('Original Word absolute filepath is required');
    const bytes = await fs.readFile(filename);
    const view = await call('read', {batch_id: args.batch_id});
    const item = view.batch?.current;
    const download = item?.download;
    const sha = createHash('sha256').update(bytes).digest('hex');
    // The exact expected identity is supplied from the recorded download and
    // independently compared to current original bytes before transfer.
    const expected = download;
    if (!expected || expected.sha256 !== sha || expected.size !== bytes.length || path.resolve(expected.path) !== path.resolve(filename) || expected.filename !== path.basename(filename)) throw Error('Original Word bytes/path do not match the recorded download');
    if (args.ordinal !== view.batch.current_ordinal) throw Error('Upload ordinal does not match current article');
    let lastHeartbeat = Date.now();
    for (let offset = 0; offset < bytes.length; offset += 48000) {
      if (Date.now() - lastHeartbeat > 60000) { await call('heartbeat', args); lastHeartbeat = Date.now(); }
      result = await call('upload_dedao_word_chunk', {...args, offset, base64: bytes.subarray(offset, offset + 48000).toString('base64')});
      if (result.stored !== true) throw Error('Word chunk has no actual stored receipt');
    }
    result = {uploaded_original_bytes: bytes.length, sha256: sha, batch_id: args.batch_id, ordinal: args.ordinal, result};
  } else result = await call(operation, args);
  process.stdout.write(JSON.stringify(publicResult(result)) + '\n');
}
export async function runNativeControl() {
  try { await main(); } catch (error) {
    process.stdout.write(JSON.stringify({ok: false, result_unknown_or_rejected: true, diagnostic: publicDiagnostic(error), message: '本机 API 结果尚未确认或身份/文件不符；保留原批次与认领凭据，先读取真实记录，勿重放浏览器动作。'}) + '\n');
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await runNativeControl();
