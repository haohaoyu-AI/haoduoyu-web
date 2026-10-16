import { owner } from '../../../../lib/test-store';
import { readTopicResearch,TopicResearchError } from '../../../../lib/topic-research';
import { topicResearchCall } from '../../../../lib/topic-research-tools';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store, max-age=0',Pragma:'no-cache'};
const response=(body:unknown,status=200)=>Response.json(body,{status,headers});
const safeError=(error:unknown)=>response({error:error instanceof TopicResearchError?error.message:'研究操作未确认，请读取当前批次后核对'},error instanceof TopicResearchError?400:500);
export async function GET(request:Request) {
 const user=owner(request);if(!user)return response({error:'请使用本人 ChatGPT 账号登录'},401);
 const id=new URL(request.url).searchParams.get('id');
 try{return response(await readTopicResearch(user,id??undefined));}catch(error){return safeError(error);}
}
export async function POST(request:Request) {
 const user=owner(request);if(!user)return response({error:'请使用本人 ChatGPT 账号登录'},401);
 if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('x-topic-research')!=='1')return response({error:'请求来源无效'},403);
 try{
  const raw=await request.text();if(new TextEncoder().encode(raw).length>110000)return response({error:'研究结果超过读取上限'},413);
  const body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Invalid body');
  const actions:Record<string,string>={create:'create_topic_research',read:'read_topic_research',claim:'claim_topic_research',save:'save_topic_research',fail:'fail_topic_research',dispatch:'retry_topic_research_dispatch'};
  const name=actions[body.action];if(!name)return response({error:'研究操作无效'},400);
  return response(await topicResearchCall(user,name,body));
 }catch(error){return safeError(error);}
}
