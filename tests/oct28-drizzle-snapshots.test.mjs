import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,cpSync,symlinkSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=path=>JSON.parse(readFileSync(join(root,path),'utf8'));

test('reviewed snapshots preserve previous tables and account for both new migrations',()=>{
  const a=read('drizzle/meta/0008_snapshot.json'),b=read('drizzle/meta/0009_snapshot.json'),c=read('drizzle/meta/0010_snapshot.json');
  const d=read('drizzle/meta/0011_snapshot.json'),e=read('drizzle/meta/0012_snapshot.json'),f=read('drizzle/meta/0013_snapshot.json'),g=read('drizzle/meta/0014_snapshot.json');
  const journal=read('drizzle/meta/_journal.json');
  const h=read('drizzle/meta/0015_snapshot.json');
  assert.equal(b.prevId,a.id);assert.equal(c.prevId,b.id);assert.equal(d.prevId,c.id);assert.equal(e.prevId,d.id);assert.equal(f.prevId,e.id);assert.equal(g.prevId,f.id);
  assert.equal(h.prevId,g.id);
  assert.deepEqual(journal.entries.slice(-7).map(x=>x.tag),['0009_unscheduled_todos','0010_note_labels','0011_note_entry_multi_labels','0012_note_entry_label_sets','0013_note_label_archives','0014_ai_reports','0015_content_review']);
  for(const [prior,next,added] of [[a,b,['matrix_unscheduled_todos']],[b,c,['matrix_note_entry_labels','matrix_note_labels']],[c,d,['matrix_note_entry_label_overrides']],[d,e,['matrix_note_entry_label_sets']],[e,f,['matrix_note_label_archives']],[f,g,['matrix_ai_reports']]]){
    for(const name of Object.keys(prior.tables))assert.deepEqual(next.tables[name],prior.tables[name],name);
    assert.deepEqual(Object.keys(next.tables).filter(name=>!Object.hasOwn(prior.tables,name)).sort(),added);
  }
  for(const name of Object.keys(g.tables))assert.deepEqual(h.tables[name],g.tables[name],name);
  assert.deepEqual(Object.keys(h.tables).filter(name=>!Object.hasOwn(g.tables,name)).sort(),['matrix_review_articles','matrix_review_playbooks','matrix_review_reports','matrix_review_snapshots']);
});

test('Drizzle generate and check in a temporary copy do not introduce a duplicate migration',t=>{
  const temp=mkdtempSync(join(tmpdir(),'haoduoyu-drizzle-test-'));t.after(()=>rmSync(temp,{recursive:true,force:true}));
  cpSync(join(root,'drizzle'),join(temp,'drizzle'),{recursive:true});
  cpSync(join(root,'db'),join(temp,'db'),{recursive:true});
  cpSync(join(root,'drizzle.config.ts'),join(temp,'drizzle.config.ts'));
  symlinkSync(join(root,'node_modules'),join(temp,'node_modules'),'dir');
  const before=readdirSync(join(temp,'drizzle')).sort();
  for(const action of ['generate','check']){
    const result=spawnSync(process.execPath,[join(root,'node_modules/drizzle-kit/bin.cjs'),action,'--config','drizzle.config.ts'],
      {cwd:temp,encoding:'utf8',timeout:30000});
    assert.equal(result.status,0,`${action}: ${result.error || result.stderr || result.stdout}`);
  }
  assert.deepEqual(readdirSync(join(temp,'drizzle')).sort(),before,'unexpected generated migration');
});
