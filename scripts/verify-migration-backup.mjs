// Local-only restore rehearsal. No Cloudflare API, account, token or remote DB.
import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import {restoreIntoEmptyDatabase} from '../src/backup.mjs';
import {verifyBackupInventory, verifyRestoredInventory} from './migration-inventory.mjs';

let runtime;
try {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--backup' || args[2] !== '--inventory')
    throw new Error('USAGE');
  const backup = JSON.parse(await readFile(args[1], 'utf8'));
  const inventory = JSON.parse(await readFile(args[3], 'utf8'));
  verifyBackupInventory(backup, inventory);
  const settings = JSON.parse(await readFile(new URL('../runtime.json', import.meta.url), 'utf8'));
  runtime = new Miniflare({modules: true, cf: false, script: 'export default {fetch(){return new Response(null,{status:404})}}',
    compatibilityDate: settings.compatibility_date, compatibilityFlags: settings.compatibility_flags,
    d1Databases: ['DB'], d1Persist: false,
    outboundService: () => new Response('External requests disabled', {status: 502})});
  const db = await runtime.getD1Database('DB');
  const journal = JSON.parse(await readFile(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'));
  for (const {tag} of journal.entries) {
    const sql = await readFile(new URL('../drizzle/' + tag + '.sql', import.meta.url), 'utf8');
    await db.batch(sql.split('--> statement-breakpoint').map(value => value.trim()).filter(Boolean).map(value => db.prepare(value)));
  }
  await restoreIntoEmptyDatabase(db, backup, {allowEmptyRestore: true});
  const result = await verifyRestoredInventory(db, backup, inventory);
  console.log(JSON.stringify({...result, scope: 'local isolated restore; source inventory provenance must be independently verified'}));
} catch (error) {
  // Do not print supplied data, D1 error details, paths, password/key hashes or SQL.
  console.error(error.message === 'USAGE' ?
    'Usage: npm run verify:migration-backup -- --backup PRIVATE_FILE --inventory PRIVATE_SOURCE_INVENTORY' :
    'Migration backup verification failed. Keep the target isolated and review the private input offline.');
  process.exitCode = 1;
} finally {await runtime?.dispose();}
