import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {parseWeb,visitWeb} from '../scripts/check-web.mjs';
import {oct28Baseline,oct28Product,reviewedOct28Manifest,projectOct28} from './oct28-projection.mjs';

const root=new URL('../',import.meta.url);
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});
const hash=value=>createHash('sha256').update(value).digest('hex');
const snapshotSha='13e143ea7b2d51cf3d7e74b0fc52469a22bca740ca13c3482dd455c6a96a3f8a';
const files=Object.freeze(['src/account-profiles.mjs','src/backup.mjs','src/note-entries.mjs',
  'src/note-entry-validation.mjs','src/note-labels.mjs','src/note-month.mjs','src/public-business.mjs',
  'src/unscheduled-todos.mjs','src/workbench-snapshot.mjs','src/worker.mjs']);
const expectedAdded=Object.freeze({'src/account-profiles.mjs':0,'src/backup.mjs':1,'src/note-entries.mjs':3,
  'src/note-entry-validation.mjs':3,'src/note-labels.mjs':7,'src/note-month.mjs':7,
  'src/public-business.mjs':0,'src/unscheduled-todos.mjs':13,'src/workbench-snapshot.mjs':0,'src/worker.mjs':0});

// AST extraction ignores comments/string lookalikes and records the full
// ordered source expression for every real fail/bad call, including dynamic
// expressions. No evaluator or special-case filtering can discard new calls.
function calls(source) {
  const rows=[];
  visitWeb(parseWeb(source),node=>{
    if(node.type==='CallExpression' && node.callee.type==='Identifier' && ['fail','bad'].includes(node.callee.name))
      rows.push({callee:node.callee.name,args:node.arguments.map(arg=>source.slice(arg.start,arg.end))});
  });
  return rows;
}
function difference(before,after) {
  const counts=new Map(),added=[],removed=[];
  for(const row of before) {const key=JSON.stringify(row);counts.set(key,(counts.get(key)||0)+1);}
  for(const row of after) {
    const key=JSON.stringify(row),count=counts.get(key)||0;
    if(count)counts.set(key,count-1);else added.push(row);
  }
  for(const [key,count] of counts)for(let i=0;i<count;i++)removed.push(JSON.parse(key));
  return {added,removed};
}
function validateSnapshot(data) {
  assert.equal(data.baseline,oct28Baseline);
  assert.equal(data.product,oct28Product);
  assert.deepEqual(Object.keys(data.files).sort(),[...files]);
  assert.equal(hash(JSON.stringify(data)),snapshotSha,'new error catalogue has an independently pinned digest');
  return data;
}

test('every new and changed server error call matches a complete independently pinned catalogue',()=>{
  const data=validateSnapshot(JSON.parse(read('tests/fixtures/oct28-error-calls.json')));
  const covered=Object.keys(reviewedOct28Manifest().files).filter(file=>/^src\/.*\.mjs$/.test(file)).sort();
  assert.deepEqual(covered,[...files],'every reviewed changed or new server module is scanned');
  let total=0;
  for(const file of files) {
    const current=read(file),prior=projectOct28(file,current),entry=data.files[file];
    const exists=git('ls-tree','--name-only',oct28Baseline,'--',file).trim();
    assert.equal(prior,exists?git('show',oct28Baseline+':'+file):'',file+' exact historical source');
    assert.deepEqual(calls(prior),entry.before,file+' all historical calls and full argument expressions');
    assert.deepEqual(calls(current),entry.after,file+' all current calls and full argument expressions');
    const delta=difference(entry.before,entry.after);
    assert.deepEqual(delta.added,entry.added,file+' exact ordered new call catalogue');
    assert.deepEqual(delta.removed,entry.removed,file+' exact removed call catalogue');
    assert.deepEqual(entry.removed,[],file+' existing error calls are preserved');
    assert.equal(entry.added.length,expectedAdded[file],file+' exact new call count');
    total+=entry.added.length;
  }
  assert.equal(total,34);
});

test('catalogue rejects changed calls, self-authorized fixtures, extra modules and moved baselines',()=>{
  const data=validateSnapshot(JSON.parse(read('tests/fixtures/oct28-error-calls.json')));
  const variants=[];
  for(const field of ['baseline','product']) {const altered=structuredClone(data);altered[field]='0'.repeat(40);variants.push(altered);}
  const expanded=structuredClone(data);expanded.files['src/unapproved.mjs']={before:[],after:[],added:[],removed:[]};variants.push(expanded);
  const missing=structuredClone(data);delete missing.files['src/note-month.mjs'];variants.push(missing);
  const altered=structuredClone(data);altered.files['src/backup.mjs'].added[0].args[0]='200';variants.push(altered);
  for(const candidate of variants)assert.throws(()=>validateSnapshot(candidate));
  const source=read('src/backup.mjs'),forged=source.replace("'未定日期待办或碎碎念标签无效'","'unapproved error'");
  assert.notEqual(source,forged);
  assert.notDeepEqual(calls(forged),data.files['src/backup.mjs'].after,'changed error arguments cannot match');
  assert.throws(()=>projectOct28('src/backup.mjs',forged),/approved workbench delta/,'forged source cannot project');
  assert.notDeepEqual(calls(source+'\nfail(418,\'EXTRA\',\'extra\');\n'),data.files['src/backup.mjs'].after,
    'an extra call cannot disappear');
});
