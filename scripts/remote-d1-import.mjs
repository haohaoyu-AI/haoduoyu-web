// Operator-only import into an independently approved, EMPTY, user-owned D1.
// No Sites DB capability is implied. This module is never bundled into HTTP routes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {resolve,dirname,relative,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Miniflare} from 'miniflare';
import {restoreIntoEmptyDatabase} from '../src/backup.mjs';
import {restoredTables,resetTables,verifyBackupInventory,verifyRestoredInventory} from './migration-inventory.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hash=value=>createHash('sha256').update(value).digest('hex');
const names=[...restoredTables,...resetTables].map(name=>'matrix_'+name).sort();
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const fail=()=>{throw new Error('REMOTE_IMPORT_STOPPED_KEEP_TARGET_ISOLATED');};
const quote=value=>{
  if(value===null)return 'NULL';
  if(typeof value==='number'&&Number.isFinite(value))return String(value);
  if(typeof value==='string') {
    const bytes=Buffer.from(value,'utf8');
    if(bytes.toString('utf8')!==value)fail(); // Reject lossy UTF-8 encodings instead of changing the imported value.
    return "CAST(X'"+bytes.toString('hex')+"' AS TEXT)";
  }
  fail();
};
const guard='UPDATE matrix_control SET setup_guard=CASE WHEN initialized=2 THEN 1 ELSE 0 END WHERE id=1;\n';

async function rehearse(backup,inventory) {
  verifyBackupInventory(backup,inventory);
  const settings=JSON.parse(await readFile(resolve(root,'runtime.json'),'utf8'));
  const mf=new Miniflare({modules:true,cf:false,script:'export default {fetch(){return new Response(null,{status:404})}}',
    compatibilityDate:settings.compatibility_date,compatibilityFlags:settings.compatibility_flags,d1Databases:['DB'],d1Persist:false,
    outboundService:()=>new Response('External requests disabled',{status:502})});
  try {
    const db=await mf.getD1Database('DB');
    const journal=JSON.parse(await readFile(resolve(root,'drizzle/meta/_journal.json'),'utf8'));
    for(const {tag} of journal.entries) {
      const sql=await readFile(resolve(root,'drizzle',tag+'.sql'),'utf8');
      await db.batch(sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s)));
    }
    await restoreIntoEmptyDatabase(db,backup,{allowEmptyRestore:true});
    await verifyRestoredInventory(db,backup,inventory);
  } finally {await mf.dispose();}
}

