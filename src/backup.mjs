import { digest,fail } from '../shared/auth.mjs';
import { consistentRead,ensureControl,statement } from './storage.mjs';
import { stable } from './security.mjs';
import {ARTICLE_PIPELINE_FIELDS,LEGACY_ARTICLE_PIPELINE_DEFAULTS,validateArticlePipelineFields} from './article-pipeline-fields.mjs';
import {normalizeAccountProfile} from './account-profiles.mjs';
import {NOTE_ENTRY_LIMITS,noteEntryId,noteEntryCategory} from './note-entry-validation.mjs';
import {WORK_REMINDER_LIMITS,workReminderId,workReminderSourceKey,workReminderSummary} from './work-reminders.mjs';
import {snapshotDate} from './business-snapshot.mjs';

// Explicit columns/order prevent a supplied backup from injecting identifiers.
// Sessions and throttle windows are intentionally not restored: restored users
// must log in again, and no old session capability is resurrected.
const v5Columns={
  accounts:['id','platform','name','active','created_at'],
  users:['id','username','password_hash','created_at'],
  todos:['user_id','id','date','text','completed','version','created_at','updated_at','deleted_at'],
  todo_templates:['user_id','id','text','version','created_at','updated_at','deleted_at'],
  todo_template_links:['user_id','todo_id','template_id','created_with_todo'],
  todo_preferences:['user_id','completed_mode','version','updated_at'],
  daily_notes:['user_id','date','text','version','change_seq','created_at','updated_at','deleted_at'],
  articles:['id','account_id','title','url','platform_article_id','published_at','started_at','production_mode','summary','notes','version','created_at','updated_at'],
  observations:['id','article_id','as_of','collected_at','kind','metrics_json','source','note','created_at'],
  daily_metrics:['id','account_id','article_id','date','metrics_json','source','updated_at'],
  api_keys:['id','name','token_hash','account_ids_json','permissions_json','created_at','revoked_at','last_used_at'],
  audit:['id','actor','action','entity_id','detail_json','created_at'],
  idempotency:['actor','key','request_hash','response_json','status','created_at'],
};
const v6Columns={...v5Columns,articles:[...v5Columns.articles,...ARTICLE_PIPELINE_FIELDS]};
const memoColumns={
  memo_groups:['user_id','id','title','position','version','change_seq','created_at','updated_at','deleted_at'],
  memo_notes:['user_id','id','group_id','title','body','position','version','change_seq','created_at','updated_at','deleted_at'],
};
const v7Columns={...v6Columns,...memoColumns};
const v8Columns={...v7Columns,daily_work_notes:v5Columns.daily_notes};
const workbenchColumns={
  note_entries:['user_id','id','category','date','text','version','change_seq','created_at','updated_at','deleted_at'],
  work_reminders:['user_id','id','date','source_key','summary','version','change_seq','created_at','updated_at','deleted_at'],
  account_profiles:['account_id','profile_url','platform_identity','created_at','updated_at'],
};
const columns={...v8Columns,...workbenchColumns};
const privateTables=new Set(['todos','todo_templates','todo_template_links','todo_preferences','daily_notes','daily_work_notes','memo_groups','memo_notes',
  'note_entries','work_reminders']);
const backupTable=name=>privateTables.has(name)||name==='account_profiles'?'matrix_'+name:name;
const v4Columns=Object.fromEntries(Object.entries(v5Columns).filter(([name])=>name!=='daily_notes'));
const legacyColumns=Object.fromEntries(Object.entries(v5Columns).filter(([name])=>!privateTables.has(name)));
const v3Columns=Object.fromEntries(Object.entries(v4Columns).filter(([name])=>name!=='todo_preferences')
  .map(([name,fields])=>[name,name==='todos'?fields.filter(field=>field!=='deleted_at'):
    name==='todo_template_links'?fields.filter(field=>field!=='created_with_todo'):fields]));
