import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {stateDirectory} from '../scripts/dedao-native/runtime.mjs';
import {readSecret, writeSecret} from '../scripts/dedao-native/vault.mjs';
if (process.platform !== 'win32') {
  console.log('SKIP Windows DPAPI verification on this platform');
} else {
  const folder = stateDirectory(randomUUID()), file = path.join(folder, 'vault.json');
  const secret = {credential: 'SYNTHETIC-NOT-A-REAL-CREDENTIAL-' + randomUUID()};
  try {
    await writeSecret(file, secret);
    const raw = await fs.readFile(file, 'utf8');
    assert(!raw.includes(secret.credential), 'vault must not contain plaintext credentials');
    assert.equal(JSON.parse(raw).format, 'dpapi-current-user');
    assert.deepEqual(await readSecret(file), secret);
    await assert.rejects(() => writeSecret(path.join(process.cwd(), 'unsafe-vault.json'), secret), /protected directory/);
    console.log('PASS Windows native vault: synthetic secret encrypted with CurrentUser DPAPI, same-account recovery, protected-directory enforcement. No real credentials.');
  } finally {
    // folder is the exact validated UUID directory created by this test.
    assert.equal(path.dirname(file), folder);
    await fs.rm(folder, {recursive: true, force: true});
  }
}
