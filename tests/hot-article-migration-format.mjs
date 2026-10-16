import fs from 'node:fs';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
const name='0031_hot_article_imitation.sql',text=fs.readFileSync('drizzle/'+name,'utf8'),statements=text.split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean);
assert.equal(statements.length,13);assert.equal(JSON.parse(fs.readFileSync('drizzle/meta/_journal.json')).entries.find(e=>e.tag===name.slice(0,-4)).breakpoints,true);
const db=new DatabaseSync(':memory:');for(const statement of statements){assert.equal((statement.match(/\bCREATE\b/g)||[]).length,1);db.prepare(statement).run();}
assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table'").get().n,6);
console.log('PASS 13 separate one-statement SQLite prepare/run calls; formatting check only, not the Drizzle migration entry');
