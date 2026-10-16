// The genuine Drizzle D1 migration entry, using a local SQLite-backed D1 double.
// Check the declared and actually installed version; also check the lock when present.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {drizzle} from 'drizzle-orm/d1';import {migrate} from 'drizzle-orm/d1/migrator';import {readMigrationFiles} from 'drizzle-orm/migrator';
const native=createRequire(import.meta.url),installed=path.join(path.dirname(native.resolve('drizzle-orm')),'package.json');
assert.equal(JSON.parse(fs.readFileSync('package.json')).dependencies['drizzle-orm'],'0.45.2');
assert.equal(JSON.parse(fs.readFileSync(installed)).version,'0.45.2');
if(fs.existsSync('package-lock.json'))assert.equal(JSON.parse(fs.readFileSync('package-lock.json')).packages['node_modules/drizzle-orm'].version,'0.45.2');
const files=readMigrationFiles({migrationsFolder:'drizzle'}),latest=files.at(-1);assert.equal(latest.sql.filter(s=>s.trim()).length,5);assert.ok(latest.folderMillis>files.at(-2).folderMillis,'new migration must follow the deployed v109 timestamp');
const sqlite=new DatabaseSync(':memory:');let singleStatements=0;
const prepare=(query,parameters=[])=>({bind:(...params)=>prepare(query,params),run:async()=>{singleStatements++;const statement=sqlite.prepare(query),result=statement.run(...parameters);return {results:[],success:true,meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};},all:async()=>({results:sqlite.prepare(query).all(...parameters),success:true,meta:{}}),raw:async()=>{const statement=sqlite.prepare(query);statement.setReturnArrays(true);return statement.all(...parameters);}});
const d1={prepare,batch:async statements=>{sqlite.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const baseline=fs.mkdtempSync(path.join(os.tmpdir(),'hot-v109-migrations-'));
try{
 const journal=JSON.parse(fs.readFileSync('drizzle/meta/_journal.json'));assert.equal(journal.entries.at(-1).tag,'0034_parallel_doctor_spectrum');journal.entries.pop();fs.mkdirSync(path.join(baseline,'meta'));fs.writeFileSync(path.join(baseline,'meta/_journal.json'),JSON.stringify(journal));for(const entry of journal.entries)fs.copyFileSync('drizzle/'+entry.tag+'.sql',path.join(baseline,entry.tag+'.sql'));
 await migrate(drizzle(d1),{migrationsFolder:baseline});assert.equal(sqlite.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name LIKE 'hot_benchmark_%'").get().n,0);
 const existingSchema=sqlite.prepare("SELECT name,sql FROM sqlite_master WHERE tbl_name NOT LIKE 'hot_benchmark_%' ORDER BY name").all();
 await migrate(drizzle(d1),{migrationsFolder:'drizzle'});const hot=sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'hot_benchmark_%'").all();assert.equal(hot.length,2);assert.deepEqual(sqlite.prepare("SELECT name,sql FROM sqlite_master WHERE tbl_name NOT LIKE 'hot_benchmark_%' ORDER BY name").all(),existingSchema,'current upload and other existing table/index definitions stay exact');
 const before=singleStatements;await migrate(drizzle(d1),{migrationsFolder:'drizzle'});assert.equal(singleStatements-before,1);
 console.log('PASS actual Drizzle D1 incremental migrate/readMigrationFiles from deployed v109 through0033 to two benchmark tables, preserved existing upload/schema and idempotent rerun; local D1 double, no production');
}finally{fs.rmSync(baseline,{recursive:true,force:true});}
