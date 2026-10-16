import {db} from './test-store';
import {assertOutlineEditorialInput} from './outline-flow';
import {hashText,parseWritingInput,type WritingInputSnapshot} from './writing-input';
import {protectPreparedArticleForOwner} from './claude';
export type EditorialArticle = {title:string;paragraphs:string[]};
export type EditorialRun = {id:string;owner:string;day:string;writer:string;run_kind:string;article_id:string;input_snapshot:string;token:string;state:string};
export type DailyEditorialDraft = {run_id:string;owner:string;article_id:string;writer:'xiaoyu'|'claude';day:string;input_snapshot:string;initial_json:string;initial_sha256:string;initial_source:string;provider_attempt_id:string|null;created:string;final_sha256:string|null;revision_flow_id:string|null;verified_at:string|null};
export function requiresDailyEditorial(run:{run_kind:string;input_snapshot:string|null}) {return (run.run_kind==='daily'||run.run_kind.startsWith('outline_flow:'))&&parseWritingInput(run.input_snapshot)?.editorial_contract_version===1;}
export async function readDailyEditorialDraft(owner:string,day:string,writer:string,runId?:string) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!['xiaoyu','claude'].includes(writer))throw Error('日更审稿参数无效');
 const row=runId?await db().prepare("SELECT e.* FROM daily_editorial_drafts e JOIN writing_runs w ON w.id=e.run_id AND w.owner=e.owner JOIN outline_flows o ON w.run_kind='outline_flow:'||o.id AND o.owner=w.owner AND o.article_id=w.article_id WHERE e.owner=? AND e.day=? AND e.writer=? AND e.run_id=? AND w.article_id=e.article_id AND w.input_snapshot=e.input_snapshot AND o.writing_input=e.input_snapshot").bind(owner,day,writer,runId).first<DailyEditorialDraft>():await db().prepare('SELECT e.* FROM daily_editorial_drafts e JOIN writing_runs w ON w.id=e.run_id AND w.owner=e.owner WHERE e.owner=? AND e.day=? AND e.writer=? AND w.run_kind=\'daily\' AND w.article_id=e.article_id AND w.input_snapshot=e.input_snapshot').bind(owner,day,writer).first<DailyEditorialDraft>();
 if(!row)throw Error('日更初稿尚未保存');
 if(runId)await assertOutlineEditorialInput(owner,runId,row.input_snapshot);
 const input=parseWritingInput(row.input_snapshot),article=JSON.parse(row.initial_json) as EditorialArticle;
 if(input?.editorial_contract_version!==1||input.state!=='ready'||!input.input_sha256||await hashText(row.initial_json)!==row.initial_sha256)throw Error('日更初稿绑定待核验');
 if((await protectPreparedArticleForOwner(owner,{row,article,input})).hit)throw Error('日更资料安全校验未通过');
 return {row,input,article};
}
export async function saveDailyEditorialInitial(owner:string,run:EditorialRun,article:EditorialArticle) {
 const raw=JSON.stringify(article),hash=await hashText(raw);
 if((await protectPreparedArticleForOwner(owner,article)).hit)throw Error('日更资料安全校验未通过');
 const prior=await db().prepare('SELECT * FROM daily_editorial_drafts WHERE run_id=? AND owner=?').bind(run.id,owner).first<DailyEditorialDraft>();
 if(prior){if(prior.initial_json!==raw||prior.input_snapshot!==run.input_snapshot)throw Error('日更初稿已冻结，只能原样读取');return {saved:false,initial_saved:true,already_saved:true,read_only:true,article_id:run.article_id,editorial_phase:prior.final_sha256?'verified':'review_pending',initial_body_sha256:hash,pipeline:{state:'review_pending',event_dispatched:false}};}
 if(!requiresDailyEditorial(run)||run.state!=='writing')throw Error('日更初稿状态不匹配');
 const now=new Date().toISOString();
 await db().batch([
  db().prepare("INSERT OR IGNORE INTO daily_editorial_drafts(run_id,owner,article_id,writer,day,input_snapshot,initial_json,initial_sha256,initial_source,provider_attempt_id,created) SELECT id,owner,article_id,writer,day,input_snapshot,?,?,?,?,? FROM writing_runs WHERE id=? AND owner=? AND token=? AND state='writing' AND expires>? AND input_snapshot=? AND run_kind='daily'").bind(raw,hash,run.writer==='claude'?'claude_provider_text':'agent_initial_text',run.writer==='claude'?`${owner}:${run.day}`:null,now,run.id,owner,run.token,now,run.input_snapshot),
  db().prepare("UPDATE writing_runs SET state='review_pending',body_hash=?,topic=?,sources=?,updated=? WHERE id=? AND owner=? AND token=? AND state='writing' AND expires>? AND EXISTS(SELECT 1 FROM daily_editorial_drafts e WHERE e.run_id=writing_runs.id AND e.owner=writing_runs.owner AND e.initial_sha256=?)").bind(hash,parseWritingInput(run.input_snapshot)?.topic,JSON.stringify(parseWritingInput(run.input_snapshot)?.sources),now,run.id,owner,run.token,now,hash),
 ]);
 const stored=await readDailyEditorialDraft(owner,run.day,run.writer);
 if(stored.row.initial_sha256!==hash)throw Error('日更初稿已冻结，只能原样读取');
 return {saved:false,initial_saved:true,article_id:run.article_id,editorial_phase:'review_pending',initial_body_sha256:hash,pipeline:{state:'review_pending',event_dispatched:false}};
}
export async function assertDailyEditorialReady(owner:string,run:EditorialRun) {
 if(!requiresDailyEditorial(run))return;
 const draft=await readDailyEditorialDraft(owner,run.day,run.writer,run.run_kind.startsWith('outline_flow:')?run.id:undefined);
 if(!draft.row.final_sha256||!draft.row.revision_flow_id||!draft.row.verified_at)throw Error('独立审稿、改稿和复核尚未通过，不能进入配图');
}
export type DailySourceBinding = {outline_run_id?:string;run_id:string;article_id:string;input_sha256:string;initial_sha256:string};
export function dailySourceBinding(draft:{row:DailyEditorialDraft;input:WritingInputSnapshot}):DailySourceBinding {return {...(draft.row.run_id.startsWith('outline_flow:')?{outline_run_id:draft.row.run_id}:{}),run_id:draft.row.run_id,article_id:draft.row.article_id,input_sha256:draft.input.input_sha256!,initial_sha256:draft.row.initial_sha256};}

