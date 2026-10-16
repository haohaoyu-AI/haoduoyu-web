import {owner} from '../../../../lib/test-store';
import {readOutlineFlow,listOutlineFlows,outlinePublicError,archiveOutlineFlow,restoreOutlineFlow} from '../../../../lib/outline-flow';
export async function GET(request:Request){const user=owner(request),headers={'Cache-Control':'private, no-store'};if(!user)return Response.json({error:'请使用本人 ChatGPT 账号登录'},{status:401,headers});try{const id=new URL(request.url).searchParams.get('run_id');return Response.json(id?await readOutlineFlow(user,{run_id:id}):await listOutlineFlows(user,{include_archived:new URL(request.url).searchParams.get('include_archived')==='true'}),{headers});}catch(error){return Response.json({error:outlinePublicError(error)},{status:400,headers});}}

import {createOutlineFlow,createOutlineRevision,claimOutlineStage,reviewOutlineFlow,outlineFlowCall} from '../../../../lib/outline-flow';
import {createOutlineTextRevision,textRevisionPublicError} from '../../../../lib/text-revision';
const controlHeaders={'Cache-Control':'private, no-store'};
const controlLimit=120000;
const invalidControl='框架操作参数无效，未执行';
const tooLargeControl='框架操作资料过大，未执行';
async function controlInput(request:Request){
 if(Number(request.headers.get('content-length')||0)>controlLimit)throw Error(tooLargeControl);
 const reader=request.body?.getReader();if(!reader)throw Error(invalidControl);
 const decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,raw='';
 try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>controlLimit){await reader.cancel();throw Error(tooLargeControl);}raw+=decoder.decode(value,{stream:true});}return JSON.parse(raw+decoder.decode()) as unknown;}finally{reader.releaseLock();}
}
function controlEnvelope(value:unknown):{action:string;arguments:unknown}{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['action','arguments'].includes(key)))throw Error(invalidControl);
 const envelope=value as {action?:unknown;arguments?:unknown};
 if(typeof envelope.action!=='string'||!['create','create_outline_revision','claim_stage','review','create_revision','recover_completed','archive','restore'].includes(envelope.action)||!envelope.arguments||typeof envelope.arguments!=='object'||Array.isArray(envelope.arguments))throw Error(invalidControl);
 return {action:envelope.action,arguments:envelope.arguments};
}
// Normal authenticated webpage controls. These adapters never generate text, change
// identity, create a bypass, or expose a full claim result containing its prompts.
export async function POST(request:Request){
 const user=owner(request);if(!user)return Response.json({error:'请使用本人 ChatGPT 账号登录'},{status:401,headers:controlHeaders});
 if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('x-xiaoyu-outline-flow')!=='1')return Response.json({error:'请求未获允许'},{status:403,headers:controlHeaders});
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return Response.json({error:invalidControl},{status:415,headers:controlHeaders});
 let action='';
 try{
  const control=controlEnvelope(await controlInput(request));action=control.action;
  if(action==='archive'||action==='restore'){const result=await (action==='archive'?archiveOutlineFlow:restoreOutlineFlow)(user,control.arguments);return Response.json({action,...result},{headers:controlHeaders});}
  if(action==='create'||action==='create_outline_revision'){
   const result=await (action==='create'?createOutlineFlow:createOutlineRevision)(user,control.arguments);
   return Response.json({action,created:result.created,run_id:result.run_id,state:result.state},{headers:controlHeaders});
  }
  if(action==='claim_stage'){
   const result=await claimOutlineStage(user,control.arguments);
   // A token is returned exactly once to the atomic winner, as in the existing
   // claim service. The browser must keep it only in volatile run/stage memory.
   return Response.json(result.claimed?{action,claimed:true,run_id:result.run_id,stage:result.stage,token:result.token,input_sha256:result.input_sha256,expires:result.expires,state:'claimed'}:{action,claimed:false,run_id:result.run_id,stage:result.stage,state:'state' in result?result.state:'unknown',read_only:true},{headers:controlHeaders});
  }
  if(action==='review'){
   const result=await reviewOutlineFlow(user,control.arguments);
   return Response.json({action,saved:result.saved,run_id:result.run_id,state:result.state},{headers:controlHeaders});
  }
  if(action==='create_revision'){
   const result=await createOutlineTextRevision(user,control.arguments);
   return Response.json({action,created:result.created,flow_id:result.flow_id,run_id:result.snapshot.daily_source?.outline_run_id?.split(':').at(-1),current_phase:result.current_phase},{headers:controlHeaders});
  }
  const result=await outlineFlowCall(user,'recover_outline_stage',control.arguments);
  // The recover service accepts only a stored completed result. It may reconcile
  // saved state, but never sends or retries a model request.
  return Response.json({action,run_id:'run_id' in result?result.run_id:undefined,state:'state' in result?result.state:undefined},{headers:controlHeaders});
 }catch(error){
  const raw=error instanceof Error?error.message:'';
  const message=raw===tooLargeControl?tooLargeControl:raw===invalidControl?invalidControl:action==='create_revision'?textRevisionPublicError(error):outlinePublicError(error);
  return Response.json({error:message},{status:message===tooLargeControl?413:400,headers:controlHeaders});
 }
}
