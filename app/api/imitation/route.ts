import {readHotArticleRefresh,hotArticleQuery,HotArticleRequestError} from '../../../lib/hot-article-http';
import {owner,db} from '../../../lib/test-store';
import {createHotArticleBatch,readHotArticleBatch,HotArticleError} from '../../../lib/hot-article-imitation';
import {imitationAuthorityV3Scope} from '../../../lib/editorial-authority-v3';
import {readiness} from '../../../lib/events';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store, max-age=0',Pragma:'no-cache'};
const response=(value:unknown,status=200)=>Response.json(value,{status,headers});
const failure=(error:unknown)=>response({error:error instanceof HotArticleError||error instanceof HotArticleRequestError?error.message:'状态未确认，请读取同一刷新意图；未授权重建或重复收费'},error instanceof HotArticleRequestError?error.status:error instanceof HotArticleError?400:500);
export async function GET(request:Request){
 const user=owner(request);if(!user)return response({error:'请使用本人ChatGPT账号登录'},401);
 try{const query=hotArticleQuery(new URL(request.url));
  if(query.settings){const authorities=(await db().prepare("SELECT id,created FROM editorial_authority_v3 WHERE owner=? AND scope=? AND state='active' ORDER BY created DESC LIMIT 20").bind(user,imitationAuthorityV3Scope).all()).results;return response({authorities,connected:(await readiness(user,'hot_article.research_requested')).connected,executor:{state:'not_wired_or_verified',automatic_writing_available:false,notice:'本增量只有采集、持久任务和执行接口；真实云端研究、作者及独立审稿执行者尚未完成接线与验收。订阅存在不证明能自动成稿。'}});}
  return response(await readHotArticleBatch(user,query.args));
 }catch(error){return failure(error);}
}
export async function POST(request:Request){
 const user=owner(request);if(!user)return response({error:'请使用本人ChatGPT账号登录'},401);
 if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('x-hot-article-imitation')!=='1')return response({error:'请求来源无效'},403);
 try{return response(await createHotArticleBatch(user,await readHotArticleRefresh(request)));}catch(error){return failure(error);}
}
