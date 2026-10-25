// Real built Worker + isolated Miniflare D1. This file never builds or accesses production.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';

const account='toutiao-haoduoyu',other='zhihu-haoduoyu';
const key=()=> 'synthetic-upsert-'+randomUUID();
const draft=(extra={})=>({account_id:account,run_dir:'Synthetic/Run_'+randomUUID(),title:'合成upsert草稿',status:'draft_saved',...extra});
const published=(extra={})=>({account_id:account,title:'合成原POST',url:'https://example.invalid/published/'+randomUUID(),published_at:'2026-10-01T00:00:00.000Z',...extra});
async function setup(t) {
  const app=await fixture(t),session=await app.login(),owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const env={DB:app.db,SITE_ORIGIN:app.origin,DAILY_NOTES_OWNER_ID:owner};
  async function api(path,{method='GET',body,token,anonymous=false,headers={},settings=env,db}={}) {
    const h=new Headers();
    if(!anonymous&&!token){h.set('Cookie',session.cookie);h.set('X-CSRF-Token',session.csrfToken);}
    if(token)h.set('Authorization','Bearer '+token);
    if(body!==undefined)h.set('Content-Type','application/json');
    if(!['GET','HEAD'].includes(method))h.set('Origin',app.origin);
    for(const [name,value] of Object.entries(headers)){if(value===null)h.delete(name);else h.set(name,value);}
    const response=await worker.fetch(new Request(app.origin+'/api/v1'+path,{method,headers:h,
      body:body===undefined?undefined:JSON.stringify(body)}),{...settings,...(db?{DB:db}:{})});
    const text=await response.text();let json;try{json=JSON.parse(text);}catch{}
    return {status:response.status,headers:response.headers,text,json,data:json?.data,meta:json?.meta};
  }
  const patch=(body,options={})=>api('/articles',{method:'PATCH',body,...options});
  return {...app,session,owner,env,api,patch};
}
async function state(app) {
  return {
    articles:(await app.db.prepare('SELECT * FROM matrix_articles ORDER BY id').all()).results,
    audits:(await app.db.prepare("SELECT * FROM matrix_audit WHERE entity_id IN (SELECT id FROM matrix_articles) ORDER BY id").all()).results,
    receipts:(await app.db.prepare('SELECT * FROM matrix_idempotency ORDER BY actor,key').all()).results,
    revision:(await app.db.prepare('SELECT revision FROM matrix_control WHERE id=1').first()).revision,
  };
}
const ids=rows=>rows.map(row=>row.id);
const good=(response,status)=>assert.equal(response.status,status,response.text);

test('PATCH requires an authorized account and complete identity; create versions omit/zero, slash keys stay distinct',async t=>{
  const app=await setup(t),body=draft({run_dir:'Synthetic/tt1_1024'});
  const first=await app.patch(body);good(first,201);assert.equal(first.data.upsert_action,'created');assert.equal(first.data.version,1);
  assert.equal(first.data.run_dir,'Synthetic/tt1_1024');assert.equal(first.data.url,null);assert.equal(first.data.published_at,null);
  const createdDetail=await app.api('/articles/'+first.data.id);good(createdDetail,200);
  assert.equal(createdDetail.data.recorded_by.actor,'user:'+app.owner);
  assert.equal(createdDetail.data.last_modified_by.actor,'user:'+app.owner);
  const flattened=await app.patch(draft({run_dir:'Synthetic_tt1_1024',version:0}));good(flattened,201);
  assert.notEqual(flattened.data.id,first.data.id);
  for(const invalid of [
    {title:'no identity',account_id:account},{title:'no account',run_dir:'Synthetic/Other'},
    {account_id:account,title:'half slot',slot:'tt1'},{account_id:account,title:'half date',run_date:'2026-10-24'},
    draft({version:-1}),draft({version:'0'}),draft({version:null}),draft({title:undefined}),draft({ignored_unknown_field:true}),
  ])good(await app.patch(invalid),400);
  good(await app.patch(draft({version:1})),409);
  good(await app.patch(body),400);good(await app.patch({...body,version:0}),409);
  const changed=await app.patch({...body,version:1,title:'已匹配更新'});good(changed,200);
  assert.equal(changed.data.upsert_action,'updated');assert.equal(changed.data.id,first.data.id);assert.equal(changed.data.version,2);
  const changedDetail=await app.api('/articles/'+first.data.id);good(changedDetail,200);
  assert.equal(changedDetail.data.last_modified_by.actor,'user:'+app.owner);
  const audit=await app.api('/audit');good(audit,200);
  assert.equal(audit.data.find(row=>row.action==='PATCH /articles'&&row.entity_id===first.data.id).entity_label,'已匹配更新');
  const pair=await app.patch({account_id:account,title:'仅完整时段键',slot:'tt2',run_date:'2026-10-24',version:0});good(pair,201);
  const same=await app.patch({account_id:account,slot:'tt2',run_date:'2026-10-24',version:1});good(same,200);
  assert.equal(same.data.id,pair.data.id);assert.equal(same.data.upsert_action,'unchanged');
});

