import {editorialCloudExecutionDiagnostic} from '../../../lib/editorial-cloud-execution-diagnostics-v3';
import {executeEditorialV3CloudStage,probeEditorialV3CloudStage,preflightEditorialV3CloudStage,readEditorialV3CloudStage,editorialCloudHttpPublicError} from '../../../lib/editorial-cloud-http-v3';

export const dynamic='force-dynamic';
// A framework hint only, not a Site/platform timeout guarantee. The real private
// cloud HTTP 330-second NDJSON probe is the release gate before any paid call.
// Accommodates the trusted V3 5–30 minute provider deadline plus preflight and
// receipt persistence. This remains a framework hint, not a platform promise.
export const maxDuration=2100;
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const invalid='云正文单阶段参数无效';
function failure(error:unknown,status=400){const diagnostic=editorialCloudExecutionDiagnostic(error);return Response.json({error:editorialCloudHttpPublicError(error),...(diagnostic?{diagnostic}:{})},{status,headers});}
async function input(request:Request){
 const length=request.headers.get('content-length');
 if(length!==null&&(!/^\d+$/u.test(length)||Number(length)>1024))throw Error(invalid);
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')throw Error(invalid);
 const reader=request.body?.getReader();if(!reader)throw Error(invalid);let bytes=0,raw='';const decoder=new TextDecoder('utf-8',{fatal:true});
 try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1024){await reader.cancel();throw Error(invalid);}raw+=decoder.decode(value,{stream:true});}return JSON.parse(raw+decoder.decode()) as unknown;}finally{reader.releaseLock();}
}
// This endpoint lives behind the existing private Site platform dispatch access
// policy. Serviceaccess is transport access, not owner authentication. Never
// interpret its token/header as owner identity or accept caller owner headers.
// The app gate is an explicitly owner-created DB delegation + exact stage nonce.
export async function POST(request:Request){
 let value:unknown,probe:boolean,stageId:string;
 try{
  const url=new URL(request.url),action=url.searchParams.get('action');if([...url.searchParams.keys()].some(k=>k!=='action')||url.searchParams.getAll('action').length>1||(action!==null&&action!=='probe'))throw Error(invalid);
  value=await input(request);probe=action==='probe';
  // Validate explicit server delegation before revealing even a progress frame.
  // Safe exact-stage read only; no prepare/model metadata/provider/reservation.
  const safe=await readEditorialV3CloudStage(value);stageId=safe.stage_id;
  if(request.signal.aborted)throw Error('云正文单阶段授权已停止或过期');
 }catch(error){return failure(error);}
 const traceId=crypto.randomUUID(),openedAt=Date.now();let frameCount=0,lastFrameElapsedMs:number|null=null,closeReason:'open'|'terminal'|'request_signal'|'stream_cancel'|'enqueue_failed'='open';
 const trace=(phase:'stream_open'|'request_abort'|'stream_cancel'|'enqueue_failed'|'terminal_enqueued'|'stream_closed')=>({component:'editorial-v3-cloud',trace_id:traceId,stage_id:stageId,phase,close_reason:closeReason,elapsed_ms:Math.max(0,Date.now()-openedAt),frame_count:frameCount,last_frame_elapsed_ms:lastFrameElapsedMs,signal_aborted:request.signal.aborted});
 const cancellationLog=(code:'request_signal'|'stream_cancel'|'enqueue_failed')=>{closeReason=code;console.error(JSON.stringify({...trace(code==='request_signal'?'request_abort':code),stage:'request_cancelled',code}));};
 const flowAbort=new AbortController(),abort=()=>{cancellationLog('request_signal');flowAbort.abort(request.signal.reason);};
 request.signal.addEventListener('abort',abort,{once:true});if(request.signal.aborted)abort();
 const encoder=new TextEncoder();let closed=false,pulse:ReturnType<typeof setInterval>|undefined;
 const stop=()=>{if(pulse)clearInterval(pulse);request.signal.removeEventListener('abort',abort);};
 const stream=new ReadableStream<Uint8Array>({
  start(controller){
   const start=Date.now(),emit=(packet:Record<string,unknown>)=>{if(closed)return;try{controller.enqueue(encoder.encode(JSON.stringify({...packet,trace_id:traceId})+'\n'));frameCount++;lastFrameElapsedMs=Math.max(0,Date.now()-openedAt);if(packet.type==='terminal'){if(closeReason==='open')closeReason='terminal';console.info(JSON.stringify(trace('terminal_enqueued')));}}catch{closed=true;stop();cancellationLog('enqueue_failed');flowAbort.abort();}};
   emit({type:'running',stage_id:stageId,probe,elapsed_ms:0,...(probe?{target_ms:330000,model_request_sent:false}:{} )});
   console.info(JSON.stringify(trace('stream_open')));pulse=setInterval(()=>emit({type:'running',stage_id:stageId,probe,elapsed_ms:Math.max(0,Date.now()-start),...(probe?{target_ms:330000,model_request_sent:false}:{} )}),10000);
   void(async()=>{
    try{const result=probe?await probeEditorialV3CloudStage(value,flowAbort.signal):await executeEditorialV3CloudStage(value,flowAbort.signal);
     const output=result as Record<string,unknown>,success=result.state==='completed'&&(probe||(output.receipt_state==='completed'&&output.binding_status==='bound_to_stage_input'&&output.response_suppressed===false&&typeof output.requested_model==='string'&&output.requested_model===output.returned_model));
     emit({type:'terminal',terminal:true,success,...result});
    }catch(error){const diagnostic=editorialCloudExecutionDiagnostic(error);console.error(JSON.stringify({component:'editorial-v3-cloud',trace_id:traceId,stage_id:stageId,phase:'execution_failed',...(diagnostic??{execution_phase:'unclassified',code:'execution_unconfirmed',transport_consumption:'unconfirmed'}),elapsed_ms:Math.max(0,Date.now()-openedAt),signal_aborted:request.signal.aborted}));emit({type:'terminal',terminal:true,stage_id:stageId,probe,success:false,state:'unknown',error:editorialCloudHttpPublicError(error),...(diagnostic?{execution_diagnostic:diagnostic}:{}),read_only:true,automatic_paid_retry:false});}
    finally{stop();if(!closed){closed=true;controller.close();console.info(JSON.stringify(trace('stream_closed')));}}
   })();
  },
  // Cancellation aborts the actual request-bound provider/probe operation. It
  // never resets durable consumption or creates waitUntil/background execution.
  cancel(reason){closed=true;stop();cancellationLog('stream_cancel');flowAbort.abort(reason);},
 });
 return new Response(stream,{headers:{...headers,'Content-Type':'application/x-ndjson; charset=utf-8','X-Accel-Buffering':'no','X-Editorial-Trace-Id':traceId}});
}
// Nonce is a header to avoid putting it into URL/history/access logs. This is
// only a one-stage nonce, never a fake Site-service or authenticated-owner header.
export async function GET(request:Request){
 try{const url=new URL(request.url),action=url.searchParams.get('action');if([...url.searchParams.keys()].some(k=>k!=='stage_id'&&k!=='action')||url.searchParams.getAll('stage_id').length!==1||url.searchParams.getAll('action').length>1||(action!==null&&action!=='preflight'))throw Error(invalid);
  const value={stage_id:url.searchParams.get('stage_id'),token:request.headers.get('x-editorial-stage-token')};return Response.json(action==='preflight'?await preflightEditorialV3CloudStage(value,request.signal):await readEditorialV3CloudStage(value),{headers});
 }catch(error){return failure(error);}
}
