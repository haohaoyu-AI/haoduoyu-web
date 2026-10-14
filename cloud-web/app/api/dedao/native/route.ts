import {authenticateDedaoNative,DedaoNativeAuthError} from '../../../../lib/dedao-native';
import {dedaoNativeBridgeCall} from '../../../../lib/dedao';
import {DedaoError,dedaoPublicError} from '../../../../lib/dedao-contract';

const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const operations=new Set([
 'bind','refresh','read','claim','heartbeat','safe_boundary','lifecycle','native_lifecycle_observation',
 'begin_dedao_action','confirm_dedao_action','record_dedao_progress','record_dedao_download',
 'upload_dedao_word_chunk','finalize_dedao_word_upload','submit_dedao_item','pause_dedao_batch',
]);
function temporaryFailure(category:'native_auth_unavailable'|'native_runtime_unavailable'){
 const request_id=crypto.randomUUID();
 // Fixed categories and a generated correlation ID only. Never log the exception,
 // request headers, credential, body or SQL, including provider error messages.
 console.error({category,request_id});
 return Response.json({error:'原生连接遇到临时服务故障，请等待恢复后读取同一批次确认；任务与凭据均保留，不要重复发送、上传或求助',category,request_id},{status:503,headers});
}
async function readBody(r:Request){
 const reader=r.body?.getReader();if(!reader)return '';
 const decoder=new TextDecoder();let size=0,text='';
 try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>100000){await reader.cancel();return null;}text+=decoder.decode(part.value,{stream:true});}return text+decoder.decode();}
 finally{reader.releaseLock();}
}

// The native helper authenticates with its short-lived private credential.
// Browser cookies and Sites viewer headers never authorize this endpoint.
export async function POST(r:Request){
 if(r.headers.has('origin')||r.headers.has('sec-fetch-site'))return Response.json({error:'此入口仅供已授权的本机原生执行连接使用'},{status:403,headers});
 if(!r.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return Response.json({error:'需要 JSON 请求'},{status:415,headers});
 let context;
 try{context=await authenticateDedaoNative(r.headers.get('authorization'));}
 catch(e){return e instanceof DedaoNativeAuthError?Response.json({error:'原生执行连接授权无效或已过期，请通过本人网站 MCP 重新连接'},{status:401,headers}):temporaryFailure('native_auth_unavailable');}
 try{
  const declared=r.headers.get('content-length');
  if(declared&&(!/^\d+$/.test(declared)||Number(declared)>100000))return Response.json({error:'请求过大'},{status:413,headers});
  const input=await readBody(r);
  if(input===null)return Response.json({error:'请求过大'},{status:413,headers});
  let a;try{a=JSON.parse(input);}catch{return Response.json({error:'原生执行请求需要有效 JSON'},{status:400,headers});}
  if(!a||typeof a!=='object'||Array.isArray(a)||typeof a.operation!=='string'||!operations.has(a.operation)||!a.args||typeof a.args!=='object'||Array.isArray(a.args)||Object.keys(a).some(k=>k!=='operation'&&k!=='args'))return Response.json({error:'原生执行请求格式无效'},{status:400,headers});
  return Response.json(await dedaoNativeBridgeCall(context,a.operation,a.args),{headers});
 }catch(e){return e instanceof DedaoError?Response.json({error:dedaoPublicError(e)},{status:409,headers}):temporaryFailure('native_runtime_unavailable');}
}
