import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';
import {beijingDay} from '../src/lib/time.mjs';
test('server accepts today only for new entries and preserves historic reads',async t=>{
 const app=await fixture(t),session=await app.login(), owner=(await app.request('/api/v1/auth/me',{session})).data.id;
 const env={DB:app.db,SITE_ORIGIN:app.origin,DAILY_NOTES_OWNER_ID:owner,PUBLIC_BUSINESS_MODE:'0',PUBLIC_BUSINESS_USER_ID:owner,PUBLIC_BUSINESS_ACCOUNT_IDS:'[]'};
 const today=beijingDay(Date.now()), yesterday=new Date(Date.parse(today+'T00:00:00Z')-86400000).toISOString().slice(0,10), tomorrow=new Date(Date.parse(today+'T00:00:00Z')+86400000).toISOString().slice(0,10);
 async function request(path,method='GET',body){const headers=new Headers({Cookie:session.cookie,'X-CSRF-Token':session.csrfToken,Origin:app.origin}); if(body) headers.set('Content-Type','application/json'); const response=await worker.fetch(new Request(app.origin+'/api/v1/note-entries'+path,{method,headers,body:body&&JSON.stringify(body)}),env);return {status:response.status,...await response.json()};}
 const payload=date=>({category:'life',date,text:'synthetic',version:0,save_id:randomUUID()});
 assert.equal((await request('/'+randomUUID(),'PUT',payload(yesterday))).status,400);
 assert.equal((await request('/'+randomUUID(),'PUT',payload(tomorrow))).status,400);
 assert.equal((await request('/'+randomUUID(),'PUT',payload(today))).status,200);
 const id=randomUUID(), stamp=new Date().toISOString(); await app.db.prepare('INSERT INTO matrix_note_entries(user_id,id,category,date,text,version,change_seq,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,1,1,?,?,NULL)').bind(owner,id,'life',yesterday,'synthetic history',stamp,stamp).run();
 const history=await request('?date='+yesterday); assert.equal(history.status,200); assert.ok(history.data.entries.some(x=>x.id===id));
});
