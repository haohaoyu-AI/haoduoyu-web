import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {applyImportBatch,validateImportOrigin,importIdempotencyKey,ImportApplyError} from '../scripts/article-import/apply.mjs';
import {ARTICLE_PIPELINE_ENUMS} from '../src/article-pipeline-fields.mjs';

const origin='https://synthetic-import.invalid',token='Synthetic-import-test-token-only';
const account='toutiao-haoduoyu',other='zhihu-haoduoyu';
const clone=value=>structuredClone(value);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function merge(previous,incoming) {
  const result=object(previous)?clone(previous):{};
  for(const [key,value]of Object.entries(incoming))result[key]=object(value)?merge(result[key],value):clone(value);
  return result;
}
function article(extra={}) {
  return {id:randomUUID(),account_id:account,status:'draft_saved',version:1,title:'Synthetic tt1 title',run_dir:'Synthetic/tt1_1024',
    slot:'tt1',run_date:'2026-10-24',url:null,published_at:null,started_at:null,production_mode:'unknown',platform_article_id:null,
    summary:'',notes:'',series_no:null,writer:'dedao',illustrator:'codex',sample:null,char_count:2236,subheading_count:5,
    image_count:25,cover_desc:null,draft_ref:{pgc_id:'7699934907375567402'},timings:null,reruns:null,blockers:null,verify_items:null,...extra};
}
const proposal=(extra={})=>({entry_id:'Synthetic/tt1_1024',record:{account_id:account,title:'Synthetic tt1 title',run_dir:'Synthetic/tt1_1024',
  slot:'tt1',run_date:'2026-10-24',status:'draft_saved',writer:'dedao',illustrator:'codex',char_count:2236,
  subheading_count:5,image_count:25,draft_ref:{pgc_id:'7699934907375567402'},...extra}});
const json=(data,status=200)=>Response.json(data,{status});
function service(initial=[],options={}) {
  const rows=clone(initial),calls=[],receipts=new Map();let sequence=0;
  const fetchImpl=async(input,init={})=>{
    const url=new URL(input),method=init.method||'GET',headers=new Headers(init.headers);
    calls.push({url,method,headers,body:init.body});
    assert.equal(url.origin,origin);assert.equal(headers.get('Authorization'),'Bearer '+token);assert.equal(init.redirect,'manual');
    assert.equal(url.searchParams.has('token'),false);
    if(options.intercept){const result=await options.intercept({url,method,headers,init,rows,calls});if(result!==undefined)return result;}
    if(method==='GET'&&url.pathname==='/api/v1/articles') {
      const a=url.searchParams.get('account_id'),status=url.searchParams.get('status'),page=Number(url.searchParams.get('page')),
        size=Number(url.searchParams.get('page_size')),all=rows.filter(row=>row.account_id===a&&row.status===status),offset=(page-1)*size;
      const result={data:clone(all.slice(offset,offset+size)),meta:{total:all.length,page,page_size:size,offset,has_more:offset+size<all.length}};
      return options.listResponse?options.listResponse(result,{url,rows,calls}):json(result);
    }
    if(method==='GET'&&url.pathname.startsWith('/api/v1/articles/')) {
      const id=decodeURIComponent(url.pathname.slice('/api/v1/articles/'.length));
      return rows.some(row=>row.id===id)?json({data:clone(rows.find(row=>row.id===id))}):json({error:{code:'NOT_FOUND'}},404);
    }
    assert.equal(method,'PATCH');assert.equal(url.pathname,'/api/v1/articles');
    const body=JSON.parse(init.body),key=headers.get('Idempotency-Key');assert.match(key,/^hdy-import-[0-9a-f]{64}$/);
    if(receipts.has(key))return json(clone(receipts.get(key).value),receipts.get(key).status);
    const dir=body.run_dir!=null?rows.find(row=>row.run_dir===body.run_dir):null;
    const pair=body.slot!=null&&body.run_date!=null?rows.find(row=>row.slot===body.slot&&row.run_date===body.run_date):null;
    let current=dir||pair;
    if(dir&&pair&&dir.id!==pair.id||current&&current.account_id!==body.account_id)return json({error:{code:'CONFLICT'}},409);
    if(current&&body.version!==current.version)return json({error:{code:'VERSION_CONFLICT'}},409);
    if(!current&&body.version!==0)return json({error:{code:'VERSION_CONFLICT'}},409);
    const created=!current;
    if(created){current=article({id:'00000000-0000-4000-8000-'+String(++sequence).padStart(12,'0'),account_id:body.account_id,
      run_dir:null,slot:null,run_date:null,title:body.title,status:body.status||'draft_saved'});rows.push(current);}
    for(const [name,value]of Object.entries(body))if(!['id','version'].includes(name))
      current[name]=['sample','draft_ref','timings','reruns'].includes(name)&&object(value)?merge(current[name],value):clone(value);
    if(current.series_no===null&&!Object.hasOwn(body,'series_no')) {
      const match=/【保险200篇·第(\d+)篇】/.exec(current.title||'');
      if(match)current.series_no=Number(match[1]);
    }
    if(!created)current.version++;
    if(current.timings?.finished_at)current.timings.finished_at=new Date(current.timings.finished_at).toISOString();
    const status=created?201:200,value={data:{...clone(current),upsert_action:created?'created':'updated'}};
    receipts.set(key,{status,value:clone(value)});
    if(options.afterCommit)return options.afterCommit({status,value,rows,calls});
    return json(value,status);
  };
  return {rows,calls,fetchImpl,patches:()=>calls.filter(row=>row.method==='PATCH')};
}
const run=(mock,proposals,extra={})=>applyImportBatch({origin,token,proposals,fetchImpl:mock.fetchImpl,...extra});

