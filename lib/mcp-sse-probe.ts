/** Request-scoped transport diagnostic. No provider, DB, credentials or jobs. */
export const mcpSseProbeTool = {
 name: 'probe_mcp_sse_duration',
 title: 'Probe zero-fee MCP SSE duration',
 description: 'Only when the owner requests a transport-duration test: hold this authenticated MCP tools/call response open for 310–330 seconds, with ten-second SSE comment heartbeats and a final JSON-RPC result. No model/provider requests, business storage writes, editorial changes, background work or stream resumption. Progress notifications are emitted only for a progressToken actually supplied by this client. This does not test paid writing or grant permission to execute it.',
 inputSchema: {type: 'object', properties: {duration_seconds: {type: 'integer', minimum: 310, maximum: 330}}, required: ['duration_seconds'], additionalProperties: false},
 annotations: {readOnlyHint: true, destructiveHint: false, openWorldHint: false},
};

type ObjectValue = Record<string, unknown>;
type RequestId = string | number;
const supported = ['2026-07-28', '2025-03-26'];
const versionKey = 'io.modelcontextprotocol/protocolVersion';
const capabilitiesKey = 'io.modelcontextprotocol/clientCapabilities';
const object = (value: unknown): value is ObjectValue => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value: ObjectValue, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key));
const idValue = (value: unknown): value is RequestId => typeof value === 'string' || (typeof value === 'number' && Number.isSafeInteger(value));
const owns = (value: ObjectValue, key: string) => Object.prototype.hasOwnProperty.call(value, key);

function failure(id: unknown, code: number, message: string, status = 400, data?: unknown) {
 return Response.json({jsonrpc: '2.0', ...(idValue(id) ? {id} : {}), error: {code, message, ...(data === undefined ? {} : {data})}}, {status, headers: {'Cache-Control': 'no-store'}});
}
function accepts(request: Request, type: string) {
 return (request.headers.get('accept') || '').split(',').some(entry => {
  const [media, ...parameters] = entry.trim().toLowerCase().split(';');
  return media.trim() === type && !parameters.some(parameter => /^\s*q\s*=\s*0(?:\.0*)?\s*$/.test(parameter));
 });
}
function mirroredName(value: string | null) {
 if (value === null) return null;
 if (!value.startsWith('=?base64?')) return value;
 if (!/^=\?base64\?[A-Za-z0-9+/]*={0,2}\?=$/.test(value)) return null;
 try {
  const bytes = Uint8Array.from(atob(value.slice(9, -2)), character => character.charCodeAt(0));
  return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
 } catch {return null;}
}

