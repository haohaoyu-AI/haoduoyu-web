// Synthetic-only D1 adapter and actual TypeScript module loader.
// This file writes no Site source and does not call production or network services.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {createHash, webcrypto} from 'node:crypto';

export const sha256 = value => createHash('sha256').update(value).digest('hex');

export async function withDeadline(promise, timeoutMs = 2000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(Error('SYNTHETIC_DEADLINE_EXCEEDED')), timeoutMs);
  })]); } finally { clearTimeout(timer); }
}

export function barrier(arrivals = 1) {
  let count = 0, readyResolve, releaseResolve;
  const ready = new Promise(resolve => { readyResolve = resolve; });
  const released = new Promise(resolve => { releaseResolve = resolve; });
  return {ready, release: () => releaseResolve(), get count() { return count; },
    async arrive() { if (++count === arrivals) readyResolve(); await released; }};
}

export function createSyntheticHarness({projectRoot, migrate = true, mocks = {}, globals = {}}) {
  const root = path.resolve(projectRoot);
  const nativeRequire = createRequire(path.join(root, 'package.json'));
  const ts = nativeRequire('typescript');
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1000;');
  if (migrate) for (const file of fs.readdirSync(path.join(root, 'drizzle')).filter(x => x.endsWith('.sql')).sort()) {
    sql.exec(fs.readFileSync(path.join(root, 'drizzle', file), 'utf8'));
  }
  const hooks = [], counts = {}, objects = new Map();
  let objectVersion = 0, externalCalls = 0;
  const summary = [];
  function on({method, phase = 'before', match = () => true, once = true, action}) {
    const hook = {method, phase, match, once, action}; hooks.push(hook);
    return () => { const i = hooks.indexOf(hook); if (i >= 0) hooks.splice(i, 1); };
  }
  async function notify(method, phase, context) {
    for (const hook of [...hooks]) {
      if (hook.method !== method || hook.phase !== phase) continue;
      const matches = typeof hook.match === 'function' ? hook.match(context)
        : typeof hook.match === 'string' ? context.source?.includes(hook.match)
        : hook.match.test(context.source || '');
      if (!matches) continue;
      if (hook.once) hooks.splice(hooks.indexOf(hook), 1);
      await hook.action(context);
    }
  }
  function mark(method) {
    counts[method] = (counts[method] || 0) + 1;
    summary.push({method, ordinal: counts[method]}); // No SQL, binds or claims logged.
  }
  const makeResult = (results = [], changes = 0, lastRowId = 0) => ({results, success: true,
    meta: {changes, last_row_id: lastRowId, changed_db: changes > 0, duration: 0}});
  function execute(statement, method) {
    const native = sql.prepare(statement.source);
    if (method === 'first') return native.get(...statement.values) || null;
    if (method === 'all' || method === 'batch' && native.columns().length) {
      const rows = native.all(...statement.values);
      const readOnly = /^\s*(?:SELECT|PRAGMA|EXPLAIN)\b/i.test(statement.source);
      return makeResult(rows, readOnly ? 0 : Number(sql.prepare('SELECT changes() n').get().n));
    }
    const result = native.run(...statement.values);
    const readOnly = /^\s*(?:SELECT|PRAGMA|EXPLAIN)\b/i.test(statement.source);
    return makeResult([], readOnly ? 0 : Number(result.changes), Number(result.lastInsertRowid));
  }
  function prepare(source, values = []) {
    if (typeof source !== 'string') throw Error('SYNTHETIC_EXPECTED_SQL_STRING');
    if (values.some(x => x === undefined)) throw Error('SYNTHETIC_UNDEFINED_BIND');
    const statement = {source, values: [...values],
      bind: (...bound) => prepare(source, bound),
      async first(column) {
        mark('first'); await notify('first', 'before', statement);
        const result = execute(statement, 'first');
        await notify('first', 'after', {...statement, result});
        return column ? result?.[column] ?? null : result;
      },
      async all() {
        mark('all'); await notify('all', 'before', statement);
        const result = execute(statement, 'all');
        await notify('all', 'after', {...statement, result}); return result;
      },
      async run() {
        mark('run'); await notify('run', 'before', statement);
        const result = execute(statement, 'run');
        await notify('run', 'after', {...statement, result}); return result;
      }};
    return statement;
  }
  const d1 = {prepare,
    async batch(statements) {
      mark('batch');
      const context = {source: statements.map(s => s.source).join('\n'), statements};
      await notify('batch', 'before', context);
      // No await/hooks inside the transaction: do not simulate a partial D1 batch.
      sql.exec('BEGIN IMMEDIATE');
      let result;
      try { result = statements.map(s => execute(s, 'batch')); sql.exec('COMMIT'); }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
      await notify('batch', 'after', {...context, result}); return result;
    },
    async exec(source) {
      mark('exec'); await notify('exec', 'before', {source}); sql.exec(source);
      await notify('exec', 'after', {source}); return {success: true};
    }};
  const bucket = {
    async delete(key) { objects.delete(key); },
    async put(key, body) {
      mark('bucket.put'); await notify('bucket.put', 'before', {key, body});
      if (!(body instanceof Uint8Array) && !(body instanceof ArrayBuffer)) throw Error('SYNTHETIC_BYTES_ONLY');
      const bytes = new Uint8Array(body instanceof Uint8Array ? body : new Uint8Array(body));
      const stored = {bytes, version: `synthetic-${++objectVersion}`}; objects.set(key, stored);
      await notify('bucket.put', 'after', {key, stored}); return {size: bytes.length, version: stored.version};
    },
    async head(key) {
      mark('bucket.head'); await notify('bucket.head', 'before', {key});
      const stored = objects.get(key), result = stored ? {size: stored.bytes.length, version: stored.version, etag: stored.version} : null;
      await notify('bucket.head', 'after', {key, result}); return result;
    },
    async get(key, options = {}) {
      mark('bucket.get'); await notify('bucket.get', 'before', {key, options});
      const stored = objects.get(key);
      if (!stored) { await notify('bucket.get', 'after', {key, result: null}); return null; }
      const offset = options.range?.offset || 0, length = options.range?.length ?? stored.bytes.length;
      const bytes = stored.bytes.slice(offset, offset + length);
      const result = {size: stored.bytes.length, version: stored.version, etag: stored.version,
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)};
      await notify('bucket.get', 'after', {key, result}); return result;
    }};
  const env = {DB: d1, BUCKET: bucket};
  function loader() {
    const cache = new Map();
    function load(name) {
      const filename = path.resolve(root, 'lib', name.replace(/\.ts$/, '') + '.ts');
      if (!filename.startsWith(path.join(root, 'lib') + path.sep)) throw Error('SYNTHETIC_MODULE_OUTSIDE_LIB');
      if (cache.has(filename)) return cache.get(filename);
      const exports = {}; cache.set(filename, exports);
      const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
      vm.runInNewContext(code, {exports, module: {exports},
        require: requested => {
          if (Object.hasOwn(mocks, requested)) return mocks[requested];
          if (requested === 'cloudflare:workers') return {env};
          if (requested.endsWith('?raw')) {
            const rawFile=path.resolve(path.dirname(filename),requested.slice(0,-4));
            if (!rawFile.startsWith(path.join(root,'scripts','browser-upload')+path.sep)) throw Error('SYNTHETIC_RAW_SOURCE_OUTSIDE_RUNNER');
            return {__esModule:true,default:fs.readFileSync(rawFile,'utf8')};
          }
          if (requested.startsWith('../') && requested.endsWith('.js')) {
            const definitionFile=path.resolve(path.dirname(filename),requested);
            if (!definitionFile.startsWith(path.join(root,'scripts','browser-upload')+path.sep)) throw Error('SYNTHETIC_DEFINITION_OUTSIDE_RUNNER');
            return nativeRequire(definitionFile);
          }
          if (requested.startsWith('./')) return load(path.join(path.relative(path.join(root, 'lib'), path.dirname(filename)), requested));
          return nativeRequire(requested);
        },
        crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Buffer, Set, Map,
        Error, URL, btoa, atob, Date, File, ReadableStream, structuredClone, setTimeout, clearTimeout,
        fetch: () => { externalCalls++; throw Error('SYNTHETIC_EXTERNAL_CALL_FORBIDDEN'); }, ...globals,
      }, {filename});
      return exports;
    }
    return load;
  }
  return {sql, d1, bucket, objects, env, on, counts, summary, loader,
    get externalCalls() { return externalCalls; }, close: () => sql.close()};
}
