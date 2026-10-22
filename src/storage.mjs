import { randomUUID } from 'node:crypto';
import { fail } from '../shared/auth.mjs';

const tables = 'accounts|articles|observations|daily_metrics|users|sessions|api_keys|audit|idempotency|login_attempts';
// Only table positions are rewritten. SQL string literals such as POST /articles
// (audit provenance) must remain unchanged. All callers supply static SQL.
export const namespaced = sql => sql.replace(new RegExp(`\\b(FROM|JOIN|INTO|UPDATE|REFERENCES)\\s+(${tables})\\b`,'gi'),(_,verb,name)=>`${verb} matrix_${name}`);
export const statement = (db,sql,...args) => db.prepare(namespaced(sql)).bind(...args);
export async function ensureControl(db) {
  // Data initialization only; all tables are owned by reviewed migrations.
  await db.prepare('INSERT INTO matrix_control(id) VALUES(1) ON CONFLICT DO NOTHING').run();
}
export function storeFor(db) {
  const pending=[];
  return {
    get:(sql,...args)=>statement(db,sql,...args).first(),
    all:async(sql,...args)=>(await statement(db,sql,...args).all()).results,
    queue:(sql,...args)=>{pending.push(statement(db,sql,...args));},
    expectChange:()=>pending.push(db.prepare('UPDATE matrix_control SET revision_guard=changes() WHERE id=1')),
    audit:(actor,action,id=null,detail={})=>pending.push(statement(db,
      'INSERT INTO audit(id,actor,action,entity_id,detail_json,created_at) VALUES(?,?,?,?,?,?)',
      randomUUID(),actor,action,id,JSON.stringify(detail),new Date().toISOString())),
    pending,
  };
}
export async function revision(db) {
  const row=await db.prepare('SELECT revision FROM matrix_control WHERE id=1').first();
  if(!row) throw fail(503,'SETUP_REQUIRED','数据库尚未初始化');
  return row.revision;
}
export const isRevisionConflict = error => /CHECK constraint failed: matrix_revision_match/.test(String(error));

export async function commit(db,expected,store,actor=null) {
  const statements=[
    db.prepare('UPDATE matrix_control SET revision=revision+1 WHERE id=1 AND revision=?').bind(expected),
    db.prepare('UPDATE matrix_control SET revision_guard=changes() WHERE id=1'),
  ];
  // The proof must still authorize this exact commit, including expiry. Changes
  // to passwords, scopes, key revocation and account state also advance revision.
  if(actor?.kind==='session') statements.push(statement(db,
    'UPDATE matrix_control SET auth_guard=CASE WHEN EXISTS(SELECT 1 FROM sessions WHERE token_hash=? AND user_id=? AND expires_at>?) THEN 1 ELSE 0 END WHERE id=1',
    actor.tokenHash,actor.id,new Date().toISOString()));
  if(actor?.kind==='key') statements.push(statement(db,
    'UPDATE matrix_control SET auth_guard=CASE WHEN EXISTS(SELECT 1 FROM api_keys WHERE id=? AND token_hash=? AND revoked_at IS NULL AND account_ids_json=? AND permissions_json=?) THEN 1 ELSE 0 END WHERE id=1',
    actor.id,actor.tokenHash,actor.scopeJson,actor.permissionsJson));
  try { await db.batch([...statements,...store.pending]); }
  catch(error) {
    if(/CHECK constraint failed: matrix_auth_match/.test(String(error))) throw fail(401,'UNAUTHORIZED','授权已失效，请重新登录');
    // Only the three reviewed article constraints, never a table-name substring.
    const articleConstraint=typeof error?.message==='string' && /^(?:D1_ERROR: )?UNIQUE constraint failed: (matrix_articles\.id|matrix_articles\.account_id, matrix_articles\.(?:url|platform_article_id))(?:: SQLITE_CONSTRAINT(?: \(extended: (SQLITE_CONSTRAINT_PRIMARYKEY|SQLITE_CONSTRAINT_UNIQUE)\))?)?$/.exec(error.message);
    if(articleConstraint && error.status===undefined && (!articleConstraint[2] || articleConstraint[2]===(articleConstraint[1]==='matrix_articles.id'?'SQLITE_CONSTRAINT_PRIMARYKEY':'SQLITE_CONSTRAINT_UNIQUE'))) fail(409,'ARTICLE_EXISTS','该平台文章或链接已经登记');
    throw error;
  }
}

// D1 sessions are sequentially consistent, not repeatable-read transactions.
// Every application mutation advances this global revision in the same batch.
// Accept only a computation whose entire read set belongs to an unchanged revision.
// Reuse a caller's already-read revision only for attempt zero; retries always read again.
export async function consistentRead(db,operation,initialRevision) {
  for(let attempt=0;attempt<5;attempt++) {
    const before=attempt===0&&initialRevision!==undefined?initialRevision:await revision(db);
    try {
      const result=await operation(storeFor(db));
      if(await revision(db)===before) return result;
    } catch(error) {
      if(await revision(db)===before) throw error;
    }
  }
  throw fail(503,'BUSY','数据正在更新，请稍后重试');
}
export async function mutate(db,operation) {
  for(let attempt=0;attempt<24;attempt++) {
    const expected=await revision(db),store=storeFor(db);
    try {
      const result=await operation(store);
      if(result.replayed) {
        if(await revision(db)===expected) return result;
        continue;
      }
      await commit(db,expected,store,result.actor);
      return result;
    } catch(error) {
      if(isRevisionConflict(error)) continue;
      // A preflight validation can have seen interleaved revisions too.
      // Only retry known application validation errors, never an unknown D1
      // commit/network error (its outcome could already be committed).
      if(error.status && await revision(db)!==expected) continue;
      throw error;
    }
  }
  throw fail(503,'BUSY','并发更新较多，请使用原幂等键稍后重试');
}
