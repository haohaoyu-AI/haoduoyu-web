import assert from 'node:assert/strict';import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';
const sql=new DatabaseSync(':memory:'),migration='0020_editorial_body_continuation.sql';
for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')&&f<migration).sort())sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
const before=Object.fromEntries(sql.prepare("SELECT name,sql FROM sqlite_master WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(x=>[x.name,x.sql]));
sql.exec(fs.readFileSync('drizzle/'+migration,'utf8'));for(const [name,statement] of Object.entries(before))assert.equal(sql.prepare('SELECT sql FROM sqlite_master WHERE name=?').get(name).sql,statement);
assert.equal(sql.prepare('SELECT COUNT(*) n FROM editorial_body_continuations_v3').get().n,0);
for(const name of ['editorial_stages_v3_owner_stage_round','editorial_stages_v3_owner_sequence','editorial_runs_v3_daily_slot','editorial_runs_v3_test_intent'])assert.ok(before[name]);
const cols=sql.prepare('PRAGMA table_info(editorial_body_continuations_v3)').all().map(x=>x.name),make=(id,owner,failed,key,stage,token)=>Object.fromEntries(cols.map(c=>[c,({id,owner,failed_stage_id:failed,authorization_key:key,new_stage_id:stage,new_token_sha256:token})[c]||'synthetic-'+c]));
function put(row){sql.prepare(`INSERT INTO editorial_body_continuations_v3(${cols.join(',')}) VALUES(${cols.map(()=>'?').join(',')})`).run(...cols.map(c=>row[c]));}
put(make('one','owner','failed','key','new','token'));for(const row of [make('two','owner','failed','other-key','other-new','other-token'),make('two','owner','other-failed','key','other-new','other-token'),make('two','owner','other-failed','other-key','new','other-token'),make('two','owner','other-failed','other-key','other-new','token')])assert.throws(()=>put(row));
put(make('other-owner','foreign','failed','key','new','token'));
const old=JSON.parse(fs.readFileSync('drizzle/meta/0019_snapshot.json','utf8')),newer=JSON.parse(fs.readFileSync('drizzle/meta/0020_snapshot.json','utf8'));for(const [name,table] of Object.entries(old.tables))assert.deepEqual(newer.tables[name],table);assert.equal(newer.prevId,old.id);assert.ok(newer.tables.editorial_body_continuations_v3);
const journal=JSON.parse(fs.readFileSync('drizzle/meta/_journal.json','utf8'));assert.equal(journal.entries.find(entry=>entry.idx===20).idx,20);assert.equal(journal.entries.find(entry=>entry.idx===20).tag,'0020_editorial_body_continuation');
console.log('PASS 0020 additive migration preserves every old table/index and journal; lifetime failed-stage/key/new-stage/token uniqueness checked.');
