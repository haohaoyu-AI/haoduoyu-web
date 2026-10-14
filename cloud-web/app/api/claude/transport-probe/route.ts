import {owner} from '../../../../lib/test-store';
export async function GET(request: Request) {
 if (!owner(request)) return new Response('Unauthorized', {status: 401});
 const start = Date.now(); let timer: ReturnType<typeof setInterval> | undefined, stopped = false;
 const stop = () => {stopped = true; if (timer) clearInterval(timer);};
 const stream = new ReadableStream({
  start(controller) {
   const encoder = new TextEncoder();
   const send = (value: unknown) => {if (stopped) return; try {controller.enqueue(encoder.encode(JSON.stringify(value) + '\n'));} catch {stop();}};
   send({type: 'progress', state: 'running', elapsed: 0, target_seconds: 310, model_request_sent: false});
   if (stopped) return;
   timer = setInterval(() => {
    const elapsed = Math.round((Date.now() - start) / 1000), done = elapsed >= 310;
    send({type: done ? 'result' : 'progress', state: done ? 'completed' : 'running', ...(done ? {terminal: true, success: true} : {}), elapsed, target_seconds: 310, model_request_sent: false});
    if (done && !stopped) {stop(); controller.close();}
   }, 10000);
  },
  cancel() {stop();},
 });
 return new Response(stream, {headers: {'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'}});
}