test('origins, lower-only limits and proposals are explicit; invalid inputs cannot trigger network calls',async()=>{
  assert.equal(validateImportOrigin(origin),origin);
  for(const value of ['http://synthetic-import.invalid',origin+'/',origin+'/path',origin+'?x=1',
    'https://user:password@synthetic-import.invalid','https://synthetic-import.invalid/#fragment',' '+origin])
    assert.throws(()=>validateImportOrigin(value),error=>error instanceof ImportApplyError&&error.code==='INVALID_ORIGIN');
  assert.equal(validateImportOrigin('http://127.0.0.1:1234',{allowLoopbackHttp:true}),'http://127.0.0.1:1234');
  assert.throws(()=>validateImportOrigin('http://example.invalid',{allowLoopbackHttp:true}));
  const mock=service();
  await assert.rejects(()=>run(mock,[],{limits:{maxRequests:1001}}),error=>error.code==='INVALID_LIMITS');
  const result=await run(mock,[proposal({article:'not a ledger field'}),proposal({run_dir:'../escape'}),proposal({slot:'tt1',run_date:null})]);
  assert.equal(result.summary.failed,3);assert.equal(mock.calls.length,0);assert.equal(result.writes,0);
});

test('synthetic tt1_1024 creation has exact string IDs and repeated batches skip without another PATCH',async()=>{
  const mock=service(),input=proposal(),before=clone(input);
  const first=await run(mock,[input]);assert.equal(first.results[0].action,'created');assert.equal(first.writes,1);
  assert.equal(mock.rows[0].draft_ref.pgc_id,'7699934907375567402');assert.equal(typeof mock.rows[0].draft_ref.pgc_id,'string');
  assert.deepEqual(input,before);assert.equal(JSON.parse(mock.patches()[0].body).version,0);
  const second=await run(mock,[input]);assert.equal(second.results[0].action,'skipped');assert.equal(second.writes,0);
  assert.equal(mock.patches().length,1);assert.equal(mock.rows.length,1);
  assert.deepEqual(new Set(mock.calls.filter(row=>row.method==='GET'&&row.url.search).map(row=>row.url.searchParams.get('status'))),new Set(ARTICLE_PIPELINE_ENUMS.status));
  const key=importIdempotencyKey(origin,{...input.record,series_no:null},{version:0});
  assert.equal(key,mock.patches()[0].headers.get('Idempotency-Key'));
  assert.notEqual(key,importIdempotencyKey('https://other.invalid',input.record,{version:0}));
  assert.notEqual(key,importIdempotencyKey(origin,input.record,{id:mock.rows[0].id,version:1}));
});

test('unparsed series numbers remain omitted in proposals and cannot be inferred or clear a known current value',async()=>{
  const title='【保险200篇·第109篇】合成台账',input=proposal({title}),mock=service();
  assert.equal(Object.hasOwn(input.record,'series_no'),false);
  const first=await run(mock,[input]);assert.equal(first.results[0].action,'created');
  const sent=JSON.parse(mock.patches()[0].body);
  assert.equal(sent.series_no,null);assert.equal(mock.rows[0].series_no,null);
  assert.equal(Object.hasOwn(input.record,'series_no'),false);
  const sentRecord=Object.fromEntries(Object.entries(sent).filter(([name])=>!['id','version'].includes(name)));
  assert.equal(mock.patches()[0].headers.get('Idempotency-Key'),importIdempotencyKey(origin,sentRecord,{version:0}));
  for(const known of [null,77]) {
    const current=article({title,series_no:known,notes:'old'}),existing=service([current]),change=proposal({title,notes:'new'});
    change.expected={id:current.id,version:1,fields:{notes:'old'}};
    const result=await run(existing,[change]);assert.equal(result.results[0].action,'updated');
    const patch=JSON.parse(existing.patches()[0].body);
    assert.equal(Object.hasOwn(patch,'series_no'),known===null);
    if(known===null)assert.equal(patch.series_no,null);
    assert.equal(existing.rows[0].series_no,known);
    assert.equal(Object.hasOwn(change.record,'series_no'),false);
  }
});

