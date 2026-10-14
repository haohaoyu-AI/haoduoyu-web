// Offline, synthetic SQLite regression. The first-END splitter is a diagnostic
// simulator, NOT a known Sites production contract. The candidate stays under
// tests/fixtures: it must not replace a historical migration or be deployed.
// No dependencies, network, environment reads, real user data, or platform writes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';

const root = fileURLToPath(new URL('../', import.meta.url));
const originalPath = path.join(root, 'drizzle/0053_far_sleepwalker.sql');
const fixturePath = path.join(root, 'tests/fixtures/0053-first-end-compatible.sql');
const original = fs.readFileSync(originalPath, 'utf8');
const candidate = fs.readFileSync(fixturePath, 'utf8');
const marker = '--> statement-breakpoint';
const fixtureHeader = '-- DIAGNOSTIC FIXTURE ONLY. This is not an applied or deployable migration.\n'
  + "-- Sites' actual splitter and production migration ledger remain unknown.\n";
const journal = JSON.parse(fs.readFileSync(path.join(root, 'drizzle/meta/_journal.json'), 'utf8'));
const baseline = journal.entries.filter(entry => entry.idx < 53).map(entry => ({
  name: `${entry.tag}.sql`, sql: fs.readFileSync(path.join(root, 'drizzle', `${entry.tag}.sql`), 'utf8'),
}));
const reportIndex = process.argv.indexOf('--report');
const reportPath = reportIndex === -1 ? null : process.argv[reportIndex + 1];
if (reportIndex !== -1 && !reportPath) throw new Error('--report requires a filename');
const digest = text => createHash('sha256').update(text).digest('hex');
const report = {
  started_at: new Date().toISOString(), node_version: process.version,
  original_path: 'drizzle/0053_far_sleepwalker.sql', original_sha256: digest(original),
  fixture_path: 'tests/fixtures/0053-first-end-compatible.sql', fixture_sha256: digest(candidate),
  scope: 'Synthetic in-memory Node SQLite; diagnostic splitter only; no production actions',
  limitations: [
    "Sites' actual V160 failed input, splitter, transaction policy and applied ledger are unknown.",
    'Local Node SQLite is not D1 or Sites; no platform batch or concurrent-worker guarantee is inferred.',
    'Node prepare accepts only the first statement of 0012; full exec is used for the actual baseline.',
    'Fixture is not a forward migration and cannot safely replace an already applied 0053.',
  ],
  checks: [],
};
const errorDetails = error => ({
  name: error.name, message: error.message, code: error.code ?? null,
  errcode: error.errcode ?? null, errstr: error.errstr ?? null,
});
function check(name, action) {
  const evidence = action();
  report.checks.push({name, passed: true, ...(evidence ? {evidence} : {})});
  console.log(`PASS ${name}`);
}
// Intentionally naive: illustrates an unsafe first-END delimiter. It is not a
// general SQL parser, and no evidence establishes that Sites uses this code.
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
function baselineDatabase() {
  const db = new DatabaseSync(':memory:');
  // exec preserves complete SQL files; prepare is deliberately NOT used here.
  for (const migration of baseline) db.exec(migration.sql);
  return db;
}
const stamp = '2026-10-14T00:00:00.000Z';
const inputHash = 'a'.repeat(64);
const payloadHash = 'b'.repeat(64);
const researchId = owner => `SYNTHETIC-research-${owner}`;
function ensureRun(db, owner) {
  const id = researchId(owner);
  if (!db.prepare('SELECT 1 FROM topic_research_runs WHERE id=?').get(id)) {
    db.prepare(`INSERT INTO topic_research_runs
      (id,owner,request_key,generation,state,input_hash,input_json,created,updated,dispatch_state)
      VALUES(?,?,?,1,'queued',?,'{}',?,?,'accepted')`).run(id, owner, `SYNTHETIC-start-${owner}`, inputHash, stamp, stamp);
  }
  return id;
}
function controlValues(db, owner, key) {
  return [owner, key, ensureRun(db, owner), 'renew', payloadHash, '{"synthetic":true}', stamp];
}
function settlementValues(db, owner, key, holderLabel = key) {
  const id = ensureRun(db, owner);
  const holderHash = digest(`SYNTHETIC-holder:${owner}:${holderLabel}`);
  let holder = db.prepare('SELECT * FROM topic_research_holders WHERE owner=? AND research_id=? AND claim_sha256=?').get(owner, id, holderHash);
  if (!holder) {
    const epoch = db.prepare('SELECT coalesce(max(epoch),0)+1 AS n FROM topic_research_holders WHERE owner=? AND research_id=?').get(owner, id).n;
    db.prepare(`INSERT INTO topic_research_holders(owner,research_id,epoch,claim_sha256,execution_id,created)
      VALUES(?,?,?,?,?,?)`).run(owner, id, epoch, holderHash, `SYNTHETIC-execution-${holderLabel}`, stamp);
    holder = db.prepare('SELECT * FROM topic_research_holders WHERE owner=? AND research_id=? AND claim_sha256=?').get(owner, id, holderHash);
  }
  // Satisfies the real 0052 exact-execution guard, including its holder/fence
  // joins. These are synthetic offline records, not authenticated evidence.
  const proof = {
    owner, research_id: id, input_hash: inputHash, claim_sha256: holderHash,
    claimed_at: stamp, epoch: holder.epoch, execution_id: holder.execution_id,
    verified: true, verification_source: 'authenticated_executor_terminal',
    mapping_verified: true, complete_action_inventory: true, all_actions_stopped: true,
    terminal_state: 'failed', actions: [], ended_at: stamp,
  };
  return [owner, id, holderHash, holderHash, inputHash, key, payloadHash,
    JSON.stringify(proof), '{"synthetic":true}', stamp];
}
const receiptSql = {
  control: 'INTO topic_research_control_receipts(owner,request_key,research_id,operation,payload_sha256,result_json,created)',
  settlement: 'INTO topic_research_execution_settlements(owner,research_id,holder_key,claim_sha256,input_sha256,request_key,payload_sha256,evidence_json,result_json,created)',
};
function insert(db, kind, values, ignore = false) {
  return db.prepare(`INSERT${ignore ? ' OR IGNORE' : ''} ${receiptSql[kind]} VALUES(${values.map(() => '?').join(',')})`).run(...values);
}
function snapshot(db) {
  return Object.fromEntries([
    'topic_research_control_receipts', 'topic_research_execution_settlements',
    'topic_research_control_keys', 'topic_research_effective_control_keys',
  ].map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY owner,request_key`).all()]));
}
function expectConflict(action) {
  assert.throws(action, error => error.message === 'topic_control_request_conflict'
    && error.errcode === 1811, 'explicit RAISE(ABORT) must survive OR IGNORE');
}
function behavioralSuite(label, install) {
  const db = baselineDatabase();
  try {
    report.sqlite_version ??= db.prepare('SELECT sqlite_version() AS v').get().v;
    const legacyOwner = 'SYNTHETIC-legacy';
    const legacyControl = controlValues(db, legacyOwner, 'legacy-control');
    const legacySettlement = settlementValues(db, legacyOwner, 'legacy-settlement');
    const legacyBothControl = controlValues(db, legacyOwner, 'legacy-both');
    const legacyBothSettlement = settlementValues(db, legacyOwner, 'legacy-both');
    insert(db, 'control', legacyControl);
    insert(db, 'settlement', legacySettlement);
    insert(db, 'control', legacyBothControl);
    insert(db, 'settlement', legacyBothSettlement);
    install(db);
    check(`${label}: legacy projection retains both conflicting records and no backfill`, () => {
      const rows = db.prepare('SELECT request_key,receipt_table,legacy_conflict FROM topic_research_effective_control_keys WHERE owner=? ORDER BY request_key').all(legacyOwner);
      assert.deepEqual(rows.map(row => ({...row})), [
        {request_key: 'legacy-both', receipt_table: null, legacy_conflict: 1},
        {request_key: 'legacy-control', receipt_table: 'control', legacy_conflict: 0},
        {request_key: 'legacy-settlement', receipt_table: 'settlement', legacy_conflict: 0},
      ]);
      assert.equal(db.prepare('SELECT count(*) AS n FROM topic_research_control_keys').get().n, 0);
      const before = snapshot(db);
      assert.equal(insert(db, 'control', legacyBothControl, true).changes, 0);
      assert.equal(insert(db, 'settlement', legacyBothSettlement, true).changes, 0);
      assert.deepEqual(snapshot(db), before);
      return {legacy_rows: rows.map(row => ({...row}))};
    });
    check(`${label}: legacy cross-table conflicts reject without deleting history`, () => {
      const settlement = settlementValues(db, legacyOwner, 'legacy-control');
      const control = controlValues(db, legacyOwner, 'legacy-settlement');
      const before = snapshot(db);
      for (const ignore of [false, true]) {
        expectConflict(() => insert(db, 'settlement', settlement, ignore));
        expectConflict(() => insert(db, 'control', control, ignore));
      }
      assert.deepEqual(snapshot(db), before);
    });
    for (const winningKind of ['control', 'settlement']) {
      const losingKind = winningKind === 'control' ? 'settlement' : 'control';
      const owner = `SYNTHETIC-${winningKind}-wins`;
      const key = 'shared-nonce';
      const values = {
        control: controlValues(db, owner, key), settlement: settlementValues(db, owner, key),
      };
      check(`${label}: ${winningKind} winner, identical retry and cross-table OR IGNORE conflict`, () => {
        assert.equal(insert(db, winningKind, values[winningKind]).changes, 1);
        const before = snapshot(db);
        assert.equal(insert(db, winningKind, values[winningKind], true).changes, 0);
        for (const ignore of [false, true]) expectConflict(() => insert(db, losingKind, values[losingKind], ignore));
        assert.deepEqual(snapshot(db), before);
        assert.equal(db.prepare('SELECT receipt_table FROM topic_research_control_keys WHERE owner=? AND request_key=?').get(owner, key).receipt_table, winningKind);
      });
    }
    check(`${label}: owner isolation permits the same nonce in different tables`, () => {
      const control = controlValues(db, 'SYNTHETIC-owner-A', 'owner-shared');
      const settlement = settlementValues(db, 'SYNTHETIC-owner-B', 'owner-shared');
      assert.equal(insert(db, 'control', control).changes, 1);
      assert.equal(insert(db, 'settlement', settlement).changes, 1);
      assert.equal(db.prepare('SELECT count(*) AS n FROM topic_research_control_keys WHERE request_key=?').get('owner-shared').n, 2);
      // Another owner's legacy conflict likewise cannot block this owner.
      assert.equal(insert(db, 'control', controlValues(db, 'SYNTHETIC-owner-C', 'legacy-both')).changes, 1);
    });
    check(`${label}: a reserved registry key blocks either receipt table`, () => {
      const owner = 'SYNTHETIC-reserved', key = 'reserved';
      const control = controlValues(db, owner, key), settlement = settlementValues(db, owner, key);
      db.prepare('INSERT INTO topic_research_control_keys(owner,request_key,created) VALUES(?,?,?)').run(owner, key, stamp);
      const before = snapshot(db);
      for (const ignore of [false, true]) {
        expectConflict(() => insert(db, 'control', control, ignore));
        expectConflict(() => insert(db, 'settlement', settlement, ignore));
      }
      assert.deepEqual(snapshot(db), before);
    });
    for (const kind of ['control', 'settlement']) {
      for (const ignore of [false, true]) {
        check(`${label}: ${kind} multi-row ${ignore ? 'OR IGNORE' : 'plain'} conflict rolls back the whole statement`, () => {
          const owner = `SYNTHETIC-multi-${kind}-${ignore}`;
          const other = kind === 'control' ? 'settlement' : 'control';
          const make = (table, key) => table === 'control' ? controlValues(db, owner, key) : settlementValues(db, owner, key);
          const conflict = make(other, 'conflict'), first = make(kind, 'first'), second = make(kind, 'conflict');
          insert(db, other, conflict);
          const before = snapshot(db);
          const tuple = `(${first.map(() => '?').join(',')})`;
          const statement = db.prepare(`INSERT${ignore ? ' OR IGNORE' : ''} ${receiptSql[kind]} VALUES${tuple},${tuple}`);
          expectConflict(() => statement.run(...first, ...second));
          assert.deepEqual(snapshot(db), before, 'the first new receipt and its AFTER-insert key must both roll back');
        });
      }
      check(`${label}: ${kind} explicit transaction rollback preserves all earlier records`, () => {
        const owner = `SYNTHETIC-transaction-${kind}`, other = kind === 'control' ? 'settlement' : 'control';
        const make = (table, key) => table === 'control' ? controlValues(db, owner, key) : settlementValues(db, owner, key);
        const conflict = make(other, 'conflict'), first = make(kind, 'first'), second = make(kind, 'conflict');
        insert(db, other, conflict);
        db.exec('CREATE TABLE IF NOT EXISTS synthetic_batch_marker(label TEXT)');
        const before = snapshot(db);
        db.exec('BEGIN');
        try {
          db.prepare('INSERT INTO synthetic_batch_marker VALUES(?)').run(owner);
          insert(db, kind, first);
          expectConflict(() => insert(db, kind, second, true));
          // ABORT cancels the failed statement, not previous transaction work.
          // The batch runner must perform ROLLBACK; the test does so explicitly.
          assert.equal(db.prepare('SELECT count(*) AS n FROM synthetic_batch_marker WHERE label=?').get(owner).n, 1);
        } finally { db.exec('ROLLBACK'); }
        assert.equal(db.prepare('SELECT count(*) AS n FROM synthetic_batch_marker WHERE label=?').get(owner).n, 0);
        assert.deepEqual(snapshot(db), before);
      });
    }
    check(`${label}: registry update/delete guards stay immutable`, () => {
      const before = snapshot(db);
      assert.throws(() => db.exec("UPDATE topic_research_control_keys SET result_json='{}'"), /immutable_topic_control_key/);
      assert.throws(() => db.exec('DELETE FROM topic_research_control_keys'), /immutable_topic_control_key/);
      assert.deepEqual(snapshot(db), before);
    });
    return snapshot(db);
  } finally { db.close(); }
}

try {
  check('fixture changes only the two AFTER-trigger CASE guards into WHERE guards', () => {
    let replacements = 0;
    const rewritten = original.replace(/SELECT CASE WHEN (.+?) THEN RAISE\(ABORT,'topic_control_request_conflict'\) END;/g,
      (_match, condition) => { replacements++; return `SELECT RAISE(ABORT,'topic_control_request_conflict') WHERE ${condition};`; });
    assert.equal(replacements, 2);
    // Git may check text files out with CRLF on Windows. Ignore only that
    // transport difference here; reported SHA256 values still hash raw bytes.
    assert.equal(candidate.replace(/\r\n/g, '\n'), fixtureHeader + rewritten.replace(/\r\n/g, '\n'));
    assert.equal(original.split(marker).filter(piece => piece.trim()).length, 6);
    return {rewritten_guards: replacements, historical_source_sha256: digest(original)};
  });
  check('actual 0012 exposes Node.prepare multi-statement truncation; baseline uses exec', () => {
    const sql = fs.readFileSync(path.join(root, 'drizzle/0012_outline_flow.sql'), 'utf8');
    const prepareDb = new DatabaseSync(':memory:'), execDb = new DatabaseSync(':memory:');
    try {
      prepareDb.prepare(sql).run();
      execDb.exec(sql);
      const names = db => db.prepare("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => row.name);
      assert.deepEqual(names(prepareDb), ['outline_flows']);
      assert.deepEqual(names(execDb), ['outline_flow_stages', 'outline_flows', 'outline_owner_authorization', 'outline_owner_run_stage']);
      return {prepare_objects: names(prepareDb), exec_objects: names(execDb), platform_equivalence: false};
    } finally { prepareDb.close(); execDb.close(); }
  });
  check('whole original 0053 installs; diagnostic first-END truncates both AFTER triggers with exact incomplete input', () => {
    const db = baselineDatabase();
    try {
      db.exec(original);
      assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='trigger' AND name IN ('topic_control_receipt_claim_key','topic_settlement_claim_key')").get().n, 2);
    } finally { db.close(); }
    const pieces = firstEndSplit(original);
    assert.equal(pieces.length, 10, 'each CASE guard leaves a separate INSERT and trailing END');
    const truncated = pieces.filter(piece => /^CREATE TRIGGER topic_(control_receipt|settlement)_claim_key\b/.test(piece));
    assert.equal(truncated.length, 2);
    const errors = [];
    const negativeDb = baselineDatabase();
    try {
      for (const piece of truncated) {
        let observed;
        assert.throws(() => negativeDb.prepare(piece).run(), error => {
          observed = errorDetails(error);
          return error.message === 'incomplete input' && error.errcode === 1;
        });
        errors.push({trigger: piece.match(/^CREATE TRIGGER (\w+)/)[1], fragment_sha256: digest(piece), error: observed});
      }
    } finally { negativeDb.close(); }
    return {diagnostic_piece_count: pieces.length, errors, actual_platform_failure_reproduced: false};
  });
  const candidatePieces = firstEndSplit(candidate);
  check('candidate retains six complete statements under the same diagnostic first-END splitter', () => {
    assert.equal(candidatePieces.length, 6);
    const db = baselineDatabase();
    try {
      for (const piece of candidatePieces) db.prepare(piece).run();
      assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='trigger' AND name IN ('topic_control_receipt_claim_key','topic_settlement_claim_key')").get().n, 2);
      return {diagnostic_piece_count: candidatePieces.length, local_prepare_run: true};
    } finally { db.close(); }
  });
  const originalResults = behavioralSuite('original whole SQL', db => db.exec(original));
  const candidateResults = behavioralSuite('candidate whole SQL', db => db.exec(candidate));
  const splitResults = behavioralSuite('candidate diagnostic split', db => {
    for (const piece of candidatePieces) db.prepare(piece).run();
  });
  check('all three installations produce exactly identical synthetic receipts, registry and legacy projection', () => {
    assert.deepEqual(candidateResults, originalResults);
    assert.deepEqual(splitResults, originalResults);
  });
  check('CASE versus WHERE has equal NULL, false and true predicate behavior', () => {
    const values = [null, 0, 1, -1, '0', '1', 'not-a-number'];
    const expectedAborts = [false, false, true, true, false, true, false];
    const outcomes = [];
    for (const [label, guard] of [
      ['case', "SELECT CASE WHEN NEW.condition THEN RAISE(ABORT,'synthetic_predicate') END;"],
      ['where', "SELECT RAISE(ABORT,'synthetic_predicate') WHERE NEW.condition;"],
    ]) {
      const db = new DatabaseSync(':memory:');
      try {
        db.exec(`CREATE TABLE synthetic_predicate(condition); CREATE TRIGGER synthetic_guard AFTER INSERT ON synthetic_predicate BEGIN ${guard} END;`);
        const aborts = values.map((value, index) => {
          let aborted = false;
          try { db.prepare('INSERT INTO synthetic_predicate VALUES(?)').run(value); }
          catch (error) { assert.equal(error.message, 'synthetic_predicate'); aborted = true; }
          assert.equal(aborted, expectedAborts[index]);
          return aborted;
        });
        outcomes.push({label, aborts});
      } finally { db.close(); }
    }
    assert.deepEqual(outcomes[0].aborts, outcomes[1].aborts);
    return {values, outcomes, actual_exists_predicate_is_never_null: true};
  });
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = errorDetails(error);
  throw error;
} finally {
  report.finished_at = new Date().toISOString();
  report.check_count = report.checks.length;
  if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
}
console.log(`PASS ${report.check_count} checks. Diagnostic candidate only; Sites V160 root cause and production migration state remain unverified.`);
