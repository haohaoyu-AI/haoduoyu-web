import {bodyFor,digest,stable,fail} from './security.mjs';
import {consistentRead,mutate,storeFor} from './storage.mjs';
import {noteEditor,limitNoteWrites} from './public-note-access.mjs';
import {noteEntryId,noteEntryQuery,noteLabel} from './note-entry-validation.mjs';
export async function handleNoteLabels(db,request,owner,env,origin,initialRevision) {
  noteEntryQuery(new URL(request.url).searchParams,[]);
  const header=request.headers.get('X-Note-Labels-Version'),aware=header==='3'?3:header==='2'?2:header==='1'?1:0;
  const archiveAware=request.headers.get('X-Note-Labels-Archive')==='1';
  const data=value=>Response.json({data:{...value,...(aware?{labels_version:aware}:{})}});
  if(request.method==='GET')return consistentRead(db,async store=>{
    if(!await store.get('SELECT id FROM users WHERE id=?',owner))throw fail(503,'NOTES_CONFIG','碎碎念归属尚未核实');
    const labels=await store.all('SELECT name,created_at FROM matrix_note_labels WHERE user_id=? ORDER BY created_at,name LIMIT 201',owner);
    if(labels.length>200)throw fail(503,'NOTES_LIMIT','标签超过完整读取上限');
    const archived_labels=archiveAware?await store.all('SELECT name,archived_at FROM matrix_note_label_archives WHERE user_id=? ORDER BY name',owner):undefined;
    return data({labels,...(archiveAware?{archived_labels}:{})});
  },initialRevision);
  if(request.method!=='POST')throw fail(405,'METHOD_NOT_ALLOWED','不支持的标签操作');
  await noteEditor(storeFor(db),request,owner,env,'notes',origin,{write:true});
  limitNoteWrites(owner,'notes');
  const input=await bodyFor(request);
  if(archiveAware&&Object.hasOwn(input,'action'))return archiveLabel(db,request,owner,env,origin,input,data);
  if(Object.keys(input).sort().join(',')!=='name,save_id')throw fail(400,'VALIDATION_ERROR','标签字段无效');
  const name=noteLabel(input.name),saveId=noteEntryId(input.save_id),key='note-label:'+saveId;
  const hash=digest(JSON.stringify(stable({name,save_id:saveId})));
  return (await mutate(db,async store=>{
    const actor=await noteEditor(store,request,owner,env,'notes',origin,{write:true});
    if(!await store.get('SELECT id FROM users WHERE id=?',owner))throw fail(503,'NOTES_CONFIG','碎碎念归属尚未核实');
    const saved=await store.get('SELECT request_hash,response_json FROM idempotency WHERE actor=? AND key=?',actor.actor,key);
    if(saved) {
      if(saved.request_hash!==hash)throw fail(409,'IDEMPOTENCY_CONFLICT','保存标识已用于其他标签');
      return {replayed:true,response:data(JSON.parse(saved.response_json))};
    }
    let row=await store.get('SELECT name,created_at FROM matrix_note_labels WHERE user_id=? AND name=?',owner,name);
    if(!row) {
      const count=await store.get('SELECT count(*) AS n FROM matrix_note_labels WHERE user_id=?',owner);
      if(count.n>=200)throw fail(409,'NOTES_LIMIT','自建标签已达上限');
      row={name,created_at:new Date().toISOString()};
      store.queue('INSERT INTO matrix_note_labels(user_id,name,created_at) VALUES(?,?,?)',owner,name,row.created_at);
    }
    store.queue('INSERT INTO idempotency(actor,key,request_hash,response_json,status,created_at) VALUES(?,?,?,?,200,?)',actor.actor,key,hash,JSON.stringify(row),row.created_at);
    return {actor,response:data(row)};
  })).response;
}

async function archiveLabel(db,request,owner,env,origin,input,data) {
  if(Object.keys(input).sort().join(',')!=='action,name,save_id'||!['archive','restore'].includes(input.action))
    throw fail(400,'VALIDATION_ERROR','标签操作字段无效');
  const name=noteLabel(input.name,true),saveId=noteEntryId(input.save_id),key='note-label-archive:'+saveId;
  const hash=digest(JSON.stringify(stable({action:input.action,name,save_id:saveId})));
  return (await mutate(db,async store=>{
    const actor=await noteEditor(store,request,owner,env,'notes',origin,{write:true});
    if(!await store.get('SELECT id FROM users WHERE id=?',owner))throw fail(503,'NOTES_CONFIG','碎碎念用户配置未落实');
    const saved=await store.get('SELECT request_hash,response_json FROM idempotency WHERE actor=? AND key=?',actor.actor,key);
    if(saved) {
      if(saved.request_hash!==hash)throw fail(409,'IDEMPOTENCY_CONFLICT','保存标识已用于其他标签操作');
      return {replayed:true,response:data(JSON.parse(saved.response_json))};
    }
    const previous=await store.get('SELECT archived_at FROM matrix_note_label_archives WHERE user_id=? AND name=?',owner,name);
    let archived_at=null;
    if(input.action==='archive') {
      if(!previous&&!['生活','工作'].includes(name)&&!await store.get('SELECT name FROM matrix_note_labels WHERE user_id=? AND name=?',owner,name))
        throw fail(404,'NOT_FOUND','标签不存在');
      archived_at=previous?.archived_at??new Date().toISOString();
      if(!previous)store.queue('INSERT INTO matrix_note_label_archives(user_id,name,archived_at) VALUES(?,?,?)',owner,name,archived_at);
    } else if(previous)store.queue('DELETE FROM matrix_note_label_archives WHERE user_id=? AND name=?',owner,name);
    const result={name,archived_at};
    store.queue('INSERT INTO idempotency(actor,key,request_hash,response_json,status,created_at) VALUES(?,?,?,?,200,?)',actor.actor,key,hash,JSON.stringify(result),new Date().toISOString());
    return {actor,response:data(result)};
  })).response;
}
