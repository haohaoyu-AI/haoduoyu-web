import {owner} from '../../../../lib/test-store';
import {prepareEditorialStage,executeEditorialStage,editorialFlowPublicError} from '../../../../lib/editorial-flow';

async function inputBody(request: Request) {
 const limit = 8000;
 if (Number(request.headers.get('content-length') || 0) > limit) throw Error('写作链路参数无效');
 const reader = request.body?.getReader(); if (!reader) throw Error('写作链路参数无效');
 const decoder = new TextDecoder('utf-8', {fatal: true}); let bytes = 0, raw = '';
 try {
  for (;;) {const {done, value} = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > limit) {await reader.cancel(); throw Error('写作链路参数无效');} raw += decoder.decode(value, {stream: true});}
  return JSON.parse(raw + decoder.decode());
 } finally {reader.releaseLock();}
}
const headers = {'Cache-Control': 'private, no-store'};
function failure(error: string, status: number) {return Response.json({error}, {status, headers});}
export async function POST(request: Request) {
 const user = owner(request);
 if (!user) return failure('请使用本人 ChatGPT 账号登录', 401);
 if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('x-xiaoyu-editorial-run') !== '1') return failure('请求未获允许', 403);
 let prepared;
 try {prepared = await prepareEditorialStage(user, await inputBody(request));}
 catch (error) {const message = editorialFlowPublicError(error); return failure(message, 400);}
 const encoder = new TextEncoder(); let closed = false, pulse: ReturnType<typeof setInterval> | undefined;
 const stream = new ReadableStream<Uint8Array>({
  start(controller) {
   const started = Date.now();
   const emit = (event: Record<string, unknown>) => {if (closed) return; try {controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));} catch {closed = true;}};
   emit({type: 'running', seconds: 0});
   pulse = setInterval(() => emit({type: 'running', seconds: Math.floor((Date.now() - started) / 1000)}), 10000);
   void (async () => {
    try {
     const result = await executeEditorialStage(prepared);
     emit({type: 'terminal', terminal: true, success: result.state === 'completed' && 'saved' in result && result.saved === true, state: result.state, cached: result.cached === true, run_id: result.run_id, stage: result.stage, error: 'error' in result ? result.error : null});
    } catch (error) {emit({type: 'terminal', terminal: true, success: false, error: editorialFlowPublicError(error)});}
    finally {if (pulse) clearInterval(pulse); if (!closed) {closed = true; controller.close();}}
   })();
  },
  cancel() {closed = true; if (pulse) clearInterval(pulse);},
 });
 return new Response(stream, {headers: {...headers, 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Accel-Buffering': 'no'}});
}
