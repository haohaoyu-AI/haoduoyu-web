import {owner} from '../../../lib/test-store';
import {createLocalWordJob,localWordPublicError} from '../../../lib/local-word-jobs';
export async function POST(request:Request){
 const user=owner(request);if(!user)return new Response('Unauthorized',{status:401});
 if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('x-xiaoyu-upload')!=='1')return new Response('Forbidden',{status:403});
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return new Response('JSON required',{status:415});
 try{const reader=request.body?.getReader();if(!reader)return new Response('No source',{status:400});const chunks:Uint8Array[]=[];let size=0;try{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>512000){await reader.cancel();return new Response('Source too large',{status:413});}chunks.push(item.value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(size);let at=0;for(const part of chunks){bytes.set(part,at);at+=part.length;}const input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));return Response.json(await createLocalWordJob(user,input),{status:201,headers:{'Cache-Control':'private, no-store'}});}catch(error){return Response.json({error:localWordPublicError(error)},{status:400,headers:{'Cache-Control':'private, no-store'}});}
}
