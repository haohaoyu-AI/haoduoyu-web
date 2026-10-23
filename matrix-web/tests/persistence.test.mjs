import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync, readFileSync, writeFileSync, symlinkSync, linkSync, existsSync } from 'node:fs';
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

test('backup refuses existing destinations and source aliases without changing their bytes', () => {
  const directory = mkdtempSync(join(tmpdir(),'matrix-backup-collision-'));
  const file = join(directory,'matrix.sqlite');
  const db = openDatabase(file);
  db.close();
  try {
    const existing = join(directory,'existing.sqlite');
    const symbolic = join(directory,'symbolic.sqlite'), hard = join(directory,'hard.sqlite');
    writeFileSync(existing, 'previous verified backup', { mode: 0o600 });
    symlinkSync(file, symbolic);
    linkSync(file, hard);
    for (const output of [existing, symbolic, hard, file]) {
      const before = readFileSync(output);
      const result = spawnSync(process.execPath,['scripts/backup.mjs',output],{
        cwd:new URL('..',import.meta.url),env:{...process.env,MATRIX_DB_PATH:file},encoding:'utf8', timeout:10000,
      });
      assert.equal(result.status, 1, 'An existing backup or source alias must be rejected');
      assert.deepEqual(readFileSync(output), before);
    }
  } finally { rmSync(directory,{recursive:true,force:true}); }
});

test('backup creates private files even with a permissive umask and removes a failed new output', () => {
  const directory = mkdtempSync(join(tmpdir(),'matrix-backup-private-'));
  const file = join(directory,'source.sqlite');
  const db = openDatabase(file);
  db.close();
  try {
    const destination = join(directory,'private','backup.sqlite');
    const result = spawnSync(process.execPath,['--input-type=module','-e',
      'process.umask(0); process.argv[2]=process.argv[1]; await import("./scripts/backup.mjs");',destination],{
      cwd:new URL('..',import.meta.url),env:{...process.env,MATRIX_DB_PATH:file},encoding:'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(statSync(destination).mode & 0o777, 0o600);
    assert.equal(statSync(join(directory,'private')).mode & 0o777, 0o700);
    const invalid = join(directory,'invalid.sqlite'), failed = join(directory,'incomplete.sqlite');
    writeFileSync(invalid, 'invalid SQLite database');
    const broken = spawnSync(process.execPath,['scripts/backup.mjs',failed],{
      cwd:new URL('..',import.meta.url),env:{...process.env,MATRIX_DB_PATH:invalid},encoding:'utf8',
    });
    assert.equal(broken.status, 1);
    assert.equal(existsSync(failed), false, 'An incomplete new backup must not look usable');
  } finally { rmSync(directory,{recursive:true,force:true}); }
});
