import {owner} from '../../../../lib/test-store';
import {workspaceInventory,changeWorkspace,WorkspaceError} from '../../../../lib/article-workspace';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export async function GET(request:Request){
 const user=owner(request);if(!user)return Response.json({error:'请使用本人账号登录'},{status:401,headers});
 try{const params=new URL(request.url).searchParams,offset=params.get('offset')??'0',limit=params.get('limit')??'100';if([...params.keys()].some(key=>!['offset','limit'].includes(key))||params.getAll('offset').length>1||params.getAll('limit').length>1||!/^\d{1,7}$/.test(offset)||!/^\d{1,3}$/.test(limit))throw new WorkspaceError('列表位置或每页数量无效');return Response.json(await workspaceInventory(user,Number(offset),Number(limit)),{headers});}
 catch(error){return Response.json({error:error instanceof WorkspaceError?error.message:'暂时无法读取清空范围；未更改任何文章'},{status:error instanceof WorkspaceError?400:503,headers});}
}
export async function POST(request:Request){
 const user=owner(request);if(!user)return Response.json({error:'请使用本人账号登录'},{status:401,headers});
 if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('x-article-workspace')!=='1')return Response.json({error:'请求来源无效'},{status:403,headers});
 try{const raw=await request.text();if(new TextEncoder().encode(raw).length>8192)return Response.json({error:'请求过大'},{status:413,headers});const input=JSON.parse(raw);if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['action','request_key','article_ids','owner_scope'].includes(key)))throw new WorkspaceError('请求格式无效');return Response.json(await changeWorkspace(user,input),{headers});}
 catch(error){return Response.json({error:error instanceof WorkspaceError?error.message:'结果未确认，请用同一次操作重试；原文和草稿保留'},{status:error instanceof WorkspaceError?400:503,headers});}
}
