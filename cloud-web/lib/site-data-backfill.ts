import {z} from 'zod';
import {db} from './test-store';

// Explicit, owner-scoped maintenance. Schema installation never runs this code.
// Every page is a single atomic batch; unknown responses reuse the same nonce.
export const backfillScopes=['article_history','topic_fences','topic_control_keys'] as const;
type Scope=typeof backfillScopes[number];
type Row=Record<string,string|number|null>;
export class BackfillError extends Error {}
const pageSize=25;
const schema=z.object({scope:z.enum(backfillScopes)}).strict();
const applySchema=schema.extend({request_key:z.string().uuid(),snapshot_fingerprint:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const columns:Record<Scope,string[]>={
 article_history:['owner','history_key','article_id','record_json','evidence_sha256','completed_at'],
 topic_fences:['owner','research_id','holder_key','claim_sha256','input_sha256','held_at'],
 topic_control_keys:['owner','request_key','research_id','receipt_table','payload_sha256','result_json','legacy_conflict','created'],
};
const tables:Record<Scope,string>={article_history:'article_history',topic_fences:'topic_research_execution_fences',topic_control_keys:'topic_research_control_keys'};
const queries:Record<Scope,string>={
 article_history:`SELECT ${columns.article_history.map(c=>'v.'+c).join(',')} FROM article_history_backfill_candidates v WHERE v.owner=? AND NOT EXISTS(SELECT 1 FROM article_history t WHERE t.owner=v.owner AND t.history_key=v.history_key) ORDER BY v.history_key LIMIT 25`,
 topic_fences:`SELECT ${columns.topic_fences.map(c=>'v.'+c).join(',')} FROM topic_research_effective_fences v WHERE v.owner=? AND NOT EXISTS(SELECT 1 FROM topic_research_execution_fences t WHERE t.owner=v.owner AND t.research_id=v.research_id AND t.holder_key=v.holder_key) ORDER BY v.research_id,v.holder_key LIMIT 25`,
 topic_control_keys:`SELECT ${columns.topic_control_keys.map(c=>'v.'+c).join(',')} FROM topic_research_effective_control_keys v WHERE v.owner=? AND NOT EXISTS(SELECT 1 FROM topic_research_control_keys t WHERE t.owner=v.owner AND t.request_key=v.request_key) ORDER BY v.request_key LIMIT 25`,
};
async function digest(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(v=>v.toString(16).padStart(2,'0')).join('');}
function parse<T>(validator:z.ZodType<T>,args:unknown){const p=validator.safeParse(args);if(!p.success)throw new BackfillError('回填参数无效');return p.data;}
async function snapshot(owner:string,scope:Scope){
 const rows=(await db().prepare(queries[scope]).bind(owner).all<Row>()).results;
 const values=rows.map(r=>columns[scope].map(c=>r[c]));
 const serialized=JSON.stringify(values);
 return {rows,values,serialized,fingerprint:await digest(JSON.stringify({owner,scope,values})),scope};
}
function visible(s:Awaited<ReturnType<typeof snapshot>>){return {scope:s.scope,page_size:pageSize,candidate_count:s.rows.length,snapshot_fingerprint:s.fingerprint,has_candidates:s.rows.length>0,source_content_unchanged:true,execution_settlement:false,task_creation:false,platform_actions:0};}
export async function previewSiteDataBackfill(owner:string,args:unknown){const a=parse(schema,args);return visible(await snapshot(owner,a.scope));}
export async function readSiteDataBackfillReceipt(owner:string,args:unknown){
 const a=parse(z.object({request_key:z.string().uuid()}).strict(),args);
 const row=await db().prepare('SELECT payload,result FROM article_workspace_requests WHERE owner=? AND request_key=?').bind(owner,a.request_key).first<{payload:string;result:string}>();
 if(!row)return {request_key:a.request_key,confirmed:false};
 const payload=JSON.parse(row.payload);
 if(payload.operation!=='site_data_backfill_v1')throw new BackfillError('请求编号属于其他操作');
 return {...JSON.parse(row.result),confirmed:true};
}
export async function applySiteDataBackfill(owner:string,args:unknown){
 const a=parse(applySchema,args),payload=JSON.stringify({operation:'site_data_backfill_v1',scope:a.scope,snapshot_fingerprint:a.snapshot_fingerprint,page_size:pageSize});
 const receipt=()=>db().prepare('SELECT payload,result FROM article_workspace_requests WHERE owner=? AND request_key=?').bind(owner,a.request_key).first<{payload:string;result:string}>();
 const previous=await receipt();
 if(previous){if(previous.payload!==payload)throw new BackfillError('同一次回填请求不能改变范围或快照');return {...JSON.parse(previous.result),duplicate:true};}
 const s=await snapshot(owner,a.scope);
 if(s.fingerprint!==a.snapshot_fingerprint)throw new BackfillError('回填范围已变化，请重新只读预览；没有修改数据');
 const result={...visible(s),request_key:a.request_key,copied_count:s.rows.length,confirmed:true,requires_fresh_preview_for_next_page:true};
 // Compare the exact ordered current page again IN the same transaction.
 // An identical concurrent retry skips this guard after its receipt wins.
 const rowJson='json_array('+columns[a.scope].join(',')+')';
 const current=`(SELECT COALESCE(json_group_array(${rowJson}),'[]') FROM (${queries[a.scope]}))`;
 const guard=db().prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM article_workspace_requests WHERE owner=? AND request_key=? AND payload=?) OR ${current}=? THEN 1 ELSE json('site_backfill_snapshot_changed') END`).bind(owner,a.request_key,payload,owner,s.serialized);
 const checkKey=db().prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM article_workspace_requests WHERE owner=? AND request_key=? AND payload<>?) THEN 1 ELSE json('site_backfill_key_conflict') END`).bind(owner,a.request_key,payload);
 const stamp=new Date().toISOString();
 const commands=[checkKey,guard];
 for(const row of s.rows){
  const cols=[...columns[a.scope],...(a.scope==='article_history'?['created']:[])];
  const vals=[...columns[a.scope].map(c=>row[c]),...(a.scope==='article_history'?[stamp]:[])];
  commands.push(db().prepare(`INSERT OR IGNORE INTO ${tables[a.scope]}(${cols.join(',')}) SELECT ${cols.map(()=>'?').join(',')} WHERE NOT EXISTS(SELECT 1 FROM article_workspace_requests WHERE owner=? AND request_key=?)`).bind(...vals,owner,a.request_key));
 }
 commands.push(db().prepare('INSERT OR IGNORE INTO article_workspace_requests(owner,request_key,payload,result,created) VALUES(?,?,?,?,?)').bind(owner,a.request_key,payload,JSON.stringify(result),stamp));
 try{await db().batch(commands);}catch{throw new BackfillError('回填未确认或范围已变化；先用同一请求编号回读或重试，不能换编号盲目续接');}
 const saved=await receipt();
 if(!saved||saved.payload!==payload)throw new BackfillError('回填回执未确认；保留同一请求编号再核对');
 return JSON.parse(saved.result);
}
