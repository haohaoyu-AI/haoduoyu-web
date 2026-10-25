import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import {applyLocalSchemaMigrations} from '../scripts/migration-contract.mjs';
import {createRecords} from '../src/records.mjs';
import {ensureControl,mutate,revision,storeFor} from '../src/storage.mjs';
import {authorizeArticleUpsert,upsertArticle} from '../src/article-upsert.mjs';

const account='synthetic-upsert-a',other='synthetic-upsert-b';
const body=(extra={})=>({account_id:account,run_dir:'Synthetic/Run_20261024',title:'合成草稿',...extra});
const tuple=(status,code)=>error=>error.status===status&&error.code===code;
async function fixture(t) {
  const runtime=JSON.parse(await readFile(new URL('../runtime.json',import.meta.url),'utf8'));
  const mf=new Miniflare({modules:true,cf:false,script:'export default {fetch(){return new Response(null,{status:404})}}',
    compatibilityDate:runtime.compatibility_date,compatibilityFlags:runtime.compatibility_flags,
    d1Databases:['DB'],d1Persist:false,outboundService:()=>new Response('External requests disabled',{status:502})});
  t.after(()=>mf.dispose());
  const db=await mf.getD1Database('DB');await applyLocalSchemaMigrations(db);await ensureControl(db);
  await db.prepare('UPDATE matrix_control SET initialized=1 WHERE id=1').run();
  for(const id of [account,other])await db.prepare('INSERT INTO matrix_accounts(id,platform,name,active,created_at) VALUES(?,?,?,1,?)')
    .bind(id,'toutiao','合成账号','2026-01-01T00:00:00.000Z').run();
  const call=(input,scope=null)=>mutate(db,async store=>{
    const result=await upsertArticle(store,createRecords(store),input,scope);
    return {...result,replayed:result.unchanged};
  });
  const snapshot=async()=>Object.fromEntries(await Promise.all(['matrix_articles','matrix_observations','matrix_daily_metrics','matrix_control','matrix_audit']
    .map(async table=>[table,(await db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()).results])));
  return {db,call,snapshot};
}

test('upsert validates account authorization before any key lookup or receipt authorization',async()=>{
  let accountReads=0,keyReads=0;
  const records={async listAccounts(){accountReads++;return [{id:account}];}};
  const store={async get(){keyReads++;throw Error('Key lookup must not run');}};
  for(const input of [body(),body({run_dir:'ExistingSecretRun'})]) {
    await assert.rejects(()=>upsertArticle(store,records,input,[other]),tuple(403,'FORBIDDEN'));
    await assert.rejects(()=>authorizeArticleUpsert(records,input,[other]),tuple(403,'FORBIDDEN'));
  }
  assert.equal(accountReads,0);assert.equal(keyReads,0);
  await assert.rejects(()=>upsertArticle(store,records,body({account_id:'missing'}),null),tuple(404,'NOT_FOUND'));
  assert.equal(accountReads,1);assert.equal(keyReads,0);
});

test('real D1 upsert creates genuine nullable drafts and supports CAS, semantic JSON no-op and readback',async t=>{
  const app=await fixture(t),created=await app.call(body({sample:{z:1,a:{keep:true}},version:0}));
  assert.equal(created.created,true);assert.equal(created.unchanged,false);assert.equal(created.value.status,'draft_saved');
  assert.equal(created.value.url,null);assert.equal(created.value.published_at,null);assert.equal(created.value.version,1);
  const before=await revision(app.db);
  const same=await app.call(body({sample:{a:{keep:true},z:1},version:1}));
  assert.equal(same.unchanged,true);assert.equal(same.value.version,1);assert.equal(await revision(app.db),before);
  assert.deepEqual(same.value,created.value,'detail-only audit/observation fields must not leak into unchanged output');
  const changed=await app.call(body({version:1,notes:'真实本次修改'}));
  assert.equal(changed.created,false);assert.equal(changed.unchanged,false);assert.equal(changed.value.version,2);
  assert.equal(changed.value.notes,'真实本次修改');assert.deepEqual(changed.value.sample,created.value.sample);
  for(const version of [0,1,99])await assert.rejects(()=>app.call(body({version})),tuple(409,'VERSION_CONFLICT'));
  await assert.rejects(()=>app.call(body()),tuple(400,'VALIDATION_ERROR'));
  await assert.rejects(()=>app.call(body({run_dir:'NewRun',version:2})),tuple(409,'VERSION_CONFLICT'));
  const next=await app.call(body({run_dir:'NewRun',title:'同账号第二篇无URL草稿'}));
  assert.notEqual(next.value.id,created.value.id);assert.equal(next.value.url,null);
  const rows=(await app.db.prepare('SELECT status,url,published_at FROM matrix_articles').all()).results;
  assert.equal(rows.length,2);assert.ok(rows.every(row=>row.status==='draft_saved'&&row.url===null&&row.published_at===null));
});

