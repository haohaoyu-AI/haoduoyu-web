import {bodyFor,digest,fail,stable} from './security.mjs';
import {mutate} from './storage.mjs';

// Public business deletion never accepts a table name or owner from the client.
export async function deletePublicBusiness(db,request,route,actor) {
  const match=/^\/(accounts|articles|observations|daily-metrics)\/([^/]+)$/.exec(route);
  if(!match||new URL(request.url).search) throw fail(400,'VALIDATION_ERROR','删除地址无效');
  const [,kind,id]=match,input=await bodyFor(request);
  const field=kind==='articles'?'version':kind==='observations'?'created_at':kind==='daily-metrics'?'updated_at':'id';
  if(Object.keys(input).join(',')!==field||
    (field==='version'?(!Number.isSafeInteger(input.version)||input.version<1):typeof input[field]!=='string'))
    throw fail(400,'VALIDATION_ERROR','删除需要当前记录的版本或时间标识');
  const action='DELETE '+route,hash=digest(JSON.stringify(stable(input)));
  const table=kind==='daily-metrics'?'daily_metrics':kind;
  return (await mutate(db,async store=>{
    const row=await store.get('SELECT * FROM '+table+' WHERE id=?',id);
    if(!row) {
      const saved=await store.get('SELECT detail_json FROM audit WHERE actor=? AND action=? AND entity_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1',actor.actor,action,id);
      if(saved&&JSON.parse(saved.detail_json).request_hash===hash)
        return {replayed:true,response:Response.json({data:{deleted:true,id}})};
      throw fail(404,'NOT_FOUND','记录不存在');
    }
    const account=kind==='accounts'?id:kind==='observations'?
      (await store.get('SELECT account_id FROM articles WHERE id=?',row.article_id))?.account_id:row.account_id;
    if(!actor.scope.includes(account)) throw fail(404,'NOT_FOUND','记录不存在');
    if(row[field]!==input[field]) throw fail(409,'VERSION_CONFLICT','记录已更新，请刷新后重试');
    if(kind==='accounts') {
      const count=await store.get('SELECT (SELECT count(*) FROM articles WHERE account_id=?)+(SELECT count(*) FROM daily_metrics WHERE account_id=?) AS n',id,id);
      if(count.n) throw fail(409,'ACCOUNT_NOT_EMPTY','账号仍有业务记录，请先删除记录或停用账号');
    }
    if(kind==='articles') {
      store.queue('DELETE FROM observations WHERE article_id=?',id);
      store.queue('DELETE FROM daily_metrics WHERE article_id=?',id);
    }
    store.queue('DELETE FROM '+table+' WHERE id=? AND '+field+'=?',id,input[field]);store.expectChange();
    store.audit(actor.actor,action,id,{request_hash:hash});
    return {actor,response:Response.json({data:{deleted:true,id}})};
  })).response;
}
