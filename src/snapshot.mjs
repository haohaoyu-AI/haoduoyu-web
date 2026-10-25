import {fail} from './security.mjs';
import {consistentRead} from './storage.mjs';
import {snapshotDate} from './business-snapshot.mjs';
import {snapshotAccess} from './snapshot-access.mjs';
import {snapshotBudget,snapshotDatabase} from './snapshot-budget.mjs';
import {readSnapshotData,snapshotForDate,snapshotIndex} from './snapshot-projection.mjs';

export async function handleSnapshot(db,request,route,env,{limits={}}={}) {
  if(!['/snapshot','/snapshot/index'].includes(route)||request.method!=='GET')fail(404,'NOT_FOUND','快照只提供明确的只读接口');
  const query=new URL(request.url).searchParams,index=route==='/snapshot/index';
  if(index?[...query].length!==0:[...query].length!==1||query.getAll('date').length!==1)
    fail(400,'VALIDATION_ERROR',index?'日期清单不接受查询参数':'快照只接受一个明确的 date');
  const date=index?null:snapshotDate(query.get('date'));
  const access=snapshotAccess(request,env),budget=snapshotBudget(limits),database=snapshotDatabase(db,budget);
  const generated_at=new Date().toISOString();
  const text=await consistentRead(database,async store=>{
    const control=await store.get('SELECT initialized FROM matrix_control WHERE id=1');
    if(control?.initialized!==1)fail(503,'SETUP_REQUIRED','数据库尚未就绪，快照未读取');
    const scope=await access.resolve(store),meta={scope_id:scope.scope_id,generated_at};
    const data=await readSnapshotData(store,scope,budget,{date});
    const value=index?snapshotIndex(data,meta,budget):snapshotForDate(data,date,meta,budget);
    const serialized=budget.serialize(value);
    await access.recheck(store);
    return serialized;
  });
  return new Response(text,{headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','Vary':'Cookie, Authorization'}});
}
