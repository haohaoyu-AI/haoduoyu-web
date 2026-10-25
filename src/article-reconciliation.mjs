import {fail} from './security.mjs';
import {decodePipelineArticle} from './article-pipeline-io.mjs';
import {articleWarnings,verificationState} from './article-pipeline-query.mjs';

const statuses=['drafting','illustrated','draft_saved','published','failed'];
export function reconcileArticles(rows) {
  const counts=Object.fromEntries([...statuses,'unknown'].map(key=>[key,0])),dates=new Map(),numbers=new Map();
  for(const row of rows) {
    counts[statuses.includes(row.status)?row.status:'unknown']++;
    const date=row.run_date??null,key=date??'unknown';
    dates.set(key,{date,count:(dates.get(key)?.count??0)+1});
    if(row.slot==='gzh'&&Number.isSafeInteger(row.series_no)&&row.series_no>0) {
      const entries=numbers.get(row.series_no)||[];entries.push(row.id);numbers.set(row.series_no,entries);
    }
  }
  const ordered=[...numbers.keys()].sort((a,b)=>a-b),gap_ranges=[];
  for(let i=1;i<ordered.length;i++)if(ordered[i]>ordered[i-1]+1)gap_ranges.push({from:ordered[i-1]+1,to:ordered[i]-1});
  const insuranceRows=rows.filter(row=>row.slot==='gzh');
  return {complete:true,total:rows.length,counts,dates:[...dates.values()].sort((a,b)=>(a.date??'z').localeCompare(b.date??'z')),
    schedule:{configured:false,expected:null,missing:null,overdue:null},rows,
    insurance:{basis:'explicit_gzh_slot',recorded:insuranceRows.length,numbered:insuranceRows.filter(row=>row.series_no!=null).length,
      unique_count:ordered.length,highest:ordered.at(-1)??null,lowest:ordered[0]??null,
      duplicate_numbers:ordered.filter(number=>numbers.get(number).length>1).map(number=>({number,article_ids:numbers.get(number)})),
      observed_gap_ranges:gap_ranges,start:null,target:null,sample_mapping:'unknown',
      counts:Object.fromEntries([...statuses,'unknown'].map(key=>[key,insuranceRows.filter(row=>
        (statuses.includes(row.status)?row.status:'unknown')===key).length]))}};
}
export async function readArticleReconciliation(store,query,scope) {
  if(Object.keys(query).length)fail(400,'VALIDATION_ERROR','实际对账接口不接受隐式日期或排期参数');
  const rows=[],params=scope===null?[]:[JSON.stringify(scope)];
  const where=scope===null?'':' WHERE a.account_id IN (SELECT value FROM json_each(?))';
  for(let offset=0;;offset+=200) {
    const page=await store.all(`SELECT a.id,a.account_id,a.title,a.status,a.slot,a.writer,a.run_date,a.series_no,
      a.sample_json,a.verify_items_json,a.draft_ref_json,a.char_count,a.subheading_count,a.image_count,c.platform
      FROM articles a JOIN accounts c ON c.id=a.account_id${where} ORDER BY a.run_date DESC,a.id LIMIT 200 OFFSET ?`,...params,offset);
    rows.push(...page.map(raw=>{
      const row=decodePipelineArticle(raw);
      return {id:row.id,account_id:row.account_id,title:row.title,status:row.status,slot:row.slot,writer:row.writer,
        run_date:row.run_date,series_no:row.series_no,sample:row.sample,warnings:articleWarnings(row),...verificationState(row),
        missing_fields:['run_date','status','slot','writer',...(row.slot==='gzh'?['series_no']:[])].filter(key=>row[key]==null||row[key]==='unknown')};
    }));
    if(rows.length>4000||Buffer.byteLength(JSON.stringify(rows))>1048576)fail(413,'RECONCILIATION_LIMIT','完整对账超过预算，未返回部分结果');
    if(page.length<200)break;
  }
  return reconcileArticles(rows);
}
