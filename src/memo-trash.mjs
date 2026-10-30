import {bodyFor,digest,stable,fail} from './security.mjs';
import {storeFor,mutate} from './storage.mjs';
import {MEMO_LIMITS,memoId} from './memos-validation.mjs';
import {noteEditor,limitNoteWrites} from './public-note-access.mjs';

const deletedActor=owner=>'memo-purged:'+owner;
export const memoPurgedKey=(kind,id)=>kind+':'+id;
export async function memoWasPurged(store,owner,kind,id) {
  return Boolean(await store.get('SELECT key FROM idempotency WHERE actor=? AND key=?',deletedActor(owner),memoPurgedKey(kind,id)));
}
async function ownerSession(store,request,owner,env,origin) {
  const actor=await noteEditor(store,request,owner,env,'memos',origin,{write:true});
  if(actor.kind!=='session')throw fail(403,'MEMO_PURGE_LOGIN_REQUIRED','请先登录所有者账号，再清空回收站。');
  return actor;
}
function snapshot(items,max) {
  if(!Array.isArray(items)||items.length>max)throw fail(400,'VALIDATION_ERROR','回收站范围无效');
  const result=items.map(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).sort().join(',')!=='id,version'||
      !Number.isSafeInteger(item.version)||item.version<1)throw fail(400,'VALIDATION_ERROR','回收站版本无效');
    return {id:memoId(item.id),version:item.version};
  }).sort((a,b)=>a.id.localeCompare(b.id));
  if(result.some((item,i)=>i&&item.id===result[i-1].id))throw fail(400,'VALIDATION_ERROR','回收站范围重复');
  return result;
}
export async function clearMemoTrash(db,request,owner,env,origin) {
  await ownerSession(storeFor(db),request,owner,env,origin);
  limitNoteWrites(owner,'memos');
  const input=await bodyFor(request);
  if(Object.keys(input).sort().join(',')!=='groups,notes,save_id')throw fail(400,'VALIDATION_ERROR','回收站范围无效');
  const groups=snapshot(input.groups,MEMO_LIMITS.groups),notes=snapshot(input.notes,MEMO_LIMITS.notes),saveId=memoId(input.save_id);
  if(!groups.length&&!notes.length)throw fail(400,'VALIDATION_ERROR','回收站为空');
  const requestHash=digest(JSON.stringify(stable({groups,notes,save_id:saveId}))),key='memo-trash-clear:'+saveId;
  return (await mutate(db,async store=>{
    const actor=await ownerSession(store,request,owner,env,origin);
    const previous=await store.get('SELECT request_hash,response_json FROM idempotency WHERE actor=? AND key=?',actor.actor,key);
    if(previous) {
      if(previous.request_hash!==requestHash)throw fail(409,'IDEMPOTENCY_CONFLICT','操作标识已用于其他范围');
      return {replayed:true,response:Response.json({data:JSON.parse(previous.response_json)})};
    }
    const currentGroups=await store.all('SELECT id,version FROM matrix_memo_groups WHERE user_id=? AND deleted_at IS NOT NULL ORDER BY id',owner);
    const currentNotes=await store.all('SELECT n.id,n.version FROM matrix_memo_notes n JOIN matrix_memo_groups g ON g.user_id=n.user_id AND g.id=n.group_id WHERE n.user_id=? AND (n.deleted_at IS NOT NULL OR g.deleted_at IS NOT NULL) ORDER BY n.id',owner);
    if(JSON.stringify(groups)!==JSON.stringify(currentGroups)||JSON.stringify(notes)!==JSON.stringify(currentNotes))
      throw fail(409,'VERSION_CONFLICT','回收站内容已变化，请重新查看并确认');
    const now=new Date().toISOString(),purged=deletedActor(owner),receipt={cleared:true,groups:groups.length,notes:notes.length};
    // Mark IDs in the same transaction before deletion so an old offline create
    // cannot silently recreate a permanently cleared item.
    store.queue("INSERT INTO idempotency(actor,key,request_hash,response_json,status,created_at) SELECT ?, 'notes:'||n.id, '', '{}', 200, ? FROM matrix_memo_notes n JOIN matrix_memo_groups g ON g.user_id=n.user_id AND g.id=n.group_id WHERE n.user_id=? AND (n.deleted_at IS NOT NULL OR g.deleted_at IS NOT NULL)",purged,now,owner);
    store.queue("INSERT INTO idempotency(actor,key,request_hash,response_json,status,created_at) SELECT ?, 'groups:'||id, '', '{}', 200, ? FROM matrix_memo_groups WHERE user_id=? AND deleted_at IS NOT NULL",purged,now,owner);
    store.queue('DELETE FROM matrix_memo_notes WHERE user_id=? AND (deleted_at IS NOT NULL OR group_id IN (SELECT id FROM matrix_memo_groups WHERE user_id=? AND deleted_at IS NOT NULL))',owner,owner);
    store.queue('DELETE FROM matrix_memo_groups WHERE user_id=? AND deleted_at IS NOT NULL',owner);
    store.queue('INSERT INTO idempotency(actor,key,request_hash,response_json,status,created_at) VALUES(?,?,?,?,200,?)',actor.actor,key,requestHash,JSON.stringify(receipt),now);
    return {actor,response:Response.json({data:receipt})};
  })).response;
}
