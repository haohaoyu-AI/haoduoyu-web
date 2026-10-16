import path from 'node:path';
import {readJson, validateBinding, callNative, atomicJson, configSha256} from './runtime.mjs';
import {readSecret, writeSecret} from './vault.mjs';

// Import this module into the actual native executor. Results (including claim
// tokens) remain in memory; this module never writes them to console or disk.
// Browser mutations still require Computer Use and the site's persisted intents.
export async function nativeCall(folder, operation, args = {}, options = {}) {
  if (operation === 'lifecycle') throw Error('Lifecycle observations must come from the actual hook entry point');
  const load = options.readSecret || readSecret;
  const secret = await load(path.join(folder, 'vault.json'));
  const binding = validateBinding(await readJson(path.join(folder, 'binding.json')));
  if (validateBinding(secret).thread_id !== binding.thread_id) throw Error('Native vault and current binding disagree');
  for (const key of ['thread_id', 'session_id', 'turn_id']) if (args[key] && args[key] !== binding[key]) throw Error('Native operation identity does not match the current observed turn');
  let request = {...args, thread_id: binding.thread_id, session_id: binding.session_id, turn_id: binding.turn_id};
  let observationFile;
  if (operation === 'native_lifecycle_observation') {
    request = normalizeAppObservation(request);
    observationFile = path.join(folder, 'observations', `${request.event_id}.json`);
    const payloadHash = configSha256(JSON.stringify(request));
    try { const original = await readJson(observationFile); if (original.payload_sha256 !== payloadHash) throw Error('Do not change the same native observation receipt'); } catch (error) { if (error.code !== 'ENOENT') throw error; await atomicJson(observationFile, {operation, args: request, payload_sha256: payloadHash, acknowledged: false}); }
  }
  const timeoutMs = options.timeoutMs ?? (['finalize_dedao_word_upload', 'submit_dedao_item'].includes(operation) ? 30000 : 10000);
  const started = Date.now();
  let status = null, contentType = null, transportFailure = null;
  const fetchImpl = async (...values) => {
    try {
      const response = await (options.fetchImpl || fetch)(...values);
      status = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? response.status : null;
      const rawType = response.headers?.get?.('content-type');
      // Keep only the MIME type, not arbitrary server header text or parameters.
      const mime = typeof rawType === 'string' ? rawType.split(';', 1)[0].trim().toLowerCase() : null;
      contentType = ['application/json', 'application/problem+json', 'text/html', 'text/plain', 'application/octet-stream'].includes(mime) ? mime : null;
      return response;
    } catch (error) { transportFailure = ['TimeoutError', 'AbortError'].includes(error?.name) ? 'timeout' : 'transport_unknown'; throw error; }
  };
  let result;
  try { result = await callNative(secret, operation, request, {...options, timeoutMs, fetchImpl}); }
  catch (error) {
    const category = transportFailure || (status !== null && status >= 400 ? 'http_rejected' : /receipt is unreadable/.test(error.message) ? 'response_unreadable' : /did not accept/.test(error.message) ? 'application_rejected' : 'preflight_rejected');
    error.nativeDiagnostic = {category, status, elapsed_ms: Math.max(0, Date.now() - started), content_type: contentType};
    throw error;
  }
  if (observationFile) {
    if (result.recorded !== true) throw Error('Native observation has no actual server receipt; preserve the same event');
    const original = await readJson(observationFile);
    await atomicJson(observationFile, {...original, acknowledged: true, applied: result.applied === true, acknowledged_at: new Date().toISOString()});
  }
  if ((operation === 'refresh' && result.refreshed === true || operation === 'bind' && result.bound === true) && Number.isFinite(Date.parse(result.expires_at)) && Date.parse(result.expires_at) > Date.now()) {
    const save = options.writeSecret || writeSecret;
    await save(path.join(folder, 'vault.json'), {...secret, ...binding, expires_at: result.expires_at});
    // Refresh does not claim, activate, resume, or acknowledge a safe boundary.
  }
  return result;
}
function normalizeAppObservation(args) {
  const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  const keys = new Set(['source', 'event_id', 'state', 'observed_at', 'observation_ref', 'previous_turn', 'thread_id', 'session_id', 'turn_id']);
  if (args.source !== 'codex_app_tools' || !uuid.test(args.event_id || '') || !['active', 'completed', 'interrupted', 'idle', 'ended'].includes(args.state) || Object.keys(args).some(key => !keys.has(key))) throw Error('Native observation arguments are invalid');
  const canonical = value => {
    if (typeof value.observed_at !== 'string' || !Number.isFinite(Date.parse(value.observed_at)) || typeof value.observation_ref !== 'string' || !value.observation_ref.length || value.observation_ref.length > 1000) throw Error('Actual native observation time/reference is required');
    return {...value, observed_at: new Date(value.observed_at).toISOString()};
  };
  const request = canonical(args);
  if (args.previous_turn) {
    const previous = args.previous_turn, priorKeys = new Set(['turn_id', 'state', 'observed_at', 'observation_ref']);
    if (!uuid.test(previous.turn_id || '') || !['completed', 'interrupted'].includes(previous.state) || Object.keys(previous).some(key => !priorKeys.has(key))) throw Error('Prior native turn needs actual completed/interrupted evidence');
    request.previous_turn = canonical(previous);
  }
  return request;
}
export async function recordActualCurrentTurn(folder, actualIdentity) {
  const original = validateBinding(await readJson(path.join(folder, 'binding.json')));
  const next = validateBinding({...original, ...actualIdentity});
  if (next.thread_id !== original.thread_id || next.session_id !== original.session_id) throw Error('Actual executor thread changed; keep its original binding');
  // Only call with runtime request metadata from the root native executor. This
  // records identity, never hooks_ready or a manufactured lifecycle event.
  await atomicJson(path.join(folder, 'binding.json'), next);
  return next;
}