test('both unique identities must identify one account/object and nonnull keys cannot be changed or cleared',async t=>{
  const app=await fixture(t);
  const a=(await app.call(body({slot:'tt1',run_date:'2026-10-24'}))).value;
  const b=(await app.call(body({run_dir:'Synthetic/OtherRun',slot:'tt2',run_date:'2026-10-24'}))).value;
  await app.call(body({account_id:other,run_dir:'OtherAccountRun',slot:'tt3',run_date:'2026-10-24'}));
  const before=await app.snapshot();
  const conflicts=[
    body({slot:'tt2',run_date:'2026-10-24',version:a.version}),
    body({run_dir:'UnmatchedNewDir',slot:'tt1',run_date:'2026-10-24',version:a.version}),
    body({slot:'tt1',run_date:'2026-10-25',version:a.version}),
    body({run_dir:null,slot:'tt1',run_date:'2026-10-24',version:a.version}),
    body({slot:null,run_date:null,version:a.version}),
    body({id:b.id,version:a.version}),body({id:'nonexistent-client-id',run_dir:'NoSuchRun'}),
    body({account_id:other,version:a.version}),body({run_dir:'OtherAccountRun',version:1}),
  ];
  for(const input of conflicts) {
    const store=storeFor(app.db);
    await assert.rejects(()=>upsertArticle(store,createRecords(store),input,null),tuple(409,'ARTICLE_PIPELINE_KEY_CONFLICT'));
    assert.equal(store.pending.length,0,'conflict must not plan even one write');
    assert.deepEqual(await app.snapshot(),before);
  }
  const pairOnly=await app.call({account_id:account,slot:'tt1',run_date:'2026-10-24',version:1,title:a.title});
  assert.equal(pairOnly.unchanged,true);assert.equal(pairOnly.value.id,a.id);
  const missing=(await app.call({account_id:account,slot:'gzh',run_date:'2026-10-24',title:'缺目录可补'})).value;
  const filled=await app.call({account_id:account,run_dir:'gzh/109',slot:'gzh',run_date:'2026-10-24',version:1});
  assert.equal(filled.value.id,missing.id);assert.equal(filled.value.run_dir,'gzh/109');assert.equal(filled.value.version,2);
});

