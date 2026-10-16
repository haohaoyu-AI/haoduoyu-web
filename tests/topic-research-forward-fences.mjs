// Actual previous52 migrations, old-style business-terminal/cleared-claim rows,
// then the forward0052 migration. No end proof fabricated or written.
import fs from 'node:fs';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {randomUUID} from 'node:crypto';
const sql=new DatabaseSync(':memory:'),migrations=fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort();for(const f of migrations.filter(f=>parseInt(f.slice(0,4))<52))sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
const stamp=new Date().toISOString(),hash='a'.repeat(64),input='b'.repeat(64);
function run(owner,state='queued',claim=null,generation=1){const id=randomUUID();sql.prepare('INSERT INTO topic_research_runs(id,owner,request_key,generation,state,input_hash,input_json,claim_hash,claim_expires,created,updated,dispatch_state) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,owner,randomUUID(),generation,state,input,'{}',claim,claim?'2000-01-01T00:00:00Z':null,stamp,stamp,'pending');return id;}
for(const state of ['completed','failed']){const id=run('OLD-'+state,state);sql.prepare('INSERT INTO topic_research_holders(owner,research_id,epoch,claim_sha256,execution_id,created) VALUES(?,?,1,?,?,?)').run('OLD-'+state,id,hash,'OFFLINE-unended-old',stamp);run('OLD-'+state,'queued',null,2);}
run('PRE-HOLDER-UNKNOWN','completed');
sql.exec(fs.readFileSync('drizzle/0052_silent_wolverine.sql','utf8'));for(const f of migrations.filter(f=>parseInt(f.slice(0,4))>52))sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
assert.equal(sql.prepare('SELECT count(*) n FROM topic_research_execution_fences').get().n,0);assert.equal(sql.prepare('SELECT count(*) n FROM topic_research_effective_fences').get().n,3);assert.equal(sql.prepare('SELECT count(*) n FROM topic_research_execution_settlements').get().n,0);
for(const owner of ['OLD-completed','OLD-failed','PRE-HOLDER-UNKNOWN']){
 assert.throws(()=>run(owner),/topic_execution_unsettled/,'terminal business cannot create new work');
 const oldQueue=sql.prepare("SELECT id FROM topic_research_runs WHERE owner=? AND state='queued'").get(owner);if(oldQueue)assert.throws(()=>sql.prepare("UPDATE topic_research_runs SET state='researching',claim_hash=? WHERE id=?").run('c'.repeat(64),oldQueue.id),/topic_execution_unsettled/,'old claim path cannot bypass current owner fence');
}
const oldRuntime=run('NEW-OLD-RUNTIME');sql.prepare("UPDATE topic_research_runs SET state='researching',claim_hash=? WHERE id=?").run(hash,oldRuntime);
assert.equal(sql.prepare('SELECT count(*) n FROM topic_research_execution_fences WHERE owner=?').get('NEW-OLD-RUNTIME').n,1,'claim captured even without0051 holder writer');
assert.throws(()=>sql.prepare("UPDATE topic_research_runs SET state='failed',claim_hash=NULL WHERE id=?").run(oldRuntime),/topic_execution_unsettled/);assert.equal(sql.prepare('SELECT state FROM topic_research_runs WHERE id=?').get(oldRuntime).state,'researching','unsafe old combined update rolls back');
const direct=run('DIRECT-CLAIM','researching',hash);assert.equal(sql.prepare('SELECT count(*) n FROM topic_research_execution_fences WHERE research_id=?').get(direct).n,1);assert.throws(()=>run('DIRECT-CLAIM'),/topic_execution_unsettled/);
const unrelated=run('UNRELATED');assert.ok(unrelated);assert.throws(()=>sql.prepare('DELETE FROM topic_research_execution_fences').run(),/immutable_topic_execution_fence/);assert.throws(()=>sql.prepare('DELETE FROM topic_research_runs').run(),/topic_execution_audit_retained/);sql.close();
console.log('PASS actual forward52→53 migration: failed/completed cleared claims and unknown legacy execution stay fenced; old creation/claim/clear/direct-insert paths blocked; unrelated owner unaffected; no inferred settlements or audit deletion. ZERO production/platform/network I/O.');
