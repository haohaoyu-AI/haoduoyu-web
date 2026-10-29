import {bodyFor,digest,stable,fail} from './security.mjs';
import {storeFor,consistentRead,mutate} from './storage.mjs';
import {dailyNotesOwner} from './daily-notes.mjs';
import {snapshotDate} from './business-snapshot.mjs';
import {noteEditor,limitNoteWrites} from './public-note-access.mjs';
import {beijingDay} from './lib/time.mjs';
import {NOTE_ENTRY_LIMITS,noteEntryId,noteEntryCategory,noteEntryQuery,noteEntryInput,noteLabel} from './note-entry-validation.mjs';
import {handleNoteLabels} from './note-labels.mjs';
import {handleNoteMonth} from './note-month.mjs';

const json=value=>Response.json({data:value});
const fields='id,category,date,text,version,change_seq,created_at,updated_at,deleted_at';
function entityHash(row) {
  return digest(JSON.stringify(stable(Object.fromEntries(fields.split(',').map(field=>[field,row[field]])))));
}
function view(row,canEdit,labels=[],version=0) {
  const label=labels[0]??null;
  return {...row,...(version===2?{labels_version:2,labels}:version===1?{labels_version:1,label}:label?{label}:{}),deleted:row.deleted_at!==null,can_edit:canEdit,content_hash:entityHash(row)};
}
const labelVersion=request=>request.headers.get('X-Note-Labels-Version')==='2'?2:request.headers.get('X-Note-Labels-Version')==='1'?1:0;
export async function labelsFor(store,owner,rows) {
  const result=new Map();
  for(let offset=0;offset<rows.length;offset+=50) {
    const batch=rows.slice(offset,offset+50);
    const labels=await store.all('SELECT entry_id,label FROM matrix_note_entry_labels WHERE user_id=? AND entry_id IN ('+batch.map(()=>'?').join(',')+') ORDER BY label',owner,...batch.map(row=>row.id));
    for(const row of labels) { if(!result.has(row.entry_id))result.set(row.entry_id,[]); result.get(row.entry_id).push(row.label); }
    const overrides=await store.all('SELECT entry_id,labels_json FROM matrix_note_entry_label_overrides WHERE user_id=? AND entry_id IN ('+batch.map(()=>'?').join(',')+')',owner,...batch.map(row=>row.id));
    for(const row of overrides) {
      let values;try { values=JSON.parse(row.labels_json); if(!Array.isArray(values)||values.length>200||new Set(values).size!==values.length||values.some(value=>noteLabel(value)!==value))throw Error(); } catch { throw fail(503,'NOTES_DATA','标签数据无法核对'); }
      result.set(row.entry_id,values.slice().sort());
    }
  }
  return result;
}
async function ownerExists(store,owner) {
  if(!await store.get('SELECT id FROM users WHERE id=?',owner))throw fail(503,'NOTES_CONFIG','碎碎念归属尚未核实');
}
async function rowFor(store,owner,id) {
  return store.get('SELECT '+fields+' FROM matrix_note_entries WHERE user_id=? AND id=?',owner,id);
}
async function ensureDaySpace(store,owner,category,date) {
  const count=await store.get('SELECT count(*) AS n FROM matrix_note_entries WHERE user_id=? AND category=? AND date=? AND deleted_at IS NULL',owner,category,date);
  if(count.n>=NOTE_ENTRY_LIMITS.per_day)throw fail(409,'NOTES_LIMIT','该日记录已达 200 条，请保留未保存草稿');
}
async function readEntries(db,request,route,owner,env,origin,initialRevision) {
  const query=new URL(request.url).searchParams;
  const aware=labelVersion(request);
  return consistentRead(db,async store=>{
    await ownerExists(store,owner);
    if(route==='/note-entries/dates') {
      noteEntryQuery(query,['category','before','page_size']);
      const category=noteEntryCategory(query.has('category')?query.get('category'):undefined);
      const before=query.has('before')?snapshotDate(query.get('before')):null,raw=query.get('page_size')||'30';
      if(!/^[1-9]\d*$/.test(raw)||Number(raw)>100)throw fail(400,'VALIDATION_ERROR','日期列表每页最多100项');
      const count=Number(raw),rows=await store.all('SELECT DISTINCT date FROM matrix_note_entries WHERE user_id=? AND category=? AND deleted_at IS NULL'+
        (before?' AND date<?':'')+' ORDER BY date DESC LIMIT ?',owner,category,...(before?[before]:[]),count+1);
      const dates=rows.slice(0,count).map(row=>row.date),has_more=rows.length>count;
      return json({dates,has_more,next_before:has_more?dates.at(-1):null});
    }
    if(route==='/note-entries') {
      noteEntryQuery(query,['category','date']);
      const category=noteEntryCategory(query.has('category')?query.get('category'):undefined);
      const date=query.has('date')?snapshotDate(query.get('date')):beijingDay(Date.now());
      const canEdit=Boolean(await noteEditor(store,request,owner,env,'notes',origin));
      const rows=await store.all('SELECT '+fields+' FROM matrix_note_entries WHERE user_id=? AND category=? AND date=? AND deleted_at IS NULL ORDER BY created_at,id LIMIT ?',
        owner,category,date,NOTE_ENTRY_LIMITS.per_day+1);
      if(rows.length>NOTE_ENTRY_LIMITS.per_day)throw fail(503,'NOTES_LIMIT','该日记录超过完整读取上限，请保留草稿后核对');
      const labels=await labelsFor(store,owner,rows);
      return json({category,date,...(aware?{labels_version:aware}:{}),entries:rows.map(row=>view(row,canEdit,labels.get(row.id)??[],aware)),can_edit:canEdit});
    }
    noteEntryQuery(query,[]);
    const operation=/^\/note-entries\/operations\/([^/]+)$/.exec(route);
    if(operation) {
      const saveId=noteEntryId(operation[1]),actor=await noteEditor(store,request,owner,env,'notes',origin);
      if(!actor)throw fail(request.headers.has('cookie')||request.headers.has('authorization')?403:401,'FORBIDDEN','当前身份无权读取此工作区保存状态');
      const saved=await store.get('SELECT response_json FROM idempotency WHERE actor=? AND key=?',actor.actor,'note-entry:'+saveId);
      if(!saved)return json({found:false,...(aware?{labels_version:aware}:{})});
      const receipt=JSON.parse(saved.response_json);
      if(!aware)return json({found:true,...receipt});
      const row=await rowFor(store,owner,receipt.id);
      if(!row)throw fail(503,'NOTES_RECEIPT','保存收据对应记录无法核对，请保留草稿');
      const labels=await labelsFor(store,owner,[row]);
      const current=labels.get(row.id)??[];
      return json({found:true,...receipt,labels_version:aware,...(aware===2?{labels:current}:{label:current[0]??null})});
    }
    const detail=/^\/note-entries\/([^/]+)$/.exec(route);
    if(!detail)throw fail(404,'NOT_FOUND','碎碎念接口不存在');
    const id=noteEntryId(detail[1]),canEdit=Boolean(await noteEditor(store,request,owner,env,'notes',origin)),row=await rowFor(store,owner,id);
    if(!row||!canEdit&&row.deleted_at!==null)throw fail(404,'NOT_FOUND','该条记录不存在');
    const labels=await labelsFor(store,owner,[row]);
    return json(view(row,canEdit,labels.get(row.id)??[],aware));
  },initialRevision);
}
async function writeEntry(db,request,route,owner,env,origin) {
  const method=request.method,match=/^\/note-entries\/([^/]+)(\/restore)?$/.exec(route);
  if(!match||!['PUT','DELETE','POST'].includes(method)||Boolean(match[2])!==(method==='POST'))
    throw fail(404,'NOT_FOUND','碎碎念接口不存在');
  noteEntryQuery(new URL(request.url).searchParams,[]);
  const id=noteEntryId(match[1]),restore=Boolean(match[2]);
  await noteEditor(storeFor(db),request,owner,env,'notes',origin,{write:true});
  limitNoteWrites(owner,'notes');
  const input=noteEntryInput(await bodyFor(request),method),key='note-entry:'+input.save_id;
  const hash=digest(JSON.stringify(stable({method,id,restore,...input})));
  return (await mutate(db,async store=>{
    await ownerExists(store,owner);
    const actor=await noteEditor(store,request,owner,env,'notes',origin,{write:true}),row=await rowFor(store,owner,id);
    const oldLabels=row?(await labelsFor(store,owner,[row])).get(id)??[]:[];
    const labels=method==='PUT'&&Object.hasOwn(input,'labels')?input.labels:row?oldLabels:input.label?[input.label]:[];
    const label=oldLabels[0]??null;
    const saved=await store.get('SELECT request_hash,response_json FROM idempotency WHERE actor=? AND key=?',actor.actor,key);
    if(saved) {
      if(saved.request_hash!==hash)throw fail(409,'IDEMPOTENCY_CONFLICT','保存标识已用于不同内容，请保留草稿');
      const receipt=JSON.parse(saved.response_json);
      if(!row||row.version!==receipt.version||entityHash(row)!==receipt.content_hash)
        throw fail(409,'VERSION_CONFLICT','该条记录已有更新，请先核对保存收据');
      return {replayed:true,response:json(view(row,true,oldLabels,labelVersion(request)))};
    }
    if((row?.version||0)!==input.version)throw fail(409,'VERSION_CONFLICT','该条记录已在其他位置更新，请保留草稿');
    if(method!=='PUT'&&!row)throw fail(404,'NOT_FOUND','该条记录不存在');
    if(method==='PUT'&&row) {
      if(row.category!==input.category||row.date!==input.date)throw fail(400,'VALIDATION_ERROR','已有记录的分类和日期不可更改');
      if(Object.hasOwn(input,'label')&&input.label!==label)throw fail(400,'VALIDATION_ERROR','已有记录的标签不可更改');
      if(row.deleted_at!==null)throw fail(409,'NOTE_ENTRY_DELETED','请先恢复已删除的记录');
    }
    if(restore&&row.deleted_at===null||method==='DELETE'&&row.deleted_at!==null)
      throw fail(409,'VERSION_CONFLICT','删除状态已变化，请重新读取');
    if(method==='PUT'&&!row||restore)await ensureDaySpace(store,owner,row?.category||input.category,row?.date||input.date);
    const changeSeq=(await store.get('SELECT revision FROM matrix_control WHERE id=1')).revision+1;
    if(!Number.isSafeInteger(changeSeq)||changeSeq<1)throw fail(503,'NOTES_REVISION','碎碎念版本需要私下核对，草稿尚未保存');
    const time=new Date().toISOString(),value={id,category:row?.category||input.category,date:row?.date||input.date,
      text:method==='PUT'?input.text:row.text,version:input.version+1,change_seq:changeSeq,created_at:row?.created_at||time,
      updated_at:time,deleted_at:method==='DELETE'?time:null};
    if(row)store.queue('UPDATE matrix_note_entries SET text=?,version=?,change_seq=?,updated_at=?,deleted_at=? WHERE user_id=? AND id=? AND version=?',
      value.text,value.version,changeSeq,time,value.deleted_at,owner,id,input.version);
    else store.queue('INSERT INTO matrix_note_entries(user_id,id,category,date,text,version,change_seq,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
      owner,id,value.category,value.date,value.text,value.version,changeSeq,time,time,null);
    store.expectChange();
    if(method==='PUT' && input.category==='life' && (!row || Object.hasOwn(input,'labels'))) {
      const missing=[];
      for(const name of labels)if(!await store.get('SELECT name FROM matrix_note_labels WHERE user_id=? AND name=?',owner,name))missing.push(name);
      if(missing.length) {
        const count=await store.get('SELECT count(*) AS n FROM matrix_note_labels WHERE user_id=?',owner);
        if(count.n+missing.length>200)throw fail(409,'NOTES_LIMIT','自建标签已达上限');
        for(const name of missing)store.queue('INSERT INTO matrix_note_labels(user_id,name,created_at) VALUES(?,?,?)',owner,name,time);
      }
      if(!row&&Object.hasOwn(input,'label'))store.queue('INSERT INTO matrix_note_entry_labels(user_id,entry_id,label) VALUES(?,?,?)',owner,id,input.label);
      else if(Object.hasOwn(input,'labels'))store.queue('INSERT INTO matrix_note_entry_label_overrides(user_id,entry_id,labels_json) VALUES(?,?,?) ON CONFLICT(user_id,entry_id) DO UPDATE SET labels_json=excluded.labels_json',owner,id,JSON.stringify(labels));
    }
    const receipt={id,version:value.version,deleted_at:value.deleted_at,change_seq:changeSeq,content_hash:entityHash(value)};
    store.queue('INSERT INTO idempotency(actor,key,request_hash,response_json,status,created_at) VALUES(?,?,?,?,200,?)',
      actor.actor,key,hash,JSON.stringify(receipt),time);
    return {actor,response:json(view(value,true,labels,labelVersion(request)))};
  })).response;
}
export async function handleNoteEntries(db,request,route,env,origin,initialRevision) {
  const owner=dailyNotesOwner(env);
  if(route==='/note-entries/labels')return handleNoteLabels(db,request,owner,env,origin,initialRevision);
  if(route==='/note-entries/month')return handleNoteMonth(db,request,owner,initialRevision);
  if(request.method==='GET')return readEntries(db,request,route,owner,env,origin,initialRevision);
  return writeEntry(db,request,route,owner,env,origin);
}