test('unchanged PATCH is a genuine no-op; keyed no-op adds only a receipt and replay takes precedence over stale versions',async t=>{
  const app=await setup(t),body=draft({sample:{future:{enabled:true}}}),created=await app.patch(body);good(created,201);
  const before=await state(app),sameBody={...body,version:1};
  const same=await app.patch(sameBody);good(same,200);assert.equal(same.data.upsert_action,'unchanged');
  assert.deepEqual(await state(app),before);
  const receiptKey=key(),keyed=await app.patch(sameBody,{headers:{'Idempotency-Key':receiptKey}});good(keyed,200);
  assert.equal(keyed.data.upsert_action,'unchanged');
  const after=await state(app);assert.deepEqual(after.articles,before.articles);assert.deepEqual(after.audits,before.audits);
  assert.equal(after.revision,before.revision+1);assert.equal(after.receipts.length,before.receipts.length+1);
  const replay=await app.patch(sameBody,{headers:{'Idempotency-Key':receiptKey}});good(replay,200);assert.deepEqual(replay.data,keyed.data);
  assert.deepEqual(await state(app),after);
  const changed=await app.patch({...body,version:1,title:'后续真实变更'});good(changed,200);assert.equal(changed.data.version,2);
  const snapshot=await state(app),oldReceipt=await app.patch(sameBody,{headers:{'Idempotency-Key':receiptKey}});good(oldReceipt,200);
  assert.deepEqual(oldReceipt.data,keyed.data);assert.deepEqual(await state(app),snapshot);
  good(await app.patch({...sameBody,title:'同key不同内容'},{headers:{'Idempotency-Key':receiptKey}}),409);
  assert.deepEqual(await state(app),snapshot);
});

test('object JSON deep merges unknown keys, arrays replace, null clears; ordinary PUT remains whole-field replacement',async t=>{
  const app=await setup(t),body=draft({
    sample:{keep:{a:1,b:2},future:{opaque:true},nested_array:['old']},timings:{draft:{seconds:1,future:2}},
    reruns:{watchdog:0,writer:{attempts:1,keep:true}},draft_ref:{pgc_id:'0009007199254740993123456789',future:{a:1,b:2}},
    blockers:[{type:'old',unknown:'keep until replaced'}],verify_items:[{description:'old'}],
  });
  const created=await app.patch(body);good(created,201);
  const change=await app.patch({account_id:account,run_dir:body.run_dir,version:1,
    sample:{keep:{a:9},nested_array:['new']},timings:{draft:{seconds:3}},reruns:{writer:{attempts:2}},
    draft_ref:{future:{b:9}},blockers:[],verify_items:[{description:'new',extra:{ok:true}}]});good(change,200);
  assert.deepEqual(change.data.sample,{keep:{a:9,b:2},future:{opaque:true},nested_array:['new']});
  assert.deepEqual(change.data.timings,{draft:{seconds:3,future:2}});assert.deepEqual(change.data.reruns,{watchdog:0,writer:{attempts:2,keep:true}});
  assert.deepEqual(change.data.draft_ref,{pgc_id:'0009007199254740993123456789',future:{a:1,b:9}});
  assert.deepEqual(change.data.blockers,[]);assert.deepEqual(change.data.verify_items,[{description:'new',extra:{ok:true}}]);
  const ordinary=await app.api('/articles/'+created.data.id,{method:'PUT',body:{version:2,sample:{only:'PUT replaces'}}});good(ordinary,200);
  assert.deepEqual(ordinary.data.sample,{only:'PUT replaces'});assert.deepEqual(ordinary.data.draft_ref,change.data.draft_ref);
  const cleared=await app.patch({account_id:account,run_dir:body.run_dir,version:3,sample:null,timings:null,reruns:null,draft_ref:null,blockers:null,verify_items:null});good(cleared,200);
  for(const name of ['sample','timings','reruns','draft_ref','blockers','verify_items'])assert.equal(cleared.data[name],null);
});

