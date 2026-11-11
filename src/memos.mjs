import {bodyFor,digest,stable,fail} from './security.mjs';
import {storeFor,consistentRead,mutate} from './storage.mjs';
import {MEMO_LIMITS,memoId,memoInput,memosOwner} from './memos-validation.mjs';

import {noteEditor,noteDraftScope,limitNoteWrites} from './public-note-access.mjs';
import {clearMemoTrash,memoWasPurged} from './memo-trash.mjs';

const json=value=>Response.json({data:value});
const fields='id,title,position,version,change_seq,created_at,updated_at,deleted_at';
const select={groups:fields,notes:fields+',group_id,body'};
const tables={groups:'matrix_memo_groups',notes:'matrix_memo_notes'};
function entityHash(row) {return digest(JSON.stringify(stable(row)));}
async function ownerExists(store,owner) {
  if(!await store.get('SELECT id FROM users WHERE id=?',owner))throw fail(503,'MEMOS_CONFIG','备忘录归属尚未核实');
}
async function rowFor(store,kind,owner,id) {
  return store.get(`SELECT ${select[kind]} FROM ${tables[kind]} WHERE user_id=? AND id=?`,owner,id);
}
async function activeParent(store,owner,id) {
  const group=await store.get('SELECT id,deleted_at FROM matrix_memo_groups WHERE user_id=? AND id=?',owner,id);
  if(!group||group.deleted_at!==null)throw fail(409,'MEMO_GROUP_UNAVAILABLE','分组已删除或不存在，请先恢复分组');
}
async function readIndex(store,request,owner,env,origin) {
  const actor=await noteEditor(store,request,owner,env,'memos',origin),editable=Boolean(actor);
  const groups=await store.all('SELECT '+fields+' FROM matrix_memo_groups WHERE user_id=?'+
    (editable?'':' AND deleted_at IS NULL')+' ORDER BY position,created_at,id LIMIT ?',owner,MEMO_LIMITS.groups+1);
  const notes=await store.all('SELECT '+fields.split(',').map(field=>'n.'+field).join(',')+',n.group_id FROM matrix_memo_notes n '+
    'JOIN matrix_memo_groups g ON g.user_id=n.user_id AND g.id=n.group_id WHERE n.user_id=?'+
    (editable?'':' AND n.deleted_at IS NULL AND g.deleted_at IS NULL')+' ORDER BY n.position,n.created_at,n.id LIMIT ?',owner,MEMO_LIMITS.notes+1);
  if(groups.length>MEMO_LIMITS.groups||notes.length>MEMO_LIMITS.notes)throw fail(503,'MEMOS_LIMIT','备忘录数量超过当前读取上限');
  return json({groups:groups.map(group=>({...group,active_note_count:notes.filter(note=>note.group_id===group.id&&note.deleted_at===null).length})),
    notes,can_edit:editable,...(actor?.kind==='public'?{draft_scope:noteDraftScope(owner)}:{})});
}
async function readMemo(db,request,route,owner,env,origin,initialRevision) {
  return consistentRead(db,async store=>{
    await ownerExists(store,owner);
    if(route==='/memos')return readIndex(store,request,owner,env,origin);
    const receipt=/^\/memos\/operations\/([^/]+)$/.exec(route);
    if(receipt) {
      memoId(receipt[1]);
      const actor=await noteEditor(store,request,owner,env,'memos',origin);
      if(!actor)throw fail(request.headers.has('cookie')||request.headers.has('authorization')?403:401,'FORBIDDEN','当前身份无权读取此工作区保存状态');
      const saved=await store.get('SELECT response_json FROM idempotency WHERE actor=? AND key=?',actor.actor,'memo:'+receipt[1]);
      return json(saved?{found:true,...JSON.parse(saved.response_json)}:{found:false});
    }
    const detail=/^\/memos\/notes\/([^/]+)$/.exec(route);
    if(!detail)throw fail(404,'NOT_FOUND','备忘录接口不存在');
    const id=memoId(detail[1]),editable=Boolean(await noteEditor(store,request,owner,env,'memos',origin)),row=await rowFor(store,'notes',owner,id);
    if(!row)throw fail(404,'NOT_FOUND','笔记不存在');
    if(!editable) {
      const group=await rowFor(store,'groups',owner,row.group_id);
      if(row.deleted_at!==null||!group||group.deleted_at!==null)throw fail(404,'NOT_FOUND','笔记不存在');
    }
    return json({...row,can_edit:editable});
  },initialRevision);
}
async function validateChange(store,kind,method,restore,owner,row,input) {
  if((row?.version||0)!==input.version)throw fail(409,'VERSION_CONFLICT','备忘录已在其他位置更新，请保留草稿并核对');
  if(method!=='PUT'&&!row)throw fail(404,'NOT_FOUND','备忘录不存在');
  if(row&&method==='PUT'&&row.deleted_at!==null)throw fail(409,'MEMO_DELETED','请先恢复已删除的备忘录');
  if(restore&&row.deleted_at===null||method==='DELETE'&&row.deleted_at!==null)
    throw fail(409,'VERSION_CONFLICT','删除状态已变化，请重新读取');
  if(method==='PUT'&&!row) {
    const count=await store.get(`SELECT count(*) AS n FROM ${tables[kind]} WHERE user_id=?`,owner);
    if(count.n>=MEMO_LIMITS[kind])throw fail(409,'MEMOS_LIMIT','备忘录数量已达上限，回收站记录也计入');
  }
  if(kind==='notes'&&(method==='PUT'||restore)) {
    if(row&&method==='PUT'&&row.group_id!==input.group_id)throw fail(400,'VALIDATION_ERROR','笔记所属分组不可更改');
    await activeParent(store,owner,row?.group_id||input.group_id);
  }
  if(kind==='groups'&&method==='DELETE') {
    const count=await store.get('SELECT count(*) AS n FROM matrix_memo_notes WHERE user_id=? AND group_id=? AND deleted_at IS NULL',owner,row.id);
    if(input.confirm_title!==row.title||input.confirm_note_count!==count.n)
      throw fail(409,'MEMO_DELETE_CONFIRMATION','分组内容已变化，请重新确认标题和笔记数量');
  }
}
function nextValue(row,kind,id,input,method,restore,changeSeq,time) {
  const content=method==='PUT'?{title:input.title,position:input.position,
    ...(kind==='notes'?{group_id:input.group_id,body:input.body}:{})}:row;
  return {...content,id,version:input.version+1,change_seq:changeSeq,created_at:row?.created_at||time,
    updated_at:time,deleted_at:method==='DELETE'?time:restore||!row?null:row.deleted_at};
}
function queueValue(store,kind,owner,row,value) {
  const columns=select[kind].split(',');
  if(row) {
    const changed=columns.filter(field=>!['id','created_at'].includes(field));
    store.queue(`UPDATE ${tables[kind]} SET ${changed.map(field=>field+'=?').join(',')} WHERE user_id=? AND id=? AND version=?`,
      ...changed.map(field=>value[field]),owner,value.id,row.version);
  } else store.queue(`INSERT INTO ${tables[kind]}(user_id,${columns.join(',')}) VALUES(?,${columns.map(()=>'?').join(',')})`,
    owner,...columns.map(field=>value[field]));
  store.expectChange();
}
async function writeMemo(db,request,route,owner,env,origin) {
  const method=request.method,match=/^\/memos\/(groups|notes)\/([^/]+)(\/restore)?$/.exec(route);
  if(!match||!['PUT','DELETE','POST'].includes(method)||Boolean(match[3])!==(method==='POST'))
    throw fail(404,'NOT_FOUND','备忘录接口不存在');
  const [,kind,rawId,suffix]=match,id=memoId(rawId),restore=Boolean(suffix);
  await noteEditor(storeFor(db),request,owner,env,'memos',origin,{write:true});
  limitNoteWrites(owner,'memos');
  const input=memoInput(await bodyFor(request),kind,method,restore),key='memo:'+input.save_id;
  const hash=digest(JSON.stringify(stable({method,kind,id,restore,...input})));
  return (await mutate(db,async store=>{
    await ownerExists(store,owner);
    const actor=await noteEditor(store,request,owner,env,'memos',origin,{write:true}),row=await rowFor(store,kind,owner,id);
    if(method==='PUT'&&await memoWasPurged(store,owner,kind,id))
      throw fail(409,'MEMO_PERMANENTLY_DELETED','该备忘录已被永久删除');
    const saved=await store.get('SELECT request_hash,response_json FROM idempotency WHERE actor=? AND key=?',actor.actor,key);
    if(saved) {
      if(saved.request_hash!==hash)throw fail(409,'IDEMPOTENCY_CONFLICT','保存标识已用于不同内容，请保留草稿');
      const receipt=JSON.parse(saved.response_json);
      if(!row||row.version!==receipt.version||entityHash(row)!==receipt.entity_hash)
        throw fail(409,'VERSION_CONFLICT','备忘录已有更新，请先核对保存收据');
      return {replayed:true,response:json({...row,can_edit:true})};
    }
    await validateChange(store,kind,method,restore,owner,row,input);
    const changeSeq=(await store.get('SELECT revision FROM matrix_control WHERE id=1')).revision+1;
    if(!Number.isSafeInteger(changeSeq)||changeSeq<1)throw fail(503,'MEMOS_REVISION','备忘录修订号需要核对，请保留草稿');
    const time=new Date().toISOString(),value=nextValue(row,kind,id,input,method,restore,changeSeq,time);
    queueValue(store,kind,owner,row,value);
    const receipt={kind,id,version:value.version,deleted_at:value.deleted_at,change_seq:changeSeq,entity_hash:entityHash(value)};
    store.queue('INSERT INTO idempotency(actor,key,request_hash,response_json,status,created_at) VALUES(?,?,?,?,200,?)',
      actor.actor,key,hash,JSON.stringify(receipt),time);
    return {actor,response:json({...value,can_edit:true})};
  })).response;
}
export async function handleMemos(db,request,route,env,origin,initialRevision) {
  const owner=memosOwner(env);
  if(new URL(request.url).search)throw fail(400,'VALIDATION_ERROR','备忘录接口不接受查询参数');
  if(route==='/memos/trash/clear'&&request.method==='POST')return clearMemoTrash(db,request,owner,env,origin);
  if(request.method==='GET')return readMemo(db,request,route,owner,env,origin,initialRevision);
  return writeMemo(db,request,route,owner,env,origin);
}
