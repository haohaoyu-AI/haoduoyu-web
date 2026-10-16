import {assertOutlineWorkflowMutable,outlineArticleMutationFence,outlineWorkflowMutationFence} from './outline-flow';
import {db} from './test-store';
import {writeArticleSource} from './article-source-write';
import {hashText} from './writing-input';
import {readTextRevision} from './text-revision';
import {readDailyEditorialDraft,dailySourceBinding} from './daily-editorial';
import {makeArtifactManifest} from './article-manifest';
import {textOnlyResult} from './article-output-mode';
export async function finalizeVerifiedDailyRevision(owner:string,value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['flow_id','expected_body_sha256','confirm'].includes(k)))throw Error('复核交接参数无效');
 const input=value as {flow_id:string;expected_body_sha256:string;confirm:boolean};
 if(input.confirm!==true)throw Error('需要确认交接已复核的日更');
 const flow=await readTextRevision(owner,{flow_id:input.flow_id}),s=flow.snapshot,a=flow.rewritten_version?.article;
 if(!s.daily_source||!a||flow.current_phase!=='verified'||flow.results.verify?.report.passed!==true||flow.rewritten_version?.body_sha256!==input.expected_body_sha256)throw Error('日更独立复核尚未通过');
 const draft=await readDailyEditorialDraft(owner,s.day,s.writer,s.daily_source.outline_run_id),d=draft.row;
 if(JSON.stringify(s.daily_source)!==JSON.stringify(dailySourceBinding(draft)))throw Error('日更初稿绑定待核验');
 if(d.final_sha256&& (d.final_sha256!==input.expected_body_sha256||d.revision_flow_id!==input.flow_id))throw Error('最终稿已冻结');
 const paragraphs=[a.title,...a.paragraphs],source=new TextEncoder().encode(paragraphs.join('\n\n'));
 const sourceHash=await hashText(paragraphs.join('\n\n')),key=`articles/${d.article_id}/editorial-${sourceHash}.txt`,now=new Date().toISOString();
 const base=await makeArtifactManifest(draft.input,a.title,a.paragraphs,draft.input.sources!);
 const manifest={...base,output_mode:'text_only',author:'agent_text',text_revision:{contract_version:1,flow_id:s.flow_id,initial_writer:d.writer,initial_source:d.initial_source,initial_body_sha256:d.initial_sha256,provider_attempt_id:d.provider_attempt_id,final_source:'agent_text',final_body_sha256:input.expected_body_sha256,participants:s.participants,receipts:Object.fromEntries(Object.entries(flow.results).map(([stage,r])=>[stage,{execution_id:r.execution_id,actor_id:r.actor_id,model:r.model,result_sha256:r.result_sha256}])),verified_at:flow.results.verify.completed_at}};
 if(s.daily_source.outline_run_id)await assertOutlineWorkflowMutable(owner,s.daily_source.outline_run_id.split(':').at(-1)!);
 if(!d.final_sha256){
  await writeArticleSource(owner,d.article_id,key,source);
  await db().batch([
   db().prepare(`INSERT OR IGNORE INTO articles(id,owner,title,filename,source_key,paragraphs,created,state,artifact_manifest) SELECT w.article_id,w.owner,?,?,?,?,?,'text_saved',? FROM writing_runs w JOIN daily_editorial_drafts e ON e.run_id=w.id AND e.owner=w.owner WHERE w.id=? AND w.owner=? AND w.state='review_pending' AND e.initial_sha256=? AND e.final_sha256 IS NULL AND w.article_id=? AND ${outlineArticleMutationFence('w')}`).bind(a.title,`${a.title}.txt`,key,JSON.stringify(paragraphs),now,JSON.stringify(manifest),d.run_id,owner,d.initial_sha256,d.article_id),
   db().prepare(`UPDATE daily_editorial_drafts SET final_sha256=?,revision_flow_id=?,verified_at=? WHERE run_id=? AND owner=? AND final_sha256 IS NULL AND EXISTS(SELECT 1 FROM articles a WHERE a.id=daily_editorial_drafts.article_id AND a.owner=daily_editorial_drafts.owner AND a.source_key=? AND a.paragraphs=?) AND ${outlineArticleMutationFence('daily_editorial_drafts')}`).bind(input.expected_body_sha256,input.flow_id,flow.results.verify.completed_at,d.run_id,owner,key,JSON.stringify(paragraphs)),
   db().prepare(`UPDATE writing_runs SET state='text_saved',body_hash=?,updated=? WHERE id=? AND owner=? AND state='review_pending' AND EXISTS(SELECT 1 FROM daily_editorial_drafts e WHERE e.run_id=writing_runs.id AND e.owner=writing_runs.owner AND e.final_sha256=? AND e.revision_flow_id=?) AND ${outlineArticleMutationFence('writing_runs')}`).bind(sourceHash,now,d.run_id,owner,input.expected_body_sha256,input.flow_id),
  ]);
 }
 const final=await readDailyEditorialDraft(owner,s.day,s.writer,s.daily_source.outline_run_id);
 if(final.row.final_sha256!==input.expected_body_sha256||final.row.revision_flow_id!==input.flow_id)throw Error('最终稿交接待核验，不会重新生成');
 const article=await db().prepare('SELECT paragraphs,source_key,state FROM articles WHERE id=? AND owner=?').bind(d.article_id,owner).first<{paragraphs:string;source_key:string;state:string}>();
 if(!article||article.paragraphs!==JSON.stringify(paragraphs)||article.source_key!==key)throw Error('最终稿交接待核验，不会重新生成');
 const pipeline=textOnlyResult(d.article_id,article.state);
 let outlineHandoff:Record<string,unknown>={};
 if(s.daily_source.outline_run_id&&article.state==='text_saved'){await db().prepare(`UPDATE outline_flows SET state='finalized',updated=? WHERE owner=? AND article_id=? AND state IN ('body_review_pending','final_saved') AND ${outlineWorkflowMutationFence('outline_flows')}`).bind(now,owner,d.article_id).run();outlineHandoff={pipeline_state:'text_saved',handoff_complete:true,resume_action:'read_only',handoff_error:null};}

 return {...outlineHandoff,saved:true,state:article.state,output_mode:'text_only',article_id:d.article_id,final_source:'agent_text',editorial_phase:'verified',final_body_sha256:input.expected_body_sha256,already_saved:!!d.final_sha256,pipeline};
}
export const dailyEditorialFinalizeTools=[{name:'finalize_verified_daily_revision',description:'After genuine independent daily review/rewrite/verification passes, save only server-held version2 into the same original article ID, preserve initial provider text, as a terminal text-only website draft. Never accepts a body, calls a provider, retries generation or publishes publicly.',inputSchema:{type:'object',properties:{flow_id:{type:'string'},expected_body_sha256:{type:'string'},confirm:{type:'boolean',const:true}},required:['flow_id','expected_body_sha256','confirm'],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:true}}];
