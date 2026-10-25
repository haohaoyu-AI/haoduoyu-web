import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, mkdir, writeFile, mkdtemp, cp, symlink, rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import worker from '../dist/server/index.js';
import {assets} from '../src/assets.generated.mjs';
import {fixture} from './harness.mjs';

const files = ['app.js', 'style.css', 'memos.css', 'favicon.svg', 'openapi.json'];
const etagFor = content => '"' + createHash('sha256').update(content).digest('hex') + '"';
const security = ['Content-Security-Policy', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy'];
const request = (path, options = {}) => worker.fetch(new Request('http://localhost' + path, options), {});

test('explicit static paths have content hashes, no-cache, HEAD and bodyless conditional responses', async t => {
  for (const file of files) await t.test(file, async () => {
    const bytes = await readFile(new URL('../public/' + file, import.meta.url)), expected = etagFor(bytes);
    const get = await request('/' + file);
    assert.equal(get.status, 200);assert.deepEqual(Buffer.from(await get.arrayBuffer()), bytes);
    assert.equal(get.headers.get('ETag'), expected);assert.equal(get.headers.get('Cache-Control'), 'no-cache');
    assert.equal(assets[file].etag, expected);assert.equal(assets[file].length, bytes.length);
    const head = await request('/' + file, {method: 'HEAD'});
    assert.equal(head.status, 200);assert.equal((await head.arrayBuffer()).byteLength, 0);
    assert.equal(head.headers.get('ETag'), expected);
    assert.equal(head.headers.get('Content-Length'), String(bytes.length));
    for (const method of ['GET', 'HEAD']) {
      const response = await request('/' + file, {method, headers: {'If-None-Match': expected}});
      assert.equal(response.status, 304);assert.equal((await response.arrayBuffer()).byteLength, 0);
      assert.equal(response.headers.get('ETag'), expected);assert.equal(response.headers.get('Cache-Control'), 'no-cache');
      assert.equal(response.headers.has('Content-Length'), false);assert.equal(response.headers.has('Set-Cookie'), false);
      for (const name of security) assert.equal(response.headers.get(name), get.headers.get(name));
    }
  });
});

test('If-None-Match weak comparison validates complete lists, including opaque commas and empty list members', async () => {
  const expected = etagFor(await readFile(new URL('../public/app.js', import.meta.url)));
  for (const value of [expected, 'W/' + expected, '"different", W/' + expected,
    '"other,tag", ' + expected, '*', ', , ' + expected + ',']) {
    const response = await request('/app.js', {headers: {'If-None-Match': value}});
    assert.equal(response.status, 304, value);assert.equal((await response.arrayBuffer()).byteLength, 0);
  }
  for (const value of ['"different"', expected.toUpperCase(), 'w/' + expected, '"unterminated',
    expected + ' junk', '*,' + expected, 'W/ ' + expected, expected + ',bad', '']) {
    const response = await request('/app.js', {headers: {'If-None-Match': value}});
    assert.equal(response.status, 200, 'invalid or nonmatching field: ' + value);
    assert.ok((await response.arrayBuffer()).byteLength > 0);
  }
});

test('HTML, other resources, aliases, errors and authenticated APIs remain no-store and never return conditional 304', async t => {
  for (const [path, status] of [['/', 200], ['/index.html', 200], ['/api-docs', 200], ['/api-docs.html', 404],
    ['/robots.txt', 200], ['/llms.txt', 200], ['/%61pp.js', 200], ['/missing', 404], ['/app.js/missing', 404]]) {
    const response = await request(path, {headers: {'If-None-Match': '*'}});
    assert.equal(response.status, status, path);assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.has('ETag'), false);await response.text();
  }
  const post = await request('/app.js', {method: 'POST', headers: {'If-None-Match': '*'}});
  assert.equal(post.status, 404);assert.equal(post.headers.get('Cache-Control'), 'no-store');await post.text();
  const app = await fixture(t), session = await app.login();
  for (const [cookie, expected] of [[session.cookie, 200], ['', 401]]) {
    const response = await worker.fetch(new Request(app.origin + '/api/v1/accounts',
      {headers: {Cookie: cookie, 'If-None-Match': '*'}}), {DB: app.db, SITE_ORIGIN: app.origin});
    assert.equal(response.status, expected);assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.has('ETag'), false);await response.text();
  }
});