test('post-merge byte/node limits and invalid depth/prototype/raw JSON are rejected without partial updates',async t=>{
  const app=await setup(t),body=draft({sample:{old:'x'.repeat(30000)}}),created=await app.patch(body);good(created,201);
  let before=await state(app);
  const overflowing=await worker.fetch(new Request(app.origin+'/api/v1/articles',{method:'PATCH',headers:{
    'Content-Type':'application/json',Cookie:app.session.cookie,'X-CSRF-Token':app.session.csrfToken,Origin:app.origin,
  },body:'{"account_id":"'+account+'","run_dir":"Synthetic/Overflow","title":"synthetic","sample":{"future":1e400}}'}),app.env);
  assert.equal(overflowing.status,400);assert.deepEqual(await state(app),before);
  good(await app.patch({account_id:account,run_dir:body.run_dir,version:1,sample:{incoming:'y'.repeat(40000)}}),400);
  assert.deepEqual(await state(app),before);
  const many=draft({sample:Object.fromEntries(Array.from({length:2100},(_,i)=>['old_'+i,0]))}),otherCreated=await app.patch(many);good(otherCreated,201);
  before=await state(app);
  good(await app.patch({account_id:account,run_dir:many.run_dir,version:1,sample:Object.fromEntries(Array.from({length:2100},(_,i)=>['new_'+i,0]))}),400);
  assert.deepEqual(await state(app),before);
  let deep={leaf:1};for(let i=0;i<13;i++)deep={nested:deep};
  for(const extra of [{sample:deep},{sample:JSON.parse('{"__proto__":{"polluted":true}}')},
    {sample:{safe:{constructor:{prototype:{polluted:true}}}}},{draft_ref:{pgc_id:9007199254740992}},
    {sample_json:'{}'},{blockers:[null]}]) {
    good(await app.patch({account_id:account,run_dir:body.run_dir,version:1,...extra}),400);
    assert.deepEqual(await state(app),before);
  }
  assert.equal({}.polluted,undefined);
});

test('dual-key conflicts, changed established identities and account mismatch are atomic; missing identity components may be added safely',async t=>{
  const app=await setup(t),a=draft({slot:'tt1',run_date:'2026-10-24'}),b=draft({slot:'tt2',run_date:'2026-10-24'});
  good(await app.patch(a),201);good(await app.patch(b),201);const before=await state(app);
  for(const body of [{account_id:account,run_dir:a.run_dir,slot:b.slot,run_date:b.run_date,version:1},
    {account_id:other,run_dir:a.run_dir,version:1},
    {account_id:account,run_dir:a.run_dir,slot:'tt3',run_date:a.run_date,version:1},
    {account_id:account,run_dir:'Synthetic/Different',slot:a.slot,run_date:a.run_date,version:1}]) {
    good(await app.patch(body),409);assert.deepEqual(await state(app),before);
  }
  const missing=draft(),single=await app.patch(missing);good(single,201);
  const blocked=await state(app);
  good(await app.patch({account_id:account,run_dir:missing.run_dir,slot:a.slot,run_date:a.run_date,version:1}),409);
  assert.deepEqual(await state(app),blocked);
  const filled=await app.patch({account_id:account,run_dir:missing.run_dir,slot:'tt3',run_date:'2026-10-25',version:1});good(filled,200);
  assert.equal(filled.data.id,single.data.id);assert.equal(filled.data.slot,'tt3');assert.equal(filled.data.version,2);
});