export async function prepareRemoteImport(backup,inventory,{accountId,databaseId,databaseName}={}) {
  assert.match(accountId||'',/^[a-f0-9]{32}$/i);assert.match(databaseId||'',uuid);
  assert.match(databaseName||'',/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
  await rehearse(backup,inventory); // Validate columns, all users, constraints and hashes before emitting SQL.
  const files=[];
  const add=sql=>files.push({name:String(files.length).padStart(4,'0')+'.sql',sql,sha256:hash(sql)});
  add('INSERT INTO matrix_control(id) VALUES(1) ON CONFLICT DO NOTHING;\n'+
    'UPDATE matrix_control SET initialized=2,revision=revision+1 WHERE id=1 AND initialized=0;\n'+
    'UPDATE matrix_control SET setup_guard=changes() WHERE id=1;\n');
  for(const name of restoredTables) {
    let sql=guard,rows=0;
    for(const row of backup.data.tables[name]) {
      // Exact columns were checked against the existing restore whitelist above.
      const columns=Object.keys(row);
      const insert='INSERT INTO matrix_'+name+'('+columns.join(',')+') VALUES('+columns.map(k=>quote(row[k])).join(',')+');\n';
      if(Buffer.byteLength(insert)>90000)fail(); // Refuse oversized rows, never truncate.
      if(rows&&(rows===20||Buffer.byteLength(sql)+Buffer.byteLength(insert)>256*1024)) {add(sql);sql=guard;rows=0;}
      sql+=insert;rows++;
    }
    if(rows)add(sql);
  }
  return {manifest:{format:'haoduoyu-private-d1-import-v1',accountId,databaseId,databaseName,
    backupSha256:backup.sha256,inventorySha256:hash(JSON.stringify(inventory)),
    files:files.map(({name,sha256})=>({name,sha256})),
    finalState:'FENCED_PENDING_INDEPENDENT_REMOTE_VERIFICATION'},files};
}

export async function writeRemoteImportPlan(plan,directory) {
  const parent=await realpath(dirname(resolve(directory))),actual=resolve(parent,resolve(directory).split(sep).at(-1));
  const rel=relative(root,actual);
  assert.ok(rel==='..'||rel.startsWith('..'+sep),
    'Private import plans must remain outside the repository');
  await mkdir(actual,{mode:0o700}); // Existing paths/symlinks are rejected; never overwrite private plans.
  for(const {name,sql,sha256} of plan.files) {
    assert.match(name,/^\d{4}\.sql$/);assert.equal(hash(sql),sha256);
    await writeFile(resolve(actual,name),sql,{mode:0o600,flag:'wx'});
  }
  await writeFile(resolve(actual,'manifest.json'),JSON.stringify(plan.manifest)+'\n',{mode:0o600,flag:'wx'});
  return actual;
}

const exec=promisify(execFile);
export async function wranglerQuery({configPath,databaseName,sql,file,executable='wrangler'}) {
  // Wrangler reuses the operator's existing authorized login/profile. No token is created or persisted here.
  const args=['d1','execute',databaseName,'--remote','--config',configPath,'--json','--yes',...(file?['--file',file]:['--command',sql])];
  try {
    const {stdout}=await exec(executable,args,{maxBuffer:16*1024*1024,timeout:120000,windowsHide:true});
    const result=JSON.parse(stdout);
    if(!Array.isArray(result)||!result.length||result.some(r=>r?.success!==true||!Array.isArray(r.results)))fail();
    return result;
  } catch {fail();} // Never echo SQL, private paths, token or CLI error output; never retry an unknown write.
}

export async function runRemoteImport({directory,configPath,confirmedDatabaseId,query=wranglerQuery}) {
  const dir=await realpath(directory),config=JSON.parse(await readFile(configPath,'utf8'));
  const rel=relative(root,dir);assert.ok(rel==='..'||rel.startsWith('..'+sep),'Private plans must remain outside the repository');
  const manifest=JSON.parse(await readFile(resolve(dir,'manifest.json'),'utf8'));
  assert.equal(manifest.format,'haoduoyu-private-d1-import-v1');
  assert.match(manifest.accountId||'',/^[a-f0-9]{32}$/i);assert.match(manifest.databaseId||'',uuid);
  assert.match(manifest.databaseName||'',/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
  assert.equal(manifest.databaseId,confirmedDatabaseId);assert.equal(config.account_id,manifest.accountId);
  if(process.env.CLOUDFLARE_ACCOUNT_ID)assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID,manifest.accountId);
  for(const key of ['CLOUDFLARE_ENV','WRANGLER_ENV','WRANGLER_CONFIG','CLOUDFLARE_PROFILE','WRANGLER_PROFILE','CLOUDFLARE_API_BASE_URL'])
    assert.ok(!process.env[key],'Ambiguous Wrangler environment/profile override');
  assert.ok(!config.env,'Only explicit default Wrangler JSON configuration is supported');
  const bindings=config.d1_databases?.filter(x=>x.database_name===manifest.databaseName);
  assert.equal(bindings?.length,1);
  assert.equal(bindings[0].database_id,manifest.databaseId);
  assert.equal(manifest.finalState,'FENCED_PENDING_INDEPENDENT_REMOTE_VERIFICATION');
  assert.ok(Array.isArray(manifest.files)&&manifest.files.length);
  for(const [i,file] of manifest.files.entries()) {
    assert.equal(file.name,String(i).padStart(4,'0')+'.sql');
    assert.equal(hash(await readFile(resolve(dir,file.name))),file.sha256);
  }
  // A durable, exclusive local receipt prevents accidental continuation/repetition after any attempt.
  await writeFile(resolve(dir,'execution-started.json'),JSON.stringify({databaseId:manifest.databaseId,startedAt:new Date().toISOString()})+'\n',
    {mode:0o600,flag:'wx'});
  const execute=async options=>{
    try {return await query({configPath,databaseName:manifest.databaseName,...options});}catch {fail();}
  };
  const rows=async sql=>{
    const result=await execute({sql});
    if(!Array.isArray(result)||result.length!==1||result[0]?.success!==true||!Array.isArray(result[0].results))fail();
    return result[0].results;
  };
  const schema=await rows("SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'matrix_%' ORDER BY name");
  assert.deepEqual(schema.map(r=>r.name),names);
  const countRows=await rows('SELECT '+names.map(name=>'(SELECT count(*) FROM '+name+') AS '+name).join(','));
  assert.equal(countRows.length,1);
  const counts=Object.entries(countRows[0]).map(([name,n])=>({name,n}));
  assert.equal(counts.length,names.length);
  assert.deepEqual(counts.map(r=>r.name).sort(),names);
  assert.ok(counts.every(r=>r.name==='matrix_control'?r.n===0||r.n===1:r.n===0));
  const control=await rows('SELECT initialized FROM matrix_control');
  assert.ok(!control.length||control.length===1&&control[0].initialized===0);
  for(const file of manifest.files)await execute({file:resolve(dir,file.name)});
  const final=await rows('SELECT initialized FROM matrix_control WHERE id=1');
  assert.equal(final.length,1);assert.equal(final[0].initialized,2);
  return {imported:true,serving:false,state:'FENCED_PENDING_INDEPENDENT_REMOTE_VERIFICATION'};
}

// Preparing is local-only. Executing requires a separately approved target and an existing Wrangler login.
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  try {
    const [mode,...args]=process.argv.slice(2),opts={};
    for(let i=0;i<args.length;i+=2) {if(!args[i]?.startsWith('--')||!args[i+1]||opts[args[i]])fail();opts[args[i]]=args[i+1];}
    if(mode==='prepare'&&Object.keys(opts).sort().join(',')==='--account,--backup,--database,--directory,--inventory,--name') {
      const plan=await prepareRemoteImport(JSON.parse(await readFile(opts['--backup'],'utf8')),
        JSON.parse(await readFile(opts['--inventory'],'utf8')),{accountId:opts['--account'],databaseId:opts['--database'],databaseName:opts['--name']});
      await writeRemoteImportPlan(plan,opts['--directory']);
      console.log(JSON.stringify({prepared:true,remoteExecuted:false}));
    } else if(mode==='execute'&&Object.keys(opts).sort().join(',')==='--config,--confirm-empty-target,--directory') {
      console.log(JSON.stringify(await runRemoteImport({directory:opts['--directory'],configPath:opts['--config'],confirmedDatabaseId:opts['--confirm-empty-target']})));
    } else fail();
  } catch {
    console.error('Remote import stopped. Keep the target isolated; inspect the private plan and execution state. No automatic retry or activation.');
    process.exitCode=1;
  }
}
