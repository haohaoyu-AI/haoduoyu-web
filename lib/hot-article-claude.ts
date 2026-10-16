import {db} from './test-store';
import {hashText} from './writing-input';
import {readEditorialAuthorityV3,loadEditorialRunV3,imitationAuthorityV3Scope} from './editorial-authority-v3';
import {prepareEditorialV3Stage,executeEditorialV3Stage,readEditorialV3,editorialV3PublicError} from './editorial-v3-runtime';
import {editorialCredentialHit} from './editorial-credential-boundary';
import {HotArticleError} from './hot-article-imitation';
type Args=Record<string,unknown>;
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
async function scope(owner:string,authorityId:unknown){const authority=await readEditorialAuthorityV3(owner,{authority_id:authorityId});if(authority.scope!==imitationAuthorityV3Scope||authority.state!=='active')throw new HotArticleError('需要热文模仿独立常规授权');return authority;}
export async function acceptImitationClaudeTransport(owner:string,args:Args){
 const authority=await scope(owner,args.authority_id);if(args.confirm!==true||args.confirmed_scope!=='hot_article_imitation_transport_acceptance'||!uuid(args.probe_id)||typeof args.source_message_id!=='string'||!args.source_message_id.trim()||args.source_message_id.length>300||typeof args.quoted_evidence!=='string'||args.quoted_evidence.length<20||args.quoted_evidence.length>3000||await hashText(args.quoted_evidence)!==args.quoted_evidence_sha256)throw new HotArticleError('需要本人确认实际收到零收费长连接最终响应');
 if(await editorialCredentialHit(owner,{evidence:args.quoted_evidence,source:args.source_message_id}))throw new HotArticleError('运输验收内容安全校验未通过');
 const probe=await db().prepare('SELECT result_json FROM hot_article_transport_probes WHERE id=? AND owner=? AND authority_id=?').bind(args.probe_id,owner,authority.authority_id).first<{result_json:string}>();if(!probe)throw new HotArticleError('未找到同授权完整长连接探测');const result=JSON.parse(probe.result_json);if(result.completed!==true||result.elapsed_ms<330000||result.provider_requests!==0||result.probe_id!==args.probe_id)throw new HotArticleError('零收费运输验收尚未完成');
 const evidence=JSON.stringify({probe_id:args.probe_id,source_message_id:args.source_message_id,quoted_evidence:args.quoted_evidence,quoted_evidence_sha256:args.quoted_evidence_sha256,authenticated_owner_attested:true,server_result:result});const existing=await db().prepare('SELECT evidence_json FROM hot_article_transport_acceptance WHERE owner=? AND authority_id=?').bind(owner,authority.authority_id).first<{evidence_json:string}>();if(existing){if(existing.evidence_json!==evidence)throw new HotArticleError('已有运输验收不得覆盖');return {accepted:true,duplicate:true};}
 await db().prepare('INSERT OR IGNORE INTO hot_article_transport_acceptance(id,owner,authority_id,source_message_id,evidence_sha256,evidence_json,created) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),owner,authority.authority_id,args.source_message_id,await hashText(evidence),evidence,new Date().toISOString()).run();const saved=await db().prepare('SELECT evidence_json FROM hot_article_transport_acceptance WHERE owner=? AND authority_id=?').bind(owner,authority.authority_id).first<{evidence_json:string}>();if(saved?.evidence_json!==evidence)throw new HotArticleError('运输验收未确认或不同证据发生竞争，请读取原验收');return {accepted:true,scope:imitationAuthorityV3Scope,server_sse:'same_route_probe_330_seconds',client_final_response:'owner_attested',provider_requests:0};
}
async function prepare(owner:string,args:Args){
 const canonical=await loadEditorialRunV3(owner,args.run_id);if(canonical.row.run_kind!=='hot_article_imitation'||canonical.authority.row.scope!==imitationAuthorityV3Scope||canonical.row.writer!=='claude_provider')throw new HotArticleError('Claude入口仅用于正常授权的热文模仿');
 if(canonical.authority.policy?.cost_permission!=='explicit_owner_unbounded_within_hot_article_imitation_only')throw new HotArticleError('热文模仿尚无独立付费授权；产品范围或运输验收不能替代支出授权');
 const link=await db().prepare('SELECT batch_id,batch_sha256 FROM hot_article_editorial_links WHERE run_id=? AND owner=?').bind(canonical.row.id,owner).first<{batch_id:string;batch_sha256:string}>();if(!link||link.batch_id!==canonical.input.imitation_batch_id||link.batch_sha256!==canonical.input.imitation_batch_sha256)throw new HotArticleError('批次与写作任务冻结绑定不一致');
 return prepareEditorialV3Stage(owner,args);
}
/** Cloud caller uses the normal authenticated Site MCP SSE transport. This is
 * request-lifetime work, never a laptop worker or a claimed durable background. */
export async function imitationClaudeSSE(request:Request,owner:string,q:{id:unknown;params?:{name?:string;arguments?:Args}}){
 const args=q.params?.arguments??{},probe=q.params?.name==='probe_hot_article_claude_transport';
 let prepared:Awaited<ReturnType<typeof prepareEditorialV3Stage>>|null=null;
 if(probe)await scope(owner,args.authority_id);else prepared=await prepare(owner,args);
 const encoder=new TextEncoder(),started=performance.now(),probeId=crypto.randomUUID(),abort=new AbortController();let pulse:ReturnType<typeof setInterval>|undefined,terminal:ReturnType<typeof setTimeout>|undefined,closed=false,streamController:ReadableStreamDefaultController<Uint8Array>|undefined;
 const cleanup=()=>{if(pulse)clearInterval(pulse);if(terminal)clearTimeout(terminal);request.signal.removeEventListener('abort',cancel);};
 const cancel=()=>{abort.abort();cleanup();if(!closed){closed=true;try{streamController?.close();}catch{/* peer already cancelled */}}};request.signal.addEventListener('abort',cancel,{once:true});if(request.signal.aborted)cancel();
 const stream=new ReadableStream<Uint8Array>({start(controller){
  streamController=controller;if(closed){controller.close();return;}
  const emit=(text:string)=>{if(closed)return;try{controller.enqueue(encoder.encode(text));}catch{closed=true;cancel();}};
  const finish=(result:unknown,isError=false)=>{if(closed)return;emit(`event: message\ndata: ${JSON.stringify({jsonrpc:'2.0',id:q.id,result:{resultType:'complete',...(isError?{isError:true}:{}),content:[{type:'text',text:JSON.stringify(result)}]}})}\n\n`);closed=true;cleanup();try{controller.close();}catch{/* closed peer */}};
  emit(': hot-article-imitation normal authorized transport\n\n');pulse=setInterval(()=>emit(': heartbeat\n\n'),10000);
  const run=async()=>{try{
   if(probe){const remaining=330000-(performance.now()-started);if(remaining>0){terminal=setTimeout(()=>void run(),remaining);return;}if(abort.signal.aborted){finish({state:'cancelled',provider_requests:0});return;}const result={completed:true,probe_id:probeId,authority_id:args.authority_id,elapsed_ms:performance.now()-started,provider_requests:0,transport:'hot_article_imitation_mcp_sse',background_work:false};await db().prepare('INSERT INTO hot_article_transport_probes(id,owner,authority_id,result_json,created) VALUES(?,?,?,?,?)').bind(probeId,owner,args.authority_id,JSON.stringify(result),new Date().toISOString()).run();finish(result);}
   else{const result=await executeEditorialV3Stage(prepared!,{signal:abort.signal,providerTimeoutMs:900000});const view=await readEditorialV3(owner,{run_id:args.run_id});finish({result,run_id:view.run_id,state:view.state,stages:view.stages,automatic_paid_retry:false,instruction:'不确定时只读同run/stage/receipt；completed且saved:false只走同stage recovery，不重试收费。'});}
  }catch(error){finish({state:'unknown',run_id:args.run_id??null,stage_id:args.stage_id??null,error:editorialV3PublicError(error),automatic_paid_retry:false},true);}};void run();
 },cancel(){closed=true;cancel();}});
 return new Response(stream,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'private, no-store','X-Accel-Buffering':'no'}});
}
