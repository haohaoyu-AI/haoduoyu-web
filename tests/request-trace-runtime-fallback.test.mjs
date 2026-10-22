import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {Miniflare, Log, LogLevel} from 'miniflare';
import {assertRequestId} from './request-trace-projection.mjs';

const root = fileURLToPath(new URL('../', import.meta.url)), base = '24b5c5082a115cd9ee78e440c0848245079e6048';
async function runtime(t, entry, canary) {
  const script = `import worker from ${JSON.stringify(entry)};
    const rows=[];console.error=(...args)=>rows.push(args);
    export default {fetch(request) {
      if(new URL(request.url).pathname==='/synthetic-diagnostics')return Response.json(rows);
      const mode=request.headers.get('X-Synthetic-Mode'),secret=${JSON.stringify(canary)};
      const db={prepare(){
        if(mode==='null')throw null;
        if(mode==='undefined')throw undefined;
        throw Object.defineProperty(new Error(secret),'name',{get(){throw new Error(secret)}});
      }};
      return worker.fetch(request,{SITE_ORIGIN:new URL(request.url).origin,DB:db});
    }};`;
  const output = await build({stdin: {contents: script, resolveDir: root, sourcefile: 'synthetic-boundary.mjs'},
    bundle: true, write: false, format: 'esm', platform: 'neutral', external: ['node:*']});
  const config = JSON.parse(await readFile(new URL('../runtime.json', import.meta.url), 'utf8'));
  const mf = new Miniflare({modules: true, script: output.outputFiles[0].text,
    compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
    host: '127.0.0.1', port: 0, log: new Log(LogLevel.NONE),
    outboundService: () => new Response('External requests disabled', {status: 403})});
  t.after(() => mf.dispose());return {origin: await mf.ready};
}
async function baseline(t) {
  const directory = await mkdtemp(join(tmpdir(), 'synthetic-catch-baseline-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', base, 'src', 'shared'], {cwd: root, encoding: 'utf8'}).trim().split('\n');
  for (const file of files) {const path = join(directory, file);await mkdir(join(path, '..'), {recursive: true});
    await writeFile(path, execFileSync('git', ['show', base + ':' + file], {cwd: root}));}
  await writeFile(join(directory, 'src/assets.generated.mjs'), await readFile(new URL('../src/assets.generated.mjs', import.meta.url)));
  return join(directory, 'src/worker.mjs');
}
async function exercise(app, canary) {
  return Promise.all(['null', 'undefined', 'throwing-name'].map(async mode => {
    const response = await fetch(new URL('/api/v1/articles/' + canary + '?secret=' + canary, app.origin),
      {headers: {'X-Synthetic-Mode': mode, 'X-Request-Id': canary}});
    return {mode, status: response.status, headers: response.headers, text: await response.text()};
  }));
}
test('real workerd HTTP narrowly recovers catch-construction failures with one safe correlated record per request', async t => {
  const canary = 'synthetic-' + randomUUID(), old = await runtime(t, await baseline(t), canary);
  const current = await runtime(t, join(root, 'dist/server/index.js'), canary);
  const before = await exercise(old, canary), after = await exercise(current, canary);
  for (const value of before) {
    assert.equal(value.status, 500);assert.equal(value.headers.get('X-Request-Id'), null);
    assert.match(value.headers.get('Content-Type'), /^text\/plain/);
  }
  assert.deepEqual(await (await fetch(new URL('/synthetic-diagnostics', old.origin))).json(), []);
  t.diagnostic('Real wire: null/undefined/throwing Error.name baseline all runtime500 without ID; candidate expected bounded JSON500');
  const ids = new Set();
  for (const value of after) {
    assert.equal(value.status, 500);const id = assertRequestId(value.headers, true);ids.add(id);
    assert.equal(value.headers.get('Cache-Control'), 'no-store');assert.equal(value.headers.get('X-Content-Type-Options'), 'nosniff');
    const json = JSON.parse(value.text);assert.equal(json.request_id, id);
    assert.deepEqual(json.error, {code: 'INTERNAL_ERROR', message: '服务暂时不可用'});
    assert.equal(value.text.includes(canary), false);
  }
  assert.equal(ids.size, 3);
  const rows = await (await fetch(new URL('/synthetic-diagnostics', current.origin))).json();
  assert.equal(rows.length, 3);const logged = new Set();
  for (const args of rows) {
    assert.equal(args.length, 1);assert.equal(typeof args[0], 'string');assert.ok(args[0].length < 512);
    assert.equal(args[0].includes(canary), false);assert.equal(/[\r\n]/.test(args[0]), false);
    const row = JSON.parse(args[0]);assert.deepEqual(Object.keys(row).sort(), ['rid', 'method', 'route', 'name', 'message'].sort());
    assert.equal(row.method, 'GET');assert.equal(row.route, '/api/v1/articles/{id}');
    assert.ok(['Error', 'UnknownError'].includes(row.name));assert.equal(row.message, '服务端请求处理失败');logged.add(row.rid);
  }
  assert.deepEqual(logged, ids);
});
