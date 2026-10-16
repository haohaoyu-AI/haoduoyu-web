import {owner} from '../../../../lib/test-store';
import {addBenchmark,discoveryRequestKey,DiscoveryBusyError,readDiscovery,refreshDiscovery,removeBenchmark} from '../../../../lib/hot-article-discovery-store';
export const dynamic='force-dynamic';
const response=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store, max-age=0',Pragma:'no-cache'}});
export async function GET(request:Request){
 const user=owner(request);if(!user)return response({error:'请使用本人ChatGPT账号登录'},401);
 try{const key=new URL(request.url).searchParams.get('request_key');return response(await readDiscovery(user,key?discoveryRequestKey(key):undefined));}catch{return response({error:'账号池或扫描记录暂时无法读取，请稍后再试'},503);}
}
export async function POST(request:Request){
 const user=owner(request);if(!user)return response({error:'请使用本人ChatGPT账号登录'},401);
 if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('x-hot-article-discovery')!=='1')return response({error:'请求来源无效'},403);
 const raw=await request.text();if(new TextEncoder().encode(raw).length>4096)return response({error:'请求内容过长'},413);
 let body:Record<string,unknown>;try{body=JSON.parse(raw);if(!body||Array.isArray(body)||typeof body!=='object')throw Error();}catch{return response({error:'请求格式无效'},400);}
 try{
  if(body.action==='add'){return response(await addBenchmark(user,body));}
  if(body.action==='remove'){return response(await removeBenchmark(user,body.id));}
  if(body.action==='refresh'){return response(await refreshDiscovery(user,body.request_key));}
  return response({error:'操作无效'},400);
 }catch(error){
  if(error instanceof DiscoveryBusyError)return response({error:error.message,code:'scan_busy',view:error.view},409);
  const message=error instanceof Error?error.message:'';
  const validation=/^(请填写|账号名称|请先添加|账号池最多|账号标识无效|刷新标识无效)/.test(message);
  return response({error:validation?message:'保存或刷新结果暂未确认，请稍后读取同一记录再试'},validation?400:503);
 }
}
