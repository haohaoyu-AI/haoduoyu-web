import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {stable} from '../src/security.mjs';
import {ARTICLE_PIPELINE_FIELDS,LEGACY_ARTICLE_PIPELINE_DEFAULTS} from '../src/article-pipeline-fields.mjs';

// Compare unchanged legacy backup tables only after verifying the new checksum
// and the exact empty private tables on these historical paired fixtures.
export function legacyBackupEnvelope(value) {
  const result=structuredClone(value),backup=result.data;
  if(!['haoduoyu-matrix-d1-v2','haoduoyu-matrix-d1-v3','haoduoyu-matrix-d1-v4','haoduoyu-matrix-d1-v5','haoduoyu-matrix-d1-v6','haoduoyu-matrix-d1-v7','haoduoyu-matrix-d1-v8','haoduoyu-matrix-d1-v9','haoduoyu-matrix-d1-v10','haoduoyu-matrix-d1-v11','haoduoyu-matrix-d1-v12','haoduoyu-matrix-d1-v13','haoduoyu-matrix-d1-v14','haoduoyu-matrix-d1-v15','haoduoyu-matrix-d1-v16','haoduoyu-matrix-d1-v17','haoduoyu-matrix-d1-v18'].includes(backup?.data?.format)) return result;
  const checksum=data=>createHash('sha256').update(JSON.stringify(stable(data))).digest('hex');
  assert.equal(backup.sha256,checksum(backup.data));
  if(backup.data.format==='haoduoyu-matrix-d1-v18') {
    assert.deepEqual(backup.data.tables.daily_scores, [], 'legacy projection cannot hide daily scores');
    delete backup.data.tables.daily_scores;
    backup.data.format='haoduoyu-matrix-d1-v17';
  }
  if(backup.data.format==='haoduoyu-matrix-d1-v17') {
    assert.deepEqual(backup.data.tables.review_prompt_versions,[], 'legacy projection cannot hide prompt versions');
    delete backup.data.tables.review_prompt_versions;
    backup.data.format='haoduoyu-matrix-d1-v16';
  }
  if(backup.data.format==='haoduoyu-matrix-d1-v16') {
    stripEmptyReviewTables(backup.data);
    backup.data.format='haoduoyu-matrix-d1-v15';
  }
  if(backup.data.format==='haoduoyu-matrix-d1-v15') {
    assert.deepEqual(backup.data.tables.todos,[], 'legacy projection cannot hide todos');
    assert.deepEqual(backup.data.tables.todo_templates,[], 'legacy projection cannot hide templates');
    backup.data.format='haoduoyu-matrix-d1-v14';
  }
  for(const [version,name] of [[14,'ai_reports'],[13,'note_label_archives'],[12,'note_entry_label_sets'],[11,'note_entry_label_overrides']]) {
    if(backup.data.format==='haoduoyu-matrix-d1-v'+version) {
      assert.deepEqual(backup.data.tables[name],[], 'legacy projection cannot hide new data: '+name);
      delete backup.data.tables[name];
      backup.data.format='haoduoyu-matrix-d1-v'+(version-1);
    }
  }
  if(backup.data.format==='haoduoyu-matrix-d1-v10') {
    for(const name of ['unscheduled_todos','note_labels','note_entry_labels']) {
      assert.deepEqual(backup.data.tables[name],[], 'legacy projection cannot hide new data: '+name);
      delete backup.data.tables[name];
    }
    backup.data.format='haoduoyu-matrix-d1-v9';
  }
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

// Historical fixtures may remove only empty newer review collections. Never hide
// real history merely to make an old-format restore assertion pass.
export function stripEmptyReviewTables(data) {
  for(const name of Object.keys(data.tables).filter(name=>name.startsWith('review_')||name.startsWith('openai_review_'))) {
    assert.deepEqual(data.tables[name],[],'historical projection cannot hide review history: '+name);
    delete data.tables[name];
  }
  if(Object.hasOwn(data.tables,'daily_scores')) {
    assert.deepEqual(data.tables.daily_scores,[],'historical projection cannot hide daily scores');
    delete data.tables.daily_scores;
  }
  for(const row of data.tables.todos||[]) {assert.equal(row.note,'');delete row.note;}
  for(const row of data.tables.unscheduled_todos||[]) {assert.equal(row.note??'','');delete row.note;}
  for(const row of data.tables.todo_templates||[]) {assert.equal(row.archived_at,null);delete row.archived_at;}
  return data;
}
