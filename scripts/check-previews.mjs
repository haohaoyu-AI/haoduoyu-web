import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

for (const [script, readyMarker] of [['dev', 'Local Worker/D1 preview:'],
  ['preview:analytics', 'Isolated analytics preview ready:']]) {
  const directory = await mkdtemp(join(tmpdir(), 'haoduoyu-synthetic-preview-'));
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn('npm', ['run', script], {
    cwd: new URL('../', import.meta.url), detached: true,
    env: { ...process.env, PORT: String(port), PREVIEW_D1_DIRECTORY: directory,
      MATRIX_BOOTSTRAP_SECRET: randomBytes(32).toString('hex') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '', exited = false;
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  child.once('exit', () => { exited = true; });
  try {
    const deadline = Date.now() + 90000;
    while (!output.includes(readyMarker)) {
      if (exited || Date.now() > deadline) throw new Error(`${script}: synthetic preview did not become ready`);
      await delay(100);
    }
    const html = await fetch(origin);
    assert.equal(html.status, 200);
    assert.match(await html.text(), /id="app"/);
    const auth = await fetch(origin + '/api/v1/auth/me');
    assert.equal(auth.status, script === 'dev' ? 503 : 401);
    console.log(`${script}: loopback HTTP 200; expected local auth state ${auth.status}; no production binding.`);
  } finally {
    try { process.kill(-child.pid, 'SIGTERM'); } catch {}
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(5000)]);
    if (!exited) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
    await rm(directory, { recursive: true, force: true });
  }
}
