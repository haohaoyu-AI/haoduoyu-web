import {owner} from '../../../../lib/test-store';
import {prepareStepwiseClaude, executeStepwiseClaude} from '../../../../lib/stepwise-text';
import {stepwiseErrors, stepwisePublicError} from '../../../../lib/stepwise-text-errors';

async function inputBody(request: Request) {
 const limit = 8000;
 if (Number(request.headers.get('content-length') || 0) > limit) throw Error(stepwiseErrors.tooLarge);
 const reader = request.body?.getReader(); if (!reader) throw Error(stepwiseErrors.invalid);
 const decoder = new TextDecoder('utf-8', {fatal: true}); let bytes = 0, raw = '';
 try {
  for (;;) {const {done, value} = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > limit) {await reader.cancel(); throw Error(stepwiseErrors.tooLarge);} raw += decoder.decode(value, {stream: true});}
  return JSON.parse(raw + decoder.decode());
 } finally {reader.releaseLock();}
}
const headers = {'Cache-Control': 'private, no-store'};
function failure(error: string, status: number) {return Response.json({error}, {status, headers});}
export async function POST(request: Request) {
 const user = owner(request);
 if (!user) return failure('请使用本人 ChatGPT 账号登录', 401);
 if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('x-xiaoyu-stepwise-text-run') !== '1') return failure('请求未获允许', 403);
 let prepared;
 try {prepared = await prepareStepwiseClaude(user, await inputBody(request));}
 catch (error) {const message = stepwisePublicError(error, stepwiseErrors.invalid); return failure(message, message === stepwiseErrors.tooLarge ? 413 : 400);}
 const encoder = new TextEncoder(); let closed = false, pulse: ReturnType<typeof setInterval> | undefined;
 const stream = new ReadableStream<Uint8Array>({
  start(controller) {
   const started = Date.now();
   const emit = (event: Record<string, unknown>) => {if (closed) return; try {controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));} catch {closed = true;}};
   emit({type: 'running', seconds: 0});
   pulse = setInterval(() => emit({type: 'running', seconds: Math.floor((Date.now() - started) / 1000)}), 10000);
   void (async () => {
    try {
     const result = await executeStepwiseClaude(prepared);
     emit({type: 'terminal', terminal: true, success: result.state === 'completed', state: result.state, cached: result.cached === true, item_id: result.item_id, error: 'error' in result ? result.error : null});
    } catch (error) {emit({type: 'terminal', terminal: true, success: false, error: stepwisePublicError(error)});}
    finally {if (pulse) clearInterval(pulse); if (!closed) {closed = true; controller.close();}}
   })();
  },
  cancel() {closed = true; if (pulse) clearInterval(pulse);},
 });
 return new Response(stream, {headers: {...headers, 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Accel-Buffering': 'no'}});
}
