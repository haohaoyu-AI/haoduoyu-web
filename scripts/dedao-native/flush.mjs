import {flushPending, stateDirectory} from './runtime.mjs';
import {readSecret} from './vault.mjs';
const index = process.argv.indexOf('--thread');
try {
  const result = await flushPending(stateDirectory(index >= 0 ? process.argv[index + 1] : null), {readSecret, maximum: 100, timeoutMs: 10000});
  process.stdout.write(JSON.stringify(result) + '\n');
} catch { process.stderr.write('Native event receipts are pending; inspect the original server/binding records before retrying.\n'); process.exitCode = 1; }
