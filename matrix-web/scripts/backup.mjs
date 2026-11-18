import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, chmodSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const source = resolve(process.env.MATRIX_DB_PATH || './data/matrix.sqlite');
const output = resolve(process.argv[2] || './backups/matrix-' + new Date().toISOString().replaceAll(':','-') + '.sqlite');
if (source === output) throw new Error('备份位置不能与数据库相同');
mkdirSync(dirname(output),{recursive:true,mode:0o700});
const db = new DatabaseSync(source,{readOnly:true});
try {
  // Reserve the destination exclusively, with private permissions from its
  // first byte. This also rejects symlinks/hardlinks back to the live source.
  const fd = openSync(output, 'wx', 0o600);
  closeSync(fd);
  try {
    await backup(db,output);
    chmodSync(output,0o600);
  } catch (error) {
    unlinkSync(output);
    throw error;
  }
  console.log('一致性备份已保存：' + output);
} finally { db.close(); }
