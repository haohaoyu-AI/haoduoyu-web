import {owner} from '../../../../lib/test-store';
import {readEditorialV3, prepareEditorialV3Stage, executeEditorialV3Stage, editorialV3PublicError} from '../../../../lib/editorial-v3-runtime';

const headers = {'Cache-Control': 'private, no-store'};
const inputLimit = 8000;
const invalid = '动态写作链路参数无效';

async function inputBody(request: Request): Promise<Record<string, unknown>> {
 const declared = request.headers.get('content-length');
 if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > inputLimit)) throw Error(invalid);
 const reader = request.body?.getReader();
 if (!reader) throw Error(invalid);
 const decoder = new TextDecoder('utf-8', {fatal: true});
 let bytes = 0, raw = '';
 try {
  for (;;) {
   const {done, value} = await reader.read();
   if (done) break;
   bytes += value.byteLength;
   if (bytes > inputLimit) {await reader.cancel(); throw Error(invalid);}
   raw += decoder.decode(value, {stream: true});
  }
  const value: unknown = JSON.parse(raw + decoder.decode());
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(invalid);
  const args = value as Record<string, unknown>;
  const fields = ['run_id', 'stage_id', 'token', 'expected_model', 'expected_input_sha256', 'confirm'];
  if (Object.keys(args).some(key => !fields.includes(key)) || fields.some(key => !(key in args)) || args.confirm !== true) throw Error(invalid);
  return args;
 } finally {reader.releaseLock();}
}
function failure(error: string, status: number) {return Response.json({error}, {status, headers});}
function publicMessage(value: unknown, token: unknown) {
 const message = editorialV3PublicError(value instanceof Error ? value : Error(typeof value === 'string' ? value : ''));
 return typeof token === 'string' && token && message.includes(token) ? '状态待核验；请只读读取同一收据，不重复付费请求' : message;
}

// Progress/receipt readback never prepares or starts a model request.
export async function GET(request: Request) {
 const user = owner(request);
 if (!user) return failure('请使用本人 ChatGPT 账号登录', 401);
 const url = new URL(request.url);
 if ([...url.searchParams.keys()].some(key => key !== 'run_id') || url.searchParams.getAll('run_id').length !== 1) return failure(invalid, 400);
 try {return Response.json(await readEditorialV3(user, {run_id: url.searchParams.get('run_id')}), {headers});}
 catch (error) {return failure(editorialV3PublicError(error), 400);}
}

// Paid execution is deliberately available only through the normal long-lived
// NDJSON helper, never a short tools/call response. The runtime owns all grants,
// actor/model/input bindings and durable single-attempt reservations.
export async function POST(request: Request) {
 const user = owner(request);
 if (!user) return failure('请使用本人 ChatGPT 账号登录', 401);
 if (request.headers.get('origin') !== new URL(request.url).origin ||
  request.headers.get('x-xiaoyu-editorial-v3-run') !== '1' ||
  !request.headers.get('accept')?.split(',').some(type => type.trim().split(';')[0] === 'application/x-ndjson')) return failure('请求未获允许', 403);
 let prepared: Awaited<ReturnType<typeof prepareEditorialV3Stage>>, args: Record<string, unknown>;
 try {args = await inputBody(request); prepared = await prepareEditorialV3Stage(user, args);}
 catch (error) {return failure(editorialV3PublicError(error), 400);}
 const encoder = new TextEncoder();
 let closed = false, pulse: ReturnType<typeof setInterval> | undefined;
 const stream = new ReadableStream<Uint8Array>({
  start(controller) {
   const started = Date.now();
   const emit = (event: Record<string, unknown>) => {
    if (closed) return;
    try {controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));} catch {closed = true;}
   };
   const binding = {run_id: args.run_id, stage_id: args.stage_id};
   emit({type: 'running', ...binding, seconds: 0});
   pulse = setInterval(() => emit({type: 'running', ...binding, seconds: Math.floor((Date.now() - started) / 1000)}), 10000);
   void (async () => {
    try {
     const result = await executeEditorialV3Stage(prepared);
     const state = typeof result.state === 'string' && /^[a-z_]{1,80}$/.test(result.state) ? result.state : 'unknown';
     emit({type: 'terminal', terminal: true, ...binding,
      success: state === 'completed' && 'saved' in result && result.saved === true,
      state, cached: 'cached' in result && result.cached === true,
      error: 'error' in result && result.error ? publicMessage(result.error, args.token) : null});
    } catch (error) {
     emit({type: 'terminal', terminal: true, ...binding, success: false, state: 'unknown', error: publicMessage(error, args.token)});
    } finally {
     if (pulse) clearInterval(pulse);
     if (!closed) {closed = true; controller.close();}
    }
   })();
  },
  // Disconnect only stops delivery. It is neither durable cancellation nor
  // permission to retry a paid stage; recovery must inspect the same receipt.
  cancel() {closed = true; if (pulse) clearInterval(pulse);},
 });
 return new Response(stream, {headers: {...headers, 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Accel-Buffering': 'no'}});
}
