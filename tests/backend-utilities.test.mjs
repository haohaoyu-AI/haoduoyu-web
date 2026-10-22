import {traceHeaders, traceText, traceDocument} from './request-trace-projection.mjs';
import {dashboardHeaders, dashboardSpec} from './dashboard-deprecation-projection.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {isDeepStrictEqual} from 'node:util';
import {execFileSync} from 'node:child_process';
import {readFile, mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {parseWeb, visitWeb} from '../scripts/check-web.mjs';
import {fixture} from './harness.mjs';
import {seedBenchmark} from './bench-fixture.mjs';

const BASE = 'dc598ac1c1b53303500e2313965c3f980d94d0ad';
const root = new URL('../', import.meta.url);
const fixed = Date.parse('2026-10-22T08:00:00.000Z');
const old = file => execFileSync('git', ['show', BASE + ':' + file], {cwd: root, encoding: 'utf8'});
const source = file => readFile(new URL(file, root), 'utf8');
function declaration(text, name) {
  let found;
  visitWeb(parseWeb(text), node => {
    if (node.type === 'FunctionDeclaration' && node.id.name === name) found = text.slice(node.start, node.end);
    if (node.type === 'VariableDeclarator' && node.id.name === name) found = 'const ' + text.slice(node.start, node.end) + ';';
  });
  assert.ok(found, name + ' original declaration');return found;
}
class FrozenDate extends Date {
  constructor(...args) {super(...(args.length ? args : [fixed]));}
  static now() {return fixed;}
}
function original(file, names) {
  const text = old(file);
  return vm.runInNewContext(names.map(name => declaration(text, name)).join('\n') + '\n({' + names.join(',') + '})', {Date: FrozenDate});
}
const record = original('src/records.mjs', ['DAY', 'BEIJING_OFFSET', 'beijingDay', 'shiftDay']);
const overview = original('src/overview.mjs', ['DAY', 'OFFSET', 'beijingDay', 'shift', 'distance', 'dates', 'median']);
const analytics = original('src/analytics.mjs', ['validStamp', 'beijingDate']);
function outcome(fn, args) {
  try {return {value: structuredClone(fn(...args))};}
  catch (error) {return {error: {name: error.name, message: error.message, status: error.status, code: error.code}};}
}
function equivalent(a, b, cases, label) {
  for (const args of cases) assert.deepEqual(outcome(a, args), outcome(b, args), label + ' input ' + args.map(String).join('|'));
}
function oldSortedMedian(file) {
  const text = old(file);let expression;
  visitWeb(parseWeb(text), node => {
    if (node.type === 'Property' && node.key.name === 'median_reads') expression = text.slice(node.value.start, node.value.end);
  });
  if (file === 'src/records.mjs') {
    const line = declaration(text, 'median');expression = line.slice(line.indexOf('=') + 1, -1);
  }
  assert.ok(expression);
  return vm.runInNewContext('(values => {const durations=values,middle=Math.floor(values.length/2);return ' + expression + ';})');
}

test('baseline characterization preserves distinct defaults, coercion and median arithmetic', () => {
  assert.equal(record.beijingDay(), '2026-10-22');
  assert.throws(() => overview.beijingDay(), {name: 'RangeError'});
  assert.equal(analytics.beijingDate(null), null);
  assert.equal(record.beijingDay(null), '1970-01-01');
  const coercible = {[Symbol.toPrimitive]: hint => hint === 'string' ? '2001-01-01' : '2001-02-01'};
  assert.equal(record.shiftDay(coercible, 0), '2001-01-01');
  assert.equal(overview.shift(coercible, 0), '2001-02-01');
  assert.equal(overview.median([1e308, 1e308]), 1e308);
  assert.equal(oldSortedMedian('src/records.mjs')([1e308, 1e308]), Infinity);
  assert.equal(oldSortedMedian('src/analytics.mjs')([1e308, 1e308]), Infinity);
});

test('one shared time module preserves original behavior for boundary and seeded inputs', async t => {
  const time = await import('../src/lib/time.mjs');
  const values = [undefined, null, NaN, Infinity, -Infinity, 0, -0, '', '0', '2001-01-01',
    '2026-10-21T15:59:59.999Z', '2026-10-21T16:00:00.000Z', false, true,
    -8640000000000000, 8640000000000000, 8640000000000001, 1n, Symbol('synthetic'), {}, [], [0]];
  let seed = 5012026;
  for (let i = 0; i < 1000; i++) {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;values.push((seed - 2147483648) * 864000);}
  values.push('+275760-09-13T00:00:00.000Z', '-271821-04-20T00:00:00.000Z');
  values.push(...values.filter(value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 8e15).slice(-100).map(value => new Date(value).toISOString()));
  equivalent(time.beijingDay, overview.beijingDay, values.map(value => [value]), 'numeric Beijing day');
  equivalent(time.validStamp, analytics.validStamp, values.map(value => [value]), 'stamp validator');
  equivalent(time.beijingDate, analytics.beijingDate, values.map(value => [value]), 'string Beijing date');
  const days = ['2000-02-28', '2000-02-29', '1900-02-28', '2026-12-31', '2026-01-01', 'bad', '', null, undefined, 0,
    {[Symbol.toPrimitive]: hint => hint === 'string' ? '2001-01-01' : '2001-02-01'}];
  const shifts = days.flatMap(day => [-366, -1, 0, 1, 366, NaN, '2', undefined].map(count => [day, count]));
  equivalent(time.shiftDay, record.shiftDay, shifts, 'template coercion shift');
  equivalent(time.shift, overview.shift, shifts, 'concatenation coercion shift');
  const ranges = [['2026-10-01', '2026-10-31'], ['2000-02-28', '2000-03-01'], ['1900-02-28', '1900-03-01'],
    ['2026-12-31', '2027-01-02'], ['2026-10-02', '2026-10-01'], ['bad', '2001-01-01'], [null, undefined]];
  for (let i = 0; i < 100; i++) {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const from = new Date(fixed - (seed % 5000) * record.DAY).toISOString().slice(0, 10);
    ranges.push([from, record.shiftDay(from, seed % 32)]);}
  equivalent(time.distance, overview.distance, ranges, 'day distance');
  equivalent(time.dates, overview.dates, ranges, 'inclusive dates');
  equivalent(time.median, overview.median, [null, undefined, 0, '', '21', false, {}].map(value => [value]), 'median input types');
  const arrays = [[], [0], [-0], [undefined], [null], [NaN], [Infinity], [1e308, 1e308],
    [-Infinity, Infinity], [undefined, 1], [null, 2], [3, 1, 2], ['1', '2'], [1n, 2n]];
  for (let i = 0; i < 300; i++) {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    arrays.push(Array.from({length: seed % 21}, (_, j) => ((seed >>> (j % 16)) % 10000) - 5000));}
  const recordMedian = oldSortedMedian('src/records.mjs'), analyticsMedian = oldSortedMedian('src/analytics.mjs');
  for (const values of arrays) {
    const original = values.slice();
    equivalent(time.median, overview.median, [[values]], 'copy/sort safe midpoint');
    equivalent(time.sortedMedian, recordMedian, [[values]], 'records sum midpoint');
    equivalent(time.sortedMedian, analyticsMedian, [[values]], 'analytics sum midpoint');
    assert.deepEqual(values, original, 'shared helpers cannot mutate input arrays');
  }
  const current = await source('src/records.mjs');
  const currentDay = vm.runInNewContext(declaration(current, 'beijingDay') + ';beijingDay',
    {Date: FrozenDate, numericBeijingDay: time.beijingDay});
  equivalent(currentDay, record.beijingDay, [[], ...values.map(value => [value])], 'records default wrapper');
  assert.equal(time.DAY, record.DAY);assert.equal(time.BEIJING_OFFSET, record.BEIJING_OFFSET);
  t.diagnostic(`${values.length} stamp inputs; ${shifts.length} shifts per adapter; ${ranges.length} ranges; ${arrays.length} arrays against three original median expressions`);
});

test('dead auth exports are removed while every live declaration and safety option remains identical', async () => {
  const before = old('shared/auth.mjs'), after = await source('shared/auth.mjs');
  const current = await import('../shared/auth.mjs');
  for (const name of ['createUser', 'sessionCookie', 'authenticate', 'createSession', 'audit']) assert.equal(Object.hasOwn(current, name), false, name);
  for (const name of ['digest', 'csrfFor', 'validatePassword', 'hashPassword', 'verifyPassword', 'checkOrigin', 'checkCsrf', 'options', 'scrypt']) {
    assert.equal(declaration(after, name), declaration(before, name), name + ' exact unchanged live declaration');
  }
  const imports = parseWeb(after).body.filter(node => node.type === 'ImportDeclaration');
  assert.equal(imports.flatMap(node => node.specifiers).some(node => node.imported?.name === 'randomUUID'), false);
  assert.match(await source('src/records.mjs'), /function coverageForDay\(/);
});

async function previousWorker(t) {
  const dir = await mkdtemp(join(tmpdir(), 'synthetic-5a-reference-'));t.after(() => rm(dir, {recursive: true, force: true}));
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', BASE, 'src', 'shared'], {cwd: root, encoding: 'utf8'}).trim().split('\n');
  for (const file of files) {const path = join(dir, file);await mkdir(join(path, '..'), {recursive: true});await writeFile(path, old(file));}
  const changed = execFileSync('git', ['diff', BASE, '--name-only', '--', 'public', 'web', 'runtime.json', '.openai', 'db', 'drizzle'], {cwd: root, encoding: 'utf8'}).trim().split('\n').filter(Boolean);
  assert.deepEqual(changed.filter(file => file !== 'public/openapi.json'), []);
  assert.deepEqual(dashboardSpec(traceDocument(JSON.parse(await source('public/openapi.json')))), JSON.parse(old('public/openapi.json')));
  await writeFile(join(dir, 'src/assets.generated.mjs'), await source('src/assets.generated.mjs'));
  await build({entryPoints: [join(dir, 'src/worker.mjs')], outfile: join(dir, 'worker.mjs'), bundle: true, format: 'esm', platform: 'node', target: 'es2022'});
  return (await import(pathToFileURL(join(dir, 'worker.mjs')).href)).default;
}
test('pre-5a and candidate HTTP reads retain complete bodies, statuses and headers', async t => {
  const baseline = await previousWorker(t), candidate = (await import('../dist/server/index.js')).default;
  const app = await fixture(t), session = await app.login();
  const accounts = (await app.db.prepare('SELECT id FROM matrix_accounts ORDER BY id').all()).results;
  await seedBenchmark(app.db, accounts.map(row => row.id), {articles: 18});
  const NativeDate = globalThis.Date;globalThis.Date = FrozenDate;
  t.after(() => {globalThis.Date = NativeDate;});
  const paths = ['/health', '/openapi.json', '/api-docs', '/api/v1/auth/me', '/api/v1/accounts',
    '/api/v1/articles', '/api/v1/articles?page=1', '/api/v1/articles?sort=reads', '/api/v1/articles?fields=index',
    '/api/v1/articles/bench-article-0', '/api/v1/articles/synthetic-missing', '/api/v1/observations',
    '/api/v1/daily-metrics', '/api/v1/dashboard', '/api/v1/api-keys', '/api/v1/audit', '/api/v1/export',
    '/api/v1/backup', '/api/v1/due-reviews', '/api/v1/due-reviews?account_id=synthetic-missing',
    ...['yesterday', '7d', '30d'].map(period => '/api/v1/overview?period=' + period),
    '/api/v1/overview?period=invalid', '/api/v1/articles?page=bad', '/api/v1/unknown-synthetic'];
  let compared = 0;
  for (const cookie of [undefined, session.cookie]) for (const path of paths) {
    const responses = [];
    for (const worker of [baseline, candidate]) {
      const response = await worker.fetch(new Request(app.origin + path, {headers: cookie ? {Cookie: cookie} : {}}), {DB: app.db, SITE_ORIGIN: app.origin});
      responses.push({status: response.status, headers: dashboardHeaders(path, response.status, traceHeaders(response.headers)), body: traceText(await response.text(), response.status, response.headers)});
    }
    // Backup contains ephemeral synthetic authentication hashes: never print bodies on failure.
    assert.ok(isDeepStrictEqual(responses[1], responses[0]), path + (cookie ? ' session' : ' anonymous'));compared++;
  }
  t.diagnostic(compared + ' full-body/status comparisons; only the exact authorized dashboard header addition projected, no other header/body normalization');
});
