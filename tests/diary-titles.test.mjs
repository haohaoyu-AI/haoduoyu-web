import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';
import {exportBackup,restoreIntoEmptyDatabase} from '../src/backup.mjs';

test('private diary title is date scoped, owner-only, manually editable and backed up',async t=>{
  const app=await fixture(t), session=await app.login(),owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const env={DB:app.db,SITE_ORIGIN:app.origin,DAILY_NOTES_OWNER_ID:owner,PUBLIC_BUSINESS_MODE:'1',PUBLIC_BUSINESS_USER_ID:owner,PUBLIC_BUSINESS_ACCOUNT_IDS:'[]'};
  const path='/api/v1/diary-titles/2026-10-23';
  async function call({route=path,signed=true,body,origin=app.origin,headers={}}={}){
    const h={...(signed?{Cookie:session.cookie,'X-CSRF-Token':session.csrfToken}:{}),...headers};
    if(body!==undefined)Object.assign(h,{'Content-Type':'application/json',Origin:origin,'X-Public-Business':'1'});
    const r=await worker.fetch(new Request(app.origin+route,{method:body===undefined?'GET':'PUT',headers:h,body:body===undefined?undefined:JSON.stringify(body)}),env);
    return {status:r.status,cache:r.headers.get('Cache-Control'),...await r.json()};
  }
  assert.equal((await call({signed:false})).status,401);
  assert.equal((await call({route:path+'?extra=1'})).status,400);
  assert.equal((await call({route:'/api/v1/diary-titles/2026-02-30'})).status,400);
  assert.equal((await call({route:'/api/v1/diary-titles/2999-01-01'})).status,400);
  assert.deepEqual((await call()).data,{date:'2026-10-23',title:'',version:0,updated_at:null});
  const body={title:'窗边听雨',version:0,save_id:randomUUID()};
  assert.equal((await call({signed:false,body})).status,401);
  assert.equal((await call({origin:'https://other.example',body})).status,403);
  assert.equal((await call({body:{...body,title:'不/安全'}})).status,400);
  assert.equal((await call({body:{...body,title:'长'.repeat(41)}})).status,400);
  const blank=await call({body:{...body,title:''}});
  assert.equal(blank.data.version,0);
  const saved=await call({body});
  assert.equal(saved.status,200);assert.equal(saved.cache,'private, no-store');assert.equal(saved.data.version,1);
  assert.deepEqual((await call({body})).data,saved.data);
  assert.equal((await call({body:{...body,title:'冲突标题',save_id:randomUUID()}})).status,409);
  const other=await call({route:'/api/v1/diary-titles/2026-10-24'});assert.equal(other.data.title,'');
  assert.equal((await call()).data.title,'窗边听雨');
  const backup=await exportBackup(app.db,{todoUserId:owner});assert.equal(backup.data.format,'haoduoyu-matrix-d1-v20');
  assert.equal(backup.data.tables.diary_titles[0].title,'窗边听雨');
  assert.deepEqual((await exportBackup(app.db,{todoUserId:randomUUID()})).data.tables.diary_titles,[]);
  const target=await fixture(t,{bootstrap:false});
  await restoreIntoEmptyDatabase(target.db,backup,{allowEmptyRestore:true});
  assert.equal((await target.db.prepare('SELECT title FROM matrix_diary_titles').first()).title,'窗边听雨');
  const clear=await call({body:{title:'',version:1,save_id:randomUUID()}});
  assert.equal(clear.data.title,'');assert.equal(clear.data.version,2);
});
