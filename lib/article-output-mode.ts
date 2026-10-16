import {db} from './test-store';

export const textOnlyResult = (article_id:string,state='text_saved') => ({article_id,state,output_mode:'text_only',event_dispatched:false,read_only:true});

/** Output policy is separate from immutable research, provider and prompt snapshots. */
export async function automaticArticle(owner:string,articleId:string) {
 return !!await db().prepare(`SELECT 1 AS automatic WHERE EXISTS(SELECT 1 FROM writing_runs WHERE owner=? AND article_id=?) OR EXISTS(SELECT 1 FROM editorial_runs_v3 WHERE owner=? AND article_id=?) OR EXISTS(SELECT 1 FROM editorial_flows WHERE owner=? AND article_id=?)`).bind(owner,articleId,owner,articleId,owner,articleId).first();
}

export function textOnlyArticle(row:{state:string;artifact_manifest?:string|null}) {
 if(row.state==='text_saved')return true;
 try{return JSON.parse(row.artifact_manifest||'null')?.output_mode==='text_only';}catch{return false;}
}

export async function assertArticleProcessingAllowed(owner:string,row:{id:string;state:string;artifact_manifest?:string|null}) {
 if(textOnlyArticle(row)||await automaticArticle(owner,row.id))throw Error('自动写文仅保存网站文字稿，不进入配图、Word或平台草稿流程');
}