test('a successful commit followed by lost response is read back by filters and same-key replay never double-writes',async t=>{
  const app=await setup(t),body=draft({slot:'tt1',run_date:'2026-10-24',version:0}),receiptKey=key();let commits=0;
  const fault={prepare:app.db.prepare.bind(app.db),async batch(statements){
    commits++;const result=await app.db.batch(statements);if(commits===1)throw Error('SYNTHETIC-COMMIT-RESPONSE-LOST');return result;
  }};
  const lost=await app.patch(body,{db:fault,headers:{'Idempotency-Key':receiptKey}});good(lost,500);assert.equal(commits,1);
  const read=await app.api('/articles?status=draft_saved&slot=tt1&account_id='+account);good(read,200);
  assert.equal(read.data.length,1);assert.equal(read.data[0].run_dir,body.run_dir);assert.equal(read.data[0].version,1);
  const before=await state(app),replay=await app.patch(body,{headers:{'Idempotency-Key':receiptKey}});good(replay,201);
  assert.equal(replay.data.id,read.data[0].id);assert.equal(replay.data.upsert_action,'created');assert.deepEqual(await state(app),before);
  assert.equal(before.articles.length,1);assert.equal(before.audits.length,1);assert.equal(before.receipts.length,1);
});

test('twenty concurrent creates/updates and twenty real D1 revision conflicts each commit at most one business change',async t=>{
  const app=await setup(t),body=draft({version:0});
  const created=await Promise.all(Array.from({length:20},()=>app.patch(body,{headers:{'Idempotency-Key':key()}})));
  assert.equal(created.filter(r=>r.status===201).length,1);assert.equal(created.filter(r=>r.status===409).length,19);
  const first=created.find(r=>r.status===201).data,before=await state(app);
  const updates=await Promise.all(Array.from({length:20},(_,i)=>app.patch({account_id:account,run_dir:body.run_dir,version:1,title:'并发候选 '+i})));
  assert.equal(updates.filter(r=>r.status===200).length,1);assert.equal(updates.filter(r=>r.status===409).length,19);
  const changed=await state(app);assert.equal(changed.articles.length,1);assert.equal(changed.articles[0].version,2);assert.equal(changed.audits.length,before.audits.length+1);
  assert.equal(changed.articles[0].id,first.id);
  const retriedBody=draft({version:0});let conflicts=0,batches=0;
  const racing={prepare:app.db.prepare.bind(app.db),async batch(statements){
    batches++;
    if(conflicts<20){conflicts++;await app.db.prepare('UPDATE matrix_control SET revision=revision+1 WHERE id=1').run();}
    return app.db.batch(statements);
  }};
  const previous=await state(app),retried=await app.patch(retriedBody,{db:racing,headers:{'Idempotency-Key':key()}});good(retried,201);
  assert.equal(conflicts,20);assert.equal(batches,21);
  const after=await state(app);assert.equal(after.articles.length,previous.articles.length+1);assert.equal(after.audits.length,previous.audits.length+1);
  assert.equal(after.receipts.length,previous.receipts.length+1);assert.equal(after.revision,previous.revision+21);
});

