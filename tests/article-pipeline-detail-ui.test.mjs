import test from 'node:test';
import assert from 'node:assert/strict';
import {createArticleVerificationStore} from '../web/pages/article-verification.mjs';
import {renderArticleAnalytics,renderArticleDetailBody} from '../web/pages/detail.mjs';

const article=extra=>({id:'synthetic-detail',account_id:'synthetic-account',account_name:'合成账号',platform:'toutiao',
  title:'合成详情',status:'draft_saved',slot:'tt1',writer:'dedao',version:1,url:null,published_at:null,
  started_at:'2026-10-24T00:00:00.000Z',timings:{finished_at:'2026-10-24T00:30:00.000Z'},
  char_count:2236,subheading_count:5,image_count:25,draft_ref:{pgc_id:'7699934907375567402'},
  sample:null,blockers:null,warnings:[],verify_state:'pending',verify_items:[{description:'合成待核',done:false,future:{keep:'原值'}}],...extra});
const clone=value=>structuredClone(value);
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};

test('detail projects ledger metadata safely and drafts never display publication metrics or due nodes',()=>{
  const value=article({title:'<img src=x onerror=alert(1)>',account_name:'<b>合成</b>',char_count:null,
    sample:{caption:'<script>alert(1)</script>'},blockers:[{message:'<img src=x onerror=alert(1)>'}],
    draft_ref:{pgc_id:'0009007199254740993123456789',editor_url:'javascript:alert(1)'},
    verify_items:[{description:'<svg onload=alert(1)>',done:false},{description:'未知',done:'yes'}]});
  const html=renderArticleDetailBody(value);
  assert.match(html,/流水线开始/);assert.match(html,/流水线结束/);assert.match(html,/30 分钟/);
  assert.match(html,/未取得/);assert.match(html,/0009007199254740993123456789/);
  assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;svg/);
  assert.doesNotMatch(html,/<(?:script|svg|img)\b/);assert.doesNotMatch(html,/href="javascript:/);
  assert.match(html,/type="checkbox"[^>]*data-article-verify-index="0"/);
  assert.match(html,/<select[^>]*data-article-verify-index="1"/);
  assert.match(html,/<option value="" selected>未确认/);
  const metrics=renderArticleAnalytics(value);
  assert.match(metrics,/未发布/);assert.doesNotMatch(metrics,/未采集|snapshot-nodes|snapshot-timeline|>0</);
});

test('safe draft links allow HTTP(S) syntax only and slot-less topic stays unmarked',()=>{
  for(const value of ['javascript:alert(1)','data:text/html,bad','https://user:secret@example.invalid/edit','https://example.invalid/a b']) {
    const html=renderArticleDetailBody(article({slot:null,draft_ref:{editor_url:value}}));
    assert.doesNotMatch(html,/href=/);assert.match(html,/<dt>题材<\/dt><dd>未标注/);
  }
  const html=renderArticleDetailBody(article({draft_ref:{editor_url:'https://example.invalid/edit?draft=01'}}));
  assert.match(html,/href="https:\/\/example\.invalid\/edit\?draft=01"/);
  assert.match(html,/rel="noopener noreferrer"/);assert.match(html,/未验证远端权限/);
});

test('verification saves the complete cloned array with CAS and preserves unknown object fields',async()=>{
  let remote=article(),writes=0,received;
  const store=createArticleVerificationStore({article:remote,uuid:()=> 'synthetic-save-key',
    load:async()=>clone(remote),put:async(id,body,key)=>{
      writes++;received={id,body:clone(body),key};remote={...remote,version:2,verify_items:clone(body.verify_items)};return clone(remote);
    }});
  await store.save(0,true);
  assert.equal(writes,1);assert.equal(received.body.version,1);assert.equal(received.key,'synthetic-save-key');
  assert.deepEqual(received.body.verify_items,[{description:'合成待核',done:true,future:{keep:'原值'}}]);
  assert.equal(store.snapshot().phase,'saved');assert.equal(store.snapshot().article.version,2);
  await store.save(0,true);assert.equal(writes,1,'same explicit state is not another write');
});

