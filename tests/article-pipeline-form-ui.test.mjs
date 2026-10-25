import test from 'node:test';
import assert from 'node:assert/strict';
import {articleFormCurrent,articleFormRecord,buildArticleFormPayload,saveArticleForm} from '../web/pages/article-form.mjs';
import {runtime} from '../web/core/state.mjs';

const data=extra=>({account_id:'synthetic-account',title:'合成文章',status:'draft_saved',url:'',published_at:'',started_at:'',
  production_mode:'',summary:'',notes:'',platform_article_id:'',slot:'',writer:'',illustrator:'',run_dir:'',run_date:'',series_no:'',
  char_count:'',subheading_count:'',image_count:'',draft_pgc_id:'',draft_appmsgid:'',draft_editor_url:'',finished_at:'',...extra});
function binding(record={status:'draft_saved'}) {
  runtime.sessionEpoch=42;runtime.modalRequestVersion=17;
  const cache={record:structuredClone(record),sessionEpoch:42,ticket:17};runtime.articleFormRecord=cache;
  return {cache,form:{isConnected:true,dataset:{id:record.id||'',version:String(record.version||'')}}};
}
const article=extra=>({id:'synthetic-article',version:3,status:'draft_saved',...extra});
const saved=(body,id='synthetic-created')=>({...structuredClone(body),id,version:(body.version||0)+1});
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};

test('draft maps all existing fields, preserves null versus zero, and keeps opaque credentials as strings',()=>{
  const body=buildArticleFormPayload(data({slot:'tt1',writer:'dedao',illustrator:'codex',run_dir:'runs/tt1_1024',run_date:'2026-10-24',
    char_count:'0',subheading_count:'5',image_count:'25',draft_pgc_id:'0009007199254740993123456789',
    draft_appmsgid:'00001234567890',draft_editor_url:'https://example.invalid/edit',finished_at:'2026-10-24T09:30'}));
  assert.equal(body.status,'draft_saved');assert.equal(body.production_mode,'unknown');
  assert.equal(body.url,null);assert.equal(body.published_at,null);assert.equal(body.series_no,null);
  assert.equal(body.char_count,0);assert.equal(body.subheading_count,5);assert.equal(body.image_count,25);
  assert.equal(body.slot,'tt1');assert.equal(body.writer,'dedao');assert.equal(body.illustrator,'codex');
  assert.equal(body.run_dir,'runs/tt1_1024');assert.equal(body.run_date,'2026-10-24');
  assert.equal(body.draft_ref.pgc_id,'0009007199254740993123456789');assert.equal(body.draft_ref.appmsgid,'00001234567890');
  assert.equal(body.timings.finished_at,'2026-10-24T01:30:00.000Z');
  for(const field of ['char_count','subheading_count','image_count'])assert.equal(buildArticleFormPayload(data())[field],null);
  assert.equal(buildArticleFormPayload(data()).draft_ref,null);assert.equal(buildArticleFormPayload(data()).timings,null);
  assert.equal(buildArticleFormPayload(data()).platform_article_id,null);
});

test('nullable integer inputs reject invalid values and status must be explicitly selected',()=>{
  for(const field of ['series_no','char_count','subheading_count','image_count']) {
    for(const value of ['-1','1.5','9007199254740992','Infinity','1e3','not-a-number']) {
      assert.throws(()=>buildArticleFormPayload(data({[field]:value})),/整数/);
    }
  }
  assert.throws(()=>buildArticleFormPayload(data({series_no:'0'})),/正整数/);
  for(const status of ['',null,'archived'])assert.throws(()=>buildArticleFormPayload(data({status})),/状态/);
  assert.equal(buildArticleFormPayload(data({status:'drafting'}),article({status:null})).status,'drafting');
});

test('JSON replacement preserves unknown members and an unchanged displayed time retains original seconds',()=>{
  const original=article({draft_ref:{pgc_id:'old',appmsgid:'keep-until-cleared',future:{list:[{value:0}],flag:false}},
    timings:{finished_at:'2026-10-24T01:30:42.123Z',steps:{draft:12},future:null}}),before=structuredClone(original);
  const body=buildArticleFormPayload(data({draft_pgc_id:'000123',finished_at:'2026-10-24T09:30'}),original);
  assert.equal(body.version,3);assert.equal(body.draft_ref.pgc_id,'000123');assert.equal(body.draft_ref.appmsgid,null);
  assert.deepEqual(body.draft_ref.future,original.draft_ref.future);assert.deepEqual(body.timings,original.timings);
  assert.deepEqual(original,before);body.draft_ref.future.list[0].value=7;assert.equal(original.draft_ref.future.list[0].value,0);
  assert.throws(()=>buildArticleFormPayload(data(),article({draft_ref:[]})),/JSON/);
});

