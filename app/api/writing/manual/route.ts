import {owner,db} from '../../../../lib/test-store';
import {writingCall} from '../../../../lib/writing';
import {assertManualKeys,getManualBatch,readManualBatch} from '../../../../lib/manual-batch';
import {readClaudeManualResult,saveCompletedManualClaude,renewCompletedManualClaudeClaim} from '../../../../lib/manual-claude';
import {manualPublicError} from '../../../../lib/manual-errors';
import {effectiveWritingStyleVersion} from '../../../../lib/writing-supplement';
import {writingOutlineTemplate,writingOutlineHelp} from '../../../../lib/writing-outline-template';

const headers={'Cache-Control':'private, no-store'};
const failure=(message:string,status:number)=>Response.json({error:message},{status,headers});
async function readBody(request:Request){
 const limit=120000;if(Number(request.headers.get('content-length')||0)>limit)throw Error('提交资料过长');
 const reader=request.body?.getReader();if(!reader)throw Error('缺少提交资料');
 const decoder=new TextDecoder('utf-8',{fatal:true});let size=0,raw='';
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw Error('提交资料过长');}raw+=decoder.decode(value,{stream:true});}return JSON.parse(raw+decoder.decode());}
 finally{reader.releaseLock();}
}
// Visible manual workbench only. GET is read-only; every write is an explicit POST.
export async function GET(request:Request){
 const user=owner(request);if(!user)return failure('请使用本人 ChatGPT 账号登录',401);
 try{
  const batch=await readManualBatch(user),config=await db().prepare('SELECT model,enabled FROM claude_settings WHERE owner=?').bind(user).first<{model:string;enabled:string}>();
  const result='run_id' in batch?await readClaudeManualResult(user,batch.run_id):null;
  return Response.json({batch,result,model:config?.model||'',enabled:config?.enabled==='1',prompt_version:effectiveWritingStyleVersion,outline_template:writingOutlineTemplate,outline_help:writingOutlineHelp},{headers});
 }catch(error){return failure(manualPublicError(error,'暂时无法读取手动批次'),503);}
}
export async function POST(request:Request){
 const user=owner(request);if(!user)return failure('请使用本人 ChatGPT 账号登录',401);
 if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('x-xiaoyu-manual-writing')!=='1')return failure('请求未获允许',403);
 try{
  const value:unknown=await readBody(request);assertManualKeys(value,['action','input']);
  const {action,input}=value;let result:unknown;
  if(action==='create')result=await writingCall(user,'create_manual_writing_batch',input);
  else if(action==='claim')result=await writingCall(user,'claim_manual_writing',input);
  else if(action==='save_xiaoyu'){
   assertManualKeys(input,['run_id','article_id','token','title','paragraphs']);
   const batch=await getManualBatch(user,input.run_id),topic=batch.snapshot.writers.xiaoyu;
   result=await writingCall(user,'save_manual_writing_article',{...input,writer:'xiaoyu',topic:topic.topic,sources:topic.sources});
  }else if(action==='save_claude')result=await saveCompletedManualClaude(user,input);
  else if(action==='renew_claude')result=await renewCompletedManualClaudeClaim(user,input);
  else throw Error('手动批次参数无效');
  return Response.json({result},{headers});
 }catch(error){const message=manualPublicError(error,'手动批次提交未通过核验');return failure(message,message==='提交资料过长'?413:400);}
}
