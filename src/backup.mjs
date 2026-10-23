import { digest,fail } from '../shared/auth.mjs';
import { consistentRead,ensureControl,statement } from './storage.mjs';
import { stable } from './security.mjs';

// Explicit columns/order prevent a supplied backup from injecting identifiers.
// Sessions and throttle windows are intentionally not restored: restored users
// must log in again, and no old session capability is resurrected.
const columns={
  accounts:['id','platform','name','active','created_at'],
  users:['id','username','password_hash','created_at'],
  todos:['user_id','id','date','text','completed','version','created_at','updated_at'],
  todo_templates:['user_id','id','text','version','created_at','updated_at','deleted_at'],
  todo_template_links:['user_id','todo_id','template_id'],
  articles:['id','account_id','title','url','platform_article_id','published_at','started_at','production_mode','summary','notes','version','created_at','updated_at'],
  observations:['id','article_id','as_of','collected_at','kind','metrics_json','source','note','created_at'],
  daily_metrics:['id','account_id','article_id','date','metrics_json','source','updated_at'],
  api_keys:['id','name','token_hash','account_ids_json','permissions_json','created_at','revoked_at','last_used_at'],
  audit:['id','actor','action','entity_id','detail_json','created_at'],
  idempotency:['actor','key','request_hash','response_json','status','created_at'],
};
const privateTables=new Set(['todos','todo_templates','todo_template_links']);
const backupTable=name=>privateTables.has(name)?'matrix_'+name:name;
const legacyColumns=Object.fromEntries(Object.entries(columns).filter(([name])=>!privateTables.has(name)));
const v2Columns=Object.fromEntries(Object.entries(columns).filter(([name])=>!['todo_templates','todo_template_links'].includes(name)));
export async function exportBackup(db,{todoUserId}={}) {
  const data=await consistentRead(db,async store=>{
    const tables={};
    for(const [name,fields] of Object.entries(columns)) {
      const scoped=privateTables.has(name)&&todoUserId!==undefined;
      tables[name]=await store.all(`SELECT ${fields.join(',')} FROM ${backupTable(name)}${scoped?' WHERE user_id=?':''} ORDER BY rowid`,
        ...(scoped?[todoUserId]:[]));
    }
    return {format:'haoduoyu-matrix-d1-v3',exported_at:new Date().toISOString(),tables};
  });
  return {data,sha256:digest(JSON.stringify(stable(data)))};
}
export async function restoreIntoEmptyDatabase(db,backup,{allowEmptyRestore=false}={}) {
  // Operator-only utility, deliberately not exposed as a Worker HTTP route.
  if(!allowEmptyRestore) throw fail(403,'RESTORE_DISABLED','恢复只允许在显式指定的空隔离数据库执行');
  if(!['haoduoyu-matrix-d1-v1','haoduoyu-matrix-d1-v2','haoduoyu-matrix-d1-v3'].includes(backup?.data?.format)||backup.sha256!==digest(JSON.stringify(stable(backup.data)))) throw fail(400,'INVALID_BACKUP','备份格式或校验和无效');
  const expected=backup.data.format==='haoduoyu-matrix-d1-v1'?legacyColumns:backup.data.format==='haoduoyu-matrix-d1-v2'?v2Columns:columns;
  const supplied=backup.data.tables;
  if(!supplied||Object.keys(supplied).sort().join(',')!==Object.keys(expected).sort().join(',')) throw fail(400,'INVALID_BACKUP','备份表不完整');
  const tables={todos:[],todo_templates:[],todo_template_links:[],...supplied};
  for(const [name,fields] of Object.entries(columns)) {
    if(!Array.isArray(tables[name])) throw fail(400,'INVALID_BACKUP','备份表格式无效');
    for(const row of tables[name]) {
      if(!row||Object.keys(row).sort().join(',')!==[...fields].sort().join(',')||fields.some(field=>row[field]!==null&&!['string','number'].includes(typeof row[field]))) throw fail(400,'INVALID_BACKUP','备份列格式无效');
    }
    const count=await statement(db,`SELECT count(*) AS n FROM ${backupTable(name)}`).first();
    if(count.n) throw fail(409,'RESTORE_NOT_EMPTY','恢复目标必须为空，禁止覆盖现有数据');
  }
  await ensureControl(db);
  const control=await db.prepare('SELECT * FROM matrix_control WHERE id=1').first();
  if(control.initialized!==0) throw fail(409,'RESTORE_NOT_EMPTY','恢复目标已经初始化或有未完成的恢复');
  // A fenced target never serves business requests during multi-batch import.
  // Failed imports stay fenced and must be discarded, not silently resumed.
  const claim=await db.prepare('UPDATE matrix_control SET initialized=2,revision=revision+1 WHERE id=1 AND initialized=0').run();
  if(claim.meta.changes!==1) throw fail(409,'RESTORE_NOT_EMPTY','恢复目标已被其他操作占用');
  for(const [name,fields] of Object.entries(columns)) {
    for(let offset=0;offset<tables[name].length;offset+=20) {
      const rows=tables[name].slice(offset,offset+20);
      await db.batch(rows.map(row=>statement(db,`INSERT INTO ${backupTable(name)}(${fields.join(',')}) VALUES(${fields.map(()=>'?').join(',')})`,...fields.map(field=>row[field]))));
    }
  }
  const fk=await db.prepare('PRAGMA foreign_key_check').all();
  if(fk.results.length) throw fail(400,'INVALID_BACKUP','恢复外键校验失败，目标保持隔离');
  await db.prepare('UPDATE matrix_control SET initialized=1,revision=revision+1 WHERE id=1 AND initialized=2').run();
  return {restored:true,counts:Object.fromEntries(Object.keys(columns).map(name=>[name,tables[name].length]))};
}
