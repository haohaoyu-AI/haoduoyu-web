import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../src/db.mjs';
import { createRecords } from '../src/records.mjs';

test('article data, account customization and a consistent backup survive database reopening', () => {
  const directory = mkdtempSync(join(tmpdir(),'matrix-persistence-'));
  const file = join(directory,'matrix.sqlite'), destination = join(directory,'backup.sqlite');
  try {
    let db = openDatabase(file), records = createRecords(db);
    records.updateAccount('toutiao-haoduoyu',{name:'已确认账号名',active:0});
    const article = records.createArticle({
      account_id:'zhihu-haoduoyu',title:'持久化验收样本',url:'https://example.com/article/persistence',
      published_at:'2026-01-01T09:00:00+08:00',production_mode:'manual'
    },null);
    const result = spawnSync(process.execPath,['scripts/backup.mjs',destination],{
      cwd:new URL('..',import.meta.url),env:{...process.env,MATRIX_DB_PATH:file},encoding:'utf8'
    });
    assert.equal(result.status,0,result.stderr);
    assert.equal(statSync(file).mode & 0o777,0o600);
    assert.equal(statSync(destination).mode & 0o777,0o600);
    const snapshot = new DatabaseSync(destination,{readOnly:true});
    assert.equal(snapshot.prepare('SELECT title FROM articles WHERE id=?').get(article.id).title,'持久化验收样本');
    snapshot.close(); db.close();
    db = openDatabase(file); records = createRecords(db);
    assert.equal(records.getArticle(article.id,null).title,'持久化验收样本');
    const account = records.listAccounts(null).find(a=>a.id==='toutiao-haoduoyu');
    assert.equal(account.name,'已确认账号名'); assert.equal(account.active,0);
    db.close();
  } finally { rmSync(directory,{recursive:true,force:true}); }
});
