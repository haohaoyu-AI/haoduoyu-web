import {fail} from './security.mjs';
import {consistentRead} from './storage.mjs';
import {snapshotDate} from './business-snapshot.mjs';
import {noteEntryQuery} from './note-entry-validation.mjs';

// A month is returned in full or not at all. In particular, never turn an
// exhausted budget into an apparently empty calendar day.
const MAX_ROWS=2000, MAX_BYTES=1048576;
const tooLarge=()=>fail(413,'NOTES_MONTH_LIMIT','该月记录超过完整读取上限，请缩小范围后核对');
const sources=[
  {table:'matrix_daily_notes',category:'life',legacy:true},
  {table:'matrix_daily_work_notes',category:'work',legacy:true},
  {table:'matrix_note_entries',legacy:false},
];

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
    for(const source of sources) {
      const where='user_id=? AND date>=? AND date<=? AND deleted_at IS NULL'+(source.legacy?" AND text<>''":'');
      const stats=await store.get('SELECT count(*) AS n,coalesce(sum(length(CAST(text AS BLOB))),0) AS bytes FROM '+source.table+' WHERE '+where,owner,start,end);
      count+=stats.n;bytes+=stats.bytes;
      if(count>MAX_ROWS||bytes>MAX_BYTES)tooLarge();
    }
    const days=new Map();
    for(const source of sources) {
      const alias=source.legacy?'':'e.';
      const where=alias+'user_id=? AND '+alias+'date>=? AND '+alias+'date<=? AND '+alias+'deleted_at IS NULL'+(source.legacy?" AND text<>''":'');
      const select=source.legacy?'date,text,updated_at':
        'e.id,e.category,e.date,e.text,e.created_at,e.updated_at,l.label';
      const from=source.legacy?source.table:source.table+' e LEFT JOIN matrix_note_entry_labels l ON l.user_id=e.user_id AND l.entry_id=e.id';
      const rows=await store.all('SELECT '+select+' FROM '+from+' WHERE '+where+' ORDER BY '+alias+'date,'+(source.legacy?'date':'e.created_at,e.id')+' LIMIT ?',owner,start,end,MAX_ROWS+1);
      if(rows.length>MAX_ROWS)tooLarge();
      for(const row of rows) {
        try {if(snapshotDate(row.date)!==row.date||!row.date.startsWith(month+'-'))throw Error();}catch {throw fail(503,'NOTES_DATA','月记录日期无法核对');}
        const category=source.legacy?source.category:row.category;
        if(!['life','work'].includes(category)||typeof row.text!=='string'||!source.legacy&&row.label!==null&&typeof row.label!=='string')
          throw fail(503,'NOTES_DATA','月记录内容无法核对');
        const item={entity_id:source.legacy?'legacy-'+category+':'+row.date:'note-entry:'+row.id,
          source:source.legacy?'legacy_daily_note':'note_entry',category,label:source.legacy?null:row.label,
          text:row.text,created_at:source.legacy?null:row.created_at,updated_at:row.updated_at};
        if(!days.has(row.date))days.set(row.date,[]);
        days.get(row.date).push(item);
      }
    }
    const value={month,complete:true,labels_version:1,days:[...days].sort(([a],[b])=>a.localeCompare(b)).map(([date,items])=>({
      date,items:items.sort((a,b)=>String(a.created_at??'').localeCompare(String(b.created_at??''))||a.entity_id.localeCompare(b.entity_id))
    }))};
    const serialized=JSON.stringify({data:value});
    if(Buffer.byteLength(serialized)>MAX_BYTES)tooLarge();
    return new Response(serialized,{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  },initialRevision);
}
