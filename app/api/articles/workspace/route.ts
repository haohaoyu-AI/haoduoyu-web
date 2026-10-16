import {owner} from '../../../../lib/test-store';
import {workspaceInventory,changeWorkspace,WorkspaceError} from '../../../../lib/article-workspace';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export async function GET(request:Request){const user=owner(request);if(!user)return Response.json({error:'请使用本人账号登录'},{status:401,headers});try{return Response.json(await workspaceInventory(user),{headers});}catch{return Response.json({error:'暂时无法读取清空范围；未更改任何文章'},{status:503,headers});}}
export async function POST(request:Request){
 const user=owner(request);if(!user)return Response.json({error:'请使用本人账号登录'},{status:401,headers});
 if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('x-article-workspace')!=='1')return Response.json({error:'请求来源无效'},{status:403,headers});
 try{const raw=await request.text();if(new TextEncoder().encode(raw).length>8192)return Response.json({error:'请求过大'},{status:413,headers});const input=JSON.parse(raw);if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['action','request_key','article_ids'].includes(key)))throw new WorkspaceError('请求格式无效');return Response.json(await changeWorkspace(user,input),{headers});}
 catch(error){return Response.json({error:error instanceof WorkspaceError?error.message:'结果未确认，请用同一次操作重试；原文和草稿保留'},{status:error instanceof WorkspaceError?400:503,headers});}
}