test('strict filters count all matches before paging, keep nullable sorting stable, and respect account scope',async t=>{
  const app=await setup(t),rows=[];
  for(let n=9;n<=13;n++) {
    const created=await app.patch(draft({slot:'tt1',run_date:'2026-10-'+String(n).padStart(2,'0'),writer:'dedao',series_no:n,
      title:'文'.repeat(25),char_count:2236,subheading_count:5,image_count:25,draft_ref:{pgc_id:'synthetic-'+n}}));good(created,201);rows.push(created.data);
  }
  const warn=await app.patch(draft({slot:'tt2',run_date:'2026-10-24',writer:'human',title:'短',char_count:1,subheading_count:0,image_count:0}));good(warn,201);
  assert.ok(Array.isArray(warn.data.warnings)&&warn.data.warnings.length>0);
  const selected=rows.filter(r=>r.series_no>=10&&r.series_no<=12).map(r=>r.id).sort();
  for(const order of ['asc','desc']) {
    const query='/articles?status=draft_saved&slot=tt1&writer=dedao&has_warnings=false&series_no_min=10&series_no_max=12&sort=published_at&order='+order;
    const first=await app.api(query+'&page=1&page_size=2'),second=await app.api(query+'&page=2&page_size=2');good(first,200);good(second,200);
    assert.equal(first.meta.total,3);assert.equal(second.meta.total,3);assert.deepEqual([...ids(first.data),...ids(second.data)],selected);
  }
  const warningOnly=await app.api('/articles?status=draft_saved&has_warnings=true');good(warningOnly,200);assert.deepEqual(ids(warningOnly.data),[warn.data.id]);
  for(const name of ['has_warnings'])for(const value of ['TRUE','1','yes',''])good(await app.api('/articles?status=draft_saved&'+name+'='+value),400);
  for(const query of ['slot=unknown','writer=unknown','series_no_min=10.5','series_no_min=13&series_no_max=10',
    'has_warnings=true&has_warnings=false','slot=tt1&slot=tt2'])good(await app.api('/articles?status=draft_saved&'+query),400);
  const scoped=await app.api('/api-keys',{method:'POST',body:{name:'synthetic-filter-key',account_ids:[other],permissions:['read']}});good(scoped,201);
  const result=await app.api('/articles?status=draft_saved&slot=tt1&writer=dedao',{token:scoped.data.token});good(result,200);assert.deepEqual(result.data,[]);assert.equal(result.meta.total,0);
});

test('tt1_1024 synthetic draft has no warnings, coexists without URLs and never enters published statistics or due reviews',async t=>{
  const app=await setup(t),pub=await app.api('/articles',{method:'POST',body:published()});good(pub,201);assert.equal(pub.data.status,'published');
  const paths=['/dashboard','/overview?period=30d','/due-reviews'],before={};
  for(const path of paths){const response=await app.api(path);good(response,200);before[path]=response.data;}
  for(const [slot,dir] of [['tt1','Synthetic/tt1_1024'],['tt2','Synthetic/tt2_1024']]) {
    const result=await app.patch({account_id:account,run_dir:dir,slot,run_date:'2026-10-24',title:'文'.repeat(25),
      status:'draft_saved',writer:'dedao',char_count:2236,subheading_count:5,image_count:25,draft_ref:{pgc_id:'synthetic-'+slot}});good(result,201);
    assert.deepEqual(result.data.warnings,[]);assert.equal(result.data.url,null);assert.equal(result.data.published_at,null);
  }
  assert.equal((await app.api('/articles?status=draft_saved')).data.length,2);
  for(const path of paths){const response=await app.api(path);good(response,200);assert.deepEqual(response.data,before[path]);}
});

