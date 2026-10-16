import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {Miniflare} from 'miniflare';
import {drizzle} from 'drizzle-orm/d1';
import {migrate} from 'drizzle-orm/d1/migrator';
import {randomBytes} from 'node:crypto';

const output=process.env.PREFLIGHT_EVIDENCE_PATH||'/tmp/haoduoyu-history-preflight.json';
const evidence={synthetic_only:true,production_calls:0,legacy_source:'ab35236c37d015cd0ec40e5dae3545eb30307da4',checks:[]};
const directory=await mkdtemp(join(tmpdir(),'matrix-history-'));
const secret=randomBytes(32).toString('hex'),password=randomBytes(24).toString('hex');
const history=JSON.parse(await readFile('db/legacy-history.json','utf8'));
const mf=new Miniflare({cf:false,modules:true,scriptPath:resolve('dist/server/index.js'),compatibilityDate:'2026-07-30',compatibilityFlags:history.runtime_compatibility_flags,d1Databases:['DB'],d1Persist:false,r2Buckets:['BUCKET'],r2Persist:false,bindings:{SITE_ORIGIN:'http://localhost',MATRIX_BOOTSTRAP_SECRET:secret},outboundService:()=>new Response('disabled',{status:502})});
try {
  const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BUCKET'),orm=drizzle(db);
  await cp('drizzle',directory,{recursive:true});
  const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));
  await writeFile(join(directory,'meta/_journal.json'),JSON.stringify({...journal,entries:journal.entries.slice(0,50)}));
  await migrate(orm,{migrationsFolder:directory});
  evidence.checks.push({name:'exact_v159_history_replayed',entries:50,pass:true});
  await db.prepare("INSERT INTO articles(id,owner,title,filename,source_key,paragraphs,created,state) VALUES('synthetic-preservation','OFFLINE-OWNER','SYNTHETIC-PRESERVE','synthetic.txt','articles/synthetic/source','[]','2026-01-01','queued')").run();
  const before=await db.prepare("SELECT * FROM articles WHERE id='synthetic-preservation'").first();
  await bucket.put('articles/synthetic/source','SYNTHETIC-ATTACHMENT-PRESERVE');
  await writeFile(join(directory,'meta/_journal.json'),JSON.stringify(journal));
  await migrate(orm,{migrationsFolder:directory});
  await migrate(orm,{migrationsFolder:directory});
  const after=await db.prepare("SELECT * FROM articles WHERE id='synthetic-preservation'").first();
  assert.deepEqual(after,before);
  assert.equal((await bucket.get('articles/synthetic/source')).text instanceof Function,true);
  assert.equal(await (await bucket.get('articles/synthetic/source')).text(),'SYNTHETIC-ATTACHMENT-PRESERVE');
  const count=(await db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE type='table' AND name LIKE 'matrix_%'").first()).n;
  assert.equal(count,11);
  evidence.checks.push({name:'v159_to_v160_plus_matrix_and_idempotent_reapply',entries:55,matrix_tables:count,legacy_row_unchanged:true,synthetic_r2_object_unchanged:true,pass:true});
  let response=await mf.dispatchFetch('http://localhost/api/v1/bootstrap',{method:'POST',headers:{Origin:'http://localhost',Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify({username:'synthetic-history',password})});
  assert.equal(response.status,201,await response.text());
  response=await mf.dispatchFetch('http://localhost/api/v1/auth/login',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({username:'synthetic-history',password})});
  assert.equal(response.status,200);
  const cookie=response.headers.get('set-cookie').split(';')[0];
  response=await mf.dispatchFetch('http://localhost/api/v1/accounts',{headers:{Cookie:cookie}});
  assert.equal(response.status,200);assert.equal((await response.json()).data.length,3);
  evidence.checks.push({name:'bundled_worker_independent_login_on_combined_legacy_database',pass:true});
  // Reproduce only a plausible legacy parser mechanism, not a claim about the
  // unobserved Sites deployment runner. No historical SQL file is rewritten.
  const sql=await readFile('drizzle/0053_far_sleepwalker.sql','utf8');
  const trigger=sql.split('--> statement-breakpoint').map(s=>s.replace(/--[^\n]*/g,'').trim()).find(s=>s.startsWith('CREATE TRIGGER topic_control_receipt_claim_key'));
  assert.ok(trigger);
  const truncated=trigger.match(/^CREATE\s+TRIGGER\b[\s\S]*?\bEND\s*;/i)?.[0];
  assert.ok(truncated&&truncated.length<trigger.length);
  await assert.rejects(db.prepare(truncated.replace('topic_control_receipt_claim_key','matrix_parser_negative')).run(),/incomplete input/i);
  await db.prepare(trigger.replace('topic_control_receipt_claim_key','matrix_parser_positive')).run();
  await db.prepare('DROP TRIGGER matrix_parser_positive').run();
  evidence.checks.push({name:'first_END_trigger_split_negative',migration:'0053_far_sleepwalker',reproduces:'incomplete input',whole_statement_succeeds:true,actual_sites_splitter_confirmed:false,pass:true});
  evidence.pass=true;
  console.log('PASS exact 50-entry v159 -> 55-entry combined Drizzle/D1 history; legacy row + R2 object preserved; second migrate no-op; actual bundled Worker login/accounts passed.');
  console.log('PASS synthetic truncated 0053 trigger reproduces incomplete input, complete trigger succeeds. Actual Sites parser and live applied ledger remain unverified.');
} catch(error) {
  evidence.pass=false;evidence.error={name:error.name,code:error.code||null,message:String(error.message).slice(0,1000)};
  console.error('FAIL isolated historical migration preflight:',evidence.error.message);process.exitCode=1;
} finally {
  await mf.dispose();await rm(directory,{recursive:true,force:true});
  await writeFile(output,JSON.stringify(evidence,null,2)+'\n');
}
