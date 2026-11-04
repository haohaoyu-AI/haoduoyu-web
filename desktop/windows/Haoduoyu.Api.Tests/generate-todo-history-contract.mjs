// Exact-source GET contracts for bounded history; setup touches only a fresh temporary D1.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

const sourceCommit='c30a8a956715b6ea809db4b87c0f4fcddf8f61de';
const [fixtureDirectory,outputPath]=process.argv.slice(2);
if(!fixtureDirectory||!outputPath)throw new Error('Usage: node generate-todo-history-contract.mjs <isolated-source-worktree> <output.json>');
const root=resolve(fixtureDirectory);
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceCommit);
const {fixture}=await import(pathToFileURL(resolve(root,'tests/harness.mjs')));
const {default:worker}=await import(pathToFileURL(resolve(root,'dist/server/index.js')));
const app=await fixture();const originalFetch=globalThis.fetch;let externalFetchAttempts=0;
globalThis.fetch=async(input,options)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)){externalFetchAttempts++;throw new Error('External fetch disabled in synthetic todo history contract');}
  return originalFetch(input,options);
};
try {
  const session=await app.login(),owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const env={DB:app.db,SITE_ORIGIN:app.origin,PUBLIC_BUSINESS_MODE:'1',PUBLIC_BUSINESS_USER_ID:owner,
    PUBLIC_BUSINESS_ACCOUNT_IDS:'["toutiao-haoduoyu"]',DAILY_NOTES_OWNER_ID:owner,MEMOS_OWNER_ID:owner};
  const samples=[];
  async function get(name,path,expected=200,localReject=false) {
    const response=await worker.fetch(new Request(app.origin+path,{headers:{Origin:app.origin,'X-Public-Business':'1'}}),env);
    const responseJson=await response.text();assert.equal(response.status,expected,name+' returned '+responseJson);
    samples.push({name,method:'GET',path,status:response.status,response_json:responseJson,local_query_rejection:localReject});
    return JSON.parse(responseJson).data;
  }
  const initial=await get('initial-today-default-complete-empty-day','/api/v1/todos');
  assert.deepEqual(initial.items,[]);assert.equal(initial.completed_mode,'strike');assert.equal(initial.preferences_version,0);
  const today=initial.today,anchor=new Date(today+'T00:00:00Z');
  const offset=(anchor.getUTCDay()+6)%7;const start=new Date(anchor);start.setUTCDate(start.getUTCDate()-offset);
  const dates=Array.from({length:7},(_,i)=>{const value=new Date(start);value.setUTCDate(value.getUTCDate()+i);return value.toISOString().slice(0,10);});
  const populatedDate=dates[2],ids={open:randomUUID(),completed:randomUUID(),deleted:randomUUID()};
  for(const [kind,id] of Object.entries(ids))await app.db.prepare(`INSERT INTO matrix_todos(user_id,id,date,text,completed,version,created_at,updated_at,deleted_at)
    VALUES(?,?,?,?,?,?,?,?,?)`).bind(owner,id,populatedDate,'临时合成历史 '+kind+' 🐟',kind==='open'?0:1,1,
      '2026-11-04T12:00:00.000Z','2026-11-04T12:00:00.000Z',kind==='deleted'?'2026-11-04T12:00:00.000Z':null).run();
  await app.db.prepare('INSERT INTO matrix_todo_preferences(user_id,completed_mode,version,updated_at) VALUES(?,?,?,?)')
    .bind(owner,'hide',1,'2026-11-04T12:00:00.000Z').run();
  const batchNames=[];
  const read=async(name,path)=>{batchNames.push(name);return get(name,path);};
  const scope=await read('range-scope-before','/api/v1/workbench-snapshot/index?version=2');assert.equal(scope.complete,true);
  const firstRevision=await read('range-global-revision-before','/api/v1/review/articles?offset=0');
  assert.ok(Number.isSafeInteger(firstRevision.read_revision));
  for(const date of dates) {
    const data=await read('range-day-'+date,'/api/v1/todos?date='+date);
    assert.equal(data.date,date);assert.equal(data.today,today);assert.equal(data.completed_mode,'hide');assert.equal(data.preferences_version,1);
    assert.ok(!Object.hasOwn(data,'can_edit')&&!Object.hasOwn(data,'scope_id')&&!Object.hasOwn(data,'read_revision'));
    if(date===populatedDate) {
      assert.equal(data.items.length,2);assert.ok(data.items.some(x=>x.id===ids.open&&!x.completed));assert.ok(data.items.some(x=>x.id===ids.completed&&x.completed));
      assert.ok(!data.items.some(x=>x.id===ids.deleted));
    } else assert.deepEqual(data.items,[]);
  }
  const lastRevision=await read('range-global-revision-after','/api/v1/review/articles?offset=0&read_revision='+firstRevision.read_revision);
  assert.equal(lastRevision.read_revision,firstRevision.read_revision);
  const lastScope=await read('range-scope-after','/api/v1/workbench-snapshot/index?version=2');assert.equal(lastScope.scope_id,scope.scope_id);
  await get('invalid-real-calendar-date-rejected','/api/v1/todos?date=2026-02-30',400);
  await get('duplicate-date-query-rejected','/api/v1/todos?date='+dates[0]+'&date='+dates[1],400,true);
  assert.equal(externalFetchAttempts,0);await mkdir(dirname(resolve(outputPath)),{recursive:true});
  await writeFile(resolve(outputPath),JSON.stringify({source_commit:sourceCommit,synthetic_only:true,external_fetch_attempts:0,
    generated_at:new Date().toISOString(),fixture:'Exact c30 compiled Worker.fetch; existing harness synthetic bootstrap/login and fresh temporary D1 setup; captured contract requests are GET-only; no production or constraints changed; runtimes disposed',
    samples,batch_sample_names:batchNames,range_anchor:today,range_dates:dates,expected_scope_id:scope.scope_id,expected_read_revision:firstRevision.read_revision,
    populated_date:populatedDate,active_ids:[ids.open,ids.completed],deleted_id:ids.deleted,expected_rows:2},null,2)+'\n');
  console.log(`Generated ${samples.length} actual GET-only todo history contracts (${batchNames.length} complete range reads), active/empty days, hide preference without data loss, soft-delete exclusion and two invalid queries; zero external fetch attempts.`);
} finally {globalThis.fetch=originalFetch;await app.mf.dispose();}
