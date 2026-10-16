import {owner} from '../../../../../lib/test-store';
import {article} from '../../../../../lib/articles';
import {textOnlyArticle} from '../../../../../lib/article-output-mode';
import {readWordProgress} from '../../../../../lib/word-progress';

// Normal browser reads use the same persisted projection as the processing
// tools. Cached verification never downloads Word or records a save receipt.
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const user=owner(request);
 if(!user)return Response.json({error:'请用本人ChatGPT账号登录'},{status:401});
 const {id}=await params;
 if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))return Response.json({error:'无效任务编号'},{status:400});
 const headers={'Cache-Control':'private, no-store'};
 try{
  const row=await article(user,id),output_mode=textOnlyArticle(row)?'text_only':null;
  const word_progress=output_mode?null:await readWordProgress(user,'article',id,row,{verification:'cached'});
  return Response.json({article_id:id,output_mode,word_progress,word_progress_unavailable:false},{headers});
 }catch(error){
  if(error instanceof Error&&error.message==='没有找到此任务')return Response.json({error:'没有找到此任务'},{status:404,headers});
  return Response.json({error:'暂时无法读取此文章的 Word 进度，请保留当前任务后重试'},{status:503,headers});
 }
}
