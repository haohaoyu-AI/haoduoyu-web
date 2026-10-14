import {owner} from '../../../lib/test-store';
import {setWordIntent,WordRecoveryError} from '../../../lib/word-recovery';
export async function POST(request:Request){
 const user=owner(request);if(!user)return new Response('Unauthorized',{status:401});
 if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('x-xiaoyu-upload')!=='1')return new Response('Forbidden',{status:403});
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return new Response('JSON required',{status:415});
 try{const reader=request.body?.getReader();if(!reader)return new Response('No intent',{status:400});const chunks:Uint8Array[]=[];let length=0;try{for(;;){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>2048){await reader.cancel();return new Response('Too large',{status:413});}chunks.push(part.value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(length);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}return Response.json(await setWordIntent(user,JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return Response.json({error:e instanceof WordRecoveryError?e.message:'操作结果未确认；请读取同一任务再核对'},{status:409,headers:{'Cache-Control':'private, no-store'}});}
}