test('PATCH preserves session CSRF, Bearer permissions/account scope, public business ownership, and todo/private-note access',async t=>{
  const app=await setup(t),body=draft(),created=await app.patch(body);good(created,201);
  for(const headers of [{'X-CSRF-Token':null},{Origin:'https://foreign.invalid'}])good(await app.patch({...body,version:1,title:'不应保存'},{headers}),403);
  const read=await app.api('/api-keys',{method:'POST',body:{name:'synthetic-readonly',account_ids:[account],permissions:['read']}});good(read,201);
  good(await app.patch(draft(),{token:read.data.token}),403);
  const scoped=await app.api('/api-keys',{method:'POST',body:{name:'synthetic-write-other',account_ids:[other],permissions:['read','write']}});good(scoped,201);
  const before=await state(app);good(await app.patch({...body,version:1},{token:scoped.data.token}),403);
  assert.deepEqual((await state(app)).articles,before.articles);
  good(await app.patch({account_id:account,run_dir:body.run_dir,version:1,sample:{malformed:'ignored'}},{token:scoped.data.token}),403);
  const publicEnv={...app.env,PUBLIC_BUSINESS_MODE:'1',PUBLIC_BUSINESS_USER_ID:app.owner,PUBLIC_BUSINESS_ACCOUNT_IDS:JSON.stringify([account])};
  const anonymous={anonymous:true,settings:publicEnv,headers:{'X-Public-Business':'1'}};
  good(await app.patch(draft(),{anonymous:true,settings:publicEnv}),403);
  good(await app.patch(draft(),{...anonymous,headers:{Origin:'https://foreign.invalid','X-Public-Business':'1'}}),403);
  const publicCreated=await app.patch(draft(),anonymous);good(publicCreated,201);
  good(await app.patch(draft({account_id:other}),anonymous),404);
  const todo=await app.api('/todos',{...anonymous,method:'POST',body:{id:randomUUID(),date:'2026-10-24',text:'匿名待办仍可写'}});good(todo,201);
  const note=await app.api('/daily-notes/2026-10-24',{method:'PUT',body:{text:'碎碎念仍只限所有者写',version:0,save_id:randomUUID()}});good(note,200);
  const publicNote=await app.api('/daily-notes?date=2026-10-24',anonymous);good(publicNote,200);assert.equal(publicNote.data.text,'碎碎念仍只限所有者写');
  good(await app.api('/daily-notes/2026-10-24',{...anonymous,method:'PUT',body:{text:'拒绝匿名覆盖',version:1,save_id:randomUUID()}}),401);
});

test('a previously successful idempotency receipt cannot leak a cached article after its Bearer account scope is narrowed',async t=>{
  const app=await setup(t),issued=await app.api('/api-keys',{method:'POST',body:{name:'synthetic-narrowed',account_ids:[account],permissions:['read','write']}});good(issued,201);
  const token=issued.data.token,receiptKey=key(),body=draft({title:'SCOPE-SECRET-CANARY',version:0});
  const first=await app.patch(body,{token,headers:{'Idempotency-Key':receiptKey}});good(first,201);
  await app.db.batch([
    app.db.prepare('UPDATE matrix_api_keys SET account_ids_json=? WHERE id=?').bind(JSON.stringify([other]),issued.data.id),
    app.db.prepare('UPDATE matrix_control SET revision=revision+1 WHERE id=1'),
  ]);
  const before=await state(app),denied=await app.patch(body,{token,headers:{'Idempotency-Key':receiptKey}});good(denied,403);
  assert.ok(!denied.text.includes('SCOPE-SECRET-CANARY'));assert.ok(!denied.text.includes(first.data.id));
  assert.deepEqual(await state(app),before);
});

test('anonymous unchanged PATCH remains under the existing free write limiter and does not create audit/version churn',async t=>{
  const app=await setup(t),publicEnv={...app.env,PUBLIC_BUSINESS_MODE:'1',PUBLIC_BUSINESS_USER_ID:app.owner,PUBLIC_BUSINESS_ACCOUNT_IDS:JSON.stringify([account])};
  const originalNow=Date.now,fixed=Date.now();Date.now=()=>fixed;t.after(()=>{Date.now=originalNow;});
  const options={anonymous:true,settings:publicEnv,headers:{'X-Public-Business':'1'}},body=draft();
  const created=await app.patch(body,options);good(created,201);const before=await state(app);
  for(let i=0;i<19;i++){const response=await app.patch({...body,version:1},options);good(response,200);assert.equal(response.data.upsert_action,'unchanged');}
  const limited=await app.patch({...body,version:1},options);good(limited,429);assert.ok(limited.headers.get('Retry-After'));
  assert.deepEqual(await state(app),before);
});

