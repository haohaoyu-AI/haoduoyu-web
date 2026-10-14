// Local synthetic migration compatibility test. No Sites tools, production DB,
// network requests, tasks, or real user data. The conservative splitter below
// demonstrates a failure mechanism; Sites' production splitter is not verified.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {drizzle} from 'drizzle-orm/d1';
import {migrate} from 'drizzle-orm/d1/migrator';

// Exact pre-hotfix purge trigger from the reviewed failed-source migration.
const originalPurge = "CREATE TRIGGER word_progress_purge_deleted_article AFTER DELETE ON articles\nWHEN EXISTS(SELECT 1 FROM word_progress_events p WHERE p.owner=OLD.owner AND p.target_kind='article' AND p.target_id=OLD.id)\nBEGIN\n SELECT CASE WHEN OLD.state!='deleting' OR NOT EXISTS(\n  SELECT 1 FROM article_deletions x\n  WHERE x.id=OLD.id AND x.owner=OLD.owner AND x.state='deleted' AND x.deleted_at IS NOT NULL\n   AND (x.operation_id IS NULL OR EXISTS(\n    SELECT 1 FROM article_list_deletions o\n    WHERE o.id=x.operation_id AND o.owner=x.owner AND o.state='deleting'\n     AND o.confirmed_at IS NOT NULL AND o.lock_token IS NOT NULL\n     AND o.lock_expires>strftime('%Y-%m-%dT%H:%M:%fZ','now')\n     AND EXISTS(SELECT 1 FROM json_each(o.snapshot_json) j WHERE json_extract(j.value,'$.id')=x.id)\n   ))\n ) THEN RAISE(ABORT, 'word_progress_delete_requires_confirmed_article') END;\n DELETE FROM word_progress_events WHERE owner=OLD.owner AND target_kind='article' AND target_id=OLD.id;\nEND;";
const marker = '--> statement-breakpoint';
const migration = fs.readFileSync('drizzle/0038_word_progress_events.sql', 'utf8');
assert.equal(migration.includes('\r'), false, '0038 uses LF line endings');
const pieces = migration.split(marker).map(sql => sql.trim()).filter(Boolean);
function firstEndSplit(sql) {
  let rest = sql.replace(/--[^\n]*/g, '').trim();
  const statements = [];
  while (rest) {
    const expression = /^CREATE\s+TRIGGER\b/i.test(rest)
      ? /^CREATE\s+TRIGGER\b[\s\S]*?\bEND\s*;/i : /^[^;]+;/;
    const match = expression.exec(rest);
    if (!match) { statements.push(rest); break; }
    statements.push(match[0]);
    rest = rest.slice(match[0].length).trim();
  }
  return statements;
}
const conservativePieces = firstEndSplit(migration);
assert.equal(pieces.length, 6, '0038 contains table, index and four independently executable triggers');
assert.equal(conservativePieces.length, pieces.length, 'first-END splitting must preserve complete statements');
for (const piece of pieces) {
  assert.match(piece, /^CREATE\b/i, 'migration sections have no leading line comments');
  assert.equal(firstEndSplit(piece).length, 1, 'each breakpoint is one complete conservative statement');
  if (/^CREATE TRIGGER\b/i.test(piece)) {
    assert.equal((piece.match(/\bEND\s*;/g) || []).length, 1, 'only the outer trigger has END');
    const body = piece.match(/\bBEGIN\b([\s\S]+)\bEND\s*;?\s*$/i)?.[1];
    assert.ok(body);
    assert.equal(body.split(';').filter(value => value.trim()).length, 1, 'one SQL statement per trigger body');
  }
}
for (const prefix of ['0035_', '0037_']) {
  const filename = fs.readdirSync('drizzle').find(name => name.startsWith(prefix) && name.endsWith('.sql'));
  const sql = fs.readFileSync(path.join('drizzle', filename), 'utf8');
  const expected = sql.split(marker).filter(piece => piece.replace(/--[^\n]*/g, '').trim());
  assert.equal(firstEndSplit(sql).length, expected.length, filename + ' remains a compatible reference');
}
const guard = pieces.find(piece => /^CREATE TRIGGER word_progress_delete_article_guard\b/.test(piece));
const oldPredicate = originalPurge.match(/SELECT CASE WHEN ([\s\S]+?) THEN RAISE/)?.[1];
const newPredicate = guard?.match(/\nAND \(([\s\S]+)\)\nBEGIN/)?.[1];
assert.ok(oldPredicate && newPredicate, 'both old and new authorization guards are located');
assert.equal(newPredicate.replace(/\s/g, ''), oldPredicate.replace(/\s/g, ''), 'owner/tombstone/confirmed operation/lock/exact snapshot predicate is unchanged');
const broken = firstEndSplit(originalPurge);
assert.equal(broken.length, 3, 'old CASE END cuts a trigger into incomplete guard, DELETE and END');
assert.match(broken[0], /THEN RAISE\(ABORT, 'word_progress_delete_requires_confirmed_article'\) END;$/);
console.log('PASS format: six complete sections; one-body triggers; 0035/0037 references; exact original CASE END negative reproduced.');

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'synthetic-word-migration-'));
const mf = new Miniflare({
  cf: false, modules: true, script: 'export default {fetch(){return new Response("SYNTHETIC ONLY")}}',
  compatibilityDate: '2026-05-22', d1Databases: {EXACT: 'word-format-exact', CONSERVATIVE: 'word-format-conservative'},
});
try {
  fs.mkdirSync(path.join(folder, 'meta'));
  const journal = JSON.parse(fs.readFileSync('drizzle/meta/_journal.json', 'utf8'));
  journal.entries = journal.entries.filter(entry => entry.idx < 38);
  fs.writeFileSync(path.join(folder, 'meta/_journal.json'), JSON.stringify(journal));
  for (const entry of journal.entries) fs.copyFileSync(path.join('drizzle', entry.tag + '.sql'), path.join(folder, entry.tag + '.sql'));
  const exact = await mf.getD1Database('EXACT');
  await migrate(drizzle(exact), {migrationsFolder: folder});
  for (const piece of pieces) await exact.prepare(piece).run();
  const names = (await exact.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'word_progress_%' ORDER BY name").all()).results.map(row => row.name);
  assert.deepEqual(names, ['word_progress_delete_article_guard', 'word_progress_no_delete', 'word_progress_no_update', 'word_progress_purge_deleted_article']);
  console.log('PASS real D1: every 0038 breakpoint independently prepare/run; all four expected triggers exist.');
  await assert.rejects(exact.prepare(broken[0].replace('word_progress_purge_deleted_article', 'synthetic_truncated_trigger')).run(), /incomplete input/i);
  await exact.prepare(originalPurge.replace('word_progress_purge_deleted_article', 'synthetic_complete_original_trigger')).run();
  console.log('PASS real D1: exact truncated old trigger returns incomplete input; identical old trigger succeeds when submitted whole.');
  const conservative = await mf.getD1Database('CONSERVATIVE');
  await migrate(drizzle(conservative), {migrationsFolder: folder});
  for (const piece of conservativePieces) await conservative.prepare(piece).run();
  assert.equal((await conservative.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='trigger' AND name LIKE 'word_progress_%'").first()).n, 4);
  console.log('PASS real D1: conservative first-END split installs complete hotfix; no production actions performed.');
} finally {
  await mf.dispose();
  fs.rmSync(folder, {recursive: true, force: true});
}
