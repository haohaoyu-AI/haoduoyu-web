import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {stable} from '../src/security.mjs';

// Compare unchanged legacy backup tables only after verifying the v2 checksum
// and the exact new, empty todo table on these historical paired fixtures.
export function legacyBackupEnvelope(value) {
  const result=structuredClone(value),backup=result.data;
  if(backup?.data?.format!=='haoduoyu-matrix-d1-v2') return result;
  const checksum=data=>createHash('sha256').update(JSON.stringify(stable(data))).digest('hex');
  assert.equal(backup.sha256,checksum(backup.data));
  assert.deepEqual(backup.data.tables.todos,[]);
  delete backup.data.tables.todos;
  backup.data.format='haoduoyu-matrix-d1-v1';
  backup.sha256=checksum(backup.data);
  return result;
}
