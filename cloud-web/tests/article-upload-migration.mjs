import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const sql=new DatabaseSync(':memory:');
const migrations=fs.readdirSync('drizzle').filter(file=>file.endsWith('.sql')).sort();
const migration='0018_article_upload_attempts.sql';
for(const file of migrations.filter(file=>file<migration))sql.exec(fs.readFileSync('drizzle/'+file,'utf8'));
for(const state of ['word_ready','toutiao_saving','needs_verification','failed','completed']){
 sql.prepare('INSERT INTO articles(id,owner,title,filename,source_key,paragraphs,created,state,result_key,result_meta,draft_url) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(state,'synthetic-owner','原题','原文件.docx','fixture-source','["原题","原正文"]','2026-01-01T00:00:00.000Z',state,'fixture-word','{"sha256":"original","size":123}',state==='completed'?'https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=123':null);
}
const before=sql.prepare('SELECT * FROM articles ORDER BY id').all();
sql.exec(fs.readFileSync('drizzle/'+migration,'utf8'));
for(const record of sql.prepare('SELECT * FROM articles ORDER BY id').all()){
 const {upload_guard_version,...untouched}=record;
 assert.equal(upload_guard_version,0);
 assert.deepEqual(untouched,{...before.find(item=>item.id===record.id)});
}
assert.equal(sql.prepare('SELECT COUNT(*) n FROM article_upload_attempts').get().n,0);
for(const table of ['editorial_flows','editorial_stages','editorial_requests','editorial_request_outbox'])assert.ok(sql.prepare('SELECT name FROM sqlite_master WHERE type=? AND name=?').get('table',table));
const snapshot=JSON.parse(fs.readFileSync('drizzle/meta/0018_snapshot.json','utf8'));
for(const table of ['editorial_flows','editorial_stages','editorial_requests','editorial_request_outbox','article_upload_attempts'])assert.ok(snapshot.tables[table]);
assert.equal(snapshot.tables.articles.columns.upload_guard_version.default,0);
const journal=JSON.parse(fs.readFileSync('drizzle/meta/_journal.json','utf8'));
assert.deepEqual(journal.entries.slice(-3).map(item=>item.tag),['0016_slimy_strong_guy','0017_dapper_trish_tilby','0018_article_upload_attempts']);
console.log('0018 is additive; every legacy state/text/URL/Word stays unchanged; eligibility defaults closed; editorial 0016/0017 schema and journal preserved.');
