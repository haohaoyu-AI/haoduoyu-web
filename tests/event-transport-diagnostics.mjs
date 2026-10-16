import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import ts from 'typescript';

const source=fs.readFileSync('lib/events.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const baseline=process.env.EVENT_TRANSPORT_BASELINE?ts.transpileModule(fs.readFileSync(process.env.EVENT_TRANSPORT_BASELINE,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText:null;
const owner='owner-fixture',articleId='397e2c24-2e37-4f9d-897f-c2c7a4c7fef1';
const created='2026-10-07T03:31:21.000Z';
const secret='whsec_'+Buffer.alloc(32,7).toString('base64');
const callback='https://receiver.example.org/callback?private=CALLBACK_PRIVATE_SENTINEL';
const sub={id:'sub_'+'a'.repeat(64),owner,callback,secret,active:'active',generation:'generation-fixture',expires:'2099-01-01T00:00:00.000Z'};

function fixture(sequence,{loggingFails=false,digestFails=false,connected=true,implementation=js}={}){
 const logs=[],requests=[],delays=[];let writes=0;
 const db={prepare:()=>({bind:(...values)=>({
  all:async()=>({results:connected&&values[0]===owner?[sub]:[]}),
  first:async()=>connected&&values[1]===owner?sub:null,
  run:async()=>{writes++;throw Error('Dispatch must not write subscriptions');}
 })})};
 const subtle={digest:(...args)=>digestFails?Promise.reject(Error('DIGEST_PRIVATE_SENTINEL')):crypto.subtle.digest(...args),importKey:(...args)=>crypto.subtle.importKey(...args),sign:(...args)=>crypto.subtle.sign(...args)};
 const ex={};vm.runInNewContext(implementation,{exports:ex,require:()=>({db:()=>db}),URL,TextEncoder,TextDecoder,crypto:{subtle},Uint8Array,btoa,atob,Response,AbortSignal,Date,Error,
  console:{info:raw=>{if(loggingFails)throw Error('LOGGER_PRIVATE_SENTINEL');logs.push(JSON.parse(raw));}},
  setTimeout:fn=>{delays.push(true);fn();},
  fetch:async(url,opts)=>{
   requests.push({url,opts});assert.equal(opts.redirect,'manual');assert.equal(opts.method,'POST');
   const h=opts.headers;assert.equal(h['webhook-signature'],'v1,'+createHmac('sha256',Buffer.alloc(32,7)).update(`${h['webhook-id']}.${h['webhook-timestamp']}.${opts.body}`).digest('base64'));
   const step=sequence[requests.length-1]??sequence.at(-1);
   if(step==='throw')throw new TypeError('NETWORK_PRIVATE_SENTINEL '+secret+' '+callback);
   return new Response('RESPONSE_PRIVATE_SENTINEL '+secret,{status:step});
  }});
 return {ex,logs,requests,delays,writes:()=>writes};
}

const expectedBody=JSON.stringify({eventId:'evt_'+articleId,name:'article.submitted',timestamp:created,data:{article_id:articleId},cursor:null});
const expectedHash=createHash('sha256').update(expectedBody).digest('hex');
for(const [statuses,expectedCalls,accepted] of [
 [[202],1,true],[[200],1,true],[[410],1,false],[[302],1,false],
 [[425,202],2,true],[[429,202],2,true],[[503,202],2,true],[[503,503,503],3,false],[['throw',202],2,true]
]){
 const f=fixture(statuses),result=await f.ex.dispatch(owner,articleId,created,'article.submitted');
 if(baseline){const original=fixture(statuses,{implementation:baseline}),oldResult=await original.ex.dispatch(owner,articleId,created,'article.submitted');const wire=record=>record.requests.map(({url,opts})=>({url,method:opts.method,redirect:opts.redirect,body:opts.body,header_keys:Object.keys(opts.headers).sort(),webhook_id:opts.headers['webhook-id'],subscription_id:opts.headers['X-MCP-Subscription-Id']}));assert.equal(result,oldResult);assert.deepEqual(wire(f),wire(original));assert.equal(f.delays.length,original.delays.length);assert.equal(f.writes(),original.writes());}
 assert.equal(f.requests.length,expectedCalls);assert.equal(result.startsWith('事件已送达'),accepted);assert.equal(f.writes(),0);
 assert.equal(f.delays.length,expectedCalls-1);
 for(const [index,request] of f.requests.entries()){
  assert.equal(request.opts.body,expectedBody);assert.equal(request.opts.headers['webhook-id'],'evt_'+articleId);assert.equal(request.opts.headers['X-MCP-Subscription-Id'],sub.id);
  const attemptLogs=f.logs.filter(log=>log.attempt===index+1);
  assert.equal(attemptLogs.length,3);assert.equal(attemptLogs[0].stage,'sign_begin');assert.equal(attemptLogs[1].stage,'fetch_begin');
  for(const log of attemptLogs){assert.equal(log.eventId,'evt_'+articleId);assert.equal(log.payload_sha256,expectedHash);assert.equal(log.payload_bytes,Buffer.byteLength(expectedBody));assert.equal(JSON.stringify(log.data_keys),'["article_id"]');assert.equal(log.event_name,'article.submitted');assert.equal(log.subscription_id,sub.id);}
  const outcome=attemptLogs[2];if(statuses[index]==='throw'){assert.equal(outcome.stage,'transport_failed');assert.equal(outcome.error_type,'TypeError');}else{assert.equal(outcome.stage,'callback_response');assert.equal(outcome.callback_status,statuses[index]);assert.equal(outcome.callback_accepted,statuses[index]>=200&&statuses[index]<300);assert.equal(outcome.delivery_semantics,'callback_acceptance_only');}
 }
 const serialized=JSON.stringify(f.logs);
 for(const privateValue of [secret,callback,owner,'NETWORK_PRIVATE_SENTINEL','RESPONSE_PRIVATE_SENTINEL','CALLBACK_PRIVATE_SENTINEL','webhook-signature'])assert.equal(serialized.includes(privateValue),false);
}
for(const options of [{loggingFails:true},{digestFails:true}]){
 const f=fixture([202],options);assert.equal((await f.ex.dispatch(owner,articleId,created,'article.submitted')).startsWith('事件已送达'),true);assert.equal(f.requests.length,1);assert.equal(f.requests[0].opts.body,expectedBody);assert.equal(f.writes(),0);
 if(options.digestFails)assert.equal(f.logs.every(log=>log.payload_sha256===null),true);
}
// The real manual button uses a fresh notification ID, rather than the article ID.
// Exercise that path through serialization, HMAC, retry and diagnostic correlation.
for(const notificationID of ['article_wake_00000000-0000-4000-8000-000000000001','article_wake_00000000-0000-4000-8000-000000000002']){
 const f=fixture([503,202]);
 assert.equal((await f.ex.dispatch(owner,articleId,created,'article.submitted',notificationID)).startsWith('事件已送达'),true);
 assert.equal(f.requests.length,2);assert.equal(f.writes(),0);
 const body=JSON.stringify({eventId:notificationID,name:'article.submitted',timestamp:created,data:{article_id:articleId},cursor:null});
 for(const request of f.requests){assert.equal(request.opts.body,body);assert.equal(request.opts.headers['webhook-id'],notificationID);}
 for(const log of f.logs){assert.equal(log.eventId,notificationID);assert.equal(log.payload_sha256,createHash('sha256').update(body).digest('hex'));assert.equal(JSON.stringify(log.data_keys),'["article_id"]');}
 assert.equal(f.logs.at(-1).delivery_semantics,'callback_acceptance_only');
 for(const privateValue of [secret,callback,owner,articleId])assert.equal(JSON.stringify(f.logs).includes(privateValue),false);
}
for(const [name,method,id,prefix,key] of [['topic.research_requested','dispatchTopicResearch','topic-fixture','topic_evt_','research_id'],['editorial.requested','dispatchEditorialRequest','editorial-fixture','editorial_evt_','request_id']]){
 const f=fixture([202]);assert.equal(await f.ex[method](owner,id,created),true);assert.equal(f.requests.length,1);const actual=JSON.parse(f.requests[0].opts.body);assert.equal(actual.name,name);assert.equal(actual.eventId,prefix+id);assert.equal(JSON.stringify(actual.data),JSON.stringify({[key]:id}));assert.equal(f.logs.at(-1).callback_accepted,true);assert.equal(f.writes(),0);
}
const disconnected=fixture([202],{connected:false});assert.equal(await disconnected.ex.dispatch(owner,articleId,created,'article.submitted'),'仅保存，尚未建立订阅');assert.equal(disconnected.requests.length,0);assert.equal(disconnected.logs.length,0);
const otherOwner=fixture([202]);assert.equal(await otherOwner.ex.dispatch('other-owner',articleId,created,'article.submitted'),'仅保存，尚未建立订阅');assert.equal(otherOwner.requests.length,0);
console.log('PASS event correlation, exact body/HMAC, 2xx acceptance-only semantics, existing retry policy, redirect/410 rejection, network redaction, diagnostic fault isolation, independent topic/editorial paths and owner isolation; live sends/provider calls/subscription writes=0');
if(baseline)console.log('PASS baseline/candidate differential across nine callback outcomes: identical payload bytes, destination, signed header contract, request count, retry count and return state');