test('verify_items uses strict done tri-state, preserves unknown data, and filters totals/index before pagination',async t=>{
  const app=await setup(t),cases=[
    {items:null,state:'unknown',pending:null},
    {items:[],state:'complete',pending:false},
    {items:[{done:true,future:{done:false}},{done:true,label:'已核验'}],state:'complete',pending:false},
    {items:[{done:true},{done:false}],state:'pending',pending:true},
    {items:[{done:false,unknown:{keep:'原文'}},{done:'true'}],state:'pending',pending:true},
    {items:[{done:'false'},{done:1},{done:0},{done:null},{future:'没有done字段'}],state:'unknown',pending:null},
  ];
  for(const entry of cases) {
    const body=draft({verify_items:entry.items,draft_ref:{pgc_id:'synthetic-verified'}}),response=await app.patch(body);good(response,201);
    entry.article=response.data;entry.body=body;
    assert.equal(response.data.verify_state,entry.state);assert.equal(response.data.has_pending_verify,entry.pending);
    assert.deepEqual(response.data.verify_items,entry.items,'unknown done values must remain unchanged');
    const detail=await app.api('/articles/'+response.data.id);good(detail,200);
    assert.equal(detail.data.verify_state,entry.state);assert.equal(detail.data.has_pending_verify,entry.pending);assert.deepEqual(detail.data.verify_items,entry.items);
    const raw=await app.db.prepare('SELECT verify_items_json FROM matrix_articles WHERE id=?').bind(response.data.id).first();
    assert.deepEqual(raw.verify_items_json===null?null:JSON.parse(raw.verify_items_json),entry.items);
  }
  for(const pending of [true,false]) {
    const expected=cases.filter(c=>c.pending===pending).map(c=>c.article.id).sort(),actual=[];
    for(let page=1;page<=expected.length;page++) {
      const response=await app.api('/articles?status=draft_saved&has_pending_verify='+pending+'&page='+page+'&page_size=1');good(response,200);
      assert.equal(response.meta.total,expected.length);actual.push(...ids(response.data));
      assert.ok(response.data.every(row=>row.has_pending_verify===pending));
    }
    assert.deepEqual(actual,expected,'unknown rows must not become false matches');
    const index=await app.api('/articles?status=draft_saved&has_pending_verify='+pending+'&fields=index');good(index,200);
    assert.deepEqual(ids(index.data),expected);assert.equal(index.meta.total,expected.length);
    for(const row of index.data)assert.deepEqual(Object.keys(row).sort(),['account_id','id','platform','published_at','title']);
  }
  for(const value of ['TRUE','1','0','null',''])good(await app.api('/articles?status=draft_saved&has_pending_verify='+value),400);
  good(await app.api('/articles?status=draft_saved&has_pending_verify=true&has_pending_verify=false'),400);
  const target=cases[3],updated=await app.patch({account_id:account,run_dir:target.body.run_dir,version:1,
    sample:{verification:{done:false,opaque:'preserve'}},verify_items:[{done:false,old_array_field:true}]});good(updated,200);
  const complete=await app.patch({account_id:account,run_dir:target.body.run_dir,version:2,
    sample:{verification:{done:true}},verify_items:[{done:true}]});good(complete,200);
  assert.deepEqual(complete.data.sample,{verification:{done:true,opaque:'preserve'}});assert.deepEqual(complete.data.verify_items,[{done:true}]);
  assert.equal(complete.data.verify_state,'complete');assert.equal(complete.data.has_pending_verify,false);
  const replaced=await app.api('/articles/'+target.article.id,{method:'PUT',body:{version:3,sample:{only:'PUT replacement'},verify_items:[{future:'unknown'}]}});good(replaced,200);
  assert.deepEqual(replaced.data.sample,{only:'PUT replacement'});assert.deepEqual(replaced.data.verify_items,[{future:'unknown'}]);
  assert.equal(replaced.data.verify_state,'unknown');assert.equal(replaced.data.has_pending_verify,null);
  const cleared=await app.patch({account_id:account,run_dir:target.body.run_dir,version:4,verify_items:null});good(cleared,200);
  assert.equal(cleared.data.verify_items,null);assert.equal(cleared.data.verify_state,'unknown');assert.equal(cleared.data.has_pending_verify,null);
});