test('published requires valid link and actual timestamp; unpublished publication leftovers require correction',()=>{
  const valid=data({status:'published',url:'https://example.invalid#section',published_at:'2026-10-24T09:30',
    started_at:'2026-10-24T09:00'}),body=buildArticleFormPayload(valid);
  assert.equal(body.url,'https://example.invalid/');assert.equal(body.published_at,'2026-10-24T01:30:00.000Z');
  for(const changes of [{url:''},{published_at:''},{url:'javascript:bad'},{url:'https://user:password@example.invalid'},
    {published_at:'2026-02-29T09:00'},{started_at:'2026-10-25T09:00'}]) {
    assert.throws(()=>buildArticleFormPayload({...valid,...changes}));
  }
  for(const status of ['drafting','illustrated','draft_saved','failed']) {
    assert.throws(()=>buildArticleFormPayload({...valid,status}),/明确清空/);
  }
  assert.throws(()=>buildArticleFormPayload(data({draft_editor_url:'https://example.invalid/a b'})),/草稿编辑链接/);
});

test('cache ID, version, modal ticket and session must match before any request',async()=>{
  for(const change of [b=>{b.form.dataset.id='other';},b=>{b.form.dataset.version='4';},
    b=>{b.cache.ticket--;},b=>{b.cache.sessionEpoch--;},b=>{b.form.isConnected=false;}]) {
    const bound=binding(article());change(bound);let writes=0;
    assert.equal(articleFormCurrent(bound.form),false);assert.throws(()=>articleFormRecord(bound.form),/失效/);
    await assert.rejects(saveArticleForm({...bound,data:data()},{request:async()=>{writes++;}}),/失效/);
    assert.equal(writes,0);
  }
});

test('save uses POST or versioned PUT with an idempotency key and accepts normalized server fields',async()=>{
  for(const record of [{status:'draft_saved'},article()]) {
    const bound=binding(record),writes=[];
    const result=await saveArticleForm({...bound,data:data()},{uuid:()=> 'synthetic-key',request:async(path,options)=>{
      writes.push({path,...options});return saved(options.body,record.id||'synthetic-created');
    }});
    assert.equal(writes.length,1);assert.equal(writes[0].method,record.id?'PUT':'POST');
    assert.equal(writes[0].headers['Idempotency-Key'],'synthetic-key');assert.equal(result.version,record.id?4:1);
    assert.equal(writes[0].body.version,record.id?3:undefined);assert.equal(bound.cache.saveAttempt.phase,'saved');
  }
});

test('version conflicts never overwrite or blindly retry; validation rejection permits explicit correction',async()=>{
  let bound=binding(article()),writes=0;
  const conflict=Object.assign(new Error('changed'),{status:409,code:'VERSION_CONFLICT'});
  const request=async()=>{writes++;throw conflict;};
  await assert.rejects(saveArticleForm({...bound,data:data()},{request}),error=>error===conflict);
  await assert.rejects(saveArticleForm({...bound,data:data()},{request}),/已有保存请求/);assert.equal(writes,1);
  bound=binding();
  await assert.rejects(saveArticleForm({...bound,data:data()},{request:async()=>{
    throw Object.assign(new Error('too long'),{status:400});
  }}),/too long/);
  assert.equal(bound.cache.saveAttempt,undefined);
  assert.equal((await saveArticleForm({...bound,data:data()},{request:async(path,options)=>saved(options.body)})).version,1);
});

test('unknown create or malformed success locks repeat submit without a second POST',async()=>{
  for(const respond of [()=>{throw new Error('lost response');},()=>({ok:true})]) {
    const bound=binding();let writes=0;
    const request=async()=>{writes++;return respond();};
    await assert.rejects(saveArticleForm({...bound,data:data()},{request}),/结果尚未确认/);
    await assert.rejects(saveArticleForm({...bound,data:data({title:'changed'})},{request}),/已有保存请求/);
    assert.equal(writes,1);assert.equal(bound.cache.saveAttempt.phase,'unknown');
  }
});

test('unknown PUT reads back once and only confirms matching version and full preserved payload',async()=>{
  for(const committed of [true,false]) {
    const bound=binding(article());let writes=0,reads=0,remote;
    const promise=saveArticleForm({...bound,data:data()},{request:async(path,options)=>{
      if(options){writes++;remote=saved(options.body,'synthetic-article');throw Error('lost response');}
      reads++;return committed?remote:{...remote,title:'concurrent update'};
    }});
    if(committed)assert.equal((await promise).version,4);
    else await assert.rejects(promise,/未能确认一致/);
    assert.equal(writes,1);assert.equal(reads,1);
  }
});

test('closing, switching modal or changing session during save suppresses all stale feedback and readback',async()=>{
  for(const change of [()=>{runtime.modalRequestVersion++;},()=>{runtime.sessionEpoch++;},
    bound=>{bound.form.isConnected=false;},()=>{binding();}]) {
    for(const rejected of [true,false]) {
      const bound=binding(article()),gate=deferred();let reads=0;
      const promise=saveArticleForm({...bound,data:data()},{request:async(path,options)=>{
        if(!options){reads++;throw Error('must not read');}
        await gate.promise;if(rejected)throw Error('lost response');return saved(options.body,'synthetic-article');
      }});
      change(bound);gate.resolve();assert.equal(await promise,null);assert.equal(reads,0);
    }
  }
});
