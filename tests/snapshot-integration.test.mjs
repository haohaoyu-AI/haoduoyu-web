import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';
import {countingDb} from './counting-d1.mjs';
import {projectPublicNoteFrontend,projectPublicNoteBackend} from './public-note-ui-projection.mjs';
import {traceRoute} from '../src/lib/request-trace.mjs';

const BASE='6043d18cd75634542baecc6ffa665712cdf32eb1';
test('snapshot integration retains every released UI, schema and memo implementation byte',async()=>{
  const files=execFileSync('git',['ls-tree','-r','--name-only',BASE,'web','db','drizzle'],{encoding:'utf8'}).trim().split('\n');
  files.push('public/app.js','public/index.html','public/style.css','public/memos.css','src/memos.mjs',
    'src/memos-validation.mjs','src/backup.mjs','src/storage.mjs','scripts/build.mjs');
  for(const file of files) {
    const source=await readFile(new URL('../'+file,import.meta.url),'utf8');
    const projected=await projectPublicNoteBackend(file,await projectPublicNoteFrontend(file,source));
    assert.equal(projected,execFileSync('git',['show',BASE+':'+file],{encoding:'utf8'}),file);
  }
  for(const route of ['/api/v1/memos','/api/v1/snapshot','/api/v1/snapshot/index'])assert.equal(traceRoute(route),route);
});

test('combined Worker serves memo and snapshot independently and never reads memo storage for snapshots',async t=>{
  const app=await fixture(t),session=await app.login(),owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const env={DB:app.db,SITE_ORIGIN:app.origin,MEMOS_OWNER_ID:owner,DAILY_NOTES_OWNER_ID:owner,
    PUBLIC_BUSINESS_MODE:'1',PUBLIC_BUSINESS_USER_ID:owner,PUBLIC_BUSINESS_ACCOUNT_IDS:'[]'};
  async function request(path,{method='GET',body,auth=false,database=app.db}={}) {
    const headers=new Headers();if(auth){headers.set('Cookie',session.cookie);headers.set('X-CSRF-Token',session.csrfToken);}
    if(body){headers.set('Content-Type','application/json');headers.set('Origin',app.origin);}
    const response=await worker.fetch(new Request(app.origin+'/api/v1'+path,{method,headers,
      body:body?JSON.stringify(body):undefined}),{...env,DB:database});
    return {status:response.status,json:await response.json()};
  }
  const gid=randomUUID(),nid=randomUUID(),canary='MEMO-EXCLUDED-FROM-SNAPSHOT';
  assert.equal((await request('/memos/groups/'+gid,{method:'PUT',auth:true,
    body:{title:'Integration group',position:0,version:0,save_id:randomUUID()}})).status,200);
  assert.equal((await request('/memos/notes/'+nid,{method:'PUT',auth:true,
    body:{group_id:gid,title:'Integration note',body:canary,position:0,version:0,save_id:randomUUID()}})).status,200);
  assert.equal((await request('/memos/notes/'+nid)).json.data.body,canary);
  const memo=await request('/memos');assert.equal(memo.status,200);assert.equal(memo.json.data.can_edit,true);
  for(const path of ['/snapshot?date=2026-10-24','/snapshot/index'])for(const auth of [false,true]) {
    const database=countingDb(app.db),result=await request(path,{auth,database});assert.equal(result.status,200);
    assert.ok(!JSON.stringify(result).includes(canary));assert.equal(database.totals().write_statements,0);
    assert.ok(database.entries.every(entry=>!/matrix_memo/i.test(entry.sql)),'no memo storage SQL');
  }
  const denied=await worker.fetch(new Request(app.origin+'/api/v1/snapshot/index',
    {headers:{Authorization:'Bearer SYNTHETIC-INTEGRATION-DENIED'}}),env);assert.equal(denied.status,403);
  const backup=await app.request('/api/v1/backup',{session});assert.equal(backup.status,200);
  assert.equal(backup.data.data.format,'haoduoyu-matrix-d1-v7');
});