test('draft_saved credentials are platform-specific metadata warnings; editor_url is canonical, syntax-only and never guessed from unknown keys',async t=>{
  const app=await setup(t),missing='DRAFT_CREDENTIAL_MISSING',pgc='0009007199254740993123456789';
  const otherCreated=await app.api('/accounts',{method:'POST',body:{platform:'other',name:'synthetic-other-platform'}});good(otherCreated,201);
  const platforms=[
    {account_id:account,valid:{pgc_id:pgc},wrong:{appmsgid:'synthetic-wrong-platform',editor_url:'https://example.invalid/editor'}},
    {account_id:'wechat-xiaoyuer',valid:{appmsgid:pgc},wrong:{pgc_id:pgc,editor_url:'https://example.invalid/editor'}},
    {account_id:other,valid:{editor_url:'https://zhuanlan.zhihu.com/p/123456/edit'},wrong:{url:'https://zhuanlan.zhihu.com/p/123456/edit',pgc_id:pgc}},
    {account_id:otherCreated.data.id,valid:{editor_url:'https://example.invalid/other-draft'},wrong:{url:'https://example.invalid/other-draft'}},
  ];
  const expectedMissing=[],expectedValid=[];
  for(const platform of platforms) {
    const saved=await app.patch(draft({account_id:platform.account_id,draft_ref:platform.valid}));good(saved,201);
    assert.ok(!saved.data.warnings.includes(missing));assert.deepEqual(saved.data.draft_ref,platform.valid);expectedValid.push(saved.data.id);
    for(const ref of [null,{},platform.wrong]) {
      const absent=await app.patch(draft({account_id:platform.account_id,draft_ref:ref}));good(absent,201);
      assert.ok(absent.data.warnings.includes(missing));assert.deepEqual(absent.data.draft_ref,ref);expectedMissing.push(absent.data.id);
    }
  }
  for(const editor_url of ['javascript:alert(1)','data:text/plain,synthetic','   ',
    'https://user:pass@example.invalid/draft','https://example.invalid/draft\npath']) {
    const unsafe=await app.patch(draft({account_id:other,draft_ref:{editor_url,future:{keep:true}}}));good(unsafe,201);
    assert.ok(unsafe.data.warnings.includes(missing));assert.deepEqual(unsafe.data.draft_ref,{editor_url,future:{keep:true}});
    expectedMissing.push(unsafe.data.id);
  }
  for(const [account_id,ref] of [[account,{pgc_id:'   '}],['wechat-xiaoyuer',{appmsgid:''}]]) {
    const empty=await app.patch(draft({account_id,draft_ref:ref}));good(empty,201);
    assert.ok(empty.data.warnings.includes(missing));expectedMissing.push(empty.data.id);
  }
  const warningRows=await app.api('/articles?status=draft_saved&has_warnings=true&page_size=100');good(warningRows,200);
  assert.deepEqual(ids(warningRows.data).sort(),expectedMissing.sort());assert.equal(warningRows.meta.total,expectedMissing.length);
  const validRows=await app.api('/articles?status=draft_saved&has_warnings=false&page_size=100');good(validRows,200);
  assert.deepEqual(ids(validRows.data).sort(),expectedValid.sort());assert.equal(validRows.meta.total,expectedValid.length);
  for(const status of ['drafting','illustrated','failed']) {
    const beforeSave=await app.patch(draft({status,draft_ref:null}));good(beforeSave,201);assert.ok(!beforeSave.data.warnings.includes(missing));
  }
  const legacy=await app.api('/articles',{method:'POST',body:published()});good(legacy,201);assert.ok(!legacy.data.warnings.includes(missing));
  const original=draft({draft_ref:{future:{opaque:'retained'},url:'https://example.invalid/not-canonical'}}),first=await app.patch(original);good(first,201);
  assert.ok(first.data.warnings.includes(missing));
  const fixed=await app.patch({account_id:account,run_dir:original.run_dir,version:1,draft_ref:{pgc_id:pgc}});good(fixed,200);
  assert.equal(fixed.data.draft_ref.pgc_id,pgc);assert.deepEqual(fixed.data.draft_ref.future,{opaque:'retained'});assert.ok(!fixed.data.warnings.includes(missing));
  const replaced=await app.api('/articles/'+first.data.id,{method:'PUT',body:{version:2,draft_ref:{url:'https://example.invalid/not-canonical'}}});good(replaced,200);
  assert.deepEqual(replaced.data.draft_ref,{url:'https://example.invalid/not-canonical'});assert.ok(replaced.data.warnings.includes(missing));
});
