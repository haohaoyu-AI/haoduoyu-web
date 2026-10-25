import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import {applyFixtureMigrations} from './harness.mjs';
import {authenticate,digest,now} from '../src/security.mjs';
import {mutate,storeFor} from '../src/storage.mjs';
import {syncUpdatedNotes} from '../src/notion-notes-sync.mjs';
import {pushNotionSnapshot,pushNotionNote} from '../src/notion-transport.mjs';

const parentId='a'.repeat(32),token='SYNTHETIC-NOTION-TOKEN-NO-PERSIST',stamp='2026-10-24T11:00:00.000Z';
async function setup(t) {
  const runtime=JSON.parse(await readFile(new URL('../runtime.json',import.meta.url),'utf8'));
  const mf=new Miniflare({modules:true,cf:false,script:'export default {fetch(){return new Response(null,{status:404})}}',
    compatibilityDate:runtime.compatibility_date,compatibilityFlags:runtime.compatibility_flags,d1Databases:['DB'],d1Persist:false,
    outboundService:()=>new Response('External requests disabled',{status:502})});
  t.after(()=>mf.dispose());const db=await mf.getD1Database('DB');await applyFixtureMigrations(db);
  const ownerId=randomUUID(),session='f'.repeat(64);
  await db.batch([
    db.prepare('INSERT INTO matrix_control(id,initialized) VALUES(1,1)'),
    db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').bind(ownerId,'synthetic-notes-owner','SYNTHETIC-HASH',stamp),
    db.prepare('INSERT INTO matrix_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(digest(session),ownerId,new Date(Date.now()+3600000).toISOString()),
  ]);
  const actor=await authenticate(storeFor(db),new Request('https://example.invalid',{headers:{Cookie:'matrix_session='+session}}),'write');
  const config={ownerId,parentId,token};
  const save=async(date,text,{deleted=false}={})=>{
    await mutate(db,async store=>{
      const revision=(await store.get('SELECT revision FROM matrix_control WHERE id=1')).revision;
      store.queue('INSERT INTO matrix_daily_notes(user_id,date,text,version,change_seq,created_at,updated_at,deleted_at) VALUES(?,?,?,1,?,?,?,?) ON CONFLICT(user_id,date) DO UPDATE SET text=excluded.text,version=matrix_daily_notes.version+1,change_seq=excluded.change_seq,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at',
        ownerId,date,text,revision+1,stamp,stamp,deleted?stamp:null);
      return {actor};
    });
    return db.prepare('SELECT * FROM matrix_daily_notes WHERE user_id=? AND date=?').bind(ownerId,date).first();
  };
  return {db,ownerId,actor,config,save};
}
function fakeNotion() {
  const pages=new Map(),calls=[],options={};let serial=0;
  const fetchImpl=async(url,request)=>{
    calls.push({url,method:request.method});assert.equal(new URL(url).origin,'https://api.notion.com');
    assert.equal(request.headers['Notion-Version'],'2026-03-11');
    const path=new URL(url).pathname,id=path.split('/')[3];
    if(request.method==='GET'&&path.startsWith('/v1/pages/'))return Response.json({parent:{page_id:parentId},in_trash:false,archived:false});
    if(request.method==='GET') {
      let rows=id===parentId?[...pages].map(([id,page])=>({id,type:'child_page',child_page:{title:page.title}})):pages.get(id)?.children;
      assert.ok(rows);
      if(id===parentId&&options.parentFill) {
        rows=[...Array.from({length:options.parentFill},()=>({type:'paragraph',paragraph:{rich_text:[]}})),...rows];
        const start=Number(new URL(url).searchParams.get('start_cursor')||0);
        return Response.json({results:rows.slice(start,start+1),has_more:start+1<rows.length,next_cursor:start+1<rows.length?String(start+1):null});
      }
      return Response.json({results:structuredClone(rows),has_more:false,next_cursor:null});
    }
    if(request.method==='POST') {
      const data=JSON.parse(request.body),id=(++serial).toString(16).padStart(32,'0');
      if(options.rejectCreate)return Response.json({message:token+' BODY-CANARY'},429,{'Retry-After':'7'});
      pages.set(id,{title:data.properties.title.title[0].text.content,children:structuredClone(data.children)});
      if(options.createHook)await options.createHook();
      if(options.loseCreate)throw Error(token+' BODY-CANARY');
      return Response.json({id});
    }
    assert.equal(request.method,'PATCH');
    pages.get(id).children.push(...JSON.parse(request.body).children);
    return Response.json({results:[]});
  };
  return {pages,calls,options,fetchImpl};
}
const receipt=async app=>(await app.db.prepare("SELECT status,response_json FROM matrix_idempotency WHERE actor LIKE 'notion-notes:%' AND key='cursor'").first());
const storedCursor=async app=>JSON.parse((await receipt(app)).response_json).cursor;
const run=(app,api,extra={})=>syncUpdatedNotes(app.db,app.config,{actor:app.actor,fetchImpl:api.fetchImpl,...extra});

test('same-millisecond old-date updates use change_seq, page completely, and preserve owner isolation',async t=>{
  const app=await setup(t),api=fakeNotion();
  const old=await app.save('2024-01-01','旧日期'),newer=await app.save('2026-10-24','今天');
  const other=randomUUID();
  await app.db.batch([
    app.db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').bind(other,'synthetic-other','SYNTHETIC-HASH',stamp),
    app.db.prepare('INSERT INTO matrix_daily_notes(user_id,date,text,version,change_seq,created_at,updated_at) VALUES(?,?,?,1,1,?,?)')
      .bind(other,'2026-10-24','OTHER-OWNER-NOTES-CANARY',stamp,stamp),
  ]);
  assert.equal(old.updated_at,newer.updated_at);assert.ok(newer.change_seq>old.change_seq);
  const first=await run(app,api,{pageSize:1});
  assert.equal(first.synced.length,2);assert.deepEqual(first.synced.map(x=>x.date),['2024-01-01','2026-10-24']);
  assert.equal(first.requests,6);assert.equal((await receipt(app)).status,200);
  assert.ok(!JSON.stringify([...api.pages.values()]).includes('OTHER-OWNER-NOTES-CANARY'));
  const changed=await app.save('2024-01-01','旧日期同毫秒更新');
  const next=await run(app,api);assert.equal(next.synced.length,1);assert.equal(next.synced[0].version,2);
  assert.equal(next.cursor.change_seq,changed.change_seq);assert.equal(api.pages.size,3);
  await assert.rejects(syncUpdatedNotes(app.db,app.config,{fetchImpl:api.fetchImpl}),e=>e.status===403);
  await assert.rejects(syncUpdatedNotes(app.db,{...app.config,ownerId:randomUUID()},{actor:app.actor,fetchImpl:api.fetchImpl}),e=>e.status===403);
});

test('unknown successful-delivery receipt commit stays locked and is sanitized without re-pushing',async t=>{
  const app=await setup(t),api=fakeNotion();await app.save('2026-10-24','A');let delivered=false;
  const db={prepare:app.db.prepare.bind(app.db),batch(statements){
    if(delivered)throw Error(token+' PRIVATE-RECEIPT-CANARY');
    return app.db.batch(statements);
  }};
  await assert.rejects(syncUpdatedNotes(db,app.config,{actor:app.actor,fetchImpl:api.fetchImpl,push:async options=>{
    const result=await pushNotionNote(options);delivered=true;return result;
  }}),e=>e.code==='NOTION_PENDING'&&e.uncertainWrite&&!e.message.includes(token)&&!e.stack.includes('PRIVATE-RECEIPT-CANARY'));
  assert.equal((await receipt(app)).status,102);
  await assert.rejects(run(app,api),e=>e.code==='NOTION_PENDING');
  assert.equal(api.calls.filter(c=>c.method==='POST').length,1);
});

test('oversized note or cursor beyond captured source revision fails without sending or skipping data',async t=>{
  const app=await setup(t),api=fakeNotion();await app.save('2026-10-24','x'.repeat(65537));
  await assert.rejects(run(app,api),e=>e.code==='NOTION_NOTES_DATA');assert.equal(api.calls.length,0);
  assert.deepEqual(await storedCursor(app),{change_seq:0,date:''});
  await app.db.prepare("UPDATE matrix_idempotency SET response_json=? WHERE actor LIKE 'notion-notes:%' AND key='cursor'")
    .bind(JSON.stringify({cursor:{change_seq:999999,date:'2026-10-24'}})).run();
  await assert.rejects(run(app,api),e=>e.code==='NOTION_NOTES_STATE');assert.equal(api.calls.length,0);
});

test('clear/delete are explicit new states; identical text metadata changes skip and still advance the cursor',async t=>{
  const app=await setup(t),api=fakeNotion();await app.save('2026-10-24','第一份');
  const first=await run(app,api),original=structuredClone(api.pages.get(first.synced[0].page_id));
  const noChange=await app.save('2026-10-24','第一份'),skip=await run(app,api);
  assert.equal(skip.synced[0].status,'skipped');assert.equal(skip.cursor.change_seq,noChange.change_seq);assert.equal(api.pages.size,1);
  await app.save('2026-10-24','');assert.equal((await run(app,api)).synced[0].version,2);
  await app.save('2026-10-24','旧正文不再复制',{deleted:true});assert.equal((await run(app,api)).synced[0].version,3);
  assert.deepEqual(api.pages.get(first.synced[0].page_id),original);
  const content=JSON.stringify([...api.pages.values()]);
  assert.match(content,/cleared/);assert.match(content,/deleted/);assert.ok(!content.includes('旧正文不再复制'));
  assert.ok([...api.pages.values()].every(p=>p.title.startsWith('碎碎念 ')));
});

test('high-water is captured once and concurrent newer writes remain eligible next invocation',async t=>{
  const app=await setup(t),api=fakeNotion();await app.save('2026-10-24','同步前');
  let updated;
  api.options.createHook=async()=>{api.options.createHook=null;updated=await app.save('2026-10-24','同步期间的新写');};
  const first=await run(app,api);assert.equal(first.synced.length,1);assert.ok(updated.change_seq>first.high_water);
  assert.ok(first.cursor.change_seq<updated.change_seq);
  const next=await run(app,api);assert.equal(next.synced.length,1);assert.equal(next.synced[0].version,2);
  assert.equal(next.cursor.change_seq,updated.change_seq);
});

test('max-note and shared external request budgets stop only after verified items and retain remaining work',async t=>{
  const app=await setup(t),api=fakeNotion();await app.save('2026-10-23','A');await app.save('2026-10-24','B');await app.save('2026-10-25','C');
  const first=await run(app,api);assert.equal(first.synced.length,2);assert.equal(first.has_more,true);
  assert.equal((await run(app,api)).synced.length,1);
  const other=await setup(t),limited=fakeNotion();await other.save('2026-10-23','A');await other.save('2026-10-24','B');limited.options.parentFill=20;
  const partial=await run(other,limited);assert.equal(partial.status,'partial');assert.equal(partial.synced.length,1);
  assert.equal(partial.requests,40);assert.equal(partial.has_more,true);assert.equal((await receipt(other)).status,200);
  assert.equal(limited.calls.filter(c=>c.method==='POST').length,1);
  limited.options.parentFill=0;assert.equal((await run(other,limited)).synced.length,1);
});

test('known read failure does not advance cursor or erase previous page evidence; unknown writes remain pending',async t=>{
  const app=await setup(t),api=fakeNotion();await app.save('2026-10-24','A');await run(app,api);
  const before=await storedCursor(app);await app.save('2026-10-24','B');let previous;
  await assert.rejects(run(app,api,{push:async({previousDelivery})=>{
    previous=previousDelivery;throw Object.assign(Error('PRIVATE-ERROR-CANARY'),{code:'NOTION_RATE_LIMIT',uncertainWrite:false});
  }}),e=>e.code==='NOTION_RATE_LIMIT'&&!e.message.includes('PRIVATE-ERROR-CANARY'));
  assert.deepEqual(await storedCursor(app),before);assert.equal(previous.version,1);
  await run(app,api);assert.equal(api.pages.size,2);
  await app.save('2026-10-24','C');let calls=0;
  const unknown=async()=>{calls++;throw Object.assign(Error(token),{code:'NOTION_UNKNOWN',uncertainWrite:true});};
  const last=await storedCursor(app);
  await assert.rejects(run(app,api,{push:unknown}),e=>e.code==='NOTION_UNKNOWN'&&e.uncertainWrite);
  assert.deepEqual(await storedCursor(app),last);assert.equal((await receipt(app)).status,202);
  await assert.rejects(run(app,api,{push:unknown}),e=>e.code==='NOTION_PENDING');assert.equal(calls,1);
  const receipts=await app.db.prepare("SELECT response_json FROM matrix_idempotency WHERE actor LIKE 'notion-notes:%'").all();
  for(const secret of [token,'PRIVATE-ERROR-CANARY','同步期间的新写'])assert.ok(!JSON.stringify(receipts.results).includes(secret));
});

test('lost successful create is read back once, concurrent runs are locked, and D1 query count stays bounded',async t=>{
  const app=await setup(t),api=fakeNotion();await app.save('2026-10-23','A');await app.save('2026-10-24','B');
  api.options.loseCreate=true;
  let queries=0;
  const counted={prepare(sql){queries++;return app.db.prepare(sql);},batch(statements){return app.db.batch(statements);}};
  // prepare counts each statement, including prepared batch entries, once.
  const result=await syncUpdatedNotes(counted,app.config,{actor:app.actor,fetchImpl:api.fetchImpl,pageSize:1});
  assert.equal(result.synced.length,2);assert.ok(queries<=50,'D1 Free query budget: '+queries);
  assert.equal(api.calls.filter(c=>c.method==='POST').length,2);
  await app.save('2026-10-25','C');let entered,release;
  const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
  const push=async options=>{entered();await gate;return pushNotionNote(options);};
  const first=run(app,api,{push});await ready;
  await assert.rejects(run(app,api),e=>e.code==='NOTION_PENDING');release();assert.equal((await first).synced.length,1);
});

test('daily-note transport uses separate format/seal and never consumes or changes business snapshot pages',async()=>{
  const api=fakeNotion(),date='2026-10-24';
  const business={snapshot_format:'haoduoyu-business-snapshot-v1',date,timezone:'Asia/Shanghai',generated_at:now(),content_hash:'b'.repeat(64),
    todos:[],templates:[],accounts:[],articles:[],observations:[],daily_metrics:[]};
  const old=await pushNotionSnapshot({token,parentId,snapshot:business,fetchImpl:api.fetchImpl});
  const untouched=structuredClone(api.pages.get(old.page_id));
  const note={snapshot_format:'haoduoyu-daily-notes-v1',date,timezone:'Asia/Shanghai',generated_at:now(),content_hash:'c'.repeat(64),
    notes:[{date,text:'独立碎碎念',state:'active'}]};
  const created=await pushNotionNote({token,parentId,snapshot:note,fetchImpl:api.fetchImpl});
  assert.equal(created.version,1);assert.deepEqual(api.pages.get(old.page_id),untouched);
  const texts=api.pages.get(created.page_id).children.map(b=>b.paragraph.rich_text[0].text.content);
  assert.match(texts[0],/^haoduoyu-daily-notes-v1\|/);assert.match(texts.at(-1),/^haoduoyu-daily-notes-complete\|/);
  assert.ok(!texts.some(t=>t.startsWith('todos:')));
});
