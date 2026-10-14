import {owner} from '../../../../../lib/test-store';
import {notifyArticle} from '../../../../../lib/article-handoff';
export async function POST(r:Request,{params}:{params:Promise<{id:string}>}){
 const u=owner(r);if(!u)return new Response('Unauthorized',{status:401});
 if(r.headers.get('origin')!==new URL(r.url).origin||r.headers.get('x-xiaoyu-upload')!=='1')return new Response('Forbidden',{status:403});
 try {const {id}=await params;return Response.json(await notifyArticle(u,id));}
 catch(error){const message=error instanceof Error?error.message:'';
  if(['自动写文仅保存网站文字稿，不进入配图、Word或平台草稿流程','文章处理连接尚未启用，文章已安全保存'].includes(message))return Response.json({error:message},{status:409});
  if(['没有找到此任务','无效任务编号'].includes(message))return Response.json({error:'没有找到此任务'},{status:400});
  return Response.json({error:'通知结果待核对，请刷新查看同一任务的进度'},{status:503});
 }
}
