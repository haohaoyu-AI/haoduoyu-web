import {redactWordCredentialText} from './word-credentials';
import { db } from './test-store';
import { writingList } from './writing';
import { listScopeSql, protectedArticleSql, visibleArticleSql } from './article-list-policy';
export async function writingStudioList(owner:string, offset=0) {
  if(!Number.isSafeInteger(offset)||offset<0||offset>10000)throw Error('列表位置无效');
  const pending=`SELECT w.id,w.article_id,COALESCE(a.created,w.created) AS created,'legacy' AS kind FROM writing_runs w LEFT JOIN articles a ON a.owner=w.owner AND a.id=w.article_id
    WHERE w.owner=? AND w.run_kind NOT LIKE 'text_revision:%' AND NOT EXISTS(SELECT 1 FROM article_deletions x WHERE x.owner=w.owner AND x.id=w.article_id)
    AND ((a.id IS NULL AND w.state NOT IN ('text_saved','submitted','permanently_deleted')) OR (a.id IS NOT NULL AND ${protectedArticleSql('a')}))
    UNION ALL SELECT v.id,v.article_id,v.created,'v3' AS kind FROM editorial_runs_v3 v WHERE v.owner=? AND v.state<>'text_saved'
      AND NOT EXISTS(SELECT 1 FROM article_deletions x WHERE x.owner=v.owner AND x.id=v.article_id)
      AND NOT EXISTS(SELECT 1 FROM writing_runs w WHERE w.owner=v.owner AND w.article_id=v.article_id)`;
  const total=await db().prepare(`SELECT count(*) AS n FROM (${pending})`).bind(owner,owner).first<{n:number}>();
  const page=(await db().prepare(`SELECT * FROM (${pending}) ORDER BY created DESC,id DESC LIMIT 25 OFFSET ?`).bind(owner,owner,offset).all<{id:string;article_id:string;kind:string}>()).results;
  const recent=offset===0?(await db().prepare(`SELECT id FROM articles WHERE owner=? AND ${listScopeSql('writing')} AND ${visibleArticleSql()} AND NOT ${protectedArticleSql()} ORDER BY created DESC,id DESC LIMIT 5`).bind(owner).all<{id:string}>()).results.map(r=>r.id):[];
  const recentRuns=recent.length?(await db().prepare(`SELECT id FROM writing_runs WHERE owner=? AND article_id IN(${recent.map(()=>'?').join(',')}) AND run_kind NOT LIKE 'text_revision:%'`).bind(owner,...recent).all<{id:string}>()).results.map(r=>r.id):[];
  const runIds=[...new Set([...page.filter(r=>r.kind==='legacy').map(r=>r.id),...recentRuns])];
  const items:Record<string,unknown>[]=await writingList(owner,50,false,runIds);
  for(const run of page.filter(r=>r.kind==='v3')) {
    const row=await db().prepare(`SELECT id AS run_id,article_id,created,writer,run_kind,state,error,
      COALESCE(json_extract(CASE WHEN json_valid(snapshot_json) THEN snapshot_json ELSE '{}' END,'$.topic'),'写作任务') AS title
      FROM editorial_runs_v3 WHERE owner=? AND id=?`).bind(owner,run.id).first<Record<string,unknown>>();
    if(row)items.push({...row,list_section:'work',paragraphs:[],sources:[],output_mode:'text_only'});
  }
  for(const id of recent.filter(id=>!items.some(item=>item.article_id===id))) {
    const row=await db().prepare('SELECT id AS article_id,title,created,state,error,paragraphs,result_key,artifact_manifest FROM articles WHERE owner=? AND id=?').bind(owner,id).first<{article_id:string;title:string;created:string;state:string;error:string|null;paragraphs:string;result_key:string|null;artifact_manifest:string|null}>();
    if(row)items.push({...row,list_section:'recent',paragraphs:JSON.parse(row.paragraphs),sources:[],has_result:!!row.result_key,result_key:undefined,artifact_manifest:undefined,output_mode:row.state==='text_saved'?'text_only':null});
  }
  return {items:await Promise.all(items.map(async(item)=>({...item,error:await redactWordCredentialText(owner,item.error)}))),pending_total:total?.n||0,next_offset:offset+page.length<(total?.n||0)?offset+page.length:null};
}
