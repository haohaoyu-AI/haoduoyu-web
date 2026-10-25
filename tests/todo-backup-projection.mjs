import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {stable} from '../src/security.mjs';
import {ARTICLE_PIPELINE_FIELDS,LEGACY_ARTICLE_PIPELINE_DEFAULTS} from '../src/article-pipeline-fields.mjs';

// Compare unchanged legacy backup tables only after verifying the new checksum
// and the exact empty private tables on these historical paired fixtures.
export function legacyBackupEnvelope(value) {
  const result=structuredClone(value),backup=result.data;
  if(!['haoduoyu-matrix-d1-v2','haoduoyu-matrix-d1-v3','haoduoyu-matrix-d1-v4','haoduoyu-matrix-d1-v5','haoduoyu-matrix-d1-v6','haoduoyu-matrix-d1-v7','haoduoyu-matrix-d1-v8','haoduoyu-matrix-d1-v9'].includes(backup?.data?.format)) return result;
  const checksum=data=>createHash('sha256').update(JSON.stringify(stable(data))).digest('hex');
  assert.equal(backup.sha256,checksum(backup.data));
  if(backup.data.format==='haoduoyu-matrix-d1-v9') {
    for(const name of ['note_entries','work_reminders','account_profiles']) {
      assert.deepEqual(backup.data.tables[name],[], 'legacy projection cannot hide workbench data: '+name);
      delete backup.data.tables[name];
    }
    backup.data.format='haoduoyu-matrix-d1-v8';
  }
  if(['haoduoyu-matrix-d1-v6','haoduoyu-matrix-d1-v7','haoduoyu-matrix-d1-v8'].includes(backup.data.format))for(const row of backup.data.tables.articles) {
    for(const name of ARTICLE_PIPELINE_FIELDS) {
      assert.equal(row[name],LEGACY_ARTICLE_PIPELINE_DEFAULTS[name],'legacy projection cannot hide pipeline data: '+name);
      delete row[name];
    }
  }
  if(backup.data.format==='haoduoyu-matrix-d1-v8') {
    assert.deepEqual(backup.data.tables.daily_work_notes,[], 'legacy projection cannot hide work notes');
    delete backup.data.tables.daily_work_notes;
  }
  if(['haoduoyu-matrix-d1-v7','haoduoyu-matrix-d1-v8'].includes(backup.data.format)) {
    for(const name of ['memo_groups','memo_notes']) {
      assert.deepEqual(backup.data.tables[name],[], 'legacy projection cannot hide memo data');
      delete backup.data.tables[name];
    }
  }
  assert.deepEqual(backup.data.tables.todos,[]);
  if(['haoduoyu-matrix-d1-v5','haoduoyu-matrix-d1-v6','haoduoyu-matrix-d1-v7','haoduoyu-matrix-d1-v8'].includes(backup.data.format)) {
    assert.deepEqual(backup.data.tables.daily_notes,[]);
    delete backup.data.tables.daily_notes;
  }
  if(['haoduoyu-matrix-d1-v3','haoduoyu-matrix-d1-v4','haoduoyu-matrix-d1-v5','haoduoyu-matrix-d1-v6','haoduoyu-matrix-d1-v7','haoduoyu-matrix-d1-v8'].includes(backup.data.format)) {
    assert.deepEqual(backup.data.tables.todo_templates,[]);
    assert.deepEqual(backup.data.tables.todo_template_links,[]);
    delete backup.data.tables.todo_templates;
    delete backup.data.tables.todo_template_links;
  }
  if(['haoduoyu-matrix-d1-v4','haoduoyu-matrix-d1-v5','haoduoyu-matrix-d1-v6','haoduoyu-matrix-d1-v7','haoduoyu-matrix-d1-v8'].includes(backup.data.format)) {
    assert.deepEqual(backup.data.tables.todo_preferences,[]);
    delete backup.data.tables.todo_preferences;
  }
  delete backup.data.tables.todos;
  delete backup.data.source_revision;
  backup.data.format='haoduoyu-matrix-d1-v1';
  backup.sha256=checksum(backup.data);
  return result;
}