export async function readDailyEditorialProgress(owner:string,day:string,writer='claude') {
 const row=await db().prepare("SELECT e.run_id,e.final_sha256,e.revision_flow_id,w.state FROM daily_editorial_drafts e JOIN writing_runs w ON w.id=e.run_id AND w.owner=e.owner WHERE e.owner=? AND e.day=? AND e.writer=? AND w.run_kind='daily'").bind(owner,day,writer).first<{run_id:string;final_sha256:string|null;revision_flow_id:string|null;state:string}>();
 if(!row)return null;
 let phase='review_pending',flowId=row.revision_flow_id;
 if(!flowId){const batch=await db().prepare('SELECT id FROM manual_writing_batches WHERE owner=? AND authorization_key=?').bind(owner,`text_revision:daily-v1:${row.run_id}`).first<{id:string}>();flowId=batch?.id||null;}
 if(flowId){const root=await db().prepare('SELECT response FROM claude_attempts WHERE id=? AND owner=?').bind(`text_revision:${owner}:${flowId}`,owner).first<{response:string}>();try{const r=JSON.parse(root?.response||'{}').text_revision?.results;for(const stage of ['review','rewrite','verify']){if(!r?.[stage]){phase=`${stage}_pending`;break;}if(r[stage].report?.status!=='completed'){phase=`${stage}_failed`;break;}if(stage==='verify')phase=r[stage].report.passed===true?'verified':'verification_failed';}}catch{phase='state_unknown';}}
 const finalSaved=!!row.final_sha256;
 return {initial_saved:true,final_saved:finalSaved,editorial_phase:finalSaved?'verified':phase,revision_flow_id:flowId,outcome:finalSaved?'saved':phase,resume_action:finalSaved?'read_only':phase==='verified'?'finalize_verified':'independent_review',automatic_retry:false,delivery_state:row.state};
}
