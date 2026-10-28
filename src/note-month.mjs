import {fail} from './security.mjs';
import {consistentRead} from './storage.mjs';
import {snapshotDate} from './business-snapshot.mjs';
import {noteEntryQuery} from './note-entry-validation.mjs';

const MAX_ROWS=2000,MAX_BYTES=1048576;
const tooLarge=()=>fail(413,'NOTES_MONTH_LIMIT','该月记录超过完整读取上限，请缩小范围后核对');
export const noteMonthSources=Object.freeze([
  {table:'matrix_daily_notes',category:'life',legacy:true},
  {table:'matrix_daily_work_notes',category:'work',legacy:true},
  {table:'matrix_note_entries',category:'life',legacy:false},
  {table:'matrix_note_entries',category:'work',legacy:false},
].map(Object.freeze));
export function noteMonthQueries(source) {
  const clause='user_id=?'+(source.legacy?'':' AND category=?')+
    ' AND date>=? AND date<=? AND deleted_at IS NULL'+(source.legacy?" AND text<>''":'');
  const stat='SELECT count(*) AS n,coalesce(sum(length(CAST(text AS BLOB))),0) AS bytes FROM '+
    '(SELECT text FROM '+source.table+' WHERE '+clause+' LIMIT ?)';
  const select=source.legacy?'date,text,updated_at':'id,category,date,text,created_at,updated_at';
  const rows='SELECT '+select+' FROM '+source.table+' WHERE '+clause+
    ' ORDER BY date'+(source.legacy?'':',created_at,id')+' LIMIT ?';
  return {stat,rows};
}
const params=(source,owner,start,end,limit)=>[owner,...(source.legacy?[]:[source.category]),start,end,limit];
export async function handleNoteMonth(db,request,owner,initialRevision) {
  if(request.method!=='GET')throw fail(405,'METHOD_NOT_ALLOWED','月记录只提供读取');
  const query=new URL(request.url).searchParams;
  noteEntryQuery(query,['month']);
  const month=query.get('month');
  if(!month||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month.startsWith('0000'))
    throw fail(400,'VALIDATION_ERROR','月份必须为 YYYY-MM');
  const start=month+'-01',end=month+'-31';
  return consistentRead(db,async store=>{
    if(!await store.get('SELECT id FROM users WHERE id=?',owner))throw fail(503,'NOTES_CONFIG','碎碎念归属尚未核实');
    let count=0,bytes=0;
    const counts=[];
    for(const source of noteMonthSources) {
      const stats=await store.get(noteMonthQueries(source).stat,...params(source,owner,start,end,MAX_ROWS-count+1));
      count+=stats.n;bytes+=stats.bytes;
      if(count>MAX_ROWS||bytes>MAX_BYTES)tooLarge();
      counts.push(stats.n);
    }
    const days=new Map();
    for(const [index,source] of noteMonthSources.entries()) {
      const rows=await store.all(noteMonthQueries(source).rows,...params(source,owner,start,end,counts[index]+1));
      if(rows.length!==counts[index])throw fail(503,'NOTES_DATA','月记录读取数量无法核对');
      for(const row of rows) {
        try {if(snapshotDate(row.date)!==row.date||!row.date.startsWith(month+'-'))throw Error();}
        catch {throw fail(503,'NOTES_DATA','月记录日期无法核对');}
        const category=source.legacy?source.category:row.category;
        if(!['life','work'].includes(category)||typeof row.text!=='string')throw fail(503,'NOTES_DATA','月记录内容无法核对');
        const item={entity_id:source.legacy?'legacy-'+category+':'+row.date:'note-entry:'+row.id,
          source:source.legacy?'legacy_daily_note':'note_entry',category,label:null,text:row.text,
          created_at:source.legacy?null:row.created_at,updated_at:row.updated_at};
        if(!days.has(row.date))days.set(row.date,[]);
        days.get(row.date).push(item);
      }
    }
    const value={format:'haoduoyu-note-month-v1',month,complete:true,labels_version:0,
      days:[...days].sort(([a],[b])=>a.localeCompare(b)).map(([date,items])=>({date,
        items:items.sort((a,b)=>String(a.created_at??'').localeCompare(String(b.created_at??''))||a.entity_id.localeCompare(b.entity_id))}))};
    const serialized=JSON.stringify({data:value});
    if(Buffer.byteLength(serialized)>MAX_BYTES)tooLarge();
    return new Response(serialized,{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  },initialRevision);
}