test('object JSON recursively merges, arrays replace, explicit null clears and unknown keys/PGC strings survive',async t=>{
  const app=await fixture(t),created=(await app.call(body({
    sample:{source:{keep:'unknown',replace:1,arr:[1,2]},future:{value:true}},
    draft_ref:{pgc_id:'7699934907375567402',future:'保留'},
    timings:{draft:{start:'untouched',end:'old'}},reruns:{watchdog:1,future:{attempts:2}},
    blockers:[{type:'old',unknown:1}],verify_items:[{key:'old',done:false}],
  }))).value;
  const patched=(await app.call(body({version:1,sample:{source:{replace:2,arr:[3]},new_key:[{keep:true}]},
    draft_ref:{editor_url:'https://example.invalid/editor'},timings:{draft:{end:'new'}},
    reruns:{future:{extra:true}},blockers:[{type:'new'}],verify_items:[],
  }))).value;
  assert.deepEqual(patched.sample,{source:{keep:'unknown',replace:2,arr:[3]},future:{value:true},new_key:[{keep:true}]});
  assert.deepEqual(patched.draft_ref,{pgc_id:'7699934907375567402',future:'保留',editor_url:'https://example.invalid/editor'});
  assert.deepEqual(patched.timings,{draft:{start:'untouched',end:'new'}});
  assert.deepEqual(patched.reruns,{watchdog:1,future:{attempts:2,extra:true}});
  assert.deepEqual(patched.blockers,[{type:'new'}]);assert.deepEqual(patched.verify_items,[]);
  const cleared=(await app.call(body({version:2,sample:null,draft_ref:{future:null},timings:null}))).value;
  assert.equal(cleared.sample,null);assert.equal(cleared.timings,null);assert.equal(cleared.draft_ref.future,null);
  assert.equal(cleared.draft_ref.pgc_id,created.draft_ref.pgc_id);
  const replaced=await mutate(app.db,async store=>({value:await createRecords(store).updateArticle(created.id,{version:3,sample:{fresh:1},draft_ref:null},null)}));
  assert.deepEqual(replaced.value.sample,{fresh:1});assert.equal(replaced.value.draft_ref,null,'ordinary PUT remains whole-field replacement');
});

test('invalid selectors, raw/unknown fields, unsafe JSON and post-merge size/depth cannot queue any writes',async t=>{
  const app=await fixture(t),first=(await app.call(body({sample:{first:'a'.repeat(33000)}}))).value;
  const before=await app.snapshot();
  const invalid=[body({run_dir:undefined}),{account_id:account,title:'missing identity'},
    body({slot:'tt1'}),body({slot:null,run_date:'2026-10-24'}),body({run_dir:'gzh//109'}),
    body({extra:'ignored?' ,version:1}),body({sample_json:'{}',version:1}),body({version:null}),
    body({sample:JSON.parse('{"nested":{"__proto__":{"polluted":true}}}'),version:1}),
    body({sample:{bad:Infinity},version:1}),body({draft_ref:{pgc_id:7699934907375567402},version:1}),
    body({sample:{second:'b'.repeat(33000)},version:1}),
  ];
  for(const input of invalid) {
    const store=storeFor(app.db);
    await assert.rejects(()=>upsertArticle(store,createRecords(store),input,null),tuple(400,'VALIDATION_ERROR'));
    assert.equal(store.pending.length,0);assert.deepEqual(await app.snapshot(),before);
  }
  let old={leaf:1};for(let n=0;n<10;n++)old={nested:old};
  const row=(await app.call(body({run_dir:'DepthRun',sample:{tree:old}}))).value;
  let addition={leaf:{too:{deep:true}}};for(let n=0;n<10;n++)addition={nested:addition};
  const snap=await app.snapshot(),store=storeFor(app.db);
  await assert.rejects(()=>upsertArticle(store,createRecords(store),body({run_dir:'DepthRun',sample:{tree:addition},version:row.version}),null),tuple(400,'VALIDATION_ERROR'));
  assert.equal(store.pending.length,0);assert.deepEqual(await app.snapshot(),snap);assert.equal(first.version,1);
});

test('real D1 concurrent updates retain the original revision/version CAS and unknown commit errors are not retried',async t=>{
  const app=await fixture(t),created=(await app.call(body())).value;
  const attempts=await Promise.allSettled(['甲','乙'].map(notes=>app.call(body({version:1,notes}))));
  assert.equal(attempts.filter(row=>row.status==='fulfilled').length,1);
  const failure=attempts.find(row=>row.status==='rejected');assert.equal(failure.reason.code,'VERSION_CONFLICT');
  const current=await createRecords(storeFor(app.db)).getArticle(created.id,null);assert.equal(current.version,2);
  let calls=0;
  const original=new Error('Synthetic unknown commit outcome');
  const db={prepare:sql=>app.db.prepare(sql),async batch(){calls++;throw original;}};
  await assert.rejects(()=>mutate(db,async store=>({value:await upsertArticle(store,createRecords(store),body({version:2,notes:'未知提交'}),null)})),error=>error===original);
  assert.equal(calls,1);assert.equal((await createRecords(storeFor(app.db)).getArticle(created.id,null)).version,2);
});

