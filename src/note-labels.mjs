import {bodyFor,digest,stable,fail} from './security.mjs';
import {consistentRead,mutate,storeFor} from './storage.mjs';
import {noteEditor,limitNoteWrites} from './public-note-access.mjs';
import {noteEntryId,noteEntryQuery,noteLabel} from './note-entry-validation.mjs';
export async function handleNoteLabels(db,request,owner,env,origin,initialRevision) {
  noteEntryQuery(new URL(request.url).searchParams,[]);
  const aware=request.headers.get('X-Note-Labels-Version')==='1';
  const data=value=>Response.json({data:{...value,...(aware?{labels_version:1}:{})}});
  if(request.method==='GET')return consistentRead(db,async store=>{
    if(!await store.get('SELECT id FROM users WHERE id=?',owner))throw fail(503,'NOTES_CONFIG','碎碎念归属尚未核实');
    const labels=await store.all('SELECT name,created_at FROM matrix_note_labels WHERE user_id=? ORDER BY created_at,name LIMIT 201',owner);
    if(labels.length>200)throw fail(503,'NOTES_LIMIT','标签超过完整读取上限');
    return data({labels});
  },initialRevision);
  if(request.method!=='POST')throw fail(405,'METHOD_NOT_ALLOWED','不支持的标签操作');
  await noteEditor(storeFor(db),request,owner,env,'notes',origin,{write:true});
  limitNoteWrites(owner,'notes');
  const input=await bodyFor(request);
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
