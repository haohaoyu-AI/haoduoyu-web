import { owner } from '../../../../lib/test-store';
import { executeClaudeDailyRun, prepareClaudeDailyRun } from '../../../../lib/claude';
import { workflowPublicError } from '../../../../lib/workflow-errors';

const MAX_BODY_BYTES = 120_000;

async function readBoundedBody(request: Request) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) throw new Error('提交资料过长');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('缺少提交资料');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error('提交资料过长');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function failure(message: string, status: number) {
  return Response.json({ error: message.slice(0, 300) }, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  const user = owner(request);
  if (!user) return failure('请使用本人 ChatGPT 账号登录', 401);
  if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('x-xiaoyu-daily-run') !== '1') {
    return failure('请求未获允许', 403);
  }

  let prepared;
  try {
    const input = JSON.parse(await readBoundedBody(request));
    prepared = await prepareClaudeDailyRun(user, input);
  } catch (error: unknown) {
    const message = workflowPublicError(error, '日更资料未通过核验');
    const status = message.includes('过长') ? 413 : 400;
    return failure(message, status);
  }

  const encoder = new TextEncoder();
  let closed = false;
  let pulse: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const started = Date.now();
      const emit = (event: Record<string, unknown>) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); }
        catch { closed = true; }
      };
      emit({ type: 'running', seconds: 0 });
      pulse = setInterval(() => emit({ type: 'running', seconds: Math.floor((Date.now() - started) / 1000) }), 10_000);
      void (async () => {
        try {
          const result = await executeClaudeDailyRun(prepared);
          if(result.state==='completed'&&'initial_saved' in result&&result.initial_saved){
            emit({type:'terminal',terminal:true,success:true,state:'初稿已保存，等待独立审稿、改稿及复核；尚未配图或投递',result:{state:result.state,article_id:result.article_id,initial_saved:true,editorial_phase:'review_pending',delivery_confirmed:false}});
          } else if (result.state === 'completed' && result.saved) {
            const saveResult = result.save_result as { pipeline?: { state?: string; notification_state?: string; already_submitted?: boolean } } | null;
            const pipeline = saveResult?.pipeline;
            const delivered = pipeline?.state === 'submitted' || pipeline?.already_submitted === true || (typeof pipeline?.state === 'string' && pipeline.state.startsWith('事件已送达'));
            const notifying = pipeline?.state === 'dispatching' || pipeline?.notification_state === 'dispatching' || pipeline?.notification_state === 'in_progress';
            const state = pipeline?.state === 'text_saved' ? '文字稿已在网站保存，已完成' : delivered
              ? '文章已保存并交给小鱼'
              : notifying
                ? '文章已保存，自动通知待核实'
                : pipeline?.state === 'needs_connection'
                  ? '文章已保存，自动衔接待恢复'
                  : '文章已保存，自动衔接未确认；请查看文章列表';
            emit({ type: 'terminal', terminal: true, success: true, state, result: { state: result.state, article_id: result.article_id, cached: result.cached, delivery_confirmed: delivered } });
          } else {
            emit({ type: 'terminal', terminal: true, success: false, state: result.state, error: workflowPublicError({ message: result.error }, '结果尚未确认；不会自动再次调用'), article_id: result.article_id });
          }
        } catch (error: unknown) {
          emit({ type: 'terminal', terminal: true, success: false, error: workflowPublicError(error, '结果尚未确认；不会自动再次调用') });
        } finally {
          if (pulse) clearInterval(pulse);
          if (!closed) { closed = true; controller.close(); }
        }
      })();
    },
    cancel() {
      closed = true;
      if (pulse) clearInterval(pulse);
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Accel-Buffering': 'no' } });
}
