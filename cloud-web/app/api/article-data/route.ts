import {owner} from '../../../lib/test-store';
import {readArticleHistory,importHistory,recordMetrics,HistoryError} from '../../../lib/article-history';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export async function GET(request:Request){const user=owner(request);if(!user)return Response.json({error:'请使用本人账号登录'},{status:401,headers});try{const raw=new URL(request.url).searchParams.get('offset')||'0';if(!/^\d{1,5}$/.test(raw))throw new HistoryError('列表位置无效');return Response.json(await readArticleHistory(user,Number(raw)),{headers});}catch{return Response.json({error:'暂时无法读取历史统计，原记录保留'},{status:503,headers});}}
export async function POST(request:Request){
 const user=owner(request);if(!user)return Response.json({error:'请使用本人账号登录'},{status:401,headers});
 if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('x-article-data')!=='1')return Response.json({error:'请求来源无效'},{status:403,headers});
 try{const text=await request.text();if(new TextEncoder().encode(text).length>110000)return Response.json({error:'证据过大'},{status:413,headers});const args=JSON.parse(text);if(!args||typeof args!=='object'||Array.isArray(args))throw new HistoryError('请求格式无效');return Response.json(args.action==='import'?await importHistory(user,args):args.action==='metrics'?await recordMetrics(user,args):{error:'操作无效'},{status:['import','metrics'].includes(args.action)?200:400,headers});}
 catch(error){return Response.json({error:error instanceof HistoryError?error.message:'保存未确认，请读取同一证据后重试'},{status:error instanceof HistoryError?400:503,headers});}
}