const v2Columns=Object.fromEntries(Object.entries(v3Columns).filter(([name])=>!['todo_templates','todo_template_links'].includes(name)));
const versionColumns=new Map([
  ['haoduoyu-matrix-d1-v1',legacyColumns],['haoduoyu-matrix-d1-v2',v2Columns],
  ['haoduoyu-matrix-d1-v3',v3Columns],['haoduoyu-matrix-d1-v4',v4Columns],
  ['haoduoyu-matrix-d1-v5',v5Columns],['haoduoyu-matrix-d1-v6',v6Columns],['haoduoyu-matrix-d1-v7',v7Columns],['haoduoyu-matrix-d1-v8',v8Columns],
  ['haoduoyu-matrix-d1-v9',columns],
]);
function validateMemos(tables,sourceRevision) {
  const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
  const users=new Set(tables.users.map(row=>row.id)),groups=new Set(),notes=new Set(),counts=new Map();
  const validText=value=>typeof value==='string'&&value.isWellFormed()&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
  const timestamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
  for(const name of Object.keys(memoColumns))for(const row of tables[name]) {
    const key=JSON.stringify([row.user_id,row.id]),seen=name==='memo_groups'?groups:notes;
    const countKey=name+':'+row.user_id,count=(counts.get(countKey)||0)+1;counts.set(countKey,count);
    if(!uuid.test(row.user_id)||!uuid.test(row.id)||!users.has(row.user_id)||seen.has(key)||
      !validText(row.title)||!row.title.trim()||[...row.title].length>120||/[\r\n\t]/.test(row.title)||
      !Number.isSafeInteger(row.position)||row.position<0||row.position>1000000||
      !Number.isSafeInteger(row.version)||row.version<1||!Number.isSafeInteger(row.change_seq)||row.change_seq<1||row.change_seq>sourceRevision||
      !timestamp(row.created_at)||!timestamp(row.updated_at)||row.deleted_at!==null&&!timestamp(row.deleted_at)||
      count>(name==='memo_groups'?32:200))throw fail(400,'INVALID_BACKUP','备忘录字段或归属无效');
    if(name==='memo_notes'&&(!uuid.test(row.group_id)||!groups.has(JSON.stringify([row.user_id,row.group_id]))||
      !validText(row.body)||Buffer.byteLength(row.body,'utf8')>65536))throw fail(400,'INVALID_BACKUP','备忘录笔记或分组归属无效');
    seen.add(key);
  }
}
function validateWorkbench(tables,sourceRevision) {
  const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
  const users=new Set(tables.users.map(row=>row.id)),accounts=new Map(tables.accounts.map(row=>[row.id,row]));
  const timestamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&
    Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
  const validText=value=>typeof value==='string'&&value.isWellFormed()&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
  const validTime=row=>timestamp(row.created_at)&&timestamp(row.updated_at)&&row.created_at<=row.updated_at&&
    (row.deleted_at===null||timestamp(row.deleted_at)&&row.deleted_at>=row.created_at&&row.deleted_at<=row.updated_at);
  const invalid=()=>{throw fail(400,'INVALID_BACKUP','工作台记录字段、归属或主页链接无效');};
  for(const name of ['note_entries','work_reminders']) {
    const seen=new Set(),sources=new Set(),counts=new Map();
    for(const row of tables[name]) {
      const key=JSON.stringify([row.user_id,row.id]);
      if(!uuid.test(row.user_id)||!users.has(row.user_id)||seen.has(key)||
        !Number.isSafeInteger(row.version)||row.version<1||!Number.isSafeInteger(row.change_seq)||
        row.change_seq<1||row.change_seq>sourceRevision||!validTime(row))invalid();
      try {
        if((name==='note_entries'?noteEntryId:workReminderId)(row.id)!==row.id)invalid();
        snapshotDate(row.date);
        if(name==='note_entries') {
          noteEntryCategory(row.category);
          if(!validText(row.text)||Buffer.byteLength(row.text,'utf8')>NOTE_ENTRY_LIMITS.text)invalid();
        } else {
          workReminderSourceKey(row.source_key);workReminderSummary(row.summary);
          const source=JSON.stringify([row.user_id,row.date,row.source_key]);
          if(sources.has(source))invalid();sources.add(source);
        }
      } catch {invalid();}
      seen.add(key);
      if(row.deleted_at===null) {
        const day=JSON.stringify([row.user_id,row.date,...(name==='note_entries'?[row.category]:[])]);
        const count=(counts.get(day)||0)+1;counts.set(day,count);
        if(count>(name==='note_entries'?NOTE_ENTRY_LIMITS.per_day:WORK_REMINDER_LIMITS.per_day))invalid();
      }
    }
  }
  const ids=new Set(),urls=new Set(),identities=new Set();
  for(const row of tables.account_profiles) {
    const account=accounts.get(row.account_id);
    if(typeof row.account_id!=='string'||!row.account_id||row.account_id.length>100||!account||ids.has(row.account_id)||
      urls.has(row.profile_url)||identities.has(row.platform_identity)||!timestamp(row.created_at)||!timestamp(row.updated_at)||
      row.created_at>row.updated_at)invalid();
    try {
      const profile=normalizeAccountProfile(row.profile_url,account.platform);
      if(profile.profile_url!==row.profile_url||profile.platform_identity!==row.platform_identity)invalid();
    } catch {invalid();}
    ids.add(row.account_id);urls.add(row.profile_url);identities.add(row.platform_identity);
  }
}
export async function exportBackup(db,{todoUserId}={}) {
  const data=await consistentRead(db,async(store,sourceRevision)=>{
    const tables={};
    for(const [name,fields] of Object.entries(columns)) {
      const scoped=privateTables.has(name)&&todoUserId!==undefined;
      tables[name]=await store.all(`SELECT ${fields.join(',')} FROM ${backupTable(name)}${scoped?' WHERE user_id=?':''} ORDER BY rowid`,
        ...(scoped?[todoUserId]:[]));
    }
    return {format:'haoduoyu-matrix-d1-v9',source_revision:sourceRevision,exported_at:new Date().toISOString(),tables};
  });
  return {data,sha256:digest(JSON.stringify(stable(data)))};
}
export async function restoreIntoEmptyDatabase(db,backup,{allowEmptyRestore=false}={}) {
  // Operator-only utility, deliberately not exposed as a Worker HTTP route.
  if(!allowEmptyRestore) throw fail(403,'RESTORE_DISABLED','恢复只允许在显式指定的空隔离数据库执行');
  if(!versionColumns.has(backup?.data?.format)||backup.sha256!==digest(JSON.stringify(stable(backup.data)))) throw fail(400,'INVALID_BACKUP','备份格式或校验和无效');
  const expected=versionColumns.get(backup.data.format);
  const hasSourceRevision=['haoduoyu-matrix-d1-v5','haoduoyu-matrix-d1-v6','haoduoyu-matrix-d1-v7','haoduoyu-matrix-d1-v8','haoduoyu-matrix-d1-v9'].includes(backup.data.format);
  const hasTodoTombstones=['haoduoyu-matrix-d1-v4','haoduoyu-matrix-d1-v5','haoduoyu-matrix-d1-v6','haoduoyu-matrix-d1-v7','haoduoyu-matrix-d1-v8','haoduoyu-matrix-d1-v9'].includes(backup.data.format);
  const hasPipeline=['haoduoyu-matrix-d1-v6','haoduoyu-matrix-d1-v7','haoduoyu-matrix-d1-v8','haoduoyu-matrix-d1-v9'].includes(backup.data.format);
  const sourceRevision=hasSourceRevision?backup.data.source_revision:0;
  if(hasSourceRevision&&(!Number.isSafeInteger(sourceRevision)||sourceRevision<0||sourceRevision>Number.MAX_SAFE_INTEGER-2))
    throw fail(400,'INVALID_BACKUP','备份修订号无效');
  const supplied=backup.data.tables;
  if(!supplied||Object.keys(supplied).sort().join(',')!==Object.keys(expected).sort().join(',')) throw fail(400,'INVALID_BACKUP','备份表不完整');
  const tables={todos:[],todo_templates:[],todo_template_links:[],todo_preferences:[],daily_notes:[],daily_work_notes:[],memo_groups:[],memo_notes:[],
    note_entries:[],work_reminders:[],account_profiles:[],...supplied};
  for(const [name,fields] of Object.entries(expected)) {
    if(!Array.isArray(tables[name])) throw fail(400,'INVALID_BACKUP','备份表格式无效');
    for(const row of tables[name]) {
      if(!row||Object.keys(row).sort().join(',')!==[...fields].sort().join(',')||fields.some(field=>row[field]!==null&&!['string','number'].includes(typeof row[field]))||
        name==='todo_template_links'&&hasTodoTombstones&&![0,1].includes(row.created_with_todo)||
        ['daily_notes','daily_work_notes'].includes(name)&&(!Number.isSafeInteger(row.version)||row.version<1||!Number.isSafeInteger(row.change_seq)||row.change_seq<1))
        throw fail(400,'INVALID_BACKUP','备份列格式无效');
      if(name==='articles') {
        if((row.url===null||row.published_at===null)&&!hasPipeline)throw fail(400,'INVALID_BACKUP','旧文章备份的链接和发布时间不得为空');
        if(hasPipeline)try{validateArticlePipelineFields(row);}catch{throw fail(400,'INVALID_BACKUP','文章流水线备份无效');}
      }
    }
  }
  if([...tables.daily_notes,...tables.daily_work_notes].some(row=>row.change_seq>sourceRevision))throw fail(400,'INVALID_BACKUP','碎碎念变更号超过源修订号');
  validateMemos(tables,sourceRevision);
  validateWorkbench(tables,sourceRevision);
  // Validate the exact historic columns before introducing compatibility defaults.
  if(!hasTodoTombstones) {
    tables.todos=tables.todos.map(row=>({...row,deleted_at:null}));
    tables.todo_template_links=tables.todo_template_links.map(row=>({...row,created_with_todo:1}));
  }
  if(!hasPipeline)tables.articles=tables.articles.map(row=>({...LEGACY_ARTICLE_PIPELINE_DEFAULTS,...row}));
  for(const name of Object.keys(columns)) {
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
  // Preserve monotonic note-change cursors even when idempotency sync receipts
  // were restored. Other formats have no notes and retain the historic reset.
  await db.prepare('UPDATE matrix_control SET initialized=1,revision=max(revision+1,?) WHERE id=1 AND initialized=2')
    .bind(sourceRevision+1).run();
  return {restored:true,counts:Object.fromEntries(Object.keys(columns).map(name=>[name,tables[name].length]))};
}
