import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sharedOnly = process.argv.includes('--shared');
const files = fs.readdirSync(path.join(root, 'tests')).filter(name => name.endsWith('.test.mjs') &&
  (!sharedOnly || name !== 'android-host.test.mjs')).sort().map(name => path.join(root, 'tests', name));
if (!files.length) throw new Error('No local interface tests found');
const result = spawnSync(process.execPath, ['--test', ...files], {cwd:path.dirname(root), stdio:'inherit'});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