test('existing differences never overwrite manual data; a complete explicit baseline allows CAS merge only',async()=>{
  const current=article({sample:{keep:{manual:true,source:'old'}},notes:'manual note'}),mock=service([current]);
  const update=proposal({sample:{keep:{source:'new'}}});
  const absent=await run(mock,[update]);assert.equal(absent.results[0].code,'EXISTING_DIFFERENCE');assert.equal(absent.writes,0);
  const partial={...clone(update),expected:{id:current.id,version:1,fields:{sample:{keep:{source:'old'}}}}};
  assert.equal((await run(mock,[partial])).results[0].code,'BASELINE_CHANGED');
  const missing={...clone(update),expected:{id:current.id,version:1,fields:{notes:'manual note'}}};
  assert.equal((await run(mock,[missing])).results[0].code,'BASELINE_INCOMPLETE');
  const confirmed={...clone(update),expected:{id:current.id,version:1,fields:{sample:clone(current.sample)}}};
  const applied=await run(mock,[confirmed]);assert.equal(applied.results[0].action,'updated');assert.equal(mock.rows[0].version,2);
  assert.deepEqual(mock.rows[0].sample,{keep:{manual:true,source:'new'}});assert.equal(mock.rows[0].notes,'manual note');
  assert.equal(JSON.parse(mock.patches()[0].body).version,1);
});

test('arrays replace and nested null remains literal; merged JSON budgets are checked before writing',async()=>{
  const current=article({sample:{future:{manual:true,nested:'old'}},verify_items:[{done:false}]}),mock=service([current]);
  const input=proposal({sample:{future:{nested:null}},verify_items:[]});
  input.expected={id:current.id,version:1,fields:{sample:clone(current.sample),verify_items:clone(current.verify_items)}};
  const result=await run(mock,[input]);assert.equal(result.results[0].action,'updated');
  assert.deepEqual(mock.rows[0].sample,{future:{manual:true,nested:null}});assert.deepEqual(mock.rows[0].verify_items,[]);
  const large=article({sample:{old:'x'.repeat(40000)}}),limited=service([large]),overflow=proposal({sample:{incoming:'y'.repeat(40000)}});
  overflow.expected={id:large.id,version:1,fields:{sample:clone(large.sample)}};
  const failed=await run(limited,[overflow]);assert.equal(failed.results[0].action,'failed');assert.equal(failed.writes,0);
});

test('global duplicate identities, dual-key disagreement and cross-account data fail without PATCH',async()=>{
  for(const records of [
    [proposal(),proposal({account_id:other,title:'different account'})],
    [proposal(),proposal({title:'different content'})],
  ]) {
    const mock=service(),result=await run(mock,records);
    assert.equal(result.summary.conflict,2);assert.equal(mock.calls.length,0);assert.equal(result.writes,0);
  }
  const a=article({slot:'tt2'}),b=article({run_dir:'Synthetic/Other',slot:'tt1'}),mock=service([a,b]);
  assert.equal((await run(mock,[proposal()])).results[0].code,'IDENTITY_CONFLICT');assert.equal(mock.patches().length,0);
  const denied=service([],{listResponse:value=>json({...value,data:value.data.length?value.data:[article({account_id:other})],
    meta:{...value.meta,total:1,has_more:false}})});
  const result=await run(denied,[proposal()]);assert.equal(result.results[0].code,'INVALID_REMOTE_DATA');assert.equal(denied.patches().length,0);
});

test('identical duplicate inputs are one logical action and partial validation failures do not block other identities',async()=>{
  const mock=service(),input=proposal();
  const result=await run(mock,[input,clone(input),proposal({run_dir:'../invalid'})]);
  assert.deepEqual(result.results.map(row=>row.action),['created','skipped','failed']);
  assert.equal(result.results[1].code,'DUPLICATE_INPUT');assert.equal(mock.patches().length,1);
});

test('pagination validates complete totals and all statuses; malformed or oversized reads never lead to writes',async()=>{
  const rows=[article({run_dir:'Synthetic/Old1',slot:null,run_date:null}),article({run_dir:'Synthetic/Old2',slot:null,run_date:null}),article({run_dir:'Synthetic/Old3',slot:null,run_date:null})];
  const mock=service(rows);const result=await run(mock,[proposal()],{limits:{pageSize:2}});
  assert.equal(result.results[0].action,'created');assert.equal(mock.calls.filter(row=>row.url.searchParams.get('status')==='draft_saved').length,2);
  for(const alter of [
    result=>({...result,meta:{...result.meta,total:result.meta.total+1}}),
    result=>({...result,meta:{...result.meta,has_more:true}}),
    result=>({...result,meta:{...result.meta,offset:1}}),
  ]) {
    const bad=service([],{listResponse:value=>json(alter(value))});
    assert.equal((await run(bad,[proposal()])).results[0].action,'failed');assert.equal(bad.patches().length,0);
  }
  const huge=service([],{listResponse:()=>new Response('x'.repeat(300),{headers:{'Content-Type':'application/json'}})});
  assert.equal((await run(huge,[proposal()],{limits:{maxResponseBytes:100}})).results[0].code,'RESPONSE_LIMIT');
  assert.equal(huge.patches().length,0);
});