test('stored null lifecycle is not a no-op and inactive accounts retain the existing create/update contract',async t=>{
  const app=await fixture(t),created=(await app.call(body())).value;
  await app.db.prepare('UPDATE matrix_articles SET status=NULL WHERE id=?').bind(created.id).run();
  const before=await app.snapshot(),store=storeFor(app.db);
  await assert.rejects(()=>upsertArticle(store,createRecords(store),body({version:1}),null),tuple(400,'VALIDATION_ERROR'));
  assert.equal(store.pending.length,0);assert.deepEqual(await app.snapshot(),before);
  const repaired=(await app.call(body({version:1,status:'draft_saved'}))).value;
  assert.equal(repaired.status,'draft_saved');assert.equal(repaired.version,2);
  await app.db.prepare('UPDATE matrix_accounts SET active=0 WHERE id=?').bind(account).run();
  const unchanged=await app.call(body({version:2}));assert.equal(unchanged.unchanged,true);
  const updated=(await app.call(body({version:2,notes:'停用后历史修正'}))).value;
  assert.equal(updated.version,3);assert.equal(updated.notes,'停用后历史修正');
  const checkpoint=await app.snapshot();
  await assert.rejects(()=>app.call(body({run_dir:'NewInactiveRun'})),tuple(409,'ACCOUNT_INACTIVE'));
  assert.deepEqual(await app.snapshot(),checkpoint);
});

test('the merged node budget is enforced even when each separate partial object is within the limit',async t=>{
  const app=await fixture(t),many=Object.fromEntries(Array.from({length:2400},(_,i)=>['key_'+i,0]));
  await app.call(body({sample:{left:many}}));
  const before=await app.snapshot(),store=storeFor(app.db);
  await assert.rejects(()=>upsertArticle(store,createRecords(store),body({version:1,sample:{right:many}}),null),tuple(400,'VALIDATION_ERROR'));
  assert.equal(store.pending.length,0);assert.deepEqual(await app.snapshot(),before);
});

test('no-op validates restored publication inconsistencies and metric constraints without queuing repairs',async t=>{
  const app=await fixture(t),created=(await app.call(body())).value;
  const rejectUnchanged=async(status)=>{
    const checkpoint=await app.snapshot(),store=storeFor(app.db);
    await assert.rejects(()=>upsertArticle(store,createRecords(store),{account_id:account,run_dir:created.run_dir,version:1},null),error=>error.status===status);
    assert.equal(store.pending.length,0);assert.deepEqual(await app.snapshot(),checkpoint);
  };
  await app.db.prepare('UPDATE matrix_articles SET url=?,published_at=? WHERE id=?')
    .bind('https://example.invalid/restored','2026-10-01T00:00:00.000Z',created.id).run();
  await rejectUnchanged(400);
  await app.db.prepare("UPDATE matrix_articles SET status='published',url=NULL,published_at=NULL WHERE id=?").bind(created.id).run();
  await rejectUnchanged(400);
  await app.db.prepare("UPDATE matrix_articles SET status='draft_saved' WHERE id=?").bind(created.id).run();
  await app.db.prepare('INSERT INTO matrix_observations(id,article_id,as_of,collected_at,kind,metrics_json,source,note,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind('synthetic-restored-observation',created.id,'2026-10-02T00:00:00.000Z','2026-10-02T00:00:00.000Z',
      'latest','{"reads":1}','synthetic','','2026-10-02T00:00:00.000Z').run();
  await rejectUnchanged(409);
});