/** Called only after app/mcp's existing platform-owned owner check. */
export function mcpSseProbeResponse(request: Request, envelope: unknown): Response {
 if (!object(envelope) || !exactKeys(envelope, ['jsonrpc', 'id', 'method', 'params']) || envelope.jsonrpc !== '2.0' || envelope.method !== 'tools/call' || !idValue(envelope.id)) return failure(object(envelope) ? envelope.id : undefined, -32600, 'Invalid probe request envelope');
 const id = envelope.id, params = envelope.params;
 if (!object(params) || !exactKeys(params, ['name', 'arguments', '_meta']) || params.name !== mcpSseProbeTool.name || !object(params.arguments) || !exactKeys(params.arguments, ['duration_seconds'])) return failure(id, -32602, 'Invalid probe parameters');
 const duration = params.arguments.duration_seconds;
 if (typeof duration !== 'number' || !Number.isInteger(duration) || duration < 310 || duration > 330) return failure(id, -32602, 'duration_seconds must be an integer from 310 to 330');
 if (params._meta !== undefined && !object(params._meta)) return failure(id, -32602, 'Invalid probe metadata');
 const meta = (params._meta || {}) as ObjectValue;
 const hasProgressToken = owns(meta, 'progressToken');
 if (hasProgressToken && !idValue(meta.progressToken)) return failure(id, -32602, 'progressToken must be a string or integer');
 const headerVersion = request.headers.get('MCP-Protocol-Version');
 const metaVersion = meta[versionKey];
 if (headerVersion === '') return failure(id, -32020, 'Protocol version header is malformed');
 if (metaVersion !== undefined && typeof metaVersion !== 'string') return failure(id, -32020, 'Invalid protocol version metadata');
 if (headerVersion === null && metaVersion !== undefined) return failure(id, -32020, 'Protocol version header is required when version metadata is supplied');
 const protocolVersion = headerVersion || '2025-03-26';
 if (!supported.includes(protocolVersion)) return failure(id, -32022, 'Unsupported protocol version', 400, {supported, requested: protocolVersion});
 if (protocolVersion === '2026-07-28') {
  if (metaVersion !== headerVersion || request.headers.get('Mcp-Method') !== envelope.method || mirroredName(request.headers.get('Mcp-Name')) !== params.name) return failure(id, -32020, 'Missing or mismatched MCP request headers');
  if (!object(meta[capabilitiesKey])) return failure(id, -32602, 'Per-request clientCapabilities metadata is required');
 } else if (metaVersion !== undefined && metaVersion !== headerVersion) return failure(id, -32020, 'Protocol version header and metadata mismatch');
 if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return failure(id, -32600, 'Content-Type must be application/json', 415);
 if (!accepts(request, 'application/json') || !accepts(request, 'text/event-stream')) return failure(id, -32600, 'Accept must include application/json and text/event-stream', 406);
 if (request.signal.aborted) return failure(id, -32600, 'Probe request was already aborted');

 const started = performance.now(), startedAt = new Date().toISOString(), deadline = started + duration * 1000;
 const probeId = crypto.randomUUID(), encoder = new TextEncoder();
 const protocolSource = protocolVersion === '2026-07-28' ? 'validated_header_and_meta' : headerVersion === null ? 'legacy_no_header_assumption' : 'legacy_header';
 let heartbeat: ReturnType<typeof setInterval> | undefined, terminal: ReturnType<typeof setTimeout> | undefined;
 let closed = false, firstByteEnqueuedMs: number | null = null, heartbeats = 0, progress = 0;
 let controller: ReadableStreamDefaultController<Uint8Array>;
 const elapsed = () => Math.max(0, performance.now() - started);
 const metrics = () => ({probe_id: probeId, requested_seconds: duration, elapsed_ms: elapsed(), protocol_version: protocolVersion, protocol_version_source: protocolSource, protocol_header: headerVersion, protocol_meta: metaVersion ?? null, has_progress_token: hasProgressToken, server_first_byte_enqueued_elapsed_ms: firstByteEnqueuedMs, heartbeat_comments: heartbeats, progress_notifications: progress, provider_requests: 0, business_db_writes: 0, background_work: false, resumption_supported: false});
 const log = (phase: string, extra: ObjectValue = {}) => console.info(JSON.stringify({component: 'mcp-sse-probe', phase, started_at: startedAt, ...metrics(), ...extra}));
 const cleanup = () => {
  if (heartbeat !== undefined) clearInterval(heartbeat);
  if (terminal !== undefined) clearTimeout(terminal);
  request.signal.removeEventListener('abort', aborted);
 };
 const stop = (reason: string, closeBody: boolean) => {
  if (closed) return;
  closed = true;
  cleanup();
  if (closeBody) {try {controller.close();} catch {/* Already closed by the transport. */}}
  log(protocolVersion === '2026-07-28' ? 'cancelled' : 'transport_closed', {reason, final_response_enqueued: false, server_stream_ended: true});
 };
 const aborted = () => stop('request_aborted', true);
 const send = (text: string) => {
  if (closed) return false;
  try {
   controller.enqueue(encoder.encode(text));
   if (firstByteEnqueuedMs === null) firstByteEnqueuedMs = elapsed();
   return true;
  } catch {stop('stream_enqueue_failed', false); return false;}
 };
 const finish = () => {
  if (closed) return;
  // A callback fired early must not complete the requested interval early.
  const remaining = deadline - performance.now();
  if (remaining > 0) {terminal = setTimeout(finish, remaining); return;}
  const result = {completed: true, ...metrics(), final_response_enqueued: true};
  if (!send(`event: message\ndata: ${JSON.stringify({jsonrpc: '2.0', id, result: {resultType: 'complete', content: [{type: 'text', text: JSON.stringify(result)}]}})}\n\n`)) return;
  closed = true;
  cleanup();
  controller.close();
  log('completed', {final_response_enqueued: true, server_stream_ended: true});
 };
 const stream = new ReadableStream<Uint8Array>({
  start(value) {
   controller = value;
   request.signal.addEventListener('abort', aborted, {once: true});
   if (request.signal.aborted) {aborted(); return;}
   if (!send(`: mcp-sse-probe ${probeId} opened\n\n`)) return;
   log('first_byte_enqueued', {final_response_enqueued: false, server_stream_ended: false});
   terminal = setTimeout(finish, Math.max(0, deadline - performance.now()));
   heartbeat = setInterval(() => {
    if (closed) return;
    if (performance.now() >= deadline) {finish(); return;}
    if (!send(': heartbeat\n\n')) return;
    heartbeats++;
    if (hasProgressToken) {
     progress++;
     send(`event: message\ndata: ${JSON.stringify({jsonrpc: '2.0', method: 'notifications/progress', params: {progressToken: meta.progressToken, progress, message: `Zero-fee transport probe: ${Math.floor(elapsed() / 1000)} seconds elapsed; no model request.`}})}\n\n`);
    }
   }, 10000);
  },
  cancel() {stop('response_stream_closed', false);},
 });
 return new Response(stream, {headers: {'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no'}});
}
