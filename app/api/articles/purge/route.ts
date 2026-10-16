import { owner } from '../../../../lib/test-store';
import { ArticleDeletionError } from '../../../../lib/article-deletion';
import { articleContentDeletionCall } from '../../../../lib/article-content-deletion-tools';
const headers={'Cache-Control':'private, no-store'};
function failure(error:unknown){return Response.json({error:error instanceof ArticleDeletionError?error.message:'本次清理尚未确认，请回读原操作'},{status:error instanceof ArticleDeletionError?error.status:503,headers});}
export async function GET(request:Request){
 const user=owner(request);if(!user)return Response.json({error:'请使用本人账号登录'},{status:401,headers});
 try{const url=new URL(request.url),operation_id=url.searchParams.get('operation_id'),request_key=url.searchParams.get('request_key');
  return Response.json(await articleContentDeletionCall(user,'read_all_article_deletion',{...(operation_id?{operation_id}:{}),...(request_key?{request_key}:{})}),{headers});
 }catch(error){return failure(error);}
}
export async function POST(request:Request){
 const user=owner(request);if(!user)return Response.json({error:'请使用本人账号登录'},{status:401,headers});
 if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('x-xiaoyu-content-delete')!=='1')return Response.json({error:'请求未获允许'},{status:403,headers});
 if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return Response.json({error:'请求格式无效'},{status:415,headers});
 try{
  if(!request.body)throw new ArticleDeletionError('请求格式无效',400);
  const reader=request.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let raw='',size=0;
  try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>128000){await reader.cancel();throw new ArticleDeletionError('请求过大',413);}raw+=decoder.decode(part.value,{stream:true});}raw+=decoder.decode();}finally{reader.releaseLock();}
  let body;try{body=JSON.parse(raw);}catch{throw new ArticleDeletionError('请求格式无效',400);}if(!body||typeof body!=='object'||Array.isArray(body))throw new ArticleDeletionError('请求格式无效',400);
  const {action,...args}=body;
  const name=action==='preview'?'preview_all_article_deletion':action==='confirm'?'delete_all_articles_permanently':action==='abandon_preview'?'abandon_article_deletion_preview':null;
  if(!name)throw new ArticleDeletionError('清理动作无效',400);
  return Response.json(await articleContentDeletionCall(user,name,args),{headers});
 }catch(error){return failure(error);}
}
