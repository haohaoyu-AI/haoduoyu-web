import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fixture} from './harness.mjs';
import {exportBackup} from '../src/backup.mjs';
import {digest,stable} from '../src/security.mjs';
import {createSourceInventory,verifyRestoredInventory} from '../scripts/migration-inventory.mjs';
import {prepareRemoteImport,writeRemoteImportPlan,runRemoteImport,wranglerQuery} from '../scripts/remote-d1-import.mjs';

const accountId='a'.repeat(32),databaseId='00000000-0000-4000-8000-000000000001',databaseName='synthetic-production';
async function input(t) {
  const source=await fixture(t),session=await source.login(),stamp=new Date().toISOString();
  const first=(await source.request('/api/v1/auth/me',{session})).data.id,other=randomUUID();
  await source.db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) SELECT ?,?,password_hash,? FROM matrix_users LIMIT 1')
    .bind(other,'synthetic-other-'+other,stamp).run();
  for(let i=0;i<47;i++)await source.db.prepare('INSERT INTO matrix_todos(user_id,id,date,text,created_at,updated_at) VALUES(?,?,?,?,?,?)')
    .bind(i%2?first:other,randomUUID(),'2026-10-24',"合成🦊'; DROP TABLE matrix_users; --\n"+i,stamp,stamp).run();
  const template=randomUUID();
  await source.db.prepare('INSERT INTO matrix_todo_templates(user_id,id,text,created_at,updated_at) VALUES(?,?,?,?,?)')
    .bind(other,template,'合成模板',stamp,stamp).run();
  await source.db.prepare('INSERT INTO matrix_todo_preferences(user_id,completed_mode,updated_at) VALUES(?,?,?)').bind(other,'hide',stamp).run();
  const backup=await exportBackup(source.db),inventory=await createSourceInventory(source.db);
  return {source,backup,inventory};
}
async function planFiles(t,backup,inventory) {
  const parent=await mkdtemp(join(tmpdir(),'haoduoyu-import-test-'));
  t.after(()=>rm(parent,{recursive:true,force:true}));
  const directory=join(parent,'private-plan'),configPath=join(parent,'private-wrangler.json');
  const plan=await prepareRemoteImport(backup,inventory,{accountId,databaseId,databaseName});
  await writeRemoteImportPlan(plan,directory);
  await writeFile(configPath,JSON.stringify({account_id:accountId,d1_databases:[{binding:'DB',database_id:databaseId,database_name:databaseName}]}),{mode:0o600});
  return {directory,configPath,confirmedDatabaseId:databaseId,plan};
}
function localTransport(db,{failAfterFile=Infinity,commitThenLoseResponse=false}={}) {
  const calls=[];let files=0;
  return {calls,query:async options=>{
    calls.push(options.file?'file':'query');
    if(options.file&&files++===failAfterFile&&!commitThenLoseResponse)throw Error('SYNTHETIC-PRIVATE-CANARY');
    const sql=options.file?await readFile(options.file,'utf8'):options.sql;
    // Deliberately execute statements separately: importer does not assume REST/CLI multi-statement atomicity.
    const result=[];
    for(const part of sql.split(';\n').map(s=>s.trim()).filter(Boolean))result.push(await db.prepare(part).all());
    if(options.file&&files-1===failAfterFile&&commitThenLoseResponse)throw Error('SYNTHETIC-PRIVATE-CANARY');
    return result;
  }};
}

test('private Wrangler plan preserves all users in bounded batches and never activates an unverified target',async t=>{
  const {backup,inventory}=await input(t),files=await planFiles(t,backup,inventory),target=await fixture(t,{bootstrap:false});
  assert.equal((await stat(files.directory)).mode&0o777,0o700);
  for(const f of files.plan.files) {
    assert.equal((await stat(join(files.directory,f.name))).mode&0o777,0o600);
    assert.ok((f.sql.match(/INSERT INTO matrix_todos/g)||[]).length<=20);
    assert.ok(Buffer.byteLength(f.sql)<=256*1024);
    assert.doesNotMatch(f.sql,/initialized=1/);
  }
  const transport=localTransport(target.db),result=await runRemoteImport({...files,query:transport.query});
  assert.deepEqual(result,{imported:true,serving:false,state:'FENCED_PENDING_INDEPENDENT_REMOTE_VERIFICATION'});
  assert.equal((await target.db.prepare('SELECT initialized FROM matrix_control').first()).initialized,2);
  await assert.rejects(verifyRestoredInventory(target.db,backup,inventory));
  await verifyRestoredInventory(target.db,backup,inventory,{expectedInitialized:2});
  assert.equal((await target.db.prepare('SELECT initialized FROM matrix_control').first()).initialized,2);
  const restored=await createSourceInventory(target.db);
  for(const [name,item] of Object.entries(inventory.tables))if(item.policy==='restore')assert.deepEqual(restored.tables[name],item);
  assert.equal(restored.tables.sessions.count,0);assert.equal(restored.tables.login_attempts.count,0);
  assert.deepEqual((await target.db.prepare('PRAGMA foreign_key_check').all()).results,[]);
  assert.equal(Object.values((await target.db.prepare('PRAGMA quick_check').all()).results[0])[0],'ok');
  assert.equal((await target.db.prepare('SELECT count(DISTINCT user_id) n FROM matrix_todos').first()).n,2);
  const before=transport.calls.length;
  await assert.rejects(runRemoteImport({...files,query:transport.query}));
  assert.equal(transport.calls.length,before,'same local plan cannot be executed twice');
});