test('build hashes are reproducible and change only with their own content in an isolated copy', async t => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const copy = await mkdtemp(join(tmpdir(), 'haoduoyu-static-build-'));
  t.after(() => rm(copy, {recursive: true, force: true}));
  for (const path of ['scripts', 'src', 'shared', 'public', 'web', 'drizzle', '.openai', 'runtime.json', 'package.json'])
    await cp(join(root, path), join(copy, path), {recursive: true});
  await symlink(join(root, 'node_modules'), join(copy, 'node_modules'), 'dir');
  async function build() {
    execFileSync(process.execPath, [join(copy, 'scripts/build.mjs')], {cwd: copy, stdio: 'pipe'});
    const source = await readFile(join(copy, 'src/assets.generated.mjs'), 'utf8');
    return JSON.parse(source.slice('export const assets='.length).trim().replace(/;$/, ''));
  }
  const first = await build(), second = await build();
  for (const [name, asset] of Object.entries(first)) {
    assert.equal(asset.etag, etagFor(Buffer.from(asset.content)));
    assert.deepEqual(asset, second[name]);
  }
  await writeFile(join(copy, 'public/style.css'), first['style.css'].content + '\n/* Synthetic build variant */\n');
  const third = await build();
  assert.notEqual(third['style.css'].etag, first['style.css'].etag);
  for (const name of Object.keys(first).filter(name => name !== 'style.css')) assert.deepEqual(third[name], first[name]);
});

test('real loopback curl GET and HEAD revalidation transmits zero response-body bytes on a hit', async t => {
  const app = await fixture(t, {bootstrap: false}), origin = String(await app.mf.ready).replace(/\/$/, '');
  const directory = await mkdtemp(join(tmpdir(), 'haoduoyu-curl-static-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const rows = [];
  for (const file of ['app.js', 'style.css']) {
    const expected = etagFor(await readFile(new URL('../public/' + file, import.meta.url)));
    function curl(label, args = []) {
      const headerFile = join(directory, file + label + '.headers');
      const result = execFileSync('curl', ['--silent', '--show-error', '--max-time', '20',
        '--dump-header', headerFile, '--output', '/dev/null', '--write-out', '%{http_code} %{size_download}',
        ...args, origin + '/' + file], {encoding: 'utf8'}).trim().split(' ');
      return {status: Number(result[0]), body_bytes: Number(result[1]), headerFile};
    }
    const first = curl('first'), second = curl('second', ['-H', 'If-None-Match: ' + expected]);
    const head = curl('head', ['-I', '-H', 'If-None-Match: W/' + expected]);
    const headers = await readFile(second.headerFile, 'utf8');
    rows.push({file, first: {status: first.status, body_bytes: first.body_bytes},
      second: {status: second.status, body_bytes: second.body_bytes}, head: {status: head.status, body_bytes: head.body_bytes},
      no_cache: /cache-control: no-cache/i.test(headers), etag_matches: headers.includes(expected)});
  }
  await mkdir(new URL('../artifacts/perf/', import.meta.url), {recursive: true});
  const phase = process.env.C3_CAPTURE_PHASE === 'before' ? 'before' : 'after';
  await writeFile(new URL('../artifacts/perf/c3-' + phase + '.json', import.meta.url), JSON.stringify(rows, null, 2) + '\n');
  rows.forEach(row => t.diagnostic(JSON.stringify(row)));
  for (const row of rows) {
    assert.equal(row.first.status, 200);assert.ok(row.first.body_bytes > 0);
    assert.equal(row.second.status, 304);assert.equal(row.second.body_bytes, 0);
    assert.equal(row.head.status, 304);assert.equal(row.head.body_bytes, 0);
    assert.equal(row.no_cache, true);assert.equal(row.etag_matches, true);
  }
});