test('a CAS conflict stops that row rather than reading a new version and overwriting it',async()=>{
  const current=article({notes:'old'}),mock=service([current],{intercept:({method,rows})=>{
    if(method==='PATCH'){rows[0].notes='manual concurrent edit';rows[0].version++;return json({error:{code:'VERSION_CONFLICT'}},409);}
  }}),input=proposal({notes:'imported'});
  input.expected={id:current.id,version:1,fields:{notes:'old'}};
  const result=await run(mock,[input]);assert.equal(result.results[0].action,'conflict');assert.equal(result.results[0].code,'REMOTE_CONFLICT');
  assert.equal(mock.patches().length,1);assert.equal(mock.rows[0].notes,'manual concurrent edit');
});

test('unknown commit outcomes use read-only verification exactly once and never retry a PATCH',async()=>{
  for(const mode of ['throw-after-commit','server-error-after-commit','invalid-success-body']) {
    const mock=service([],{afterCommit:({status})=>{
      if(mode==='throw-after-commit')throw new Error('Sensitive server string '+token);
      if(mode==='server-error-after-commit')return new Response(token,{status:503});
      return new Response(token,{status,headers:{'Content-Type':'application/json'}});
    }});
    const result=await run(mock,[proposal()]);assert.equal(result.results[0].action,'verified_unknown',mode);
    assert.equal(result.results[0].delivery,'unconfirmed');assert.equal(result.results[0].verification,'business_state_matches');
    assert.equal(mock.patches().length,1);assert.equal(result.writes,1);assert.equal(JSON.stringify(result).includes(token),false);
  }
  const none=service([],{intercept:({method})=>{if(method==='PATCH')throw new Error(token);}});
  const second=proposal({run_dir:'Synthetic/Second',slot:'tt2'});second.entry_id='Synthetic/Second';
  const pending=await run(none,[proposal(),second]);assert.deepEqual(pending.results.map(row=>row.action),['pending','not_attempted']);
  assert.equal(none.patches().length,1);
});

test('auth denial, redirects and rate limiting halt without following or retrying credentialed requests',async()=>{
  for(const status of [401,403,302,429]) {
    const mock=service([],{intercept:()=>new Response(token,{status,headers:status===302?{Location:'https://other.invalid'}:{}})});
    const second=proposal({run_dir:'Synthetic/Second',slot:'tt2'});second.entry_id='Synthetic/Second';
    const result=await run(mock,[proposal(),second]);assert.equal(mock.calls.length,1,status);
    assert.equal(result.results[0].action,'failed');assert.equal(result.results[1].action,'not_attempted');
    assert.equal(JSON.stringify(result).includes(token),false);assert.equal(result.writes,0);
  }
});

test('successful responses must match identity, version and intended business fields before success is reported',async()=>{
  const mock=service([],{afterCommit:({status,value})=>json({data:{...value.data,char_count:999}},status)});
  const result=await run(mock,[proposal()]);assert.equal(result.results[0].action,'verified_unknown');assert.equal(mock.patches().length,1);
  const current=article(),changing=service([current],{intercept:({url,method,rows})=>{
    if(method==='GET'&&url.pathname.endsWith('/'+current.id))rows[0].run_dir='Synthetic/ManuallyChanged';
  }});
  const conflict=await run(changing,[proposal()]);assert.equal(conflict.results[0].code,'IDENTITY_CONFLICT');assert.equal(changing.patches().length,0);
});

test('request limits and remote error text are sanitized without exposing tokens or response bodies',async()=>{
  const mock=service();const limited=await run(mock,[proposal()],{limits:{maxRequests:2}});
  assert.equal(limited.results[0].code,'REQUEST_LIMIT');assert.equal(mock.patches().length,0);
  const invalid=service([],{intercept:()=>new Response('PRIVATE manuscript '+token,{headers:{'Content-Type':'application/json'}})});
  const result=await run(invalid,[proposal()]);assert.equal(result.results[0].code,'INVALID_RESPONSE');
  assert.equal(JSON.stringify(result).includes(token),false);assert.equal(JSON.stringify(result).includes('PRIVATE manuscript'),false);
});
