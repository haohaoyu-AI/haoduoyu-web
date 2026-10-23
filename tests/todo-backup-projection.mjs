import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {stable} from '../src/security.mjs';

// Compare unchanged legacy backup tables only after verifying the new checksum
// and the exact empty private tables on these historical paired fixtures.
export function legacyBackupEnvelope(value) {
  const result=structuredClone(value),backup=result.data;
  if(!['haoduoyu-matrix-d1-v2','haoduoyu-matrix-d1-v3'].includes(backup?.data?.format)) return result;
  const checksum=data=>createHash('sha256').update(JSON.stringify(stable(data))).digest('hex');
  assert.equal(backup.sha256,checksum(backup.data));
  assert.deepEqual(backup.data.tables.todos,[]);
  if(backup.data.format==='haoduoyu-matrix-d1-v3') {
    assert.deepEqual(backup.data.tables.todo_templates,[]);
    assert.deepEqual(backup.data.tables.todo_template_links,[]);
    delete backup.data.tables.todo_templates;
    delete backup.data.tables.todo_template_links;
  }
  delete backup.data.tables.todos;
  backup.data.format='haoduoyu-matrix-d1-v1';
  backup.sha256=checksum(backup.data);
  return result;
}
