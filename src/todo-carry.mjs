import {fail,now} from './security.mjs';
import {authenticateBusiness as authenticate,requireBusinessUser as requireAdmin,requireBusinessCsrf as requireCsrf} from './business-access.mjs';
import {mutate,storeFor} from './storage.mjs';
import {beijingDay} from './lib/time.mjs';

/** Days looked back for unfinished one-off to-dos. Older ones are left where they are. */
export const TODO_CARRY_DAYS = 7;
const CARRY_LIMIT = 50;
// A counted to-do ("2/4 次 …") is a quota for its own day, so it does not move to the next one.
const counted = text => /^\s*\d{1,3}\/(\d{1,3}|∞) ?次/.test(text);
const shift = (date,days) => new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);

/** The copy's id is derived from the original, so every device agrees on it and a copy is made once.
 * Deleting a copy keeps its row, which keeps the original from being carried again. */
export async function carriedTodoId(id) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('haoduoyu-todo-carry-v1:'+id)));
  bytes[6] = bytes[6] & 0x0f | 0x50; bytes[8] = bytes[8] & 0x3f | 0x80;
  const hex = [...bytes.slice(0,16)].map(byte => byte.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

/** POST /todo-carry: unfinished one-off to-dos from the last week reappear today. The originals stay
 * unfinished on their own day, so history still shows what was and was not done on each day. */
export async function handleTodoCarry(db,request,origin) {
  if(request.method!=='POST')throw fail(404,'NOT_FOUND','接口不存在');
  if(new URL(request.url).search)throw fail(400,'VALIDATION_ERROR','顺延接口不接受查询参数');
  const first=await authenticate(storeFor(db),request,'write');requireAdmin(first);requireCsrf(request,first,origin);
  const result=await mutate(db,async store=>{
    const actor=await authenticate(store,request,'write');requireAdmin(actor);requireCsrf(request,actor,origin);
    const today=beijingDay(Date.now());
    const rows=await store.all(`SELECT t.id,t.date,t.text,t.note FROM matrix_todos t
      LEFT JOIN matrix_todo_template_links l ON l.user_id=t.user_id AND l.todo_id=t.id
      WHERE t.user_id=? AND t.date>=? AND t.date<? AND t.completed=0 AND t.deleted_at IS NULL AND l.todo_id IS NULL
      ORDER BY t.date,t.created_at,t.rowid LIMIT ?`,actor.id,shift(today,-TODO_CARRY_DAYS),today,CARRY_LIMIT*4);
    const carried=[],stamp=now();
    for(const row of rows) {
      if(carried.length>=CARRY_LIMIT)break;
      if(counted(row.text))continue;
      const id=await carriedTodoId(row.id);
      if(await store.get('SELECT id FROM matrix_todos WHERE user_id=? AND id=?',actor.id,id))continue;
      store.queue('INSERT INTO matrix_todos(user_id,id,date,text,completed,version,created_at,updated_at,note) VALUES(?,?,?,?,0,1,?,?,?)',
        actor.id,id,today,row.text,stamp,stamp,row.note||'');
      carried.push({id,date:today,text:row.text,from:row.date});
    }
    const response=Response.json({data:{date:today,carried}});
    return carried.length?{actor,response}:{replayed:true,response};
  });
  return result.response;
}
