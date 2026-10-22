// Test-only bundle: metrics stay outside the HTTP API and production artifact.
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {mkdtemp, rm, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function cacheWorker(t) {
  const directory = await mkdtemp(join(tmpdir(), 'synthetic-overview-cache-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const root = resolve(import.meta.dirname, '..'), outfile = join(directory, 'worker.mjs');
  await build({stdin: {contents: "export {default} from './src/worker.mjs'; export {overviewCache} from './src/overview-cache.mjs';",
    resolveDir: root}, outfile, bundle: true, platform: 'node', format: 'esm', target: 'node24'});
  return {...await import(pathToFileURL(outfile).href),
    testBundleSha256: createHash('sha256').update(await readFile(outfile)).digest('hex')};
}