test('interrupted import remains fenced, does not retry, and fresh plans cannot overwrite partial data',async t=>{
  const {backup,inventory}=await input(t),files=await planFiles(t,backup,inventory),target=await fixture(t,{bootstrap:false});
  const transport=localTransport(target.db,{failAfterFile:2});
  await assert.rejects(runRemoteImport({...files,query:transport.query}),/REMOTE_IMPORT_STOPPED_KEEP_TARGET_ISOLATED/);
  assert.equal((await target.db.prepare('SELECT initialized FROM matrix_control').first()).initialized,2);
  assert.equal(transport.calls.filter(c=>c==='file').length,3);
  const again=await planFiles(t,backup,inventory),second=localTransport(target.db);
  await assert.rejects(runRemoteImport({...again,query:second.query}));
  assert.equal(second.calls.filter(c=>c==='file').length,0);
});

test('unknown commit outcome is never retried or automatically unfenced',async t=>{
  const {backup,inventory}=await input(t),files=await planFiles(t,backup,inventory),target=await fixture(t,{bootstrap:false});
  const transport=localTransport(target.db,{failAfterFile:1,commitThenLoseResponse:true});
  await assert.rejects(runRemoteImport({...files,query:transport.query}),/REMOTE_IMPORT_STOPPED_KEEP_TARGET_ISOLATED/);
  assert.equal(transport.calls.filter(c=>c==='file').length,2);
  assert.equal((await target.db.prepare('SELECT initialized FROM matrix_control').first()).initialized,2);
  assert.ok((await target.db.prepare('SELECT count(*) n FROM matrix_accounts').first()).n>0);
});

test('bad hashes, target mismatch and tampered plans fail without calling any remote transport',async t=>{
  const {backup,inventory}=await input(t),damaged=structuredClone(backup);damaged.data.tables.todos.pop();
  await assert.rejects(prepareRemoteImport(damaged,inventory,{accountId,databaseId,databaseName}));
  const files=await planFiles(t,backup,inventory);let calls=0;const query=()=>{calls++;throw Error('must not execute');};
  await assert.rejects(runRemoteImport({...files,confirmedDatabaseId:randomUUID(),query}));assert.equal(calls,0);
  const cfg=JSON.parse(await readFile(files.configPath,'utf8'));
  cfg.d1_databases.push({...cfg.d1_databases[0],database_id:randomUUID()});
  await writeFile(files.configPath,JSON.stringify(cfg));
  await assert.rejects(runRemoteImport({...files,query}));assert.equal(calls,0);
  cfg.d1_databases.pop();await writeFile(files.configPath,JSON.stringify(cfg));
  await writeFile(join(files.directory,files.plan.files[0].name),'SELECT 1;');
  await assert.rejects(runRemoteImport({...files,query}));assert.equal(calls,0);
  await assert.rejects(writeRemoteImportPlan(files.plan,files.directory));
  await assert.rejects(writeRemoteImportPlan(files.plan,new URL('../private-plan',import.meta.url).pathname));
});

test('even re-signed input with a matching inventory must pass local foreign-key restoration before emitting a plan',async t=>{
  const {backup,inventory}=await input(t),bad=structuredClone(backup),badInventory=structuredClone(inventory);
  bad.data.tables.todos[0].user_id=randomUUID();
  bad.sha256=digest(JSON.stringify(stable(bad.data)));
  badInventory.tables.todos.sha256=digest(JSON.stringify(bad.data.tables.todos.map(row=>JSON.stringify(stable(row))).sort()));
  await assert.rejects(prepareRemoteImport(bad,badInventory,{accountId,databaseId,databaseName}));
});

test('Wrangler execution adapter sanitizes process errors and never leaks its captured SQL or paths',async()=>{
  await assert.rejects(wranglerQuery({configPath:'/SYNTHETIC-PRIVATE-CANARY',databaseName,
    sql:"SELECT 'SYNTHETIC-PRIVATE-CANARY'",executable:'/definitely-missing-synthetic-wrangler'}),
    e=>e.message==='REMOTE_IMPORT_STOPPED_KEEP_TARGET_ISOLATED'&&!e.stack.includes('SYNTHETIC-PRIVATE-CANARY'));
});