test('unknown completion values require explicit boolean selection and concurrent changes are serialized',async()=>{
  const gate=deferred();let remote=article({verify_items:[{description:'未知',done:1,future:{x:7}}]}),writes=0;
  const store=createArticleVerificationStore({article:remote,load:async()=>clone(remote),uuid:()=> 'synthetic-key',
    put:async(id,body)=>{writes++;await gate.promise;remote={...remote,version:2,verify_items:body.verify_items};return clone(remote);}});
  await store.save(0,'false');assert.equal(writes,0);
  const pending=store.save(0,false);await store.save(0,true);assert.equal(writes,1);
  gate.resolve();await pending;
  assert.deepEqual(store.snapshot().article.verify_items,[{description:'未知',done:false,future:{x:7}}]);
});

test('CAS conflict reads the latest array without overwriting it or silently applying the old selection',async()=>{
  const latest=article({version:2,verify_items:[{description:'另一个设备的内容',done:false,future:'保留'}]});let writes=0;
  const store=createArticleVerificationStore({article:article(),load:async()=>clone(latest),
    put:async()=>{writes++;throw Object.assign(new Error('Conflict'),{status:409});}});
  await store.save(0,true);
  assert.equal(writes,1);assert.equal(store.snapshot().phase,'conflict');
  assert.deepEqual(store.snapshot().article.verify_items,latest.verify_items);
  assert.match(store.snapshot().message,/未保存.*最新版本/);
});

test('lost committed response is resolved by one read and never automatically resubmitted',async()=>{
  let remote=article(),writes=0,reads=0;
  const store=createArticleVerificationStore({article:remote,load:async()=>{reads++;return clone(remote);},
    put:async(id,body)=>{writes++;remote={...remote,version:2,verify_items:body.verify_items};throw Error('unknown delivery');}});
  await store.save(0,true);
  assert.equal(writes,1);assert.equal(reads,1);assert.equal(store.snapshot().phase,'saved');
  assert.match(store.snapshot().message,/已核对服务器/);await store.retry();assert.equal(writes,1);
});

test('uncommitted unknown result blocks new writes; explicit retry rereads and uses the original key and body',async()=>{
  let remote=article(),fail=true,reads=0;const writes=[];
  const store=createArticleVerificationStore({article:remote,uuid:()=> 'same-original-key',
    load:async()=>{reads++;return clone(remote);},put:async(id,body,key)=>{
      writes.push({body:clone(body),key});if(fail){fail=false;throw Error('unknown');}
      remote={...remote,version:2,verify_items:body.verify_items};return clone(remote);
    }});
  await store.save(0,true);assert.equal(store.snapshot().phase,'unknown');assert.equal(store.snapshot().retryReady,true);
  await store.save(0,false);assert.equal(writes.length,1);
  await store.retry();assert.equal(writes.length,2);assert.deepEqual(writes[1],writes[0]);
  assert.ok(reads>=3);assert.equal(store.snapshot().phase,'saved');
});

test('failed reconciliation never retries a write and later newer/null state becomes an explicit conflict',async()=>{
  let unavailable=true,writes=0;
  const store=createArticleVerificationStore({article:article(),
    load:async()=>{if(unavailable)throw Error('offline');return article({version:2,verify_items:null});},
    put:async()=>{writes++;throw Error('unknown');}});
  await store.save(0,true);await store.retry();assert.equal(writes,1);assert.equal(store.snapshot().retryReady,false);
  unavailable=false;await store.refresh();
  assert.equal(writes,1);assert.equal(store.snapshot().phase,'conflict');assert.equal(store.snapshot().article.verify_items,null);
});

test('known validation rejection is shown without pretending it committed or issuing a read/write retry',async()=>{
  let writes=0,reads=0;
  const store=createArticleVerificationStore({article:article(),load:async()=>{reads++;return article();},
    put:async()=>{writes++;throw Object.assign(new Error('公开操作较多，请稍后重试'),{status:429});}});
  await store.save(0,true);
  assert.equal(writes,1);assert.equal(reads,0);assert.equal(store.snapshot().phase,'error');
  assert.match(store.snapshot().message,/稍后重试/);assert.equal(store.snapshot().article.verify_items[0].done,false);
});
