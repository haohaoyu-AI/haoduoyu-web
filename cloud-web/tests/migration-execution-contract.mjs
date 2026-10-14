// Reproducible audit of pinned local migration implementations. Isolated,
// synthetic databases only; no environment, account, Sites or production I/O.
// Local behavior does not establish the Sites deployment-job contract/state.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {Miniflare} from 'miniflare';
import {drizzle} from 'drizzle-orm/d1';
import {migrate} from 'drizzle-orm/d1/migrator';
import {readMigrationFiles} from 'drizzle-orm/migrator';

const root = fileURLToPath(new URL('../', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const reportIndex = process.argv.indexOf('--report');
const reportPath = reportIndex < 0 ? null : process.argv[reportIndex + 1];
if (reportIndex >= 0 && !reportPath) throw Error('--report requires a filename');
const report = {
  started_at: new Date().toISOString(), node_version: process.version,
  scope: 'Pinned local implementations and isolated synthetic Node SQLite/workerd D1',
  limitations: [
    'Sites migration-job version, input bytes, splitting, transaction policy and ledger remain unverified.',
    'V160 source evidence is not the actual consumed deployment archive.',
    'Local D1 success cannot establish production schema/state or authorize a production rerun.',
  ], checks: [],
};
async function check(name, fn) {
  const evidence = await fn();
  report.checks.push({name, passed: true, ...(evidence ? {evidence} : {})});
  console.log(`PASS ${name}`);
}
const relativeRead = name => fs.readFileSync(path.join(root, name), 'utf8');
const packageVersions = {
  'drizzle-orm': '0.45.2', wrangler: '4.92.0', miniflare: '4.20260515.0',
};
const journal = JSON.parse(relativeRead('drizzle/meta/_journal.json'));
const migrations = readMigrationFiles({migrationsFolder: path.join(root, 'drizzle')});
const sources = journal.entries.map(entry => ({
  file: `${entry.tag}.sql`, sql: relativeRead(`drizzle/${entry.tag}.sql`),
}));
let mf;
let externalCalls = 0;
try {
  await check('installed implementation versions match the repository lockfile', () => {
    const lock = JSON.parse(relativeRead('package-lock.json'));
    for (const [name, version] of Object.entries(packageVersions)) {
      assert.equal(JSON.parse(relativeRead(`node_modules/${name}/package.json`)).version, version);
      assert.equal(lock.packages[`node_modules/${name}`].version, version);
    }
    report.package_versions = packageVersions;
    return packageVersions;
  });

  // Extract the actual installed Wrangler function bodies, not a rewritten
  // approximation. Explicit markers fail closed if the pinned bundle changes.
  const bundlePath = 'node_modules/wrangler/wrangler-dist/cli.js';
  const bundle = relativeRead(bundlePath);
  function section(start, end) {
    const from = bundle.indexOf(start), to = bundle.indexOf(end, from);
    assert.ok(from >= 0 && to > from, 'expected pinned Wrangler implementation section');
    return bundle.slice(from + start.length, to);
  }
  const trimmer = section('// src/d1/trimmer.ts\n', 'var init_trimmer =');
  const splitter = section('// src/d1/splitter.ts\n', 'var init_splitter =');
  const context = vm.createContext({UserError: Error});
  new vm.Script(`${trimmer}\n${splitter}`).runInContext(context);
  const splitSqlQuery = source => Array.from(context.splitSqlQuery(source));
  report.wrangler_implementation = {
    bundle_path: bundlePath, bundle_sha256: digest(bundle),
    trimmer_sha256: digest(trimmer), splitter_sha256: digest(splitter),
    extraction: 'Exact function bodies between installed source markers',
  };
  const current = sources.find(item => item.file === '0053_far_sleepwalker.sql');
  assert.ok(current);
  const currentPieces = splitSqlQuery(current.sql);
  const currentBreakpointPieces = current.sql.split('--> statement-breakpoint');
  const afterTriggerPieces = currentBreakpointPieces.filter(piece => /CREATE TRIGGER topic_(control_receipt|settlement)_claim_key\b/.test(piece));
  await check('actual Wrangler splitter preserves both CASE-containing 0053 AFTER triggers', () => {
    // The view's CASE ... END, punctuation leaves its compound stack open in
    // this pinned splitter. The full file groups into two pieces, not six.
    // This is actual observed grouping, not an incomplete trigger fragment.
    assert.equal(currentPieces.length, 2);
    assert.equal(afterTriggerPieces.length, 2);
    const triggers = afterTriggerPieces.map(piece => {
      const split = splitSqlQuery(piece);
      assert.equal(split.length, 1);
      return split[0];
    });
    for (const trigger of triggers) {
      assert.match(trigger, /SELECT CASE WHEN[\s\S]+RAISE\(ABORT,'topic_control_request_conflict'\) END;/);
      assert.match(trigger, /INSERT INTO topic_research_control_keys[\s\S]+; END$/);
      assert.ok(currentPieces[1].includes(trigger));
    }
    return {migration_sha256: digest(current.sql), piece_count: currentPieces.length,
      grouping_note: 'CASE END comma punctuation in the view retains several top-level statements in the second piece',
      standalone_after_trigger_piece_counts: [1, 1],
      trigger_piece_sha256: triggers.map(digest), first_end_simulator_is_this_implementation: false};
  });
  await check('actual Wrangler-split current source applies completely with Node SQLite exec', () => {
    const db = new DatabaseSync(':memory:');
    try {
      for (const source of sources) for (const piece of splitSqlQuery(source.sql)) db.exec(piece);
      assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name IN ('outline_flows','outline_flow_stages','outline_owner_authorization','outline_owner_run_stage')").get().n, 4);
      assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='trigger' AND name IN ('topic_control_receipt_claim_key','topic_settlement_claim_key')").get().n, 2);
      return {migration_count: sources.length, piece_count: sources.reduce((sum, source) => sum + splitSqlQuery(source.sql).length, 0),
        baseline_0012_objects: 4, case_guard_triggers: 2, multi_statement_pieces_preserved_by_exec: true,
        platform_equivalence: false};
    } finally { db.close(); }
  });

  await check('Drizzle reader retains complete breakpoint bytes without END splitting', () => {
    assert.equal(migrations.length, sources.length);
    for (const [index, source] of sources.entries()) {
      assert.deepEqual(migrations[index].sql, source.sql.split('--> statement-breakpoint'));
      assert.equal(migrations[index].hash, digest(source.sql));
    }
    const target = migrations[sources.findIndex(item => item === current)];
    assert.equal(target.sql.filter(piece => piece.trim()).length, 6);
    return {migration_count: migrations.length, current_0053_breakpoint_count: 6,
      migration_inputs: sources.map((source, index) => ({file: source.file, sha256: digest(source.sql),
        breakpoint_count: migrations[index].sql.filter(piece => piece.trim()).length,
        wrangler_piece_count: splitSqlQuery(source.sql).length}))};
  });

  mf = new Miniflare({
    cf: false, port: 0, modules: true,
    script: 'export default {fetch(){throw Error("SYNTHETIC MIGRATION CONTRACT ONLY")}}',
    compatibilityDate: '2026-05-22',
    d1Databases: {DRIZZLE_DB: 'synthetic-drizzle-contract', WRANGLER_DB: 'synthetic-wrangler-contract',
      INCREMENTAL_DB: 'synthetic-incremental-contract'},
    outboundService: () => {externalCalls++; throw Error('External network disabled');},
  });
  const drizzleD1 = await mf.getD1Database('DRIZZLE_DB');
  const wranglerD1 = await mf.getD1Database('WRANGLER_DB');
  const mappedStatements = new WeakMap();
  const batches = [];
  function wrappedStatement(statement, sql) {
    const wrapped = new Proxy(statement, {get(target, key) {
      if (key === 'bind') return (...args) => wrappedStatement(target.bind(...args), sql);
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    }});
    mappedStatements.set(wrapped, {statement, sql});
    return wrapped;
  }
  const observedDatabase = (database, observedBatches) => ({
    prepare: sql => wrappedStatement(database.prepare(sql), sql),
    batch: async statements => {
      const inputs = statements.map(statement => mappedStatements.get(statement));
      assert.ok(inputs.every(Boolean), 'every batched input must be traced');
      observedBatches.push(inputs.map(({sql}) => ({sha256: digest(sql), bytes: Buffer.byteLength(sql),
        migration_index: migrations.findIndex(migration => migration.sql.includes(sql)),
        journal_insert: /^INSERT INTO "__drizzle_migrations"/.test(sql)})));
      return database.batch(inputs.map(({statement}) => statement));
    },
  });
  const observedD1 = observedDatabase(drizzleD1, batches);
  const schema = async db => (await db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name<>'__drizzle_migrations' ORDER BY type,name").all()).results;
  await check('genuine Drizzle D1 migrator applies all current migrations in one isolated batch', async () => {
    await migrate(drizzle(observedD1), {migrationsFolder: path.join(root, 'drizzle')});
    assert.equal(batches.length, 1);
    assert.equal(batches[0].filter(input => input.journal_insert).length, migrations.length);
    const ledger = (await drizzleD1.prepare('SELECT hash,created_at FROM __drizzle_migrations ORDER BY created_at').all()).results;
    assert.deepEqual(ledger.map(row => row.hash), migrations.map(migration => migration.hash));
    assert.deepEqual(ledger.map(row => Number(row.created_at)), migrations.map(migration => migration.folderMillis));
    assert.equal((await drizzleD1.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name IN ('outline_flows','outline_flow_stages','outline_owner_authorization','outline_owner_run_stage')").first()).n, 4);
    assert.equal((await drizzleD1.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='trigger' AND name IN ('topic_control_receipt_claim_key','topic_settlement_claim_key')").first()).n, 2);
    return {migration_count: migrations.length, batch_count: batches.length, input_count: batches[0].length,
      traced_batch_inputs: batches[0], ledger_hashes_exact: true, baseline_0012_objects: 4, case_guard_triggers: 2};
  });
  await check('genuine Drizzle D1 rerun issues no pending migration batch', async () => {
    const before = await schema(drizzleD1);
    await migrate(drizzle(observedD1), {migrationsFolder: path.join(root, 'drizzle')});
    assert.equal(batches.length, 1);
    assert.deepEqual(await schema(drizzleD1), before);
    return {additional_batches: 0, schema_unchanged: true, production_rerun_safety_established: false};
  });
  await check('genuine Drizzle D1 source-prefix upgrade batches only 0050 through 0053', async () => {
    const prefix = journal.entries.filter(entry => entry.idx < 50);
    assert.equal(prefix.length, 50);
    const baseline = fs.mkdtempSync(path.join(os.tmpdir(), 'synthetic-migration-prefix-'));
    try {
      fs.mkdirSync(path.join(baseline, 'meta'));
      fs.writeFileSync(path.join(baseline, 'meta/_journal.json'), JSON.stringify({...journal, entries: prefix}));
      for (const entry of prefix) fs.copyFileSync(path.join(root, 'drizzle', entry.tag + '.sql'), path.join(baseline, entry.tag + '.sql'));
      const incrementalD1 = await mf.getD1Database('INCREMENTAL_DB');
      const observedBatches = [];
      const incrementalObserved = observedDatabase(incrementalD1, observedBatches);
      const orm = drizzle(incrementalObserved);
      await migrate(orm, {migrationsFolder: baseline});
      assert.equal(observedBatches.length, 1);
      const oldDefinitions = await schema(incrementalD1);
      await migrate(orm, {migrationsFolder: path.join(root, 'drizzle')});
      assert.equal(observedBatches.length, 2);
      const pending = observedBatches[1];
      assert.equal(pending.filter(input => input.journal_insert).length, 4);
      assert.deepEqual([...new Set(pending.filter(input => !input.journal_insert).map(input => input.migration_index))], [50, 51, 52, 53]);
      const after = await schema(incrementalD1);
      const oldNames = new Set(oldDefinitions.map(row => row.name));
      assert.deepEqual(after.filter(row => oldNames.has(row.name)), oldDefinitions);
      assert.deepEqual(after, await schema(drizzleD1));
      const ledger = (await incrementalD1.prepare('SELECT hash FROM __drizzle_migrations ORDER BY created_at').all()).results;
      assert.deepEqual(ledger.map(row => row.hash), migrations.map(migration => migration.hash));
      await migrate(orm, {migrationsFolder: path.join(root, 'drizzle')});
      assert.equal(observedBatches.length, 2);
      return {source_prefix_migrations: 50, pending_migration_indexes: [50, 51, 52, 53],
        pending_batch_count: 1, pending_input_count: pending.length, traced_pending_inputs: pending,
        old_schema_unchanged: true, full_schema_matches: true, exact_ledger_count: ledger.length,
        production_ledger_prefix_proven: false};
    } finally { fs.rmSync(baseline, {recursive: true, force: true}); }
  });
  await check('actual Wrangler-split SQL produces the same isolated D1 schema as genuine Drizzle', async () => {
    const pieces = sources.flatMap(source => splitSqlQuery(source.sql));
    await wranglerD1.batch(pieces.map(piece => wranglerD1.prepare(piece)));
    assert.deepEqual(await schema(wranglerD1), await schema(drizzleD1));
    return {piece_count: pieces.length, schema_matches: true};
  });
  await check('isolated D1 failed batch rolls back earlier work and leaves no synthetic migration ledger', async () => {
    await drizzleD1.prepare('CREATE TABLE synthetic_contract_marker(label TEXT)').run();
    await drizzleD1.prepare('CREATE TABLE synthetic_contract_ledger(hash TEXT)').run();
    // Truncated SQL is an explicit negative fixture, not a real job input.
    const truncated = afterTriggerPieces[0].split(" END;")[0] + ' END;';
    await assert.rejects(() => drizzleD1.batch([
      drizzleD1.prepare("INSERT INTO synthetic_contract_marker VALUES('earlier')"),
      drizzleD1.prepare(truncated.replace('topic_control_receipt_claim_key', 'synthetic_contract_truncated')),
      drizzleD1.prepare("INSERT INTO synthetic_contract_ledger VALUES('not-recorded')"),
    ]), error => /incomplete input/.test(String(error.cause?.message ?? error.message)));
    assert.equal((await drizzleD1.prepare('SELECT count(*) AS n FROM synthetic_contract_marker').first()).n, 0);
    assert.equal((await drizzleD1.prepare('SELECT count(*) AS n FROM synthetic_contract_ledger').first()).n, 0);
    return {negative_input_is_real_job_input: false, earlier_work_rolled_back: true,
      later_ledger_not_written: true, platform_transaction_policy_proven: false};
  });
  assert.equal(externalCalls, 0);
  report.external_calls = externalCalls;
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = {name: error.name, message: error.message, cause: error.cause?.message ?? null};
  throw error;
} finally {
  if (mf) await mf.dispose();
  report.finished_at = new Date().toISOString();
  report.check_count = report.checks.length;
  if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
}
console.log(`PASS ${report.check_count} implementation-contract checks; external calls ${externalCalls}; Sites contract/state remain unverified.`);
